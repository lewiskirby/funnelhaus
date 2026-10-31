// Reads a client's daily Meta ad spend per ad, converted to US dollars. Server-only: the token
// never reaches the browser, and only campaign and ad names with a total per day leave the server.
//
// META_CLIENTS (env) maps a Notion client id to its ad account:
//   {"<notion client id>": {"adAccountId": "407837286889537", "campaigns": ["[Webinar] Purchase Campaign"]}}
// The token is META_ACCESS_TOKEN (a Business Manager system user token with ads_read on every
// listed account); an account can carry its own "token" instead.
// Only campaigns whose name exactly matches one in `campaigns` count (ad accounts can be shared
// between clients). The names are the same ones Trakyo shows as the source of ad clicks, and ad
// names match Trakyo's, so spend lines up with the registrants' Ad filter.

import "server-only";
import type { SpendRow } from "@/lib/types";

type Account = { adAccountId: string; token?: string; campaigns: string[] };

const GRAPH = "https://graph.facebook.com/v24.0";
const FX = "https://api.frankfurter.dev/v1";
const CACHE_MS = 15 * 60_000;
const normalise = (id: string) => id.replace(/-/g, "").toLowerCase();
const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

function accounts(): Record<string, Account> {
  try {
    const parsed = JSON.parse(process.env.META_CLIENTS ?? "{}") as Record<string, Account>;
    return Object.fromEntries(Object.entries(parsed).map(([id, a]) => [normalise(id), a]));
  } catch {
    console.error("META_CLIENTS is not valid JSON");
    return {};
  }
}

type Row = { day: string; campaign: string; ad: string; spend: number; currency: string };

async function fetchRows(account: Account, token: string): Promise<Row[]> {
  const url = new URL(`${GRAPH}/act_${account.adAccountId.replace(/^act_/, "")}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set("fields", "campaign_name,ad_name,spend,account_currency");
  url.searchParams.set("date_preset", "maximum");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", token);

  const wanted = new Set((account.campaigns ?? []).map(nameKey));
  const rows: Row[] = [];
  for (let next: string | undefined = url.toString(); next; ) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      // Log details server-side; the page shows a friendly message.
      console.error(`Meta insights failed: ${res.status} ${data?.error?.message ?? JSON.stringify(data)}`);
      throw new Error("Meta request failed");
    }
    for (const r of data.data ?? []) {
      const spend = Number(r.spend ?? 0);
      if (!spend || !wanted.has(nameKey(r.campaign_name ?? ""))) continue;
      rows.push({ day: r.date_start, campaign: r.campaign_name, ad: r.ad_name, spend, currency: r.account_currency });
    }
    next = data.paging?.next;
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}

/** ECB rates to USD per working day, from a week before `since` so the first days have a rate to fall back on. */
async function usdRates(currency: string, since: string, until: string): Promise<[string, number][]> {
  const start = new Date(Date.parse(`${since}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const res = await fetch(`${FX}/${start}..${until}?from=${currency}&to=USD`, { next: { revalidate: 3600 } });
  if (!res.ok) {
    console.error(`Exchange rates failed: ${res.status} ${await res.text()}`);
    throw new Error("Exchange rates failed");
  }
  const { rates } = (await res.json()) as { rates: Record<string, { USD: number }> };
  return Object.entries(rates)
    .map(([day, r]): [string, number] => [day, r.USD])
    .sort(([a], [b]) => a.localeCompare(b));
}

/** Spend per ad per ad-account day in USD. Weekends and holidays use the last working day's rate. */
async function fetchSpend(account: Account): Promise<SpendRow[]> {
  const token = account.token ?? process.env.META_ACCESS_TOKEN;
  if (!token) {
    console.error("No Meta token: set META_ACCESS_TOKEN");
    throw new Error("Meta not connected");
  }
  const rows = await fetchRows(account, token);
  if (!rows.length) return [];
  const currency = rows[0].currency;
  const rates = currency === "USD" ? [] : await usdRates(currency, rows[0].day, rows[rows.length - 1].day);
  const rateOn = (day: string) => {
    if (currency === "USD") return 1;
    let rate: number | undefined;
    for (const [d, r] of rates) if (d <= day) rate = r;
    if (rate === undefined) throw new Error(`No exchange rate on or before ${day}`);
    return rate;
  };
  return rows.map((r) => ({ day: r.day, campaign: r.campaign, ad: r.ad, usd: Math.round(r.spend * rateOn(r.day) * 100) / 100 }));
}

const cache = new Map<string, { at: number; result: Promise<SpendRow[]> }>();

/** This client's Meta spend in USD per day and ad, or null if no ad account is connected. Cached for 15 minutes. */
export async function getAdSpend(clientId: string): Promise<SpendRow[] | null> {
  const key = normalise(clientId);
  const account = accounts()[key];
  if (!account) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const result = fetchSpend(account);
  cache.set(key, { at: Date.now(), result });
  result.catch(() => cache.delete(key)); // don't keep failures
  return result;
}

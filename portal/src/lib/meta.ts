// Reads a client's daily Meta ad spend per ad, in the client's currency, with impressions, link clicks and
// landing page views (counts only: conversions come from the portal's own registrants, not Meta). Server-only: the token
// never reaches the browser, and only campaign and ad names with totals per day leave the server.
//
// META_CLIENTS (env) maps a Notion client id to its ad account:
//   {"<notion client id>": {"adAccountId": "407837286889537", "campaigns": ["[Webinar] Purchase Campaign"], "currency": "USD"}}
// Spend is shown in the ad account's own currency unless "currency" names another one to convert to.
// The token is META_ACCESS_TOKEN (a Business Manager system user token with ads_read on every
// listed account); an account can carry its own "token" instead.
// Only campaigns whose name exactly matches one in `campaigns` count (ad accounts can be shared
// between clients). The names are the same ones Trakyo shows as the source of ad clicks, and ad
// names match Trakyo's, so spend lines up with the registrants' Ad filter.

import "server-only";
import type { SpendRow } from "@/lib/types";

type Account = { adAccountId: string; token?: string; campaigns: string[]; currency?: string };

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

type Counts = { impressions: number; linkClicks: number; lpv: number };
type Row = Counts & { day: string; campaign: string; ad: string; spend: number; currency: string };
type Insight = {
  date_start: string;
  ad_name: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
  account_currency: string;
};

async function graph<T>(url: URL | string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) {
    // Log details server-side; the page shows a friendly message.
    console.error(`Meta request failed: ${res.status} ${data?.error?.message ?? JSON.stringify(data)}`);
    throw new Error("Meta request failed");
  }
  return data as T;
}

/** Every page of a Graph API list. */
async function graphList<T>(url: URL): Promise<T[]> {
  const items: T[] = [];
  for (let next: string | undefined = url.toString(); next; ) {
    const page: { data?: T[]; paging?: { next?: string } } = await graph(next);
    items.push(...(page.data ?? []));
    next = page.paging?.next;
  }
  return items;
}

const actPath = (account: Account) => `${GRAPH}/act_${account.adAccountId.replace(/^act_/, "")}`;

/** The ad account's own currency, e.g. "EUR". */
async function accountCurrency(account: Account, token: string): Promise<string> {
  const url = new URL(actPath(account));
  url.searchParams.set("fields", "currency");
  url.searchParams.set("access_token", token);
  return (await graph<{ currency: string }>(url)).currency;
}

async function fetchRows(account: Account, token: string): Promise<Row[]> {
  // Find the client's campaigns by exact name first, then ask only for their ads: daily spend
  // for every ad in a shared account since it opened is more than Meta will answer in one go.
  const list = new URL(`${actPath(account)}/campaigns`);
  list.searchParams.set("fields", "id,name");
  list.searchParams.set("limit", "500");
  list.searchParams.set("access_token", token);
  const wanted = new Set((account.campaigns ?? []).map(nameKey));
  const campaigns = (await graphList<{ id: string; name: string }>(list)).filter((c) => wanted.has(nameKey(c.name)));

  const rows: Row[] = [];
  for (const campaign of campaigns) {
    const url = new URL(`${GRAPH}/${campaign.id}/insights`);
    url.searchParams.set("level", "ad");
    url.searchParams.set("fields", "ad_name,spend,impressions,inline_link_clicks,actions,account_currency");
    url.searchParams.set("date_preset", "maximum");
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("limit", "500");
    url.searchParams.set("access_token", token);
    for (const r of await graphList<Insight>(url)) {
      const spend = Number(r.spend ?? 0);
      const impressions = Number(r.impressions ?? 0);
      const linkClicks = Number(r.inline_link_clicks ?? 0);
      const lpv = Number(r.actions?.find((a) => a.action_type === "landing_page_view")?.value ?? 0);
      if (spend || impressions || linkClicks || lpv)
        rows.push({ day: r.date_start, campaign: campaign.name, ad: r.ad_name, spend, impressions, linkClicks, lpv, currency: r.account_currency });
    }
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}

/** ECB rates from one currency to another per working day, from a week before `since` so the first days have a rate to fall back on. */
async function fxRates(from: string, to: string, since: string, until: string): Promise<[string, number][]> {
  const start = new Date(Date.parse(`${since}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const res = await fetch(`${FX}/${start}..${until}?from=${from}&to=${to}`, { next: { revalidate: 3600 } });
  if (!res.ok) {
    console.error(`Exchange rates failed: ${res.status} ${await res.text()}`);
    throw new Error("Exchange rates failed");
  }
  const { rates } = (await res.json()) as { rates: Record<string, Record<string, number>> };
  return Object.entries(rates)
    .map(([day, r]): [string, number] => [day, r[to]])
    .sort(([a], [b]) => a.localeCompare(b));
}

export type Spend = { currency: string; rows: SpendRow[] };

/** Spend per ad per ad-account day in the client's currency. Weekends and holidays use the last working day's rate. */
async function fetchSpend(account: Account): Promise<Spend> {
  const token = account.token ?? process.env.META_ACCESS_TOKEN;
  if (!token) {
    console.error("No Meta token: set META_ACCESS_TOKEN");
    throw new Error("Meta not connected");
  }
  const [rows, own] = await Promise.all([fetchRows(account, token), account.currency ? undefined : accountCurrency(account, token)]);
  const target = (account.currency ?? own!).toUpperCase();
  if (!rows.length) return { currency: target, rows: [] };
  const currency = rows[0].currency;
  const rates = currency === target ? [] : await fxRates(currency, target, rows[0].day, rows[rows.length - 1].day);
  const rateOn = (day: string) => {
    if (currency === target) return 1;
    let rate: number | undefined;
    for (const [d, r] of rates) if (d <= day) rate = r;
    if (rate === undefined) throw new Error(`No exchange rate on or before ${day}`);
    return rate;
  };
  const converted = rows.map((r) => ({
    day: r.day,
    campaign: r.campaign,
    ad: r.ad,
    amount: Math.round(r.spend * rateOn(r.day) * 100) / 100,
    impressions: r.impressions,
    linkClicks: r.linkClicks,
    lpv: r.lpv,
  }));
  return { currency: target, rows: converted };
}

const cache = new Map<string, { at: number; result: Promise<Spend> }>();

/** This client's Meta spend per day and ad in their currency, or null if no ad account is connected. Cached for 15 minutes. */
export async function getAdSpend(clientId: string): Promise<Spend | null> {
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

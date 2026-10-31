// Reads a client's daily Meta ad spend, converted to US dollars. Server-only: the token
// never reaches the browser, and only a total per day leaves the server.
//
// META_CLIENTS (env) maps a Notion client id to its ad account:
//   {"<notion client id>": {"adAccountId": "407837286889537", "token": "EAA...", "campaignFilter": "Webinar"}}
// The token needs ads_read on that account (a Business Manager system user token).
// campaignFilter is optional: only campaigns whose name contains it count.

import "server-only";

type Account = { adAccountId: string; token: string; campaignFilter?: string };

const GRAPH = "https://graph.facebook.com/v24.0";
const FX = "https://api.frankfurter.dev/v1";
const CACHE_MS = 15 * 60_000;
const normalise = (id: string) => id.replace(/-/g, "").toLowerCase();

function accounts(): Record<string, Account> {
  try {
    const parsed = JSON.parse(process.env.META_CLIENTS ?? "{}") as Record<string, Account>;
    return Object.fromEntries(Object.entries(parsed).map(([id, a]) => [normalise(id), a]));
  } catch {
    console.error("META_CLIENTS is not valid JSON");
    return {};
  }
}

/** Whether this client has an ad account connected (spend tiles show only for them). */
export const hasAdAccount = (clientId: string) => !!accounts()[normalise(clientId)]?.token;

type Day = { day: string; spend: number; currency: string };

async function fetchDays(account: Account): Promise<Day[]> {
  const url = new URL(`${GRAPH}/act_${account.adAccountId.replace(/^act_/, "")}/insights`);
  url.searchParams.set("level", "account");
  url.searchParams.set("fields", "spend,account_currency");
  url.searchParams.set("date_preset", "maximum");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("limit", "500");
  if (account.campaignFilter) {
    url.searchParams.set("filtering", JSON.stringify([{ field: "campaign.name", operator: "CONTAIN", value: account.campaignFilter }]));
  }
  url.searchParams.set("access_token", account.token);

  const days: Day[] = [];
  for (let next: string | undefined = url.toString(); next; ) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      // Log details server-side; the page shows a friendly message.
      console.error(`Meta insights failed: ${res.status} ${data?.error?.message ?? JSON.stringify(data)}`);
      throw new Error("Meta request failed");
    }
    for (const r of data.data ?? []) days.push({ day: r.date_start, spend: Number(r.spend ?? 0), currency: r.account_currency });
    next = data.paging?.next;
  }
  return days;
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

/** Spend per ad-account day in USD. Weekends and holidays use the last working day's rate. */
async function fetchSpend(account: Account): Promise<Record<string, number>> {
  const days = (await fetchDays(account)).filter((d) => d.spend > 0).sort((a, b) => a.day.localeCompare(b.day));
  if (!days.length) return {};
  const currency = days[0].currency;
  if (currency === "USD") return Object.fromEntries(days.map((d) => [d.day, d.spend]));

  const rates = await usdRates(currency, days[0].day, days[days.length - 1].day);
  const rateOn = (day: string) => {
    let rate: number | undefined;
    for (const [d, r] of rates) if (d <= day) rate = r;
    if (rate === undefined) throw new Error(`No exchange rate on or before ${day}`);
    return rate;
  };
  return Object.fromEntries(days.map((d) => [d.day, Math.round(d.spend * rateOn(d.day) * 100) / 100]));
}

const cache = new Map<string, { at: number; result: Promise<Record<string, number>> }>();

/** This client's Meta spend in USD keyed by day (YYYY-MM-DD), or null if no ad account is connected. Cached for 15 minutes. */
export async function getDailySpend(clientId: string): Promise<Record<string, number> | null> {
  const key = normalise(clientId);
  const account = accounts()[key];
  if (!account?.token) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const result = fetchSpend(account);
  cache.set(key, { at: Date.now(), result });
  result.catch(() => cache.delete(key)); // don't keep failures
  return result;
}

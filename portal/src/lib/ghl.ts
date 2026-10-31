// Reads webinar registrants from a client's GoHighLevel sub-account. Server-only:
// tokens never reach the browser, and only dates, webinar names and sources leave
// the server (never names, emails or phone numbers).
//
// GHL_CLIENTS (env) maps a Notion client id to its GHL sub-account:
//   {"<notion client id>": {"locationId": "...", "token": "pit-...", "appUrl": "https://app.gohighlevel.com"}}
// The token is a Private Integration token with contacts.readonly and
// locations/customFields.readonly.

import "server-only";
import type { Registrant } from "@/lib/types";

type Account = { locationId: string; token: string; appUrl?: string; registrantTag?: string };

const API = "https://services.leadconnectorhq.com";
const CACHE_MS = 5 * 60_000;
const PAGE = 100;
const MAX_PAGES = 100; // 10,000 registrants
const normalise = (id: string) => id.replace(/-/g, "").toLowerCase();

function accounts(): Record<string, Account> {
  try {
    const parsed = JSON.parse(process.env.GHL_CLIENTS ?? "{}") as Record<string, Account>;
    return Object.fromEntries(Object.entries(parsed).map(([id, a]) => [normalise(id), a]));
  } catch {
    console.error("GHL_CLIENTS is not valid JSON");
    return {};
  }
}

const accountFor = (clientId: string): Account | undefined => accounts()[normalise(clientId)];

/** Where to open this client's contacts in GoHighLevel, or null if they aren't connected. */
export function ghlContactsUrl(clientId: string): string | null {
  const account = accountFor(clientId);
  if (!account?.locationId || !account.token) return null;
  const app = (account.appUrl ?? "https://app.gohighlevel.com").replace(/\/+$/, "");
  return `${app}/v2/location/${account.locationId}/contacts/smart_list/All`;
}

async function ghl<T>(account: Account, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${account.token}`,
      Version: "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    // Log details server-side; the page shows a friendly message.
    console.error(`GHL ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
    throw new Error("GHL request failed");
  }
  return res.json() as Promise<T>;
}

type Attribution = { utmSource?: string; utmMedium?: string; utmCampaign?: string; campaign?: string; utmContent?: string } | null;
type Contact = {
  dateAdded: string;
  tags?: string[];
  customFields?: { id: string; value?: unknown }[];
  attributionSource?: Attribution;
  lastAttributionSource?: Attribution;
  searchAfter?: unknown[];
};

type FieldKey =
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "utm_content"
  | "trakyo_source"
  | "trakyo_content"
  | "trakyo_last_touch"
  | "vip_ticket_purchased";
const FIELD_KEYS: FieldKey[] = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "trakyo_source",
  "trakyo_content",
  "trakyo_last_touch",
  "vip_ticket_purchased",
];

/** The ids of the UTM, Trakyo and VIP custom fields, by their field key (contact.utm_source and so on). */
async function fieldIds(account: Account): Promise<Partial<Record<FieldKey, string>>> {
  const { customFields } = await ghl<{ customFields: { id: string; fieldKey?: string }[] }>(
    account,
    `/locations/${account.locationId}/customFields`,
  );
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, customFields.find((f) => f.fieldKey === `contact.${k}`)?.id]));
}

// Per-webinar tags look like "14-october-2026-webinar" or "1nov2026-registered" (not "14oct2026-attended").
const WEBINAR_TAGS = [/^(\d{1,2})-([a-z]+)-(\d{4})-webinar$/, /^(\d{1,2})([a-z]+)(\d{4})-registered$/];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "14-october-2026-webinar" or "14oct2026-registered" → { key: "2026-10-14", label: "14 October 2026" }. */
function webinarOf(tag: string): { key: string; label: string } | null {
  const name = tag.trim().toLowerCase();
  const m = WEBINAR_TAGS.map((re) => re.exec(name)).find(Boolean);
  if (!m) return null;
  const month = MONTHS.findIndex((mo) => m[2].length >= 3 && mo.startsWith(m[2]));
  const day = Number(m[1]);
  const date = new Date(Date.UTC(Number(m[3]), month, day, 12));
  if (month < 0 || date.getUTCDate() !== day) return null;
  return { key: date.toISOString().slice(0, 10), label: `${day} ${capital(MONTHS[month])} ${m[3]}` };
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

// UTM sources are short codes ("ig"); Trakyo names the platform ("Instagram"). Both end up as the latter.
const SOURCE_NAMES: Record<string, string> = {
  ig: "Instagram",
  instagram: "Instagram",
  fb: "Facebook",
  facebook: "Facebook",
  yt: "YouTube",
  youtube: "YouTube",
  skool: "Skool",
  email: "Email",
  whatsapp: "WhatsApp",
  discord: "Discord",
  tiktok: "TikTok",
  referrer: "Referrer",
};
const sourceName = (s?: string) => (s ? (SOURCE_NAMES[s.toLowerCase()] ?? s) : undefined);
const PLATFORMS = new Set(Object.values(SOURCE_NAMES).map((n) => n.toLowerCase()));
const PAID = /^(paid|cpc|ppc|ads?|paid_?social)$/i;
const mostCommon = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

// Trakyo touches read "Instagram · IG BIO → Register · 30 Oct 2026, 21:26 UTC"; the time is dropped.
const touch = (s?: string) => s?.replace(/\s*·\s*\d{1,2} \w+ \d{4}, \d{1,2}:\d{2} UTC$/, "");

export type Webinar = { key: string; label: string };

/** Every webinar with a tag in GHL, even before anyone has registered for it. */
async function fetchWebinarTags(account: Account): Promise<Webinar[]> {
  const { tags } = await ghl<{ tags: { name: string }[] }>(account, `/locations/${account.locationId}/tags`);
  return (tags ?? []).map((t) => webinarOf(t.name)).filter((w): w is Webinar => w !== null);
}

async function fetchRegistrants(account: Account): Promise<{ registrants: Registrant[]; tracksVip: boolean }> {
  const ids = await fieldIds(account);
  const contacts: Contact[] = [];
  let searchAfter: unknown[] | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await ghl<{ contacts: Contact[] }>(account, "/contacts/search", {
      method: "POST",
      body: {
        locationId: account.locationId,
        pageLimit: PAGE,
        filters: [{ field: "tags", operator: "contains", value: account.registrantTag ?? "webinar-registrant" }],
        sort: [{ field: "dateAdded", direction: "desc" }],
        ...(searchAfter ? { searchAfter } : {}),
      },
    });
    const batch = res.contacts ?? [];
    contacts.push(...batch);
    searchAfter = batch[batch.length - 1]?.searchAfter;
    if (batch.length < PAGE || !searchAfter) break;
  }

  // Trakyo (first touch) comes first, as UTMs were retired; UTMs, then GHL's own attribution, fill in for older contacts.
  const rows = contacts.map((c) => {
    const field = (key: FieldKey) => {
      const id = ids[key];
      return id ? text(c.customFields?.find((f) => f.id === id)?.value) : undefined;
    };
    const first = c.attributionSource ?? {};
    const last = c.lastAttributionSource ?? {};
    const utm = {
      source: field("utm_source") ?? text(first.utmSource) ?? text(last.utmSource),
      medium: field("utm_medium") ?? text(first.utmMedium) ?? text(last.utmMedium),
      campaign: field("utm_campaign") ?? text(first.utmCampaign ?? first.campaign) ?? text(last.utmCampaign ?? last.campaign),
      content: field("utm_content") ?? text(first.utmContent) ?? text(last.utmContent),
    };
    const trakyo = { source: field("trakyo_source"), content: field("trakyo_content"), last: touch(field("trakyo_last_touch")) };
    const webinars = new Map<string, Webinar>();
    for (const w of (c.tags ?? []).map(webinarOf)) if (w) webinars.set(w.key, w);
    return { c, utm, trakyo, webinars: [...webinars.values()] };
  });

  // Trakyo files ad clicks under the ad campaign ("[Webinar] Purchase Campaign") with the ad's name as content.
  // A Trakyo source is an ad campaign when it isn't a platform and most of its people have a paid UTM.
  const paidShare = new Map<string, { paid: number; tagged: number }>();
  for (const { utm, trakyo } of rows) {
    if (!trakyo.source || !utm.medium) continue;
    const s = paidShare.get(trakyo.source) ?? { paid: 0, tagged: 0 };
    s.tagged++;
    if (PAID.test(utm.medium)) s.paid++;
    paidShare.set(trakyo.source, s);
  }
  const isAdCampaign = (source?: string) => {
    const s = source ? paidShare.get(source) : undefined;
    return !!s && !PLATFORMS.has(source!.toLowerCase()) && s.paid * 2 > s.tagged;
  };
  // Paid UTMs only carry the Meta ad id; name it after what Trakyo called that ad for other people.
  const namesById = new Map<string, string[]>();
  for (const { utm, trakyo } of rows) {
    if (!utm.content || !trakyo.content || !isAdCampaign(trakyo.source)) continue;
    namesById.set(utm.content, [...(namesById.get(utm.content) ?? []), trakyo.content]);
  }
  const adOf = ({ utm, trakyo }: (typeof rows)[number]) => {
    if (isAdCampaign(trakyo.source)) return trakyo.content ?? "Unnamed ad";
    if (!utm.medium || !PAID.test(utm.medium)) return undefined;
    const name = utm.content ? mostCommon(namesById.get(utm.content) ?? []) : undefined;
    return name ?? (utm.content ? `Ad ${utm.content}` : "Unnamed ad");
  };

  // "VIP Ticket Purchased" is set to Yes when someone buys the VIP upgrade; clients without the field have no VIP numbers.
  const vipField = ids.vip_ticket_purchased;
  const registrants = rows.map((row) => {
    const { c, utm, trakyo, webinars } = row;
    return {
      addedAt: c.dateAdded,
      webinars,
      source: sourceName(trakyo.source ?? utm.source),
      ad: adOf(row),
      content: trakyo.content ?? (trakyo.source ? undefined : (utm.content ?? utm.campaign)),
      lastTouch: trakyo.last,
      tracking: trakyo.source ? "Trakyo" : utm.source ? "UTM" : "Not tracked",
      vip: vipField ? c.customFields?.find((f) => f.id === vipField)?.value === "Yes" : undefined,
    } satisfies Registrant;
  });
  return { registrants, tracksVip: !!vipField };
}

type Fetched = { registrants: Registrant[]; tracksVip: boolean; webinars: Webinar[]; fetchedAt: number };
const cache = new Map<string, { at: number; result: Promise<Fetched> }>();

/**
 * This client's webinar registrants (newest first) and every webinar tagged in GHL,
 * or null if they aren't connected to GHL. Cached for 5 minutes.
 */
export async function getWebinarRegistrants(clientId: string): Promise<Fetched | null> {
  const account = accountFor(clientId);
  if (!account?.locationId || !account.token) return null;
  const key = normalise(clientId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const at = Date.now();
  const result = Promise.all([fetchRegistrants(account), fetchWebinarTags(account).catch(() => [])]).then(([{ registrants, tracksVip }, webinars]) => ({
    registrants,
    tracksVip,
    webinars,
    fetchedAt: at,
  }));
  cache.set(key, { at, result });
  result.catch(() => cache.delete(key)); // don't keep failures
  return result;
}

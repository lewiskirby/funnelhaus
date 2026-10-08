// Reads webinar registrants from a client's GoHighLevel sub-account. Server-only:
// tokens never reach the browser, and only dates, webinar names and UTMs leave
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

type UtmKey = "source" | "medium" | "campaign" | "content";

/** The ids of the UTM custom fields, by their field key (contact.utm_source and so on). */
async function utmFieldIds(account: Account): Promise<Record<UtmKey, string | undefined>> {
  const { customFields } = await ghl<{ customFields: { id: string; fieldKey?: string }[] }>(
    account,
    `/locations/${account.locationId}/customFields`,
  );
  const find = (key: string) => customFields.find((f) => f.fieldKey === `contact.utm_${key}`)?.id;
  return { source: find("source"), medium: find("medium"), campaign: find("campaign"), content: find("content") };
}

// Per-webinar tags look like "14-october-2026-webinar".
const WEBINAR_TAG = /^(\d{1,2})-([a-z]+)-(\d{4})-webinar$/;
const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "14-october-2026-webinar" → { key: "2026-10-14", label: "14 October 2026" }. */
function webinarOf(tag: string): { key: string; label: string } | null {
  const m = WEBINAR_TAG.exec(tag.trim().toLowerCase());
  if (!m) return null;
  const date = new Date(`${m[1]} ${m[2]} ${m[3]} 12:00 UTC`);
  if (Number.isNaN(date.getTime())) return null;
  return { key: date.toISOString().slice(0, 10), label: `${Number(m[1])} ${capital(m[2])} ${m[3]}` };
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export type Webinar = { key: string; label: string };

/** Every webinar with a tag in GHL, even before anyone has registered for it. */
async function fetchWebinarTags(account: Account): Promise<Webinar[]> {
  const { tags } = await ghl<{ tags: { name: string }[] }>(account, `/locations/${account.locationId}/tags`);
  return (tags ?? []).map((t) => webinarOf(t.name)).filter((w): w is Webinar => w !== null);
}

async function fetchRegistrants(account: Account): Promise<Registrant[]> {
  const ids = await utmFieldIds(account);
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

  return contacts.map((c) => {
    const field = (id?: string) => (id ? text(c.customFields?.find((f) => f.id === id)?.value) : undefined);
    // GHL's own first-touch attribution fills in when the UTM fields are empty.
    const first = c.attributionSource ?? {};
    const last = c.lastAttributionSource ?? {};
    const webinars = (c.tags ?? []).map(webinarOf).filter((w): w is { key: string; label: string } => w !== null);
    return {
      addedAt: c.dateAdded,
      webinars,
      source: field(ids.source) ?? text(first.utmSource) ?? text(last.utmSource),
      medium: field(ids.medium) ?? text(first.utmMedium) ?? text(last.utmMedium),
      campaign: field(ids.campaign) ?? text(first.utmCampaign ?? first.campaign) ?? text(last.utmCampaign ?? last.campaign),
      content: field(ids.content) ?? text(first.utmContent) ?? text(last.utmContent),
    };
  });
}

type Fetched = { registrants: Registrant[]; webinars: Webinar[]; fetchedAt: number };
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
  const result = Promise.all([fetchRegistrants(account), fetchWebinarTags(account).catch(() => [])]).then(([registrants, webinars]) => ({
    registrants,
    webinars,
    fetchedAt: at,
  }));
  cache.set(key, { at, result });
  result.catch(() => cache.delete(key)); // don't keep failures
  return result;
}

"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import type { Registrant, SpendRow } from "@/lib/types";

// Rendered in Berlin time on the server, then in the viewer's own time zone.
const DEFAULT_TZ = "Europe/Berlin";
const noopSubscribe = () => () => {};

// Trakyo and UTMs blended (see ghl.ts): Trakyo where it tracked someone, UTMs where it didn't.
type Dimension = "source" | "ad" | "content" | "lastTouch" | "tracking";
const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "source", label: "Source" },
  { key: "ad", label: "Ad" },
  { key: "content", label: "Content" },
  { key: "lastTouch", label: "Last touch" },
  { key: "tracking", label: "Tracked by" },
];
const RANGES = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
] as const;
type Range = (typeof RANGES)[number]["key"];

const NOT_SET = "(not set)";
const NOT_AN_AD = "Not from an ad";
const isEmpty = (label: string) => label === NOT_SET || label === NOT_AN_AD;
// Categorical slots in fixed order (validated for colour-blind separation on white).
// A value keeps its colour however the filters change; past eight, values fold into "Other".
const SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const MUTED = "#a3a39e";
const OTHER = "Other";

// The current minute: refreshed every 30 seconds in the browser, the server's fetch time before that.
const MINUTE = 60_000;
const subscribeMinute = (tick: () => void) => {
  const id = setInterval(tick, 30_000);
  return () => clearInterval(id);
};
const currentMinute = () => Math.floor(Date.now() / MINUTE);

const dayIn = (iso: string, zone: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: zone });
const valueOf = (r: Registrant, d: Dimension) => r[d] ?? (d === "ad" ? NOT_AN_AD : NOT_SET);

type Filters = Record<Dimension, string>;
const NO_FILTERS: Filters = { source: "", ad: "", content: "", lastTouch: "", tracking: "" };

const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
/** "$1,234" or "€12.50": the symbol alone, and no cents from 1,000 up. */
const formatMoney = (n: number, currency: string) =>
  n.toLocaleString("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: n >= 1000 ? 0 : 2 });

export function RegistrantsDashboard({
  registrants,
  tracksVip,
  tracksCalls,
  spend,
  currency,
  webinars: known,
  ghlUrl,
  fetchedAt,
}: {
  registrants: Registrant[];
  tracksVip: boolean; // the client has a "VIP Ticket Purchased" field in GHL
  tracksCalls: boolean; // GHL's calendar is readable, or the client has call fields (Appointment Booked Date and so on)
  spend: SpendRow[] | "error" | null; // Meta spend per ad and day in `currency`; null if no ad account is connected
  currency: string; // e.g. "USD" or "EUR"
  webinars: { key: string; label: string }[]; // tagged in GHL or on the calendar, including upcoming ones
  ghlUrl: string;
  fetchedAt: number;
}) {
  const zone = useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => DEFAULT_TZ,
  );
  const minute = useSyncExternalStore(subscribeMinute, currentMinute, () => Math.floor(fetchedAt / MINUTE));
  const now = minute * MINUTE;
  // Open on the next webinar (today's included), or the latest one if none is coming up.
  const [defaultWebinar] = useState(() => {
    const keys = [...new Set([...known.map((w) => w.key), ...registrants.flatMap((r) => r.webinars.map((w) => w.key))])].sort();
    const day = dayIn(new Date(fetchedAt).toISOString(), DEFAULT_TZ);
    return keys.find((k) => k >= day) ?? keys[keys.length - 1] ?? "all";
  });
  const [webinar, setWebinar] = useState(defaultWebinar);
  const [range, setRange] = useState<Range>("all");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [dimension, setDimension] = useState<Dimension>("source");

  // Newest first, so upcoming webinars sit at the top of the list.
  const webinars = useMemo(() => {
    const byKey = new Map<string, string>(known.map((w) => [w.key, w.label]));
    for (const r of registrants) for (const w of r.webinars) byKey.set(w.key, w.label);
    return [...byKey].sort(([a], [b]) => b.localeCompare(a)).map(([key, label]) => ({ key, label }));
  }, [registrants, known]);

  const today = dayIn(new Date(now).toISOString(), zone);
  const daysAgo = (n: number) => dayIn(new Date(now - n * 86_400_000).toISOString(), zone);

  // Everyone matching the webinar and source filters, before the date range.
  const matching = registrants.filter(
    (r) =>
      (webinar === "all" || r.webinars.some((w) => w.key === webinar)) &&
      DIMENSIONS.every(({ key }) => !filters[key] || valueOf(r, key) === filters[key]),
  );
  const inRange = (r: Registrant) => {
    if (range === "all") return true;
    const day = dayIn(r.addedAt, zone);
    return range === "today" ? day === today : day > daysAgo(Number(range));
  };
  const shown = matching.filter(inRange);
  // A call counts when it was booked on or after the day of the webinar they registered for (any of
  // theirs under "All webinars"). Calls with no known day (only "Appointment Booked" = yes) always count.
  const bookedCall = (r: Registrant) =>
    r.callBooked && (!r.callBookedOn || r.webinars.some((w) => (webinar === "all" || w.key === webinar) && r.callBookedOn! >= w.key));
  // Costs only count people who came from an ad, since that's who the spend paid for.
  let vipPurchases = 0;
  let callsBooked = 0;
  let callsFromAds = 0;
  let fromAds = 0;
  let vipsFromAds = 0;
  // The same counts per value of the breakdown dimension, for the table's money columns.
  const byValue = new Map<string, Counts>();
  for (const r of matching) {
    if (!inRange(r)) continue;
    if (r.vip) vipPurchases++;
    if (r.ad) fromAds++;
    if (r.ad && r.vip) vipsFromAds++;
    const call = bookedCall(r);
    if (call) callsBooked++;
    if (call && r.ad) callsFromAds++;
    const c = byValue.get(valueOf(r, dimension)) ?? { ...NO_COUNTS };
    if (r.ad) c.fromAds++;
    if (r.vip) c.vips++;
    if (r.ad && r.vip) c.vipsFromAds++;
    if (call) c.calls++;
    if (call && r.ad) c.callsFromAds++;
    byValue.set(valueOf(r, dimension), c);
  }
  const newToday = matching.filter((r) => dayIn(r.addedAt, zone) === today).length;
  const last7 = matching.filter((r) => dayIn(r.addedAt, zone) > daysAgo(7)).length;

  // Options for each source filter come from the chosen webinar, so they never lead to nothing.
  const forWebinar = registrants.filter((r) => webinar === "all" || r.webinars.some((w) => w.key === webinar));
  // The Ad filter also offers ads that spent without bringing anyone in yet.
  const optionsFor = (d: Dimension) =>
    [...new Set([...forWebinar.map((r) => valueOf(r, d)), ...(d === "ad" && spend && spend !== "error" ? spend.map((r) => r.ad) : [])])].sort((a, b) =>
      a.localeCompare(b),
    );

  // Colours follow the value (ranked over everyone), not its position in the current view.
  const colours = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of registrants) if (r[dimension]) counts.set(r[dimension]!, (counts.get(r[dimension]!) ?? 0) + 1);
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
    const map = new Map<string, string>(ranked.slice(0, SLOTS.length - 1).map((v, i) => [v, SLOTS[i]]));
    return (value: string) => map.get(value) ?? MUTED;
  }, [registrants, dimension]);

  // Not memoised by hand: the React Compiler handles it, and a manual memo here blocks it.
  const slices = (() => {
    const counts = new Map<string, number>();
    for (const r of shown) counts.set(valueOf(r, dimension), (counts.get(valueOf(r, dimension)) ?? 0) + 1);
    const sorted = [...counts].map(([label, count]) => ({ label, count, colour: isEmpty(label) ? MUTED : colours(label) }));
    sorted.sort((a, b) => Number(isEmpty(a.label)) - Number(isEmpty(b.label)) || b.count - a.count || a.label.localeCompare(b.label));
    // Values without their own colour are folded into "Other" so no two slices share a colour.
    const own = sorted.filter((s) => s.colour !== MUTED || isEmpty(s.label));
    const rest = sorted.filter((s) => s.colour === MUTED && !isEmpty(s.label));
    if (rest.length) own.push({ label: OTHER, count: rest.reduce((n, s) => n + s.count, 0), colour: "#6f6f6b" });
    return own;
  })();


  // Spend over the same days and filters as the registrants. A webinar's spend is every day after the
  // webinar before it, up to its own day. An Ad (or Content) filter narrows spend to that ad, and a Source
  // filter to that campaign (a Source of Meta or Facebook keeps all of it); filters with no spend
  // behind them (Instagram, Last touch...) leave it blank.
  const after = webinars.reduce((prev, w) => (w.key < webinar && w.key > prev ? w.key : prev), "");
  const spendDay = (day: string) =>
    (webinar === "all" || (day > after && day <= webinar)) &&
    (range === "all" || (range === "today" ? day === today : day > daysAgo(Number(range))));
  const rows = spend && spend !== "error" ? spend : [];
  const ads = new Set(rows.map((r) => nameKey(r.ad)));
  const campaigns = new Set(rows.map((r) => nameKey(r.campaign)));
  const spendFilters: ((r: SpendRow) => boolean)[] = [];
  let unattributable = false;
  for (const { key } of DIMENSIONS) {
    const value = filters[key] ? nameKey(filters[key]) : "";
    if (!value) continue;
    if ((key === "ad" || key === "content") && ads.has(value)) spendFilters.push((r) => nameKey(r.ad) === value);
    else if ((key === "source" || key === "content") && campaigns.has(value)) spendFilters.push((r) => nameKey(r.campaign) === value);
    else if (key === "source" && (value === "meta" || value === "facebook")) continue;
    else unattributable = true;
  }
  const totals = spend && spend !== "error" && !unattributable ? sumMeta(rows, (r) => spendDay(r.day) && spendFilters.every((f) => f(r))) : null;
  const spent = totals?.amount ?? null;
  const adFilter = filters.ad || (filters.content && ads.has(nameKey(filters.content)) ? filters.content : "");
  const spendHint =
    spend === "error"
      ? "Couldn't load from Meta"
      : spent === null
        ? "No ad spend behind this filter"
        : adFilter
          ? `Spent on ${adFilter}`
          : webinar === "all"
            ? `Meta ads, in ${currency}`
            : "Meta ads since the last webinar";
  const fmt = (n: number) => formatMoney(n, currency);
  const costPer = (count: number) => (spent === null ? "—" : count ? fmt(spent / count) : "—");

  // Spend per breakdown row: the ad's (Ad or Content) or the campaign's (Source or Content), within the
  // same days and filters as the tiles. Rows with no spend behind them (Instagram...) show a dash.
  const metaFor = (label: string): MetaTotals | null => {
    if (!spend || spend === "error" || unattributable) return null;
    const key = nameKey(label);
    const match =
      (dimension === "ad" || dimension === "content") && ads.has(key)
        ? (r: SpendRow) => nameKey(r.ad) === key
        : (dimension === "source" || dimension === "content") && campaigns.has(key)
          ? (r: SpendRow) => nameKey(r.campaign) === key
          : null;
    if (!match) return null;
    return sumMeta(rows, (r) => match(r) && spendDay(r.day) && spendFilters.every((f) => f(r)));
  };
  const showSpend = !!spend && (dimension === "ad" || dimension === "source" || dimension === "content");
  // Ads that spent in this view but brought no registrants still get a row, after the rest.
  const listed = new Set(slices.map((sl) => nameKey(sl.label)));
  const spendOnly: Slice[] =
    dimension === "ad" || dimension === "content"
      ? [...new Map(rows.map((r) => [nameKey(r.ad), r.ad])).values()]
          .filter((ad) => !listed.has(nameKey(ad)) && (metaFor(ad)?.amount ?? 0) > 0)
          .sort((a, b) => (metaFor(b)?.amount ?? 0) - (metaFor(a)?.amount ?? 0))
          .map((ad) => ({ label: ad, count: 0, colour: MUTED }))
      : [];
  const tableSlices = [...slices, ...spendOnly];
  const money = Object.fromEntries(
    tableSlices.map((sl) => [sl.label, { meta: sl.label === OTHER ? null : metaFor(sl.label), ...(byValue.get(sl.label) ?? NO_COUNTS) }]),
  );
  const active = DIMENSIONS.filter(({ key }) => filters[key]);
  const setFilter = (d: Dimension, value: string) => setFilters((f) => ({ ...f, [d]: value }));
  const toggleSlice = (label: string) => {
    if (label === OTHER) return;
    setFilter(dimension, filters[dimension] === label ? "" : label);
  };
  const clearAll = () => {
    setFilters(NO_FILTERS);
    setRange("all");
    setWebinar(defaultWebinar);
  };

  const rangeLabel = RANGES.find((r) => r.key === range)!.label.toLowerCase();

  return (
    <div className="space-y-6">
      {/* Filters */}
      <section className="card p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Select label="Webinar" value={webinar} onChange={setWebinar}>
            <option value="all">All webinars</option>
            {webinars.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
                {w.key > today ? " (upcoming)" : w.key === today ? " (today)" : ""}
              </option>
            ))}
          </Select>
          <Select label="Date" value={range} onChange={(v) => setRange(v as Range)}>
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
          {DIMENSIONS.map(({ key, label }) => (
            <Select key={key} label={label} value={filters[key]} onChange={(v) => setFilter(key, v)}>
              <option value="">All</option>
              {optionsFor(key).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          ))}
        </div>
        {(active.length > 0 || range !== "all" || webinar !== defaultWebinar) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {active.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key, "")}
                className="flex cursor-pointer items-center gap-1.5 rounded-full bg-canvas px-3 py-1 text-[12.5px] font-medium text-ink ring-1 ring-line hover:ring-faint"
              >
                {label}: {filters[key]} <span aria-hidden="true" className="text-muted">×</span>
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
            <button type="button" onClick={clearAll} className="ml-auto cursor-pointer text-[13px] font-semibold text-brand hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </section>

      {/* Headline numbers */}
      {spend || tracksVip || tracksCalls ? (
        <>
          <section className="card divide-y divide-line px-5 sm:px-6">
            <MetricRow label="Webinar registrants" value={shown.length} hint={range === "all" ? "All time" : rangeLabel} />
            {spend && <MetricRow label="Ad spend" value={spent === null ? "—" : fmt(spent)} hint={spendHint} />}
            {spend && <MetricRow label="CPM" value={spent === null ? "—" : perThousand(totals!, currency)} hint="Ad spend per 1,000 impressions" />}
            {spend && <MetricRow label="Link CTR" value={totals ? ratio(totals.linkClicks, totals.impressions, 2) : "—"} hint="Link clicks ÷ impressions" />}
            {spend && <MetricRow label="Landing page views" value={totals ? totals.lpv : "—"} hint="From Meta" />}
            {spend && (
              <MetricRow
                label="Landing page conversion"
                value={totals ? ratio(fromAds, totals.lpv, 1) : "—"}
                hint={`${fromAds.toLocaleString("en-GB")} registrants from ads ÷ landing page views`}
              />
            )}
            {spend && <MetricRow label="Cost per registrant" value={costPer(fromAds)} hint={`Ad spend ÷ ${fromAds.toLocaleString("en-GB")} from ads`} />}
            {tracksVip && <MetricRow label="VIP purchases" value={vipPurchases} hint="Bought the VIP upgrade" />}
            {tracksVip && <MetricRow label="VIP uptake" value={uptake(vipPurchases, shown.length)} hint="VIP purchases ÷ registrants" />}
            {spend && tracksVip && (
              <MetricRow label="Cost per VIP purchase" value={costPer(vipsFromAds)} hint={`Ad spend ÷ ${vipsFromAds.toLocaleString("en-GB")} from ads`} />
            )}
            {tracksCalls && <MetricRow label="Calls booked" value={callsBooked} hint="Registrants who booked a call on or after the webinar day" />}
            {tracksCalls && <MetricRow label="Call booking rate" value={uptake(callsBooked, shown.length)} hint="Calls booked ÷ registrants" />}
            {spend && tracksCalls && (
              <MetricRow label="Cost per call booked" value={costPer(callsFromAds)} hint={`Ad spend ÷ ${callsFromAds.toLocaleString("en-GB")} from ads`} />
            )}
          </section>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Stat label="New registrants today" value={newToday} hint={`Since midnight, your time`} />
            <Stat label="Last 7 days" value={last7} hint="Including today" />
          </section>
        </>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Webinar registrants" value={shown.length} hint={range === "all" ? "All time" : rangeLabel} accent />
          <Stat label="New registrants today" value={newToday} hint={`Since midnight, your time`} />
          <Stat label="Last 7 days" value={last7} hint="Including today" />
        </section>
      )}

      {/* Breakdown */}
      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">Where registrants came from</h2>
          <div role="tablist" aria-label="Break down by" className="flex w-full flex-wrap gap-1 rounded-[20px] bg-canvas p-1 ring-1 ring-line sm:w-auto sm:rounded-full">
            {DIMENSIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={dimension === key}
                onClick={() => setDimension(key)}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${
                  dimension === key ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-line" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-2xl bg-canvas px-5 py-10 text-center text-[14px] text-muted ring-1 ring-line">
            No registrants match these filters yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[280px_1fr]">
            <Donut slices={slices} total={shown.length} selected={filters[dimension]} onSelect={toggleSlice} />
            <BreakdownTable
              slices={tableSlices}
              total={shown.length}
              selected={filters[dimension]}
              onSelect={toggleSlice}
              money={money}
              currency={currency}
              showSpend={showSpend}
              showVip={tracksVip}
              showCalls={tracksCalls}
            />
          </div>
        )}
        <p className="mt-5 text-[12.5px] text-muted">
          Tap a slice or row to filter by it. Sources come from Trakyo, or from UTMs where Trakyo has nothing. Registrants with neither show as {NOT_SET}. Ads are named as in Trakyo.
        </p>
      </section>

      <a
        href={ghlUrl}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13.5px] font-semibold text-ink ring-1 ring-line transition hover:ring-brand/30"
      >
        Open contacts in GoHighLevel <Icon.external className="size-4 text-faint" />
      </a>
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer truncate rounded-xl border border-line bg-white px-3 py-2 text-[13.5px] text-ink focus:border-brand/40 focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

/** One headline metric as a line: name and how it's worked out on the left, the number on the right. */
function MetricRow({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-[12.5px] text-faint">{hint}</p>
      </div>
      <p className="shrink-0 text-[26px] leading-none font-bold tracking-[-0.02em] text-ink tabular-nums">{value.toLocaleString("en-GB")}</p>
    </div>
  );
}

function Stat({ label, value, hint, accent = false }: { label: string; value: number | string; hint: string; accent?: boolean }) {
  return (
    <div className={`rounded-[20px] p-5 ${accent ? "bg-ink-2 text-white" : "card"}`}>
      <p className={`text-[12.5px] font-semibold ${accent ? "text-white/55" : "text-muted"}`}>{label}</p>
      <p className="mt-2 text-[38px] leading-none font-bold tracking-[-0.03em] tabular-nums">{value.toLocaleString("en-GB")}</p>
      <p className={`mt-2 text-[12.5px] ${accent ? "text-white/45" : "text-faint"}`}>{hint}</p>
    </div>
  );
}

type Slice = { label: string; count: number; colour: string };
type Counts = { fromAds: number; vips: number; vipsFromAds: number; calls: number; callsFromAds: number };
const NO_COUNTS: Counts = { fromAds: 0, vips: 0, vipsFromAds: 0, calls: 0, callsFromAds: 0 };
type Money = Counts & { meta: MetaTotals | null };
type MetaTotals = { amount: number; impressions: number; linkClicks: number; lpv: number };
const NO_META: MetaTotals = { amount: 0, impressions: 0, linkClicks: 0, lpv: 0 };
const sumMeta = (rows: SpendRow[], keep: (r: SpendRow) => boolean): MetaTotals =>
  rows.reduce(
    (t, r) =>
      keep(r) ? { amount: t.amount + r.amount, impressions: t.impressions + r.impressions, linkClicks: t.linkClicks + r.linkClicks, lpv: t.lpv + r.lpv } : t,
    NO_META,
  );
/** n ÷ d as a percentage, or a dash when there's nothing to divide by. */
const ratio = (n: number, d: number, digits: number) => (d ? `${((n / d) * 100).toFixed(digits)}%` : "—");
/** Spend per 1,000 impressions. */
const perThousand = (t: MetaTotals, currency: string) => (t.impressions ? formatMoney((t.amount / t.impressions) * 1000, currency) : "—");
const pct = (n: number, total: number) => `${Math.round((n / total) * 100)}%`;
/** VIP purchases (or calls booked) as a share of registrants, to one decimal place. */
const uptake = (vips: number, registrants: number) => (registrants ? `${((vips / registrants) * 100).toFixed(1)}%` : "—");

/** A donut of the breakdown, with a 2px white gap between slices and a tooltip on hover. */
function Donut({ slices, total, selected, onSelect }: { slices: Slice[]; total: number; selected: string; onSelect: (label: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const R = 100;
  const r = 62;
  // Each slice starts where the previous one ended, from 12 o'clock clockwise.
  const arcs = slices.map((s, i) => {
    const before = slices.slice(0, i).reduce((n, p) => n + p.count, 0);
    const start = -Math.PI / 2 + (before / total) * Math.PI * 2;
    return { ...s, start, end: start + (s.count / total) * Math.PI * 2 };
  });
  const point = (rad: number, a: number) => `${110 + rad * Math.cos(a)} ${110 + rad * Math.sin(a)}`;
  const path = (a0: number, a1: number) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${point(R, a0)} A ${R} ${R} 0 ${large} 1 ${point(R, a1)} L ${point(r, a1)} A ${r} ${r} 0 ${large} 0 ${point(r, a0)} Z`;
  };
  const focus = hover !== null ? arcs[hover] : null;

  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 220 220" className="w-full" role="img" aria-label={`Where registrants came from: ${slices.map((s) => `${s.label} ${s.count}`).join(", ")}`}>
        {arcs.length === 1 ? (
          <circle
            cx="110"
            cy="110"
            r={(R + r) / 2}
            fill="none"
            stroke={arcs[0].colour}
            strokeWidth={R - r}
            className="cursor-pointer"
            onMouseEnter={() => setHover(0)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect(arcs[0].label)}
          />
        ) : (
          arcs.map((a, i) => (
            <path
              key={a.label}
              d={path(a.start, a.end)}
              fill={a.colour}
              stroke="#fff"
              strokeWidth={2}
              strokeLinejoin="round"
              opacity={selected && selected !== a.label ? 0.35 : hover !== null && hover !== i ? 0.6 : 1}
              className={`transition-opacity ${a.label === OTHER ? "" : "cursor-pointer"}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(a.label)}
            />
          ))
        )}
      </svg>
      {/* Centre: the total, or the hovered slice */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {focus ? (
          <>
            <p className="max-w-[110px] truncate text-[12px] font-semibold text-muted">{focus.label}</p>
            <p className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-ink tabular-nums">{focus.count}</p>
            <p className="text-[12px] text-muted">{pct(focus.count, total)}</p>
          </>
        ) : (
          <>
            <p className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-ink tabular-nums">{total.toLocaleString("en-GB")}</p>
            <p className="text-[12px] text-muted">registrants</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Every slice as a row: colour, name, count and share, plus spend, VIP purchases, calls booked and their costs where
 * there's spend behind the dimension. Doubles as the chart's legend and table view.
 */
type SortKey = "label" | "count" | "spend" | "cpm" | "ctr" | "lpv" | "lpConv" | "costReg" | "vips" | "vipRate" | "costVip" | "calls" | "callRate" | "costCall";

function BreakdownTable({
  slices,
  total,
  selected,
  onSelect,
  money,
  currency,
  showSpend,
  showVip,
  showCalls,
}: {
  slices: Slice[];
  total: number;
  selected: string;
  onSelect: (label: string) => void;
  money: Record<string, Money>;
  currency: string;
  showSpend: boolean;
  showVip: boolean;
  showCalls: boolean;
}) {
  const cost = (m: Money | undefined, count: number | undefined) => (m?.meta == null || !count ? "—" : formatMoney(m.meta.amount / count, currency));
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  // Click a heading to sort by it (biggest first, A to Z for Value), again to flip, a third time to go back.
  const sortBy = (key: SortKey) =>
    setSort((cur) => {
      const first = key === "label" ? "asc" : "desc";
      if (cur?.key !== key) return { key, dir: first };
      return cur.dir === first ? { key, dir: first === "asc" ? "desc" : "asc" } : null;
    });
  const valueOf = (s: Slice, key: SortKey): number | string | null => {
    const m = money[s.label];
    const t = m?.meta;
    const per = (count: number | undefined) => (t == null || !count ? null : t.amount / count);
    switch (key) {
      case "label": return s.label;
      case "count": return s.count;
      case "spend": return t?.amount ?? null;
      case "cpm": return t?.impressions ? t.amount / t.impressions : null;
      case "ctr": return t?.impressions ? t.linkClicks / t.impressions : null;
      case "lpv": return t?.lpv ?? null;
      case "lpConv": return t?.lpv ? (m?.fromAds ?? 0) / t.lpv : null;
      case "costReg": return per(m?.fromAds);
      case "vips": return s.label === OTHER ? null : (m?.vips ?? 0);
      case "vipRate": return s.label === OTHER || !s.count ? null : (m?.vips ?? 0) / s.count;
      case "costVip": return per(m?.vipsFromAds);
      case "calls": return s.label === OTHER ? null : (m?.calls ?? 0);
      case "callRate": return s.label === OTHER || !s.count ? null : (m?.calls ?? 0) / s.count;
      case "costCall": return per(m?.callsFromAds);
    }
  };
  const rows = !sort
    ? slices
    : [...slices].sort((a, b) => {
        // "Other" and rows with no value (a dash) stay at the bottom either way.
        const pin = Number(a.label === OTHER) - Number(b.label === OTHER);
        if (pin) return pin;
        const va = valueOf(a, sort.key);
        const vb = valueOf(b, sort.key);
        if (va === null || vb === null) return Number(va === null) - Number(vb === null);
        const d = typeof va === "string" ? va.localeCompare(String(vb)) : va - (vb as number);
        return (sort.dir === "asc" ? d : -d) || b.count - a.count || a.label.localeCompare(b.label);
      });
  const heading = (k: SortKey, label: string, className = "") => {
    const on = sort?.key === k;
    const right = k !== "label";
    return (
      <th key={label} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`pb-2 font-semibold whitespace-nowrap ${right ? "pl-3 text-right" : ""} ${className}`}>
        <button
          type="button"
          onClick={() => sortBy(k)}
          className={`inline-flex items-center gap-1 transition hover:text-ink ${on ? "text-ink" : ""} ${right ? "flex-row-reverse" : ""}`}
        >
          {label}
          <span aria-hidden className={`text-[10px] ${on ? "" : "invisible"}`}>{on && sort.dir === "asc" ? "▲" : "▼"}</span>
        </button>
      </th>
    );
  };
  const td = "py-2.5 pl-3 text-right tabular-nums whitespace-nowrap";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] font-semibold text-muted">
            {heading("label", "Value")}
            {heading("count", "Registrants")}
            {heading("count", "Share", "w-16")}
            {showSpend && heading("spend", "Spend")}
            {showSpend && heading("cpm", "CPM")}
            {showSpend && heading("ctr", "Link CTR")}
            {showSpend && heading("lpv", "LP views")}
            {showSpend && heading("lpConv", "LP conv.")}
            {showSpend && heading("costReg", "Cost / reg")}
            {showVip && heading("vips", "VIP")}
            {showVip && heading("vipRate", "VIP %")}
            {showSpend && showVip && heading("costVip", "Cost / VIP")}
            {showCalls && heading("calls", "Calls")}
            {showCalls && heading("callRate", "Call %")}
            {showSpend && showCalls && heading("costCall", "Cost / call")}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const clickable = s.label !== OTHER;
            const isSelected = selected === s.label;
            const m = money[s.label];
            return (
              <tr
                key={s.label}
                onClick={clickable ? () => onSelect(s.label) : undefined}
                className={`border-b border-line/70 last:border-0 ${clickable ? "cursor-pointer hover:bg-canvas" : ""} ${isSelected ? "bg-brand-soft/60" : ""}`}
              >
                <td className="py-2.5 pr-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="size-3 shrink-0 rounded-full" style={{ background: s.colour }} />
                    <span className={`min-w-0 break-all ${isEmpty(s.label) || s.label === OTHER ? "text-muted" : "font-medium text-ink"}`}>{s.label}</span>
                  </span>
                </td>
                <td className={`${td} font-semibold text-ink`}>{s.count.toLocaleString("en-GB")}</td>
                <td className={`${td} text-muted`}>{pct(s.count, total)}</td>
                {showSpend && <td className={`${td} text-ink`}>{m?.meta == null ? "—" : formatMoney(m.meta.amount, currency)}</td>}
                {showSpend && <td className={`${td} text-ink`}>{m?.meta == null ? "—" : perThousand(m.meta, currency)}</td>}
                {showSpend && <td className={`${td} text-muted`}>{m?.meta == null ? "—" : ratio(m.meta.linkClicks, m.meta.impressions, 2)}</td>}
                {showSpend && <td className={`${td} text-ink`}>{m?.meta == null ? "—" : m.meta.lpv.toLocaleString("en-GB")}</td>}
                {showSpend && <td className={`${td} text-muted`}>{m?.meta == null ? "—" : ratio(m.fromAds, m.meta.lpv, 1)}</td>}
                {showSpend && <td className={`${td} text-ink`}>{cost(m, m?.fromAds)}</td>}
                {showVip && <td className={`${td} text-ink`}>{s.label === OTHER ? "—" : (m?.vips ?? 0).toLocaleString("en-GB")}</td>}
                {showVip && <td className={`${td} text-muted`}>{s.label === OTHER ? "—" : uptake(m?.vips ?? 0, s.count)}</td>}
                {showSpend && showVip && <td className={`${td} text-ink`}>{cost(m, m?.vipsFromAds)}</td>}
                {showCalls && <td className={`${td} text-ink`}>{s.label === OTHER ? "—" : (m?.calls ?? 0).toLocaleString("en-GB")}</td>}
                {showCalls && <td className={`${td} text-muted`}>{s.label === OTHER ? "—" : uptake(m?.calls ?? 0, s.count)}</td>}
                {showSpend && showCalls && <td className={`${td} text-ink`}>{cost(m, m?.callsFromAds)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

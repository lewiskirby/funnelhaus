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

// Two reports over the same filters: how the webinar did overall, and how the ads did.
type Report = "webinar" | "ads";
// The webinar report breaks registrants down by these; the ad report is always by ad.
const OVERVIEW_DIMENSIONS = DIMENSIONS.filter(({ key }) => key !== "ad");

export function RegistrantsDashboard({
  registrants,
  tracksVip,
  tracksCalls,
  attendance,
  spend,
  currency,
  webinars: known,
  ghlUrl,
  fetchedAt,
}: {
  registrants: Registrant[];
  tracksVip: boolean; // the client has a "VIP Ticket Purchased" field in GHL
  tracksCalls: boolean; // GHL's calendar is readable, or the client has call fields (Appointment Booked Date and so on)
  attendance: Record<string, { peak?: number; pitch?: number }>; // Peak attendees and Attendees at pitch from Notion, by webinar day
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
  const [report, setReport] = useState<Report>("webinar");
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

  // Everyone matching the webinar and source filters, then the date range.
  const inWebinar = (r: Registrant) => webinar === "all" || r.webinars.some((w) => w.key === webinar);
  const inRange = (r: Registrant) => {
    if (range === "all") return true;
    const day = dayIn(r.addedAt, zone);
    return range === "today" ? day === today : day > daysAgo(Number(range));
  };
  const shown = registrants.filter(
    (r) => inWebinar(r) && DIMENSIONS.every(({ key }) => !filters[key] || valueOf(r, key) === filters[key]) && inRange(r),
  );

  // A call counts when it was booked on or after the day of the webinar they registered for (any of
  // theirs under "All webinars"). Calls with no known day (only "Appointment Booked" = yes) always count.
  const bookedCall = (r: Registrant) =>
    r.callBooked && (!r.callBookedOn || r.webinars.some((w) => (webinar === "all" || w.key === webinar) && r.callBookedOn! >= w.key));
  // Attendance comes from GHL's "<day>-attended" tags; a webinar nobody is tagged for yet shows dashes.
  const attendedOne = (r: Registrant) => (webinar === "all" ? r.attended.length > 0 : r.attended.includes(webinar));
  const forWebinar = registrants.filter(inWebinar);
  const tracksAttendance = forWebinar.some(attendedOne);
  const tally = (rs: Registrant[]): Counts => {
    const c = { ...NO_COUNTS };
    for (const r of rs) {
      const call = bookedCall(r);
      c.registrants++;
      if (r.ad) c.fromAds++;
      if (attendedOne(r)) c.attended++;
      if (r.vip) c.vips++;
      if (r.ad && r.vip) c.vipsFromAds++;
      if (call) c.calls++;
      if (call && r.ad) c.callsFromAds++;
    }
    return c;
  };
  const total = tally(shown);
  const groupBy = (d: Dimension) => {
    const groups = new Map<string, Registrant[]>();
    for (const r of shown) groups.set(valueOf(r, d), [...(groups.get(valueOf(r, d)) ?? []), r]);
    return new Map([...groups].map(([label, rs]) => [label, tally(rs)]));
  };

  // Options for each source filter come from the chosen webinar, so they never lead to nothing.
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
  const groups = groupBy(dimension);
  const sorted = [...groups].map(([label, c]) => ({ label, count: c.registrants, colour: isEmpty(label) ? MUTED : colours(label) }));
  sorted.sort((a, b) => Number(isEmpty(a.label)) - Number(isEmpty(b.label)) || b.count - a.count || a.label.localeCompare(b.label));
  // Values without their own colour are folded into "Other" so no two slices share a colour.
  const slices: Slice[] = sorted.filter((s) => s.colour !== MUTED || isEmpty(s.label));
  const folded = sorted.filter((s) => s.colour === MUTED && !isEmpty(s.label));
  if (folded.length) slices.push({ label: OTHER, count: folded.reduce((n, s) => n + s.count, 0), colour: "#6f6f6b" });
  const countsFor = (label: string) =>
    label === OTHER
      ? folded.reduce((sum, s) => addCounts(sum, groups.get(s.label) ?? NO_COUNTS), { ...NO_COUNTS })
      : (groups.get(label) ?? NO_COUNTS);

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

  // One ad's spend within the same days and filters as the tiles.
  const metaForAd = (label: string): MetaTotals | null => {
    if (!spend || spend === "error" || unattributable || !ads.has(nameKey(label))) return null;
    return sumMeta(rows, (r) => nameKey(r.ad) === nameKey(label) && spendDay(r.day) && spendFilters.every((f) => f(r)));
  };
  // The ad report: every ad that brought someone in, then ads that only spent, most registrants first.
  const byAd = groupBy("ad");
  byAd.delete(NOT_AN_AD);
  const adNames = new Map<string, string>([...byAd.keys()].map((ad) => [nameKey(ad), ad]));
  for (const r of rows) if (!adNames.has(nameKey(r.ad)) && (metaForAd(r.ad)?.amount ?? 0) > 0) adNames.set(nameKey(r.ad), r.ad);
  const adRows: Row[] = [...adNames.values()]
    .map((ad) => ({ label: ad, count: byAd.get(ad)?.registrants ?? 0, counts: byAd.get(ad) ?? NO_COUNTS, meta: metaForAd(ad) }))
    .sort((a, b) => b.count - a.count || (b.meta?.amount ?? 0) - (a.meta?.amount ?? 0) || a.label.localeCompare(b.label));
  const hasAds = !!spend || registrants.some((r) => r.ad);

  // Peak and pitch are typed into the webinar's Notion event after it runs, so they're for one webinar only.
  const live = webinar === "all" ? undefined : attendance[webinar];
  const liveHint = (what: string, value?: number) =>
    webinar === "all" ? "Choose a webinar to see this" : value != null ? what : webinar >= today ? "Added after the webinar" : "Not added yet";

  const active = DIMENSIONS.filter(({ key }) => filters[key]);
  const setFilter = (d: Dimension, value: string) => setFilters((f) => ({ ...f, [d]: value }));
  const toggle = (d: Dimension) => (label: string) => {
    if (label === OTHER) return;
    setFilter(d, filters[d] === label ? "" : label);
  };
  const clearAll = () => {
    setFilters(NO_FILTERS);
    setRange("all");
    setWebinar(defaultWebinar);
  };

  const rangeLabel = RANGES.find((r) => r.key === range)!.label.toLowerCase();
  const n = (count: number) => count.toLocaleString("en-GB");

  // Columns for the webinar report's breakdown and the ad report's table.
  const overviewColumns: Column[] = [
    { label: "Registrants", sort: (r) => r.count, show: (r) => n(r.count), strong: true },
    { label: "Share", sort: (r) => r.count, show: (r) => pct(r.count, total.registrants), muted: true },
    ...(tracksAttendance
      ? [
          { label: "Attended", sort: (r: Row) => r.counts.attended, show: (r: Row) => n(r.counts.attended) },
          { label: "Attendance %", sort: (r: Row) => (r.count ? r.counts.attended / r.count : null), show: (r: Row) => uptake(r.counts.attended, r.count), muted: true },
        ]
      : []),
    ...(tracksCalls
      ? [
          { label: "Calls", sort: (r: Row) => r.counts.calls, show: (r: Row) => n(r.counts.calls) },
          { label: "Call %", sort: (r: Row) => (r.count ? r.counts.calls / r.count : null), show: (r: Row) => uptake(r.counts.calls, r.count), muted: true },
        ]
      : []),
  ];
  const per = (r: Row, count: number) => (r.meta == null || !count ? null : r.meta.amount / count);
  const money = (v: number | null) => (v == null ? "—" : fmt(v));
  const adColumns: Column[] = [
    ...(spend
      ? [
          { label: "Spend", sort: (r: Row) => r.meta?.amount ?? null, show: (r: Row) => money(r.meta?.amount ?? null), strong: true },
          { label: "CPM", sort: (r: Row) => (r.meta?.impressions ? r.meta.amount / r.meta.impressions : null), show: (r: Row) => (r.meta ? perThousand(r.meta, currency) : "—") },
          { label: "Link CTR", sort: (r: Row) => (r.meta?.impressions ? r.meta.linkClicks / r.meta.impressions : null), show: (r: Row) => (r.meta ? ratio(r.meta.linkClicks, r.meta.impressions, 2) : "—"), muted: true },
          { label: "LP views", sort: (r: Row) => r.meta?.lpv ?? null, show: (r: Row) => (r.meta ? n(r.meta.lpv) : "—") },
          { label: "LP conv.", sort: (r: Row) => (r.meta?.lpv ? r.count / r.meta.lpv : null), show: (r: Row) => (r.meta ? ratio(r.count, r.meta.lpv, 1) : "—"), muted: true },
        ]
      : []),
    { label: "Registrants", sort: (r) => r.count, show: (r) => n(r.count), strong: !spend },
    ...(spend ? [{ label: "Cost / reg", sort: (r: Row) => per(r, r.count), show: (r: Row) => money(per(r, r.count)) }] : []),
    ...(tracksCalls
      ? [
          { label: "Calls", sort: (r: Row) => r.counts.calls, show: (r: Row) => n(r.counts.calls) },
          ...(spend ? [{ label: "Cost / call", sort: (r: Row) => per(r, r.counts.calls), show: (r: Row) => money(per(r, r.counts.calls)) }] : []),
        ]
      : []),
    ...(tracksVip
      ? [
          { label: "VIP", sort: (r: Row) => r.counts.vips, show: (r: Row) => n(r.counts.vips) },
          ...(spend ? [{ label: "Cost / VIP", sort: (r: Row) => per(r, r.counts.vips), show: (r: Row) => money(per(r, r.counts.vips)) }] : []),
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {hasAds && (
        <div role="tablist" aria-label="Report" className="inline-flex gap-1 rounded-full bg-white p-1 ring-1 ring-line">
          {(
            [
              ["webinar", "Webinar performance"],
              ["ads", "Ad performance"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={report === key}
              onClick={() => setReport(key)}
              className={`cursor-pointer rounded-full px-4 py-2 text-[13.5px] font-semibold transition ${
                report === key ? "bg-ink-2 text-white" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

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

      {report === "webinar" || !hasAds ? (
        <>
          <MetricGroup title="Registrations">
            <MetricRow label="Webinar registrants" value={n(total.registrants)} hint={range === "all" ? "All time" : rangeLabel} accent />
            {hasAds && <MetricRow label="Registrants from ads" value={n(total.fromAds)} hint="Clicked a paid ad" />}
            {spend && <MetricRow label="Ad spend" value={spent === null ? "—" : fmt(spent)} hint={spendHint} />}
            {spend && <MetricRow label="Cost per registrant" value={costPer(total.fromAds)} hint="Ad spend ÷ registrants from ads" />}
          </MetricGroup>
          <MetricGroup title="Attendance">
            <MetricRow label="Attendees at peak" value={live?.peak != null ? n(live.peak) : "—"} hint={liveHint("Most watching at once", live?.peak)} />
            <MetricRow label="Attendees at pitch" value={live?.pitch != null ? n(live.pitch) : "—"} hint={liveHint("Watching when the offer was made", live?.pitch)} />
            <MetricRow
              label="Attendance rate"
              value={tracksAttendance ? uptake(total.attended, total.registrants) : "—"}
              hint={tracksAttendance ? `${n(total.attended)} attended ÷ registrants` : "Once attendees are tagged in GHL"}
            />
            <MetricRow
              label="Retention rate"
              value={live?.peak && live.pitch != null ? ratio(live.pitch, live.peak, 1) : "—"}
              hint={live?.peak && live.pitch != null ? "Attendees at pitch ÷ at peak" : liveHint("", undefined)}
            />
          </MetricGroup>
          {tracksCalls && (
            <MetricGroup title="Calls">
              <MetricRow label="Calls booked" value={n(total.calls)} hint="Booked on or after the webinar day" />
              <MetricRow label="Call booking rate" value={uptake(total.calls, total.registrants)} hint="Calls booked ÷ registrants" />
            </MetricGroup>
          )}

          {/* Breakdown */}
          <section className="card p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">Where registrants came from</h2>
              <div role="tablist" aria-label="Break down by" className="flex w-full flex-wrap gap-1 rounded-[20px] bg-canvas p-1 ring-1 ring-line sm:w-auto sm:rounded-full">
                {OVERVIEW_DIMENSIONS.map(({ key, label }) => (
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
              <Empty>No registrants match these filters yet.</Empty>
            ) : (
              <div className="grid grid-cols-1 items-center gap-8 xl:grid-cols-[260px_minmax(0,1fr)]">
                <Donut slices={slices} total={shown.length} selected={filters[dimension]} onSelect={toggle(dimension)} />
                <BreakdownTable
                  rows={slices.map((s) => ({ ...s, counts: countsFor(s.label), meta: null }))}
                  columns={overviewColumns}
                  selected={filters[dimension]}
                  onSelect={toggle(dimension)}
                />
              </div>
            )}
            <p className="mt-5 text-[12.5px] text-muted">
              Tap a slice or row to filter by it. Sources come from Trakyo, or from UTMs where Trakyo has nothing. Registrants with neither show as {NOT_SET}.
            </p>
          </section>
        </>
      ) : (
        <>
          {spend && (
            <MetricGroup title="Reach">
              <MetricRow label="Ad spend" value={spent === null ? "—" : fmt(spent)} hint={spendHint} accent />
              <MetricRow label="CPM" value={totals ? perThousand(totals, currency) : "—"} hint="Ad spend per 1,000 impressions" />
              <MetricRow label="Link CTR" value={totals ? ratio(totals.linkClicks, totals.impressions, 2) : "—"} hint="Link clicks ÷ impressions" />
              <MetricRow label="Landing page views" value={totals ? n(totals.lpv) : "—"} hint="From Meta" />
            </MetricGroup>
          )}
          <MetricGroup title="Registrations">
            {spend && <MetricRow label="Landing page conversion" value={totals ? ratio(total.fromAds, totals.lpv, 1) : "—"} hint="Registrants from ads ÷ landing page views" />}
            <MetricRow label="Registrants from ads" value={n(total.fromAds)} hint="Clicked a paid ad" accent={!spend} />
            {spend && <MetricRow label="Cost per registrant" value={costPer(total.fromAds)} hint="Ad spend ÷ registrants from ads" />}
          </MetricGroup>
          {(tracksCalls || tracksVip) && (
            <MetricGroup title="After registering">
              {tracksCalls && <MetricRow label="Calls booked from ads" value={n(total.callsFromAds)} hint="Booked on or after the webinar day" />}
              {spend && tracksCalls && <MetricRow label="Cost per call booked" value={costPer(total.callsFromAds)} hint="Ad spend ÷ calls booked from ads" />}
              {tracksVip && <MetricRow label="VIP purchases from ads" value={n(total.vipsFromAds)} hint="Bought the VIP upgrade" />}
              {spend && tracksVip && <MetricRow label="Cost per VIP purchase" value={costPer(total.vipsFromAds)} hint="Ad spend ÷ VIP purchases from ads" />}
            </MetricGroup>
          )}

          <section className="card p-5 sm:p-6">
            <h2 className="mb-5 text-[17px] font-bold tracking-[-0.01em] text-ink">By ad</h2>
            {adRows.length === 0 ? (
              <Empty>No ad registrants or spend match these filters yet.</Empty>
            ) : (
              <BreakdownTable rows={adRows} columns={adColumns} firstLabel="Ad" selected={filters.ad} onSelect={toggle("ad")} />
            )}
            <p className="mt-5 text-[12.5px] text-muted">
              Tap an ad to filter everything by it. Ads are named as in Trakyo, and only registrants with a paid UTM count as coming from an ad.
            </p>
          </section>
        </>
      )}

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

/** A titled list of metrics, one per row. */
function MetricGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold tracking-[0.02em] text-muted uppercase">{title}</h2>
      <div className="card divide-y divide-line px-5 sm:px-6">{children}</div>
    </section>
  );
}

/** One metric as a row: name and how it's worked out on the left, the number on the right. `accent` makes it the group's lead number. */
function MetricRow({ label, value, hint, accent = false }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-[12.5px] text-faint">{hint}</p>
      </div>
      <p className={`shrink-0 text-right leading-none font-bold tracking-[-0.02em] text-ink tabular-nums ${accent ? "text-[30px]" : "text-[26px]"}`}>{value}</p>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-canvas px-5 py-10 text-center text-[14px] text-muted ring-1 ring-line">{children}</p>;
}

type Slice = { label: string; count: number; colour?: string };
type Counts = { registrants: number; fromAds: number; attended: number; vips: number; vipsFromAds: number; calls: number; callsFromAds: number };
const NO_COUNTS: Counts = { registrants: 0, fromAds: 0, attended: 0, vips: 0, vipsFromAds: 0, calls: 0, callsFromAds: 0 };
const addCounts = (a: Counts, b: Counts): Counts =>
  Object.fromEntries(Object.keys(a).map((k) => [k, a[k as keyof Counts] + b[k as keyof Counts]])) as Counts;
type Row = Slice & { counts: Counts; meta: MetaTotals | null };
type Column = { label: string; sort: (r: Row) => number | null; show: (r: Row) => string; strong?: boolean; muted?: boolean };
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
 * Rows of a breakdown (a colour dot when the row has one, its name, then `columns`). Headings sort it.
 * The name column keeps a readable width, so a wide table scrolls sideways rather than squeezing names.
 */
function BreakdownTable({
  rows,
  columns,
  firstLabel = "Value",
  selected,
  onSelect,
}: {
  rows: Row[];
  columns: Column[];
  firstLabel?: string;
  selected: string;
  onSelect: (label: string) => void;
}) {
  // Click a heading to sort by it (biggest first, A to Z for the name), again to flip, a third time to go back.
  const [sort, setSort] = useState<{ col: number; dir: "asc" | "desc" } | null>(null);
  const sortBy = (col: number) =>
    setSort((cur) => {
      const first = col < 0 ? "asc" : "desc";
      if (cur?.col !== col) return { col, dir: first };
      return cur.dir === first ? { col, dir: first === "asc" ? "desc" : "asc" } : null;
    });
  const valueOf = (r: Row, col: number): number | string | null => (col < 0 ? r.label : r.label === OTHER ? null : columns[col].sort(r));
  const sorted = !sort
    ? rows
    : [...rows].sort((a, b) => {
        // "Other" and rows with no value (a dash) stay at the bottom either way.
        const pin = Number(a.label === OTHER) - Number(b.label === OTHER);
        if (pin) return pin;
        const va = valueOf(a, sort.col);
        const vb = valueOf(b, sort.col);
        if (va === null || vb === null) return Number(va === null) - Number(vb === null);
        const d = typeof va === "string" ? va.localeCompare(String(vb)) : va - (vb as number);
        return (sort.dir === "asc" ? d : -d) || b.count - a.count || a.label.localeCompare(b.label);
      });
  const heading = (col: number, label: string) => {
    const on = sort?.col === col;
    const right = col >= 0;
    return (
      <th
        key={label}
        aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={`pb-2 font-semibold whitespace-nowrap ${right ? "pl-4 text-right" : "pr-3"}`}
      >
        <button
          type="button"
          onClick={() => sortBy(col)}
          className={`inline-flex cursor-pointer items-center gap-1 transition hover:text-ink ${on ? "text-ink" : ""} ${right ? "flex-row-reverse" : ""}`}
        >
          {label}
          <span aria-hidden className={`text-[10px] ${on ? "" : "invisible"}`}>{on && sort.dir === "asc" ? "▲" : "▼"}</span>
        </button>
      </th>
    );
  };
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full min-w-max text-[14px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] font-semibold text-muted">
            {heading(-1, firstLabel)}
            {columns.map((c, i) => heading(i, c.label))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const clickable = r.label !== OTHER;
            return (
              <tr
                key={r.label}
                onClick={clickable ? () => onSelect(r.label) : undefined}
                className={`border-b border-line/70 last:border-0 ${clickable ? "cursor-pointer hover:bg-canvas" : ""} ${selected === r.label ? "bg-brand-soft/60" : ""}`}
              >
                <td className="py-2.5 pr-3">
                  <span className="flex w-[clamp(10rem,22vw,18rem)] items-center gap-2.5">
                    {r.colour && <span className="size-3 shrink-0 rounded-full" style={{ background: r.colour }} />}
                    <span className={`min-w-0 break-words ${isEmpty(r.label) || r.label === OTHER ? "text-muted" : "font-medium text-ink"}`}>{r.label}</span>
                  </span>
                </td>
                {columns.map((c) => (
                  <td
                    key={c.label}
                    className={`py-2.5 pl-4 text-right whitespace-nowrap tabular-nums ${c.strong ? "font-semibold text-ink" : c.muted ? "text-muted" : "text-ink"}`}
                  >
                    {r.label === OTHER && c.label !== "Registrants" && c.label !== "Share" ? "—" : c.show(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

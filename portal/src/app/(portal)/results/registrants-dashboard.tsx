"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import type { Registrant } from "@/lib/types";

// Rendered in Berlin time on the server, then in the viewer's own time zone.
const DEFAULT_TZ = "Europe/Berlin";
const noopSubscribe = () => () => {};

type Dimension = "source" | "medium" | "campaign" | "content";
const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "source", label: "UTM source" },
  { key: "medium", label: "UTM medium" },
  { key: "campaign", label: "UTM campaign" },
  { key: "content", label: "UTM content" },
];
const RANGES = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
] as const;
type Range = (typeof RANGES)[number]["key"];

const NOT_SET = "(not set)";
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
const valueOf = (r: Registrant, d: Dimension) => r[d] ?? NOT_SET;

type Filters = Record<Dimension, string>;
const NO_FILTERS: Filters = { source: "", medium: "", campaign: "", content: "" };

export function RegistrantsDashboard({
  registrants,
  webinars: known,
  ghlUrl,
  fetchedAt,
}: {
  registrants: Registrant[];
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
  const [webinar, setWebinar] = useState("all");
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

  // Everyone matching the webinar and UTM filters, before the date range.
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
  const newToday = matching.filter((r) => dayIn(r.addedAt, zone) === today).length;
  const last7 = matching.filter((r) => dayIn(r.addedAt, zone) > daysAgo(7)).length;

  // Options for each UTM filter come from the chosen webinar, so they never lead to nothing.
  const forWebinar = registrants.filter((r) => webinar === "all" || r.webinars.some((w) => w.key === webinar));
  const optionsFor = (d: Dimension) => [...new Set(forWebinar.map((r) => valueOf(r, d)))].sort((a, b) => a.localeCompare(b));

  // Colours follow the value (ranked over everyone), not its position in the current view.
  const colours = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of registrants) if (r[dimension]) counts.set(r[dimension]!, (counts.get(r[dimension]!) ?? 0) + 1);
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
    const map = new Map<string, string>(ranked.slice(0, SLOTS.length - 1).map((v, i) => [v, SLOTS[i]]));
    return (value: string) => map.get(value) ?? MUTED;
  }, [registrants, dimension]);

  const slices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of shown) counts.set(valueOf(r, dimension), (counts.get(valueOf(r, dimension)) ?? 0) + 1);
    const sorted = [...counts].map(([label, count]) => ({ label, count, colour: label === NOT_SET ? MUTED : colours(label) }));
    sorted.sort((a, b) => Number(a.label === NOT_SET) - Number(b.label === NOT_SET) || b.count - a.count || a.label.localeCompare(b.label));
    // Values without their own colour are folded into "Other" so no two slices share a colour.
    const own = sorted.filter((s) => s.colour !== MUTED || s.label === NOT_SET);
    const rest = sorted.filter((s) => s.colour === MUTED && s.label !== NOT_SET);
    if (rest.length) own.push({ label: OTHER, count: rest.reduce((n, s) => n + s.count, 0), colour: "#6f6f6b" });
    return own;
  }, [shown, dimension, colours]);

  const active = DIMENSIONS.filter(({ key }) => filters[key]);
  const setFilter = (d: Dimension, value: string) => setFilters((f) => ({ ...f, [d]: value }));
  const toggleSlice = (label: string) => {
    if (label === OTHER) return;
    setFilter(dimension, filters[dimension] === label ? "" : label);
  };
  const clearAll = () => {
    setFilters(NO_FILTERS);
    setRange("all");
    setWebinar("all");
  };

  const rangeLabel = RANGES.find((r) => r.key === range)!.label.toLowerCase();

  return (
    <div className="space-y-6">
      {/* Filters */}
      <section className="card p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
        {(active.length > 0 || range !== "all" || webinar !== "all") && (
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
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Webinar registrants" value={shown.length} hint={range === "all" ? "All time" : rangeLabel} accent />
        <Stat label="New registrants today" value={newToday} hint={`Since midnight, your time`} />
        <Stat label="Last 7 days" value={last7} hint="Including today" />
      </section>

      {/* Breakdown */}
      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">Registrants by UTM</h2>
          <div role="tablist" aria-label="Break down by" className="grid w-full grid-cols-4 gap-1 rounded-full bg-canvas p-1 ring-1 ring-line sm:flex sm:w-auto">
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
                {label.replace("UTM ", "")}
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
            <BreakdownTable slices={slices} total={shown.length} selected={filters[dimension]} onSelect={toggleSlice} />
          </div>
        )}
        <p className="mt-5 text-[12.5px] text-muted">
          Tap a slice or row to filter by it. Registrants without a UTM show as {NOT_SET}.
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

function Stat({ label, value, hint, accent = false }: { label: string; value: number; hint: string; accent?: boolean }) {
  return (
    <div className={`rounded-[20px] p-5 ${accent ? "bg-ink-2 text-white" : "card"}`}>
      <p className={`text-[12.5px] font-semibold ${accent ? "text-white/55" : "text-muted"}`}>{label}</p>
      <p className="mt-2 text-[38px] leading-none font-bold tracking-[-0.03em] tabular-nums">{value.toLocaleString("en-GB")}</p>
      <p className={`mt-2 text-[12.5px] ${accent ? "text-white/45" : "text-faint"}`}>{hint}</p>
    </div>
  );
}

type Slice = { label: string; count: number; colour: string };
const pct = (n: number, total: number) => `${Math.round((n / total) * 100)}%`;

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
      <svg viewBox="0 0 220 220" className="w-full" role="img" aria-label={`Registrants by UTM: ${slices.map((s) => `${s.label} ${s.count}`).join(", ")}`}>
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

/** Every slice as a row: colour, name, count and share. Doubles as the chart's legend and table view. */
function BreakdownTable({ slices, total, selected, onSelect }: { slices: Slice[]; total: number; selected: string; onSelect: (label: string) => void }) {
  return (
    <table className="w-full text-[14px]">
      <thead>
        <tr className="border-b border-line text-left text-[12px] font-semibold text-muted">
          <th className="pb-2 font-semibold">Value</th>
          <th className="pb-2 text-right font-semibold">Registrants</th>
          <th className="w-16 pb-2 text-right font-semibold">Share</th>
        </tr>
      </thead>
      <tbody>
        {slices.map((s) => {
          const clickable = s.label !== OTHER;
          const isSelected = selected === s.label;
          return (
            <tr
              key={s.label}
              onClick={clickable ? () => onSelect(s.label) : undefined}
              className={`border-b border-line/70 last:border-0 ${clickable ? "cursor-pointer hover:bg-canvas" : ""} ${isSelected ? "bg-brand-soft/60" : ""}`}
            >
              <td className="py-2.5 pr-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: s.colour }} />
                  <span className={`min-w-0 break-all ${s.label === NOT_SET || s.label === OTHER ? "text-muted" : "font-medium text-ink"}`}>{s.label}</span>
                </span>
              </td>
              <td className="py-2.5 text-right font-semibold text-ink tabular-nums">{s.count.toLocaleString("en-GB")}</td>
              <td className="py-2.5 text-right text-muted tabular-nums">{pct(s.count, total)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

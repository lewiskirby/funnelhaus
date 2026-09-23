"use client";

import { useSyncExternalStore } from "react";
import type { ClientEvent } from "@/lib/types";

// Rendered in Berlin time on the server, then in the viewer's own time zone.
const DEFAULT_TZ = "Europe/Berlin";
const noopSubscribe = () => () => {};

function parts(event: ClientEvent, timeZone: string) {
  // All-day dates have no time zone; read them as calendar dates.
  const tz = event.allDay ? "UTC" : timeZone;
  const date = new Date(event.allDay ? `${event.start}T12:00:00Z` : event.start);
  const fmt = (o: Intl.DateTimeFormatOptions) => date.toLocaleString("en-GB", { timeZone: tz, ...o });

  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const days = Math.round((Date.parse(dayKey(date)) - Date.parse(dayKey(new Date()))) / 86_400_000);

  return {
    month: fmt({ month: "short" }),
    day: fmt({ day: "numeric" }),
    time: event.allDay ? null : fmt({ weekday: "short", hour: "2-digit", minute: "2-digit" }),
    relative: days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`,
  };
}

export function EventRow({ event }: { event: ClientEvent }) {
  // Server render uses Berlin; the browser swaps in the viewer's own time zone.
  const timeZone = useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => DEFAULT_TZ,
  );
  const p = parts(event, timeZone);

  return (
    <li className="flex items-center gap-4">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-white py-1.5 ring-1 ring-line">
        <span className="text-[10px] font-semibold text-brand">{p.month}</span>
        <span className="text-[17px] leading-tight font-bold text-ink">{p.day}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-ink">{event.name}</p>
        <p className="text-[12.5px] text-muted">
          {p.relative}
          {p.time && <> · {p.time}</>}
        </p>
      </div>
    </li>
  );
}

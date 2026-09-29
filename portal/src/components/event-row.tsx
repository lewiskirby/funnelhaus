"use client";

import { useSyncExternalStore } from "react";
import type { ClientEvent, RichText } from "@/lib/types";

// Rendered in Berlin time on the server, then in the viewer's own time zone.
const DEFAULT_TZ = "Europe/Berlin";
const noopSubscribe = () => () => {};

/** "+01:00" → "GMT+1", "-04:00" → "GMT-4", "+05:30" → "GMT+5:30", "Z" → "GMT". */
export function offsetLabel(offset: string) {
  if (offset === "Z" || /^[+-]00:00$/.test(offset)) return "GMT";
  const [h, m] = offset.slice(1).split(":");
  return `GMT${offset[0]}${Number(h)}${m === "00" ? "" : `:${m}`}`;
}

const START_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})[\d:.]*(Z|[+-]\d{2}:\d{2})$/;

function parts(event: ClientEvent, viewerZone: string) {
  // Timed events show at the clock time they were set in, e.g. 19:00 GMT-4,
  // plus the viewer's own time when that differs. All-day dates are calendar dates.
  const timed = event.allDay ? null : START_RE.exec(event.start);
  const day = event.allDay ? event.start.slice(0, 10) : (timed?.[1] ?? new Date(event.start).toLocaleDateString("en-CA", { timeZone: viewerZone }));
  const calendar = new Date(`${day}T12:00:00Z`);
  const fmtDay = (o: Intl.DateTimeFormatOptions) => calendar.toLocaleString("en-GB", { timeZone: "UTC", ...o });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: viewerZone });
  const days = Math.round((Date.parse(day) - Date.parse(today)) / 86_400_000);

  let time: string | null = null;
  let localTime: string | null = null;
  if (timed) {
    time = `${fmtDay({ weekday: "short" })} ${timed[2]} ${offsetLabel(timed[3])}`;
    const local = new Date(event.start).toLocaleString("en-GB", { timeZone: viewerZone, weekday: "short", hour: "2-digit", minute: "2-digit" });
    if (local.replace(",", "") !== `${fmtDay({ weekday: "short" })} ${timed[2]}`) localTime = local.replace(",", "");
  } else if (!event.allDay) {
    time = new Date(event.start).toLocaleString("en-GB", { timeZone: viewerZone, weekday: "short", hour: "2-digit", minute: "2-digit" });
  }

  return {
    month: fmtDay({ month: "short" }),
    day: fmtDay({ day: "numeric" }),
    time,
    localTime,
    relative: days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`,
  };
}

// ── Links for event ─────────────────────────────────

type EventLink = { href: string; label: string };
const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g;

const hostOf = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
};

/**
 * Reads the Notion text field line by line. Each link becomes a button labelled
 * by its own link text, the words on its line ("Zoom: https://…" → "Zoom"), or
 * its website. Lines without a link are shown as notes.
 */
function readLinks(rich: RichText[]): { links: EventLink[]; notes: string[] }[] {
  const lines: RichText[][] = [[]];
  for (const part of rich) {
    part.text.split("\n").forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece) lines[lines.length - 1].push({ ...part, text: piece });
    });
  }

  const tidy = (t: string) => t.replace(/\s+/g, " ").replace(/^[\s:,;|–-]+|[\s:,;|–-]+$/g, "");
  const hasWords = (t: string) => /[\p{L}\p{N}]/u.test(t);

  return lines
    .map((line) => {
      const links: EventLink[] = [];
      let words = ""; // the line without bare URLs
      let rest = ""; // the line without any link at all
      for (const part of line) {
        if (part.href) {
          const own = part.text.trim();
          links.push({ href: part.href, label: /^https?:\/\//.test(own) ? "" : own });
          words += /^https?:\/\//.test(own) ? " " : part.text;
          rest += " ";
          continue;
        }
        const plain = part.text.replace(URL_RE, (href) => {
          links.push({ href, label: "" });
          return " ";
        });
        words += plain;
        rest += plain;
      }
      // One link on a line takes the whole line as its label: "Zoom: https://…" or "Slides [here]".
      if (links.length === 1) {
        const label = hasWords(words) ? tidy(words) : hostOf(links[0].href);
        return { links: [{ ...links[0], label }], notes: [] };
      }
      const note = tidy(rest);
      return {
        links: links.map((l) => ({ ...l, label: l.label || hostOf(l.href) })),
        notes: hasWords(note) ? [note] : [],
      };
    })
    .filter((l) => l.links.length || l.notes.length);
}

function EventLinks({ rich, className }: { rich: RichText[]; className: string }) {
  const lines = readLinks(rich);
  const links = lines.flatMap((l) => l.links);
  const notes = lines.flatMap((l) => l.notes);
  if (!links.length && !notes.length) return null;
  return (
    <div className={`mt-2 ${className}`}>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((link, i) => (
            <a
              key={`${link.href}-${i}`}
              href={link.href}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-white px-3 text-[12.5px] font-medium text-ink ring-1 ring-line transition hover:text-brand hover:ring-brand/30"
            >
              <span className="truncate">{link.label}</span>
              <svg viewBox="0 0 16 16" className="size-3 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path d="M6 3h7v7M13 3L4 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ))}
        </div>
      )}
      {notes.map((note, i) => (
        <p key={i} className="mt-1.5 text-[12.5px] text-muted">
          {note}
        </p>
      ))}
    </div>
  );
}

/** One upcoming event. With `onEdit`, the date and name open it for editing; links always open directly. */
export function EventRow({ event, onEdit }: { event: ClientEvent; onEdit?: () => void }) {
  // Server render uses Berlin; the browser swaps in the viewer's own time zone.
  const viewerZone = useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => DEFAULT_TZ,
  );
  const p = parts(event, viewerZone);

  const body = (
    <>
      <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-white py-1.5 ring-1 ring-line">
        <span className="text-[10px] font-semibold text-brand">{p.month}</span>
        <span className="text-[17px] leading-tight font-bold text-ink">{p.day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-ink">{event.name}</p>
        <p className="text-[12.5px] text-muted">
          {p.relative}
          {p.time && <> · {p.time}</>}
          {p.localTime && <span className="text-faint"> ({p.localTime} your time)</span>}
        </p>
      </div>
    </>
  );

  const links = event.links?.length ? event.links : null;

  if (!onEdit) {
    return (
      <li>
        <div className="flex items-center gap-4">{body}</div>
        {links && <EventLinks rich={links} className="pl-16" />}
      </li>
    );
  }
  return (
    <li className="-mx-2">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${event.name}`}
        className="group flex w-full items-center gap-4 rounded-xl px-2 py-1.5 text-left transition hover:bg-canvas active:bg-canvas"
      >
        {body}
        <span className="shrink-0 text-[12.5px] font-medium text-faint transition group-hover:text-brand">Edit</span>
      </button>
      {links && <EventLinks rich={links} className="pr-2 pl-18" />}
    </li>
  );
}

"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CopyLink, readLinks } from "@/components/event-row";
import { NotionContent } from "@/components/notion-content";
import { plain } from "@/components/rich-text";
import { Icon } from "@/components/ui";
import { formatDay } from "@/lib/calendar";
import type { ContentBlock, RichText } from "@/lib/types";
import { openCalendarItem, type CalendarItemResult } from "./actions";

const dialogClass =
  "mx-0 mb-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-0 text-body shadow-2xl transition duration-200 ease-out backdrop:bg-ink/40 starting:translate-y-full sm:m-auto sm:max-w-xl sm:rounded-3xl sm:starting:translate-y-2 sm:starting:opacity-0";

type Opened = { id: string; title: string; session: number; result?: CalendarItemResult };

const OpenContext = createContext<(id: string, title: string) => void>(() => {});

/** Wraps the calendar so any milestone or event in it can open in a pop-up. */
export function CalendarItems({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const session = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const close = () => setOpened(null);

  function open(id: string, title: string) {
    const current = ++session.current;
    setOpened({ id, title, session: current });
    openCalendarItem(id)
      .catch((): CalendarItemResult => ({ error: "We couldn't load this. Please try again." }))
      // Ignore a slow answer for an item that has since been closed or swapped.
      .then((result) => setOpened((o) => (o?.session === current ? { ...o, result } : o)));
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (opened && !dialog.open) dialog.showModal();
    else if (!opened && dialog.open) dialog.close();
  }, [opened]);

  return (
    <OpenContext.Provider value={open}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="calendar-item-title"
        className={dialogClass}
        onClose={close}
        onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
        onClick={(e) => {
          if (pressedBackdrop.current && e.target === e.currentTarget) close();
        }}
      >
        {opened && <ItemSheet key={opened.session} opened={opened} onClose={close} />}
      </dialog>
    </OpenContext.Provider>
  );
}

/** A button that opens one milestone or event in the pop-up. */
export function OpenItem({ id, title, className, children }: { id: string; title: string; className?: string; children: ReactNode }) {
  const open = useContext(OpenContext);
  return (
    <button type="button" onClick={() => open(id, title)} aria-haspopup="dialog" className={className}>
      {children}
    </button>
  );
}

function ItemSheet({ opened, onClose }: { opened: Opened; onClose: () => void }) {
  const result = opened.result;
  const item = result && "item" in result ? result.item : null;
  const blocks = result && "blocks" in result ? result.blocks : [];
  const links = item?.links?.length ? readLinks(item.links) : [];
  const hasLinks = links.some((l) => l.links.length || l.notes.length);
  const empty = item !== null && blocks.length === 0 && !hasLinks;

  const when = item
    ? [
        formatDay(item.start, { weekday: "long", day: "numeric", month: "long" }),
        item.end && `until ${formatDay(item.end, { weekday: "long", day: "numeric", month: "long" })}`,
        item.time,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="p-6 sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {item && (
            <p className="mb-1.5 flex flex-wrap gap-1.5">
              {item.milestone && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-semibold text-brand">Milestone</span>}
              {item.event && <span className="rounded-full bg-ink-2 px-2 py-0.5 text-[11.5px] font-semibold text-white">Event</span>}
              {item.done && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11.5px] font-semibold text-success">Done</span>}
            </p>
          )}
          <h2 id="calendar-item-title" className="text-[22px] leading-snug font-bold tracking-[-0.02em] break-words text-ink">
            {item?.icon?.type === "emoji" && <span className="mr-2">{item.icon.value}</span>}
            {item?.title ?? opened.title}
          </h2>
          {when && <p className="mt-1 text-[14px] text-muted">{when}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-[22px] leading-none text-muted transition hover:bg-canvas hover:text-ink"
        >
          ×
        </button>
      </div>

      {!result ? (
        <div className="space-y-3" aria-label="Loading">
          {[100, 90, 70].map((w) => (
            <div key={w} className="h-4 animate-pulse rounded bg-canvas" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : "error" in result ? (
        <p className="rounded-xl bg-brand-soft px-4 py-3 text-[14px] text-brand">{result.error}</p>
      ) : empty ? (
        <p className="rounded-2xl bg-canvas px-5 py-8 text-center text-[17px] font-semibold tracking-wide text-muted ring-1 ring-line">TBC</p>
      ) : (
        <div className="space-y-5">
          {hasLinks && item?.links && <ClientLinks rich={item.links} />}
          {blocks.length > 0 && (
            <div>
              <CopyButton text={toPlainText(blocks)} />
              <div className="mt-4">
                <NotionContent blocks={blocks} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** "Client links" from Notion: each shows its full address with a copy button. Lines that aren't links are notes. */
function ClientLinks({ rich }: { rich: RichText[] }) {
  const lines = readLinks(rich);
  return (
    <section aria-label="Links" className="rounded-2xl bg-canvas p-4 ring-1 ring-line">
      <h3 className="mb-2.5 text-[13px] font-semibold text-muted">Links</h3>
      <ul className="space-y-2">
        {lines.flatMap((line) => line.links).map((link, i) => (
          <CopyLink key={`${link.href}-${i}`} href={link.href} label={link.label} />
        ))}
      </ul>
      {lines.flatMap((line) => line.notes).map((note, i) => (
        <p key={i} className="mt-2 text-[13.5px] text-muted">
          {note}
        </p>
      ))}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text can still be selected and copied by hand.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition ${
        copied ? "bg-success-soft text-success" : "bg-ink text-white hover:bg-ink-2"
      }`}
    >
      {copied ? <Icon.check className="size-4" strokeWidth={2} /> : null}
      {copied ? "Copied" : "Copy text"}
    </button>
  );
}

/** The page as plain text for pasting elsewhere: one line per block, lists keep their bullets and numbers. */
function toPlainText(blocks: ContentBlock[], depth = 0): string {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  let number = 0;
  for (const b of blocks) {
    number = b.type === "numbered_list_item" ? number + 1 : 0;
    switch (b.type) {
      case "bulleted_list_item":
        lines.push(`${indent}• ${plain(b.text)}`);
        break;
      case "numbered_list_item":
        lines.push(`${indent}${number}. ${plain(b.text)}`);
        break;
      case "to_do":
        lines.push(`${indent}${b.checked ? "☑" : "☐"} ${plain(b.text)}`);
        break;
      case "divider":
        lines.push("");
        break;
      case "image":
      case "media":
        lines.push(`${indent}${b.url}`);
        break;
      case "table":
        for (const row of b.rows) lines.push(indent + row.map(plain).join("\t"));
        break;
      case "translation":
      case "subpage":
        break; // translations have their own tab; sub-pages aren't part of this page
      default:
        lines.push(indent + plain(b.text));
    }
    if ("children" in b && b.children?.length) lines.push(toPlainText(b.children, depth + 1));
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

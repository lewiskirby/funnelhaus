"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui";

const dialogClass =
  "mx-0 mb-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-0 text-body shadow-2xl transition duration-200 ease-out backdrop:bg-ink/40 starting:translate-y-full sm:m-auto sm:max-w-3xl sm:rounded-3xl sm:starting:translate-y-2 sm:starting:opacity-0";

const TITLE = "🌐 Webinar presenting guide";

/**
 * A button that opens the Webinar presenting guide (from Notion) in a pop-up.
 * Shown on every webinar event. `compact` is the small version under an event on Home.
 */
export function WebinarGuide({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="group flex w-full cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-line transition hover:ring-brand/30"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-ink">{TITLE}</span>
            <span className="block text-[12px] text-muted">Read it before you go live</span>
          </span>
          <Icon.chevronRight className="size-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="group flex w-full cursor-pointer items-center gap-4 rounded-2xl bg-white p-4 text-left ring-1 ring-line transition hover:ring-brand/30"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-[20px]">🌐</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-brand">Read this before you go live</span>
            <span className="block text-[16px] font-bold tracking-[-0.01em] text-ink">Webinar presenting guide</span>
            <span className="block text-[13px] text-muted">How to prepare, present and close a webinar that sells.</span>
          </span>
          <Icon.chevronRight className="size-5 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand" />
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="webinar-guide-title"
        className={dialogClass}
        // Opened from inside the calendar pop-up: keep its events from reaching (and closing) that one.
        onClose={(e) => {
          e.stopPropagation();
          setOpen(false);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          pressedBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (pressedBackdrop.current && e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="p-6 sm:p-9">
          <div className="mb-6 flex items-start gap-3">
            <h2 id="webinar-guide-title" className="min-w-0 flex-1 text-[26px] leading-snug font-bold tracking-[-0.02em] text-ink">
              {TITLE}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="-mt-1 -mr-2 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[22px] leading-none text-muted transition hover:bg-canvas hover:text-ink"
            >
              ×
            </button>
          </div>
          {/* Rendered only while open, so the videos aren't loaded until they're needed. */}
          {open && children}
        </div>
      </dialog>
    </>
  );
}

/** The guide's body, or a note when Notion couldn't be reached. */
export function GuideUnavailable() {
  return <p className="text-[15px] text-muted">The guide couldn&apos;t be loaded just now. Please try again in a minute.</p>;
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui";

const dialogClass =
  "mx-0 mb-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-0 text-body shadow-2xl transition duration-200 ease-out backdrop:bg-ink/40 starting:translate-y-full sm:m-auto sm:max-w-3xl sm:rounded-3xl sm:starting:translate-y-2 sm:starting:opacity-0";

/** "Watch this first" banner that opens the Filming ads guide (rendered on the server from Notion) in a pop-up. */
export function FilmingGuide({ children }: { children: ReactNode }) {
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="group flex w-full cursor-pointer items-center gap-4 rounded-2xl bg-white p-4 text-left ring-1 ring-line transition hover:ring-brand/30 sm:p-5"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <svg viewBox="0 0 20 20" className="ml-0.5 size-5" fill="currentColor" aria-hidden="true">
            <path d="M6 4.5v11a.75.75 0 0 0 1.14.64l9-5.5a.75.75 0 0 0 0-1.28l-9-5.5A.75.75 0 0 0 6 4.5Z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold text-brand">Watch this first</span>
          <span className="block text-[17px] font-bold tracking-[-0.01em] text-ink">🎞️ Filming ads guide</span>
          <span className="block text-[13.5px] text-muted">How to film ads that perform. Read it before every filming session.</span>
        </span>
        <Icon.chevronRight className="size-5 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand" />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="filming-guide-title"
        className={dialogClass}
        onClose={() => setOpen(false)}
        onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
        onClick={(e) => {
          if (pressedBackdrop.current && e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="p-6 sm:p-9">
          <div className="mb-6 flex items-start gap-3">
            <h2 id="filming-guide-title" className="min-w-0 flex-1 text-[26px] leading-snug font-bold tracking-[-0.02em] text-ink">
              🎞️ Filming ads guide
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
          {/* Rendered only while open, so the video isn't loaded until it's needed. */}
          {open && children}
        </div>
      </dialog>
    </>
  );
}

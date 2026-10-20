"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";

const dialogClass =
  "mx-0 mb-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-0 text-body shadow-2xl transition duration-200 ease-out backdrop:bg-ink/40 starting:translate-y-full sm:m-auto sm:max-w-2xl sm:rounded-3xl sm:starting:translate-y-2 sm:starting:opacity-0";

/** "Open full script" button: the script on its own (no filming or editing notes), with a copy button. */
export function FullScript({ name, lines }: { name: string; lines: string[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the script can still be selected and copied by hand.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink ring-1 ring-line transition hover:ring-brand/30"
      >
        <svg viewBox="0 0 20 20" className="size-4 text-faint" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
          <path d="M5 3h7l3 3v11H5z" strokeLinejoin="round" />
          <path d="M8 9h4M8 12h4" strokeLinecap="round" />
        </svg>
        Open full script
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="full-script-title"
        className={dialogClass}
        onClose={() => setOpen(false)}
        onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
        onClick={(e) => {
          if (pressedBackdrop.current && e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="p-6 sm:p-8">
          <div className="mb-5 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-muted">Full script</p>
              <h2 id="full-script-title" className="text-[22px] leading-snug font-bold tracking-[-0.02em] break-words text-ink">
                {name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="-mt-1 -mr-2 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[22px] leading-none text-muted transition hover:bg-canvas hover:text-ink"
            >
              ×
            </button>
          </div>

          <button
            type="button"
            onClick={copy}
            className={`flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition ${
              copied ? "bg-success-soft text-success" : "bg-ink text-white hover:bg-ink-2"
            }`}
          >
            {copied && <Icon.check className="size-4" strokeWidth={2} />}
            {copied ? "Copied" : "Copy to clipboard"}
          </button>

          <div className="mt-5 space-y-3 rounded-2xl bg-canvas p-5 text-[16px] leading-relaxed text-ink ring-1 ring-line select-text">
            {lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}

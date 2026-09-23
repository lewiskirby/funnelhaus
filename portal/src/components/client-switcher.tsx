"use client";

import { useEffect, useRef, useState } from "react";
import { switchClient } from "@/app/(portal)/admin-actions";
import { ClientAvatar, Icon } from "@/components/ui";
import type { Client } from "@/lib/types";

type Option = Pick<Client, "id" | "name" | "icon" | "status">;

/** Admin-only: shows the client being viewed and lets you switch to another. */
export function ClientSwitcher({ current, clients, compact = false }: { current: Option; clients: Option[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-2xl bg-white text-left ring-1 ring-line transition hover:ring-faint ${compact ? "p-1.5 pr-3" : "p-3"}`}
      >
        <ClientAvatar client={current} className={compact ? "size-7 rounded-lg" : "size-10 rounded-xl"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{current.name}</span>
          {!compact && <span className="block text-[11.5px] font-medium text-brand">Admin view</span>}
        </span>
        <Icon.chevronRight className={`size-4 shrink-0 text-muted transition ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Switch client"
          className={`absolute z-40 mt-2 max-h-80 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-line ${compact ? "left-0 w-64" : "inset-x-0"}`}
        >
          <p className="px-3 pt-2 pb-1.5 text-[12px] font-medium text-muted">Switch client</p>
          {clients.map((c) => (
            <form key={c.id} action={switchClient}>
              <input type="hidden" name="clientId" value={c.id} />
              <button
                role="option"
                aria-selected={c.id === current.id}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-canvas ${c.id === current.id ? "bg-canvas" : ""}`}
              >
                <ClientAvatar client={c} className="size-7 rounded-lg" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{c.name}</span>
                {c.status === "Inactive" && <span className="text-[11.5px] text-faint">Inactive</span>}
                {c.id === current.id && <Icon.check className="size-4 text-brand" strokeWidth={2} />}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

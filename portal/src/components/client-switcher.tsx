"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { switchClient } from "@/app/(portal)/admin-actions";
import { ClientAvatar, Icon } from "@/components/ui";
import type { Client } from "@/lib/types";

type Option = Pick<Client, "id" | "name" | "icon" | "status">;

function Spinner({ className = "size-4" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden="true" />;
}

/** Admin-only: shows the client being viewed and lets you switch to another. */
export function ClientSwitcher({ current, clients, compact = false }: { current: Option; clients: Option[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Option | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const switching = pending && target;

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

  function choose(client: Option) {
    setOpen(false);
    if (client.id === current.id) return;
    setTarget(client);
    const data = new FormData();
    data.set("clientId", client.id);
    startTransition(() => switchClient(data));
  }

  const shown = switching ? target : current;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={Boolean(switching)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-2xl bg-white text-left ring-1 ring-line transition hover:ring-faint disabled:cursor-wait ${compact ? "p-1.5 pr-3" : "p-3"}`}
      >
        <ClientAvatar client={shown} className={compact ? "size-7 rounded-lg" : "size-10 rounded-xl"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{shown.name}</span>
          {!compact && (
            <span className="block text-[11.5px] font-medium text-brand">{switching ? "Switching…" : "Admin view"}</span>
          )}
        </span>
        {switching ? (
          <Spinner className="size-4 text-brand" />
        ) : (
          <Icon.chevronRight className={`size-4 shrink-0 text-muted transition ${open ? "-rotate-90" : "rotate-90"}`} />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Switch client"
          className={`absolute z-40 mt-2 max-h-80 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-line ${compact ? "left-0 w-64" : "inset-x-0"}`}
        >
          <p className="px-3 pt-2 pb-1.5 text-[12px] font-medium text-muted">Switch client</p>
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.id === current.id}
              onClick={() => choose(c)}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-canvas ${c.id === current.id ? "bg-canvas" : ""}`}
            >
              <ClientAvatar client={c} className="size-7 rounded-lg" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{c.name}</span>
              {c.status === "Inactive" && <span className="text-[11.5px] text-faint">Inactive</span>}
              {c.id === current.id && <Icon.check className="size-4 text-brand" strokeWidth={2} />}
            </button>
          ))}
        </div>
      )}

      {/* Whole-page cover while the new client's portal loads */}
      {switching && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 backdrop-blur-[2px]" role="status" aria-live="polite">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-line">
            <ClientAvatar client={target} className="size-8 rounded-lg" />
            <span className="text-[14.5px] font-medium text-ink">Switching to {target.name}…</span>
            <Spinner className="size-4 text-brand" />
          </div>
        </div>
      )}
    </div>
  );
}

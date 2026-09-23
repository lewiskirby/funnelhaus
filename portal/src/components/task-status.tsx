"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { changeTaskStatus } from "@/app/(portal)/tasks/[id]/actions";
import { Icon, StatusDot } from "@/components/ui";
import type { TaskStatus } from "@/lib/types";

/** Updates the status straight away on screen; reverts if Notion rejects it. */
function useTaskStatus(taskId: string, status: TaskStatus) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function change(next: TaskStatus) {
    if (next === optimistic) return;
    setError(undefined);
    startTransition(async () => {
      setOptimistic(next);
      const result = await changeTaskStatus(taskId, next);
      if (result.error) setError(result.error);
    });
  }
  return { status: optimistic, change, pending, error };
}

// ── Lists: one click toggles complete ───────────────

export function StatusToggle({ taskId, status: initial, name }: { taskId: string; status: TaskStatus; name: string }) {
  const { status, change, pending } = useTaskStatus(taskId, initial);
  const done = status === "Complete";
  return (
    <button
      type="button"
      onClick={() => change(done ? "Not Started" : "Complete")}
      aria-label={done ? `Mark "${name}" as not started` : `Mark "${name}" as complete`}
      aria-pressed={done}
      className={`-m-1.5 shrink-0 rounded-full p-1.5 transition hover:bg-brand-soft ${pending ? "opacity-60" : ""}`}
    >
      <StatusDot status={status} />
    </button>
  );
}

// ── Task page: circle picker + full-width status banner ──

const OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "Not Started", label: "Not started" },
  { value: "In Progress", label: "In progress" },
  { value: "Complete", label: "Complete" },
];

const BANNER: Record<TaskStatus, { className: string; text: string }> = {
  "Not Started": { className: "bg-canvas text-muted", text: "Not started" },
  "In Progress": { className: "bg-warn-soft text-warn", text: "In progress" },
  Complete: { className: "bg-success-soft text-success", text: "Complete" },
};

export function TaskHeader({ taskId, status: initial, name, icon }: { taskId: string; status: TaskStatus; name: string; icon?: string }) {
  const { status, change, pending, error } = useTaskStatus(taskId, initial);
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

  const banner = BANNER[status];

  return (
    <>
      <div className={`flex items-center justify-between gap-3 px-7 py-3 text-[13.5px] font-semibold sm:px-10 ${banner.className}`} role="status">
        <span className="flex items-center gap-2">
          {status === "Complete" && <Icon.check className="size-4" strokeWidth={2.2} />}
          {banner.text}
        </span>
        <span className="text-[12.5px] font-medium opacity-70">{pending ? "Saving…" : "Tap the circle to update"}</span>
      </div>

      <header className="border-b border-line p-7 sm:p-10">
        {icon && <p className="mb-4 pl-12 text-[40px] leading-none">{icon}</p>}
        <div className="flex items-start gap-4">
          <div ref={ref} className="relative mt-1 shrink-0">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`Status: ${banner.text}. Change status`}
              className="-m-1 rounded-full p-1 transition hover:bg-brand-soft"
            >
              <StatusDot status={status} size="lg" />
            </button>
            {open && (
              <div role="listbox" aria-label="Task status" className="absolute top-full left-0 z-30 mt-2 w-48 rounded-2xl bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-line">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={o.value === status}
                    onClick={() => {
                      setOpen(false);
                      change(o.value);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] font-medium text-ink transition hover:bg-canvas ${o.value === status ? "bg-canvas" : ""}`}
                  >
                    <StatusDot status={o.value} />
                    <span className="flex-1">{o.label}</span>
                    {o.value === status && <Icon.check className="size-4 text-brand" strokeWidth={2} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <h1 className={`text-[30px] leading-tight font-bold tracking-[-0.03em] sm:text-[36px] ${status === "Complete" ? "text-muted" : "text-ink"}`}>{name}</h1>
        </div>
        {error && (
          <p role="alert" className="mt-4 pl-12 text-[13.5px] font-medium text-brand">
            {error}
          </p>
        )}
      </header>
    </>
  );
}

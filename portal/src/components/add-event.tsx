"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addEvent } from "@/app/(portal)/actions";

/** "2026-10-01" + "19:00" → "2026-10-01T19:00:00+02:00" using the viewer's own time zone. */
function toStart(date: string, time: string) {
  if (!date || !time) return date;
  const offset = -new Date(`${date}T${time}`).getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  return `${date}T${time}:00${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

const inputClass =
  "block w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[14.5px] text-ink outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10";

// Bottom sheet on phones, centred dialog from sm up.
const dialogClass =
  "mx-0 mb-0 mt-auto w-full max-w-none rounded-t-3xl bg-card p-0 text-body shadow-2xl transition duration-200 ease-out backdrop:bg-ink/40 starting:translate-y-full sm:m-auto sm:max-w-md sm:rounded-3xl sm:starting:translate-y-2 sm:starting:opacity-0";

export function AddEvent({ maxName }: { maxName: number }) {
  const [open, setOpen] = useState(false);
  // Remounts the form on every open so fields and errors start fresh.
  const [session, setSession] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("#event-name")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSession((s) => s + 1);
          setOpen(true);
        }}
        className="mt-5 w-full rounded-xl border border-dashed border-line py-2.5 text-[13.5px] font-medium text-muted transition hover:border-brand/40 hover:text-brand"
      >
        + Add event
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="add-event-title"
        className={dialogClass}
        // Escape closes the dialog natively; keep state in step.
        onClose={() => setOpen(false)}
        // Only close on a tap that starts and ends on the backdrop, not a drag out of an input.
        onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
        onClick={(e) => {
          if (pressedBackdrop.current && e.target === e.currentTarget) setOpen(false);
        }}
      >
        {open && <AddEventForm key={session} maxName={maxName} onDone={() => setOpen(false)} />}
      </dialog>
    </>
  );
}

function AddEventForm({ maxName, onDone }: { maxName: number; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof addEvent>[0], formData: FormData) => {
    const result = await addEvent(prev, formData);
    if (!result?.error) onDone();
    return result;
  }, undefined);

  const today = new Date().toLocaleDateString("en-CA");

  return (
    <form action={action} className="space-y-4 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
      <span aria-hidden="true" className="mx-auto -mt-1.5 mb-1 block h-1 w-10 rounded-full bg-line sm:hidden" />
      <h2 id="add-event-title" className="text-[17px] font-semibold text-ink">
        Add an event
      </h2>
      <input type="hidden" name="start" value={toStart(date, time)} />
      <div>
        <label htmlFor="event-name" className="mb-1.5 block text-[12.5px] font-medium text-muted">
          Event name
        </label>
        <input id="event-name" name="name" required maxLength={maxName} placeholder="e.g. Webinar" className={inputClass} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-2.5">
        <div>
          <label htmlFor="event-date" className="mb-1.5 block text-[12.5px] font-medium text-muted">
            Date
          </label>
          <input id="event-date" type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="event-time" className="mb-1.5 block text-[12.5px] font-medium text-muted">
            Time <span className="text-faint">(optional)</span>
          </label>
          <input id="event-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </div>
      </div>
      {state?.error && (
        <p role="alert" className="text-[13px] font-medium text-brand">
          {state.error}
        </p>
      )}
      <div className="flex gap-2 pt-1 sm:justify-end">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-full px-4 py-2.5 text-[13.5px] font-medium text-muted ring-1 ring-line hover:text-ink sm:flex-none sm:py-2 sm:ring-0"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60 sm:flex-none sm:py-2"
        >
          {pending ? "Adding…" : "Add event"}
        </button>
      </div>
    </form>
  );
}

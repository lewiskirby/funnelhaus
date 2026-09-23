"use client";

import { useActionState, useState } from "react";
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

export function AddEvent({ maxName }: { maxName: number }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof addEvent>[0], formData: FormData) => {
    const result = await addEvent(prev, formData);
    if (!result?.error) {
      setOpen(false);
      setDate("");
      setTime("");
    }
    return result;
  }, undefined);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 w-full rounded-xl border border-dashed border-line py-2.5 text-[13.5px] font-medium text-muted transition hover:border-brand/40 hover:text-brand"
      >
        + Add event
      </button>
    );
  }

  const today = new Date().toLocaleDateString("en-CA");

  return (
    <form action={action} className="mt-5 space-y-3 rounded-2xl bg-canvas p-4 ring-1 ring-line">
      <input type="hidden" name="start" value={toStart(date, time)} />
      <div>
        <label htmlFor="event-name" className="mb-1.5 block text-[12.5px] font-medium text-muted">
          Event name
        </label>
        <input id="event-name" name="name" required maxLength={maxName} autoFocus placeholder="e.g. Webinar" className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
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
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-[13.5px] font-medium text-muted hover:text-ink">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-4 py-2 text-[13.5px] font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add event"}
        </button>
      </div>
    </form>
  );
}

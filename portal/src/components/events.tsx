"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { removeEvent, saveEvent } from "@/app/(portal)/actions";
import { EventRow } from "@/components/event-row";
import type { ClientEvent } from "@/lib/types";

/** "2026-10-01" + "19:00" → "2026-10-01T19:00:00+02:00" using the viewer's own time zone. */
function toStart(date: string, time: string) {
  if (!date || !time) return date;
  const offset = -new Date(`${date}T${time}`).getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  return `${date}T${time}:00${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

/** An event's date and time as the viewer's own local date and time inputs. */
function toInputs(event?: ClientEvent) {
  if (!event) return { date: "", time: "" };
  if (event.allDay) return { date: event.start.slice(0, 10), time: "" };
  const d = new Date(event.start);
  return { date: d.toLocaleDateString("en-CA"), time: d.toTimeString().slice(0, 5) };
}

// 16px text on phones: iOS zooms the whole page into any smaller text box.
const inputClass =
  "block min-h-12 w-full appearance-none rounded-xl border border-line bg-white px-3.5 py-3 text-left text-[16px] text-ink outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10 sm:min-h-11 sm:py-2.5 sm:text-[14.5px] [&::-webkit-date-and-time-value]:min-h-[1.5em] [&::-webkit-date-and-time-value]:text-left";
const labelClass = "mb-1.5 block text-[13px] font-medium text-muted";

// Bottom sheet on phones, centred dialog from sm up. Scrolls if the keyboard leaves too little room.
const dialogClass =
  "mx-0 mb-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl bg-card p-0 text-body shadow-2xl transition duration-200 ease-out backdrop:bg-ink/40 starting:translate-y-full sm:m-auto sm:max-w-md sm:rounded-3xl sm:starting:translate-y-2 sm:starting:opacity-0";

type Sheet = { event?: ClientEvent; session: number };

/** The "Coming up" list: tap an event to edit or delete it, or add a new one. */
export function Events({ events, maxName }: { events: ClientEvent[]; maxName: number }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const session = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const open = (event?: ClientEvent) => setSheet({ event, session: ++session.current });
  const close = () => setSheet(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (sheet && !dialog.open) {
      dialog.showModal();
      // Only jump into the name field with a mouse; on phones the keyboard would cover the sheet at once.
      if (!sheet.event && window.matchMedia("(pointer: fine)").matches) dialog.querySelector<HTMLInputElement>("#event-name")?.focus();
    } else if (!sheet && dialog.open) {
      dialog.close();
    }
  }, [sheet]);

  return (
    <>
      {events.length === 0 ? (
        <p className="text-[14px] text-muted">No upcoming dates yet.</p>
      ) : (
        <ol className="space-y-3">
          {events.map((e) => (
            <EventRow key={e.id} event={e} onEdit={e.editable ? () => open(e) : undefined} />
          ))}
        </ol>
      )}

      <button
        type="button"
        onClick={() => open()}
        className="mt-5 min-h-11 w-full rounded-xl border border-dashed border-line py-2.5 text-[14px] font-medium text-muted transition hover:border-brand/40 hover:text-brand"
      >
        + Add event
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="event-sheet-title"
        className={dialogClass}
        // Escape closes the dialog natively; keep state in step.
        onClose={close}
        // Only close on a tap that starts and ends on the backdrop, not a drag out of an input.
        onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
        onClick={(e) => {
          if (pressedBackdrop.current && e.target === e.currentTarget) close();
        }}
      >
        {sheet && <EventForm key={sheet.session} event={sheet.event} maxName={maxName} onDone={close} />}
      </dialog>
    </>
  );
}

function EventForm({ event, maxName, onDone }: { event?: ClientEvent; maxName: number; onDone: () => void }) {
  const initial = toInputs(event);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [deleting, startDelete] = useTransition();
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof saveEvent>[0], formData: FormData) => {
    const result = await saveEvent(prev, formData);
    if (!result?.error) onDone();
    return result;
  }, undefined);

  const today = new Date().toLocaleDateString("en-CA");
  const busy = pending || deleting;

  function remove() {
    if (!event) return;
    setDeleteError(undefined);
    startDelete(async () => {
      const result = await removeEvent(event.id);
      if (result.error) setDeleteError(result.error);
      else onDone();
    });
  }

  return (
    <form action={action} className="space-y-4 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
      <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-10 rounded-full bg-line sm:hidden" />
      <div className="flex items-center justify-between gap-3">
        <h2 id="event-sheet-title" className="text-[18px] font-semibold text-ink">
          {event ? "Edit event" : "Add an event"}
        </h2>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close"
          className="-mr-1.5 flex size-10 items-center justify-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      {event && <input type="hidden" name="id" value={event.id} />}
      <input type="hidden" name="start" value={toStart(date, time)} />

      <div>
        <label htmlFor="event-name" className={labelClass}>
          Event name
        </label>
        <input
          id="event-name"
          name="name"
          required
          maxLength={maxName}
          defaultValue={event?.name}
          placeholder="e.g. Webinar"
          autoComplete="off"
          enterKeyHint="next"
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
        <div>
          <label htmlFor="event-date" className={labelClass}>
            Date
          </label>
          <input
            id="event-date"
            type="date"
            required
            min={event && initial.date < today ? initial.date : today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="event-time" className="text-[13px] font-medium text-muted">
              Time <span className="text-faint">(optional)</span>
            </label>
            {time && (
              <button type="button" onClick={() => setTime("")} className="text-[12.5px] font-medium text-brand">
                All day
              </button>
            )}
          </div>
          <input id="event-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </div>
      </div>

      {(state?.error || deleteError) && (
        <p role="alert" className="text-[13.5px] font-medium text-brand">
          {state?.error ?? deleteError}
        </p>
      )}

      {confirmDelete ? (
        <div className="space-y-3 rounded-2xl bg-brand-soft p-4">
          <p className="text-[14px] font-medium text-ink">Delete “{event?.name}”?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="min-h-11 flex-1 rounded-full bg-white px-4 text-[14px] font-medium text-ink ring-1 ring-line"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="min-h-11 flex-1 rounded-full bg-brand px-4 text-[14px] font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center">
          {event && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="min-h-11 rounded-full px-4 text-[14px] font-medium text-brand hover:bg-brand-soft sm:mr-auto sm:min-h-10 sm:px-3"
            >
              Delete event
            </button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={onDone}
              className="min-h-12 flex-1 rounded-full px-4 text-[14px] font-medium text-muted ring-1 ring-line hover:text-ink sm:min-h-10 sm:flex-none sm:ring-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-12 flex-1 rounded-full bg-brand px-5 text-[14px] font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60 sm:min-h-10 sm:flex-none"
            >
              {pending ? "Saving…" : event ? "Save changes" : "Add event"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

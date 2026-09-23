"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/ui";
import { setTaskResponse } from "./actions";

export function ResponseForm({ taskId, initial, max }: { taskId: string; initial?: string; max: number }) {
  const [state, action, pending] = useActionState(setTaskResponse, undefined);
  const [value, setValue] = useState(initial ?? "");
  const dirty = value.trim() !== (initial ?? "").trim();

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="taskId" value={taskId} />
      <label htmlFor="response" className="block text-[13px] font-semibold text-muted">
        Your response
      </label>
      <textarea
        id="response"
        name="response"
        rows={5}
        maxLength={max}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add links, answers or notes for the FunnelHaus team…"
        className="block w-full resize-y rounded-2xl border border-line bg-white px-4 py-3.5 text-[15px] leading-relaxed text-ink outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12.5px] text-faint">
          {value.length}/{max}
        </span>
        <div className="flex items-center gap-3">
          {state?.saved && !dirty && (
            <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-success">
              <Icon.check className="size-4" strokeWidth={2} /> Saved
            </span>
          )}
          <button
            type="submit"
            disabled={pending || !dirty}
            className="rounded-full bg-brand px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save response"}
          </button>
        </div>
      </div>
      {state?.error && (
        <p role="alert" className="text-[13.5px] font-medium text-brand">
          {state.error}
        </p>
      )}
    </form>
  );
}

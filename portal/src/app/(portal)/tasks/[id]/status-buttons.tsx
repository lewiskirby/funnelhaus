"use client";

import { useActionState } from "react";
import { Icon } from "@/components/ui";
import type { TaskStatus } from "@/lib/types";
import { setTaskStatus } from "./actions";

export function StatusButtons({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const [state, action, pending] = useActionState(setTaskStatus, undefined);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="taskId" value={taskId} />
      <div className="flex flex-wrap gap-2.5">
        {status === "Complete" ? (
          <button
            name="status"
            value="Not Started"
            disabled={pending}
            className="rounded-full bg-white px-5 py-3 text-[14px] font-semibold text-ink ring-1 ring-line transition hover:ring-faint disabled:opacity-60"
          >
            Reopen task
          </button>
        ) : (
          <>
            <button
              name="status"
              value="Complete"
              disabled={pending}
              className="flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-black disabled:opacity-60"
            >
              <Icon.check className="size-4" strokeWidth={2.2} />
              {pending ? "Saving…" : "Mark complete"}
            </button>
            {status === "Not Started" && (
              <button
                name="status"
                value="In Progress"
                disabled={pending}
                className="rounded-full bg-white px-5 py-3 text-[14px] font-semibold text-ink ring-1 ring-line transition hover:ring-faint disabled:opacity-60"
              >
                Mark in progress
              </button>
            )}
          </>
        )}
      </div>
      {state?.error && (
        <p role="alert" className="text-[13.5px] font-medium text-brand">
          {state.error}
        </p>
      )}
    </form>
  );
}

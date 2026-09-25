"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { addTeamMemberAction, addTeammateAction, removeTeamMemberAction, removeTeammateAction } from "./actions";

// 16px text on phones so iOS doesn't zoom in.
const inputClass =
  "block min-h-12 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-[16px] text-ink outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10 sm:min-h-11 sm:py-2.5 sm:text-[14.5px]";

/** `staff`: adds to the FunnelHaus team instead of this client's team. */
export function AddTeammate({ maxName, staff = false }: { maxName: number; staff?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(staff ? addTeamMemberAction : addTeammateAction, undefined);
  const id = staff ? "staff" : "teammate";

  // Clear the form once someone has been added.
  useEffect(() => {
    if (state?.added) formRef.current?.reset();
  }, [state?.added]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
        <div>
          <label htmlFor={`${id}-name`} className="mb-1.5 block text-[13px] font-medium text-muted">
            Name
          </label>
          <input id={`${id}-name`} name="name" required maxLength={maxName} autoComplete="off" placeholder="e.g. Alex Smith" className={inputClass} />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className="mb-1.5 block text-[13px] font-medium text-muted">
            Email
          </label>
          <input id={`${id}-email`} name="email" type="email" required autoComplete="off" placeholder={staff ? "alex@funnelhaus.co" : "alex@yourbusiness.com"} className={inputClass} />
        </div>
      </div>
      {state?.error && (
        <p role="alert" className="text-[13.5px] font-medium text-brand">
          {state.error}
        </p>
      )}
      {state?.added && !pending && (
        <p role="status" className="text-[13.5px] font-medium text-success">
          Added. They&apos;ll get an email with how to sign in.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-full bg-brand px-6 text-[14.5px] font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60 sm:min-h-10 sm:w-auto"
      >
        {pending ? "Adding…" : staff ? "Add team member" : "Add teammate"}
      </button>
    </form>
  );
}

export function RemoveTeammate({ userId, name, staff = false }: { userId: string; name: string; staff?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="shrink-0 rounded-full px-3 py-2 text-[13px] font-medium text-muted transition hover:bg-brand-soft hover:text-brand"
      >
        Remove
      </button>
    );
  }
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-full px-3 py-2 text-[13px] font-medium text-muted hover:text-ink"
        >
          Keep
        </button>
        <button
          type="button"
          aria-label={`Remove ${name}`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await (staff ? removeTeamMemberAction : removeTeammateAction)(userId);
              if (result.error) setError(result.error);
            })
          }
          className="rounded-full bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Removing…" : "Remove"}
        </button>
      </div>
      {error && <p className="text-[12.5px] font-medium text-brand">{error}</p>}
    </div>
  );
}

const noopSubscribe = () => () => {};

// Today's day number: stays the same all day, so React sees a stable value.
const today = () => Math.floor(Date.now() / 86_400_000);

/** "Signed in 3 days ago", worked out in the viewer's browser so it's never stale. */
export function SignedIn({ at }: { at?: string }) {
  const day = useSyncExternalStore(noopSubscribe, today, () => 0);
  if (!at) return <>Not signed in yet</>;
  if (!day) return <>Signed in</>;
  const days = day - Math.floor(Date.parse(at) / 86_400_000);
  return <>{days <= 0 ? "Signed in today" : days === 1 ? "Signed in yesterday" : `Signed in ${days} days ago`}</>;
}

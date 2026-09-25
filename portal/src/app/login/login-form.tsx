"use client";

import { useActionState, useRef, useState } from "react";
import { login, type LoginState } from "./actions";
import { Icon } from "@/components/ui";

// 16px text on phones so iOS doesn't zoom in.
const inputClass =
  "block w-full rounded-xl border border-line bg-white px-4 py-3.5 text-[16px] text-ink shadow-[0_1px_0_rgba(0,0,0,0.02)] outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10 sm:text-[15px]";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  // Lets "Use a different email" go back without a round trip.
  const [editingEmail, setEditingEmail] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const shown: LoginState = editingEmail ? { step: "email", email: state?.email } : state;
  const step = shown?.step ?? "email";

  return (
    <form
      ref={formRef}
      action={(data) => {
        setEditingEmail(false);
        return action(data);
      }}
      className="space-y-5"
    >
      <input type="hidden" name="step" value={step} />

      {step === "email" ? (
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-ink">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            defaultValue={shown?.email}
            placeholder="you@yourbusiness.com"
            aria-invalid={Boolean(shown?.error)}
            aria-describedby={shown?.error ? "login-error" : undefined}
            className={inputClass}
          />
        </div>
      ) : (
        <>
          <input type="hidden" name="email" value={shown?.email ?? ""} />
          <div className="rounded-xl bg-canvas px-4 py-3.5 text-[14px] leading-relaxed text-muted ring-1 ring-line">
            {shown?.resent ? "We've sent a new code to " : "We've sent a 6-digit code to "}
            <strong className="font-semibold text-ink">{shown?.email}</strong> if it has access to the portal. It can take a minute, so
            check your spam folder too.
          </div>
          <div>
            <label htmlFor="code" className="mb-2 block text-sm font-medium text-ink">
              Sign-in code
            </label>
            <input
              key={shown?.resent ? "resent" : "first"}
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              autoFocus
              placeholder="123456"
              aria-invalid={Boolean(shown?.error)}
              aria-describedby={shown?.error ? "login-error" : undefined}
              // Signs in as soon as all six digits are there (typed, pasted or autofilled).
              onChange={(e) => {
                if (e.target.value.replace(/\D/g, "").length === 6 && !pending) formRef.current?.requestSubmit();
              }}
              className={`${inputClass} text-center font-semibold tracking-[0.5em] tabular-nums sm:text-[20px]`}
            />
          </div>
        </>
      )}

      {shown?.error && (
        <p id="login-error" role="alert" className="rounded-xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand">
          {shown.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="group flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? (step === "email" ? "Sending code…" : "Signing in…") : step === "email" ? "Email me a code" : "Sign in"}
        {!pending && <Icon.arrowRight className="size-4 transition group-hover:translate-x-0.5" />}
      </button>

      {step === "code" && (
        <div className="flex items-center justify-between text-[13.5px]">
          <button type="button" onClick={() => setEditingEmail(true)} className="font-medium text-muted hover:text-ink">
            Use a different email
          </button>
          <button type="submit" name="resend" value="1" formNoValidate disabled={pending} className="font-semibold text-brand hover:underline">
            Resend code
          </button>
        </div>
      )}
    </form>
  );
}

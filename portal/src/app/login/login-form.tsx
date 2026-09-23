"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Icon } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-5">
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
          defaultValue={state?.email}
          placeholder="you@yourbusiness.com"
          aria-invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? "login-error" : undefined}
          className="block w-full rounded-xl border border-line bg-white px-4 py-3.5 text-[15px] text-ink shadow-[0_1px_0_rgba(0,0,0,0.02)] outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state?.error)}
          className="block w-full rounded-xl border border-line bg-white px-4 py-3.5 text-[15px] text-ink shadow-[0_1px_0_rgba(0,0,0,0.02)] outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10"
        />
      </div>

      {state?.error && (
        <p id="login-error" role="alert" className="rounded-xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="group flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Signing in…" : "Sign in"}
        {!pending && <Icon.arrowRight className="size-4 transition group-hover:translate-x-0.5" />}
      </button>
    </form>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/ui";
import { getSessionClient } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSessionClient()) redirect("/");

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-ink-2 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-40 -bottom-40 size-[560px] rounded-full bg-brand/40 blur-[120px]" />
        <div className="pointer-events-none absolute -top-24 -left-24 size-[320px] rounded-full bg-brand/20 blur-[100px]" />

        <div className="relative flex items-center gap-3">
          <LogoMark className="h-8 w-auto" color="#ffffff" />
          <span className="text-lg font-bold tracking-tight">FunnelHaus</span>
        </div>

        <div className="relative mx-auto max-w-md">
          <p className="mb-5 text-[13px] font-semibold text-white/40">Client portal</p>
          <h1 className="text-[44px] leading-[1.05] font-bold tracking-[-0.03em]">
            Everything about your growth, in one place.
          </h1>
          <p className="mt-6 text-[17px] leading-relaxed text-white/55">
            See what we&apos;re working on, what we need from you, and how your campaigns are performing.
          </p>
        </div>

        <p className="relative text-sm text-white/30">© {new Date().getFullYear()} FunnelHaus</p>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <LogoMark className="h-7 w-auto" />
            <span className="text-lg font-bold tracking-tight text-ink">FunnelHaus</span>
          </div>

          <h2 className="text-[32px] font-bold tracking-[-0.03em] text-ink">Welcome back</h2>
          <p className="mt-2 mb-9 text-[15px] text-muted">Sign in with the email and password we sent you.</p>

          <LoginForm />

          <p className="mt-8 text-sm text-muted">
            Trouble signing in?{" "}
            <a href="mailto:info@funnelhaus.co" className="font-semibold text-brand underline decoration-brand/20 underline-offset-4 hover:decoration-brand">
              Email us
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}

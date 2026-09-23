import type { Metadata } from "next";
import { requireClient } from "@/lib/session";

export const metadata: Metadata = { title: "Results" };

// Placeholder tiles shown blurred behind the "coming soon" card.
const PREVIEW_KPIS = [
  "Revenue",
  "Ad spend",
  "ROAS",
  "Registrations",
  "Cost per registration",
  "Attendance rate",
  "Calls booked",
  "Close rate",
];

export default async function ResultsPage() {
  await requireClient();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Performance</h1>
        <p className="mt-2 text-[15px] text-muted">Your campaign results, updated as they come in.</p>
      </header>

      <section className="relative overflow-hidden rounded-[28px] border border-line bg-white">
        {/* Blurred preview of the future dashboard */}
        <div aria-hidden="true" className="pointer-events-none grid grid-cols-2 gap-4 p-6 opacity-60 blur-[6px] select-none sm:p-8 lg:grid-cols-4">
          {PREVIEW_KPIS.map((kpi, i) => (
            <div key={kpi} className="rounded-2xl bg-canvas p-5 ring-1 ring-line">
              <p className="text-[12px] text-muted">{kpi}</p>
              <p className="mt-2 text-[26px] font-bold tracking-tight text-ink">{["€48.2k", "€9.1k", "5.3×", "1,284", "€7.09", "41%", "96", "22%"][i]}</p>
              <div className="mt-4 flex h-8 items-end gap-1">
                {[40, 55, 35, 70, 60, 85, 75].map((h, j) => (
                  <span key={j} className="flex-1 rounded-sm bg-brand/25" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          ))}
          <div className="col-span-2 h-56 rounded-2xl bg-canvas ring-1 ring-line lg:col-span-4" />
        </div>

        {/* Coming soon card */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/40 via-white/70 to-white/90 p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex size-24 animate-[float_4s_ease-in-out_infinite] items-center justify-center rounded-[28px] bg-white text-[52px] shadow-[0_20px_50px_-12px_rgba(112,0,0,0.25)] ring-1 ring-line">
              🚀
            </div>
            <p className="mb-3 inline-flex rounded-full bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand">
              Coming soon
            </p>
            <h2 className="text-[28px] leading-tight font-bold tracking-[-0.03em] text-ink">Your performance dashboard is on its way</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Revenue, ad spend, ROAS, registrations and calls booked, all in one live view. We&apos;ll let you know the moment it&apos;s ready.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

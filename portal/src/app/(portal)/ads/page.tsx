import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { AD_COLUMNS, clientTurnAds, columnFor, dueLabel } from "@/lib/ads";
import { getClientAds } from "@/lib/data";
import { requireClient } from "@/lib/session";
import type { AdCreative } from "@/lib/types";
import { BoardScroller } from "./board-scroller";

export const metadata: Metadata = { title: "Ad creatives" };

const TONE = {
  overdue: "bg-brand-soft text-brand",
  soon: "bg-warn-soft text-warn",
  later: "bg-canvas text-muted ring-1 ring-line",
} as const;

export default async function AdsPage() {
  const client = await requireClient();
  const ads = await getClientAds(client.id);

  if (ads.length === 0) return <ComingSoon />;

  const yourTurn = clientTurnAds(ads);
  const focus = yourTurn[0]?.stage;
  const toReview = yourTurn.filter((a) => a.stage === "review").length;
  const toFilm = yourTurn.filter((a) => a.stage === "film").length;
  const needs = [toReview && `review ${toReview} script${toReview === 1 ? "" : "s"}`, toFilm && `film ${toFilm} ad${toFilm === 1 ? "" : "s"}`].filter(Boolean);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Ad creatives</h1>
        <p className="mt-2 text-[15px] text-muted">Every ad we&apos;re making for you, from script to live. Tap an ad to see the script.</p>
      </header>

      {yourTurn.length > 0 ? (
        <section className="flex items-start gap-3.5 rounded-2xl bg-ink-2 px-5 py-4 text-white sm:px-6">
          <span className="text-xl leading-6">🪄</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">
              {yourTurn.length} ad{yourTurn.length === 1 ? " needs" : "s need"} you: {needs.join(" and ")}.
            </p>
            {yourTurn[0].due && <p className="mt-0.5 text-[13.5px] text-white/60">Next: {dueLabel(yourTurn[0].due).text}</p>}
          </div>
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl bg-success-soft px-5 py-4 text-[14.5px] font-medium text-success">
          <Icon.check className="size-4" strokeWidth={2} /> Nothing needs you right now. We&apos;ll add ads here when it&apos;s your turn.
        </p>
      )}

      {/* Board: columns scroll sideways on smaller screens */}
      <BoardScroller>
        <div className="flex snap-x snap-mandatory items-start gap-4">
          {AD_COLUMNS.map((column) => {
            const cards = ads.filter((ad) => ad.stage === column.stage);
            const theirs = Boolean(column.clientTurn);
            return (
              <section
                key={column.stage}
                aria-label={column.title}
                data-focus={column.stage === focus ? "" : undefined}
                className={`flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col rounded-2xl p-3 sm:w-[280px] ${theirs ? "bg-brand-soft/70 ring-1 ring-brand/15" : "bg-canvas ring-1 ring-line"}`}
              >
                <div className="px-1.5 pt-1 pb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[14.5px] font-semibold text-ink">{column.title}</h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-muted ring-1 ring-line">{cards.length}</span>
                    {theirs && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">Your turn</span>}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-snug text-muted">{column.hint}</p>
                </div>
                <ul className="space-y-2.5">
                  {cards.length === 0 && <li className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-faint">Nothing here</li>}
                  {cards.map((ad) => (
                    <AdCard key={ad.id} ad={ad} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </BoardScroller>
    </div>
  );
}

function AdCard({ ad }: { ad: AdCreative }) {
  const turn = columnFor(ad.stage).clientTurn;
  const due = ad.due && turn ? dueLabel(ad.due) : null;
  return (
    <li>
      <Link
        href={`/ads/${ad.id}`}
        className="group block rounded-xl bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-line transition hover:ring-brand/30"
      >
        <p className="text-[14px] leading-snug font-semibold break-words text-ink">{ad.name}</p>
        {(ad.format || ad.lengthSeconds) && (
          <p className="mt-1 text-[12.5px] text-muted">
            {[ad.format, ad.lengthSeconds && `${ad.lengthSeconds}s`].filter(Boolean).join(" · ")}
          </p>
        )}
        {(turn || due) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {turn && <span className="rounded-full bg-brand px-2 py-0.5 text-[11.5px] font-semibold text-white">{turn}</span>}
            {due && <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TONE[due.tone]}`}>{due.text}</span>}
          </div>
        )}
      </Link>
    </li>
  );
}

// Placeholder cards shown blurred behind the "coming soon" message.
const PREVIEW = ["Planned", "Review script", "Ready to film", "Live"];

function ComingSoon() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Ad creatives</h1>
        <p className="mt-2 text-[15px] text-muted">Every ad we&apos;re making for you, from script to live.</p>
      </header>

      <section className="relative isolate overflow-hidden rounded-[28px] border border-line bg-white [clip-path:inset(0_round_28px)]">
        {/* Blurred preview of the future board */}
        <div aria-hidden="true" className="pointer-events-none grid grid-cols-2 gap-4 p-6 opacity-60 blur-[6px] select-none sm:p-8 lg:grid-cols-4">
          {PREVIEW.map((title, i) => (
            <div key={title} className="space-y-2.5 rounded-2xl bg-canvas p-3 ring-1 ring-line">
              <p className="px-1 text-[13px] font-semibold text-ink">{title}</p>
              {Array.from({ length: [3, 2, 2, 1][i] }, (_, j) => (
                <div key={j} className="h-16 rounded-xl bg-white ring-1 ring-line" />
              ))}
            </div>
          ))}
        </div>

        {/* Coming soon card */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/40 via-white/70 to-white/90 p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex size-24 animate-[float_4s_ease-in-out_infinite] items-center justify-center rounded-[28px] bg-white text-[52px] shadow-[0_20px_50px_-12px_rgba(112,0,0,0.25)] ring-1 ring-line">
              🪄
            </div>
            <p className="mb-3 inline-flex rounded-full bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand">Coming soon</p>
            <h2 className="text-[28px] leading-tight font-bold tracking-[-0.03em] text-ink">Your ads board is on its way</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Once we start on your ads, you&apos;ll see each one here from script to live, and exactly when we need you to review or film.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

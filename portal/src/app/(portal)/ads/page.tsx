import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NotionContent } from "@/components/notion-content";
import { Icon } from "@/components/ui";
import { clientTurnAds, dueLabel } from "@/lib/ads";
import { getClientAds, getFilmingGuide } from "@/lib/data";
import { getSession, requireClient } from "@/lib/session";
import { AdBoard } from "./ad-board";
import { BoardScroller } from "./board-scroller";
import { FilmingGuide } from "./filming-guide";

export const metadata: Metadata = { title: "Ad creatives" };

// The Ad Creatives database in Notion, linked for the FunnelHaus team only.
const NOTION_ADS_URL = "https://app.notion.com/p/lewisdkkirby/ac904bbfdb008257a71501fcd153f1fc?v=70104bbfdb0083a9aafb08429728e140";

export default async function AdsPage() {
  const client = await requireClient();
  const [ads, guide, session] = await Promise.all([getClientAds(client.id), getFilmingGuide(), getSession()]);
  const guideCard = (
    <FilmingGuide>
      {guide.length > 0 ? (
        <NotionContent blocks={guide} />
      ) : (
        <p className="text-[15px] text-muted">The guide couldn&apos;t be loaded just now. Please try again in a minute.</p>
      )}
    </FilmingGuide>
  );

  if (ads.length === 0) return <ComingSoon guide={guideCard} />;

  const yourTurn = clientTurnAds(ads);
  const focus = yourTurn[0]?.stage;
  const toReview = yourTurn.filter((a) => a.stage === "Script review").length;
  const toFilm = yourTurn.filter((a) => a.stage === "Ready to film").length;
  const needs = [toReview && `review ${toReview} script${toReview === 1 ? "" : "s"}`, toFilm && `film ${toFilm} ad${toFilm === 1 ? "" : "s"}`].filter(Boolean);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Ad creatives</h1>
          <p className="mt-2 text-[15px] text-muted">Every ad we&apos;re making for you, from script to live. Drag an ad along as it moves, or tap it to see the script.</p>
        </div>
        {session?.isAdmin && (
          <a
            href={NOTION_ADS_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink ring-1 ring-line transition hover:ring-brand/30"
          >
            Open in Notion <Icon.external className="size-4 text-faint" />
          </a>
        )}
      </header>

      {guideCard}

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
        <AdBoard ads={ads} focus={focus} />
      </BoardScroller>
    </div>
  );
}

// Placeholder cards shown blurred behind the "coming soon" message.
const PREVIEW = ["Scripting", "Script review", "Ready to film", "Live"];

function ComingSoon({ guide }: { guide: ReactNode }) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Ad creatives</h1>
        <p className="mt-2 text-[15px] text-muted">Every ad we&apos;re making for you, from script to live.</p>
      </header>

      {guide}

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

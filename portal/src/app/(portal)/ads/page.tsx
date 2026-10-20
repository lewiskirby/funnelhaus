import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NotionContent } from "@/components/notion-content";
import { Icon } from "@/components/ui";
import { columnFor } from "@/lib/ads";
import { getAdStatuses, getClientAds, getFilmingGuide } from "@/lib/data";
import { getSession, requireClient } from "@/lib/session";
import { AdBoard } from "./ad-board";
import { BoardScroller } from "./board-scroller";
import { FilmingGuide } from "./filming-guide";

export const metadata: Metadata = { title: "Ad creatives" };

// The Ad Creatives database in Notion, linked for the FunnelHaus team only.
const NOTION_ADS_URL = "https://app.notion.com/p/lewisdkkirby/ac904bbfdb008257a71501fcd153f1fc?v=70104bbfdb0083a9aafb08429728e140";

export default async function AdsPage() {
  const client = await requireClient();
  const [ads, guide, session, statuses] = await Promise.all([getClientAds(client.id), getFilmingGuide(), getSession(), getAdStatuses()]);
  // Columns follow Notion; any status an ad uses that isn't in the list yet still gets a column.
  const columns = [...new Set([...statuses, ...ads.map((a) => a.stage)])].map(columnFor);
  const guideCard = (
    <div className="space-y-2">
      <FilmingGuide>
        {guide.length > 0 ? (
          <NotionContent blocks={guide} />
        ) : (
          <p className="text-[15px] text-muted">The guide couldn&apos;t be loaded just now. Please try again in a minute.</p>
        )}
      </FilmingGuide>
      <VideoFormat />
    </div>
  );

  if (ads.length === 0) return <ComingSoon guide={guideCard} />;

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

      {/* Board: columns scroll sideways on smaller screens */}
      <BoardScroller>
        <AdBoard ads={ads} columns={columns} />
      </BoardScroller>
    </div>
  );
}

// Placeholder cards shown blurred behind the "coming soon" message.
const PREVIEW = ["Scripting", "Ready to film", "Editing", "Live"];

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

/** The format every ad video must follow, shown under the filming guide. */
function VideoFormat() {
  return (
    <p className="flex items-start gap-2.5 rounded-xl bg-white px-4 py-2.5 text-[13.5px] leading-snug text-body ring-1 ring-line">
      {/* A 9:16 frame with its safe middle square marked */}
      <span aria-hidden="true" className="mt-0.5 flex h-[18px] w-[11px] shrink-0 items-center rounded-[2px] border-[1.5px] border-ink">
        <span className="mx-auto size-[6px] rounded-[1px] bg-brand" />
      </span>
      <span>
        <strong className="font-semibold text-ink">Video format:</strong> film for 4:5 and 9:16, with captions and the main subject in the
        middle square of the frame.
      </span>
    </p>
  );
}

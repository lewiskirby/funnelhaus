import type { Metadata } from "next";
import { Board } from "@/components/board";
import { BoardScroller } from "@/components/board-scroller";
import { Icon } from "@/components/ui";
import { contentColumnFor } from "@/lib/content";
import { getClientContent, getContentStatuses } from "@/lib/data";
import { getSession, requireClient } from "@/lib/session";
import type { ContentPost } from "@/lib/types";
import { movePost } from "./actions";

export const metadata: Metadata = { title: "Content" };

// The Organic Content database in Notion, linked for the FunnelHaus team only.
const NOTION_CONTENT_URL = "https://app.notion.com/p/41b04bbfdb0081658ae8c26f31a292eb";

/** "Reel · B-roll", shown under the name on a card. */
export const postMeta = (post: ContentPost) => [post.postType, post.format].filter(Boolean).join(" · ") || undefined;

/** The keyword chip on a card, e.g. "Comment SEVEN". */
export function keywordLabel(post: ContentPost): string | undefined {
  if (!post.ctaKeyword) return undefined;
  if (post.cta === "DM keyword") return `DM ${post.ctaKeyword}`;
  return `Comment ${post.ctaKeyword}`;
}

export default async function ContentPage() {
  const client = await requireClient();
  const [posts, session, statuses] = await Promise.all([getClientContent(client.id), getSession(), getContentStatuses()]);
  // Columns follow Notion; any status a post uses that isn't in the list yet still gets a column.
  const columns = [...new Set([...statuses, ...posts.map((p) => p.stage)])].map(contentColumnFor);

  if (posts.length === 0) return <ComingSoon />;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Content</h1>
          <p className="mt-2 text-[15px] text-muted">
            Every Instagram post we&apos;re planning with you, from script to posted. Drag a post along as it moves, or tap it to see the script.
          </p>
        </div>
        {session?.isAdmin && (
          <a
            href={NOTION_CONTENT_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink ring-1 ring-line transition hover:ring-brand/30"
          >
            Open in Notion <Icon.external className="size-4 text-faint" />
          </a>
        )}
      </header>

      <BoardScroller>
        <Board
          items={posts.map((post) => ({ id: post.id, name: post.name, stage: post.stage, due: post.due, meta: postMeta(post), tag: keywordLabel(post) }))}
          columns={columns}
          hrefBase="/content"
          moveAction={movePost}
        />
      </BoardScroller>
    </div>
  );
}

// Placeholder cards shown blurred behind the "coming soon" message.
const PREVIEW = ["Scripting", "Ready to film", "Ready to post", "Posted"];

function ComingSoon() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Content</h1>
        <p className="mt-2 text-[15px] text-muted">Every Instagram post we&apos;re planning with you, from script to posted.</p>
      </header>

      <section className="relative isolate overflow-hidden rounded-[28px] border border-line bg-white [clip-path:inset(0_round_28px)]">
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

        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/40 via-white/70 to-white/90 p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex size-24 animate-[float_4s_ease-in-out_infinite] items-center justify-center rounded-[28px] bg-white text-[52px] shadow-[0_20px_50px_-12px_rgba(112,0,0,0.25)] ring-1 ring-line">
              🎬
            </div>
            <p className="mb-3 inline-flex rounded-full bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand">Coming soon</p>
            <h2 className="text-[28px] leading-tight font-bold tracking-[-0.03em] text-ink">Your content board is on its way</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Once we start planning your Instagram content, you&apos;ll see each reel and carousel here from script to posted, with its call to action and freebie.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

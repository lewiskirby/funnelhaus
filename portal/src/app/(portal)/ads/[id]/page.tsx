import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotionContent } from "@/components/notion-content";
import { Icon } from "@/components/ui";
import { columnFor, dueLabel } from "@/lib/ads";
import { getClientAd } from "@/lib/data";
import { requireClient } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/ads/[id]">): Promise<Metadata> {
  const client = await requireClient();
  const found = await getClientAd(client.id, (await params).id);
  return { title: found?.ad.name ?? "Ad" };
}

const WHAT_TO_DO: Partial<Record<string, string>> = {
  review: "Read the script below. If you'd like any changes, tell us in your Slack channel or reply to any of our emails. Once you're happy, we'll get it ready to film.",
  film: "Film this ad using the script below, then upload the footage to your Asset upload folder (linked on your Home page) and let us know.",
};

export default async function AdPage({ params }: PageProps<"/ads/[id]">) {
  const client = await requireClient();
  const found = await getClientAd(client.id, (await params).id);
  // Ads that don't exist and ads belonging to another client look identical.
  if (!found) notFound();
  const { ad, content } = found;
  const column = columnFor(ad.stage);
  const due = ad.due && column.clientTurn ? dueLabel(ad.due) : null;
  const todo = WHAT_TO_DO[ad.stage];

  return (
    <div className="mx-auto max-w-[760px]">
      <Link href="/ads" className="mb-8 inline-flex items-center gap-2 text-[14px] font-medium text-muted transition hover:text-ink">
        <Icon.arrowLeft className="size-4" /> All ads
      </Link>

      <article className="card overflow-hidden">
        <header className="space-y-3 border-b border-line p-7 sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${column.clientTurn ? "bg-brand text-white" : "bg-canvas text-muted ring-1 ring-line"}`}>
              {column.clientTurn ? `Your turn: ${column.clientTurn.toLowerCase()}` : column.title}
            </span>
            {due && <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${due.tone === "overdue" ? "bg-brand-soft text-brand" : "bg-canvas text-muted ring-1 ring-line"}`}>{due.text}</span>}
          </div>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] break-words text-ink sm:text-[32px]">{ad.name}</h1>
          {(ad.format || ad.lengthSeconds) && (
            <p className="text-[14px] text-muted">{[ad.format, ad.lengthSeconds && `${ad.lengthSeconds} seconds`].filter(Boolean).join(" · ")}</p>
          )}
          {ad.driveUrl && (
            <a
              href={ad.driveUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-ink-2"
            >
              Open the file <Icon.external className="size-4" />
            </a>
          )}
        </header>

        <div className="space-y-6 p-7 sm:p-10">
          {todo && (
            <p className="rounded-2xl bg-brand-soft px-5 py-4 text-[14.5px] leading-relaxed text-ink">
              <strong className="font-semibold text-brand">What to do: </strong>
              {todo}
            </p>
          )}
          {content.length > 0 ? (
            <NotionContent blocks={content} />
          ) : (
            <p className="text-[14.5px] text-muted">There&apos;s no script or brief on this ad yet.</p>
          )}
        </div>
      </article>
    </div>
  );
}

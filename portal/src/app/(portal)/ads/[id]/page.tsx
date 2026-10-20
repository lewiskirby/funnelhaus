import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotionContent } from "@/components/notion-content";
import { Icon } from "@/components/ui";
import { columnFor, dueLabel } from "@/lib/ads";
import { getClientAd } from "@/lib/data";
import { requireClient } from "@/lib/session";
import type { ContentBlock } from "@/lib/types";
import { FullScript } from "./full-script";

export async function generateMetadata({ params }: PageProps<"/ads/[id]">): Promise<Metadata> {
  const client = await requireClient();
  const found = await getClientAd(client.id, (await params).id);
  return { title: found?.ad.name ?? "Ad" };
}

const WHAT_TO_DO: Partial<Record<string, string>> = {
  "Ready to film": "Film this ad using the script below, then upload the footage to the Ad Creative Uploads folder inside your Asset upload folder (linked on your Home page) and let us know.",
};

const cellText = (cell: { text: string }[]) => cell.map((t) => t.text).join("").trim();

/**
 * The script on its own: column 1 of the first table on the ad's page, one line
 * per row. The header row (if the table has one) and empty cells are skipped.
 */
function scriptLines(blocks: ContentBlock[]): string[] {
  for (const block of blocks) {
    if (block.type === "table") {
      return (block.header ? block.rows.slice(1) : block.rows).map((row) => cellText(row[0] ?? [])).filter(Boolean);
    }
    if ("children" in block && block.children) {
      const inner = scriptLines(block.children);
      if (inner.length) return inner;
    }
  }
  return [];
}

export default async function AdPage({ params }: PageProps<"/ads/[id]">) {
  const client = await requireClient();
  const found = await getClientAd(client.id, (await params).id);
  // Ads that don't exist and ads belonging to another client look identical.
  if (!found) notFound();
  const { ad, content } = found;
  const column = columnFor(ad.stage);
  const due = ad.due ? dueLabel(ad.due) : null;
  const todo = WHAT_TO_DO[ad.stage];
  const script = scriptLines(content);

  return (
    <div>
      <Link href="/ads" className="mb-8 inline-flex items-center gap-2 text-[14px] font-medium text-muted transition hover:text-ink">
        <Icon.arrowLeft className="size-4" /> All ads
      </Link>

      <article className="card overflow-hidden">
        <header className="space-y-3 border-b border-line p-7 sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-canvas px-2.5 py-1 text-[12px] font-semibold text-muted ring-1 ring-line">{column.title}</span>
            {due && <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${due.tone === "overdue" ? "bg-brand-soft text-brand" : "bg-canvas text-muted ring-1 ring-line"}`}>{due.text}</span>}
          </div>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] break-words text-ink sm:text-[32px]">{ad.name}</h1>
          {(ad.format || ad.lengthSeconds) && (
            <p className="text-[14px] text-muted">{[ad.format, ad.lengthSeconds && `${ad.lengthSeconds} seconds`].filter(Boolean).join(" · ")}</p>
          )}
          {(script.length > 0 || ad.driveUrl) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {script.length > 0 && <FullScript name={ad.name} lines={script} />}
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
            </div>
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

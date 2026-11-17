import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FullScript } from "@/components/full-script";
import { NotionContent } from "@/components/notion-content";
import { Icon } from "@/components/ui";
import { dueLabel, scriptLines } from "@/lib/ads";
import { contentColumnFor } from "@/lib/content";
import { getClientContentPost } from "@/lib/data";
import { requireClient } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/content/[id]">): Promise<Metadata> {
  const client = await requireClient();
  const found = await getClientContentPost(client.id, (await params).id);
  return { title: found?.post.name ?? "Post" };
}

const WHAT_TO_DO: Partial<Record<string, string>> = {
  "Ready to film": "Film this using the script below, then upload the footage to your Asset upload folder (linked on your Home page) and let us know.",
  "Ready to post": "This is ready to go. Post it on Instagram, then move it to Posted.",
};

/** What the call to action asks people to do, in a sentence. */
function ctaSentence(cta?: string, keyword?: string): string | undefined {
  if (!cta || cta === "None") return undefined;
  if (cta === "Comment keyword") return keyword ? `Comment ${keyword}` : "Comment a keyword (to be confirmed)";
  if (cta === "DM keyword") return keyword ? `DM ${keyword}` : "DM a keyword (to be confirmed)";
  return cta; // "Link in bio", "Follow"
}

const btn = "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-semibold transition";

export default async function ContentPostPage({ params }: PageProps<"/content/[id]">) {
  const client = await requireClient();
  const found = await getClientContentPost(client.id, (await params).id);
  // Posts that don't exist and posts belonging to another client look identical.
  if (!found) notFound();
  const { post, freebies, content } = found;
  const column = contentColumnFor(post.stage);
  const due = post.due ? dueLabel(post.due) : null;
  const todo = WHAT_TO_DO[post.stage];
  const script = scriptLines(content);
  const cta = ctaSentence(post.cta, post.ctaKeyword);
  const details = [post.postType, post.format, post.funnelStage && `${post.funnelStage} of funnel`].filter(Boolean).join(" · ");

  return (
    <div>
      <Link href="/content" className="mb-8 inline-flex items-center gap-2 text-[14px] font-medium text-muted transition hover:text-ink">
        <Icon.arrowLeft className="size-4" /> All content
      </Link>

      <article className="card overflow-hidden">
        <header className="space-y-3 border-b border-line p-7 sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-canvas px-2.5 py-1 text-[12px] font-semibold text-muted ring-1 ring-line">{column.title}</span>
            {due && (
              <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${due.tone === "overdue" ? "bg-brand-soft text-brand" : "bg-canvas text-muted ring-1 ring-line"}`}>
                {due.text}
              </span>
            )}
          </div>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] break-words text-ink sm:text-[32px]">{post.name}</h1>
          {details && <p className="text-[14px] text-muted">{details}</p>}
          {(script.length > 0 || post.fileUrl || post.inspirationUrl) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {script.length > 0 && <FullScript name={post.name} lines={script} />}
              {post.fileUrl && (
                <a href={post.fileUrl} target="_blank" rel="noopener" className={`${btn} bg-ink text-white hover:bg-ink-2`}>
                  Open the file <Icon.external className="size-4" />
                </a>
              )}
              {post.inspirationUrl && (
                <a href={post.inspirationUrl} target="_blank" rel="noopener" className={`${btn} bg-white text-ink ring-1 ring-line hover:ring-brand/30`}>
                  See the inspiration <Icon.external className="size-4 text-faint" />
                </a>
              )}
            </div>
          )}
        </header>

        {(cta || freebies.length > 0) && (
          <dl className="grid gap-4 border-b border-line p-7 sm:grid-cols-2 sm:p-10">
            <div>
              <dt className="text-[12px] font-semibold text-muted">Call to action</dt>
              <dd className="mt-1 text-[15px] font-semibold text-ink">{cta ?? "None"}</dd>
            </div>
            {freebies.length > 0 && (
              <div>
                <dt className="text-[12px] font-semibold text-muted">What they get</dt>
                <dd className="mt-1 space-y-1">
                  {freebies.map((f) =>
                    f.url ? (
                      <a key={f.name} href={f.url} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-[15px] font-semibold text-brand hover:underline">
                        {f.name} <Icon.external className="size-3.5" />
                      </a>
                    ) : (
                      <p key={f.name} className="text-[15px] font-semibold text-ink">
                        {f.name}
                      </p>
                    ),
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}

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
            <p className="text-[14.5px] text-muted">There&apos;s no script or guidelines on this post yet.</p>
          )}
        </div>
      </article>
    </div>
  );
}

import type { ReactNode } from "react";
import { Icon } from "@/components/ui";
import type { ContentBlock, RichText } from "@/lib/types";

// ── Inline text ─────────────────────────────────────

function Rich({ parts }: { parts: RichText[] }) {
  return (
    <>
      {parts.map((p, i) => {
        let node: ReactNode = p.text;
        if (p.code) node = <code className="rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[0.9em] text-ink ring-1 ring-line">{node}</code>;
        if (p.bold) node = <strong className="font-semibold text-ink">{node}</strong>;
        if (p.italic) node = <em>{node}</em>;
        if (p.strikethrough) node = <s>{node}</s>;
        if (p.underline) node = <u>{node}</u>;
        if (p.href) {
          node = (
            <a href={p.href} target="_blank" rel="noopener" className="font-medium text-brand underline decoration-brand/25 underline-offset-4 hover:decoration-brand">
              {node}
            </a>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

const plain = (parts: RichText[]) => parts.map((p) => p.text).join("");

// ── Embeds ──────────────────────────────────────────

/** Returns an embeddable player URL for known video hosts, else null. */
function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "loom.com") {
      const id = u.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/)?.[1];
      // Hide Loom's top bar (title, view count, link / pop-out / save buttons).
      return id ? `https://www.loom.com/embed/${id}?hideEmbedTopBar=true&hide_title=true&hide_owner=true&hide_share=true` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") ?? u.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === "vimeo.com") {
      const id = u.pathname.match(/\/(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function Media({ url, caption }: { url: string; caption: RichText[] }) {
  const embed = embedUrl(url);
  if (embed) {
    return (
      <figure>
        <div className="aspect-video overflow-hidden rounded-2xl bg-ink ring-1 ring-line">
          <iframe src={embed} className="size-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={plain(caption) || "Video"} />
        </div>
        {caption.length > 0 && <figcaption className="mt-2 text-[13px] text-muted"><Rich parts={caption} /></figcaption>}
      </figure>
    );
  }
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <a href={url} target="_blank" rel="noopener" className="group flex items-center justify-between gap-4 rounded-2xl bg-canvas px-5 py-4 ring-1 ring-line transition hover:bg-white hover:ring-brand/25">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-ink">{plain(caption) || host}</p>
        <p className="truncate text-[13px] text-muted">{host}</p>
      </div>
      <Icon.external className="size-4 shrink-0 text-faint transition group-hover:text-brand" />
    </a>
  );
}

// ── Blocks ──────────────────────────────────────────

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "paragraph":
      return block.text.length ? (
        <p>
          <Rich parts={block.text} />
        </p>
      ) : (
        <div className="h-2" />
      );
    case "heading_1":
      return <h2 className="pt-4 text-[24px] leading-tight font-bold tracking-[-0.02em] text-ink"><Rich parts={block.text} /></h2>;
    case "heading_2":
      return <h3 className="pt-3 text-[20px] leading-snug font-bold tracking-[-0.02em] text-ink"><Rich parts={block.text} /></h3>;
    case "heading_3":
      return <h4 className="pt-2 text-[17px] font-semibold text-ink"><Rich parts={block.text} /></h4>;
    case "quote":
      return (
        <blockquote className="border-l-2 border-brand pl-5 text-ink italic">
          <Rich parts={block.text} />
        </blockquote>
      );
    case "callout":
      return (
        <div className="flex gap-3.5 rounded-2xl bg-canvas p-5 ring-1 ring-line">
          {block.icon && <span className="text-xl leading-7">{block.icon}</span>}
          <div className="min-w-0 flex-1 space-y-3">
            <p><Rich parts={block.text} /></p>
            {block.children && <Blocks blocks={block.children} />}
          </div>
        </div>
      );
    case "toggle":
      return (
        <details className="group rounded-2xl ring-1 ring-line open:bg-canvas/60">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 font-medium text-ink">
            <Icon.chevronRight className="size-4 text-muted transition group-open:rotate-90" />
            <Rich parts={block.text} />
          </summary>
          {block.children && (
            <div className="space-y-3 px-5 pb-5 pl-12">
              <Blocks blocks={block.children} />
            </div>
          )}
        </details>
      );
    case "to_do":
      return (
        <div className="flex gap-3">
          <span className={`mt-[3px] flex size-[18px] shrink-0 items-center justify-center rounded-[5px] ${block.checked ? "bg-brand text-white" : "ring-[1.5px] ring-faint"}`}>
            {block.checked && <Icon.check className="size-3" strokeWidth={2.5} />}
          </span>
          <span className={block.checked ? "text-muted line-through" : ""}><Rich parts={block.text} /></span>
        </div>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-2xl bg-ink-2 p-5 text-[13.5px] leading-relaxed text-white/90">
          <code>{plain(block.text)}</code>
        </pre>
      );
    case "divider":
      return <hr className="border-line" />;
    case "image":
      return (
        <figure>
          {/* Notion image URLs are signed and short-lived, so skip next/image caching. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={plain(block.caption)} className="w-full rounded-2xl ring-1 ring-line" />
          {block.caption.length > 0 && <figcaption className="mt-2 text-[13px] text-muted"><Rich parts={block.caption} /></figcaption>}
        </figure>
      );
    case "media":
      return <Media url={block.url} caption={block.caption} />;
    default:
      return null;
  }
}

type ListBlock = { type: "bulleted_list_item" | "numbered_list_item"; text: RichText[]; children?: ContentBlock[] };

/** Renders blocks, grouping consecutive list items into one list. */
export function Blocks({ blocks }: { blocks: ContentBlock[] }) {
  const groups: (ContentBlock | { list: "ul" | "ol"; items: ListBlock[] })[] = [];
  for (const block of blocks) {
    if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
      const list = block.type === "bulleted_list_item" ? "ul" : "ol";
      const last = groups[groups.length - 1];
      const item = block as ListBlock;
      if (last && "list" in last && last.list === list) last.items.push(item);
      else groups.push({ list, items: [item] });
    } else {
      groups.push(block);
    }
  }

  return (
    <>
      {groups.map((g, i) => {
        if (!("list" in g)) return <Block key={i} block={g} />;
        if (g.list === "ul") {
          return (
            <ul key={i} className="space-y-2">
              {g.items.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-[10px] size-1.5 shrink-0 rounded-full bg-brand" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Rich parts={item.text} />
                    {item.children && <Blocks blocks={item.children} />}
                  </div>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={i} className="space-y-2">
            {g.items.map((item, j) => (
              <li key={j} className="flex gap-3">
                <span className="w-5 shrink-0 text-right font-semibold text-brand tabular-nums">{j + 1}.</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <Rich parts={item.text} />
                  {item.children && <Blocks blocks={item.children} />}
                </div>
              </li>
            ))}
          </ol>
        );
      })}
    </>
  );
}

export function NotionContent({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-4 text-[16px] leading-relaxed text-body">
      <Blocks blocks={blocks} />
    </div>
  );
}

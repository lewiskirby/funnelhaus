import type { ReactNode } from "react";
import type { RichText } from "@/lib/types";

// ── Inline text ─────────────────────────────────────

export function Rich({ parts }: { parts: RichText[] }) {
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

export const plain = (parts: RichText[]) => parts.map((p) => p.text).join("");

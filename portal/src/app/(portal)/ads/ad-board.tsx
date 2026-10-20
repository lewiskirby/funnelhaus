"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dueLabel, type AdColumn } from "@/lib/ads";
import type { AdCreative, AdStage } from "@/lib/types";
import { moveAd } from "./actions";

const TONE = {
  overdue: "bg-brand-soft text-brand",
  soon: "bg-warn-soft text-warn",
  later: "bg-canvas text-muted ring-1 ring-line",
} as const;

/**
 * The ads board. Drag a card to another column (or use "Move to" on phones) and
 * its Status changes in Notion. The card moves straight away and moves back if saving fails.
 */
export function AdBoard({ ads, columns }: { ads: AdCreative[]; columns: AdColumn[] }) {
  const [moved, setMoved] = useState<Record<string, AdStage>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<AdStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const stageOf = (ad: AdCreative) => moved[ad.id] ?? ad.stage;

  function move(ad: AdCreative, stage: AdStage) {
    const from = stageOf(ad);
    if (from === stage) return;
    setError(null);
    setMoved((m) => ({ ...m, [ad.id]: stage }));
    startTransition(async () => {
      const result = await moveAd(ad.id, stage).catch(() => ({ error: "We couldn't move that ad. Please try again." }));
      if (result.error) {
        setMoved((m) => ({ ...m, [ad.id]: from }));
        setError(result.error);
      }
    });
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-brand-soft px-4 py-3 text-[14px] text-brand">
          {error}
        </p>
      )}
      <div className="flex snap-x snap-mandatory items-start gap-4">
        {columns.map((column) => {
          const cards = ads.filter((ad) => stageOf(ad) === column.stage);
          const isOver = over === column.stage && dragging !== null;
          return (
            <section
              key={column.stage}
              aria-label={column.title}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== column.stage) setOver(column.stage);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const ad = ads.find((a) => a.id === e.dataTransfer.getData("text/x-ad-id"));
                if (ad) move(ad, column.stage);
                setOver(null);
                setDragging(null);
              }}
              className={`flex min-h-[220px] w-[78vw] max-w-[300px] shrink-0 snap-start flex-col rounded-2xl p-3 transition sm:w-[280px] ${
                isOver ? "bg-white ring-2 ring-brand/50" : "bg-canvas ring-1 ring-line"
              }`}
            >
              <div className="px-1.5 pt-1 pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[14.5px] font-semibold text-ink">{column.title}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-muted ring-1 ring-line">{cards.length}</span>
                </div>
                {column.hint && <p className="mt-1 text-[12.5px] leading-snug text-muted">{column.hint}</p>}
              </div>
              <ul className="flex-1 space-y-2.5">
                {cards.length === 0 && (
                  <li className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-faint">
                    {dragging ? "Drop here" : "Nothing here"}
                  </li>
                )}
                {cards.map((ad) => (
                  <AdCard
                    key={ad.id}
                    ad={ad}
                    stage={stageOf(ad)}
                    dragging={dragging === ad.id}
                    onDragStart={() => setDragging(ad.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    columns={columns}
                    onMove={(stage) => move(ad, stage)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

function AdCard({
  ad,
  stage,
  dragging,
  onDragStart,
  onDragEnd,
  columns,
  onMove,
}: {
  ad: AdCreative;
  stage: AdStage;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  columns: AdColumn[];
  onMove: (stage: AdStage) => void;
}) {
  const due = ad.due ? dueLabel(ad.due) : null;
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-ad-id", ad.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-line transition hover:ring-brand/30 ${
        dragging ? "opacity-40" : ""
      } cursor-grab active:cursor-grabbing`}
    >
      <Link href={`/ads/${ad.id}`} draggable={false} className="block p-3.5">
        <p className="text-[14px] leading-snug font-semibold break-words text-ink">{ad.name}</p>
        {(ad.format || ad.lengthSeconds) && (
          <p className="mt-1 text-[12.5px] text-muted">{[ad.format, ad.lengthSeconds && `${ad.lengthSeconds}s`].filter(Boolean).join(" · ")}</p>
        )}
        {due && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TONE[due.tone]}`}>{due.text}</span>
          </div>
        )}
      </Link>
      {/* Touch screens can't drag, so they get a "Move to" menu instead. */}
      <label className="hidden border-t border-line px-3.5 py-2 pointer-coarse:block">
        <span className="sr-only">Move {ad.name} to</span>
        <select
          value={stage}
          onChange={(e) => onMove(e.target.value as AdStage)}
          className="w-full cursor-pointer bg-transparent text-[12.5px] font-medium text-muted focus:outline-none"
        >
          {columns.map((c) => (
            <option key={c.stage} value={c.stage}>
              {c.stage === stage ? `In ${c.title}` : `Move to ${c.title}`}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { saveAnswer } from "@/app/(portal)/tasks/[id]/actions";
import { Rich } from "@/components/rich-text";
import { Icon } from "@/components/ui";
import { ANSWER_MAX } from "@/lib/limits";
import type { RichText } from "@/lib/types";

const SAVE_DELAY_MS = 1000; // save this long after they stop typing
const RETRY_DELAYS_MS = [2000, 5000, 10000];

// Saves run one at a time, so the first answer on a page can't set up its
// copy of the questionnaire twice.
let queue: Promise<void> = Promise.resolve();
const enqueue = (job: () => Promise<void>) => (queue = queue.then(job, job));

// Answers typed but not yet saved, so leaving the page can warn first.
const unsaved = new Set<string>();

const plain = (parts: RichText[]) => parts.map((p) => p.text).join("");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Status = "idle" | "saving" | "saved" | "error";

function AnswerField({ id, taskId, table, row, initial }: {
  id: string;
  taskId: string;
  table: number;
  row: number;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const latest = useRef(initial);
  const saved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const area = useRef<HTMLTextAreaElement>(null);

  // Grow with the answer instead of scrolling inside a small box.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function flush() {
    clearTimeout(timer.current);
    enqueue(async () => {
      const answer = latest.current;
      if (answer.trim() === saved.current.trim()) {
        unsaved.delete(id);
        return;
      }
      setStatus("saving");
      for (let attempt = 0; ; attempt++) {
        let error: string | undefined;
        try {
          error = (await saveAnswer(taskId, table, row, answer)).error;
        } catch {
          error = "offline";
        }
        if (!error) break;
        if (attempt >= RETRY_DELAYS_MS.length) {
          setStatus("error");
          return; // stays in `unsaved`; their next edit tries again
        }
        await wait(RETRY_DELAYS_MS[attempt]);
      }
      saved.current = answer;
      if (latest.current === answer) {
        unsaved.delete(id);
        setStatus("saved");
      } else {
        flush(); // they kept typing while this saved
      }
    });
  }

  function onChange(next: string) {
    setValue(next);
    latest.current = next;
    unsaved.add(id);
    if (status === "saved") setStatus("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }

  return (
    <div>
      <textarea
        ref={area}
        id={id}
        rows={2}
        maxLength={ANSWER_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
        placeholder="Type your answer…"
        className="block w-full resize-none overflow-hidden rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] leading-relaxed text-ink outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10"
      />
      <p className="mt-1.5 h-4 text-right text-[12.5px] font-medium" aria-live="polite">
        {status === "saving" && <span className="text-faint">Saving…</span>}
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-success">
            <Icon.check className="size-3.5" strokeWidth={2.2} /> Saved
          </span>
        )}
        {status === "error" && <span className="text-brand">Couldn&apos;t save. Check your connection, then edit your answer to try again.</span>}
      </p>
    </div>
  );
}

/** A Notion table whose "Your Answer" column the client fills in. Answers save as they type. */
export function QuestionnaireTable({ taskId, index, header, answerColumn, rows }: {
  taskId: string;
  index: number;
  header: boolean;
  answerColumn: number;
  rows: RichText[][][];
}) {
  // Warn before leaving with an answer that hasn't reached Notion yet.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (unsaved.size) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const questions = rows
    .map((cells, row) => ({ cells, row }))
    .filter(({ row }) => !(header && row === 0));

  return (
    <div className="divide-y divide-line rounded-2xl ring-1 ring-line">
      {questions.map(({ cells, row }) => {
        const prompt = cells.filter((_, i) => i !== answerColumn);
        const id = `answer-${index}-${row}`;
        return (
          <div key={row} className="space-y-3 p-5">
            <label htmlFor={id} className="block text-[15px] leading-relaxed text-body">
              {prompt.map((cell, i) => (
                <span key={i} className="block">
                  <Rich parts={cell} />
                </span>
              ))}
            </label>
            <AnswerField
              id={id}
              taskId={taskId}
              table={index}
              row={row}
              initial={plain(cells[answerColumn] ?? [])}
            />
          </div>
        );
      })}
    </div>
  );
}

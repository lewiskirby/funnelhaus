"use client";

// Milestone tools in the calendar pop-up: approve (or undo), edit the page's
// text, and comment. Everything is saved straight to the milestone in Notion.

import { useEffect, useRef, useState, useTransition } from "react";
import { Rich } from "@/components/rich-text";
import { Icon } from "@/components/ui";
import { BLOCK_TEXT_MAX, COMMENT_MAX } from "@/lib/limits";
import type { BlockEdits, EditableBlock, LaunchTask, MilestoneComment } from "@/lib/types";
import {
  approveMilestone,
  loadMilestoneComments,
  loadMilestoneEditor,
  postMilestoneComment,
  saveMilestone,
  undoMilestoneApproval,
} from "./actions";

const primary =
  "flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
  "flex min-h-11 items-center justify-center gap-2 rounded-xl bg-card px-5 text-[14px] font-semibold text-ink ring-1 ring-line transition hover:ring-ink/30 disabled:cursor-not-allowed disabled:opacity-40";
const fieldClass =
  "block w-full resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] leading-relaxed text-ink outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10";

const formatWhen = (iso: string, withTime = false) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });

function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-brand-soft px-4 py-3 text-[13.5px] font-medium text-brand">
      {error}
    </p>
  );
}

// ── Approval ────────────────────────────────────────

/** Approve and Edit buttons, or who approved it with a way to undo. */
export function ApprovalBar({ item, onEdit, onChanged }: { item: LaunchTask; onEdit: () => void; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  function run(action: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(undefined);
    start(async () => {
      const result = await action(item.id).catch(() => ({ ok: false as const, error: "We couldn't save that. Please try again." }));
      if (result.ok) onChanged();
      else setError(result.error);
    });
  }

  return (
    <div className="mb-5 space-y-3">
      {item.approved ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-success-soft px-4 py-3">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-semibold text-success">
            <Icon.check className="size-4 shrink-0" strokeWidth={2.25} />
            <span>
              Approved by {item.approved.by}
              {item.approved.on && <span className="font-medium"> on {formatWhen(item.approved.on)}</span>}
            </span>
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(undoMilestoneApproval)}
            className="text-[13.5px] font-semibold text-success underline underline-offset-2 hover:no-underline disabled:opacity-50"
          >
            {pending ? "Undoing…" : "Undo approval"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" disabled={pending} onClick={() => run(approveMilestone)} className={primary}>
            <Icon.check className="size-4" strokeWidth={2.25} />
            {pending ? "Approving…" : "Approve"}
          </button>
          <button type="button" disabled={pending} onClick={onEdit} className={secondary}>
            Edit
          </button>
        </div>
      )}
      <ErrorNote error={error} />
    </div>
  );
}

// ── Editing ─────────────────────────────────────────

type Row =
  | { key: string; kind: "text"; id?: string; type: string; from: string; text: string; formatted: boolean; hasChildren: boolean; removed: boolean }
  | { key: string; kind: "locked"; id: string; label: string };

let nextKey = 0;
const newParagraph = (): Row => ({ key: `new-${nextKey++}`, kind: "text", type: "paragraph", from: "", text: "", formatted: false, hasChildren: false, removed: false });

function toRows(blocks: EditableBlock[]): Row[] {
  return blocks.map((b) =>
    b.kind === "text"
      ? { key: b.id, kind: "text", id: b.id, type: b.type, from: b.text, text: b.text, formatted: b.formatted, hasChildren: b.hasChildren, removed: false }
      : { key: b.id, kind: "locked", id: b.id, label: b.label },
  );
}

/** What changed, in the shape the server applies. New paragraphs are placed after the block before them. */
function toEdits(rows: Row[]): BlockEdits {
  const edits: BlockEdits = { updates: [], inserts: [], deletes: [] };
  let anchor: string | null = null;
  let group: string[] | null = null;
  for (const row of rows) {
    if (row.kind === "text" && !row.id) {
      if (!row.text.trim()) continue;
      if (!group) edits.inserts.push({ after: anchor, texts: (group = []) });
      group.push(row.text);
      continue;
    }
    group = null;
    anchor = row.id!;
    if (row.kind !== "text") continue;
    if (row.removed) edits.deletes.push({ id: row.id!, from: row.from });
    else if (row.text !== row.from) edits.updates.push({ id: row.id!, from: row.from, text: row.text });
  }
  return edits;
}

const TYPE_STYLE: Record<string, string> = {
  heading_1: "text-[20px] font-bold",
  heading_2: "text-[18px] font-bold",
  heading_3: "text-[16px] font-semibold",
  quote: "italic",
};
const TYPE_MARK: Record<string, string> = { bulleted_list_item: "•", numbered_list_item: "#", to_do: "☐", quote: "❝", callout: "💡" };

/** Grows with its content so the whole paragraph is visible. */
function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

/** The milestone's text, editable block by block. Images, tables and sub-pages stay as they are. */
export function MilestoneEditor({ id, onSaved, onCancel }: { id: string; onSaved: () => void; onCancel: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    loadMilestoneEditor(id)
      .catch(() => ({ error: "We couldn't load this for editing. Please try again." }))
      .then((result) => {
        if (!live) return;
        if ("blocks" in result) setRows(result.blocks.length ? toRows(result.blocks) : [newParagraph()]);
        else setError(result.error);
      });
    return () => {
      live = false;
    };
  }, [id]);

  const update = (key: string, change: Partial<Extract<Row, { kind: "text" }>>) =>
    setRows((all) => all && all.map((r) => (r.key === key && r.kind === "text" ? { ...r, ...change } : r)));
  const addAfter = (key: string | null) =>
    setRows((all) => {
      if (!all) return all;
      const i = key === null ? -1 : all.findIndex((r) => r.key === key);
      return [...all.slice(0, i + 1), newParagraph(), ...all.slice(i + 1)];
    });
  const remove = (row: Row) =>
    setRows((all) => all && (row.kind === "text" && !row.id ? all.filter((r) => r.key !== row.key) : all.map((r) => (r.key === row.key ? { ...r, removed: true } : r))));

  const edits = rows ? toEdits(rows) : null;
  const changed = Boolean(edits && edits.updates.length + edits.inserts.length + edits.deletes.length);

  function save() {
    if (!edits) return;
    setError(undefined);
    start(async () => {
      const result = await saveMilestone(id, edits).catch(() => ({ ok: false as const, error: "We couldn't save that. Please try again." }));
      if (result.ok) onSaved();
      else setError(result.error);
    });
  }

  if (!rows)
    return error ? (
      <div className="space-y-3">
        <ErrorNote error={error} />
        <button type="button" onClick={onCancel} className={secondary}>
          Back
        </button>
      </div>
    ) : (
      <div className="space-y-3" aria-label="Loading">
        {[100, 80, 90].map((w) => (
          <div key={w} className="h-10 animate-pulse rounded-xl bg-canvas" style={{ width: `${w}%` }} />
        ))}
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-[13.5px] text-muted">Edit the text below, then save. Your changes go straight to FunnelHaus.</p>
      <ol className="space-y-2">
        {rows.map((row) =>
          row.kind === "locked" ? (
            <li key={row.key} className="rounded-xl bg-canvas px-3.5 py-2.5 text-[13.5px] text-muted ring-1 ring-line">
              {row.label} <span className="text-faint">(can&apos;t be edited here)</span>
            </li>
          ) : row.removed ? (
            <li key={row.key} className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3.5 py-2.5 text-[13.5px] text-faint ring-1 ring-line">
              <span className="truncate line-through">{row.from || "Empty line"}</span>
              <button type="button" onClick={() => update(row.key, { removed: false })} className="shrink-0 font-semibold text-ink underline underline-offset-2">
                Undo
              </button>
            </li>
          ) : (
            <li key={row.key} className="group">
              <div className="flex items-start gap-2">
                {TYPE_MARK[row.type] && (
                  <span aria-hidden className="mt-3 w-4 shrink-0 text-center text-[13px] text-faint">
                    {TYPE_MARK[row.type]}
                  </span>
                )}
                <AutoTextarea
                  aria-label="Text"
                  value={row.text}
                  maxLength={BLOCK_TEXT_MAX}
                  placeholder="Write something…"
                  onChange={(e) => update(row.key, { text: e.target.value })}
                  className={`${fieldClass} ${TYPE_STYLE[row.type] ?? ""}`}
                />
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => addAfter(row.key)}
                    aria-label="Add a paragraph below"
                    title="Add a paragraph below"
                    className="flex size-9 items-center justify-center rounded-full text-[20px] leading-none text-muted transition hover:bg-canvas hover:text-ink"
                  >
                    +
                  </button>
                  {!row.hasChildren && (
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      aria-label="Remove this paragraph"
                      title="Remove"
                      className="flex size-9 items-center justify-center rounded-full text-[20px] leading-none text-muted transition hover:bg-brand-soft hover:text-brand"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              {row.formatted && row.text !== row.from && (
                <p className="mt-1 ml-1 text-[12.5px] text-warn">Saving this paragraph removes its bold, italics and links.</p>
              )}
            </li>
          ),
        )}
      </ol>
      <button type="button" onClick={() => addAfter(rows.at(-1)?.key ?? null)} className="text-[13.5px] font-semibold text-ink underline underline-offset-2">
        + Add a paragraph
      </button>
      <ErrorNote error={error} />
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" disabled={pending} onClick={onCancel} className={secondary}>
          Cancel
        </button>
        <button type="button" disabled={pending || !changed} onClick={save} className={primary}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ── Comments ────────────────────────────────────────

/** The milestone's comments in Notion, oldest first, with a box to add one. */
export function MilestoneComments({ id }: { id: string }) {
  const [comments, setComments] = useState<MilestoneComment[] | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  async function load() {
    const result = await loadMilestoneComments(id).catch(() => ({ error: "We couldn't load the comments." }));
    if ("comments" in result) {
      setComments(result.comments);
      setLoadError(undefined);
    } else setLoadError(result.error);
  }

  useEffect(() => {
    let live = true;
    loadMilestoneComments(id)
      .catch(() => ({ error: "We couldn't load the comments." }))
      .then((result) => {
        if (!live) return;
        if ("comments" in result) setComments(result.comments);
        else setLoadError(result.error);
      });
    return () => {
      live = false;
    };
  }, [id]);

  function post(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const result = await postMilestoneComment(id, value).catch(() => ({ ok: false as const, error: "We couldn't post that comment. Please try again." }));
      if (!result.ok) return setError(result.error);
      setValue("");
      await load();
    });
  }

  return (
    <section aria-labelledby="milestone-comments" className="mt-7 border-t border-line pt-6">
      <h3 id="milestone-comments" className="mb-3 flex items-center gap-2 text-[15px] font-bold text-ink">
        <Icon.chat className="size-4" /> Comments
      </h3>
      {loadError ? (
        <p className="mb-3 text-[13.5px] text-muted">{loadError}</p>
      ) : !comments ? (
        <div className="mb-3 h-12 animate-pulse rounded-xl bg-canvas" aria-label="Loading comments" />
      ) : comments.length === 0 ? (
        <p className="mb-3 text-[13.5px] text-muted">No comments yet.</p>
      ) : (
        <ul className="mb-4 space-y-2.5">
          {comments.map((c) => (
            <li key={c.id} className={`rounded-2xl px-4 py-3 ${c.team ? "bg-brand-soft" : "bg-canvas ring-1 ring-line"}`}>
              <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="font-semibold text-ink">{c.author}</span>
                <time dateTime={c.at} className="text-faint">
                  {formatWhen(c.at, true)}
                </time>
              </p>
              <p className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap text-body">
                <Rich parts={c.text} />
              </p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={post} className="space-y-2.5">
        <label htmlFor="milestone-comment" className="sr-only">
          Add a comment
        </label>
        <AutoTextarea
          id="milestone-comment"
          value={value}
          maxLength={COMMENT_MAX}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a comment for the FunnelHaus team…"
          className={`${fieldClass} min-h-20`}
        />
        <ErrorNote error={error} />
        <div className="flex justify-end">
          <button type="submit" disabled={pending || !value.trim()} className={primary}>
            {pending ? "Posting…" : "Post comment"}
          </button>
        </div>
      </form>
    </section>
  );
}

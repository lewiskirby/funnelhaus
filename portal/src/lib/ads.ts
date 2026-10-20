// How ad stages and due dates read to a client. Shared by the Ads board and ad pages.

import type { AdStage } from "@/lib/types";

// The board has one column per Status in the Ad Creatives database, in Notion's order,
// so adding, renaming or removing a status in Notion changes the board. These add
// the hint shown under a column.
export type AdColumn = { stage: AdStage; title: string; hint?: string };

const COLUMN_DETAILS: Record<string, Omit<AdColumn, "stage" | "title">> = {
  "Not started": { hint: "Planned, not started yet" },
  Scripting: { hint: "We're writing the script" },
  "Ready to film": { hint: "Film it using the script" },
  Filmed: { hint: "We've got your footage" },
  Editing: { hint: "We're editing your footage" },
  "Ready for upload": { hint: "Finished and about to go live" },
  Live: { hint: "Running now" },
};

/** Statuses clients never see. */
export const HIDDEN_STATUSES = ["Rejected", "Unused"];

export const columnFor = (stage: AdStage): AdColumn => ({ stage, title: stage, ...COLUMN_DETAILS[stage] });

/** Today's date in Berlin, as YYYY-MM-DD. */
function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

/** "Due Mon 29 Sep", with how soon, for a date-only due date. */
export function dueLabel(due: string): { text: string; tone: "overdue" | "soon" | "later" } {
  const day = due.slice(0, 10);
  const days = Math.round((Date.parse(day) - Date.parse(today())) / 86_400_000);
  const date = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  if (days < 0) return { text: `Overdue · was due ${date}`, tone: "overdue" };
  if (days === 0) return { text: "Due today", tone: "soon" };
  if (days === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: `Due ${date}`, tone: days <= 3 ? "soon" : "later" };
}

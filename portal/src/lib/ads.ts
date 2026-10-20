// How ad stages and due dates read to a client. Shared by the Ads board and ad pages.

import type { AdCreative, AdStage } from "@/lib/types";

// One column per Status in the Ad Creatives database, in the same order and with the same names.
export const AD_COLUMNS: { stage: AdStage; title: string; hint: string; clientTurn?: string }[] = [
  { stage: "Not started", title: "Not started", hint: "Planned, not started yet" },
  { stage: "Scripting", title: "Scripting", hint: "We're writing the script" },
  { stage: "Script review", title: "Script review", hint: "Read the script and tell us any changes", clientTurn: "Review the script" },
  { stage: "Ready to film", title: "Ready to film", hint: "Film it using the script", clientTurn: "Film this ad" },
  { stage: "Filmed", title: "Filmed", hint: "We've got your footage" },
  { stage: "Editing", title: "Editing", hint: "We're editing your footage" },
  { stage: "Ready for upload", title: "Ready for upload", hint: "Finished and about to go live" },
  { stage: "Live", title: "Live", hint: "Running now" },
];

export const AD_STAGES = AD_COLUMNS.map((c) => c.stage);
export const isAdStage = (value: string): value is AdStage => (AD_STAGES as string[]).includes(value);
export const columnFor = (stage: AdStage) => AD_COLUMNS.find((c) => c.stage === stage)!;

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

/** Ads waiting on the client, soonest due first (undated last). */
export function clientTurnAds(ads: AdCreative[]): AdCreative[] {
  return ads
    .filter((ad) => columnFor(ad.stage).clientTurn)
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

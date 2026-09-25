// How ad stages and due dates read to a client. Shared by the Ads board and ad pages.

import type { AdCreative, AdStage } from "@/lib/types";

export const AD_COLUMNS: { stage: AdStage; title: string; hint: string; clientTurn?: string }[] = [
  { stage: "planned", title: "Planned", hint: "We're working on the idea and script" },
  { stage: "review", title: "Review script", hint: "Read the script and tell us any changes", clientTurn: "Review the script" },
  { stage: "film", title: "Ready to film", hint: "Film it using the script", clientTurn: "Film this ad" },
  { stage: "editing", title: "In editing", hint: "We're editing your footage" },
  { stage: "launch", title: "Ready to launch", hint: "Finished and about to go live" },
  { stage: "live", title: "Live", hint: "Running now" },
];

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

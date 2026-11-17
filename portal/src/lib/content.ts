// How organic content stages read to a client. Shared by the Content board and post pages.

import type { AdColumn } from "@/lib/ads";

// Like the Ads board, columns follow the Status options of Organic Content in Notion.
const COLUMN_DETAILS: Record<string, Omit<AdColumn, "stage" | "title">> = {
  "Not started": { hint: "Planned, not started yet" },
  Scripting: { hint: "We're writing the script" },
  "Ready to film": { hint: "Film it using the script" },
  Filmed: { hint: "We've got your footage" },
  Editing: { hint: "We're editing it" },
  "Ready to post": { hint: "Finished, post it on Instagram" },
  Posted: { hint: "Live on your Instagram" },
};

/** Statuses clients never see. */
export const HIDDEN_CONTENT_STATUSES = ["Unused"];

export const contentColumnFor = (stage: string): AdColumn => ({ stage, title: stage, ...COLUMN_DETAILS[stage] });

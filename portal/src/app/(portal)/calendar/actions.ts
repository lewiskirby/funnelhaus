"use server";

import {
  getCalendarItem,
  getMilestoneEditor,
  saveMilestoneEdits,
  setMilestonePosted,
} from "@/lib/data";
import { requireClient } from "@/lib/session";
import type { BlockEdits, ContentBlock, EditableBlock, LaunchTask } from "@/lib/types";

// `guide`: the Webinar presenting guide, on webinar events only.
export type CalendarItemResult = { item: LaunchTask; blocks: ContentBlock[]; guide?: ContentBlock[] } | { error: string };
type Result = { ok: true } | { ok: false; error: string };

const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{32,36}$/i.test(id);
const notFound = { ok: false as const, error: "We couldn't find that." };

/** A milestone or event on the signed-in client's calendar, with its page content. */
export async function openCalendarItem(id: string): Promise<CalendarItemResult> {
  const client = await requireClient();
  if (!validId(id)) return { error: "We couldn't find that." };
  const found = await getCalendarItem(client.id, id);
  return found ?? { error: "We couldn't find that. It may have been moved or removed." };
}

export async function markMilestonePosted(id: string): Promise<Result> {
  const client = await requireClient();
  if (!validId(id)) return notFound;
  return setMilestonePosted(client.id, id, true);
}

export async function undoMilestonePosted(id: string): Promise<Result> {
  const client = await requireClient();
  if (!validId(id)) return notFound;
  return setMilestonePosted(client.id, id, false);
}

export async function loadMilestoneEditor(id: string): Promise<{ blocks: EditableBlock[] } | { error: string }> {
  const client = await requireClient();
  if (!validId(id)) return { error: notFound.error };
  return getMilestoneEditor(client.id, id);
}

export async function saveMilestone(id: string, edits: BlockEdits): Promise<Result> {
  const client = await requireClient();
  if (!validId(id)) return notFound;
  return saveMilestoneEdits(client.id, id, edits);
}

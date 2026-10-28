"use server";

import {
  getCalendarItem,
  getMilestoneEditor,
  saveMilestoneEdits,
  setMilestoneApproval,
} from "@/lib/data";
import { getSession, requireClient } from "@/lib/session";
import type { BlockEdits, ContentBlock, EditableBlock, LaunchTask } from "@/lib/types";

export type CalendarItemResult = { item: LaunchTask; blocks: ContentBlock[] } | { error: string };
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

/** How the signed-in person is named in Notion, e.g. "Jane Smith · Acme" or "Lewis · FunnelHaus". */
async function signedInName(): Promise<string> {
  const session = await getSession();
  const name = session?.user?.name?.trim();
  if (session?.isAdmin) return `${name || "Team"} · FunnelHaus`;
  return `${name || "Client"} · ${session?.client?.name ?? "Client"}`;
}

export async function approveMilestone(id: string): Promise<Result> {
  const client = await requireClient();
  if (!validId(id)) return notFound;
  return setMilestoneApproval(client.id, id, await signedInName());
}

export async function undoMilestoneApproval(id: string): Promise<Result> {
  const client = await requireClient();
  if (!validId(id)) return notFound;
  return setMilestoneApproval(client.id, id, null);
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

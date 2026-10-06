"use server";

import { getCalendarItem } from "@/lib/data";
import { requireClient } from "@/lib/session";
import type { ContentBlock, LaunchTask } from "@/lib/types";

export type CalendarItemResult = { item: LaunchTask; blocks: ContentBlock[] } | { error: string };

/** A milestone or event on the signed-in client's calendar, with its page content. */
export async function openCalendarItem(id: string): Promise<CalendarItemResult> {
  const client = await requireClient();
  if (typeof id !== "string" || !/^[0-9a-f-]{32,36}$/i.test(id)) return { error: "We couldn't find that." };
  const found = await getCalendarItem(client.id, id);
  return found ?? { error: "We couldn't find that. It may have been moved or removed." };
}

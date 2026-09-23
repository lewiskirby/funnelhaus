"use server";

import { revalidatePath } from "next/cache";
import { saveTaskResponse, updateTaskStatus } from "@/lib/data";
import { requireClient } from "@/lib/session";
import type { TaskStatus } from "@/lib/types";

export type ActionState = { error?: string; saved?: boolean } | undefined;

// The client comes from the signed session, never the form. Ownership is
// checked again in the data layer before anything is written to Notion.

export async function setTaskStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const client = await requireClient();
  const result = await updateTaskStatus(client.id, String(formData.get("taskId") ?? ""), String(formData.get("status") ?? "") as TaskStatus);
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  return undefined;
}

export async function setTaskResponse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const client = await requireClient();
  const result = await saveTaskResponse(client.id, String(formData.get("taskId") ?? ""), String(formData.get("response") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  return { saved: true };
}

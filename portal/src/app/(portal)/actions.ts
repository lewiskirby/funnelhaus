"use server";

import { revalidatePath } from "next/cache";
import { addClientEvent } from "@/lib/data";
import { requireClient } from "@/lib/session";

export type EventFormState = { error?: string; added?: number } | undefined;

// The event is always linked to the signed-in client, never one named by the form.
export async function addEvent(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const client = await requireClient();
  const result = await addClientEvent(client.id, String(formData.get("name") ?? ""), String(formData.get("start") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/");
  return { added: Date.now() };
}

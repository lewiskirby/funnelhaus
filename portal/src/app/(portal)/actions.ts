"use server";

import { revalidatePath } from "next/cache";
import { addClientEvent, deleteClientEvent, updateClientEvent } from "@/lib/data";
import { requireClient } from "@/lib/session";

export type EventFormState = { error?: string; added?: number } | undefined;

// Adds an event, or saves changes to one when the form carries an `id`.
// A new event is always linked to the signed-in client, never one named by the form.
export async function saveEvent(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const client = await requireClient();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");
  const start = String(formData.get("start") ?? "");
  const result = id ? await updateClientEvent(client.id, id, name, start) : await addClientEvent(client.id, name, start);
  if (!result.ok) return { error: result.error };
  revalidatePath("/");
  return { added: Date.now() };
}

export async function removeEvent(eventId: string): Promise<{ error?: string }> {
  const client = await requireClient();
  const result = await deleteClientEvent(client.id, eventId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/");
  return {};
}

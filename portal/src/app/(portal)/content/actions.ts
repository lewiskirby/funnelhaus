"use server";

import { revalidatePath } from "next/cache";
import { moveClientContent } from "@/lib/data";
import { requireClient } from "@/lib/session";

/** Moves a post on the signed-in client's Content board. The post must belong to that client. */
export async function movePost(postId: string, stage: string): Promise<{ error?: string }> {
  const client = await requireClient();
  if (typeof postId !== "string" || !/^[0-9a-f-]{32,36}$/i.test(postId) || typeof stage !== "string") return { error: "We couldn't move that post." };
  const result = await moveClientContent(client.id, postId, stage);
  if (!result.ok) return { error: result.error };
  revalidatePath("/content");
  return {};
}

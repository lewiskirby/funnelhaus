"use server";

import { revalidatePath } from "next/cache";
import { moveClientAd } from "@/lib/data";
import { requireClient } from "@/lib/session";
import { isAdStage } from "@/lib/ads";
import type { AdStage } from "@/lib/types";

/** Moves an ad on the signed-in client's board. The ad must belong to that client. */
export async function moveAd(adId: string, stage: AdStage): Promise<{ error?: string }> {
  const client = await requireClient();
  if (typeof adId !== "string" || !/^[0-9a-f-]{32,36}$/i.test(adId) || !isAdStage(stage)) return { error: "We couldn't move that ad." };
  const result = await moveClientAd(client.id, adId, stage);
  if (!result.ok) return { error: result.error };
  revalidatePath("/ads");
  return {};
}

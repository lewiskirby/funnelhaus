"use server";

import { redirect } from "next/navigation";
import { getClientForAdmin } from "@/lib/data";
import { createAdminSession, requireAdmin } from "@/lib/session";

/** Admin only: view the portal as a different client. */
export async function switchClient(formData: FormData) {
  await requireAdmin();
  const client = await getClientForAdmin(String(formData.get("clientId") ?? ""));
  if (client) await createAdminSession(client.id);
  redirect("/");
}

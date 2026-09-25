"use server";

import { revalidatePath } from "next/cache";
import { TEAM_NAME_MAX, addTeamMember, addTeammate, removeTeamMember, removeTeammate } from "@/lib/data";
import { getSession, requireAdmin, requireClient } from "@/lib/session";

export type TeamFormState = { error?: string; added?: number } | undefined;

// The client always comes from the signed session, never the form.
export async function addTeammateAction(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const client = await requireClient();
  const session = await getSession();
  const inviter = session?.isAdmin ? "FunnelHaus" : session?.user?.name || client.name;
  const result = await addTeammate(
    client,
    inviter,
    String(formData.get("name") ?? "").slice(0, TEAM_NAME_MAX + 1),
    String(formData.get("email") ?? ""),
    session?.isAdmin ? "FunnelHaus" : "Client",
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/team");
  return { added: Date.now() };
}

export async function removeTeammateAction(userId: string): Promise<{ error?: string }> {
  const client = await requireClient();
  const session = await getSession();
  const result = await removeTeammate(client.id, userId, session?.user?.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/team");
  return {};
}

// ── FunnelHaus team (admin only) ────────────────────

export async function addTeamMemberAction(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  await requireAdmin();
  const session = await getSession();
  const result = await addTeamMember(
    session?.user?.name || "FunnelHaus",
    String(formData.get("name") ?? "").slice(0, TEAM_NAME_MAX + 1),
    String(formData.get("email") ?? ""),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/team");
  return { added: Date.now() };
}

export async function removeTeamMemberAction(userId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const result = await removeTeamMember(userId, (await getSession())?.user?.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/team");
  return {};
}

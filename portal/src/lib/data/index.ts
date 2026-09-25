// The portal's only way to read or change client data.
//
// Every function takes the clientId from the verified session (never from the
// browser) and only returns or changes records linked to that client.

import "server-only";
import { cache } from "react";
import * as notion from "./notion";
import { sendPortalEmail } from "@/lib/email";
import { ANSWER_MAX } from "@/lib/limits";
import type { AdCreative, Client, ClientEvent, ContentBlock, PortalUser, TableBlock, Task, TaskRecord, TaskStatus } from "@/lib/types";

export const RESPONSE_MAX = notion.RESPONSE_MAX;
const STATUSES: TaskStatus[] = ["Not Started", "In Progress", "Complete"];

const sameId = (a: string, b: string) => a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();

function toClientTask(record: TaskRecord): Task {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { clientId, templateId, ...safe } = record;
  return safe;
}

/** A task, but only if it's linked to this client. */
async function findOwnedTask(clientId: string, taskId: string): Promise<TaskRecord | null> {
  const record = await notion.getTaskPage(taskId);
  return record && sameId(record.clientId, clientId) ? record : null;
}

// ── Clients ─────────────────────────────────────────

export async function getClient(clientId: string): Promise<Client | null> {
  const client = await notion.getClientPage(clientId);
  return client?.portalEnabled ? client : null;
}

// ── Signing in ──────────────────────────────────────
// Everyone signs in with a code emailed to them. ADMIN_EMAIL (default
// info@funnelhaus.co) and Active "FunnelHaus team" rows in Portal Users sign in
// as admin and can view every client. Everyone else needs an Active row linked
// to an in-progress client.

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "info@funnelhaus.co").toLowerCase();

export type SignInAccount =
  | { kind: "admin"; email: string; userId?: string } // userId: a FunnelHaus team row (none for ADMIN_EMAIL)
  | { kind: "user"; email: string; userId: string; clientId: string };

/** Who this email signs in as, or null if it has no access. */
export async function findSignInAccount(email: string): Promise<SignInAccount | null> {
  const typed = email.trim();
  if (typed.toLowerCase() === ADMIN_EMAIL) return { kind: "admin", email: typed };
  const users = await notion.findActiveUsersByEmail(typed);
  const staff = users.find((u) => u.role === "FunnelHaus team");
  if (staff) return { kind: "admin", email: staff.email || typed, userId: staff.id };
  // An email on several clients signs in to the first one that's in progress.
  for (const user of users) {
    if (await getClient(user.clientId)) return { kind: "user", email: user.email || typed, userId: user.id, clientId: user.clientId };
  }
  return null;
}

/** The signed-in person, if they still have access to this client. Checked on every request. */
export async function getSignedInUser(userId: string, clientId: string): Promise<PortalUser | null> {
  const user = await notion.getPortalUser(userId);
  return user?.active && user.role === "Client" && sameId(user.clientId, clientId) ? user : null;
}

/** A signed-in FunnelHaus team member, if they're still on the team. Checked on every request. */
export async function getSignedInTeamMember(userId: string): Promise<PortalUser | null> {
  const user = await notion.getPortalUser(userId);
  return user?.active && user.role === "FunnelHaus team" ? user : null;
}

/** Notes the sign-in in Notion; never blocks signing in. */
export async function recordSignIn(userId: string): Promise<void> {
  try {
    await notion.setLastSignedInInNotion(userId, new Date().toISOString());
  } catch {
    // Details are logged in notion.ts.
  }
}

// ── Team ────────────────────────────────────────────
// Clients (and FunnelHaus in Notion) choose who can sign in to their portal.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TEAM_NAME_MAX = 80;

/** Everyone with access to this client, oldest first. */
export async function getTeam(clientId: string): Promise<PortalUser[]> {
  const users = await notion.queryClientUsers(clientId);
  return users.filter((u) => u.active && u.role === "Client" && sameId(u.clientId, clientId));
}

/** Active FunnelHaus team members, oldest first. */
export async function getTeamMembers(): Promise<PortalUser[]> {
  return (await notion.queryTeamMembers()).filter((u) => u.active);
}

export async function addTeammate(
  client: Client,
  inviterName: string,
  name: string,
  email: string,
  addedBy: "Client" | "FunnelHaus",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName) return { ok: false, error: "Please enter their name." };
  if (cleanName.length > TEAM_NAME_MAX) return { ok: false, error: `Please keep the name under ${TEAM_NAME_MAX} characters.` };
  if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: "Please enter a valid email address." };
  if (cleanEmail === ADMIN_EMAIL) return { ok: false, error: "That email can't be added here." };

  try {
    const everyone = await notion.queryClientUsers(client.id);
    const existing = everyone.find((u) => u.role === "Client" && u.email.toLowerCase() === cleanEmail);
    if (existing?.active) return { ok: false, error: "That person already has access." };
    // Someone removed earlier is simply switched back on.
    if (existing) await notion.setPortalUserStatusInNotion(existing.id, "Active");
    else await notion.createPortalUserInNotion({ name: cleanName, email: cleanEmail, clientId: client.id, role: "Client", addedBy });
  } catch {
    return { ok: false, error: "We couldn't add them just now. Please try again." };
  }

  try {
    await sendPortalEmail({ type: "invite", email: cleanEmail, name: cleanName.split(/\s+/)[0], client_name: client.name, inviter: inviterName });
  } catch (err) {
    console.error("Teammate welcome email failed", err); // they can still sign in
  }
  return { ok: true };
}

/** Adds someone to the FunnelHaus team: they can sign in and see every client. Admin only. */
export async function addTeamMember(inviterName: string, name: string, email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName) return { ok: false, error: "Please enter their name." };
  if (cleanName.length > TEAM_NAME_MAX) return { ok: false, error: `Please keep the name under ${TEAM_NAME_MAX} characters.` };
  if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: "Please enter a valid email address." };
  if (cleanEmail === ADMIN_EMAIL) return { ok: false, error: "That email already has full access." };

  try {
    const existing = (await notion.queryTeamMembers()).find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing?.active) return { ok: false, error: "They're already on the team." };
    if (existing) await notion.setPortalUserStatusInNotion(existing.id, "Active");
    else await notion.createPortalUserInNotion({ name: cleanName, email: cleanEmail, role: "FunnelHaus team", addedBy: "FunnelHaus" });
  } catch {
    return { ok: false, error: "We couldn't add them just now. Please try again." };
  }

  try {
    await sendPortalEmail({ type: "staff_invite", email: cleanEmail, name: cleanName.split(/\s+/)[0], inviter: inviterName });
  } catch (err) {
    console.error("Team member welcome email failed", err); // they can still sign in
  }
  return { ok: true };
}

/** Takes someone off the FunnelHaus team. Admin only. */
export async function removeTeamMember(userId: string, actingUserId?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (actingUserId && sameId(actingUserId, userId)) return { ok: false, error: "You can't remove yourself." };
  const user = await notion.getPortalUser(userId);
  if (!user?.active || user.role !== "FunnelHaus team") return { ok: false, error: "We couldn't find that person." };
  try {
    await notion.setPortalUserStatusInNotion(userId, "Removed");
    return { ok: true };
  } catch {
    return { ok: false, error: "We couldn't remove them just now. Please try again." };
  }
}

export async function removeTeammate(clientId: string, userId: string, actingUserId?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (actingUserId && sameId(actingUserId, userId)) return { ok: false, error: "You can't remove yourself." };
  const user = await notion.getPortalUser(userId);
  if (!user?.active || user.role !== "Client" || !sameId(user.clientId, clientId)) return { ok: false, error: "We couldn't find that person." };
  try {
    await notion.setPortalUserStatusInNotion(userId, "Removed");
    return { ok: true };
  } catch {
    return { ok: false, error: "We couldn't remove them just now. Please try again." };
  }
}

/** Any in-progress client (Onboarding or Active), whether or not anyone can sign in yet. Admin only. */
export async function getClientForAdmin(clientId: string): Promise<Client | null> {
  const client = await notion.getClientPage(clientId);
  return client && notion.isInProgress(client) ? client : null;
}

export const listClientsForAdmin = cache(async (): Promise<Pick<Client, "id" | "name" | "icon" | "status">[]> => {
  const clients = await notion.listClients();
  return clients.map(({ id, name, icon, status }) => ({ id, name, icon, status }));
});

// ── Tasks ───────────────────────────────────────────

export async function getClientTasks(clientId: string): Promise<Task[]> {
  const records = await notion.queryClientTasks(clientId);
  return records.filter((t) => sameId(t.clientId, clientId)).map(toClientTask);
}

export async function getClientTask(clientId: string, taskId: string): Promise<Task | null> {
  // Same answer whether the task doesn't exist or belongs to someone else.
  const record = await findOwnedTask(clientId, taskId);
  return record ? toClientTask(record) : null;
}

/**
 * The body of the task's own Notion page, or its template's if the task page is empty.
 * The task's own page is always read fresh because clients write answers into it.
 */
export async function getClientTaskContent(clientId: string, taskId: string): Promise<ContentBlock[]> {
  const task = await findOwnedTask(clientId, taskId);
  if (!task) return [];
  try {
    const own = await notion.getPageContent(taskId, { fresh: true });
    const blocks = own.length > 0 || !task.templateId ? own : await notion.getPageContent(task.templateId);
    return await withTranslations(blocks);
  } catch {
    return []; // Details are logged in notion.ts.
  }
}

const LANGUAGES: Record<string, string> = {
  "🇩🇪": "Deutsch",
  "🇦🇹": "Deutsch",
  "🇨🇭": "Deutsch",
  "🇬🇧": "English",
  "🇺🇸": "English",
  "🇪🇸": "Español",
  "🇫🇷": "Français",
  "🇮🇹": "Italiano",
  "🇳🇱": "Nederlands",
  "🇵🇹": "Português",
  "🇵🇱": "Polski",
};

/** Swaps flagged sub-pages (e.g. a German version) for their content, so the portal can offer a language switch. */
async function withTranslations(blocks: ContentBlock[]): Promise<ContentBlock[]> {
  return Promise.all(
    blocks.map(async (b): Promise<ContentBlock> => {
      if (b.type !== "subpage" || !b.flag) return b;
      return { type: "translation", flag: b.flag, label: LANGUAGES[b.flag] ?? b.title, blocks: await notion.getPageContent(b.id) };
    }),
  );
}

// ── Questionnaire answers ───────────────────────────
// Tables with a "Your Answer" column are filled in by the client. Answers are
// written into the client's own task page; the shared template is never changed.

// One copy at a time per task, so two quick answers can't copy the template twice.
const copying = new Map<string, Promise<void>>();

/** The task page's own body, copying the template in first if the page is still empty. */
async function ownContentForAnswers(task: TaskRecord, own: ContentBlock[]): Promise<ContentBlock[]> {
  const pending = copying.get(task.id);
  if (pending) {
    await pending.catch(() => {});
    own = await notion.getPageContent(task.id, { fresh: true });
  }
  if (own.length > 0 || !task.templateId) return own;

  const copy = notion.copyPageContent(task.templateId, task.id);
  copying.set(task.id, copy);
  try {
    await copy;
  } finally {
    copying.delete(task.id);
  }
  return notion.getPageContent(task.id, { fresh: true });
}

function findTable(blocks: ContentBlock[], index: number): TableBlock | undefined {
  for (const block of blocks) {
    if (block.type === "table" && block.index === index) return block;
    if ("children" in block && block.children) {
      const found = findTable(block.children, index);
      if (found) return found;
    }
  }
}

export async function saveTableAnswer(
  clientId: string,
  taskId: string,
  tableIndex: number,
  rowIndex: number,
  answer: string,
): Promise<{ ok: true; started: boolean } | { ok: false; error: string }> {
  if (!Number.isInteger(tableIndex) || !Number.isInteger(rowIndex) || tableIndex < 0 || rowIndex < 0) {
    return { ok: false, error: "We couldn't save that answer." };
  }
  if (answer.length > ANSWER_MAX) return { ok: false, error: `Please keep each answer under ${ANSWER_MAX.toLocaleString("en-GB")} characters.` };
  // Read the page while ownership is checked; nothing is written until both are back.
  const [task, own] = await Promise.all([
    findOwnedTask(clientId, taskId),
    notion.getPageContent(taskId, { fresh: true }).catch(() => null),
  ]);
  if (!task) return { ok: false, error: "We couldn't find that task." };

  try {
    if (!own) throw new Error("Couldn't read the task page");
    const table = findTable(await ownContentForAnswers(task, own), tableIndex);
    const rowId = table?.rowIds?.[rowIndex];
    // Only the answer column of a question row can be written, never the header or the questions.
    if (!table || table.answerColumn === undefined || !rowId || (table.header && rowIndex === 0)) {
      return { ok: false, error: "This question has changed. Please refresh the page." };
    }
    await notion.setTableCellInNotion(rowId, table.rows[rowIndex], table.answerColumn, answer.trim());
    return { ok: true, started: answer.trim() ? await markStarted(task) : false };
  } catch {
    return { ok: false, error: "We couldn't save that answer. We'll keep trying." };
  }
}

export type UpdateTaskResult = { ok: true; task: Task } | { ok: false; error: string };

export async function updateTaskStatus(clientId: string, taskId: string, status: TaskStatus): Promise<UpdateTaskResult> {
  if (!STATUSES.includes(status)) return { ok: false, error: "That status isn't allowed." };
  if (!(await findOwnedTask(clientId, taskId))) return { ok: false, error: "We couldn't find that task." };
  let task: Task;
  try {
    task = toClientTask(await notion.setTaskStatusInNotion(taskId, status));
  } catch {
    return { ok: false, error: "We couldn't update this task. Please try again." };
  }
  if (status === "Complete") await markActiveIfOnboardingDone(clientId, taskId);
  return { ok: true, task };
}

/** Once every task is complete, move an onboarding client to Active. Never downgrades or overrides Inactive. */
async function markActiveIfOnboardingDone(clientId: string, justCompletedId: string) {
  try {
    const [client, tasks] = await Promise.all([notion.getClientPage(clientId), notion.queryClientTasks(clientId)]);
    const onboarding = client && (client.status === "Onboarding" || client.rawStatus === "No Status");
    if (onboarding && tasks.length > 0 && tasks.every((t) => sameId(t.id, justCompletedId) || t.status === "Complete")) {
      await notion.setClientStatusInNotion(clientId, "Active");
    }
  } catch {
    // The task update already succeeded; the status change can be done by hand if Notion fails here.
  }
}

/** Filling anything in moves a task from Not Started to In Progress. Other statuses are left alone. */
async function markStarted(task: TaskRecord): Promise<boolean> {
  if (task.status !== "Not Started") return false;
  try {
    await notion.setTaskStatusInNotion(task.id, "In Progress");
    return true;
  } catch {
    return false; // The answer is saved either way; the status can be set by hand.
  }
}

export async function saveTaskResponse(clientId: string, taskId: string, response: string): Promise<UpdateTaskResult> {
  const trimmed = response.trim();
  if (trimmed.length > RESPONSE_MAX) return { ok: false, error: `Please keep your response under ${RESPONSE_MAX} characters.` };
  const owned = await findOwnedTask(clientId, taskId);
  if (!owned) return { ok: false, error: "We couldn't find that task." };
  try {
    const task = toClientTask(await notion.setTaskResponseInNotion(taskId, trimmed));
    if (trimmed && (await markStarted(owned))) task.status = "In Progress";
    return { ok: true, task };
  } catch {
    return { ok: false, error: "We couldn't save your response. Please try again." };
  }
}

// ── Events ──────────────────────────────────────────

/** Upcoming events linked to this client (an event can be shared by several clients). */
export async function getClientEvents(clientId: string): Promise<ClientEvent[]> {
  try {
    const events = await notion.queryClientEvents(clientId);
    return events
      .filter((e) => e.clientIds.some((id) => sameId(id, clientId)))
      // Events shared with other clients are read-only here.
      .map(({ clientIds, ...event }) => ({ ...event, editable: clientIds.length === 1 }));
  } catch {
    return []; // Details are logged in notion.ts; Home still loads.
  }
}

export const EVENT_NAME_MAX = 120;
// A date (all day) or a date-time with a UTC offset, e.g. 2026-10-01T19:00:00+02:00.
const EVENT_START_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2}))?$/;

type EventResult = { ok: true } | { ok: false; error: string };

/** The cleaned-up name, or an error message for the client. */
function checkEvent(name: string, start: string): { name: string } | { error: string } {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Please give the event a name." };
  if (trimmed.length > EVENT_NAME_MAX) return { error: `Please keep the name under ${EVENT_NAME_MAX} characters.` };
  if (!EVENT_START_RE.test(start) || Number.isNaN(Date.parse(start.length === 10 ? `${start}T12:00:00Z` : start))) {
    return { error: "Please pick a valid date." };
  }
  if (start.slice(0, 10) < new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)) {
    return { error: "That date is in the past." };
  }
  return { name: trimmed };
}

/** True only for an event linked to this client and no one else. */
async function ownsEvent(clientId: string, eventId: string): Promise<boolean> {
  const clientIds = await notion.getEventClientIds(eventId);
  return clientIds?.length === 1 && sameId(clientIds[0], clientId);
}

export async function addClientEvent(clientId: string, name: string, start: string): Promise<EventResult> {
  const checked = checkEvent(name, start);
  if ("error" in checked) return { ok: false, error: checked.error };
  try {
    await notion.createEventInNotion(clientId, checked.name, start);
    return { ok: true };
  } catch {
    return { ok: false, error: "We couldn't add this event. Please try again." };
  }
}

export async function updateClientEvent(clientId: string, eventId: string, name: string, start: string): Promise<EventResult> {
  const checked = checkEvent(name, start);
  if ("error" in checked) return { ok: false, error: checked.error };
  if (!(await ownsEvent(clientId, eventId))) return { ok: false, error: "This event can't be changed here." };
  try {
    await notion.updateEventInNotion(eventId, checked.name, start);
    return { ok: true };
  } catch {
    return { ok: false, error: "We couldn't save this event. Please try again." };
  }
}

export async function deleteClientEvent(clientId: string, eventId: string): Promise<EventResult> {
  if (!(await ownsEvent(clientId, eventId))) return { ok: false, error: "This event can't be deleted here." };
  try {
    await notion.trashEventInNotion(eventId);
    return { ok: true };
  } catch {
    return { ok: false, error: "We couldn't delete this event. Please try again." };
  }
}

// ── Ads ─────────────────────────────────────────────
// Only ads whose Client relation includes this client are ever returned.

function toClientAd(record: AdCreative & { clientIds: string[] }): AdCreative {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { clientIds, ...ad } = record;
  return ad;
}

export async function getClientAds(clientId: string): Promise<AdCreative[]> {
  try {
    const ads = await notion.queryClientAds(clientId);
    return ads.filter((ad) => ad.clientIds.some((id) => sameId(id, clientId))).map(toClientAd);
  } catch {
    return []; // Details are logged in notion.ts.
  }
}

/** One ad and its page content (e.g. the script), if it belongs to this client. */
export async function getClientAd(clientId: string, adId: string): Promise<{ ad: AdCreative; content: ContentBlock[] } | null> {
  const ad = await notion.getAdPage(adId);
  if (!ad || !ad.clientIds.some((id) => sameId(id, clientId))) return null;
  let content: ContentBlock[] = [];
  try {
    content = await notion.getPageContent(adId, { fresh: true });
  } catch {
    // Show the ad without its content rather than failing.
  }
  return { ad: toClientAd(ad), content };
}

// ── What FunnelHaus is working on ───────────────────

export const UPCOMING_WORK_DAYS = 7;

/** Titles of FunnelHaus tracker tasks for this client due in the next 7 days. */
export async function getUpcomingWork(clientId: string): Promise<{ id: string; title: string }[]> {
  try {
    const items = await notion.queryUpcomingWork(clientId, UPCOMING_WORK_DAYS);
    return items
      .filter((i) => i.title && i.clientIds.some((id) => sameId(id, clientId)))
      .map(({ id, title }) => ({ id, title }));
  } catch {
    return []; // Details are logged in notion.ts; Home still loads.
  }
}

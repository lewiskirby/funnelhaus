// The portal's only way to read or change client data.
//
// Every function takes the clientId from the verified session (never from the
// browser) and only returns or changes records linked to that client.

import "server-only";
import { cache } from "react";
import * as notion from "./notion";
import { hashPassword, isHashed, verifyPassword } from "@/lib/password";
import type { Client, ClientEvent, ContentBlock, Task, TaskRecord, TaskStatus } from "@/lib/types";

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

export async function verifyLogin(email: string, password: string): Promise<Client | null> {
  const typed = email.trim();
  // Notion's email filter is case-sensitive, so try as typed and lower-cased.
  const candidates = await notion.findClientsByEmail(typed);
  if (!candidates.length && typed !== typed.toLowerCase()) candidates.push(...(await notion.findClientsByEmail(typed.toLowerCase())));
  const match = candidates.find(({ loginAccess }) => verifyPassword(password, loginAccess));
  if (!match) return null;

  // Make's sha256 and hand-typed reset passwords get upgraded to scrypt after the first sign-in,
  // so a readable password never stays in Notion for long.
  if (!match.loginAccess.startsWith("scrypt:")) {
    try {
      await notion.setLoginAccessInNotion(match.client.id, hashPassword(password));
    } catch {
      // Sign-in still succeeds; we'll try again next time.
    }
  }
  return match.client;
}

export async function getClient(clientId: string): Promise<Client | null> {
  const client = await notion.getClientPage(clientId);
  return client?.portalEnabled ? client : null;
}

// ── Admin ───────────────────────────────────────────
// One admin login (ADMIN_EMAIL + ADMIN_PASSWORD_HASH in the environment) that can
// view every client. The password itself is never stored, only its scrypt hash.

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "info@funnelhaus.co").toLowerCase();

export function isAdminEmail(email: string) {
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}

export function verifyAdminLogin(email: string, password: string): boolean {
  const stored = process.env.ADMIN_PASSWORD_HASH ?? "";
  // The admin password must be stored hashed; a plain value in the environment is refused.
  return isAdminEmail(email) && isHashed(stored) && verifyPassword(password, stored);
}

/** Any client record, whether or not it has portal access. Admin only. */
export async function getClientForAdmin(clientId: string): Promise<Client | null> {
  return notion.getClientPage(clientId);
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

/** The body of the task's own Notion page, or its template's if the task page is empty. */
export async function getClientTaskContent(clientId: string, taskId: string): Promise<ContentBlock[]> {
  const task = await findOwnedTask(clientId, taskId);
  if (!task) return [];
  try {
    const own = await notion.getPageContent(taskId);
    if (own.length > 0 || !task.templateId) return own;
    return await notion.getPageContent(task.templateId);
  } catch {
    return []; // Details are logged in notion.ts.
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

export async function saveTaskResponse(clientId: string, taskId: string, response: string): Promise<UpdateTaskResult> {
  const trimmed = response.trim();
  if (trimmed.length > RESPONSE_MAX) return { ok: false, error: `Please keep your response under ${RESPONSE_MAX} characters.` };
  if (!(await findOwnedTask(clientId, taskId))) return { ok: false, error: "We couldn't find that task." };
  try {
    return { ok: true, task: toClientTask(await notion.setTaskResponseInNotion(taskId, trimmed)) };
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ clientIds, ...event }) => event);
  } catch {
    return []; // Details are logged in notion.ts; Home still loads.
  }
}

export const EVENT_NAME_MAX = 120;
// A date (all day) or a date-time with a UTC offset, e.g. 2026-10-01T19:00:00+02:00.
const EVENT_START_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2}))?$/;

export async function addClientEvent(clientId: string, name: string, start: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Please give the event a name." };
  if (trimmed.length > EVENT_NAME_MAX) return { ok: false, error: `Please keep the name under ${EVENT_NAME_MAX} characters.` };
  if (!EVENT_START_RE.test(start) || Number.isNaN(Date.parse(start.length === 10 ? `${start}T12:00:00Z` : start))) {
    return { ok: false, error: "Please pick a valid date." };
  }
  if (start.slice(0, 10) < new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)) {
    return { ok: false, error: "That date is in the past." };
  }
  try {
    await notion.createEventInNotion(clientId, trimmed, start);
    return { ok: true };
  } catch {
    return { ok: false, error: "We couldn't add this event. Please try again." };
  }
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

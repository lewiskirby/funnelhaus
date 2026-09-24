// The portal's only way to read or change client data.
//
// Every function takes the clientId from the verified session (never from the
// browser) and only returns or changes records linked to that client.

import "server-only";
import { cache } from "react";
import * as notion from "./notion";
import { ANSWER_MAX } from "@/lib/limits";
import { hashPassword, isHashed, verifyPassword } from "@/lib/password";
import type { Client, ClientEvent, ContentBlock, TableBlock, Task, TaskRecord, TaskStatus } from "@/lib/types";

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

/** Any in-progress client (Onboarding or Active), with or without a password. Admin only. */
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
): Promise<{ ok: true } | { ok: false; error: string }> {
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
    return { ok: true };
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

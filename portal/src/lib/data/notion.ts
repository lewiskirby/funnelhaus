// Reads and writes client data in Notion. Server-only: NOTION_TOKEN never
// reaches the browser. Property names must match the Notion databases exactly.

import "server-only";
import { cache } from "react";
import type { Client, ClientEvent, ClientIcon, ContentBlock, RichText, TaskRecord, TaskStatus } from "@/lib/types";

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

export const CLIENTS_DS = process.env.NOTION_CLIENTS_DS ?? "3b904bbf-db00-8005-95df-000b8d13711a";
export const TASKS_DS = process.env.NOTION_TASKS_DS ?? "3e404bbf-db00-804b-9f7d-000bd5b01c9e";
export const EVENTS_DS = process.env.NOTION_EVENTS_DS ?? "3e404bbf-db00-8058-8f62-000bc97aa059";
const CONTENT_TTL_MS = 60_000; // how long page content and template icons are cached
export const TRACKER_DS = process.env.NOTION_TRACKER_DS ?? "3c104bbf-db00-802e-b3e3-000bba4c7e16";

// ── HTTP ────────────────────────────────────────────

async function notion<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    // Log details server-side; callers show a friendly message.
    console.error(`Notion ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
    throw new Error("Notion request failed");
  }
  return res.json() as Promise<T>;
}

type FileRef = { type: "external" | "file"; external?: { url: string }; file?: { url: string } };
type PageIcon = { type: "emoji"; emoji: string } | ({ type: "external" | "file" } & FileRef) | { type: "custom_emoji"; custom_emoji: { url: string } };
type Page = {
  id: string;
  in_trash?: boolean;
  archived?: boolean;
  icon?: PageIcon | null;
  parent?: { data_source_id?: string };
  properties: Record<string, Prop>;
};
type Prop = {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  email?: string | null;
  url?: string | null;
  number?: number | null;
  checkbox?: boolean;
  select?: { name: string } | null;
  status?: { name: string } | null;
  date?: { start: string; end?: string | null } | null;
  relation?: { id: string }[];
};

async function queryAll(dataSourceId: string, body: Record<string, unknown>): Promise<Page[]> {
  const pages: Page[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion<{ results: Page[]; has_more: boolean; next_cursor: string | null }>(
      `/data_sources/${dataSourceId}/query`,
      { method: "POST", body: { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) } },
    );
    pages.push(...res.results);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return pages;
}

// ── Property readers ────────────────────────────────

const text = (p?: Prop) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text).join("").trim();
const option = (p?: Prop) => p?.select?.name ?? p?.status?.name ?? "";
const normalise = (id: string) => id.replace(/-/g, "").toLowerCase();
const safeUrl = (url?: string | null) => (url && /^https?:\/\//i.test(url) ? url : undefined);

// ── Clients ─────────────────────────────────────────

function toIcon(icon?: PageIcon | null): ClientIcon | undefined {
  if (!icon) return undefined;
  if (icon.type === "emoji") return { type: "emoji", value: icon.emoji };
  if (icon.type === "custom_emoji") return { type: "image", url: icon.custom_emoji.url };
  const url = icon.type === "external" ? icon.external?.url : icon.file?.url;
  return url ? { type: "image", url } : undefined;
}

const IN_PROGRESS = ["Onboarding", "Active"];
export const isInProgress = (client: Client) => IN_PROGRESS.includes(client.rawStatus ?? "");

function toClient(page: Page): Client {
  const p = page.properties;
  const status = option(p["Status"]);
  return {
    id: page.id,
    name: text(p["Business name"]) || "Your business",
    icon: toIcon(page.icon),
    contactFirstName: text(p["First name"]) || "there",
    driveFolderUrl: safeUrl(p["Google Drive Folder"]?.url),
    assetFolderUrl: safeUrl(p["Asset upload folder"]?.url),
    contactEmails: p["Email"]?.email ? [p["Email"].email] : [],
    status: status === "Onboarding" || status === "Inactive" ? status : "Active",
    rawStatus: status,
    // Portal access requires a password in "Login access" and a Status in Notion's
    // "In progress" group (Onboarding or Active). No Status and Inactive are locked out.
    portalEnabled: Boolean(text(p["Login access"])) && IN_PROGRESS.includes(status),
  };
}

/** Portal-enabled clients with this Email, plus their "Login access" value for the caller to check. */
export async function findClientsByEmail(email: string): Promise<{ client: Client; loginAccess: string }[]> {
  const pages = await queryAll(CLIENTS_DS, {
    filter: { property: "Email", email: { equals: email.trim() } },
  });
  return pages
    .map((page) => ({ client: toClient(page), loginAccess: text(page.properties["Login access"]) }))
    .filter(({ client, loginAccess }) => client.portalEnabled && loginAccess);
}

/** Replaces the client's "Login access" (always with a hash). */
export async function setLoginAccessInNotion(clientId: string, value: string): Promise<void> {
  await notion(`/pages/${clientId}`, {
    method: "PATCH",
    body: { properties: { "Login access": { rich_text: [{ type: "text", text: { content: value } }] } } },
  });
}

/** Sets the client's Status (a Notion status property). */
export async function setClientStatusInNotion(clientId: string, status: "Active"): Promise<void> {
  await notion(`/pages/${clientId}`, { method: "PATCH", body: { properties: { Status: { status: { name: status } } } } });
}

let clientListCache: { at: number; clients: Promise<Client[]> } | undefined;

/** In-progress clients (Onboarding or Active), A–Z, for the admin switcher. Kept for a minute so switching is quick. */
export async function listClients(): Promise<Client[]> {
  if (clientListCache && Date.now() - clientListCache.at < CONTENT_TTL_MS) return clientListCache.clients;
  const clients = queryAll(CLIENTS_DS, { sorts: [{ property: "Business name", direction: "ascending" }] }).then((pages) =>
    pages.filter((p) => text(p.properties["Business name"])).map(toClient).filter(isInProgress),
  );
  clientListCache = { at: Date.now(), clients };
  clients.catch(() => (clientListCache = undefined));
  return clients;
}

export const getClientPage = cache(async (clientId: string): Promise<Client | null> => {
  try {
    const page = await notion<Page>(`/pages/${clientId}`);
    if (page.in_trash || page.archived || normalise(page.parent?.data_source_id ?? "") !== normalise(CLIENTS_DS)) return null;
    return toClient(page);
  } catch {
    return null;
  }
});

// ── Tasks ───────────────────────────────────────────
// Client Tasks fields used: Task (title), Client (relation), Status (select),
// Client Response (text). SOP is never read.

const STATUSES: TaskStatus[] = ["Not Started", "In Progress", "Complete"];
export const RESPONSE_MAX = 2000; // Notion's limit for one text value

function toTask(page: Page): TaskRecord {
  const p = page.properties;
  const status = option(p["Status"]) as TaskStatus;
  return {
    id: page.id,
    clientId: p["Client"]?.relation?.[0]?.id ?? "",
    name: text(p["Task"]) || "Untitled task",
    status: STATUSES.includes(status) ? status : "Not Started",
    icon: page.icon?.type === "emoji" ? page.icon.emoji : undefined,
    clientResponse: text(p["Client Response"]) || undefined,
    priority: option(p["Priority Group"]) || undefined,
    templateId: p["Template"]?.relation?.[0]?.id,
  };
}

// Template pages change rarely; keep their emoji for a minute.
const templateIconCache = new Map<string, { at: number; icon: Promise<string | undefined> }>();

async function templateIcon(templateId: string): Promise<string | undefined> {
  const hit = templateIconCache.get(templateId);
  if (hit && Date.now() - hit.at < CONTENT_TTL_MS) return hit.icon;
  const icon = notion<Page>(`/pages/${templateId}`)
    .then((page) => (page.icon?.type === "emoji" ? page.icon.emoji : undefined))
    .catch(() => undefined);
  templateIconCache.set(templateId, { at: Date.now(), icon });
  return icon;
}

/** Tasks without their own emoji borrow their template's. */
async function withTemplateIcons(tasks: TaskRecord[]): Promise<TaskRecord[]> {
  return Promise.all(
    tasks.map(async (t) => (t.icon || !t.templateId ? t : { ...t, icon: await templateIcon(t.templateId) })),
  );
}

/** This client's tasks by Priority Group, then oldest first — filtered by Notion itself. */
export async function queryClientTasks(clientId: string): Promise<TaskRecord[]> {
  const pages = await queryAll(TASKS_DS, {
    filter: { property: "Client", relation: { contains: clientId } },
    sorts: [
      { property: "Priority Group", direction: "ascending" },
      { timestamp: "created_time", direction: "ascending" },
    ],
  });
  return withTemplateIcons(pages.map(toTask));
}

/** A single task page, but only if it really lives in the Client Tasks database. */
export const getTaskPage = cache(async (taskId: string): Promise<TaskRecord | null> => {
  try {
    const page = await notion<Page>(`/pages/${taskId}`);
    if (page.in_trash || page.archived || normalise(page.parent?.data_source_id ?? "") !== normalise(TASKS_DS)) return null;
    // A task linked to several clients must not be shared across them.
    if ((page.properties["Client"]?.relation?.length ?? 0) !== 1) return null;
    const [task] = await withTemplateIcons([toTask(page)]);
    return task;
  } catch {
    return null;
  }
});

/** Writes only the Status property. */
export async function setTaskStatusInNotion(taskId: string, status: TaskStatus): Promise<TaskRecord> {
  const page = await notion<Page>(`/pages/${taskId}`, {
    method: "PATCH",
    body: { properties: { Status: { select: { name: status } } } },
  });
  return toTask(page);
}

/** Writes only the Client Response property. */
export async function setTaskResponseInNotion(taskId: string, response: string): Promise<TaskRecord> {
  const page = await notion<Page>(`/pages/${taskId}`, {
    method: "PATCH",
    body: {
      properties: {
        "Client Response": { rich_text: response ? [{ type: "text", text: { content: response.slice(0, RESPONSE_MAX) } }] : [] },
      },
    },
  });
  return toTask(page);
}

// ── Events ──────────────────────────────────────────
// Client Events fields used: Name (title), Client (relation), Date (date).

/** This client's events from today onwards, soonest first. */
export async function queryClientEvents(clientId: string): Promise<(ClientEvent & { clientIds: string[] })[]> {
  const today = new Date().toISOString().slice(0, 10);
  const pages = await queryAll(EVENTS_DS, {
    filter: {
      and: [
        { property: "Client", relation: { contains: clientId } },
        { property: "Date", date: { on_or_after: today } },
      ],
    },
    sorts: [{ property: "Date", direction: "ascending" }],
  });
  return pages
    .filter((page) => page.properties["Date"]?.date?.start)
    .map((page) => {
      const date = page.properties["Date"]!.date!;
      return {
        id: page.id,
        name: text(page.properties["Name"]) || "Event",
        start: date.start,
        end: date.end ?? undefined,
        allDay: !date.start.includes("T"),
        clientIds: (page.properties["Client"]?.relation ?? []).map((r) => r.id),
      };
    });
}

/** Creates an event linked to one client. `start` is a date or a date-time with offset. */
export async function createEventInNotion(clientId: string, name: string, start: string): Promise<void> {
  await notion(`/pages`, {
    method: "POST",
    body: {
      parent: { type: "data_source_id", data_source_id: EVENTS_DS },
      properties: {
        Name: { title: [{ type: "text", text: { content: name } }] },
        Client: { relation: [{ id: clientId }] },
        Date: { date: { start } },
      },
    },
  });
}

// ── Project Management Tracker ──────────────────────
// Only the Task title leaves the server; Assignee, Links and SOP are never read.
// Tasks with "Hide from client" ticked are never shown.

/** Titles of this client's unfinished tracker tasks due between today and `days` from now. */
export async function queryUpcomingWork(clientId: string, days: number): Promise<{ id: string; title: string; clientIds: string[] }[]> {
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const pages = await queryAll(TRACKER_DS, {
    filter: {
      and: [
        { property: "Client", relation: { contains: clientId } },
        { property: "Due Date", date: { on_or_after: today } },
        { property: "Due Date", date: { on_or_before: until } },
        { property: "Status", status: { does_not_equal: "Done" } },
        { property: "Hide from client", checkbox: { equals: false } },
      ],
    },
    sorts: [{ property: "Due Date", direction: "ascending" }],
  });
  // Belt and braces: never return a hidden task even if the filter changes.
  return pages.filter((page) => !page.properties["Hide from client"]?.checkbox).map((page) => ({
    id: page.id,
    title: text(page.properties["Task"]),
    clientIds: (page.properties["Client"]?.relation ?? []).map((r) => r.id),
  }));
}

// ── Page content ────────────────────────────────────

type NotionRichText = {
  plain_text: string;
  href: string | null;
  annotations?: { bold: boolean; italic: boolean; strikethrough: boolean; underline: boolean; code: boolean };
};
type Block = {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
};
type BlockData = {
  rich_text?: NotionRichText[];
  caption?: NotionRichText[];
  checked?: boolean;
  language?: string;
  url?: string;
  icon?: { type: string; emoji?: string } | null;
} & Partial<FileRef>;

const SAFE_HREF = /^(https?:|mailto:)/i;

function toRichText(parts: NotionRichText[] = []): RichText[] {
  return parts.map((t) => ({
    text: t.plain_text,
    // Only keep web and email links; drop anything else (e.g. javascript:).
    href: t.href && SAFE_HREF.test(t.href) ? t.href : undefined,
    ...t.annotations,
  }));
}

const TEXT_BLOCKS = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "quote",
  "bulleted_list_item",
  "numbered_list_item",
  "toggle",
]);
const MAX_DEPTH = 3;

async function listChildren(blockId: string): Promise<Block[]> {
  const blocks: Block[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion<{ results: Block[]; has_more: boolean; next_cursor: string | null }>(
      `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
    );
    blocks.push(...res.results);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return blocks;
}

async function toContent(blocks: Block[], depth: number): Promise<ContentBlock[]> {
  // Fetch every block's nested content at once instead of one after another.
  const nested = await Promise.all(
    blocks.map((b) =>
      b.has_children && depth < MAX_DEPTH && b.type !== "child_page" && b.type !== "child_database"
        ? listChildren(b.id).then((children) => toContent(children, depth + 1))
        : Promise.resolve(undefined),
    ),
  );
  const out: ContentBlock[] = [];
  for (const [i, block] of blocks.entries()) {
    const data = (block[block.type] ?? {}) as BlockData;
    if (block.type === "child_page" || block.type === "child_database") {
      // Sub-pages aren't expanded into the task; show their title only.
      const title = (block[block.type] as { title?: string })?.title;
      if (title) out.push({ type: "paragraph", text: [{ text: `📄 ${title}`, bold: true }] });
      continue;
    }
    const children = nested[i];
    const fileUrl = data.type === "external" ? data.external?.url : data.type === "file" ? data.file?.url : data.url;

    if (TEXT_BLOCKS.has(block.type)) {
      out.push({ type: block.type as "paragraph", text: toRichText(data.rich_text), children });
    } else if (block.type === "to_do") {
      out.push({ type: "to_do", text: toRichText(data.rich_text), checked: Boolean(data.checked), children });
    } else if (block.type === "callout") {
      out.push({ type: "callout", text: toRichText(data.rich_text), icon: data.icon?.emoji, children });
    } else if (block.type === "code") {
      out.push({ type: "code", text: toRichText(data.rich_text), language: data.language });
    } else if (block.type === "divider") {
      out.push({ type: "divider" });
    } else if (block.type === "image" && fileUrl) {
      out.push({ type: "image", url: fileUrl, caption: toRichText(data.caption) });
    } else if (["video", "embed", "bookmark", "link_preview", "file", "pdf"].includes(block.type) && fileUrl && SAFE_HREF.test(fileUrl)) {
      out.push({ type: "media", url: fileUrl, caption: toRichText(data.caption) });
    } else if (children?.length) {
      // Unknown containers (columns, synced blocks): keep their contents.
      out.push(...children);
    }
  }
  return out;
}

// Page bodies change rarely, so keep them for a minute. Notion's signed image
// links last an hour, so a short cache never serves an expired image.
const contentCache = new Map<string, { at: number; blocks: Promise<ContentBlock[]> }>();

/** The body of a Notion page as portal content blocks. */
export async function getPageContent(pageId: string): Promise<ContentBlock[]> {
  const hit = contentCache.get(pageId);
  if (hit && Date.now() - hit.at < CONTENT_TTL_MS) return hit.blocks;
  const blocks = listChildren(pageId).then((children) => toContent(children, 0));
  contentCache.set(pageId, { at: Date.now(), blocks });
  blocks.catch(() => contentCache.delete(pageId)); // don't keep failures
  return blocks;
}

// Reads and writes client data in Notion. Server-only: NOTION_TOKEN never
// reaches the browser. Property names must match the Notion databases exactly.

import "server-only";
import { cache } from "react";
import type { AdCreative, AdStage, Client, ClientEvent, ClientIcon, ContentBlock, PortalUser, RichText, TableBlock, TaskRecord, TaskStatus } from "@/lib/types";

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

export const CLIENTS_DS = process.env.NOTION_CLIENTS_DS ?? "3b904bbf-db00-8005-95df-000b8d13711a";
export const TASKS_DS = process.env.NOTION_TASKS_DS ?? "3e404bbf-db00-804b-9f7d-000bd5b01c9e";
export const EVENTS_DS = process.env.NOTION_EVENTS_DS ?? "3e404bbf-db00-8058-8f62-000bc97aa059";
const CONTENT_TTL_MS = 60_000; // how long page content and template icons are cached
export const TRACKER_DS = process.env.NOTION_TRACKER_DS ?? "3c104bbf-db00-802e-b3e3-000bba4c7e16";
export const USERS_DS = process.env.NOTION_USERS_DS ?? "cbac4674-b2ff-472e-8057-dfe82c253644";
export const ADS_DS = process.env.NOTION_ADS_DS ?? "a3304bbf-db00-83b0-b86f-870de7f1283e";

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
    // Portal access requires a Status in Notion's "In progress" group (Onboarding or Active).
    // No Status and Inactive are locked out. Who can sign in lives in Portal Users.
    portalEnabled: IN_PROGRESS.includes(status),
  };
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

// ── Portal Users ────────────────────────────────────
// One row per person who can sign in: Name (title), Email, Client (relation),
// Status (Active / Removed), Role (Client / FunnelHaus team), Added by (select),
// Last signed in (date). FunnelHaus team rows have no Client and see every client.

function toPortalUser(page: Page): PortalUser {
  const p = page.properties;
  return {
    id: page.id,
    name: text(p["Name"]),
    email: (p["Email"]?.email ?? "").trim(),
    clientId: p["Client"]?.relation?.[0]?.id ?? "",
    active: option(p["Status"]) === "Active",
    role: option(p["Role"]) === "FunnelHaus team" ? "FunnelHaus team" : "Client",
    addedBy: option(p["Added by"]) || undefined,
    lastSignedIn: p["Last signed in"]?.date?.start ?? undefined,
  };
}

/**
 * Active users with this email, matched ignoring case. Notion's email filter is
 * case-sensitive and rows are sometimes typed by hand, so compare here instead.
 */
export async function findActiveUsersByEmail(email: string): Promise<PortalUser[]> {
  const wanted = email.trim().toLowerCase();
  const pages = await queryAll(USERS_DS, { filter: { property: "Status", select: { equals: "Active" } } });
  return pages
    .filter((page) => !page.in_trash)
    .map(toPortalUser)
    .filter((u) => u.active && (u.clientId || u.role === "FunnelHaus team") && u.email.toLowerCase() === wanted);
}

/** A single user, but only if the page really lives in Portal Users. */
export const getPortalUser = cache(async (userId: string): Promise<PortalUser | null> => {
  try {
    const page = await notion<Page>(`/pages/${userId}`);
    if (page.in_trash || page.archived || normalise(page.parent?.data_source_id ?? "") !== normalise(USERS_DS)) return null;
    return toPortalUser(page);
  } catch {
    return null;
  }
});

/** Everyone who has (or had) access to this client, oldest first. */
export async function queryClientUsers(clientId: string): Promise<PortalUser[]> {
  const pages = await queryAll(USERS_DS, {
    filter: { property: "Client", relation: { contains: clientId } },
    sorts: [{ timestamp: "created_time", direction: "ascending" }],
  });
  return pages.filter((page) => !page.in_trash).map(toPortalUser);
}

/** FunnelHaus team members (active or removed), oldest first. */
export async function queryTeamMembers(): Promise<PortalUser[]> {
  const pages = await queryAll(USERS_DS, {
    filter: { property: "Role", select: { equals: "FunnelHaus team" } },
    sorts: [{ timestamp: "created_time", direction: "ascending" }],
  });
  return pages.filter((page) => !page.in_trash).map(toPortalUser);
}

export async function createPortalUserInNotion(user: {
  name: string;
  email: string;
  clientId?: string;
  role?: PortalUser["role"];
  addedBy: string;
}): Promise<PortalUser> {
  const page = await notion<Page>(`/pages`, {
    method: "POST",
    body: {
      parent: { type: "data_source_id", data_source_id: USERS_DS },
      properties: {
        Name: { title: [{ type: "text", text: { content: user.name } }] },
        Email: { email: user.email },
        Client: { relation: user.clientId ? [{ id: user.clientId }] : [] },
        Status: { select: { name: "Active" } },
        Role: { select: { name: user.role ?? "Client" } },
        "Added by": { select: { name: user.addedBy } },
      },
    },
  });
  return toPortalUser(page);
}

/** Writes only the Status property. */
export async function setPortalUserStatusInNotion(userId: string, status: "Active" | "Removed"): Promise<void> {
  await notion(`/pages/${userId}`, { method: "PATCH", body: { properties: { Status: { select: { name: status } } } } });
}

/** Writes only "Last signed in". */
export async function setLastSignedInInNotion(userId: string, at: string): Promise<void> {
  await notion(`/pages/${userId}`, { method: "PATCH", body: { properties: { "Last signed in": { date: { start: at } } } } });
}

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

/** The clients an event is linked to, or null if the page isn't an event. */
export async function getEventClientIds(eventId: string): Promise<string[] | null> {
  try {
    const page = await notion<Page>(`/pages/${eventId}`);
    if (page.in_trash || page.archived || normalise(page.parent?.data_source_id ?? "") !== normalise(EVENTS_DS)) return null;
    return (page.properties["Client"]?.relation ?? []).map((r) => r.id);
  } catch {
    return null;
  }
}

/** Changes only an event's Name and Date. */
export async function updateEventInNotion(eventId: string, name: string, start: string): Promise<void> {
  await notion(`/pages/${eventId}`, {
    method: "PATCH",
    body: {
      properties: {
        Name: { title: [{ type: "text", text: { content: name } }] },
        Date: { date: { start } },
      },
    },
  });
}

/** Moves an event to Notion's trash, where it can still be restored for 30 days. */
export async function trashEventInNotion(eventId: string): Promise<void> {
  await notion(`/pages/${eventId}`, { method: "PATCH", body: { in_trash: true } });
}

// ── Ad Creatives ────────────────────────────────────
// Fields used: Ad ID (title), Client (relation), Status (status), Ad Format,
// Length (Sec), Due date, File Drive Link. Performance data (ROAS, CTR, tags,
// notes) is internal and never read. Rejected and Unused ads are never shown.

// Notion statuses grouped into the columns a client sees.
const AD_STAGES: Record<string, AdStage> = {
  "Not started": "planned",
  Scripting: "planned",
  "Script review": "review",
  "Ready to film": "film",
  Filmed: "editing",
  Editing: "editing",
  "Ready for upload": "launch",
  Live: "live",
};

type AdRecord = AdCreative & { clientIds: string[] };

function toAd(page: Page): AdRecord | null {
  const p = page.properties;
  const stage = AD_STAGES[option(p["Status"]) || "Not started"];
  if (!stage) return null; // Rejected, Unused or an unknown status
  return {
    id: page.id,
    name: text(p["Ad ID"]) || "Untitled ad",
    stage,
    format: option(p["Ad Format"]) || undefined,
    lengthSeconds: text(p["Length (Sec)"]) || undefined,
    due: p["Due date"]?.date?.start ?? undefined,
    driveUrl: safeUrl(p["File Drive Link"]?.url),
    clientIds: (p["Client"]?.relation ?? []).map((r) => r.id),
  };
}

/** This client's ads that are in production or live. */
export async function queryClientAds(clientId: string): Promise<AdRecord[]> {
  const pages = await queryAll(ADS_DS, {
    filter: { property: "Client", relation: { contains: clientId } },
    sorts: [{ timestamp: "created_time", direction: "ascending" }],
  });
  return pages.filter((page) => !page.in_trash).map(toAd).filter((ad): ad is AdRecord => ad !== null);
}

/** A single ad, but only if the page really lives in Ad Creatives and isn't hidden. */
export async function getAdPage(adId: string): Promise<AdRecord | null> {
  try {
    const page = await notion<Page>(`/pages/${adId}`);
    if (page.in_trash || page.archived || normalise(page.parent?.data_source_id ?? "") !== normalise(ADS_DS)) return null;
    return toAd(page);
  } catch {
    return null;
  }
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
  color?: string;
  is_toggleable?: boolean;
  table_width?: number;
  has_column_header?: boolean;
  has_row_header?: boolean;
  cells?: NotionRichText[][];
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
      b.type === "table"
        ? Promise.resolve(undefined)
        : b.has_children && depth < MAX_DEPTH && b.type !== "child_page" && b.type !== "child_database"
          ? listChildren(b.id).then((children) => toContent(children, depth + 1))
          : Promise.resolve(undefined),
    ),
  );
  // A table's rows are its children; tables are read whole at any depth.
  const tableRows = await Promise.all(blocks.map((b) => (b.type === "table" ? listChildren(b.id) : Promise.resolve(undefined))));
  const out: ContentBlock[] = [];
  for (const [i, block] of blocks.entries()) {
    const data = (block[block.type] ?? {}) as BlockData;
    if (block.type === "child_page") {
      // Sub-pages aren't expanded into the task, unless they're a translated version.
      const title = (block.child_page as { title?: string })?.title ?? "";
      out.push({ type: "subpage", id: block.id, title, flag: flagIn(title) });
      continue;
    }
    if (block.type === "child_database") {
      const title = (block.child_database as { title?: string })?.title;
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
    } else if (block.type === "table") {
      out.push(toTable(data, tableRows[i] ?? []));
    } else if (block.type === "image" && fileUrl) {
      out.push({ type: "image", url: fileUrl, caption: toRichText(data.caption) });
    } else if (["video", "embed", "bookmark", "link_preview", "file", "pdf"].includes(block.type) && fileUrl && SAFE_HREF.test(fileUrl)) {
      out.push({ type: "media", url: fileUrl, caption: toRichText(data.caption) });
    } else if (children?.length) {
      // Unknown containers (columns, synced blocks): keep their contents,
      // except a row like "🇩🇪 German version 👉 [sub-page]", which becomes that translation.
      const translation = asTranslationRow(children);
      if (translation) out.push(translation);
      else out.push(...children);
    }
  }
  return out;
}

const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
const flagIn = (text: string) => text.match(FLAG)?.[0];

/** A short flag label next to a single sub-page marks that sub-page as a translated version. */
function asTranslationRow(blocks: ContentBlock[]): ContentBlock | null {
  const pages = blocks.filter((b) => b.type === "subpage");
  const rest = blocks.filter((b) => b.type !== "subpage");
  if (pages.length !== 1 || rest.some((b) => b.type !== "paragraph")) return null;
  const label = rest.map((b) => ("text" in b ? b.text.map((t) => t.text).join("") : "")).join(" ").trim();
  const flag = flagIn(label);
  const page = pages[0] as Extract<ContentBlock, { type: "subpage" }>;
  return flag && label.length <= 60 ? { ...page, flag: page.flag ?? flag } : null;
}

const ANSWER_HEADER = /^your answers?$/i;

function toTable(data: BlockData, rows: Block[]): TableBlock {
  const header = Boolean(data.has_column_header);
  const cells = rows.map((r) => ((r.table_row as BlockData | undefined)?.cells ?? []).map((c) => toRichText(c)));
  const headerTexts = header ? (cells[0] ?? []).map((c) => c.map((t) => t.text).join("").trim()) : [];
  const answer = headerTexts.findIndex((t) => ANSWER_HEADER.test(t));
  return {
    type: "table",
    index: -1, // numbered once the whole page is read
    header,
    answerColumn: answer >= 0 ? answer : undefined,
    rows: cells,
    rowIds: rows.map((r) => r.id),
  };
}

/** Numbers tables in reading order so the browser can say which one an answer belongs to. */
function numberTables(blocks: ContentBlock[], counter = { n: 0 }): ContentBlock[] {
  for (const block of blocks) {
    if (block.type === "table") block.index = counter.n++;
    if ("children" in block && block.children) numberTables(block.children, counter);
  }
  return blocks;
}

async function readContent(pageId: string): Promise<ContentBlock[]> {
  return numberTables(await toContent(await listChildren(pageId), 0));
}

// Template bodies change rarely, so keep them for a minute. Notion's signed image
// links last an hour, so a short cache never serves an expired image.
const contentCache = new Map<string, { at: number; blocks: Promise<ContentBlock[]> }>();

/**
 * The body of a Notion page as portal content blocks. `fresh` skips the cache,
 * for pages clients write to, so they always see their latest answers.
 */
export async function getPageContent(pageId: string, { fresh = false } = {}): Promise<ContentBlock[]> {
  if (fresh) return readContent(pageId);
  const hit = contentCache.get(pageId);
  if (hit && Date.now() - hit.at < CONTENT_TTL_MS) return hit.blocks;
  const blocks = readContent(pageId);
  contentCache.set(pageId, { at: Date.now(), blocks });
  blocks.catch(() => contentCache.delete(pageId)); // don't keep failures
  return blocks;
}

// ── Copying a template into a task ──────────────────
// Clients answer on their own task page, never on the shared template, so the
// template's body is copied across the first time they answer.

const TEXT_LIMIT = 2000; // Notion's limit for one piece of rich text

type OutRichText = { type: "text"; text: { content: string; link: { url: string } | null }; annotations?: NotionRichText["annotations"] };

/** Rich text as plain text runs (mentions become their visible text). */
function toOutRichText(parts: NotionRichText[] = []): OutRichText[] {
  return parts.flatMap((t) =>
    chunk(t.plain_text).map((content) => ({
      type: "text" as const,
      text: { content, link: t.href && SAFE_HREF.test(t.href) ? { url: t.href } : null },
      ...(t.annotations ? { annotations: t.annotations } : {}),
    })),
  );
}

function chunk(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; i += TEXT_LIMIT) out.push(value.slice(i, i + TEXT_LIMIT));
  return out;
}

const COPYABLE_TEXT = new Set([...TEXT_BLOCKS, "to_do", "callout", "code"]);
const COPYABLE_MEDIA = new Set(["image", "video", "file", "pdf"]);

type CopyItem = { payload: Record<string, unknown>; source?: Block };

/** Turns source blocks into blocks Notion will accept. Hosted files can't be copied and are left out. */
async function toCopyItems(blocks: Block[]): Promise<CopyItem[]> {
  const items: CopyItem[] = [];
  for (const block of blocks) {
    const data = (block[block.type] ?? {}) as BlockData;
    const t = block.type;
    if (COPYABLE_TEXT.has(t)) {
      const body: Record<string, unknown> = { rich_text: toOutRichText(data.rich_text) };
      if (data.color) body.color = data.color;
      if (t === "to_do") body.checked = Boolean(data.checked);
      if (t === "code") body.language = data.language ?? "plain text";
      if (t === "callout" && data.icon?.type === "emoji") body.icon = { type: "emoji", emoji: data.icon.emoji };
      if (t.startsWith("heading_") && data.is_toggleable) body.is_toggleable = true;
      items.push({ payload: { type: t, [t]: body }, source: block.has_children ? block : undefined });
    } else if (t === "divider") {
      items.push({ payload: { type: "divider", divider: {} } });
    } else if (t === "table") {
      const rows = await listChildren(block.id);
      items.push({
        payload: {
          type: "table",
          table: {
            table_width: data.table_width,
            has_column_header: Boolean(data.has_column_header),
            has_row_header: Boolean(data.has_row_header),
            children: rows.map((r) => ({
              type: "table_row",
              table_row: { cells: ((r.table_row as BlockData | undefined)?.cells ?? []).map((c) => toOutRichText(c)) },
            })),
          },
        },
      });
    } else if (COPYABLE_MEDIA.has(t) && data.type === "external" && data.external?.url) {
      items.push({ payload: { type: t, [t]: { type: "external", external: { url: data.external.url }, caption: toOutRichText(data.caption) } } });
    } else if ((t === "bookmark" || t === "embed" || t === "link_preview") && data.url) {
      items.push({ payload: { type: "bookmark", bookmark: { url: data.url } } });
    } else if (block.has_children && t !== "child_page" && t !== "child_database") {
      // Columns, synced blocks and the like: keep their contents, drop the wrapper.
      items.push(...(await toCopyItems(await listChildren(block.id))));
    }
  }
  return items;
}

async function appendCopies(targetId: string, items: CopyItem[], depth: number): Promise<void> {
  for (let i = 0; i < items.length; i += 100) {
    const batch = items.slice(i, i + 100);
    const res = await notion<{ results: { id: string }[] }>(`/blocks/${targetId}/children`, {
      method: "PATCH",
      body: { children: batch.map((b) => b.payload) },
    });
    // Nested content goes in afterwards, under the block it was copied into.
    for (const [j, item] of batch.entries()) {
      if (item.source && depth < MAX_DEPTH && res.results[j]) {
        await appendCopies(res.results[j].id, await toCopyItems(await listChildren(item.source.id)), depth + 1);
      }
    }
  }
}

/** Copies one page's body onto the end of another (normally an empty task page). */
export async function copyPageContent(fromPageId: string, toPageId: string): Promise<void> {
  await appendCopies(toPageId, await toCopyItems(await listChildren(fromPageId)), 0);
}

/** Replaces one cell of a table row, keeping the row's other cells as they are. */
export async function setTableCellInNotion(rowId: string, cells: RichText[][], column: number, value: string): Promise<void> {
  const out = cells.map((cell, i) =>
    i === column
      ? chunk(value).map((content) => ({ type: "text" as const, text: { content, link: null } }))
      : toOutRichText(
          cell.map((t) => ({
            plain_text: t.text,
            href: t.href ?? null,
            annotations: {
              bold: Boolean(t.bold),
              italic: Boolean(t.italic),
              strikethrough: Boolean(t.strikethrough),
              underline: Boolean(t.underline),
              code: Boolean(t.code),
            },
          })),
        ),
  );
  await notion(`/blocks/${rowId}`, { method: "PATCH", body: { table_row: { cells: out } } });
}

// Shapes of the records the portal reads from Notion.
// Each type mirrors one of the master databases in the portal brief.

export type TaskStatus = "Not Started" | "In Progress" | "Complete";

export type ClientIcon = { type: "emoji"; value: string } | { type: "image"; url: string };

export interface Client {
  id: string;
  name: string;
  icon?: ClientIcon;
  contactFirstName: string;
  contactEmails: string[];
  status: "Onboarding" | "Active" | "Inactive";
  rawStatus?: string; // the exact Notion Status, e.g. "No Status"
  portalEnabled: boolean;
  // Folder links shown in the Resources card.
  driveFolderUrl?: string; // Client Database → "Google Drive Folder"
  assetFolderUrl?: string; // Client Database → "Asset upload folder"
}

// A person who can sign in to a client's portal (Portal Users database).
export interface PortalUser {
  id: string;
  name: string;
  email: string;
  clientId: string;
  active: boolean;
  role: "Client" | "FunnelHaus team"; // FunnelHaus team members see every client and have no clientId
  addedBy?: string; // "Onboarding form" | "FunnelHaus" | "Client"
  lastSignedIn?: string; // ISO date-time
}

// A task from the Client Tasks database. Only these fields are read; SOP stays in Notion.
export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  icon?: string; // the task page's emoji
  clientResponse?: string;
  priority?: string; // Priority Group, e.g. "Priority Group 1"
}

export interface TaskRecord extends Task {
  clientId: string;
  templateId?: string; // Task Templates page this task was created from
}

// An ad from the Ad Creatives database, as a client sees it on their Ads board.
export type AdStage = "planned" | "review" | "film" | "editing" | "launch" | "live";
export interface AdCreative {
  id: string;
  name: string; // "Ad ID" in Notion
  stage: AdStage;
  format?: string;
  lengthSeconds?: string;
  due?: string; // ISO date
  driveUrl?: string;
}

// An entry in the Client Events database (webinars, calls, launches…).
export interface ClientEvent {
  id: string;
  name: string;
  start: string; // ISO date, or date-time with offset
  end?: string;
  allDay: boolean;
  editable?: boolean; // linked to this client only, so they may edit or delete it
}

// Page content from Notion, reduced to what the portal renders.
export interface RichText {
  text: string;
  href?: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
}

export type ContentBlock =
  | {
      type: "paragraph" | "heading_1" | "heading_2" | "heading_3" | "quote" | "bulleted_list_item" | "numbered_list_item" | "toggle";
      text: RichText[];
      children?: ContentBlock[];
    }
  | { type: "to_do"; text: RichText[]; checked: boolean; children?: ContentBlock[] }
  | { type: "callout"; text: RichText[]; icon?: string; children?: ContentBlock[] }
  | { type: "code"; text: RichText[]; language?: string }
  | { type: "divider" }
  | { type: "image"; url: string; caption: RichText[] }
  | { type: "media"; url: string; caption: RichText[] }
  | { type: "subpage"; id: string; title: string; flag?: string } // `flag`: a translated version, e.g. "🇩🇪"
  | { type: "translation"; flag: string; label: string; blocks: ContentBlock[] }
  | TableBlock;

// A Notion table. A header cell reading "Your Answer" makes that column fillable
// by the client; `index` is the table's position on the page, used to save answers.
export interface TableBlock {
  type: "table";
  index: number;
  header: boolean;
  answerColumn?: number;
  rows: RichText[][][]; // rows → cells → text
  rowIds?: string[]; // Notion block ids; server-only, never passed to the browser
}

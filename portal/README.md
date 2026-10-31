# FunnelHaus Client Portal

A client-facing view of FunnelHaus's Notion workspace. Clients sign in and see only
their own tasks, events, folders and this week's work. Notion stays the source of truth.

## Notion databases used

| Database | Used for |
| --- | --- |
| 👤 Client Database | Name, logo, Status, folder links |
| 👥 Portal Users | Who can sign in: Name, Email, Client, Role (Client / FunnelHaus team), Status (Active / Removed), Added by, Last signed in |
| 🔌 Client Tasks | The client's tasks (Task, Client, Status, Client Response) and page content |
| 📊 Project Management Tracker | "What we're working on this week" on Home (unfinished tasks due in 7 days). **Event** rows are the "Coming up" events on Home (clients can add, edit and delete their own, but not milestones), using Task, Due Date and Client links. The Launch calendar shows rows with **Milestone** or **Event** ticked, with the page icon, and opens a pop-up with the Client links and page body (TBC when both are empty). Milestones have no default icon and get brighter as they move along: grey with no body or Client links ("Coming soon"), light red with content ("In progress"), solid red once Status is Done ("Ready to go"), and greyed and crossed out once **Posted** is ticked. Past events are greyed out. "Hide from client" rows are never shown. In a **milestone** pop-up clients can **Approve** (ticks Client Approved and fills Approved by and Approved on; Undo clears them), **edit** the page's text (paragraphs, headings, lists, to-dos, quotes and callouts; images, tables and sub-pages stay as they are; an edited paragraph loses its bold, italics and links). Approving locks editing until it's undone. Once approved, the client can **Mark as posted** (ticks Posted; "Not posted yet" clears it). Approval can't be undone while Posted is ticked. Edits are refused if the page changed since the editor opened |
| 🪄 Ad Creatives | The Ads board: one column per Status option, read from the database in Notion's order, so adding, renaming or removing a status in Notion changes the board (within a minute). Rejected and Unused are hidden. Clients drag ads between columns, which sets that Status in Notion |
| ✔️ SOP Hub → Filming ads guide | Shown in the "Watch this first" pop-up on the Ads page (refreshed within a minute of edits). Override the page with `NOTION_FILMING_GUIDE_PAGE` |

The Notion integration must have access to the FunnelHaus HQ page.

## Settings (`.env.local` locally, Environment Variables on Vercel)

| Name | What it is |
| --- | --- |
| `NOTION_TOKEN` | Notion internal integration secret |
| `SESSION_SECRET` | Random string that signs login cookies and sign-in codes (`openssl rand -base64 32`) |
| `MAKE_PORTAL_EMAIL_WEBHOOK_URL` | Webhook of the Make scenario "FunnelHaus Portal Emails", which sends sign-in codes and teammate welcomes |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash for Redis, added in Vercel under Storage. Holds sign-in codes and rate limits. Optional locally (falls back to memory), required in production |
| `GHL_CLIENTS` | Optional. Connects a client's GoHighLevel to their Results page, as JSON keyed by the client's Notion page id: `{"<notion id>": {"locationId": "...", "token": "pit-..."}}` (add `"appUrl"` for a white-label GHL domain). The token is a Private Integration with `contacts.readonly`, `locations/customFields.readonly` and `locations/tags.readonly`. Clients not listed see "coming soon" |
| `META_CLIENTS` | Optional. Adds ad spend and costs to a client's Results page, as JSON keyed by the client's Notion page id: `{"<notion id>": {"adAccountId": "...", "campaigns": ["[Webinar] Purchase Campaign"]}}`. Only campaigns whose name exactly matches one listed count (ad accounts can be shared between clients); use the campaign names Trakyo shows as ad sources |
| `META_ACCESS_TOKEN` | Needed with `META_CLIENTS`: a Meta system user token with `ads_read` on those ad accounts. Until it's set, spend tiles show "Couldn't load from Meta" |
| `ADMIN_EMAIL` | Optional, defaults to `info@funnelhaus.co` |

## Signing in

There are no passwords. Someone enters their email, gets a 6-digit code (valid for 10 minutes, 5 tries) and stays
signed in for 30 days (7 for admin). Anyone with an **Active** row in Portal Users, linked to an Onboarding or Active
client, can sign in. `ADMIN_EMAIL` and Active rows with Role **FunnelHaus team** (no Client needed) sign in as admin
and can view every client.

- **Add someone:** add a row in Portal Users, or the client adds them from the portal's Team page.
- **Add a FunnelHaus team member:** add a row with Role FunnelHaus team, or use the FunnelHaus team section of the Team page (admins only).
- **Remove someone:** set their Status to Removed (or remove them on the Team page). They're signed out on their next click.
- Code requests and wrong guesses are rate-limited per email and per IP address, shared across all servers via Upstash.

## Commands

```bash
npm run dev    # local development on http://localhost:3000
npm run build  # production build (what Vercel runs)
```

## Results page (GoHighLevel)

For clients in `GHL_CLIENTS`, Results shows webinar registrants: contacts tagged `webinar-registrant`, with the webinar taken from tags like `1nov2026-registered` (or the older `14-october-2026-webinar`). Where people came from blends Trakyo and UTMs: **Source** and **Content** use the `contact.trakyo_source` / `trakyo_content` fields (Trakyo's first touch), falling back to `contact.utm_source` and `utm_content` / `utm_campaign` (then GHL's own attribution) for contacts Trakyo didn't track. **Ad** names the ad for people who came from one: Trakyo's content when their Trakyo source is an ad campaign (a non-platform source whose people mostly have a paid `utm_medium`), otherwise, for a paid UTM, the name Trakyo gave that `utm_content` ad id on other contacts. **Last touch** is `contact.trakyo_last_touch`, and **Tracked by** says which of the two was used. Data is cached for 5 minutes, and only dates, webinar names and sources reach the browser (no names or emails).

If the client's GHL has a `contact.vip_ticket_purchased` field, Results also shows **VIP purchases** (registrants where it is `Yes`). For clients in `META_CLIENTS`, it shows **Ad spend**, **Cost per registrant** and **Cost per VIP purchase**: Meta spend per day for the campaigns named in `campaigns` (exact match), converted to USD at each day's ECB rate (frankfurter.dev; weekends use the last working day). Spend follows the Date filter, and for a chosen webinar covers the days after the previous webinar up to that webinar's day. It can't be split by source or ad, so it shows "—" while one of those filters is on. Cached for 15 minutes.


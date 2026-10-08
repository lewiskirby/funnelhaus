# FunnelHaus Client Portal

A client-facing view of FunnelHaus's Notion workspace. Clients sign in and see only
their own tasks, events, folders and this week's work. Notion stays the source of truth.

## Notion databases used

| Database | Used for |
| --- | --- |
| 👤 Client Database | Name, logo, Status, folder links |
| 👥 Portal Users | Who can sign in: Name, Email, Client, Role (Client / FunnelHaus team), Status (Active / Removed), Added by, Last signed in |
| 🔌 Client Tasks | The client's tasks (Task, Client, Status, Client Response) and page content |
| 📊 Project Management Tracker | "What we're working on this week" on Home (unfinished tasks due in 7 days). **Event** rows are the "Coming up" events on Home (clients can add, edit and delete their own, but not milestones), using Task, Due Date and Client links. The Launch calendar shows rows with **Milestone** or **Event** ticked, with the page icon, and opens a pop-up with the Client links and page body (TBC when both are empty). Past items are greyed out. "Hide from client" rows are never shown |

The Notion integration must have access to the FunnelHaus HQ page.

## Settings (`.env.local` locally, Environment Variables on Vercel)

| Name | What it is |
| --- | --- |
| `NOTION_TOKEN` | Notion internal integration secret |
| `SESSION_SECRET` | Random string that signs login cookies and sign-in codes (`openssl rand -base64 32`) |
| `MAKE_PORTAL_EMAIL_WEBHOOK_URL` | Webhook of the Make scenario "FunnelHaus Portal Emails", which sends sign-in codes and teammate welcomes |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash for Redis, added in Vercel under Storage. Holds sign-in codes and rate limits. Optional locally (falls back to memory), required in production |
| `GHL_CLIENTS` | Optional. Connects a client's GoHighLevel to their Results page, as JSON keyed by the client's Notion page id: `{"<notion id>": {"locationId": "...", "token": "pit-..."}}` (add `"appUrl"` for a white-label GHL domain). The token is a Private Integration with `contacts.readonly` and `locations/customFields.readonly`. Clients not listed see "coming soon" |
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

For clients in `GHL_CLIENTS`, Results shows webinar registrants: contacts tagged `webinar-registrant`, with the webinar taken from tags like `14-october-2026-webinar`. UTMs come from the `contact.utm_source` / `utm_medium` / `utm_campaign` / `utm_content` custom fields, falling back to GHL's own attribution. Data is cached for 5 minutes, and only dates, webinar names and UTMs reach the browser (no names or emails).


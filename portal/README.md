# FunnelHaus Client Portal

A client-facing view of FunnelHaus's Notion workspace. Clients sign in and see only
their own tasks, events, folders and this week's work. Notion stays the source of truth.

## Notion databases used

| Database | Used for |
| --- | --- |
| 👤 Client Database | Sign-in (Email + Login access), name, logo, Status, folder links |
| 🔌 Client Tasks | The client's tasks (Task, Client, Status, Client Response) and page content |
| 📅 Client Events | "Coming up" on Home; clients can add events |
| 📊 Project Management Tracker | "What we're working on this week" (skips "Hide from client") |

The Notion integration must have access to the FunnelHaus HQ page.

## Settings (`.env.local` locally, Environment Variables on Vercel)

| Name | What it is |
| --- | --- |
| `NOTION_TOKEN` | Notion internal integration secret |
| `SESSION_SECRET` | Random string that signs login cookies (`openssl rand -base64 32`) |
| `ADMIN_PASSWORD_HASH` | Admin password hash — create with `npm run hash-password` |
| `ADMIN_EMAIL` | Optional, defaults to `info@funnelhaus.co` |

## Passwords

Client passwords live in **Login access** on the Client Database, stored as a hash.
To reset one, type a temporary password into Login access and send it to the client;
it's replaced with a hash the first time they sign in.

## Commands

```bash
npm run dev            # local development on http://localhost:3000
npm run build          # production build (what Vercel runs)
npm run hash-password  # generate ADMIN_PASSWORD_HASH
```

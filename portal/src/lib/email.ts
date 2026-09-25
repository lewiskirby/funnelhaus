// Sends portal emails through the "FunnelHaus Portal Emails" Make scenario, which
// writes and sends them from info@funnelhaus.co. The portal only passes a type and
// the details; Make owns the wording, so the webhook can't send arbitrary email.

import "server-only";

type PortalEmail =
  | { type: "code"; email: string; code: string }
  | { type: "invite"; email: string; name: string; client_name: string; inviter: string }
  | { type: "staff_invite"; email: string; name: string; inviter: string };

export async function sendPortalEmail(message: PortalEmail): Promise<void> {
  const url = process.env.MAKE_PORTAL_EMAIL_WEBHOOK_URL;
  if (!url) throw new Error("MAKE_PORTAL_EMAIL_WEBHOOK_URL is not set");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Portal email webhook responded ${res.status}`);
}

// Signed session cookie. A client session holds the signed-in person (a Portal
// Users row) and their client; an admin session holds `admin: true` plus the
// client currently being viewed.
// The signature (HMAC-SHA256 with SESSION_SECRET) means the browser can hold
// the cookie but can't change who it belongs to or which client it points at.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getClient, getClientForAdmin, getSignedInTeamMember, getSignedInUser, listClientsForAdmin } from "@/lib/data";
import type { Client, PortalUser } from "@/lib/types";

const COOKIE = "fh_session";
const CLIENT_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const ADMIN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

type SessionPayload = { userId?: string; clientId?: string; admin?: true; exp: number };

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
  return "dev-only-secret-do-not-use-in-production";
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

function decode(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    // Client sessions from before per-person sign-in (no userId) are no longer valid.
    if (!payload.admin && (typeof payload.clientId !== "string" || typeof payload.userId !== "string")) return null;
    return payload;
  } catch {
    return null;
  }
}

async function write(payload: Omit<SessionPayload, "exp">, maxAge: number) {
  (await cookies()).set(COOKIE, encode({ ...payload, exp: Date.now() + maxAge * 1000 }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function createSession(userId: string, clientId: string) {
  await write({ userId, clientId }, CLIENT_MAX_AGE);
}

/** `userId`: a FunnelHaus team member's Portal Users row (none for ADMIN_EMAIL). */
export async function createAdminSession(clientId?: string, userId?: string) {
  await write({ admin: true, clientId, userId }, ADMIN_MAX_AGE);
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

type Session = { client: Client | null; isAdmin: boolean; user?: PortalUser };

/** Who is signed in and which client they're viewing. Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const payload = decode((await cookies()).get(COOKIE)?.value);
  if (!payload) return null;

  if (payload.admin) {
    // FunnelHaus team members are re-checked on every request, like clients.
    const user = payload.userId ? await getSignedInTeamMember(payload.userId) : undefined;
    if (user === null) return null;
    // Admins can view any client; fall back to the first one if none is chosen.
    let client = payload.clientId ? await getClientForAdmin(payload.clientId) : null;
    if (!client) {
      const [first] = await listClientsForAdmin();
      client = first ? await getClientForAdmin(first.id) : null;
    }
    return { client, isAdmin: true, user };
  }

  // Re-checked on every request, so removing someone in Notion signs them out on their next click.
  const [user, client] = await Promise.all([getSignedInUser(payload.userId!, payload.clientId!), getClient(payload.clientId!)]);
  return user && client ? { client, isAdmin: false, user } : null;
});

export async function getSessionClient(): Promise<Client | null> {
  return (await getSession())?.client ?? null;
}

/** Use at the top of every portal page and server action. */
export async function requireClient(): Promise<Client> {
  const client = await getSessionClient();
  if (!client) redirect("/login");
  return client;
}

/** The signed-in FunnelHaus team member's row, if an admin session belongs to one. */
export async function sessionUserId(): Promise<string | undefined> {
  return (await getSession())?.user?.id;
}

/** Only for admin-only actions such as switching client. */
export async function requireAdmin(): Promise<void> {
  if (!(await getSession())?.isAdmin) redirect("/login");
}

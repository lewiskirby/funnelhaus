// Passwordless sign-in: a 6-digit code is emailed and must be entered within
// 10 minutes. Codes are stored hashed in the shared store, each allows 5 tries,
// and requests and guesses are rate-limited per email and per IP address.

import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { findSignInAccount, type SignInAccount } from "@/lib/data";
import { sendPortalEmail } from "@/lib/email";
import { kvDel, kvGet, kvSet, kvTtl } from "@/lib/kv";
import { limit } from "@/lib/rate-limit";

const CODE_TTL = 10 * 60; // seconds
const MAX_TRIES = 5; // wrong guesses per code
const WINDOW = 15 * 60; // rate-limit window, seconds

const normalise = (email: string) => email.trim().toLowerCase();

function hash(email: string, code: string) {
  const secret = process.env.SESSION_SECRET ?? "dev-only-secret-do-not-use-in-production";
  return createHmac("sha256", secret).update(`${normalise(email)}:${code}`).digest("base64url");
}

export type CodeRequest = { ok: true } | { ok: false; error: string };

/**
 * Emails a code if this email may sign in. The answer is the same either way,
 * so the sign-in page never reveals who has access.
 */
export async function requestCode(email: string, ip: string): Promise<CodeRequest> {
  const key = normalise(email);
  const wait = Math.max(await limit(`code-email:${key}`, 5, WINDOW), await limit(`code-ip:${ip}`, 20, WINDOW));
  if (wait) return { ok: false, error: `Too many codes requested. Please try again in ${wait} minute${wait === 1 ? "" : "s"}.` };

  const account = await findSignInAccount(email);
  if (!account) return { ok: true };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await kvSet(`code:${key}`, JSON.stringify({ hash: hash(key, code), tries: 0 }), CODE_TTL);
  try {
    await sendPortalEmail({ type: "code", email: account.email, code });
  } catch (err) {
    console.error("Sending sign-in code failed", err);
    await kvDel(`code:${key}`);
    return { ok: false, error: "We couldn't send your code just now. Please try again in a moment." };
  }
  return { ok: true };
}

export type CodeCheck = { ok: true; account: SignInAccount } | { ok: false; error: string };

export async function verifyCode(email: string, code: string, ip: string): Promise<CodeCheck> {
  const key = normalise(email);
  const wait = await limit(`verify-ip:${ip}`, 30, WINDOW);
  if (wait) return { ok: false, error: `Too many attempts. Please try again in ${wait} minute${wait === 1 ? "" : "s"}.` };

  const stored = await kvGet(`code:${key}`);
  if (!stored) return { ok: false, error: "That code has expired. Please request a new one." };
  const entry = JSON.parse(stored) as { hash: string; tries: number };

  const given = Buffer.from(hash(key, code.replace(/\D/g, "")));
  const expected = Buffer.from(entry.hash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    const tries = entry.tries + 1;
    if (tries >= MAX_TRIES) {
      await kvDel(`code:${key}`);
      return { ok: false, error: "Too many wrong codes. Please request a new one." };
    }
    // Keep the time that's left: a wrong guess never extends a code's life.
    await kvSet(`code:${key}`, JSON.stringify({ ...entry, tries }), Math.max(1, await kvTtl(`code:${key}`)));
    return { ok: false, error: "That code isn't right. Please check the email and try again." };
  }

  await kvDel(`code:${key}`); // each code works once
  // Re-check access now, in case it was removed while the code was in the inbox.
  const account = await findSignInAccount(email);
  if (!account) return { ok: false, error: "This email no longer has access to the portal." };
  return { ok: true, account };
}

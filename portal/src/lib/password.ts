// Password hashing. Stored values are never the password itself:
//   "scrypt:<salt>:<hash>"  (base64url) — written by the portal and the admin script
//   "sha256:<hex>"                     — written by Make for new clients (random 20-char passwords)
// Anything else in a client's "Login access" is a temporary plain password typed in
// Notion for a reset; the portal replaces it with a scrypt hash after the first sign-in.

import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

const equal = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export function isHashed(stored: string) {
  return stored.startsWith("scrypt:") || stored.startsWith("sha256:");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("base64url")}:${scryptSync(password, salt, KEY_LENGTH).toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;

  if (stored.startsWith("scrypt:")) {
    const [, salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    return equal(Buffer.from(hash, "base64url"), scryptSync(password, Buffer.from(salt, "base64url"), KEY_LENGTH));
  }

  if (stored.startsWith("sha256:")) {
    const hex = stored.slice("sha256:".length).trim().toLowerCase();
    return equal(Buffer.from(hex), Buffer.from(createHash("sha256").update(password).digest("hex")));
  }

  // Temporary plain password (e.g. a reset typed into Notion). Compare fixed-length digests.
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return equal(digest(password), digest(stored));
}

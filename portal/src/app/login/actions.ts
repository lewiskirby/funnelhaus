"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminEmail, verifyAdminLogin, verifyLogin } from "@/lib/data";
import { clearFailures, lockedForMinutes, recordFailure } from "@/lib/rate-limit";
import { createAdminSession, createSession, destroySession } from "@/lib/session";

export type LoginState = { error?: string; email?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WRONG = "That email and password don't match. Please try again.";

// Email + password, checked against "Email" and "Login access" on the
// client's Notion record. The browser never learns which part was wrong.
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address.", email };

  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Please enter your password.", email };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${email.toLowerCase()}|${ip}`;
  const wait = lockedForMinutes(key);
  if (wait) return { error: `Too many attempts. Please try again in ${wait} minute${wait === 1 ? "" : "s"}.`, email };

  // The admin email only ever signs in as admin, never as a client.
  if (isAdminEmail(email)) {
    if (!verifyAdminLogin(email, password)) {
      recordFailure(key);
      return { error: WRONG, email };
    }
    clearFailures(key);
    await createAdminSession();
    redirect("/");
  }

  let client;
  try {
    client = await verifyLogin(email, password);
  } catch {
    return { error: "We couldn't sign you in just now. Please try again in a moment.", email };
  }
  if (!client) {
    recordFailure(key);
    return { error: WRONG, email };
  }

  clearFailures(key);
  await createSession(client.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

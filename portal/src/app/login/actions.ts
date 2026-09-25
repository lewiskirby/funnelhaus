"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordSignIn } from "@/lib/data";
import { createAdminSession, createSession, destroySession } from "@/lib/session";
import { requestCode, verifyCode } from "@/lib/signin";

export type LoginState = { step: "email" | "code"; email?: string; error?: string; resent?: boolean } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function clientIp() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// Step 1 sends a 6-digit code; step 2 checks it and signs in for 30 days.
// The same message shows whether or not an email has access, so the page never reveals who does.
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const step = formData.get("step") === "code" ? "code" : "email";
  if (!EMAIL_RE.test(email)) return { step: "email", email, error: "Please enter a valid email address." };

  if (step === "email" || formData.get("resend")) {
    const result = await requestCode(email, await clientIp());
    if (!result.ok) return { step, email, error: result.error };
    return { step: "code", email, resent: step === "code" };
  }

  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { step: "code", email, error: "Please enter the 6-digit code from the email." };

  const result = await verifyCode(email, code, await clientIp());
  if (!result.ok) return { step: "code", email, error: result.error };

  if (result.account.kind === "admin") {
    await createAdminSession(undefined, result.account.userId);
    if (result.account.userId) await recordSignIn(result.account.userId);
  } else {
    await createSession(result.account.userId, result.account.clientId);
    await recordSignIn(result.account.userId);
  }
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// A tiny key-value store for sign-in codes and rate limits, shared by every
// server instance. Uses Upstash Redis over its REST API (added in Vercel under
// Storage → Upstash for Redis, which sets KV_REST_API_URL and KV_REST_API_TOKEN).
// Local development without Upstash falls back to memory; production refuses to.

import "server-only";

const URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

type Value = string | number | null;

async function redis(command: (string | number)[]): Promise<Value> {
  const res = await fetch(URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: Value; error?: string };
  if (!res.ok || body.error) throw new Error(`Upstash ${command[0]} failed: ${body.error ?? res.status}`);
  return body.result ?? null;
}

// ── Development fallback ────────────────────────────

const memory = new Map<string, { value: string; expires: number }>();

function live(key: string) {
  const entry = memory.get(key);
  if (entry && entry.expires < Date.now()) memory.delete(key);
  return memory.get(key);
}

function inMemory(): boolean {
  if (URL && TOKEN) return false;
  if (process.env.NODE_ENV === "production") throw new Error("Upstash is not configured (KV_REST_API_URL / KV_REST_API_TOKEN)");
  return true;
}

// ── Commands ────────────────────────────────────────

export async function kvGet(key: string): Promise<string | null> {
  if (inMemory()) return live(key)?.value ?? null;
  const value = await redis(["GET", key]);
  return value === null ? null : String(value);
}

export async function kvSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (inMemory()) {
    memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    return;
  }
  await redis(["SET", key, value, "EX", ttlSeconds]);
}

export async function kvDel(key: string): Promise<void> {
  if (inMemory()) {
    memory.delete(key);
    return;
  }
  await redis(["DEL", key]);
}

/** Adds one to a counter that disappears `ttlSeconds` after it was first created. Returns the new count. */
export async function kvIncr(key: string, ttlSeconds: number): Promise<number> {
  if (inMemory()) {
    const entry = live(key);
    const count = Number(entry?.value ?? 0) + 1;
    memory.set(key, { value: String(count), expires: entry?.expires ?? Date.now() + ttlSeconds * 1000 });
    return count;
  }
  const count = Number(await redis(["INCR", key]));
  if (count === 1) await redis(["EXPIRE", key, ttlSeconds]);
  return count;
}

/** Seconds until a key expires (0 if it doesn't exist). */
export async function kvTtl(key: string): Promise<number> {
  if (inMemory()) {
    const entry = live(key);
    return entry ? Math.ceil((entry.expires - Date.now()) / 1000) : 0;
  }
  return Math.max(0, Number(await redis(["TTL", key])));
}

// Fixed-window rate limits, counted in the shared store so every server instance
// sees the same numbers.

import "server-only";
import { kvIncr, kvTtl } from "@/lib/kv";

/**
 * Counts one attempt against `key`. Returns 0 if it's allowed, otherwise the
 * minutes until the window resets.
 */
export async function limit(key: string, max: number, windowSeconds: number): Promise<number> {
  const count = await kvIncr(`rl:${key}`, windowSeconds);
  if (count <= max) return 0;
  return Math.max(1, Math.ceil((await kvTtl(`rl:${key}`)) / 60));
}

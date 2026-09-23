// Slows down password guessing: after MAX_FAILURES wrong attempts for the same
// email from the same address, sign-in is paused for WINDOW_MS.
// Kept in memory, so each server instance counts separately — enough to stop
// casual guessing without adding another service.

import "server-only";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; first: number }>();

function current(key: string) {
  const entry = attempts.get(key);
  if (entry && Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(key);
    return undefined;
  }
  return entry;
}

/** Minutes until this key may try again, or 0 if it's allowed now. */
export function lockedForMinutes(key: string): number {
  const entry = current(key);
  if (!entry || entry.count < MAX_FAILURES) return 0;
  return Math.ceil((entry.first + WINDOW_MS - Date.now()) / 60_000);
}

export function recordFailure(key: string) {
  const entry = current(key);
  if (entry) entry.count += 1;
  else attempts.set(key, { count: 1, first: Date.now() });
}

export function clearFailures(key: string) {
  attempts.delete(key);
}

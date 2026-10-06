// Dates for the launch calendar. Days are plain YYYY-MM-DD strings so a task
// due on the 14th shows on the 14th wherever the viewer is.

/** Today's date in Berlin, as YYYY-MM-DD (the same "today" as the Ads board). */
export function todayInBerlin() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

/** "+01:00" → "GMT+1", "-04:00" → "GMT-4", "+05:30" → "GMT+5:30", "Z" → "GMT". */
export function offsetLabel(offset: string) {
  if (offset === "Z" || /^[+-]00:00$/.test(offset)) return "GMT";
  const [h, m] = offset.slice(1).split(":");
  return `GMT${offset[0]}${Number(h)}${m === "00" ? "" : `:${m}`}`;
}

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, n: number) {
  const d = asDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** "2026-10" for a valid month param, otherwise the month of `fallbackDay`. */
export function monthOf(param: string | string[] | undefined, fallbackDay: string) {
  const value = typeof param === "string" ? param : "";
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100 ? value : fallbackDay.slice(0, 7);
}

export function shiftMonth(month: string, n: number) {
  const d = asDate(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return toDay(d).slice(0, 7);
}

/** Every day shown for a month, in whole Monday-to-Sunday weeks. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const lead = (asDate(first).getUTCDay() + 6) % 7; // days since Monday
  const start = addDays(first, -lead);
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const weeks = Math.ceil((lead + Number(last.slice(8))) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

export const formatDay = (day: string, opts: Intl.DateTimeFormatOptions) =>
  asDate(day).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });

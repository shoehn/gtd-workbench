// ISO weeks (Mon–Sun) as `2026-W39`, and day arithmetic on ISO dates. Pure: no clock.

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

function toDate(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `day` plus `n` days, as an ISO date. */
export function addDays(day: string, n: number): string {
  const d = toDate(day);
  return toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** The ISO week a date falls in: the week belongs to the year of its Thursday. */
export function isoWeek(day: string): string {
  const d = toDate(day);
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const ordinal = Math.round((thursday.getTime() - new Date(thursday.getFullYear(), 0, 1).getTime()) / DAY_MS);
  return `${thursday.getFullYear()}-W${pad(Math.floor(ordinal / 7) + 1)}`;
}

/** Monday to Sunday of an ISO week, as ISO dates. */
export function weekDays(week: string): string[] {
  const [y, w] = [Number(week.slice(0, 4)), Number(week.slice(6))];
  const jan4 = new Date(y, 0, 4); // week 1 is the one with 4 January in it
  const monday = toIso(new Date(y, 0, 4 - ((jan4.getDay() + 6) % 7) + (w - 1) * 7));
  return Array.from({ length: 7 }, (_, n) => addDays(monday, n));
}

/** A `yyyy-Www` string naming a week that exists, else `undefined`. */
export function parseWeek(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-W\d{2}$/.test(value)) return undefined;
  const w = Number(value.slice(6));
  if (w < 1 || w > 53) return undefined;
  return isoWeek(weekDays(value)[0]) === value ? value : undefined;
}

/** The week `n` weeks before (negative) or after `week`. */
export function shiftWeek(week: string, n: number): string {
  return isoWeek(addDays(weekDays(week)[0], 7 * n));
}

/**
 * Order two ISO timestamps as instants. They carry different offsets (`+02:00` from the seed,
 * `Z` from `toISOString`), so comparing them as strings is wrong. Missing ones sort first.
 */
export function compareStamps(a?: string, b?: string): number {
  const t = (s?: string) => (s ? Date.parse(s) : -Infinity);
  const d = t(a) - t(b);
  return Number.isNaN(d) ? 0 : d;
}

// Wall-clock time in a time zone. api.now() / api.today() are the only callers that decide
// *which* zone (Settings.timezone, else the server's TZ); everything here is pure.

export interface WallClock {
  /** ISO date, `2026-09-26` */
  day: string;
  hour: number;
  minute: number;
  second: number;
}

/** What a wall clock in `timeZone` (undefined = the server's) shows at `instant`. */
export function wallClock(instant: Date, timeZone?: string): WallClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in ms (Zurich in summer: +2 h). */
function offsetAt(instant: number, timeZone?: string): number {
  const w = wallClock(new Date(instant), timeZone);
  const [y, m, d] = w.day.split('-').map(Number);
  return Date.UTC(y, m - 1, d, w.hour, w.minute, w.second) - Math.floor(instant / 1000) * 1000;
}

/** The instant a wall clock in `timeZone` shows `day` `hh:mm:ss` (the later one in a DST gap). */
export function instantAt(day: string, hour: number, minute: number, second: number, ms: number, timeZone?: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute, second, ms);
  const first = guess - offsetAt(guess, timeZone);
  return new Date(guess - offsetAt(first, timeZone));
}

/** Is `timeZone` an IANA zone this runtime knows? */
export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** `instant` as an ISO string on the wall clock of `timeZone`, with its offset: `2026-09-26T10:00:00+02:00`. */
export function zonedIso(instant: Date, timeZone?: string): string {
  const w = wallClock(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMin = Math.round(offsetAt(instant.getTime(), timeZone) / 60_000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  return `${w.day}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

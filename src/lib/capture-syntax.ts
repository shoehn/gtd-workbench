// Best-effort parser for the rapid-log shorthand `#tag @context !prio ^date` (SPEC §3.1).
// Anything it does not recognise stays in the text; it never throws.
import type { Priority } from './model';

export interface Parsed {
  text: string;
  tags: string[];
  context?: string;
  priority?: Priority;
  /** ISO date (yyyy-mm-dd). */
  date?: string;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 86_400_000;

// Date arithmetic in UTC on the calendar date only, so DST never shifts a day.
const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function parseDate(word: string, today: string): string | undefined {
  const t = toUtc(today);
  if (Number.isNaN(t)) return undefined;
  if (word === 'today') return today;
  if (word === 'tomorrow') return toIso(t + DAY_MS);

  const wd = WEEKDAYS.indexOf(word);
  if (wd >= 0) {
    const ahead = (wd - new Date(t).getUTCDay() + 7) % 7 || 7;
    return toIso(t + ahead * DAY_MS);
  }

  const m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(word);
  if (!m) return undefined;
  const [day, month] = [Number(m[1]), Number(m[2])];
  for (const year of [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]) {
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return undefined; // 31.02
    if (d.getTime() >= t) return toIso(d.getTime());
  }
  return undefined;
}

/**
 * @param today    ISO date the relative dates are resolved against
 * @param contexts known contexts (`@calls` …); unknown `@words` stay in the text
 */
export function parse(line: string, today: string, contexts: readonly string[] = []): Parsed {
  const out: Parsed = { text: '', tags: [] };
  const rest: string[] = [];

  for (const token of line.split(/\s+/).filter(Boolean)) {
    const sigil = token[0];
    const value = token.slice(1).toLowerCase();

    if (sigil === '#' && /^[\p{L}\p{N}_-]+$/u.test(value)) {
      if (!out.tags.includes(value)) out.tags.push(value);
      continue;
    }
    if (sigil === '@' && !out.context && contexts.includes(`@${value}`)) {
      out.context = `@${value}`;
      continue;
    }
    if (sigil === '!' && !out.priority && /^[abc]$/.test(value)) {
      out.priority = value.toUpperCase() as Priority;
      continue;
    }
    if (sigil === '^' && !out.date) {
      const date = parseDate(value, today);
      if (date) {
        out.date = date;
        continue;
      }
    }
    rest.push(token);
  }

  out.text = rest.join(' ');
  return out;
}

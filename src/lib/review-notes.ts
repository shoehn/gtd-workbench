// Weekly review, second lines of the steps (SPEC §3.7). Pure: the api gathers the numbers.
// A ticked step shows its measured note: the delta between the step becoming current and the
// tick. An open step shows a live figure from the list it links to. Nobody types either.
import { fmtDate } from './format';
import type { ReviewCounters } from './model';

/** Steps whose work is capturing: their note counts what reached the inbox meanwhile. */
const CAPTURE_STEPS = new Set(['collect', 'zero-email', 'mind-sweep', 'ideas']);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface StepMeasure {
  stepId: string;
  /** Counters when the step became current (or the latest snapshot before); absent = unknown. */
  opened?: ReviewCounters;
  /** Counters at tick time. */
  now: ReviewCounters;
  /** Items captured since the step became current. */
  captured: number;
  /** Items marked done since the step became current. */
  done: number;
  calendar: CalendarFigures;
  /** Whole minutes the step took. */
  minutes: number;
}

export interface CalendarFigures {
  /** Appointments, time blocks and day actions over the last 7 days, today included. */
  past7: number;
  /** The same over the next 14 days. */
  next14: number;
  /** Hard deadlines over the next 14 days, soonest first; `day` is an ISO date. */
  deadlines14: { text: string; day: string }[];
}

/** The note written when a step is ticked. */
export function measuredNote(m: StepMeasure): string {
  const { stepId, opened, now } = m;
  if (CAPTURE_STEPS.has(stepId)) return `captured ${plural(m.captured, 'item')} to inbox`;
  if (stepId === 'past-cal') return `last 7 days: ${plural(m.calendar.past7, 'event')}`;
  if (stepId === 'future-cal') {
    return `next 14 days: ${plural(m.calendar.next14, 'event')}, ${plural(m.calendar.deadlines14.length, 'hard deadline')}`;
  }
  if (stepId === 'next') {
    return opened
      ? `marked ${m.done} done, ${Math.max(0, now.someday - opened.someday)} moved to someday`
      : `marked ${m.done} done`;
  }
  if (opened) {
    if (stepId === 'inbox-zero') return `${opened.inbox} → ${now.inbox}`;
    if (stepId === 'waiting') return `overdue ${opened.waitingOverdue} → ${now.waitingOverdue}`;
    if (stepId === 'projects') return `stalled ${opened.stalled} → ${now.stalled}`;
    if (stepId === 'someday') return `someday ${opened.someday} → ${now.someday}`;
  }
  return m.minutes < 1 ? 'under a minute' : `${m.minutes} min`;
}

export interface ListFacts {
  inbox: number;
  next: number;
  waiting: number;
  waitingOverdue: number;
  projects: number;
  stalled: number;
  someday: number;
  /** Areas of the active projects, in project order. */
  areas: string[];
  calendar: CalendarFigures;
}

export interface LiveLine {
  text: string;
  href?: string;
  /** Orange: the linked list needs attention (overdue, stalled). */
  warn: boolean;
}

/** The live figure an open step shows, from the list it links to; `undefined` = nothing to show. */
export function liveLine(stepId: string, f: ListFacts): LiveLine | undefined {
  switch (stepId) {
    case 'inbox-zero':
      return { text: `${f.inbox} → 0 · open Clarify`, href: '/clarify', warn: false };
    case 'next':
      return { text: `${plural(f.next, 'next action')} · mark done, drop, move`, href: '/next', warn: false };
    case 'past-cal':
      return { text: `last 7 days: ${plural(f.calendar.past7, 'event')} · any follow-ups?`, href: '/calendar', warn: false };
    case 'future-cal': {
      const [first] = f.calendar.deadlines14;
      const deadlines = plural(f.calendar.deadlines14.length, 'hard deadline');
      return { text: `next 14 days: ${deadlines}${first ? `, ${first.text} ${fmtDate(first.day)}` : ''}`, href: '/calendar', warn: false };
    }
    case 'waiting':
      return f.waitingOverdue
        ? { text: `${plural(f.waiting, 'item')} · ${f.waitingOverdue} overdue → follow up`, href: '/waiting?filter=overdue', warn: true }
        : { text: `${plural(f.waiting, 'item')} · none overdue`, href: '/waiting', warn: false };
    case 'projects':
      return f.stalled
        ? { text: `${plural(f.projects, 'project')} · ${f.stalled} stalled`, href: '/projects?filter=stalled', warn: true }
        : { text: `${plural(f.projects, 'project')} · all have a next action`, href: '/projects', warn: false };
    case 'areas':
      return f.areas.length ? { text: f.areas.map((a) => a.toLowerCase()).join(' · '), warn: false } : undefined;
    case 'someday':
      return { text: `${plural(f.someday, 'item')} · activate or drop`, href: '/waiting?tab=someday', warn: false };
    case 'ideas':
      return { text: 'any new ideas for the lists? capture them to the inbox', warn: false };
    default:
      return undefined;
  }
}

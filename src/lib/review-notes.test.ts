import { describe, expect, it } from 'vitest';
import { liveLine, measuredNote, type ListFacts, type StepMeasure } from './review-notes';

const counters = { inbox: 14, someday: 7, waitingOverdue: 1, stalled: 2 };
const measure = (stepId: string, patch: Partial<StepMeasure> = {}): StepMeasure => ({
  stepId,
  opened: counters,
  now: counters,
  captured: 0,
  done: 0,
  calendar: { past7: 11, next14: 4, deadlines14: [{ text: 'Conference', day: '2026-10-14' }] },
  minutes: 6,
  ...patch,
});

describe('measured notes', () => {
  it('inbox: count when opened → count at tick', () => {
    expect(measuredNote(measure('inbox-zero', { now: { ...counters, inbox: 0 } }))).toBe('14 → 0');
  });

  it('next actions: done since opened, net moves to someday', () => {
    expect(measuredNote(measure('next', { done: 5, now: { ...counters, someday: 9 } }))).toBe('marked 5 done, 2 moved to someday');
    expect(measuredNote(measure('next', { done: 1, opened: undefined }))).toBe('marked 1 done');
  });

  it('capture steps: items captured meanwhile', () => {
    expect(measuredNote(measure('zero-email', { captured: 6 }))).toBe('captured 6 items to inbox');
    expect(measuredNote(measure('mind-sweep', { captured: 1 }))).toBe('captured 1 item to inbox');
    expect(measuredNote(measure('collect'))).toBe('captured 0 items to inbox');
    expect(measuredNote(measure('ideas', { captured: 2 }))).toBe('captured 2 items to inbox');
  });

  it('calendar: past 7 days, next 14 days', () => {
    expect(measuredNote(measure('past-cal'))).toBe('last 7 days: 11 events');
    expect(measuredNote(measure('future-cal'))).toBe('next 14 days: 4 events, 1 hard deadline');
  });

  it('waiting, projects, someday: the counter they work down', () => {
    expect(measuredNote(measure('waiting', { now: { ...counters, waitingOverdue: 0 } }))).toBe('overdue 1 → 0');
    expect(measuredNote(measure('projects', { now: { ...counters, stalled: 0 } }))).toBe('stalled 2 → 0');
    expect(measuredNote(measure('someday', { now: { ...counters, someday: 5 } }))).toBe('someday 7 → 5');
  });

  it('a step without a linked list, or without a snapshot, gets the elapsed time', () => {
    expect(measuredNote(measure('areas'))).toBe('6 min');
    expect(measuredNote(measure('inbox-zero', { opened: undefined, minutes: 0 }))).toBe('under a minute');
    expect(measuredNote(measure('my-own-step', { minutes: 12 }))).toBe('12 min');
  });
});

describe('live lines', () => {
  const facts: ListFacts = {
    inbox: 14, next: 23, waiting: 7, waitingOverdue: 1, projects: 11, stalled: 2, someday: 31,
    areas: ['Clients', 'Studio', 'Home'],
    calendar: { past7: 11, next14: 4, deadlines14: [{ text: 'conference', day: '2026-10-14' }, { text: 'x', day: '2026-10-20' }] },
  };

  it('links each step to its list, orange where the list needs attention', () => {
    expect(liveLine('inbox-zero', facts)).toEqual({ text: '14 → 0 · open Clarify', href: '/clarify', warn: false });
    expect(liveLine('waiting', facts)).toEqual({ text: '7 items · 1 overdue → follow up', href: '/waiting?filter=overdue', warn: true });
    expect(liveLine('waiting', { ...facts, waitingOverdue: 0 })).toMatchObject({ href: '/waiting', warn: false });
    expect(liveLine('projects', facts)).toEqual({ text: '11 projects · 2 stalled', href: '/projects?filter=stalled', warn: true });
    expect(liveLine('someday', facts)).toEqual({ text: '31 items · activate or drop', href: '/waiting?tab=someday', warn: false });
    expect(liveLine('past-cal', facts)?.text).toBe('last 7 days: 11 events · any follow-ups?');
    expect(liveLine('future-cal', facts)?.text).toBe('next 14 days: 2 hard deadlines, conference 14.10');
    expect(liveLine('areas', facts)?.text).toBe('clients · studio · home');
    expect(liveLine('collect', facts)).toBeUndefined();
  });
});

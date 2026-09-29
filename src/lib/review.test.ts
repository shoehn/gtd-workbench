import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import seed from './store/seed.json';
import { store } from './store/memory';
import type { State } from './store/types';

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

const run = () => api.openRun()!;
const entry = (id: string) => run().steps.find((s) => s.stepId === id);

describe('weekly review', () => {
  it('seed: open run, 5 of 12 ticked, past calendar current, durations as drawn', () => {
    expect(api.reviewSteps()).toHaveLength(12);
    expect(api.ticked(run())).toBe(5);
    expect(api.currentStep(run())).toBe('past-cal');
    expect(['collect', 'zero-email', 'mind-sweep', 'inbox-zero', 'next'].map((id) => api.stepMinutes(run(), id))).toEqual([3, 9, 6, 0, 7]);
    expect(api.reviewBadge()).toBe('in progress');
    expect(api.lastFinishedRun()?.finishedAt).toBe('2026-09-18T16:45:00+02:00');
    expect(api.usualReviewMinutes()).toBe(45);
  });

  it('one open run at a time', () => {
    expect(() => api.startReview()).toThrow(/^startReview:/);
  });

  it('DoD: a fresh run measures the inbox going down by one', () => {
    api.finishReview();
    api.startReview();
    const before = api.listInbox().length;
    api.clarify(api.listInboxQueue()[0].id, { kind: 'trash' });
    api.tickStep('inbox-zero');
    expect(entry('inbox-zero')?.note).toBe(`${before} → ${before - 1}`);
  });

  it('ticking opens the next step with a snapshot; notes count what happened since', () => {
    api.finishReview();
    api.startReview();
    api.tickStep('collect');
    expect(entry('zero-email')?.snapshot).toMatchObject({ inbox: api.listInbox().length });
    api.capture('call the bank');
    api.capture('buy fuses');
    api.tickStep('zero-email');
    expect(entry('zero-email')?.note).toBe('captured 2 items to inbox');
    expect(api.currentStep(run())).toBe('mind-sweep');
    api.untickStep('zero-email');
    expect(entry('zero-email')?.note).toBeUndefined();
    expect(api.currentStep(run())).toBe('zero-email');
  });

  it('DoD: finishing closes the run, empties the trash, and the sidebar shows today', () => {
    api.trash(['i1']);
    api.finishReview();
    expect(api.openRun()).toBeUndefined();
    expect(api.getItem('i1')).toBeUndefined();
    const badge = api.reviewBadge();
    expect(typeof badge === 'object' && badge.finishedAt.slice(0, 10)).toBe(api.today());
  });

  it('pause stops the clock', () => {
    const start = new Date(api.now().getTime() - 10 * 60_000).toISOString();
    store.update((s) => {
      const r = s.reviewRuns.at(-1)!;
      r.startedAt = start;
      r.pausedAt = new Date(api.now().getTime() - 4 * 60_000).toISOString();
    });
    expect(Math.round(api.reviewElapsedMs(run()) / 60_000)).toBe(6);
    api.resumeReview();
    expect(run().pausedAt).toBeUndefined();
    expect(Math.round(run().pausedMs / 60_000)).toBe(4);
    api.pauseReview();
    expect(() => api.pauseReview()).toThrow(/already paused/);
  });

  it('DoD: an open run started 25 h ago closes as abandoned, at step 5', () => {
    store.update((s) => {
      s.reviewRuns.at(-1)!.startedAt = new Date(api.now().getTime() - 25 * 3_600_000).toISOString();
    });
    expect(api.abandonStaleRuns()).toBe(1);
    expect(api.openRun()).toBeUndefined();
    expect(api.lastClosedRun()).toMatchObject({ id: 'r-2026-39', outcome: 'abandoned' });
    expect(api.ticked(api.lastClosedRun()!)).toBe(5);
    expect(api.abandonStaleRuns()).toBe(0);
  });

  it('this week so far counts the last 7 days', () => {
    expect(api.weekStats()).toMatchObject({ done: 3, completedProjects: 0, stalled: 1 });
    api.moveProjectToSomeday('p-blog');
    api.dropProject('p-blog'); // dropped is not completed
    api.completeProject('p-gridfinity');
    expect(api.weekStats()).toMatchObject({ completedProjects: 1, stalled: 0 });
    api.complete('n6');
    expect(api.weekStats().done).toBe(4);
  });

  it('resetTemplate restores the shipped template', () => {
    store.update((s) => {
      s.reviewTemplate.phases[0].steps.pop();
    });
    api.resetTemplate();
    expect(api.reviewSteps()).toHaveLength(12);
  });
});

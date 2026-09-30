// Two seeds (SPEC §5): the base every new database gets — generic contexts and buckets, the
// review template, week start, time zone — and the demo on top of it, which brings its own
// contexts and buckets along with projects, items, calendar and review runs.
// Memory mode, db:seed and db:reset use both; an empty SQLite database gets the base only.
import base from './seed.base.json';
import demo from './seed.demo.json';
import type { State } from './types';

export const baseSeed = base as State;

/** The demo's review runs carry the checklist they were started with, like every run. */
export const demoSeed = {
  ...base,
  ...demo,
  reviewRuns: demo.reviewRuns.map((r) => ({ ...r, template: base.reviewTemplate })),
} as State;

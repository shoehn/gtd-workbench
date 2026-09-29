// SQLite schema: one table per SPEC §5 interface plus the store-level lists. Nested value
// objects that are always read with their row (`Item.timeSlot`, `Item.waiting`) are flattened
// into typed columns; `Item.tags`, `ReviewRun.steps` and the review template are JSON.
// `seq` keeps each list in the order the store holds it (the memory store's array order).
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ReviewRun, ReviewTemplate } from '../model';

export const items = sqliteTable(
  'items',
  {
    id: text().primaryKey(),
    seq: integer().notNull(),
    text: text().notNull(),
    captured: text().notNull(),
    source: text().notNull(),
    capturedAt: text('captured_at').notNull(),
    status: text().notNull(),
    projectId: text('project_id'),
    context: text(),
    priority: text(),
    // real: `uncomplete` parks an action half a step ahead before renumbering.
    priorityNo: real('priority_no'),
    time: integer(),
    energy: text(),
    deadline: text(),
    day: text(),
    timeSlotStart: text('time_slot_start'),
    timeSlotEnd: text('time_slot_end'),
    focusOn: text('focus_on'),
    waitingWho: text('waiting_who'),
    waitingSince: text('waiting_since'),
    waitingFollowUp: text('waiting_follow_up'),
    bucket: text(),
    tags: text({ mode: 'json' }).$type<string[]>().notNull(),
    doneAt: text('done_at'),
    trashedAt: text('trashed_at'),
  },
  (t) => [
    index('items_status').on(t.status),
    index('items_project_id').on(t.projectId),
    index('items_day').on(t.day),
    index('items_deadline').on(t.deadline),
  ],
);

export const projects = sqliteTable('projects', {
  id: text().primaryKey(),
  seq: integer().notNull(),
  title: text().notNull(),
  successfulWhen: text('successful_when'),
  area: text(),
  goal: text(),
  deadline: text(),
  status: text().notNull(),
  notes: text().notNull(),
  lastReviewedAt: text('last_reviewed_at'),
  createdAt: text('created_at'),
  createdFrom: text('created_from'),
  dropped: integer({ mode: 'boolean' }),
  completedAt: text('completed_at'),
});

export const reviewRuns = sqliteTable('review_runs', {
  id: text().primaryKey(),
  seq: integer().notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  pausedMs: integer('paused_ms').notNull(),
  pausedAt: text('paused_at'),
  steps: text({ mode: 'json' }).$type<ReviewRun['steps']>().notNull(),
  notes: text().notNull(),
  outcome: text(),
});

/** One row (`id = 'default'`): the user's checklist template. */
export const reviewTemplates = sqliteTable('review_templates', {
  id: text().primaryKey(),
  phases: text({ mode: 'json' }).$type<ReviewTemplate['phases']>().notNull(),
});

export const externalEvents = sqliteTable('external_events', {
  id: text().primaryKey(),
  seq: integer().notNull(),
  calendar: text().notNull(),
  title: text().notNull(),
  start: text().notNull(),
  end: text().notNull(),
  allDay: integer('all_day', { mode: 'boolean' }).notNull(),
});

export const externalCalendars = sqliteTable('external_calendars', {
  name: text().primaryKey(),
  seq: integer().notNull(),
  via: text().notNull(),
});

export const tickler = sqliteTable('tickler', {
  id: text().primaryKey(),
  seq: integer().notNull(),
  day: text().notNull(),
  text: text().notNull(),
});

export const contexts = sqliteTable('contexts', {
  name: text().primaryKey(),
  seq: integer().notNull(),
});

export const buckets = sqliteTable('buckets', {
  name: text().primaryKey(),
  seq: integer().notNull(),
});

export const areaKinds = sqliteTable('area_kinds', {
  area: text().primaryKey(),
  seq: integer().notNull(),
  kind: text().notNull(),
});

/** Single values: `today` (the seed's pinned date), `externalSyncedAt`. */
export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text().notNull(),
});

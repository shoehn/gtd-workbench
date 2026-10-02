// SQLite schema: one table per SPEC §5 interface plus the store-level lists. Nested value
// objects that are always read with their row (`Item.timeSlot`, `Item.waiting`) are flattened
// into typed columns; `Item.tags`, `ReviewRun.steps` and the review template are JSON.
// The user's Settings are one JSON row in `settings`.
// `seq` keeps each list in the order the store holds it (the memory store's array order).
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ReviewRun, ReviewTemplate } from '../model';
import type { ActivityChange, Actor } from './types';

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
    referenceKind: text('reference_kind'),
    referenceUrl: text('reference_url'),
    referenceBody: text('reference_body'),
    tags: text({ mode: 'json' }).$type<string[]>().notNull(),
    doneAt: text('done_at'),
    successorId: text('successor_id'),
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
  template: text({ mode: 'json' }).$type<ReviewTemplate>(),
});

export const externalEvents = sqliteTable('external_events', {
  id: text().primaryKey(),
  seq: integer().notNull(),
  calendar: text().notNull(),
  title: text().notNull(),
  start: text().notNull(),
  end: text().notNull(),
  allDay: integer('all_day', { mode: 'boolean' }).notNull(),
  location: text(),
  sourceId: text('source_id'),
});

/** Keyed by source id (synced) or `demo:<name>`: two calendars may share a name. */
export const externalCalendars = sqliteTable('external_calendars', {
  key: text().primaryKey(),
  name: text().notNull(),
  seq: integer().notNull(),
  via: text().notNull(),
  sourceId: text('source_id'),
  host: text(),
  lastSyncAt: text('last_sync_at'),
  lastError: text('last_error'),
  lastErrorAt: text('last_error_at'),
});

export const tickler = sqliteTable('tickler', {
  id: text().primaryKey(),
  seq: integer().notNull(),
  day: text().notNull(),
  text: text().notNull(),
});

export const areaKinds = sqliteTable('area_kinds', {
  area: text().primaryKey(),
  seq: integer().notNull(),
  kind: text().notNull(),
});

/** Mails the capture poller has handled, so a re-poll never captures one twice. */
export const mailSeen = sqliteTable('mail_seen', {
  messageId: text('message_id').primaryKey(),
  seq: integer().notNull(),
  at: text().notNull(),
  outcome: text().notNull(),
  itemId: text('item_id'),
});

/** The activity log: append-only; `actor` and `changes` are JSON, read whole. */
export const activity = sqliteTable('activity', {
  id: text().primaryKey(),
  seq: integer().notNull(),
  at: text().notNull(),
  actor: text({ mode: 'json' }).$type<Actor>().notNull(),
  summary: text().notNull(),
  changes: text({ mode: 'json' }).$type<ActivityChange[]>().notNull(),
  undoOf: text('undo_of'),
});

/** API clients; only the SHA-256 of a token is stored. */
export const clients = sqliteTable('clients', {
  id: text().primaryKey(),
  seq: integer().notNull(),
  name: text().notNull(),
  preset: text().notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
});

/**
 * Single values: `settings` (JSON: contexts, buckets, review template, week start, time zone —
 * the user's Settings as one row), `today` (the demo's pinned date), `externalSyncedAt`,
 * `mailbox` (JSON: the capture mailbox's last poll and error).
 */
export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text().notNull(),
});

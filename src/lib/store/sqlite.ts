// SQLite store behind the same `Store` interface as memory.ts. The whole state is loaded once
// and kept in memory (single user, single process); `update(fn)` runs `fn` on it, then writes
// the rows that changed in one transaction. If `fn` or the write throws, the state is put back
// as it was, so memory and database never disagree.
import Database from 'better-sqlite3';
import { inArray } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ExternalEvent, Item, Project, ReviewRun } from '../model';
import * as t from './schema';
import type { ExternalCalendar, State, Store } from './types';

type Db = BetterSQLite3Database<typeof t>;
type Row = Record<string, unknown>;

/** Drop `null` / `undefined` fields: optional properties are absent in the store, never null. */
function compact<T extends Row>(row: T): Partial<T> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

/** A row without its ordering column. */
function unseq<R extends { seq: number }>(row: R): Omit<R, 'seq'> {
  const rest: Partial<R> = { ...row };
  delete rest.seq;
  return rest as Omit<R, 'seq'>;
}

function itemRow(i: Item, seq: number) {
  return {
    id: i.id,
    seq,
    text: i.text,
    captured: i.captured,
    source: i.source,
    capturedAt: i.capturedAt,
    status: i.status,
    projectId: i.projectId ?? null,
    context: i.context ?? null,
    priority: i.priority ?? null,
    priorityNo: i.priorityNo ?? null,
    time: i.time ?? null,
    energy: i.energy ?? null,
    deadline: i.deadline ?? null,
    day: i.day ?? null,
    timeSlotStart: i.timeSlot?.start ?? null,
    timeSlotEnd: i.timeSlot?.end ?? null,
    focusOn: i.focusOn ?? null,
    waitingWho: i.waiting?.who ?? null,
    waitingSince: i.waiting?.since ?? null,
    waitingFollowUp: i.waiting?.followUp ?? null,
    bucket: i.bucket ?? null,
    referenceKind: i.reference?.kind ?? null,
    referenceUrl: i.reference?.url ?? null,
    referenceBody: i.reference?.body ?? null,
    tags: i.tags,
    doneAt: i.doneAt ?? null,
    trashedAt: i.trashedAt ?? null,
  };
}

function rowItem(r: typeof t.items.$inferSelect): Item {
  const { timeSlotStart, timeSlotEnd, waitingWho, waitingSince, waitingFollowUp, referenceKind, referenceUrl, referenceBody, ...rest } =
    unseq(r);
  const item = compact(rest) as unknown as Item;
  item.tags = r.tags;
  if (timeSlotStart && timeSlotEnd) item.timeSlot = { start: timeSlotStart, end: timeSlotEnd };
  if (referenceKind) {
    item.reference = compact({ kind: referenceKind, url: referenceUrl, body: referenceBody }) as Item['reference'];
  }
  if (waitingWho !== null) item.waiting = compact({ who: waitingWho, since: waitingSince ?? '', followUp: waitingFollowUp }) as Item['waiting'];
  return item;
}

function projectRow(p: Project, seq: number) {
  return {
    id: p.id,
    seq,
    title: p.title,
    successfulWhen: p.successfulWhen ?? null,
    area: p.area ?? null,
    goal: p.goal ?? null,
    deadline: p.deadline ?? null,
    status: p.status,
    notes: p.notes,
    lastReviewedAt: p.lastReviewedAt ?? null,
    createdAt: p.createdAt ?? null,
    createdFrom: p.createdFrom ?? null,
    dropped: p.dropped ?? null,
    completedAt: p.completedAt ?? null,
  };
}

function runRow(r: ReviewRun, seq: number) {
  return {
    id: r.id,
    seq,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt ?? null,
    pausedMs: r.pausedMs,
    pausedAt: r.pausedAt ?? null,
    steps: r.steps,
    notes: r.notes,
    outcome: r.outcome ?? null,
    template: r.template ?? null,
  };
}

/** The user's Settings, stored as one JSON row. */
function settingsValue(s: State): string {
  return JSON.stringify({
    contexts: s.contexts,
    followUpContext: s.followUpContext,
    buckets: s.buckets,
    reviewTemplate: s.reviewTemplate,
    weekStart: s.weekStart,
    timezone: s.timezone,
    theme: s.theme,
  });
}

function eventRow(e: ExternalEvent, seq: number) {
  return {
    id: e.id,
    seq,
    calendar: e.calendar,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    location: e.location ?? null,
    sourceId: e.sourceId ?? null,
  };
}

function calendarRow(c: ExternalCalendar, seq: number) {
  return {
    key: c.sourceId ?? `demo:${c.name}`,
    name: c.name,
    seq,
    via: c.via,
    sourceId: c.sourceId ?? null,
    host: c.host ?? null,
    lastSyncAt: c.lastSyncAt ?? null,
    lastError: c.lastError ?? null,
    lastErrorAt: c.lastErrorAt ?? null,
  };
}

/** Every table's rows for a state, keyed by the table's primary key. */
function tablesOf(s: State): { table: SQLiteTable; pk: SQLiteColumn; key: string; rows: Row[] }[] {
  return [
    { table: t.items, pk: t.items.id, key: 'id', rows: s.items.map(itemRow) },
    { table: t.projects, pk: t.projects.id, key: 'id', rows: s.projects.map(projectRow) },
    { table: t.reviewRuns, pk: t.reviewRuns.id, key: 'id', rows: s.reviewRuns.map(runRow) },
    { table: t.externalEvents, pk: t.externalEvents.id, key: 'id', rows: s.externalEvents.map(eventRow) },
    { table: t.externalCalendars, pk: t.externalCalendars.key, key: 'key', rows: s.externalCalendars.map(calendarRow) },
    { table: t.tickler, pk: t.tickler.id, key: 'id', rows: s.tickler.map((e, seq) => ({ id: e.id, seq, day: e.day, text: e.text })) },
    { table: t.areaKinds, pk: t.areaKinds.area, key: 'area', rows: Object.entries(s.areaKinds).map(([area, kind], seq) => ({ area, seq, kind })) },
    {
      table: t.settings,
      pk: t.settings.key,
      key: 'key',
      rows: [
        { key: 'settings', value: settingsValue(s) },
        ...(s.today ? [{ key: 'today', value: s.today }] : []),
        ...(s.externalSyncedAt ? [{ key: 'externalSyncedAt', value: s.externalSyncedAt }] : []),
      ],
    },
  ];
}

/** Write what differs between two states: upsert changed rows, delete the ones that are gone. */
function write(db: Db, before: State | null, after: State) {
  const old = before ? tablesOf(before) : null;
  db.transaction((tx) => {
    tablesOf(after).forEach(({ table, pk, key, rows }, n) => {
      const was = new Map((old?.[n].rows ?? []).map((r) => [String(r[key]), JSON.stringify(r)]));
      const keep = new Set<string>();
      for (const row of rows) {
        const k = String(row[key]);
        keep.add(k);
        if (was.get(k) === JSON.stringify(row)) continue;
        tx.insert(table).values(row).onConflictDoUpdate({ target: pk, set: row }).run();
      }
      const gone = [...was.keys()].filter((k) => !keep.has(k));
      if (gone.length) tx.delete(table).where(inArray(pk, gone)).run();
    });
  });
}

/** The state in the database, or `null` when it has never been filled. */
function load(db: Db): State | null {
  const bySeq = <R extends { seq: number }>(rows: R[]) => rows.sort((a, b) => a.seq - b.seq);
  const settings = Object.fromEntries(db.select().from(t.settings).all().map((s) => [s.key, s.value]));
  if (!settings.settings) return null;
  const user = JSON.parse(settings.settings) as Pick<
    State,
    'contexts' | 'followUpContext' | 'buckets' | 'reviewTemplate' | 'weekStart' | 'timezone' | 'theme'
  >;
  return {
    ...(settings.today && { today: settings.today }),
    contexts: user.contexts,
    // Rows written before the setting existed: @calls if it is a context, else the first one.
    followUpContext: user.followUpContext ?? (user.contexts.includes('@calls') ? '@calls' : user.contexts[0]),
    buckets: user.buckets,
    weekStart: user.weekStart,
    timezone: user.timezone,
    theme: user.theme ?? 'system', // rows written before the setting existed
    areaKinds: Object.fromEntries(bySeq(db.select().from(t.areaKinds).all()).map((a) => [a.area, a.kind as 'work' | 'home'])),
    projects: bySeq(db.select().from(t.projects).all()).map((p) => compact(unseq(p)) as unknown as Project),
    items: bySeq(db.select().from(t.items).all()).map(rowItem),
    tickler: bySeq(db.select().from(t.tickler).all()).map(({ id, day, text }) => ({ id, day, text })),
    externalCalendars: bySeq(db.select().from(t.externalCalendars).all()).map((c) => {
      const rest: Partial<typeof c> = unseq(c);
      delete rest.key;
      return compact(rest) as unknown as ExternalCalendar;
    }),
    ...(settings.externalSyncedAt && { externalSyncedAt: settings.externalSyncedAt }),
    externalEvents: bySeq(db.select().from(t.externalEvents).all()).map((e) => compact(unseq(e)) as unknown as ExternalEvent),
    reviewTemplate: user.reviewTemplate,
    reviewRuns: bySeq(db.select().from(t.reviewRuns).all()).map((r) => compact(unseq(r)) as unknown as ReviewRun),
  };
}

export const MIGRATIONS = path.join(process.cwd(), 'drizzle');

/** Open (and migrate) the database file; a database that was never filled starts from `seed`. */
export function openDatabase(file: string, seed: State): { db: Db; state: State; seeded: boolean } {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  if (file !== ':memory:') sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite, { schema: t });
  migrate(db, { migrationsFolder: MIGRATIONS });
  let state = load(db);
  const seeded = !state;
  if (!state) {
    state = structuredClone(seed);
    write(db, null, state);
  }
  return { db, state, seeded };
}

/** Replace everything in the database with `next` (db:seed). */
export function replaceAll(db: Db, current: State, next: State): void {
  write(db, current, next);
}

/** `onOpen(seeded)` is told whether the file was new and got `seed`. */
export function createSqliteStore(file: string, seed: State, onOpen?: (seeded: boolean) => void): Store {
  const { db, state, seeded } = openDatabase(file, seed);
  onOpen?.(seeded);
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    update(fn) {
      const before = structuredClone(state);
      try {
        fn(state);
        write(db, before, state);
      } catch (e) {
        for (const key of Object.keys(state) as (keyof State)[]) delete state[key];
        Object.assign(state, before);
        throw e;
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

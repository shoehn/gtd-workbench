// The one store the api uses: `STORE=memory|sqlite`, sqlite by default in production and
// memory otherwise (dev, tests). `DATABASE_FILE` names the SQLite file (default data/gtd.db).
// The store opens on first use, not on import, so `next build` never touches a database.
import { record, snapshot } from '../activity';
import { log } from '../log';
import { createMemoryStore } from './memory';
import { baseSeed, demoSeed } from './seed';
import { createSqliteStore } from './sqlite';
import type { State, Store } from './types';

export type StoreKind = 'memory' | 'sqlite';

export const STORE_KIND: StoreKind =
  process.env.STORE === 'sqlite' || process.env.STORE === 'memory'
    ? process.env.STORE
    : process.env.NODE_ENV === 'production'
      ? 'sqlite'
      : 'memory';

export const DATABASE_FILE = process.env.DATABASE_FILE ?? 'data/gtd.db';

// Kept on globalThis so dev-server module reloads do not reset the state or reopen the file.
const g = globalThis as typeof globalThis & { __wbStore?: Store; __wbFresh?: boolean };

/** The database was created at this boot and got the base seed (the Inbox's first-run card). */
export function createdThisBoot(): boolean {
  open();
  return g.__wbFresh === true;
}

/**
 * Memory mode starts from the demo seed. A SQLite database that has never been filled starts
 * from the base seed only (contexts, buckets, review template) — never the demo data.
 */
function open(): Store {
  if (g.__wbStore) return g.__wbStore;
  if (STORE_KIND === 'memory') {
    g.__wbStore = createMemoryStore(structuredClone(demoSeed));
  } else {
    g.__wbStore = createSqliteStore(DATABASE_FILE, baseSeed, (applied) => {
      g.__wbFresh = applied;
      log.info(`store: sqlite ${DATABASE_FILE}${applied ? ' — new database, base seed applied' : ''}`);
    });
  }
  return g.__wbStore;
}

// Depth of store.update calls in progress: an update inside an update is part of the outer one.
let depth = 0;

export const store: Store = {
  getState: () => open().getState(),
  // Every change is logged with its actor in the same write (lib/activity.ts). An update made
  // while another runs (an api function calling others) joins it: one write, one entry.
  update: (fn) => {
    if (depth > 0) {
      fn(open().getState() as State);
      return;
    }
    depth++;
    try {
      open().update((s) => {
        const before = snapshot(s);
        try {
          fn(s);
        } catch (e) {
          Object.assign(s, before); // items, projects, tickler as they were (the memory store has no rollback)
          throw e;
        }
        record(s, before);
      });
    } finally {
      depth--;
    }
  },
  subscribe: (listener) => open().subscribe(listener),
};

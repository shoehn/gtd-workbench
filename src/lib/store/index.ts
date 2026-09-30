// The one store the api uses: `STORE=memory|sqlite`, sqlite by default in production and
// memory otherwise (dev, tests). `DATABASE_FILE` names the SQLite file (default data/gtd.db).
// The store opens on first use, not on import, so `next build` never touches a database.
import { log } from '../log';
import baseSeed from './seed.base.json';
import seed from './seed.json';
import { createMemoryStore } from './memory';
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
const g = globalThis as typeof globalThis & { __wbStore?: Store };

/**
 * Memory mode starts from the demo seed. A SQLite database that has never been filled starts
 * from the base seed only (contexts, buckets, review template) — never the demo data.
 */
function open(): Store {
  if (g.__wbStore) return g.__wbStore;
  if (STORE_KIND === 'memory') {
    g.__wbStore = createMemoryStore(structuredClone(seed) as State);
  } else {
    g.__wbStore = createSqliteStore(DATABASE_FILE, baseSeed as State, (applied) =>
      log.info(`store: sqlite ${DATABASE_FILE}${applied ? ' — new database, base seed applied' : ''}`),
    );
  }
  return g.__wbStore;
}

export const store: Store = {
  getState: () => open().getState(),
  update: (fn) => open().update(fn),
  subscribe: (listener) => open().subscribe(listener),
};

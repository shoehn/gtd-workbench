// The one store the api uses: `STORE=memory|sqlite`, sqlite by default in production and
// memory otherwise (dev, tests). `DATABASE_FILE` names the SQLite file (default data/gtd.db).
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

export const store: Store = (g.__wbStore ??=
  STORE_KIND === 'sqlite'
    ? createSqliteStore(DATABASE_FILE, seed as State)
    : createMemoryStore(structuredClone(seed) as State));

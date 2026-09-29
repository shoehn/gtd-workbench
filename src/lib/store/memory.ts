import seed from './seed.json';
import type { State, Store } from './types';

function createMemoryStore(initial: State): Store {
  const state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    update(fn) {
      fn(state);
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Kept on globalThis so dev-server module reloads do not reset captured items.
const g = globalThis as typeof globalThis & { __wbStore?: Store };

export const store: Store = (g.__wbStore ??= createMemoryStore(structuredClone(seed) as State));

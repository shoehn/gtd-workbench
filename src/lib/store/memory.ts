import type { State, Store } from './types';

/** The whole state in memory; a restart starts from the seed again. */
export function createMemoryStore(initial: State): Store {
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

import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import seed from './store/seed.json';
import { store } from './store/memory';
import type { State } from './store/types';

const item = (id: string) => store.getState().items.find((i) => i.id === id);

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

describe('trash', () => {
  it('is a status with a timestamp, and undo restores the previous status', () => {
    expect(api.trash(['i1', 'i2'])).toEqual([
      { id: 'i1', status: 'inbox' },
      { id: 'i2', status: 'inbox' },
    ]);
    expect(item('i1')).toMatchObject({ status: 'trash', trashedAt: expect.stringMatching(/^2026-09-26T/) });

    api.untrash([{ id: 'i1', status: 'inbox' }]);
    expect(item('i1')?.status).toBe('inbox');
    expect(item('i1')?.trashedAt).toBeUndefined();
    expect(item('i2')?.status).toBe('trash');
  });

  it('keeps trashed items in the store until they are 30 days old', () => {
    api.trash(['i1']);
    store.update((s) => {
      s.items.find((i) => i.id === 'i1')!.trashedAt = '2026-08-01T10:00:00+02:00';
    });
    api.trash(['i2']); // trashing runs the 30-day purge
    expect(item('i1')).toBeUndefined();
    expect(item('i2')?.status).toBe('trash');
  });

  it('empties the whole trash for the weekly review', () => {
    api.trash(['i1', 'i2']);
    expect(api.purgeTrash()).toBe(2);
    expect(item('i1')).toBeUndefined();
    expect(api.purgeTrash()).toBe(0);
  });
});

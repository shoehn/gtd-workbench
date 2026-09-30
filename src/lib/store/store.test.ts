import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { demoSeed as seed } from './seed';
import { STORE_KIND } from '.';
import { createSqliteStore } from './sqlite';
import type { State } from './types';

const dirs: string[] = [];
function tempFile() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gtd-store-'));
  dirs.push(dir);
  return path.join(dir, 'gtd.db');
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('store selection', () => {
  it('follows STORE', () => {
    expect(STORE_KIND).toBe(process.env.STORE);
  });
});

describe('sqlite store', () => {
  it('a fresh file starts from the seed and reads back exactly', () => {
    const file = tempFile();
    const a = createSqliteStore(file, seed as State);
    expect(a.getState()).toEqual(seed);
    expect(createSqliteStore(file, seed as State).getState()).toEqual(seed);
  });

  it('keeps changes across a reopen (restart), including removals and order', () => {
    const file = tempFile();
    const a = createSqliteStore(file, seed as State);
    a.update((s) => {
      s.items.find((i) => i.id === 'n2')!.timeSlot = { start: '2026-09-21T09:00', end: '2026-09-21T10:00' };
      delete s.items.find((i) => i.id === 'w1')!.waiting!.followUp;
      s.items = s.items.filter((i) => i.id !== 'i1');
      s.items.push({ id: 'new', text: 'x', captured: 'x', source: 'typed', capturedAt: '2026-09-26T10:00', status: 'inbox', tags: ['a'] });
      s.contexts.reverse();
      s.projects[0].dropped = true;
    });
    const b = createSqliteStore(file, seed as State).getState();
    expect(b).toEqual(a.getState());
    expect(b.items.at(-1)?.id).toBe('new');
    expect(b.items.some((i) => i.id === 'i1')).toBe(false);
  });

  it('a failing update leaves memory and file as they were', () => {
    const file = tempFile();
    const a = createSqliteStore(file, seed as State);
    expect(() =>
      a.update((s) => {
        s.items[0].text = 'changed';
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(a.getState().items[0].text).toBe(seed.items[0].text);
    expect(createSqliteStore(file, seed as State).getState()).toEqual(seed);
  });
});

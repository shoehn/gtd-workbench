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

  it('two calendars may share a name (a synced "Work" next to the demo one)', () => {
    const file = tempFile();
    const a = createSqliteStore(file, seed as State);
    a.update((s) => {
      s.externalCalendars.push({ name: 'Work', via: 'ics', sourceId: 'work', host: 'calendar.example.com', lastSyncAt: '2026-09-26T08:00:00.000Z' });
      s.externalEvents.push({ id: 'work|x|', calendar: 'Work', title: 'Synced', start: '2026-09-28', end: '2026-09-29', allDay: true, sourceId: 'work', location: 'Studio' });
    });
    const b = createSqliteStore(file, seed as State).getState();
    expect(b.externalCalendars.filter((c) => c.name === 'Work')).toHaveLength(2);
    expect(b).toEqual(a.getState());
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

describe('activity and clients persist (MCP stage 1)', () => {
  const entry = (n: number) => ({
    id: `a${n}`,
    at: `2026-10-01T10:00:0${n}.000Z`,
    actor: { kind: 'client' as const, id: 'c1', name: 'Claude Desktop' },
    summary: `Captured “x${n}”`,
    changes: [
      {
        kind: 'item' as const,
        id: `i${n}`,
        before: null,
        after: { id: `i${n}`, text: `x${n}`, captured: `x${n}`, source: 'typed' as const, capturedAt: '2026-10-01T10:00:00.000Z', status: 'inbox' as const, tags: [] },
      },
    ],
  });

  it('activity entries and clients survive a reopen', () => {
    const file = tempFile();
    const a = createSqliteStore(file, seed as State);
    a.update((s) => {
      s.activity.push(entry(1));
      s.clients.push({ id: 'c1', name: 'Claude Desktop', preset: 'assistant', tokenHash: 'ab'.repeat(32), createdAt: '2026-10-01T09:00:00.000Z' });
    });
    const b = createSqliteStore(file, seed as State).getState();
    expect(b.activity).toEqual([entry(1)]);
    expect(b.clients).toEqual(a.getState().clients);
  });

  it('after old entries are pruned, a reopen still reads the log in order', () => {
    const file = tempFile();
    const a = createSqliteStore(file, seed as State);
    a.update((s) => {
      s.activity.push(entry(1), entry(2), entry(3));
    });
    a.update((s) => {
      s.activity = s.activity.slice(2); // pruned: 1 and 2
      s.activity.push(entry(4));
    });
    expect(createSqliteStore(file, seed as State).getState().activity.map((e) => e.id)).toEqual(['a3', 'a4']);
  });

  it('activity rows are only inserted, never rewritten', () => {
    const file = tempFile();
    const a = createSqliteStore(file, seed as State);
    a.update((s) => {
      s.activity.push(entry(1));
    });
    // a later write that leaves the entry alone must not touch its row
    a.update((s) => {
      s.activity[0].summary = 'tampered in memory';
      s.activity.push(entry(2));
    });
    const b = createSqliteStore(file, seed as State).getState();
    expect(b.activity.map((e) => e.summary)).toEqual(['Captured “x1”', 'Captured “x2”']);
  });
});

describe('a year of activity does not slow down writes (review)', () => {
  it('a write with 15 000 entries in the log costs about what it costs with none', () => {
    const big = (n: number) =>
      Array.from({ length: n }, (_, k) => ({
        id: `e${k}`,
        at: '2026-10-01T10:00:00.000Z',
        actor: { kind: 'user' as const },
        summary: `Captured “x${k}”`,
        changes: [{ kind: 'item' as const, id: `i${k}`, before: null, after: { id: `i${k}`, text: `x${k}`, captured: `x${k}`, source: 'typed' as const, capturedAt: '2026-10-01T10:00:00.000Z', status: 'inbox' as const, tags: [] } }],
      }));
    const timed = (n: number) => {
      const st = createSqliteStore(tempFile(), { ...(seed as State), activity: big(n) });
      const t0 = performance.now();
      for (let k = 0; k < 20; k++)
        st.update((s) => {
          s.tickler.push({ id: `t${k}`, day: '2026-10-05', text: 'x' });
        });
      return (performance.now() - t0) / 20;
    };
    const empty = timed(0);
    const full = timed(15_000);
    // The regression this guards against was 77 ms against 1 ms; the margin absorbs a loaded machine.
    expect(full).toBeLessThan(empty * 4 + 20);
  });
});

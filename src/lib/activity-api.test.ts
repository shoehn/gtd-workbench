import { beforeEach, describe, expect, it } from 'vitest';
import { runAs, runSilently } from './activity';
import * as api from './api';
import { store } from './store';
import { demoSeed as seed } from './store/seed';
import type { State } from './store/types';

beforeEach(() =>
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  ),
);

const latest = () => api.listActivity({ limit: 1 })[0];

describe('the api logs every write', () => {
  it('a capture from the UI is yours; one through a client carries its name', () => {
    api.capture('Call Alice @calls');
    expect(latest()).toMatchObject({ actorLabel: 'you', summary: 'Captured “Call Alice”', blocker: null });
    runAs({ kind: 'client', id: 'c1', name: 'Phone agent' }, () => api.capture('Buy clay'));
    expect(latest()).toMatchObject({ actorLabel: 'Phone agent', actorKey: 'c1' });
  });

  it('clarify reads as a move between lists', () => {
    api.clarify('i1', { kind: 'action', text: 'Ask about the invoice', route: { to: 'waiting', who: 'Dentist' } });
    expect(latest().summary).toBe('“Ask about the invoice”: Inbox → Waiting For (Dentist)');
  });

  it('listActivity is newest first and limited; filters by actor and by subject', () => {
    for (let n = 0; n < 5; n++) api.capture(`x${n}`);
    runAs({ kind: 'mail' }, () => api.capture('from mail'));
    expect(api.listActivity({ limit: 3 }).map((e) => e.summary)).toEqual(['Captured “from mail”', 'Captured “x4”', 'Captured “x3”']);
    expect(api.listActivity({ actor: 'mail' })).toHaveLength(1);
    api.editNext('n1', { priority: 'C' });
    expect(api.listActivity({ subject: 'p-table' }).some((e) => e.summary.startsWith('Edited “Compare'))).toBe(true);
  });
});

describe('undo through the api', () => {
  it('undoes a clarify; the undo is logged as yours', () => {
    api.clarify('i1', { kind: 'trash' });
    const id = latest().id;
    api.undoActivity(id);
    expect(api.getItem('i1')!.status).toBe('inbox');
    expect(latest()).toMatchObject({ undoOf: id, actorLabel: 'you' });
  });

  it('undo is refused once a renumbering touched an item since', () => {
    api.editNext('n3', { priority: 'A' }); // renumbers the B and A actions
    const id = latest().id;
    runAs({ kind: 'client', id: 'c1', name: 'Phone agent' }, () => api.complete('n1')); // renumbers the As again
    expect(() => api.undoActivity(id)).toThrow('undo: changed since by Phone agent');
    expect(api.getItem('n3')!.priority).toBe('A'); // nothing half-applied
  });

  it('undo of a purge restores the item', () => {
    api.trash(['i1']);
    api.purgeTrash(); // "empty trash": deleted for good
    const purge = latest();
    // other trashed seed items may be purged in the same go: check this one's phrase is there
    expect(purge.summary).toContain('Deleted “Call the dentist about the invoice” for good');
    api.undoActivity(purge.id);
    expect(api.getItem('i1')!.status).toBe('trash');
  });

  it('an unknown entry is refused', () => {
    expect(() => api.undoActivity('nope')).toThrow('undo: unknown entry nope');
  });
});

describe('undo keeps the app’s rules (review)', () => {
  it('no duplicate priority numbers: undoing a completion renumbers', () => {
    api.complete('n1');
    const done = latest().id;
    api.clarify('i1', { kind: 'action', text: 'Call the dentist', route: { to: 'next', context: '@calls', priority: 'A', time: 15, energy: 'low' } });
    api.undoActivity(done);
    const as = store.getState().items.filter((i) => i.status === 'next' && i.priority === 'A').map((i) => i.priorityNo);
    expect(new Set(as).size).toBe(as.length);
    expect(as.sort()).toEqual(as.map((_, n) => n + 1));
  });

  it('a project is not brought back under a title an open project has taken since', () => {
    api.clarify('i1', { kind: 'action', text: 'Get quotes', project: { newTitle: 'Studio extension' }, route: { to: 'done' } });
    const created = latest().id;
    store.update((s) => {
      s.projects = s.projects.filter((p) => p.title !== 'Studio extension'); // gone (as if dropped and purged)
    });
    const removal = latest().id;
    api.clarify('i2', { kind: 'action', text: 'Ask the builder', project: { newTitle: 'Studio extension' }, route: { to: 'done' } });
    expect(() => api.undoActivity(removal)).toThrow(/undo: .*“Studio extension” is open/);
    expect(created).toBeTruthy();
  });
});

describe('who purges the trash (review)', () => {
  const oldTrash = () =>
    store.update((s) => {
      const i = s.items.find((x) => x.id === 'i2')!;
      i.status = 'trash';
      i.trashedAt = '2026-07-01T10:00:00.000Z'; // long over 30 days
    });

  it('the automatic 30-day purge is the app’s, not whoever trashed something else', () => {
    oldTrash();
    runAs({ kind: 'client', id: 'c1', name: 'Phone agent' }, () => api.trash(['i1']));
    const [purge, trashed] = api.listActivity({ limit: 2 });
    expect(trashed).toMatchObject({ actorLabel: 'Phone agent' });
    expect(purge).toMatchObject({ actorLabel: 'the app' });
    expect(purge.summary).toContain('for good');
  });

  it('undoing a purge sticks: the item is not purged again by the next trash', () => {
    oldTrash();
    api.trash(['i1']);
    api.undoActivity(api.listActivity({ limit: 1 })[0].id); // the purge of i2
    expect(api.getItem('i2')!.status).toBe('trash');
    api.trash(['i4']);
    expect(api.getItem('i2')?.status).toBe('trash');
  });
});

describe('the activity view with a year of entries (review)', () => {
  const fill = (n: number) =>
    runSilently(() =>
      store.update((s) => {
        const n1 = s.items.find((i) => i.id === 'n1')!;
        s.activity = Array.from({ length: n }, (_, k) => ({
          id: `e${k}`,
          at: '2026-09-01T10:00:00.000Z',
          actor: k === 0 ? ({ kind: 'mail' } as const) : ({ kind: 'user' } as const),
          summary: `Edited “x”: text`,
          // every entry left n1 differently than it is now: all are blocked
          changes: [{ kind: 'item' as const, id: 'n1', before: null, after: { ...n1, text: `v${k}` } }],
        }));
      }),
    );

  it('200 blocked rows out of 15 000 are listed quickly', () => {
    fill(15_000);
    const t0 = performance.now();
    const rows = api.listActivity({ limit: 200 });
    // the newest has nothing after it: changed since, by no later entry; the others name who
    expect(rows[0].blocker).toBe('changed since');
    expect(rows.slice(1).every((r) => r.blocker === 'changed since by you')).toBe(true);
    expect(performance.now() - t0).toBeLessThan(60);
  });

  it('every actor in the log is offered as a filter, also ones only seen long ago', () => {
    fill(2_000);
    expect(api.listActivityActors()).toEqual([
      { key: 'you', label: 'you' },
      { key: 'mail', label: 'mail' },
    ]);
  });
});

describe('nested updates (MCP stage 2)', () => {
  it('a capture inside an update is part of it: one entry for both changes', () => {
    const before = store.getState().activity.length;
    store.update(() => {
      api.capture('First');
      api.capture('Second');
    });
    expect(store.getState().activity.length).toBe(before + 1);
    expect(latest().summary).toBe('Captured “First”; Captured “Second”');
  });

  it('a throw inside rolls back everything the update did, in either store', () => {
    const items = store.getState().items.length;
    expect(() =>
      store.update(() => {
        api.capture('Never kept');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(store.getState().items.length).toBe(items);
    expect(api.listInbox().some((i) => i.text === 'Never kept')).toBe(false);
  });
});

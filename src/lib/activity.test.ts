import { describe, expect, it } from 'vitest';
import { applyUndo, diff, record, runAs, runSilently, runUndo, setActivityClock, snapshot, summarize, undoBlocker } from './activity';
import type { Item } from './model';
import type { State } from './store/types';

const item = (id: string, over: Partial<Item> = {}): Item => ({ id, text: `Item ${id}`, captured: `Item ${id}`, source: 'typed', capturedAt: '2026-10-01T08:00:00.000Z', status: 'inbox', tags: [], ...over });
const state = (items: Item[] = []): State => ({ items, projects: [], tickler: [], activity: [], clients: [] }) as unknown as State;
const change = (s: State, fn: (s: State) => void) => {
  const before = snapshot(s);
  fn(s);
  record(s, before);
};

setActivityClock(() => new Date('2026-10-01T12:00:00.000Z'));

describe('diff and summary', () => {
  it('created, moved, edited and deleted items read as one would say them', () => {
    const s = state([item('a'), item('b', { status: 'next', context: '@calls', priority: 'B', priorityNo: 1 })]);
    const before = snapshot(s);
    s.items.push(item('c'));
    s.items[0].status = 'waiting';
    s.items[0].waiting = { who: 'Alice', since: '2026-10-01' };
    s.items[1].priority = 'A';
    const changes = diff(before, s);
    expect(changes.map((c) => c.id).sort()).toEqual(['a', 'b', 'c']);
    expect(summarize(changes)).toBe('“Item a”: Inbox → Waiting For (Alice); Edited “Item b”: priority; Captured “Item c”');
  });

  it('a renumbering alone is recorded but not news', () => {
    const s = state([item('b', { status: 'next', priority: 'B', priorityNo: 2 })]);
    const before = snapshot(s);
    s.items[0].priorityNo = 1;
    expect(summarize(diff(before, s))).toBe('Renumbered priorities');
  });

  it('key order does not count as a change', () => {
    const s = state([item('a', { context: '@calls' })]);
    const before = snapshot(s);
    const { context, ...rest } = s.items[0];
    s.items[0] = { ...rest, context } as Item;
    expect(diff(before, s)).toEqual([]);
  });

  it('more than three phrases are cut with a count', () => {
    const s = state();
    const before = snapshot(s);
    for (const id of ['a', 'b', 'c', 'd', 'e']) s.items.push(item(id));
    expect(summarize(diff(before, s))).toBe('Captured “Item a”; Captured “Item b”; Captured “Item c” (+2 more)');
  });
});

describe('record', () => {
  it('outside any scope the actor is the user; runAs names the client', () => {
    const s = state();
    change(s, (x) => x.items.push(item('a')));
    runAs({ kind: 'client', id: 'c1', name: 'Claude Desktop' }, () => change(s, (x) => x.items.push(item('b'))));
    expect(s.activity.map((e) => e.actor)).toEqual([{ kind: 'user' }, { kind: 'client', id: 'c1', name: 'Claude Desktop' }]);
    expect(s.activity[0]).toMatchObject({ at: '2026-10-01T12:00:00.000Z', summary: 'Captured “Item a”' });
  });

  it('nothing changed, nothing logged; silent scopes are not logged', () => {
    const s = state([item('a')]);
    change(s, () => {});
    runSilently(() => change(s, (x) => x.items.push(item('b'))));
    expect(s.activity).toEqual([]);
  });

  it('entries older than 365 days are pruned on the next write', () => {
    const s = state();
    s.activity.push({ id: 'old', at: '2025-09-30T11:00:00.000Z', actor: { kind: 'user' }, summary: 'x', changes: [] });
    s.activity.push({ id: 'young', at: '2025-10-02T11:00:00.000Z', actor: { kind: 'user' }, summary: 'y', changes: [] });
    change(s, (x) => x.items.push(item('a')));
    expect(s.activity.map((e) => e.id)).toEqual(['young', s.activity[1].id]);
  });
});

describe('undo', () => {
  it('restores the before of every change; the undo is an entry of its own', () => {
    const s = state([item('a')]);
    change(s, (x) => {
      x.items[0].status = 'trash';
      x.items.push(item('b'));
    });
    const e = s.activity[0];
    expect(undoBlocker(s, e)).toBeNull();
    runUndo(e.id, () => change(s, (x) => applyUndo(x, e)));
    expect(s.items.map((i) => [i.id, i.status])).toEqual([['a', 'inbox']]);
    expect(s.activity[1]).toMatchObject({ undoOf: e.id, summary: `Undid: ${e.summary}` });
  });

  it('is refused once something touched those items since, naming who', () => {
    const s = state([item('a')]);
    change(s, (x) => (x.items[0].text = 'First'));
    const e = s.activity[0];
    runAs({ kind: 'client', id: 'c1', name: 'Phone agent' }, () => change(s, (x) => (x.items[0].text = 'Second')));
    expect(undoBlocker(s, e)).toBe('changed since by Phone agent');
  });

  it('undoing the undo brings the change back', () => {
    const s = state([item('a')]);
    change(s, (x) => (x.items[0].text = 'New'));
    const e = s.activity[0];
    runUndo(e.id, () => change(s, (x) => applyUndo(x, e)));
    const u = s.activity[1];
    expect(undoBlocker(s, e)).toBe('changed since by you');
    runUndo(u.id, () => change(s, (x) => applyUndo(x, u)));
    expect(s.items[0].text).toBe('New');
  });
});

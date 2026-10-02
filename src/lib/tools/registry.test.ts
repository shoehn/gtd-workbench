import { beforeEach, describe, expect, it } from 'vitest';
import { runSilently } from '../activity';
import * as api from '../api';
import type { ClientIdentity } from '../clients';
import { store } from '../store';
import { demoSeed as seed } from '../store/seed';
import type { State } from '../store/types';
import { itemOut } from './shape';
import { TOOLS, listToolsFor, toolNamed } from './index';

beforeEach(() =>
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  ),
);
const client = (preset: ClientIdentity['preset']): ClientIdentity => ({ id: 'c1', name: 'Test', preset });

describe('tool registry', () => {
  it('names are unique snake_case; every tool has a description and a strict object schema', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('a client lists only what its preset allows, with JSON Schemas', () => {
    const cap = listToolsFor(client('capture')).map((t) => t.name);
    expect(cap.sort()).toEqual(['add_tickler', 'capture', 'whoami']);
    const whoami = listToolsFor(client('assistant')).find((t) => t.name === 'whoami')!;
    expect(whoami.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('whoami says who the client is and what it may call', () => {
    const r = toolNamed('whoami')!.run({}, { client: client('capture') }) as { name: string; preset: string; tools: string[] };
    expect(r).toMatchObject({ name: 'Test', preset: 'capture' });
    expect(r.tools).toContain('whoami');
  });
});

describe('itemOut', () => {
  it('an item as tools answer with it: list name, priority A1, project title, link', () => {
    const n1 = itemOut(api.getItem('n1')!);
    expect(n1).toMatchObject({ id: 'n1', list: 'Next Actions', status: 'next', priority: 'A1', project: { id: 'p-table' }, href: '/next?highlight=n1' });
    expect(n1).not.toHaveProperty('tags');
    expect(itemOut(api.getItem('i1')!)).toMatchObject({ list: 'Inbox', href: '/clarify?item=i1' });
  });
});

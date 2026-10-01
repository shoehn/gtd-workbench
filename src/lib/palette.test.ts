import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import { rank, score } from './fuzzy';
import { store } from './store';
import { demoSeed as seed } from './store/seed';
import type { State } from './store/types';

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

describe('fuzzy', () => {
  it('prefix beats word start beats substring; every word must match', () => {
    expect(score('cal', 'Call the shop')).toBeGreaterThan(score('cal', 'Pay the calendar fee'));
    expect(score('shop', 'Call the shop')).toBeGreaterThan(score('hop', 'Call the shop'));
    expect(score('hop', 'Call the shop')).toBeGreaterThan(0);
    expect(score('shop plumber', 'Call the shop')).toBe(0);
    expect(rank('re', ['Pay', 'Reply', 'Prepare', 'Read'], (s) => s)).toEqual(['Reply', 'Read', 'Prepare']);
  });
});

describe('palette index', () => {
  it('finds a waiting-for by its words or by who it waits on, and opens its row', () => {
    const d = api.paletteData();
    const find = (q: string) => rank(q, d.items, (i) => `${i.text} ${i.detail}`)[0];
    expect(find('surcharge')).toMatchObject({ id: 'w2', list: 'Waiting For', href: '/waiting?highlight=w2' });
    expect(find('neighbour')).toMatchObject({ id: 'w7', href: '/waiting?highlight=w7' });
  });

  it('every list links to the row on its screen; trash never shows', () => {
    api.trash(['i1']);
    const d = api.paletteData();
    const href = (id: string) => d.items.find((i) => i.id === id)?.href;
    expect(href('i2')).toBe('/clarify?item=i2');
    expect(href('n1')).toBe('/next?highlight=n1');
    expect(href('s1')).toBe('/waiting?tab=someday&highlight=s1');
    expect(href('l1')).toBe('/projects?p=p-table');
    expect(href('c4')).toBe('/calendar?week=2026-W39');
    expect(href('i1')).toBeUndefined();
    expect(d.contexts.find((c) => c.name === '@computer')?.open).toBe(6);
    expect(d.reviewOpen).toBe(true);
  });
});

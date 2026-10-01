import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import { store } from './store';
import { demoSeed as seed } from './store/seed';
import type { State } from './store/types';

const item = (id: string) => api.getItem(id)!;

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

describe('reference', () => {
  it('DoD: Clarify "No → Reference" files the warranty card as a note under Home maintenance', () => {
    const res = api.clarify('i7', { kind: 'reference', reference: { kind: 'note' }, project: { id: 'p-home' } });
    expect(res).toMatchObject({ projectId: 'p-home', projectCreated: false });
    expect(item('i7')).toMatchObject({ status: 'reference', projectId: 'p-home', reference: { kind: 'note' } });
    expect(api.listReference().map((i) => i.id)).toContain('i7');
    expect(api.projectItems('p-home').filter((i) => i.status === 'reference').map((i) => i.id)).toEqual(['i7']);
    expect(api.navCounts().reference).toBe(7);
  });

  it('the kind is guessed from the text; a bare "No → Reference" still works', () => {
    expect(api.guessReference('Paper on glazes https://example.com/glazes.pdf read later')).toEqual({ kind: 'link', url: 'https://example.com/glazes.pdf' });
    expect(api.guessReference('Warranty card for the printer')).toEqual({ kind: 'note' });
    api.clarify('i5', { kind: 'reference' });
    expect(item('i5').reference).toEqual({ kind: 'note' });
    expect(() => api.clarify('i2', { kind: 'reference', reference: { kind: 'link', url: 'nope' } })).toThrow(/needs a URL/);
  });

  it('DoD: a link of any scheme is found by its host; rows say host / note start / file name', () => {
    const r5 = item('r5');
    expect(api.referenceLine(r5.reference!)).toBe('obsidian://open');
    expect(api.listReference().filter((i) => api.matchesReference(i, 'obsidian')).map((i) => i.id)).toEqual(['r5']);
    expect(api.listReference().filter((i) => api.matchesReference(i, 'pottery')).map((i) => i.id)).toEqual(['r5']);
    expect(api.listReference().filter((i) => api.matchesReference(i, 'quote dining')).map((i) => i.id).sort()).toEqual(['r2', 'r3']);
    expect(api.referenceLine(item('r4').reference!)).toBe('nook-measurements.jpg');
    expect(api.referenceLine(item('r6').reference!)).toMatch(/^Stoneware: bisque to 1000 °C.{0,70}…$/);
  });

  it('"+ reference" on a project makes a note; entries can be edited and moved between projects', () => {
    const r = api.addReference('Delivery terms', { kind: 'note', body: 'Door only, no stairs' }, 'p-table');
    expect(item(r.id)).toMatchObject({ status: 'reference', projectId: 'p-table', reference: { kind: 'note', body: 'Door only, no stairs' } });
    api.editReference(r.id, { text: 'Delivery terms (door only)', reference: { kind: 'link', url: 'https://shop.example.com/terms' }, project: null });
    expect(item(r.id)).toMatchObject({ text: 'Delivery terms (door only)', reference: { kind: 'link', url: 'https://shop.example.com/terms' } });
    expect(item(r.id).projectId).toBeUndefined();
    api.editReference(r.id, { project: { newTitle: 'Kitchen finished' } });
    expect(api.getProject(item(r.id).projectId!)?.title).toBe('Kitchen finished');
    expect(() => api.editReference('n1', { text: 'x' })).toThrow(/not a reference entry/);
  });

  it('someday ↔ reference keeps what it was', () => {
    api.toReference('s4');
    expect(item('s4')).toMatchObject({ status: 'reference', reference: { kind: 'note' }, bucket: 'Work & learning' });
    api.toSomeday('s4');
    expect(item('s4')).toMatchObject({ status: 'someday', bucket: 'Work & learning' });
    expect(api.listSomeday().flatMap((g) => g.items.map((i) => i.id))).toContain('s4');
  });

  it('trash with undo, like everywhere', () => {
    const moved = api.trash(['r6']);
    expect(api.listReference().map((i) => i.id)).not.toContain('r6');
    api.untrash(moved);
    expect(item('r6').status).toBe('reference');
  });

  it('the palette finds reference entries and opens their row', () => {
    const r = api.paletteData().items.find((i) => i.id === 'r4');
    expect(r).toMatchObject({ list: 'Reference', href: '/reference?highlight=r4' });
  });
});

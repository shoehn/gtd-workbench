import { describe, expect, it } from 'vitest';
import type { Draft } from '@/lib/model';
import type { PickerProject } from '../ui/ProjectPicker';
import { clarifyStart } from './start';

const projects: PickerProject[] = [
  { id: 'p-active', title: 'Shelves built', active: true, nextActions: 0 },
  { id: 'p-parked', title: 'Kiln repaired', active: false, nextActions: 0 },
];
const contexts = ['@calls', '@computer'];
const draft = (over: Partial<Draft>): Draft => ({ by: 'Phone agent', at: '2026-10-02T09:00:00.000Z', reason: 'r', kind: 'action', ...over });

describe('clarifyStart', () => {
  it('a draft saying "next action" for a project parked since does not make it one (review)', () => {
    const s = clarifyStart({ text: 'x', draft: draft({ project: { id: 'p-parked' }, next: true, route: 'waiting' }) }, projects, contexts);
    expect(s.picked).toMatchObject({ id: 'p-parked', active: false });
    expect(s.asNext).toBe(false); // a later step, as a pick by hand would make it
  });

  it('for an active or a new project the draft decides', () => {
    expect(clarifyStart({ text: 'x', draft: draft({ project: { id: 'p-active' }, next: false }) }, projects, contexts).asNext).toBe(false);
    expect(clarifyStart({ text: 'x', draft: draft({ project: { newTitle: 'Studio' }, next: true }) }, projects, contexts).asNext).toBe(true);
  });

  it('a drafted project that is gone leaves the pick empty; an unknown context falls back', () => {
    const s = clarifyStart({ text: 'x', draft: draft({ project: { id: 'p-gone' }, context: '@nowhere' }) }, projects, contexts);
    expect(s.picked).toBeNull();
    expect(s.query).toBe('');
    expect(s.context).toBe('@calls');
  });
});

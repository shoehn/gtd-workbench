import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import { parseProjectFilter, projectsHref } from './project-filter';
import seed from './store/seed.json';
import { store } from './store/memory';
import type { State } from './store/types';

const item = (id: string) => api.getItem(id)!;
const project = (id: string) => api.getProject(id)!;
const fields: api.NextFields = { context: '@home', priority: 'A', time: 30, energy: 'low' };

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

describe('seed: p-bench as drawn', () => {
  it('2 next actions, 3 later steps, 1 done, 1 waiting-for', () => {
    const items = api.projectItems('p-bench');
    const of = (status: string) => items.filter((i) => i.status === status).map((i) => i.id);
    expect(of('next')).toEqual(['n1', 'n8']);
    expect(of('later')).toEqual(['l1', 'l2', 'l3']);
    expect(of('done')).toEqual(['d1']);
    expect(of('waiting')).toEqual(['w2']);
    expect(api.isFocused(item('n1'))).toBe(true);
    expect(project('p-bench')).toMatchObject({ createdFrom: 'inbox', area: 'Home & workshop', goal: 'Workshop usable for pedal builds by winter' });
  });

  it('work / home come from the area map', () => {
    expect(api.projectKind(project('p-bench'))).toBe('home');
    expect(api.projectKind(project('p-grant'))).toBe('work');
  });
});

describe('demote and promote', () => {
  it('DoD: ↓ later on B4, then A1, stalls p-bench everywhere', () => {
    api.demote('n8');
    expect(api.projectStalled(project('p-bench'))).toBe(false);
    api.demote('n1');
    expect(api.projectStalled(project('p-bench'))).toBe(true);
    expect(api.health().stalled).toBe(2);
    expect(item('n1')).toMatchObject({ status: 'later' });
    for (const key of ['context', 'priority', 'priorityNo', 'time', 'energy', 'focusOn'] as const) {
      expect(item('n1')[key]).toBeUndefined();
    }
    // A renumbers without the demoted A1.
    expect(item('n2').priorityNo).toBe(1);
  });

  it('DoD: ↑ next asks for the fields and puts the step on Next Actions', () => {
    api.promote('l1', fields);
    expect(item('l1')).toMatchObject({ status: 'next', context: '@home', priority: 'A', priorityNo: 4, time: 30, energy: 'low' });
    expect(api.listNext().map((i) => i.id)).toContain('l1');
  });

  it('refuses the wrong status or bad fields', () => {
    expect(() => api.demote('l1')).toThrow(/^demote:/);
    expect(() => api.promote('n1', fields)).toThrow(/^promote:/);
    expect(() => api.promote('l1', { ...fields, context: '@moon' })).toThrow(/^promote:/);
  });
});

describe('add action / step', () => {
  it('adds a numbered next action and a later step to the project', () => {
    const a = api.addAction('p-gridfinity', '  Print three baseplates ', { ...fields, priority: 'B' });
    expect(item(a.id)).toMatchObject({ status: 'next', projectId: 'p-gridfinity', text: 'Print three baseplates', priority: 'B', priorityNo: 6 });
    expect(api.projectStalled(project('p-gridfinity'))).toBe(false);
    const s = api.addStep('p-gridfinity', 'Label the drawers');
    expect(item(s.id)).toMatchObject({ status: 'later', projectId: 'p-gridfinity' });
    expect(() => api.addStep('p-gridfinity', ' ')).toThrow(/^addStep:/);
  });
});

describe('complete / someday / update', () => {
  it('complete is refused while next actions or later steps are open', () => {
    expect(api.openInProject('p-bench')).toBe(5);
    expect(() => api.completeProject('p-bench')).toThrow('completeProject: 5 open — finish, demote or drop them first');
    api.complete('n10');
    api.completeProject('p-blog');
    expect(project('p-blog').status).toBe('completed');
  });

  it('→ someday demotes the next actions; → active brings it back stalled', () => {
    api.moveProjectToSomeday('p-bench');
    expect(project('p-bench').status).toBe('someday');
    expect(api.listNext().some((i) => i.projectId === 'p-bench')).toBe(false);
    expect(item('n1').status).toBe('later');
    api.activateProject('p-bench');
    expect(api.projectStalled(project('p-bench'))).toBe(true);
  });

  it('updates fields, keeps titles unique, clears empty optionals', () => {
    api.updateProject('p-bench', { goal: '  ', notes: 'n', title: 'Bench ordered' });
    expect(project('p-bench')).toMatchObject({ title: 'Bench ordered', notes: 'n' });
    expect(project('p-bench').goal).toBeUndefined();
    expect(() => api.updateProject('p-bench', { title: 'delay pedal built' })).toThrow(/already exists/);
    expect(() => api.updateProject('p-bench', { title: ' ' })).toThrow(/^updateProject:/);
  });
});

describe('filter param', () => {
  it('parses and writes hrefs', () => {
    expect(parseProjectFilter('stalled')).toBe('stalled');
    expect(parseProjectFilter('someday')).toBe('someday');
    expect(parseProjectFilter('nope')).toBe('active');
    expect(projectsHref('active')).toBe('/projects');
    expect(projectsHref('stalled', 'p-bench')).toBe('/projects?filter=stalled&p=p-bench');
  });
});

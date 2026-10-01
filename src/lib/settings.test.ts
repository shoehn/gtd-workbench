import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { instantAt, wallClock } from './clock';
import { store } from './store';
import { baseSeed, demoSeed as seed } from './store/seed';
import type { State } from './store/types';

const item = (id: string) => api.getItem(id)!;

beforeEach(() => {
  store.update((s) => Object.assign(s, structuredClone(seed) as State));
});

describe('seeds', () => {
  it('DoD: a fresh database has six contexts, three buckets, the 12-step template and nothing else', () => {
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(baseSeed));
    });
    const settings = api.getSettings();
    expect(settings.contexts).toHaveLength(6);
    expect(settings.buckets).toHaveLength(3);
    expect(api.reviewSteps()).toHaveLength(12);
    expect(store.getState().externalCalendars).toEqual([]);
    expect(api.navCounts()).toMatchObject({ inbox: 0, next: 0, calendar: 0, waiting: 0, projects: 0, someday: 0 });
  });

  it('the demo sits on top of the base, with its own lists', () => {
    expect(seed.reviewTemplate).toEqual(baseSeed.reviewTemplate);
    expect(baseSeed.contexts).toEqual(['@computer', '@calls', '@office', '@home', '@errands', '@anywhere']);
    expect(seed.contexts).toContain('@studio');
    expect(seed.items.length).toBeGreaterThan(0);
    expect(baseSeed.items).toEqual([]);
  });
});

describe('contexts and buckets', () => {
  it('DoD: renaming @calls renames it on every item, and Clarify offers the new name', () => {
    const calls = store.getState().items.filter((i) => i.context === '@calls').map((i) => i.id);
    expect(calls.length).toBeGreaterThan(0);
    api.renameListEntry('context', '@calls', '@phone');
    expect(api.listContexts()).toContain('@phone');
    expect(api.listContexts()).not.toContain('@calls');
    for (const id of calls) expect(item(id).context).toBe('@phone');
    expect(store.getState().items.some((i) => i.context === '@calls')).toBe(false);
  });

  it('DoD: deleting @computer while in use is refused with the count', () => {
    const used = api.listUsage('context', '@computer');
    expect(used).toBeGreaterThan(0);
    expect(() => api.deleteListEntry('context', '@computer')).toThrow(`${used} actions use @computer — move them first`);
    expect(api.listContexts()).toContain('@computer');
  });

  it('an unused context can go, and done items do not hold it', () => {
    api.addListEntry('context', ' @garden ');
    expect(api.listContexts().at(-1)).toBe('@garden');
    api.deleteListEntry('context', '@garden');
    expect(api.listContexts()).not.toContain('@garden');
  });

  it('checks names: one @word, unique regardless of case', () => {
    expect(() => api.addListEntry('context', 'calls')).toThrow(/@ and one word/);
    expect(() => api.addListEntry('context', '@two words')).toThrow(/@ and one word/);
    expect(() => api.addListEntry('context', '@Calls')).toThrow(/already exists/);
    expect(() => api.renameListEntry('context', '@home', '@office')).toThrow(/already exists/);
  });

  it('moves set the display order', () => {
    api.moveListEntry('context', '@calls', 0);
    expect(api.listContexts()[0]).toBe('@calls');
    api.moveListEntry('context', '@calls', 99);
    expect(api.listContexts().at(-1)).toBe('@calls');
  });

  it('buckets follow the same rules through someday items', () => {
    const b = 'Studio & craft';
    expect(() => api.deleteListEntry('bucket', b)).toThrow(/3 someday items use Studio & craft/);
    api.renameListEntry('bucket', b, 'Studio');
    expect(item('s1').bucket).toBe('Studio');
  });

  it('the follow-up context moves with a rename and blocks a delete', () => {
    expect(api.getSettings().followUpContext).toBe('@calls');
    api.renameListEntry('context', '@calls', '@phone');
    expect(api.getSettings().followUpContext).toBe('@phone');
    expect(item(api.followUp('w1').id).context).toBe('@phone');
    api.addListEntry('context', '@spare');
    api.updateSettings({ followUpContext: '@spare' });
    expect(() => api.deleteListEntry('context', '@spare')).toThrow(/@spare is where follow-ups go/);
    expect(item(api.followUp('w7').id).context).toBe('@spare');
    // desks, support and committees still answer by mail
    expect(item(api.followUp('w3').id).context).toBe('@computer');
    expect(() => api.updateSettings({ followUpContext: '@nowhere' })).toThrow(/unknown context/);
  });
});

describe('review template', () => {
  it('DoD: a running review keeps its checklist; the next one uses the edit', () => {
    api.finishReview();
    const edit = (text: string) => {
      const t = structuredClone(api.reviewTemplate());
      t.phases[0].steps[0].text = text;
      api.updateSettings({ reviewTemplate: t });
    };
    edit('Collect everything loose');
    api.startReview();
    edit('Collect everything, really');
    expect(api.reviewSteps(api.openRun())[0].text).toBe('Collect everything loose');
    api.finishReview();
    api.startReview();
    expect(api.reviewSteps(api.openRun())[0].text).toBe('Collect everything, really');
  });

  it('phases are fixed; steps need text and a known link', () => {
    const t = structuredClone(api.reviewTemplate());
    t.phases[0].name = 'Tidy up';
    expect(() => api.updateSettings({ reviewTemplate: t })).toThrow(/phases are fixed/);
    const u = structuredClone(api.reviewTemplate());
    u.phases[1].steps.push({ id: 'x', text: 'Look at the weather', link: '/weather' });
    expect(() => api.updateSettings({ reviewTemplate: u })).toThrow(/unknown link/);
  });

  it('an added step linked to a list gets that list’s live figure', () => {
    api.finishReview(); // the open demo run keeps its own checklist
    const t = structuredClone(api.reviewTemplate());
    t.phases[1].steps.push({ id: 'st-extra', text: 'Scan waiting-for again', link: '/waiting' });
    api.updateSettings({ reviewTemplate: t });
    expect(api.reviewLiveLine('st-extra')).toMatchObject({ href: '/waiting?filter=overdue', warn: true });
  });

  it('reset brings back the default', () => {
    const t = structuredClone(api.reviewTemplate());
    t.phases[2].steps = [];
    api.updateSettings({ reviewTemplate: t });
    api.resetTemplate();
    expect(api.reviewSteps()).toHaveLength(12);
  });
});

describe('clock', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('the demo date is opt-in: tests and DEMO_DATE=1 only, never production', () => {
    expect(api.today()).toBe('2026-09-26'); // vitest runs as NODE_ENV=test
    vi.stubEnv('NODE_ENV', 'development');
    expect(api.today()).not.toBe('2026-09-26');
    vi.stubEnv('DEMO_DATE', '1');
    expect(api.today()).toBe('2026-09-26');
    vi.stubEnv('NODE_ENV', 'production');
    expect(api.today()).not.toBe('2026-09-26');
  });

  it('reads the wall clock in a zone', () => {
    const t = new Date('2026-09-26T22:30:00Z');
    expect(wallClock(t, 'Europe/Zurich')).toMatchObject({ day: '2026-09-27', hour: 0, minute: 30 });
    expect(wallClock(t, 'America/New_York')).toMatchObject({ day: '2026-09-26', hour: 18 });
    expect(instantAt('2026-09-27', 0, 30, 0, 0, 'Europe/Zurich').toISOString()).toBe('2026-09-26T22:30:00.000Z');
    expect(instantAt('2026-01-15', 9, 0, 0, 0, 'Europe/Zurich').toISOString()).toBe('2026-01-15T08:00:00.000Z');
  });

  it('today follows Settings.timezone; an unknown zone is refused', () => {
    expect(api.today()).toBe('2026-09-26');
    api.updateSettings({ timezone: 'Pacific/Kiritimati' });
    expect(api.today()).toBe('2026-09-26'); // pinned demo date, whatever the zone
    expect(api.timeZone()).toBe('Pacific/Kiritimati');
    expect(() => api.updateSettings({ timezone: 'Mars/Olympus' })).toThrow(/unknown time zone/);
  });
});

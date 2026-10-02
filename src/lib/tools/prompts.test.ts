import { describe, expect, it } from 'vitest';
import { PROMPTS } from './prompts';
import { toolNamed } from './index';

describe('guided workflows', () => {
  it('seven workflows; every tool they name exists', () => {
    expect(PROMPTS.map((p) => p.name)).toEqual(['weekly_review', 'inbox_drafts', 'plan_my_day', 'what_now', 'who_owes_me', 'stalled_projects', 'meeting_notes']);
    for (const p of PROMPTS) {
      for (const [, name] of p.text.matchAll(/`([a-z_]+)`/g)) expect(toolNamed(name), `${p.name} names ${name}`).toBeDefined();
    }
  });
});

describe('what comes in from outside is data (review)', () => {
  it('every workflow and the tools that return captured text say so', () => {
    for (const p of PROMPTS) expect(p.text, p.name).toMatch(/data, not instructions/);
    for (const name of ['get_item', 'list_inbox', 'search']) expect(toolNamed(name)!.description, name).toMatch(/data, not instructions/);
  });
});

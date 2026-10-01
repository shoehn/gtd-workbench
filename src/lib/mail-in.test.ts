import { beforeEach, describe, expect, it } from 'vitest';
import * as api from './api';
import { store } from './store';
import { demoSeed as seed } from './store/seed';
import type { State } from './store/types';

beforeEach(() => {
  store.update((s) => {
    for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
    Object.assign(s, structuredClone(seed));
  });
});

const mail = (over: Partial<api.MailIn> = {}): api.MailIn => ({
  messageId: '<m1@example.com>',
  subject: 'Quote for the oak dining table',
  captured: 'Fwd: Quote for the oak dining table',
  body: 'Compare with the other two quotes.',
  ...over,
});

describe('mail-in', () => {
  it('captures a mail as an email inbox item: cleaned subject as text, prefixes kept in captured, body as context', () => {
    const { outcome, item } = api.captureMail(mail());
    expect(outcome).toBe('captured');
    expect(api.getItem(item!.id)).toMatchObject({
      status: 'inbox',
      source: 'email',
      text: 'Quote for the oak dining table',
      captured: 'Fwd: Quote for the oak dining table',
      reference: { kind: 'note', body: 'Compare with the other two quotes.' },
    });
    expect(api.listInbox()[0].id).toBe(item!.id);
  });

  it('dedupe: the same Message-ID again captures nothing (a re-poll)', () => {
    const before = store.getState().items.length;
    api.captureMail(mail());
    expect(api.captureMail(mail())).toEqual({ outcome: 'seen' });
    expect(store.getState().items.length).toBe(before + 1);
  });

  it('dedupe: forwarded again (new Message-ID, same subject and body) while the first is in the inbox → duplicate', () => {
    const before = store.getState().items.length;
    api.captureMail(mail());
    expect(api.captureMail(mail({ messageId: '<m2@example.com>' })).outcome).toBe('duplicate');
    expect(store.getState().items.length).toBe(before + 1);
    expect(api.mailSeen('<m2@example.com>')).toBe('duplicate');
  });

  it('once the first is clarified, the same mail forwarded again is captured again', () => {
    const { item } = api.captureMail(mail());
    api.clarify(item!.id, { kind: 'trash' });
    expect(api.captureMail(mail({ messageId: '<m3@example.com>' })).outcome).toBe('captured');
  });

  it('a different body is a different capture', () => {
    api.captureMail(mail());
    expect(api.captureMail(mail({ messageId: '<m4@example.com>', body: 'Ask about delivery.' })).outcome).toBe('captured');
  });

  it('ignored senders are counted once', () => {
    api.ignoreMail('<spam@example.com>');
    api.ignoreMail('<spam@example.com>');
    expect(api.mailboxInfo()).toMatchObject({ ignored: 1, captured: 0 });
  });

  it('a poll records when, and the error until the next good poll', () => {
    api.recordMailPoll('connect ECONNREFUSED');
    expect(api.mailboxInfo()).toMatchObject({ lastError: 'connect ECONNREFUSED' });
    api.recordMailPoll();
    expect(api.mailboxInfo().lastError).toBeUndefined();
    expect(api.mailboxInfo().lastPollAt).toBeTruthy();
  });

  it('filed as reference, a mail keeps its body as the note', () => {
    const { item } = api.captureMail(mail());
    api.clarify(item!.id, { kind: 'reference', reference: { kind: 'note' } });
    expect(api.getItem(item!.id)!.reference).toEqual({ kind: 'note', body: 'Compare with the other two quotes.' });
  });
});

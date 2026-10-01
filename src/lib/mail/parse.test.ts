import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BODY_MAX, cleanSubject, htmlToText, keptBody, parseMail } from './parse';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.eml`, import.meta.url));

describe('mail parser', () => {
  it('plain: subject as it is, body tidied (no runs of empty lines)', async () => {
    const m = await parseMail(fixture('plain'));
    expect(m).toEqual({
      messageId: '<plain-1@example.com>',
      from: 'designer@example.com',
      subject: 'Order more glaze for the test series @errands',
      captured: 'Order more glaze for the test series @errands',
      body: 'The celadon is nearly gone.\n\nTwo kilos should do until the kiln day.',
      attachments: 0,
    });
  });

  it('HTML-only: the text of it, no tags, no script; an encoded AW: subject is cleaned', async () => {
    const m = await parseMail(fixture('html-only'));
    expect(m.subject).toBe('Booth size for the fair — confirm');
    expect(m.captured).toBe('AW: Booth size for the fair — confirm');
    expect(m.body).toBe('Hi,\n\nthe organisers need the booth size by friday.');
    expect(m.body).not.toMatch(/<|alert/);
  });

  it('forwarded with attachments: prefixes stripped, sender lowercased, body cut at 2 KB, attachments counted not kept', async () => {
    const m = await parseMail(fixture('forwarded'));
    expect(m.subject).toBe('Quote for the oak dining table');
    expect(m.captured).toBe('Fwd: WG: Quote for the oak dining table');
    expect(m.from).toBe('designer@example.com');
    expect(m.body.length).toBe(BODY_MAX);
    expect(m.body).toMatch(/^Compare with the other two quotes\./);
    expect(m.body.endsWith('…')).toBe(true);
    expect(m.attachments).toBe(2);
    expect(m.body).not.toMatch(/PDF|quote\.pdf/);
    expect(keptBody(m)).toMatch(/\n\n\[2 attachments not kept — in the mailbox's Processed folder\]$/);
  });

  it('a mail without Message-ID gets a stable id from its source; without subject, the first body line', async () => {
    const raw = 'From: designer@example.com\r\nSubject: \r\n\r\nCall the kiln service\r\nabout the thermocouple\r\n';
    const a = await parseMail(raw);
    expect(a.messageId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect((await parseMail(raw)).messageId).toBe(a.messageId);
    expect(a.subject).toBe('Call the kiln service');
    expect(a.captured).toBe('(no subject)');
  });

  it('cleanSubject strips stacked and numbered prefixes in any case', () => {
    expect(cleanSubject('Re: Fwd: FW: re[2]: aw: wg: Booth')).toBe('Booth');
    expect(cleanSubject('Review: the glaze tests')).toBe('Review: the glaze tests');
  });

  it('htmlToText decodes entities and survives bad ones', () => {
    expect(htmlToText('a&amp;b&nbsp;&#x41;&#66;&#x110000;&bogus;')).toBe('a&b AB&bogus;');
  });
});

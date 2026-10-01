import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as capturePost } from '../app/api/capture/route';
import { POST as sharePost } from '../app/share/route';
import * as api from './api';
import { TEXT_MAX, captureLimiter, createLimiter, fromShare } from './capture-in';
import { store } from './store';
import { demoSeed as seed } from './store/seed';
import type { State } from './store/types';

const TOKEN = 'test-token-not-a-secret';

beforeEach(() => {
  store.update((s) => {
    for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
    Object.assign(s, structuredClone(seed));
  });
  captureLimiter.reset();
  process.env.CAPTURE_TOKEN = TOKEN;
});
afterEach(() => {
  delete process.env.CAPTURE_TOKEN;
});

const capture = (body: unknown, auth: string | null = `Bearer ${TOKEN}`) =>
  capturePost(
    new Request('http://localhost/api/capture', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const share = (fields: Record<string, string>, headers: Record<string, string> = { 'sec-fetch-site': 'none' }) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return sharePost(new Request('http://localhost/share', { method: 'POST', headers, body: form }));
};

describe('POST /api/capture', () => {
  it('DoD: creates the item with @calls parsed; 201 with the item (curl -d sends form-encoded: still JSON)', async () => {
    const res = await capture('{"text":"Call the shop @calls"}');
    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item).toMatchObject({ text: 'Call the shop', context: '@calls', source: 'typed', status: 'inbox' });
    expect(api.listInbox()[0].id).toBe(item.id);
  });

  it('url and note become the context the item carries', async () => {
    const res = await capture({ text: 'Read the glaze article', source: 'share', url: 'https://example.com/glaze', note: 'from the forum' });
    expect(await res.json()).toMatchObject({ source: 'share', reference: { kind: 'link', url: 'https://example.com/glaze', body: 'from the forum' } });
  });

  it('auth: no token, a wrong token → 401; off without CAPTURE_TOKEN → 404', async () => {
    expect((await capture({ text: 'x' }, null)).status).toBe(401);
    expect((await capture({ text: 'x' }, 'Bearer nope')).status).toBe(401);
    expect((await capture({ text: 'x' }, TOKEN)).status).toBe(401); // the scheme is required
    delete process.env.CAPTURE_TOKEN;
    expect((await capture({ text: 'x' })).status).toBe(404);
    expect(api.listInbox().some((i) => i.text === 'x')).toBe(false);
  });

  it('refuses what is not a capture: no text, unknown source, a URL without scheme, not JSON, too large', async () => {
    expect((await capture({})).status).toBe(400);
    expect((await capture({ text: 'x', source: 'fax' })).status).toBe(400);
    expect((await capture({ text: 'x', url: 'example.com' })).status).toBe(400);
    expect((await capture('text=x')).status).toBe(400);
    expect((await capture({ text: 'x'.repeat(TEXT_MAX + 1) })).status).toBe(413);
    expect((await capture({ text: 'x', note: 'y'.repeat(20_000) })).status).toBe(413);
  });

  it('rate limit: 60 a minute, then 429 with Retry-After', async () => {
    for (let i = 0; i < 60; i++) expect((await capture({ text: `item ${i}` })).status).toBe(201);
    const res = await capture({ text: 'one too many' });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('the limiter frees up as the window moves', () => {
    let t = 0;
    const l = createLimiter(2, 1000, () => t);
    expect([l.take(), l.take(), l.take()]).toEqual([true, true, false]);
    t = 1000;
    expect(l.take()).toBe(true);
  });
});

describe('share', () => {
  it('fromShare: the title is the text, a URL in the text counts as the link (Android)', () => {
    expect(fromShare({ title: 'Glaze recipes', text: 'https://example.com/glaze', url: '' })).toEqual({ text: 'Glaze recipes', source: 'share', url: 'https://example.com/glaze' });
    expect(fromShare({ title: '', text: 'Look at this https://example.com/a', url: null })).toEqual({ text: 'Look at this', source: 'share', url: 'https://example.com/a' });
    expect(fromShare({ text: '', url: 'https://example.com/b' })).toEqual({ text: 'example.com', source: 'share', url: 'https://example.com/b' });
    expect(fromShare({ title: 'Kiln', text: 'fires on friday' })).toEqual({ text: 'Kiln', source: 'share', note: 'fires on friday' });
    expect(fromShare({ title: ' ', text: '', url: '' })).toBeNull();
  });

  it('POST /share captures with source share and the URL attached, then shows the confirmation', async () => {
    const res = await share({ title: 'Glaze recipes', text: '', url: 'https://example.com/glaze' });
    expect(res.status).toBe(303);
    const id = new URLSearchParams(res.headers.get('location')!.split('?')[1]).get('item')!;
    expect(res.headers.get('location')).toBe(`/share/done?item=${id}`);
    expect(api.getItem(id)).toMatchObject({ text: 'Glaze recipes', source: 'share', reference: { kind: 'link', url: 'https://example.com/glaze' } });
  });

  it('an empty share captures nothing; a form posted from another site is refused', async () => {
    const before = api.listInbox().length;
    expect((await share({ title: '', text: '' })).headers.get('location')).toBe('/share/done?error=empty');
    expect((await share({ title: 'Injected' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect(api.listInbox().length).toBe(before);
  });
});

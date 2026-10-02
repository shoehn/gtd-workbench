import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as capturePost } from '../app/api/capture/route';
import { POST as sharePost } from '../app/share/route';
import * as api from './api';
import { NOTE_MAX, SHARE_MAX, TEXT_MAX, createLimiter, fromShare, limiters, readLimited } from './capture-in';
import { createClient, revokeClient } from './clients';
import { store } from './store';
import { demoSeed as seed } from './store/seed';
import type { State } from './store/types';

const TOKEN = 'test-token-not-a-secret';

beforeEach(() => {
  store.update((s) => {
    for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
    Object.assign(s, structuredClone(seed));
  });
  for (const l of Object.values(limiters)) l.reset();
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

/** A share as the browser sends it: multipart bytes with their content type. */
const share = async (fields: Record<string, string>, headers: Record<string, string> = { 'sec-fetch-site': 'none' }) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const encoded = new Response(form);
  const body = new Uint8Array(await encoded.arrayBuffer());
  return sharePost(new Request('http://localhost/share', { method: 'POST', headers: { ...headers, 'content-type': encoded.headers.get('content-type')! }, body }));
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

  it('requests without a valid token never use up the quota of the real captures (review P2 #3)', async () => {
    for (let i = 0; i < 60; i++) await capture({ text: 'x' }, 'Bearer wrong');
    expect((await capture({ text: 'still welcome' })).status).toBe(201);
  });

  it('wrong tokens are throttled on their own: 20 a minute, then 429', async () => {
    for (let i = 0; i < 20; i++) expect((await capture({ text: 'x' }, null)).status).toBe(401);
    const res = await capture({ text: 'x' }, null);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('shares have their own quota: 60 captures do not block a share', async () => {
    for (let i = 0; i < 60; i++) await capture({ text: `item ${i}` });
    expect((await share({ title: 'Glaze recipes' })).headers.get('location')).toMatch(/^\/share\/done\?item=/);
  });

  it('the limiter frees up as the window moves', () => {
    let t = 0;
    const l = createLimiter(2, 1000, () => t);
    expect([l.take(), l.take(), l.take()]).toEqual([true, true, false]);
    t = 1000;
    expect(l.take()).toBe(true);
  });
});

describe('body limits (review P2 #4)', () => {
  /** A chunked body (no Content-Length) of `chunks` × 16 KB, counting how much was pulled. */
  const chunked = (chunks: number) => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(16 * 1024).fill(120));
        if (pulled >= chunks) c.close();
      },
    });
    return { req: new Request('http://localhost/x', { method: 'POST', body, duplex: 'half' } as RequestInit), pulled: () => pulled };
  };

  it('a chunked body past the limit is cut off while streaming, not read whole', async () => {
    const { req, pulled } = chunked(64); // 1 MiB on offer
    expect(await readLimited(req, 32 * 1024)).toBeNull();
    expect(pulled()).toBeLessThan(6);
  });

  it('capture: a note over 8 KB is refused', async () => {
    expect((await capture({ text: 'x', note: 'y'.repeat(NOTE_MAX + 1) })).status).toBe(413);
  });

  it('share: over 64 KB captures nothing; a long shared text is cut to 8 KB', async () => {
    const before = api.listInbox().length;
    expect((await share({ title: 'Big', text: 'y'.repeat(SHARE_MAX) })).headers.get('location')).toBe('/share/done?error=large');
    expect(api.listInbox().length).toBe(before);
    const res = await share({ title: 'Long read', text: 'z'.repeat(20_000) });
    const id = new URLSearchParams(res.headers.get('location')!.split('?')[1]).get('item')!;
    const body = api.getItem(id)!.reference!.body!;
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(NOTE_MAX);
    expect(body.endsWith('…')).toBe(true);
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

describe('clients on the capture endpoint (MCP stage 1)', () => {
  beforeEach(() => {
    delete process.env.CAPTURE_TOKEN;
  });

  it('a capture through a named client is logged under its name', async () => {
    const { token } = createClient('n8n scan', 'capture');
    expect((await capture({ text: 'Warranty card' }, `Bearer ${token}`)).status).toBe(201);
    expect(api.listActivity({ limit: 1 })[0]).toMatchObject({ actorLabel: 'n8n scan', summary: 'Captured “Warranty card”' });
  });

  it('a revoked client gets 401; a read-only client gets 403', async () => {
    createClient('n8n scan', 'capture'); // the endpoint is in use (with no client that may capture it is off: 404)
    const a = createClient('Old script', 'capture');
    revokeClient(a.client.id);
    expect((await capture({ text: 'x' }, `Bearer ${a.token}`)).status).toBe(401);
    const ro = createClient('Report', 'read-only');
    expect((await capture({ text: 'x' }, `Bearer ${ro.token}`)).status).toBe(403);
  });

  it('the env token is logged as "capture (env)"', async () => {
    process.env.CAPTURE_TOKEN = TOKEN;
    await capture({ text: 'From the shell' });
    expect(api.listActivity({ limit: 1 })[0].actorLabel).toBe('capture (env)');
  });

  it('a share is logged as share', async () => {
    await share({ title: 'Glaze recipes', url: 'https://example.com/glaze' });
    expect(api.listActivity({ limit: 1 })[0].actorLabel).toBe('share');
  });
});

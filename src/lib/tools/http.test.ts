import { beforeEach, describe, expect, it } from 'vitest';
import { GET as listTools } from '../../app/api/v1/tools/route';
import { POST as callTool } from '../../app/api/v1/tools/[name]/route';
import { runSilently } from '../activity';
import { limiters } from '../capture-in';
import { createClient } from '../clients';
import * as api from '../api';
import { store } from '../store';
import { demoSeed as seed } from '../store/seed';
import type { State } from '../store/types';
import { TOOLS } from './index';
import { tool } from './define';
import * as z from 'zod';

beforeEach(() => {
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  );
  for (const l of Object.values(limiters)) l.reset();
});

const call = (name: string, token: string | null, body?: unknown) =>
  callTool(
    new Request(`http://localhost/api/v1/tools/${name}`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ name }) },
  );
const list = (token: string | null) => listTools(new Request('http://localhost/api/v1/tools', { headers: token ? { authorization: `Bearer ${token}` } : {} }));

describe('/api/v1/tools', () => {
  it('no or a wrong token: 401 on both routes', async () => {
    expect((await list(null)).status).toBe(401);
    expect((await call('whoami', 'gtd_wrong')).status).toBe(401);
  });

  it('lists the client’s tools and runs whoami', async () => {
    const { token } = createClient('Claude Desktop', 'assistant');
    const tools = (await (await list(token)).json()) as { tools: { name: string; inputSchema: object }[] };
    expect(tools.tools.map((t) => t.name)).toContain('whoami');
    const res = await call('whoami', token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: { name: 'Claude Desktop', preset: 'assistant' }, activity: [] });
  });

  it('a capture client gets 403 for a write tool and does not see it listed', async () => {
    TOOLS.push(tool({ name: 'zz_write_probe', description: 'probe tool for the permission test', capability: 'write', input: z.strictObject({}), run: () => 'ran' }));
    try {
      const { token } = createClient('n8n scan', 'capture');
      const names = ((await (await list(token)).json()) as { tools: { name: string }[] }).tools.map((t) => t.name);
      expect(names).not.toContain('zz_write_probe');
      const res = await call('zz_write_probe', token);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'client "n8n scan" may not call zz_write_probe' });
    } finally {
      TOOLS.pop();
    }
  });

  it('unknown tool 404; bad JSON 400; unknown keys are refused with the key named', async () => {
    const { token } = createClient('Claude Desktop', 'assistant');
    expect((await call('no_such_tool', token)).status).toBe(404);
    expect((await call('whoami', token, '{not json')).status).toBe(400);
    const res = await call('whoami', token, { follow_up_date: '2026-10-09' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('follow_up_date');
  });

  it('a refusal from the api is a 422 with its reason; a bug in a tool is a 500 with a generic message', async () => {
    TOOLS.push(
      tool({ name: 'zz_refuse', description: 'probe tool that the api refuses', capability: 'read', input: z.strictObject({}), run: () => { throw new Error('complete: item x cannot be completed'); } }),
      tool({ name: 'zz_bug', description: 'probe tool with a bug in it', capability: 'read', input: z.strictObject({}), run: () => (undefined as unknown as { x: () => void }).x() }),
    );
    try {
      const { token } = createClient('Claude Desktop', 'assistant');
      const refused = await call('zz_refuse', token);
      expect(refused.status).toBe(422);
      expect(await refused.json()).toEqual({ error: 'complete: item x cannot be completed' });
      const bug = await call('zz_bug', token);
      expect(bug.status).toBe(500);
      expect(await bug.json()).toEqual({ error: 'internal error' });
    } finally {
      TOOLS.splice(-2);
    }
  });

  it('a write answers with the ids of the log entries it made, under the client’s name', async () => {
    TOOLS.push(tool({ name: 'zz_capture', description: 'probe tool that captures one line', capability: 'capture', input: z.strictObject({ text: z.string() }), run: ({ text }) => api.capture(text)!.id }));
    try {
      const { token } = createClient('Phone agent', 'assistant');
      const res = await call('zz_capture', token, { text: 'Buy clay' });
      const body = (await res.json()) as { activity: string[] };
      expect(body.activity).toHaveLength(1);
      expect(store.getState().activity.find((e) => e.id === body.activity[0])).toMatchObject({ actor: { kind: 'client', name: 'Phone agent' } });
    } finally {
      TOOLS.pop();
    }
  });

  it('120 calls a minute, then 429', async () => {
    const { token } = createClient('Claude Desktop', 'assistant');
    for (let n = 0; n < 120; n++) await call('whoami', token);
    expect((await call('whoami', token)).status).toBe(429);
  });
});

describe('a partial write is never silent (review)', () => {
  it('a tool that wrote before it was refused answers the entries it made', async () => {
    TOOLS.push(tool({ name: 'zz_partial', description: 'probe tool that writes, then is refused', capability: 'write', input: z.strictObject({}), run: () => { api.capture('Written first'); throw new Error('zz_partial: refused after a write'); } }));
    try {
      const { token } = createClient('Phone agent', 'assistant');
      const res = await call('zz_partial', token);
      expect(res.status).toBe(422);
      expect(((await res.json()) as { activity: string[] }).activity).toHaveLength(1);
    } finally {
      TOOLS.pop();
    }
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSilently } from './activity';
import { ENV_CLIENT, authenticate, can, captureEnabled, createClient, listClients, revokeClient } from './clients';
import { store } from './store';
import { demoSeed as seed } from './store/seed';
import type { State } from './store/types';

beforeEach(() =>
  runSilently(() =>
    store.update((s) => {
      for (const key of Object.keys(s) as (keyof State)[]) delete s[key];
      Object.assign(s, structuredClone(seed));
    }),
  ),
);
afterEach(() => {
  delete process.env.CAPTURE_TOKEN;
});

describe('clients', () => {
  it('the token is shown once and never stored', () => {
    const { client, token } = createClient('Claude Desktop', 'assistant');
    expect(token).toMatch(/^gtd_[A-Za-z0-9_-]{32,}$/);
    const stored = JSON.stringify(store.getState().clients);
    expect(stored).not.toContain(token);
    expect(JSON.stringify(listClients())).not.toMatch(/tokenHash|gtd_/);
    expect(authenticate(`Bearer ${token}`)).toEqual(client);
    expect(JSON.stringify(store.getState().activity)).not.toContain(token);
  });

  it('presets: capture may only capture; read-only only read; assistant all three', () => {
    const cap = createClient('n8n scan', 'capture').client;
    const ro = createClient('Report', 'read-only').client;
    const all = createClient('Phone agent', 'assistant').client;
    expect([can(cap, 'capture'), can(cap, 'read'), can(cap, 'write')]).toEqual([true, false, false]);
    expect([can(ro, 'capture'), can(ro, 'read'), can(ro, 'write')]).toEqual([false, true, false]);
    expect([can(all, 'capture'), can(all, 'read'), can(all, 'write')]).toEqual([true, true, true]);
  });

  it('revoke takes effect at once; the client stays listed as revoked', () => {
    const { client, token } = createClient('Phone agent', 'assistant');
    revokeClient(client.id);
    expect(authenticate(`Bearer ${token}`)).toBeNull();
    expect(listClients().find((c) => c.id === client.id)).toMatchObject({ revokedAt: expect.any(String) });
  });

  it('names are required and unique among active clients; presets are checked', () => {
    createClient('Phone agent', 'assistant');
    expect(() => createClient('  ', 'capture')).toThrow(/name/);
    expect(() => createClient('phone AGENT', 'capture')).toThrow(/already/);
    expect(() => createClient('X', 'admin' as never)).toThrow(/preset/);
  });

  it('wrong, missing or malformed headers are nobody', () => {
    createClient('Phone agent', 'assistant');
    expect(authenticate(null)).toBeNull();
    expect(authenticate('Bearer gtd_wrong')).toBeNull();
    expect(authenticate('Basic abc')).toBeNull();
  });

  it('CAPTURE_TOKEN from the environment is the built-in capture client', () => {
    expect(captureEnabled()).toBe(false);
    process.env.CAPTURE_TOKEN = 'env-token-not-a-secret';
    expect(captureEnabled()).toBe(true);
    expect(authenticate('Bearer env-token-not-a-secret')).toEqual(ENV_CLIENT);
    expect(listClients()[0]).toMatchObject({ id: 'env-capture', builtIn: true });
  });

  it('last use is recorded, at most once a minute', () => {
    const { client, token } = createClient('Phone agent', 'assistant');
    authenticate(`Bearer ${token}`);
    const first = listClients().find((c) => c.id === client.id)!.lastUsedAt;
    expect(first).toBeDefined();
    authenticate(`Bearer ${token}`);
    expect(listClients().find((c) => c.id === client.id)!.lastUsedAt).toBe(first);
  });
});

// API clients (MCP design §3.1): a name, a preset, a token shown once and stored as its
// SHA-256. The env CAPTURE_TOKEN keeps working as the built-in client "capture (env)".
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { now } from './api';
import { store } from './store';
import type { Actor } from './store/types';

export type Preset = 'capture' | 'read-only' | 'assistant';
export type Capability = 'capture' | 'read' | 'write';
export const PRESETS: Record<Preset, readonly Capability[]> = {
  capture: ['capture'],
  'read-only': ['read'],
  assistant: ['capture', 'read', 'write'],
};

export interface ClientIdentity {
  id: string;
  name: string;
  preset: Preset;
}
export interface ClientRow extends ClientIdentity {
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
  builtIn?: boolean;
}

export const ENV_CLIENT: ClientIdentity = { id: 'env-capture', name: 'capture (env)', preset: 'capture' };
const LAST_USED_EVERY_MS = 60_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sameText = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

function fail(message: string): never {
  throw new Error(`clients: ${message}`);
}

export function createClient(name: string, preset: Preset): { client: ClientIdentity; token: string } {
  const clean = name.trim();
  if (!clean) fail('a client needs a name');
  if (!(preset in PRESETS)) fail(`unknown preset ${preset}`);
  const twin = store.getState().clients.find((c) => !c.revokedAt && c.name.toLowerCase() === clean.toLowerCase());
  if (twin || clean.toLowerCase() === ENV_CLIENT.name) fail(`a client named "${clean}" exists already`);
  const token = `gtd_${randomBytes(32).toString('base64url')}`;
  const client: ClientIdentity = { id: `c-${crypto.randomUUID()}`, name: clean, preset };
  store.update((s) => {
    s.clients.push({ ...client, tokenHash: sha256(token), createdAt: now().toISOString() });
  });
  return { client, token };
}

export function listClients(): ClientRow[] {
  // The hash never leaves this module.
  const rows: ClientRow[] = store.getState().clients.map(({ id, name, preset, createdAt, lastUsedAt, revokedAt }) => ({
    id,
    name,
    preset,
    createdAt,
    ...(lastUsedAt && { lastUsedAt }),
    ...(revokedAt && { revokedAt }),
  }));
  const builtIn: ClientRow[] = process.env.CAPTURE_TOKEN ? [{ ...ENV_CLIENT, createdAt: '', builtIn: true }] : [];
  return [...builtIn, ...rows.filter((c) => !c.revokedAt), ...rows.filter((c) => c.revokedAt)];
}

export function revokeClient(id: string): void {
  const c = store.getState().clients.find((x) => x.id === id);
  if (!c) fail(`unknown client ${id}`);
  if (c.revokedAt) return;
  store.update((s) => {
    s.clients.find((x) => x.id === id)!.revokedAt = now().toISOString();
  });
}

/** The client a request's `Authorization: Bearer …` belongs to, or null. */
export function authenticate(authorization: string | null): ClientIdentity | null {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const env = process.env.CAPTURE_TOKEN;
  if (env && sameText(token, env)) return ENV_CLIENT;
  const hash = sha256(token);
  const c = store.getState().clients.find((x) => !x.revokedAt && x.tokenHash === hash);
  if (!c) return null;
  const at = now();
  if (!c.lastUsedAt || at.getTime() - Date.parse(c.lastUsedAt) >= LAST_USED_EVERY_MS) {
    store.update((s) => {
      s.clients.find((x) => x.id === c.id)!.lastUsedAt = at.toISOString();
    });
  }
  return { id: c.id, name: c.name, preset: c.preset };
}

export function can(client: ClientIdentity, capability: Capability): boolean {
  return PRESETS[client.preset].includes(capability);
}

export function actorOf(client: ClientIdentity): Actor {
  return { kind: 'client', id: client.id, name: client.name };
}

/** The capture endpoint is on when anyone may use it. */
export function captureEnabled(): boolean {
  return !!process.env.CAPTURE_TOKEN || store.getState().clients.some((c) => !c.revokedAt && can(c, 'capture'));
}

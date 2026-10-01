// The ways into the inbox other than the rapid log (SPEC §3.1): POST /api/capture (a shell alias,
// a Shortcut, an agent) and /share (the Web Share Target). Both end in api.capture and nothing else.
import { createHash, timingSafeEqual } from 'node:crypto';
import * as api from './api';
import type { Item, Reference, Source } from './model';
import { URL_IN_TEXT, referenceHost } from './reference';

/** Bytes of item text a request may carry. */
export const TEXT_MAX = 4096;
/** Bytes a request body may have at all (text, url and note together). */
export const BODY_MAX = 16 * 1024;
const SOURCES: readonly Source[] = ['typed', 'voice', 'email', 'share', 'scan'];

export type CaptureOutcome = { item: Item } | { error: string; status: 400 | 413 };

/** `{ text, source?, url?, note? }` from a request → an inbox item, or why not. */
export function captureRequest(body: unknown): CaptureOutcome {
  if (!body || typeof body !== 'object') return { error: 'expected a JSON object { text, source?, url?, note? }', status: 400 };
  const { text, source = 'typed', url, note } = body as Record<string, unknown>;
  if (typeof text !== 'string' || !text.trim()) return { error: 'text is required', status: 400 };
  if (Buffer.byteLength(text) > TEXT_MAX) return { error: `text is longer than ${TEXT_MAX} bytes`, status: 413 };
  if (typeof source !== 'string' || !SOURCES.includes(source as Source)) return { error: `source is one of ${SOURCES.join(', ')}`, status: 400 };
  if (url !== undefined && (typeof url !== 'string' || !URL_IN_TEXT.test(url))) return { error: 'url needs a scheme (https://, obsidian://, …)', status: 400 };
  if (note !== undefined && typeof note !== 'string') return { error: 'note is a string', status: 400 };
  const item = api.capture(text, source as Source, { reference: contextOf(url, note) });
  return item ? { item } : { error: 'text is required', status: 400 };
}

function contextOf(url?: string, note?: string): Reference | undefined {
  const body = note?.trim();
  if (url) return { kind: 'link', url: url.trim(), ...(body && { body }) };
  return body ? { kind: 'note', body } : undefined;
}

/**
 * A share from another app (title / text / url, any of them may be empty) → the capture request.
 * Android puts a page's URL into `text` more often than into `url`, so a URL in the text counts.
 */
export function fromShare(form: { title?: string | null; text?: string | null; url?: string | null }): { text: string; source: 'share'; url?: string; note?: string } | null {
  const title = form.title?.trim() ?? '';
  let text = form.text?.trim() ?? '';
  let url = form.url?.trim() ?? '';
  if (!url) {
    const found = text.match(URL_IN_TEXT)?.[0];
    if (found) {
      url = found;
      text = text.replace(found, '').trim();
    }
  }
  if (url && !URL_IN_TEXT.test(url)) url = '';
  const line = title || text || (url && referenceHost(url));
  if (!line) return null;
  const note = text && text !== line ? text : '';
  return { text: line.slice(0, TEXT_MAX), source: 'share', ...(url && { url }), ...(note && { note }) };
}

/** Constant-time check of an `Authorization: Bearer …` header against the configured token. */
export function bearerOk(header: string | null, token: string): boolean {
  const given = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return given.length > 0 && timingSafeEqual(digest(given), digest(token));
}

/** At most `limit` requests in any `windowMs`; one limiter for the whole server (one user). */
export function createLimiter(limit: number, windowMs: number, clock: () => number = () => performance.now()) {
  const hits: number[] = [];
  return {
    /** Counts the request; false when it is over the limit. */
    take(): boolean {
      const t = clock();
      while (hits.length && hits[0] <= t - windowMs) hits.shift();
      if (hits.length >= limit) return false;
      hits.push(t);
      return true;
    },
    reset(): void {
      hits.length = 0;
    },
    /** Seconds until the next request is allowed. */
    retryAfter(): number {
      return hits.length ? Math.max(1, Math.ceil((hits[0] + windowMs - clock()) / 1000)) : 0;
    },
  };
}

type Limiter = ReturnType<typeof createLimiter>;
const g = globalThis as typeof globalThis & { __wbLimiters?: { capture: Limiter; share: Limiter; badToken: Limiter } };
/**
 * Separate quotas, so one kind of traffic can't use up another's: authenticated captures
 * (60 a minute), shares (60 a minute), and requests with a missing or wrong token (20 a
 * minute — they never count against the real captures).
 */
export const limiters = (g.__wbLimiters ??= {
  capture: createLimiter(60, 60_000),
  share: createLimiter(60, 60_000),
  badToken: createLimiter(20, 60_000),
});

/** Read a request body as text, refusing more than `max` bytes. */
export async function readBody(req: Request, max = BODY_MAX): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null;
  const text = await req.text();
  return Buffer.byteLength(text) > max ? null : text;
}

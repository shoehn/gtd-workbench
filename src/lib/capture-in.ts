// The ways into the inbox other than the rapid log (SPEC §3.1): POST /api/capture (a shell alias,
// a Shortcut, an agent) and /share (the Web Share Target). Both end in api.capture and nothing else.
import { createHash, timingSafeEqual } from 'node:crypto';
import * as api from './api';
import type { Item, Reference, Source } from './model';
import { URL_IN_TEXT, referenceHost } from './reference';

/** Bytes of item text a request may carry. */
export const TEXT_MAX = 4096;
/** Bytes of note (the context that comes with the item). */
export const NOTE_MAX = 8 * 1024;
/** Bytes a capture request body may have at all (text, url and note together). */
export const BODY_MAX = 16 * 1024;
/** Bytes a share (multipart) may have; a longer shared text is cut to NOTE_MAX. */
export const SHARE_MAX = 64 * 1024;
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
  if (note !== undefined && Buffer.byteLength(note) > NOTE_MAX) return { error: `note is longer than ${NOTE_MAX} bytes`, status: 413 };
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
  const note = text && text !== line ? cut(text, NOTE_MAX) : '';
  return { text: cut(line, TEXT_MAX), source: 'share', ...(url && { url }), ...(note && { note }) };
}

/** At most `max` UTF-8 bytes of `s`, ending in "…" when cut (never in the middle of a character). */
function cut(s: string, max: number): string {
  if (Buffer.byteLength(s) <= max) return s;
  let out = '';
  for (const ch of s) {
    if (Buffer.byteLength(out + ch) > max - 3) break;
    out += ch;
  }
  return `${out}…`;
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

/**
 * A request body, at most `max` bytes, counted while it streams in: a longer one (declared or
 * chunked) is cancelled as soon as it passes the limit and answers null — never read whole.
 */
export async function readLimited(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** A capture request body as text, ≤ `max` bytes (see readLimited). */
export async function readBody(req: Request, max = BODY_MAX): Promise<string | null> {
  const bytes = await readLimited(req, max);
  return bytes && new TextDecoder().decode(bytes);
}

// Reference entries (SPEC §3.11): the pure parts, shared by the api and Clarify's form.
import type { Reference } from './model';

export const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/\S+/i;

/** The kind Clarify suggests: a URL in the text makes it a link to that URL, anything else a note. */
export function guessReference(text: string): Reference {
  const m = text.match(URL_IN_TEXT);
  return m ? { kind: 'link', url: m[0] } : { kind: 'note' };
}

/** `calendar.example.com`, or `obsidian://open` for other schemes; the URL itself if it is not one. */
export function referenceHost(url: string): string {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.host : `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

/** The second line of a reference row: the link's host, the note's start, or the file name. */
export function referenceLine(r: Reference): string {
  if (r.kind === 'link') return r.url ? referenceHost(r.url) : '';
  const body = (r.body ?? '').replace(/\s+/g, ' ').trim();
  return r.kind === 'note' && body.length > 80 ? `${body.slice(0, 79)}…` : body;
}


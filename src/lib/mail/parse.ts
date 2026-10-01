// A mail from the capture mailbox → what the inbox keeps of it (SPEC §3.1). Pure: no IMAP here.
// The subject becomes the item, the start of the plain-text body its context; attachments and
// HTML are never kept (an HTML-only mail is reduced to its text).
import { createHash } from 'node:crypto';
import PostalMime from 'postal-mime';

export const BODY_MAX = 2048;
const SUBJECT_FALLBACK_MAX = 120;

export interface ParsedMail {
  /** The Message-ID header, or `sha256:<hash of the source>` when there is none. */
  messageId: string;
  /** Lowercased sender address, '' when unknown. */
  from: string;
  /** The subject without reply / forward prefixes (or the body's first line, for none). */
  subject: string;
  /** The subject as it came. */
  captured: string;
  /** Start of the plain-text body, ≤ BODY_MAX characters. */
  body: string;
  /** Attachments in the mail; none of them is kept. */
  attachments: number;
}

/** `Fwd:`, `Fw:`, `Re:`, `AW:`, `WG:` (also stacked, `Re[2]:`), however often. */
const PREFIX = /^(?:\s*(?:fwd?|re|aw|wg)(?:\[\d+\])?\s*:\s*)+/i;

export function cleanSubject(subject: string): string {
  return subject.replace(PREFIX, '').replace(/\s+/g, ' ').trim();
}

/** Tidy plain text: unix newlines, no trailing blanks, at most one empty line in a row; cut to `max`. */
export function preview(text: string, max = BODY_MAX): string {
  const tidy = text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return tidy.length > max ? `${tidy.slice(0, max - 1).trimEnd()}…` : tidy;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const codePoint = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');

/** Text of an HTML-only mail: scripts, styles and tags dropped, blocks on their own lines. Never rendered. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|tr|h[1-6]|blockquote|table|ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_, dec: string) => codePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n');
}

export async function parseMail(raw: Buffer | string): Promise<ParsedMail> {
  const mail = await PostalMime.parse(raw);
  const text = mail.text?.trim() ? mail.text : htmlToText(mail.html ?? '');
  const captured = (mail.subject ?? '').trim();
  const firstLine = text.split('\n').find((l) => l.trim())?.trim() ?? '';
  return {
    messageId: mail.messageId?.trim() || `sha256:${createHash('sha256').update(raw).digest('hex')}`,
    from: mail.from?.address?.toLowerCase() ?? '',
    subject: cleanSubject(captured) || firstLine.slice(0, SUBJECT_FALLBACK_MAX) || '(no subject)',
    captured: captured || '(no subject)',
    body: preview(text),
    attachments: mail.attachments.filter((a) => !a.related).length,
  };
}

/** The body the inbox item keeps: the preview, and a line saying what was left behind. */
export function keptBody(m: ParsedMail): string {
  const left = m.attachments ? `[${m.attachments} attachment${m.attachments === 1 ? '' : 's'} not kept — in the mailbox's Processed folder]` : '';
  return [m.body, left].filter(Boolean).join('\n\n');
}

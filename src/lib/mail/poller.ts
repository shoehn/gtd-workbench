// Mail-in (SPEC §3.1): every 2 minutes, read the capture mailbox over IMAP, capture each new mail
// from an allowed sender, then move it to the Processed folder — never delete. A mail from anyone
// else stays where it is and is counted once. Single process, so a timer is enough.
import { ImapFlow } from 'imapflow';
import { runAs } from '../activity';
import * as api from '../api';
import { log } from '../log';
import { keptBody, parseMail } from './parse';

const EVERY_MS = 2 * 60_000;
/** Enough for the text of any mail; attachments past it are cut off, and never kept anyway. */
const SOURCE_MAX = 2 * 1024 * 1024;

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  folder: string;
  processed: string;
  /** Lowercased sender addresses that may capture. */
  from: string[];
}

/** The mailbox from CAPTURE_MAIL_*, or why it is not polled (absent = not configured, no message). */
export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): { config?: MailConfig; problem?: string } {
  if (!env.CAPTURE_MAIL_HOST) return {};
  const from = (env.CAPTURE_MAIL_FROM ?? '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (!from.length) return { problem: 'CAPTURE_MAIL_FROM is empty — no sender may capture, so the mailbox is not polled' };
  if (!env.CAPTURE_MAIL_USER || !env.CAPTURE_MAIL_PASS) return { problem: 'CAPTURE_MAIL_USER and CAPTURE_MAIL_PASS are needed' };
  const secure = env.CAPTURE_MAIL_TLS !== 'false';
  return {
    config: {
      host: env.CAPTURE_MAIL_HOST,
      port: Number(env.CAPTURE_MAIL_PORT) || (secure ? 993 : 143),
      secure,
      user: env.CAPTURE_MAIL_USER,
      pass: env.CAPTURE_MAIL_PASS,
      folder: env.CAPTURE_MAIL_FOLDER || 'INBOX',
      processed: env.CAPTURE_MAIL_PROCESSED || 'Processed',
      from,
    },
  };
}

export interface PollResult {
  captured: number;
  duplicates: number;
  ignored: number;
}

/** One pass over the mailbox. Throws on connection or IMAP errors; the caller records them. */
export async function pollOnce(c: MailConfig): Promise<PollResult> {
  const result: PollResult = { captured: 0, duplicates: 0, ignored: 0 };
  const client = new ImapFlow({ host: c.host, port: c.port, secure: c.secure, auth: { user: c.user, pass: c.pass }, logger: false });
  client.on('error', (e: Error) => log.debug(`mail: connection error — ${e.message}`));
  await client.connect();
  try {
    if (!(await client.list()).some((m) => m.path === c.processed)) await client.mailboxCreate(c.processed);
    const lock = await client.getMailboxLock(c.folder);
    try {
      const mailbox = client.mailbox;
      if (!mailbox || !mailbox.exists) return result;
      const done: number[] = [];
      for (const m of await client.fetchAll('1:*', { uid: true, envelope: true })) {
        const id = m.envelope?.messageId?.trim() || `uid:${mailbox.uidValidity}:${m.uid}`;
        const before = api.mailSeen(id);
        if (before === 'ignored') continue;
        if (before) {
          done.push(m.uid); // handled before, but the move did not happen: move it now
          continue;
        }
        const sender = m.envelope?.from?.[0]?.address?.toLowerCase() ?? '';
        if (!c.from.includes(sender)) {
          api.ignoreMail(id);
          result.ignored++;
          continue;
        }
        const full = await client.fetchOne(String(m.uid), { source: { maxLength: SOURCE_MAX } }, { uid: true });
        if (!full || !full.source) continue;
        const parsed = await parseMail(full.source);
        const { outcome } = api.captureMail({ messageId: id, subject: parsed.subject, captured: parsed.captured, body: keptBody(parsed) });
        if (outcome === 'captured') result.captured++;
        if (outcome === 'duplicate') result.duplicates++;
        done.push(m.uid);
      }
      if (done.length) await client.messageMove(done, c.processed, { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
  return result;
}

const g = globalThis as typeof globalThis & { __wbMailPoll?: ReturnType<typeof setInterval>; __wbMailRunning?: boolean };

/** Poll now, unless a poll is running; records the outcome for Settings and /api/health. */
export async function pollMailbox(): Promise<{ ok: boolean; error?: string; result?: PollResult }> {
  const { config, problem } = mailConfigFromEnv();
  if (!config) return { ok: false, error: problem ?? 'no capture mailbox configured' };
  if (g.__wbMailRunning) return { ok: true };
  g.__wbMailRunning = true;
  try {
    const result = await runAs({ kind: 'mail' }, () => pollOnce(config));
    runAs({ kind: 'mail' }, () => api.recordMailPoll());
    if (result.captured || result.duplicates || result.ignored) {
      log.info(`mail: ${result.captured} captured, ${result.duplicates} duplicates, ${result.ignored} ignored`);
    }
    return { ok: true, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    runAs({ kind: 'mail' }, () => api.recordMailPoll(error));
    log.warn(`mail: poll failed — ${error}`);
    return { ok: false, error };
  } finally {
    g.__wbMailRunning = false;
  }
}

export function startMailPoll(): void {
  if (g.__wbMailPoll) return;
  const { config, problem } = mailConfigFromEnv();
  if (problem) log.warn(`mail: ${problem}`);
  if (!config) return;
  log.info(`mail: polling ${config.folder} on ${config.host} every 2 min, ${config.from.length} allowed sender${config.from.length === 1 ? '' : 's'}`);
  void pollMailbox();
  g.__wbMailPoll = setInterval(() => void pollMailbox(), EVERY_MS);
  g.__wbMailPoll.unref?.();
}

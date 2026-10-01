import { connection } from 'next/server';
import * as api from '@/lib/api';
import { log } from '@/lib/log';
import { mailConfigFromEnv } from '@/lib/mail/poller';
import pkg from '../../../../package.json';

/** Liveness for the container healthcheck: 200 when the store answers, 500 when it cannot be opened. */
export async function GET() {
  await connection(); // always live, never prerendered or cached
  try {
    const { config, problem } = mailConfigFromEnv();
    const { lastPollAt, lastError } = api.mailboxInfo();
    // The mailbox is reported, never judged: a failed poll does not make the app unhealthy.
    const mail = config ? { lastPollAt: lastPollAt ?? null, lastError: lastError ?? null } : problem ? { lastError: problem } : null;
    return Response.json({ ok: true, ...api.storeInfo(), mail, version: pkg.version });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error(`health: store unavailable — ${error}`);
    return Response.json({ ok: false, error, version: pkg.version }, { status: 500 });
  }
}

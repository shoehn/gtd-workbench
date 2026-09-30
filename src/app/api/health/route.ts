import { connection } from 'next/server';
import * as api from '@/lib/api';
import { log } from '@/lib/log';
import pkg from '../../../../package.json';

/** Liveness for the container healthcheck: 200 when the store answers, 500 when it cannot be opened. */
export async function GET() {
  await connection(); // always live, never prerendered or cached
  try {
    return Response.json({ ok: true, ...api.storeInfo(), version: pkg.version });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error(`health: store unavailable — ${error}`);
    return Response.json({ ok: false, error, version: pkg.version }, { status: 500 });
  }
}

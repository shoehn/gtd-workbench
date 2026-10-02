import { runAs } from '@/lib/activity';
import { captureRequest, limiters, readBody } from '@/lib/capture-in';
import { actorOf, authenticate, can, captureEnabled } from '@/lib/clients';

/**
 * POST /api/capture — one line into the inbox from anywhere: a shell alias, a Shortcut, an
 * agent. `Authorization: Bearer <client token>` (Settings → Clients, or `CAPTURE_TOKEN`); body
 * `{ text, source?, url?, note? }` (JSON, whatever the content type). 201 with the item;
 * off (404) while no client may capture. The capture is logged under the client's name.
 */
export async function POST(req: Request) {
  if (!captureEnabled()) return Response.json({ error: 'the capture endpoint is off: create a client in Settings or set CAPTURE_TOKEN' }, { status: 404 });
  const tooMany = (limiter: typeof limiters.capture, error: string) =>
    Response.json({ error }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfter()) } });
  const client = authenticate(req.headers.get('authorization'));
  // Wrong tokens are throttled on their own quota: they can't use up the real captures'.
  if (!client) {
    if (!limiters.badToken.take()) return tooMany(limiters.badToken, 'too many requests without a valid token');
    return Response.json({ error: 'missing, wrong or revoked bearer token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  if (!can(client, 'capture')) return Response.json({ error: `client "${client.name}" may not capture` }, { status: 403 });
  if (!limiters.capture.take()) return tooMany(limiters.capture, 'too many requests: 60 a minute');
  const raw = await readBody(req);
  if (raw === null) return Response.json({ error: 'body is too large' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'body is not JSON' }, { status: 400 });
  }
  const result = runAs(actorOf(client), () => captureRequest(body));
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.item, { status: 201 });
}

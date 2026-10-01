import { bearerOk, captureLimiter, captureRequest, readBody } from '@/lib/capture-in';

/**
 * POST /api/capture — one line into the inbox from anywhere: a shell alias, a Shortcut, an
 * agent. `Authorization: Bearer $CAPTURE_TOKEN`; body `{ text, source?, url?, note? }`
 * (JSON, whatever the content type). 201 with the item; off (404) while CAPTURE_TOKEN is unset.
 */
export async function POST(req: Request) {
  const token = process.env.CAPTURE_TOKEN;
  if (!token) return Response.json({ error: 'the capture endpoint is off: set CAPTURE_TOKEN' }, { status: 404 });
  if (!captureLimiter.take()) {
    return Response.json({ error: 'too many requests: 60 a minute' }, { status: 429, headers: { 'Retry-After': String(captureLimiter.retryAfter()) } });
  }
  if (!bearerOk(req.headers.get('authorization'), token)) {
    return Response.json({ error: 'missing or wrong bearer token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  const raw = await readBody(req);
  if (raw === null) return Response.json({ error: 'body is too large' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'body is not JSON' }, { status: 400 });
  }
  const result = captureRequest(body);
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.item, { status: 201 });
}

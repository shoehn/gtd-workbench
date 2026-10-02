import { limiters, readLimited } from '@/lib/capture-in';
import { authenticate } from '@/lib/clients';
import { runTool } from '@/lib/tools';

const BODY_MAX = 64 * 1024;

/**
 * POST /api/v1/tools/<name> — run one tool as the client the bearer token belongs to.
 * Body: the tool's arguments as JSON ({} or empty for none). 200 { result, activity } — the ids
 * of the log entries the call made; 400 bad arguments, 401, 403 preset, 404, 413, 422 refused
 * by the app (its reason), 429, 500.
 */
export async function POST(req: Request, ctx: RouteContext<'/api/v1/tools/[name]'>) {
  const { name } = await ctx.params;
  const client = authenticate(req.headers.get('authorization'));
  if (!client) {
    if (!limiters.badToken.take()) return Response.json({ error: 'too many requests without a valid token' }, { status: 429 });
    return Response.json({ error: 'missing, wrong or revoked bearer token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  if (!limiters.api.take()) {
    return Response.json({ error: 'too many requests: 120 a minute' }, { status: 429, headers: { 'Retry-After': String(limiters.api.retryAfter()) } });
  }
  const bytes = await readLimited(req, BODY_MAX);
  if (!bytes) return Response.json({ error: 'body is larger than 64 KB' }, { status: 413 });
  const text = new TextDecoder().decode(bytes).trim();
  let args: unknown = {};
  if (text) {
    try {
      args = JSON.parse(text);
    } catch {
      return Response.json({ error: 'body is not JSON' }, { status: 400 });
    }
  }
  const { status, body } = runTool(client, decodeURIComponent(name), args);
  return Response.json(body, { status });
}

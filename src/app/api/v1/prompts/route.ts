import { limiters } from '@/lib/capture-in';
import { authenticate } from '@/lib/clients';
import { PROMPTS } from '@/lib/tools/prompts';

/** GET /api/v1/prompts — the guided workflows, for the MCP binary to offer as prompts. */
export async function GET(req: Request) {
  const client = authenticate(req.headers.get('authorization'));
  if (!client) {
    if (!limiters.badToken.take()) return Response.json({ error: 'too many requests without a valid token' }, { status: 429 });
    return Response.json({ error: 'missing, wrong or revoked bearer token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  return Response.json({ prompts: PROMPTS });
}

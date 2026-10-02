import { limiters } from '@/lib/capture-in';
import { authenticate } from '@/lib/clients';
import { listToolsFor } from '@/lib/tools';

/** GET /api/v1/tools — the tools this client may call, with the JSON Schema of their input. */
export async function GET(req: Request) {
  const client = authenticate(req.headers.get('authorization'));
  if (!client) {
    if (!limiters.badToken.take()) return Response.json({ error: 'too many requests without a valid token' }, { status: 429 });
    return Response.json({ error: 'missing, wrong or revoked bearer token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  return Response.json({ client: { name: client.name, preset: client.preset }, tools: listToolsFor(client) });
}

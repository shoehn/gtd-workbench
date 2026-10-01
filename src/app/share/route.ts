import { SHARE_MAX, captureRequest, fromShare, limiters, readLimited } from '@/lib/capture-in';

/**
 * The Web Share Target (manifest: POST multipart, title / text / url). Same-origin by design,
 * so no token: a share is a browser navigation the user started (Sec-Fetch-Site `none` or
 * same-origin); a form posted from another site is refused. Answers with the confirmation page.
 */
export async function POST(req: Request) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'none' && site !== 'same-origin') return new Response('cross-site share refused', { status: 403 });
  // A relative Location: behind a reverse proxy req.url names the internal host.
  const back = (query: string) => new Response(null, { status: 303, headers: { Location: `/share/done?${query}` } });
  if (!limiters.share.take()) return back('error=busy');
  // Read at most SHARE_MAX bytes while streaming, then parse that: no unbounded body in memory.
  const bytes = await readLimited(req, SHARE_MAX);
  if (!bytes) return back('error=large');
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData();
  } catch {
    return back('error=empty');
  }
  const field = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : null;
  };
  const request = fromShare({ title: field('title'), text: field('text'), url: field('url') });
  if (!request) return back('error=empty');
  const result = captureRequest(request);
  return 'error' in result ? back('error=empty') : back(`item=${encodeURIComponent(result.item.id)}`);
}

import { captureLimiter, captureRequest, fromShare } from '@/lib/capture-in';

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
  if (!captureLimiter.take()) return back('error=busy');
  let form: FormData;
  try {
    form = await req.formData();
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

/** Project titles are the same when they match ignoring case and runs of whitespace. */
export function sameTitle(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) === norm(b);
}

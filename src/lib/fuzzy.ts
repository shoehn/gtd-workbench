// A small scorer for the command palette: every query word must occur; a word at the very start
// counts most, at the start of a word next, anywhere inside least. No dependency.

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 0 = no match; higher = better. */
export function score(query: string, text: string): number {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const t = text.toLowerCase();
  let total = 0;
  for (const w of words) {
    if (t.startsWith(w)) total += 3;
    else if (new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}`, 'u').test(t)) total += 2;
    else if (t.includes(w)) total += 1;
    else return 0;
  }
  return total;
}

/** The matching entries, best first; equal scores keep their order. */
export function rank<T>(query: string, entries: T[], text: (entry: T) => string): T[] {
  return entries
    .map((entry, n) => ({ entry, n, s: score(query, text(entry)) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.n - b.n)
    .map((r) => r.entry);
}

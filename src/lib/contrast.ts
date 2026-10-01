// WCAG contrast between two colours (#rgb / #rrggbb), and the token pairs the components use.
// Doubles as a lint for token edits: src/lib/contrast.test.ts checks every pair in both themes.

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((x) => x + x).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 1 … 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text on a background needs 4.5:1; component edges and the now line need 3:1 (WCAG 1.4.3 / 1.4.11). */
export const PAIRS: { fg: string; bg: string; min: number; where: string }[] = [
  { fg: 'ink', bg: 'panel', min: 4.5, where: 'body text on cards' },
  { fg: 'ink', bg: 'ground', min: 4.5, where: 'text on the page' },
  { fg: 'ink', bg: 'rail', min: 4.5, where: 'sidebar, tab bar' },
  { fg: 'ink', bg: 'muted-bg', min: 4.5, where: 'B chip, appointment block' },
  { fg: 'ink', bg: 'accent-tint', min: 4.5, where: 'cursor row, selected project' },
  { fg: 'ink', bg: 'warn-tint', min: 4.5, where: 'overdue waiting-for row' },
  { fg: 'muted', bg: 'panel', min: 4.5, where: 'meta, labels, keys' },
  { fg: 'muted', bg: 'ground', min: 4.5, where: 'meta on the page' },
  { fg: 'muted', bg: 'rail', min: 4.5, where: 'sidebar counts' },
  { fg: 'muted', bg: 'muted-bg', min: 4.5, where: 'appointment time' },
  { fg: 'muted', bg: 'accent-tint', min: 4.5, where: 'meta on the cursor row' },
  { fg: 'accent', bg: 'panel', min: 4.5, where: 'links, time-block time' },
  { fg: 'accent', bg: 'accent-tint', min: 4.5, where: "today's column, current step" },
  { fg: 'warn', bg: 'panel', min: 4.5, where: 'overdue, stalled, deadlines' },
  { fg: 'warn', bg: 'rail', min: 4.5, where: 'inbox age in the sidebar' },
  { fg: 'warn', bg: 'warn-tint', min: 4.5, where: 'overdue text on its row' },
  { fg: 'ok', bg: 'panel', min: 4.5, where: 'done counters' },
  { fg: 'panel', bg: 'accent', min: 4.5, where: 'primary button text' },
  { fg: 'panel', bg: 'warn', min: 4.5, where: 'A priority chip' },
  { fg: 'panel', bg: 'ink', min: 4.5, where: 'phase number, toast' },
  { fg: 'accent', bg: 'ground', min: 3, where: 'focus border' },
  { fg: 'warn', bg: 'accent-tint', min: 3, where: "now line in today's column" },
  { fg: 'ink', bg: 'panel', min: 3, where: 'day-action outline' },
];

/** Token values from a CSS block: `--wb-ink: #rrggbb;` → { ink: '#rrggbb' } (hex only). */
export function tokensOf(css: string): Record<string, string> {
  return Object.fromEntries([...css.matchAll(/--wb-([\w-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)].map((m) => [m[1], m[2]]));
}

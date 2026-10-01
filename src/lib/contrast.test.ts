import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, PAIRS, tokensOf } from './contrast';

// Token pairs, not rendered primitives: every component colour is a token (no raw colours
// outside tokens.css), so checking the pairs the components use checks every screen.
const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const block = (start: string) => {
  const from = css.indexOf(start);
  return css.slice(from, css.indexOf('}', from));
};
const light = tokensOf(block(':root {'));
const dark = { ...light, ...tokensOf(block(':root[data-theme="dark"]')) };
const system = { ...light, ...tokensOf(block(':root:not([data-theme])')) };

describe('token contrast', () => {
  it.each(PAIRS)('dark: $fg on $bg ≥ $min ($where)', ({ fg, bg, min }) => {
    expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(min);
  });

  it.each(PAIRS)('light: $fg on $bg ≥ $min ($where)', ({ fg, bg, min }) => {
    expect(contrast(light[fg], light[bg])).toBeGreaterThanOrEqual(min);
  });

  it('"system" in a dark OS is the same dark as data-theme="dark"', () => {
    expect(system).toEqual(dark);
  });

  it('color-scheme: light dark on the root ("system"), light or dark when forced', () => {
    const scheme = (b: string) => block(b).match(/color-scheme:\s*([^;]+);/)?.[1];
    expect(scheme(':root {')).toBe('light dark');
    expect(scheme(':root[data-theme="light"]')).toBe('light');
    expect(scheme(':root[data-theme="dark"]')).toBe('dark');
    expect(scheme(':root:not([data-theme])')).toBeUndefined(); // "system" keeps light dark
  });

  it('every dark colour token has a dark value', () => {
    const colours = Object.keys(light).filter((k) => !k.startsWith('hit'));
    expect(colours.filter((k) => !(k in tokensOf(block(':root[data-theme="dark"]'))))).toEqual([]);
  });

  it('rails read as rails: darker than the ground in dark, as in light', () => {
    expect(contrast(dark.rail, '#000')).toBeLessThan(contrast(dark.ground, '#000'));
    expect(contrast(light.rail, '#000')).toBeLessThan(contrast(light.ground, '#000'));
  });

  it('the design copy of the tokens is the same file', () => {
    expect(readFileSync(new URL('../../docs/handoff/design/tokens.css', import.meta.url), 'utf8')).toBe(css);
  });
});

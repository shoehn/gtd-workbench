import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';

// One version per release (docs/OPERATIONS.md "Releases"): `pnpm release` keeps these equal.
describe('release version', () => {
  it('both images in compose.yaml carry the package version', () => {
    const compose = readFileSync(new URL('../../compose.yaml', import.meta.url), 'utf8');
    const tags = [...compose.matchAll(/^\s*image: gtd-workbench:(\S+)$/gm)].map((m) => m[1]);
    expect(tags).toEqual([pkg.version, pkg.version]);
  });
});

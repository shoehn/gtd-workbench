// pnpm release <x.y.z> — one version in three places: package.json (shown by /api/health) and
// both image tags in compose.yaml. Commits the change and tags it v<x.y.z>. Never pushes.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) fail('usage: pnpm release <x.y.z>');
if (git('status', '--porcelain')) fail('the working tree is not clean — commit or stash first');
if (git('tag', '--list', `v${version}`)) fail(`v${version} exists already — a release tag is never moved; pick the next version`);

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.version = version;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const compose = readFileSync('compose.yaml', 'utf8');
const tagged = compose.replace(/^(\s*image: gtd-workbench:).*$/gm, `$1${version}`);
if (!/image: gtd-workbench:/.test(compose)) fail('no `image: gtd-workbench:` line in compose.yaml');
writeFileSync('compose.yaml', tagged);

if (git('status', '--porcelain')) {
  git('add', 'package.json', 'compose.yaml');
  git('commit', '-q', '-m', `release ${version}`);
}
git('tag', '-a', `v${version}`, '-m', `release ${version}`);
console.log(`release: v${version} tagged at ${git('rev-parse', '--short', 'HEAD')}. Push with: git push && git push origin v${version}`);

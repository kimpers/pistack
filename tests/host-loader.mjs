import { registerHooks } from 'node:module';
import { existsSync, realpathSync, readFileSync } from 'node:fs';
import { dirname, join, delimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let host = process.env.PISTACK_TEST_PI_ROOT;
if (!host) {
  const bin = (process.env.PATH ?? '').split(delimiter).map(dir => join(dir, 'pi')).find(existsSync);
  if (!bin) throw new Error('Existing npm-installed Pi required; tests never install dependencies');
  host = dirname(realpathSync(bin));
  while (!existsSync(join(host, 'package.json'))) {
    const parent = dirname(host);
    if (parent === host) throw new Error('Cannot locate Pi package; set PISTACK_TEST_PI_ROOT');
    host = parent;
  }
}
const pkg = JSON.parse(readFileSync(join(host, 'package.json'), 'utf8'));
if (pkg.name !== '@earendil-works/pi-coding-agent') throw new Error('PISTACK_TEST_PI_ROOT must be the installed Pi package');
process.env.PISTACK_TEST_PI_ROOT = host;
const peers = Object.fromEntries(['@earendil-works/pi-ai', '@earendil-works/pi-agent-core', '@earendil-works/pi-tui', 'typebox'].map(name => {
  const root = join(host, 'node_modules', name);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const entry = manifest.exports?.['.'];
  return [name, pathToFileURL(join(root, typeof entry === 'string' ? entry : entry?.import ?? entry?.default ?? manifest.main)).href];
}));
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@earendil-works/pi-coding-agent') return nextResolve(join(host, 'dist/index.js'), context);
  if (peers[specifier]) return nextResolve(fileURLToPath(peers[specifier]), context);
  if (specifier.endsWith('.ts') && context.parentURL?.includes('/node_modules/')) {
    const url = new URL(specifier, context.parentURL);
    const js = fileURLToPath(url).replace(/\.ts$/, '.js');
    if (!existsSync(fileURLToPath(url)) && existsSync(js)) return nextResolve(pathToFileURL(js).href, context);
  }
  return nextResolve(specifier, context);
} });

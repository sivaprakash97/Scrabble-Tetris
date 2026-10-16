// Inlines style.css and every script into one HTML file for hosting as a single page.
// Usage: node scripts/build-artifact.mjs [out.html]   (default: dist/scrabble-tetris.html)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'dist', 'scrabble-tetris.html'));
const html = await readFile(join(root, 'index.html'), 'utf8');

function section(name) {
  const m = html.match(new RegExp(`<!-- build:${name} -->([\\s\\S]*?)<!-- /build:${name} -->`));
  if (!m) throw new Error(`missing build:${name} markers in index.html`);
  return m[1];
}

async function inline(fragment) {
  let s = fragment;
  for (const [tag, href] of [...s.matchAll(/<link rel="stylesheet" href="([^":]+)">/g)]) {
    s = s.replace(tag, `<style>\n${await readFile(join(root, href), 'utf8')}</style>`);
  }
  for (const [tag, src] of [...s.matchAll(/<script src="([^":]+)"><\/script>/g)]) {
    const code = await readFile(join(root, src), 'utf8');
    if (code.includes('</script')) throw new Error(`${src} contains a closing script tag`);
    s = s.replace(tag, () => `<script>\n${code}</script>`);
  }
  return s;
}

const page = (await inline(section('artifact-head'))).trim() + '\n' + (await inline(section('artifact-body'))).trim() + '\n';
await mkdir(dirname(out), { recursive: true });
await writeFile(out, page);
console.log(`Wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);

// Builds the website (Vercel) into dist/web: the page plus only the files it loads.
// Scripts, tests and docs stay out. Each file keeps its own URL so browsers can cache the big
// word list and definitions between visits.
//
// Usage: npm run build:web   (Vercel runs this; see vercel.json)
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'web');

// Everything index.html references locally: its stylesheet and scripts, plus the favicon.
const html = await readFile(join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^":#?]+\.(?:js|css|svg))"/g)].map((m) => m[1]);
const files = ['index.html', ...new Set(refs)];

await rm(out, { recursive: true, force: true });
for (const f of files) {
  await mkdir(dirname(join(out, f)), { recursive: true });
  await cp(join(root, f), join(out, f));
}
console.log(`Wrote ${out}: ${files.join(', ')}`);

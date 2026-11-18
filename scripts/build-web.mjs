// Builds the website (Vercel) into dist/web: the page plus only the files it loads.
// Scripts, tests and docs stay out. Each file keeps its own URL so browsers can cache the big
// word list and definitions between visits.
//
// Usage: npm run build:web   (Vercel runs this; see vercel.json)
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
// Stamp the build with what Vercel says it is, so only the live site uses the live scoreboard
// (see src/deploy.js). Off Vercel, it stays 'development', a sandbox. On Vercel without
// VERCEL_ENV, 'unknown', which counts as live.
const env = process.env.VERCEL_ENV || (process.env.VERCEL ? 'unknown' : 'development');
const deploy = {
  env,
  branch: process.env.VERCEL_GIT_COMMIT_REF || '',
  commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7),
};
await writeFile(
  join(out, 'src', 'deploy.js'),
  `// Written by scripts/build-web.mjs.\n(function (root) {\n  const ST = (root.ST = root.ST || {});\n  ST.DEPLOY = ${JSON.stringify(deploy)};\n})(window);\n`,
);
console.log(`Wrote ${out}: ${files.join(', ')}`);
console.log(`Build: ${JSON.stringify(deploy)}`);

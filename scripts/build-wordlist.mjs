// Builds data/words.js (everyday words) and data/definitions.js (a short definition per word).
//
// Usage: node scripts/build-wordlist.mjs <enable1.txt> <scowl.tar.gz> <wndb-with-exceptions.tgz> [--report]
//
// Word list = ENABLE1 (public domain) ∩ SCOWL size <= 35 ("small"), US + UK spellings,
// minus the words in scripts/blocklist.txt, plus the words in scripts/allowlist.txt.
// Definitions = scripts/supplement-defs.json first, then WordNet 3.0.
// Licences for all three sources are in data/LICENSES.md.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCES = [
  'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt',
  'https://downloads.sourceforge.net/wordlist/scowl-2020.12.07.tar.gz',
  'https://registry.npmjs.org/wndb-with-exceptions/-/wndb-with-exceptions-3.0.2.tgz',
];
// Up to 35 is SCOWL's "small" everyday dictionary. Levels 40 and 50 brought in words like
// EMS, SIS, SIM, POI and LEI that read as abbreviations or names (playtest 4).
const SCOWL_LEVELS = [10, 20, 35];
const SCOWL_SPELLINGS = ['english', 'american', 'british'];
const MIN_LEN = 3;
const MAX_LEN = 12;
const GLOSS_MAX = 100;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const report = process.argv.includes('--report');
if (args.length < 3) {
  console.error('Usage: node scripts/build-wordlist.mjs <enable1.txt> <scowl.tar.gz> <wndb-with-exceptions.tgz> [--report]\n');
  console.error('Download the sources first:');
  for (const url of SOURCES) console.error(`  curl -sSLO ${url}`);
  process.exit(1);
}
const [enablePath, scowlPath, wordnetPath] = args;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const untar = (archive, members, input) =>
  execFileSync('tar', ['-xzO', '-f', input ? '-' : archive, ...members], { input, maxBuffer: 1 << 28 });

// ---- word list ------------------------------------------------------------

const keep = (w) => new RegExp(`^[a-z]{${MIN_LEN},${MAX_LEN}}$`).test(w);
const enable = new Set((await readFile(enablePath, 'utf8')).split(/\r?\n/).map((w) => w.trim()).filter(keep));

// Hand-picked words to leave out, and to add; see the comments in each file for why.
// Words are separated by spaces or new lines; lines starting with # are comments.
const readList = async (name) =>
  new Set(
    (await readFile(join(root, 'scripts', name), 'utf8'))
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith('#'))
      .flatMap((l) => l.split(/\s+/))
  );
const blocked = await readList('blocklist.txt');
const allowed = await readList('allowlist.txt');

const level = new Map(); // word -> lowest SCOWL level it appears in (0 = allowlisted)
for (const lv of SCOWL_LEVELS) {
  const members = SCOWL_SPELLINGS.map((s) => `scowl-2020.12.07/final/${s}-words.${lv}`);
  for (const w of untar(scowlPath, members).toString('latin1').split('\n')) {
    const word = w.trim();
    if (keep(word) && enable.has(word) && !blocked.has(word) && !level.has(word)) level.set(word, lv);
  }
}
const notInEnable = [];
for (const word of allowed) {
  if (!keep(word) || blocked.has(word)) continue;
  if (!enable.has(word)) notInEnable.push(word);
  level.set(word, level.get(word) ?? 0);
}
const words = [...level.keys()].sort();

// ---- WordNet ----------------------------------------------------------------

const POS = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };
const POS_PRIORITY = ['n', 'v', 'a', 'r'];
const SS_TYPE = { 1: 'n', 2: 'v', 3: 'a', 4: 'r', 5: 'a' };

const wndb = untar(wordnetPath, ['package/WNdb-3.0.tar.gz']);
const wn = (file) => untar(null, [`dict/${file}`], wndb).toString('latin1');
const data = Object.fromEntries(Object.keys(POS).map((p) => [p, wn(`data.${POS[p]}`)]));

// lemma -> [{ pos, offset, sense, tags }] from index.sense, which carries usage counts.
const senses = new Map();
for (const line of wn('index.sense').split('\n')) {
  if (!line) continue;
  const [key, offset, sense, tags] = line.split(' ');
  const [lemma, rest] = key.split('%');
  if (!/^[a-z]+$/.test(lemma)) continue;
  const pos = SS_TYPE[rest[0]];
  if (!senses.has(lemma)) senses.set(lemma, []);
  senses.get(lemma).push({ pos, offset: +offset, sense: +sense, tags: +tags });
}

const exceptions = {}; // pos -> Map(inflected -> [bases])
for (const p of Object.keys(POS)) {
  exceptions[p] = new Map();
  for (const line of untar(wordnetPath, [`package/data/${POS[p]}.exc`]).toString('latin1').split('\n')) {
    const [form, ...bases] = line.trim().split(' ');
    if (form && bases.length) exceptions[p].set(form, bases);
  }
}

// WordNet's own "morphy" suffix rules, plus -ied and -ier/-iest.
const RULES = {
  n: [['s', ''], ['ses', 's'], ['xes', 'x'], ['zes', 'z'], ['ches', 'ch'], ['shes', 'sh'], ['men', 'man'], ['ies', 'y']],
  v: [['s', ''], ['ies', 'y'], ['es', 'e'], ['es', ''], ['ed', 'e'], ['ed', ''], ['ing', 'e'], ['ing', ''], ['ied', 'y']],
  a: [['er', ''], ['est', ''], ['er', 'e'], ['est', 'e'], ['ier', 'y'], ['iest', 'y']],
  r: [],
};
// Last resort: adverbs and -ness nouns explained by their adjective (adeptly -> adept).
const DERIVED = [['ily', 'y'], ['ally', ''], ['ally', 'al'], ['bly', 'ble'], ['ly', ''], ['ly', 'le'], ['iness', 'y'], ['ness', '']];

function cleanGloss(pos, offset) {
  const buf = data[pos];
  const line = buf.slice(offset, buf.indexOf('\n', offset));
  let g = line.slice(line.indexOf('| ') + 2).split('; "')[0].replace(/;\s*$/, '').trim();
  if (g.length > GLOSS_MAX) g = g.slice(0, g.lastIndexOf(' ', GLOSS_MAX)).replace(/[,;:]$/, '') + '…';
  return g;
}

// Most-used sense; ties go to noun, verb, adjective, adverb, then WordNet's own order.
// A noun also wins when another sense is only slightly more used (HOG is "domestic swine").
const NOUN_MARGIN = 3;
function bestSense(lemma, onlyPos) {
  const list = (senses.get(lemma) || []).filter((s) => !onlyPos || s.pos === onlyPos);
  if (!list.length) return null;
  list.sort((a, b) => b.tags - a.tags || POS_PRIORITY.indexOf(a.pos) - POS_PRIORITY.indexOf(b.pos) || a.sense - b.sense);
  const noun = list.find((s) => s.pos === 'n');
  return noun && list[0].tags - noun.tags < NOUN_MARGIN ? noun : list[0];
}

const supplement = JSON.parse(await readFile(join(root, 'scripts', 'supplement-defs.json'), 'utf8'));

const strip = (word, [suffix, repl]) =>
  word.length > suffix.length + 1 && word.endsWith(suffix) ? word.slice(0, -suffix.length) + repl : null;

// Possible base forms of an inflected word, as [base, pos].
function inflectionBases(word) {
  const out = [];
  for (const p of POS_PRIORITY) {
    for (const base of exceptions[p].get(word) || []) out.push([base, p]);
    for (const rule of RULES[p]) out.push([strip(word, rule), p]);
  }
  const doubled = word.match(/^(.*([b-df-hj-np-tv-z]))\2(ed|ing|er|est)$/); // bogged -> bog
  if (doubled) out.push([doubled[1], /ed|ing/.test(doubled[3]) ? 'v' : 'a']);
  return out.filter(([base]) => base && base !== word);
}

// The candidate whose sense is used most; "dies" means the verb die, not the dice.
function pickBase(candidates) {
  let best = null;
  for (const [base, p] of candidates) {
    const s = bestSense(base, p);
    if (!s) continue;
    const better = !best || s.tags > best.s.tags ||
      (s.tags === best.s.tags && POS_PRIORITY.indexOf(s.pos) < POS_PRIORITY.indexOf(best.s.pos));
    if (better) best = { base, s };
  }
  return best && { lemma: best.base, pos: best.s.pos, gloss: cleanGloss(best.s.pos, best.s.offset) };
}

const fromSupplement = (word) => {
  const [pos, gloss] = supplement[word];
  return { lemma: word, pos, gloss };
};

function define(word) {
  if (Object.hasOwn(supplement, word)) return fromSupplement(word);
  const direct = bestSense(word);
  if (direct) return { lemma: word, pos: direct.pos, gloss: cleanGloss(direct.pos, direct.offset) };
  const d =
    pickBase(inflectionBases(word)) ||
    pickBase(DERIVED.map((rule) => [strip(word, rule), 'a']).filter(([b]) => b));
  if (d && Object.hasOwn(supplement, d.lemma)) return fromSupplement(d.lemma);
  if (d) return d;
  // Last of all: an inflection of a word WordNet lacks but the supplement defines
  // (nerdier -> nerdy, prepped -> prep).
  const supplemented = inflectionBases(word).find(([base]) => Object.hasOwn(supplement, base));
  return supplemented ? fromSupplement(supplemented[0]) : null;
}

// ---- output -------------------------------------------------------------------

// Each word gets its own entry; identical "pos|gloss" texts are stored once.
const glosses = [];
const glossIndex = new Map();
const entries = []; // "word:glossIndex" or "word:glossIndex:lemma" when the lemma differs
const missing = [];
for (const w of words) {
  const d = define(w);
  if (!d) { missing.push(w); continue; }
  const text = `${d.pos}|${d.gloss}`;
  if (!glossIndex.has(text)) { glossIndex.set(text, glosses.length); glosses.push(text); }
  entries.push([w, glossIndex.get(text), d.lemma !== w ? d.lemma : ''].join(':').replace(/:$/, ''));
}

const wrap = (body) =>
  '(function (root) {\n' +
  '  const ST = (root.ST = root.ST || {});\n' +
  body +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = ST;\n" +
  "})(typeof window !== 'undefined' ? window : globalThis);\n";

await writeFile(
  join(root, 'data', 'words.js'),
  `// Generated by scripts/build-wordlist.mjs. Do not edit.\n// ENABLE1 ∩ SCOWL size <= ${SCOWL_LEVELS.at(-1)} (US + UK), minus ${blocked.size} blocklisted, plus ${allowed.size} allowlisted: ${words.length} words. Licences: data/LICENSES.md\n` +
    wrap(`  ST.WORDS = ${JSON.stringify(words.join('\n'))};\n`)
);
await writeFile(
  join(root, 'data', 'definitions.js'),
  `// Generated by scripts/build-wordlist.mjs. Do not edit.\n// WordNet 3.0 glosses plus scripts/supplement-defs.json. Licences: data/LICENSES.md\n` +
    wrap(
      `  ST.GLOSSES = ${JSON.stringify(glosses)};\n` +
        `  ST.DEF_INDEX = ${JSON.stringify(entries.join(','))};\n`
    )
);

const pct = (n) => ((100 * n) / words.length).toFixed(1) + '%';
console.log(`Wrote ${words.length} words; ${entries.length} defined (${pct(entries.length)}), ${glosses.length} distinct definitions.`);
if (report) {
  const allowMissing = missing.filter((w) => level.get(w) === 0);
  console.log(`\nAllowlisted words with no definition (${allowMissing.length}):\n${allowMissing.join(' ')}`);
  console.log(`\nAllowlisted words not in ENABLE (${notInEnable.length}):\n${notInEnable.join(' ')}`);
  for (const lv of SCOWL_LEVELS) {
    const m = missing.filter((w) => level.get(w) === lv);
    console.log(`\nMissing at SCOWL level ${lv} (${m.length}):\n${m.join(' ')}`);
  }
}

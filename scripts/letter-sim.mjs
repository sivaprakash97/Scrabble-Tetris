// Simulates the letter generator without playing a game, and reports how it behaves.
// It calls the production code, ST.WeightedLetters.nextLetters(4), exactly as Game does once
// per piece, with the settings in src/config.js (CONFIG.LETTER_GENERATION).
//
// Usage: npm run letters -- [--letters 10000] [--seed 2026]
//        Try other settings without editing the config:
//        [--window 5] [--rare-max 1] [--threshold 2] [--damping 0.3] [--vowel-floor 1]
//
// Reports:
// 1. each letter's probability from the weights alone, its expected frequency once the
//    vowel floor is included, and its observed frequency with and without recent-letter
//    balancing (same seed, RARE_DAMPING forced to 1 for "without");
// 2. how often balancing switched on and what it did to uncommon letters;
// 3. what the vowel floor did: vowel share and vowel-less pieces with the floor and without
//    it (same seed, VOWEL_FLOOR forced to 0 for "without");
// 4. whether uncommon letters came out too often or too rarely;
// 5. a 1,000,000-letter run of the same settings, where random noise is small enough to
//    see each effect clearly.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
for (const f of ['config', 'tiles', 'letters']) require(`../src/${f}.js`);
const ST = globalThis.ST;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
// The production settings, with any command-line overrides for this run only.
const BASE = ST.CONFIG.LETTER_GENERATION;
const LG = {
  ...BASE,
  RECENT_WINDOW: arg('window', BASE.RECENT_WINDOW),
  RARE_MAX_WEIGHT: arg('rare-max', BASE.RARE_MAX_WEIGHT),
  RARE_THRESHOLD: arg('threshold', BASE.RARE_THRESHOLD),
  RARE_DAMPING: arg('damping', BASE.RARE_DAMPING),
  VOWEL_FLOOR: arg('vowel-floor', BASE.VOWEL_FLOOR),
};
const LETTERS = Math.max(4, Math.round(arg('letters', 10000) / 4) * 4); // whole pieces of 4
const SEED = arg('seed', 2026);
const VOWELS = new Set(LG.VOWELS);

// Generates `letters` letters as pieces of 4 through the production generator and measures them.
function simulate(settings, letters, seed) {
  const gen = new ST.WeightedLetters(settings, ST.mulberry32(seed));
  const counts = {};
  const stream = [];
  let piecesNoVowel = 0;
  let piecesOneVowel = 0;
  let piecesTwoRare = 0;
  let vowels = 0;
  for (let p = 0; p < letters / 4; p++) {
    const piece = gen.nextLetters(4).map((t) => (t === 'QU' ? 'Q' : t));
    const v = piece.filter((l) => VOWELS.has(l)).length;
    vowels += v;
    if (v === 0) piecesNoVowel++;
    if (v === 1) piecesOneVowel++;
    if (piece.filter((l) => gen.isRare(l)).length >= 2) piecesTwoRare++;
    for (const l of piece) {
      counts[l] = (counts[l] || 0) + 1;
      stream.push(l);
    }
  }
  // Longest run of consecutive uncommon letters, and how many 5-letter stretches hold 2+.
  let run = 0;
  let longestRun = 0;
  let clusters = 0;
  let rareInWindow = 0;
  stream.forEach((l, i) => {
    run = gen.isRare(l) ? run + 1 : 0;
    longestRun = Math.max(longestRun, run);
    if (gen.isRare(l)) rareInWindow++;
    if (i >= 5 && gen.isRare(stream[i - 5])) rareInWindow--;
    if (i >= 4 && rareInWindow >= 2) clusters++;
  });
  const rareCount = stream.filter((l) => gen.isRare(l)).length;
  return {
    gen,
    counts,
    n: stream.length,
    rareShare: rareCount / stream.length,
    longestRun,
    clusterShare: clusters / Math.max(1, stream.length - 4),
    pieces: letters / 4,
    piecesNoVowel,
    piecesOneVowel,
    piecesTwoRare,
    vowelShare: vowels / stream.length,
  };
}

const pct = (x, d = 2) => (100 * x).toFixed(d) + '%';
const weightsOnly = ST.normaliseWeights(LG.WEIGHTS); // p(letter) = weight / sum of weights
const total = Object.values(LG.WEIGHTS).reduce((s, w) => s + w, 0);
const probe = new ST.WeightedLetters(LG);
const rareLetters = Object.keys(LG.WEIGHTS).filter((l) => probe.isRare(l));
const vowelTheory = [...VOWELS].reduce((s, l) => s + (weightsOnly[l] || 0), 0); // V
const floor = probe.canForceVowel ? Math.min(probe.vowelFloor, 4) : 0;

// The vowel floor in theory. Without it, a piece's vowel count is binomial: 4 tiles, each a
// vowel with probability V. The floor turns any count below VOWEL_FLOOR into VOWEL_FLOOR,
// so the expected count is E[max(count, floor)]. Forced and natural vowels both follow the
// vowel weights, and consonants keep their relative weights, so each letter's expected
// share is its weights-only share scaled by (new vowel share / V) or (new consonant share /
// (1 - V)).
const choose = (n, k) => (k === 0 || k === n ? 1 : choose(n - 1, k - 1) + choose(n - 1, k));
const pieceOdds = (V) => [0, 1, 2, 3, 4].map((k) => choose(4, k) * V ** k * (1 - V) ** (4 - k));
const naturalOdds = pieceOdds(vowelTheory);
const flooredOdds = naturalOdds.map((p, k) => (k < floor ? 0 : k === floor ? naturalOdds.slice(0, k + 1).reduce((s, x) => s + x, 0) : p));
const vowelShareTheory = flooredOdds.reduce((s, p, k) => s + k * p, 0) / 4;
const theory = {};
for (const [letter, p] of Object.entries(weightsOnly)) {
  theory[letter] = VOWELS.has(letter) ? (p * vowelShareTheory) / vowelTheory : (p * (1 - vowelShareTheory)) / (1 - vowelTheory);
}
const rareTheory = rareLetters.reduce((s, l) => s + theory[l], 0);

const on = simulate(LG, LETTERS, SEED);
const off = simulate({ ...LG, RARE_DAMPING: 1 }, LETTERS, SEED);
const noFloor = simulate({ ...LG, VOWEL_FLOOR: 0 }, LETTERS, SEED);

console.log(`Weighted letter generator: ${LETTERS.toLocaleString('en-US')} letters (${LETTERS / 4} pieces), seed ${SEED}`);
console.log(
  `Settings: window ${LG.RECENT_WINDOW}, uncommon = weight <= ${LG.RARE_MAX_WEIGHT} (${rareLetters.join(' ')}), ` +
    `threshold ${LG.RARE_THRESHOLD}, damping x${LG.RARE_DAMPING}, vowel floor ${floor}; weights sum to ${+total.toFixed(4)}\n`
);

console.log('1. Per letter: theoretical probability vs observed frequency');
console.log('   "Weights only" is weight / sum. "Expected" adds the vowel floor, which moves some share from consonants to vowels.');
console.log('Letter  Weight  Weights only  Expected  Observed (balancing on)  Observed (off)  On - expected');
for (const [letter, w] of Object.entries(LG.WEIGHTS)) {
  const t = theory[letter];
  const a = (on.counts[letter] || 0) / on.n;
  const b = (off.counts[letter] || 0) / off.n;
  const d = (a - t) * 100;
  const diff = (d < 0 ? '' : '+') + d.toFixed(2);
  console.log(
    `  ${letter}${probe.isRare(letter) ? '*' : ' '}   ${String(w).padStart(5)}  ${pct(weightsOnly[letter]).padStart(12)}  ${pct(t).padStart(8)}  ${pct(a).padStart(23)}  ${pct(b).padStart(14)}  ${diff} pts`
  );
}
console.log('  (* = uncommon letter)\n');

console.log('2. Recent-letter balancing');
const s = on.gen.stats;
console.log(`  Balancing was on for            ${pct(s.dampedDraws / s.draws)} of draws (${s.dampedDraws} of ${s.draws})`);
console.log(`  Uncommon letters while it was on ${s.rareWhileDamped} (would be ~${(s.dampedDraws * rareTheory).toFixed(1)} undamped)`);
console.log(`  Uncommon share overall          expected ${pct(rareTheory)}, on ${pct(on.rareShare)}, off ${pct(off.rareShare)}`);
console.log(`  Longest run of uncommon letters on ${on.longestRun}, off ${off.longestRun}`);
console.log(`  5-letter stretches with 2+ uncommon  on ${pct(on.clusterShare)}, off ${pct(off.clusterShare)}`);
console.log(`  Pieces with 2+ uncommon letters      on ${on.piecesTwoRare}, off ${off.piecesTwoRare} (of ${on.pieces})\n`);

console.log(`3. Vowel floor (at least ${floor} vowel${floor === 1 ? '' : 's'} per piece)`);
console.log(`  Vowels are ${pct(vowelTheory, 1)} of the weight (V).`);
console.log('                                  With the floor            Without it (VOWEL_FLOOR 0)');
const row = (label, withTheory, withObs, withoutTheory, withoutObs) =>
  console.log(`  ${label.padEnd(30)}  ${`${pct(withObs, 1)} (theory ${pct(withTheory, 1)})`.padEnd(24)}  ${pct(withoutObs, 1)} (theory ${pct(withoutTheory, 1)})`);
row('Vowel share', vowelShareTheory, on.vowelShare, vowelTheory, noFloor.vowelShare);
row('Pieces with no vowel', flooredOdds[0], on.piecesNoVowel / on.pieces, naturalOdds[0], noFloor.piecesNoVowel / noFloor.pieces);
row('Pieces with exactly one vowel', flooredOdds[1], on.piecesOneVowel / on.pieces, naturalOdds[1], noFloor.piecesOneVowel / noFloor.pieces);
console.log(`  Vowels forced by the floor      ${on.gen.stats.forcedVowels} tiles, ${(on.gen.stats.forcedVowels / on.pieces).toFixed(3)} per piece\n`);

console.log('4. Are uncommon letters too frequent or too rare?');
const se = Math.sqrt((rareTheory * (1 - rareTheory)) / on.n);
const gap = on.rareShare - rareTheory;
const verdict = Math.abs(gap) <= 3 * se ? 'as designed' : gap > 0 ? 'TOO OFTEN' : 'TOO RARELY';
console.log(
  `  Observed ${pct(on.rareShare)} vs expected ${pct(rareTheory)}: ${verdict} ` +
    `(tolerance ±${pct(3 * se)} = 3 standard errors for ${on.n} letters).`
);
console.log('  Balancing is meant to lower the share only slightly; it targets clusters, not the overall rate.\n');

console.log('5. Precision check: 1,000,000 letters each way');
const bigOn = simulate(LG, 1000000, SEED + 1);
const bigOff = simulate({ ...LG, RARE_DAMPING: 1 }, 1000000, SEED + 1);
const bigNoFloor = simulate({ ...LG, VOWEL_FLOOR: 0 }, 1000000, SEED + 1);
console.log(`  Vowel share                 floor ${pct(bigOn.vowelShare, 3)} (theory ${pct(vowelShareTheory, 3)}), no floor ${pct(bigNoFloor.vowelShare, 3)} (theory ${pct(vowelTheory, 3)})`);
console.log(`  Pieces with no vowel        floor ${pct(bigOn.piecesNoVowel / bigOn.pieces, 3)}, no floor ${pct(bigNoFloor.piecesNoVowel / bigNoFloor.pieces, 3)} (theory ${pct(naturalOdds[0], 3)})`);
console.log(`  Uncommon share              on ${pct(bigOn.rareShare, 3)}, off ${pct(bigOff.rareShare, 3)}, expected ${pct(rareTheory, 3)}`);
console.log(`  2+ uncommon in 5 letters    on ${pct(bigOn.clusterShare, 3)}, off ${pct(bigOff.clusterShare, 3)}`);
console.log(`  Longest uncommon run        on ${bigOn.longestRun}, off ${bigOff.longestRun}`);
console.log(`  Balancing on for            ${pct(bigOn.gen.stats.dampedDraws / bigOn.gen.stats.draws, 3)} of draws`);

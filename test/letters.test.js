// Tests for the weighted letter generator (src/letters.js), the 'weighted' LETTER_SYSTEM.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ST, cfg, dict } = require('./helpers');

const LG = cfg.LETTER_GENERATION;
const make = (overrides = {}, seed = 7) => new ST.WeightedLetters({ ...LG, ...overrides }, ST.mulberry32(seed));
const total = Object.values(LG.WEIGHTS).reduce((s, w) => s + w, 0);

test('probabilities are weight / sum of weights and add up to 1', () => {
  const p = ST.normaliseWeights(LG.WEIGHTS);
  const sum = Object.values(p).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
  assert.ok(Math.abs(total - 98.9) < 1e-9);
  assert.ok(Math.abs(p.E - 12 / 98.9) < 1e-12);
  assert.ok(Math.abs(p.Q - 0.1 / 98.9) < 1e-12);
});

test('with balancing off, 20,000 letters land close to the theoretical odds', () => {
  const gen = make({ RARE_DAMPING: 1 }, 11);
  const n = 20000;
  const counts = {};
  for (let i = 0; i < n; i++) {
    const l = gen.nextLetter();
    counts[l] = (counts[l] || 0) + 1;
  }
  for (const [letter, w] of Object.entries(LG.WEIGHTS)) {
    const p = w / total;
    const observed = (counts[letter] || 0) / n;
    const tolerance = 4 * Math.sqrt((p * (1 - p)) / n) + 0.0005; // 4 standard errors
    assert.ok(Math.abs(observed - p) < tolerance, `${letter}: observed ${observed.toFixed(4)}, expected ${p.toFixed(4)}`);
  }
});

test('uncommon letters are the ones at or below RARE_MAX_WEIGHT', () => {
  const gen = make();
  const rare = Object.keys(LG.WEIGHTS).filter((l) => gen.isRare(l)).sort();
  assert.deepEqual(rare, ['J', 'K', 'Q', 'V', 'X', 'Z']);
});

test('balancing turns on at RARE_THRESHOLD and scales only uncommon weights by RARE_DAMPING', () => {
  const gen = make();
  gen.recent = ['Z', 'A', 'B', 'C', 'D']; // one uncommon letter: below the threshold of 2
  assert.equal(gen.balancing(), false);
  assert.deepEqual(gen.currentWeights(), LG.WEIGHTS);

  gen.recent = ['Z', 'A', 'X', 'C', 'D']; // two uncommon letters: balancing on
  assert.equal(gen.balancing(), true);
  const w = gen.currentWeights();
  for (const [letter, base] of Object.entries(LG.WEIGHTS)) {
    const expected = gen.isRare(letter) ? base * LG.RARE_DAMPING : base;
    assert.ok(Math.abs(w[letter] - expected) < 1e-12, letter);
    assert.ok(w[letter] > 0, `${letter} must stay possible`);
  }
});

test('damping can never make a letter impossible', () => {
  const gen = make({ RARE_DAMPING: 0 });
  gen.recent = ['Z', 'X', 'Q', 'J', 'K'];
  assert.ok(gen.currentWeights().Z > 0);
});

test('the window remembers at most RECENT_WINDOW letters', () => {
  const gen = make({ RECENT_WINDOW: 5 });
  for (let i = 0; i < 50; i++) gen.nextLetter();
  assert.equal(gen.recent.length, 5);
});

test('balancing makes uncommon letters right after a cluster less likely', () => {
  const n = 200000;
  const run = (damping) => {
    const gen = make({ RARE_DAMPING: damping }, 99);
    for (let i = 0; i < n; i++) gen.nextLetter();
    return gen.stats.rareWhileDamped / gen.stats.dampedDraws; // odds of a rare letter while triggered
  };
  const off = run(1);
  const on = run(0.3);
  assert.ok(on < off * 0.6, `with balancing ${on.toFixed(4)} vs without ${off.toFixed(4)}`);
});

test('Q is delivered as the Qu tile', () => {
  const gen = make({ WEIGHTS: { Q: 1 } });
  assert.deepEqual(gen.nextLetters(4), ['QU', 'QU', 'QU', 'QU']);
});

test('changing only the config changes the output', () => {
  assert.deepEqual(make({ WEIGHTS: { A: 1 } }).nextLetters(4), ['A', 'A', 'A', 'A']);
  // Balancing off: with RARE_MAX_WEIGHT 1, A (weight 1) would count as uncommon and be damped.
  const gen = make({ WEIGHTS: { A: 1, B: 3 }, RARE_DAMPING: 1 }, 5);
  let b = 0;
  for (let i = 0; i < 4000; i++) if (gen.nextLetter() === 'B') b++;
  assert.ok(Math.abs(b / 4000 - 0.75) < 0.03, `B share ${b / 4000}`);
});

test('the game uses the weighted generator when LETTER_SYSTEM says so', () => {
  const weighted = new ST.Game({ dict: dict(), seed: 1, cfg: { ...cfg, LETTER_SYSTEM: 'weighted' } });
  const bags = new ST.Game({ dict: dict(), seed: 1, cfg: { ...cfg, LETTER_SYSTEM: 'bags' } });
  assert.ok(weighted.director instanceof ST.WeightedLetters);
  assert.ok(bags.director instanceof ST.TileDirector);
  weighted.start();
  assert.equal(weighted.log.pieces[0].letters.length, 4);
  assert.equal(weighted.log.pieces[0].helper, null);
});

// ---- Vowel floor (playtest 6) ----------------------------------------------------------

const VOWELS = new Set(LG.VOWELS);
const vowelCount = (piece) => piece.filter((t) => VOWELS.has(t)).length;
const vowelWeight = LG.VOWELS.reduce((s, v) => s + LG.WEIGHTS[v], 0);

test('with VOWEL_FLOOR 1, no piece lacks a vowel and vowels rise to about 42%', () => {
  assert.equal(LG.VOWEL_FLOOR, 1);
  const gen = make({}, 21);
  const pieces = 5000;
  let vowels = 0;
  for (let i = 0; i < pieces; i++) {
    const piece = gen.nextLetters(4);
    assert.ok(vowelCount(piece) >= 1, piece.join(''));
    vowels += vowelCount(piece);
  }
  // Theory: V + (1 - V)^4 / 4, where V is the vowels' share of the weight (38 / 98.9).
  const V = vowelWeight / total;
  const expected = V + (1 - V) ** 4 / 4;
  const share = vowels / (pieces * 4);
  assert.ok(Math.abs(share - expected) < 0.012, `vowel share ${share.toFixed(4)}, expected ${expected.toFixed(4)}`);
  assert.ok(gen.stats.forcedVowels > 0);
});

test('with VOWEL_FLOOR 0, pieces with no vowel still appear (about 14%)', () => {
  const gen = make({ VOWEL_FLOOR: 0 }, 21);
  let none = 0;
  for (let i = 0; i < 5000; i++) if (vowelCount(gen.nextLetters(4)) === 0) none++;
  const expected = (1 - vowelWeight / total) ** 4;
  assert.ok(Math.abs(none / 5000 - expected) < 0.02, `no-vowel share ${none / 5000}, expected ${expected.toFixed(3)}`);
  assert.equal(gen.stats.forcedVowels, 0);
});

test('a piece that already has a vowel is drawn exactly as without the floor', () => {
  // Same seed, floor on and off: they match piece for piece until the first forced vowel.
  const on = make({}, 3);
  const off = make({ VOWEL_FLOOR: 0 }, 3);
  let compared = 0;
  for (let i = 0; i < 200; i++) {
    const a = on.nextLetters(4);
    const b = off.nextLetters(4);
    if (vowelCount(b) === 0) break;
    assert.deepEqual(a, b);
    compared++;
  }
  assert.ok(compared > 0);
});

test('forced vowels land on every cell of the piece', () => {
  // Only consonants and one vowel: every piece needs its vowel forced (the first 3 tiles
  // can be E too, so count the pieces where E was the only vowel).
  const gen = make({ WEIGHTS: { B: 1000, C: 1000, E: 0.001 }, RARE_MAX_WEIGHT: 0 }, 9);
  const positions = [0, 0, 0, 0];
  for (let i = 0; i < 2000; i++) {
    const piece = gen.nextLetters(4);
    assert.equal(vowelCount(piece), 1);
    positions[piece.indexOf('E')]++;
  }
  for (const n of positions) assert.ok(n > 400, `positions ${positions}`);
});

test('forced vowels follow the vowel weights', () => {
  // nextLetter(true) is the floor's draw: E 12/38, A 8/38, O 8/38, I 7/38, U 3/38.
  const gen = make({}, 13);
  const forced = {};
  for (let i = 0; i < 6000; i++) {
    const v = gen.nextLetter(true);
    forced[v] = (forced[v] || 0) + 1;
  }
  for (const v of LG.VOWELS) {
    const p = LG.WEIGHTS[v] / vowelWeight;
    assert.ok(Math.abs(forced[v] / 6000 - p) < 0.025, `${v}: ${(forced[v] / 6000).toFixed(3)} vs ${p.toFixed(3)}`);
  }
  assert.ok(Object.keys(forced).every((l) => VOWELS.has(l)));
});

test('a weight table with no vowels never forces one', () => {
  const gen = make({ WEIGHTS: { B: 1, C: 1 } }, 4);
  for (let i = 0; i < 100; i++) assert.equal(vowelCount(gen.nextLetters(4)), 0);
  assert.equal(gen.stats.forcedVowels, 0);
});

test('VOWEL_FLOOR 2 gives every piece at least two vowels', () => {
  const gen = make({ VOWEL_FLOOR: 2 }, 17);
  for (let i = 0; i < 2000; i++) assert.ok(vowelCount(gen.nextLetters(4)) >= 2);
});

test('every piece the game deals in the weighted system has a vowel', () => {
  const g = new ST.Game({ dict: dict(), seed: 5, cfg: { ...cfg, LETTER_SYSTEM: 'weighted' } });
  let pieces = 0;
  for (let seed = 1; pieces < 300; seed++) {
    g.reset(seed); // a fresh game each time (start() does nothing once a game is over)
    g.start();
    for (let step = 0; step < 5000 && g.state !== 'over'; step++) g.update(100);
    for (const p of g.log.pieces) assert.ok(vowelCount(p.letters) >= 1, p.letters.join(''));
    pieces += g.log.pieces.length;
  }
});

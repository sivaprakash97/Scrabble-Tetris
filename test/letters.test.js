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

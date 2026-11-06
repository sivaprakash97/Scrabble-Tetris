const test = require('node:test');
const assert = require('node:assert/strict');
const { ST, cfg } = require('./helpers');

const RARE = new Set(cfg.RARE);
const isVowel = (t) => cfg.VOWELS.includes(t);

function sample(n, vowelShare = null, seed = 42) {
  const d = new ST.TileDirector(cfg, ST.mulberry32(seed));
  return Array.from({ length: n }, () => d.nextLetters(4, vowelShare));
}

test('overall vowel share lands between 37% and 43%', () => {
  const tiles = sample(10000).flat().filter((t) => t !== '*');
  const share = tiles.filter(isVowel).length / tiles.length;
  assert.ok(share >= 0.37 && share <= 0.43, `vowel share ${share.toFixed(3)}`);
});

test('letters follow everyday words: S is the most common consonant, hard letters are rare', () => {
  const tiles = sample(10000).flat();
  const count = {};
  for (const t of tiles) count[t] = (count[t] || 0) + 1;
  const consonants = Object.keys(count).filter((t) => !isVowel(t) && t !== '*');
  const top = consonants.sort((a, b) => count[b] - count[a])[0];
  assert.equal(top, 'S');
  const hard = ['QU', 'J', 'X', 'Z'].reduce((s, t) => s + (count[t] || 0), 0) / tiles.length;
  assert.ok(hard < 0.03, `Qu+J+X+Z share ${hard.toFixed(3)}`);
});

test('helper letters: with a 100% chance every piece carries one of the offered letters', () => {
  const d = new ST.TileDirector({ ...cfg, HELPER_CHANCE: 1 }, ST.mulberry32(3));
  for (let i = 0; i < 200; i++) {
    const p = d.nextLetters(4, null, { T: 3, N: 1 });
    assert.ok(p.includes('T') || p.includes('N'), p.join(','));
  }
  // No offered letters, or a 0% chance, leaves pieces alone.
  const plain = new ST.TileDirector({ ...cfg, HELPER_CHANCE: 0 }, ST.mulberry32(3));
  const same = new ST.TileDirector({ ...cfg, HELPER_CHANCE: 0 }, ST.mulberry32(3));
  assert.deepEqual(plain.nextLetters(4, null, { T: 1 }), same.nextLetters(4, null));
});

test('every piece has 1 to 3 vowels', () => {
  for (const p of sample(10000)) {
    const v = p.filter(isVowel).length;
    assert.ok(v >= 1 && v <= 3, p.join(','));
  }
});

test('at most one rare letter per piece, never in back-to-back pieces', () => {
  let prev = 0;
  for (const p of sample(10000)) {
    const r = p.filter((t) => RARE.has(t)).length;
    assert.ok(r <= 1, p.join(','));
    assert.ok(!(r && prev), 'rare letters in consecutive pieces');
    prev = r;
  }
});

test('Q only ever arrives as a Qu tile and blanks show up occasionally', () => {
  const tiles = sample(10000).flat();
  assert.ok(!tiles.includes('Q'));
  assert.ok(tiles.includes('QU'));
  const blanks = tiles.filter((t) => t === '*').length;
  assert.ok(blanks > 300 && blanks < 700, `blanks ${blanks}`); // ~5% of 10000 pieces
});

test('adaptive nudge adds vowels to a consonant-heavy stack and removes them from a vowel-heavy one', () => {
  const avg = (share) => {
    const ps = sample(4000, share, 9);
    return ps.reduce((s, p) => s + p.filter(isVowel).length, 0) / ps.length;
  };
  const neutral = avg(null);
  assert.ok(avg(0.2) > neutral + 0.4);
  assert.ok(avg(0.8) < neutral - 0.4);
});

test('the same seed gives the same letters', () => {
  assert.deepEqual(sample(50, null, 5), sample(50, null, 5));
});

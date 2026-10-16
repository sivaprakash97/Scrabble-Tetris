const test = require('node:test');
const assert = require('node:assert/strict');
const { ST, cfg, dict, tiles } = require('./helpers');

const words = (s, minLen = 3) => ST.bestWordsInRun(tiles(s), dict(), cfg, minLen).map((p) => p.display);

test('dictionary loads ENABLE words', () => {
  assert.ok(dict().size > 100000);
  assert.ok(dict().set.has('CAT'));
  assert.ok(!dict().set.has('XCATSZ'));
});

test('longer word beats the word inside it', () => {
  assert.deepEqual(words('XCATSZ'), ['CATS']);
});

test('picks the best set of non-overlapping words in a run', () => {
  // CAT + DOG beats any single word in CATDOG.
  assert.deepEqual(words('CATDOG'), ['CAT', 'DOG']);
  assert.deepEqual(words('ZZZ'), []);
});

test('minimum length setting is respected', () => {
  assert.deepEqual(words('XCATX', 4), []);
  assert.deepEqual(words('XCATX', 3), ['CAT']);
});

test('Qu tile counts as two letters', () => {
  const run = tiles('qIZ');
  assert.equal(ST.letterLength(run), 4);
  assert.deepEqual(words('qIZ'), ['QUIZ']);
  // QUA is 3 letters from only 2 tiles.
  assert.deepEqual(words('qA'), ['QUA']);
});

test('blank matches any letter and is shown in lowercase', () => {
  const [w] = ST.bestWordsInRun(tiles('C*T'), dict(), cfg, 3);
  assert.ok(dict().set.has(w.word));
  assert.equal(w.display[1], w.display[1].toLowerCase());
  assert.equal(ST.bestWordsInRun(tiles('**T'), dict(), cfg, 3).length, 1);
});

test('more than the allowed number of blanks never matches', () => {
  assert.equal(dict().match(['*', '*', '*', 'S']), null);
});

test('scores follow the plan examples', () => {
  const score = (s) => ST.wordScore(tiles(s), cfg);
  assert.equal(score('CAT'), 50);
  assert.equal(score('TRAINS'), 300);
  assert.equal(score('qIZ'), 420);
  assert.equal(score('C*T'), 40); // blank scores 0
});

test('findWords scans each row and reports cells', () => {
  const g = new ST.Game({ dict: dict(), seed: 1 });
  g.setRows(['..CAT.DOG.', 'ZZ.SUN....']);
  const found = ST.findWords(g.board.grid, dict(), cfg, 3);
  assert.deepEqual(found.map((w) => w.word).sort(), ['CAT', 'DOG', 'SUN']);
  const cat = found.find((w) => w.word === 'CAT');
  assert.deepEqual(cat.cells, [{ x: 2, y: 18 }, { x: 3, y: 18 }, { x: 4, y: 18 }]);
});

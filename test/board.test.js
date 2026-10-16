const test = require('node:test');
const assert = require('node:assert/strict');
const { ST, cfg, dict } = require('./helpers');

const show = (g, n) =>
  g.board.grid.slice(-n).map((row) => row.map((t) => (t ? (t.ch === 'QU' ? 'q' : t.ch) : '.')).join(''));

test('clearing a word drops only the tiles above it and keeps holes', () => {
  const g = new ST.Game({ dict: dict(), seed: 1 });
  g.setRows([
    '...X......',
    '...Y.....B',
    '.....H...B',
    'ZCATZ....B',
  ]);
  g.board.clearCells([{ x: 1, y: 19 }, { x: 2, y: 19 }, { x: 3, y: 19 }]);
  // Column 3's hole (row 18) moved down with the Y above it.
  assert.deepEqual(show(g, 4), [
    '..........',
    '...X.....B',
    '...Y.H...B',
    'Z...Z....B',
  ]);
});

test('a clear with nothing new to spell ends the cascade', () => {
  const g = new ST.Game({ dict: dict(), seed: 1 });
  g.setRows([
    'S.........',
    'CAT.......',
    'XUN.......',
  ]);
  g.state = 'playing';
  g.resolveWords();
  assert.equal(g.state, 'clearing');
  assert.deepEqual(g.clearing.found.map((w) => w.word), ['CAT']);
  assert.equal(g.chain, 1);

  g.update(cfg.CLEAR_FLASH + 1);
  // S drops into CAT's row but spells nothing, so the next piece spawns.
  assert.equal(g.state, 'playing');
  assert.ok(g.current);
  assert.deepEqual(show(g, 2), ['S.........', 'XUN.......']);
});

test('chain: tiles that drop onto a row can form a second word', () => {
  const g = new ST.Game({ dict: dict(), seed: 1 });
  // When CAT clears, S drops one row and lands in front of UN.
  g.setRows([
    '..S.......',
    '...UN.....',
    'CAT.......',
  ]);
  g.state = 'playing';
  g.resolveWords();
  assert.deepEqual(g.clearing.found.map((w) => w.word), ['CAT']);
  g.update(cfg.CLEAR_FLASH + 1);
  assert.equal(g.state, 'clearing');
  assert.equal(g.chain, 2);
  assert.deepEqual(g.clearing.found.map((w) => w.word), ['SUN']);
  const sun = g.clearing.found[0];
  assert.equal(sun.points, ST.wordScore(sun.cells.map(({ x, y }) => g.board.grid[y][x]), cfg) * 2);
});

test('rotation carries letters with their cells', () => {
  const p = ST.makePiece('I', ['A', 'B', 'C', 'D'], cfg);
  const read = (grid) => grid.flat().filter(Boolean).map((t) => t.ch).join('');
  assert.equal(read(p.grid), 'ABCD');
  const twice = ST.rotateGrid(ST.rotateGrid(p.grid, 1), 1);
  assert.equal(read(twice), 'DCBA');
  assert.equal(read(ST.rotateGrid(ST.rotateGrid(p.grid, 1), -1)), 'ABCD');
});

test('letter cycle shifts letters along reading order', () => {
  const p = ST.makePiece('T', ['A', 'B', 'C', 'D'], cfg);
  const c = ST.cycleLetters(p);
  assert.equal(c.grid.flat().filter(Boolean).map((t) => t.ch).join(''), 'DABC');
  assert.equal(c.grid.map((r) => r.map(Boolean).join()).join('|'), p.grid.map((r) => r.map(Boolean).join()).join('|'));
});

test('hard drop locks, and a blocked spawn ends the game', () => {
  const g = new ST.Game({ dict: dict(), seed: 7 });
  g.start();
  assert.equal(g.state, 'playing');
  for (let i = 0; i < 60 && g.state !== 'over'; i++) {
    g.hardDrop();
    while (g.state === 'clearing') g.update(cfg.CLEAR_FLASH + 1);
  }
  assert.equal(g.state, 'over');
  assert.ok(g.score > 0);
});

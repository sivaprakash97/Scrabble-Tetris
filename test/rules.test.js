const test = require('node:test');
const assert = require('node:assert/strict');
const { ST, cfg, dict } = require('./helpers');

const game = (settings = {}) => new ST.Game({ dict: dict(), seed: 1, settings });
const resolve = (g, rows) => {
  g.setRows(rows);
  g.state = 'playing';
  g.resolveWords();
  return g.clearing;
};

test('a word down a column counts only when vertical words are on', () => {
  const rows = ['C.........', 'A.........', 'T.........'];
  assert.equal(resolve(game({ vertical: false }), rows), null);
  const c = resolve(game({ vertical: true }), rows);
  assert.deepEqual(c.found.map((w) => [w.word, w.dir]), [['CAT', 'down']]);
  assert.deepEqual(c.cells.map((p) => p.y), [17, 18, 19]);
});

test('crossing words both score and their shared tile clears once', () => {
  const g = game({ vertical: true });
  const c = resolve(g, ['CAT.......', 'A.........', 'T.........']);
  assert.deepEqual(c.found.map((w) => w.dir).sort(), ['across', 'down']);
  assert.equal(c.cells.length, 5);
  assert.equal(g.score, 100); // CAT twice at 50
});

test('a full row with no word clears for no points and no chain', () => {
  const g = game({ vertical: false });
  const c = resolve(g, ['ZZZZZZZZZZ']);
  assert.equal(c.found.length, 0);
  assert.equal(c.junkCells.length, 10);
  assert.equal(g.score, 0);
  assert.equal(g.chain, 0);
  assert.ok(g.events.some((e) => e.type === 'rows'));
  g.update(cfg.CLEAR_FLASH + 1);
  assert.ok(g.board.isEmpty());
});

test('a full row that contains a word clears whole but scores only the word', () => {
  const g = game({ vertical: false });
  const c = resolve(g, ['CATZZZZZZZ']);
  assert.deepEqual(c.found.map((w) => w.word), ['CAT']);
  assert.equal(c.cells.length, 10);
  assert.equal(g.score, 50);
  assert.equal(g.chain, 1);
});

test('finishing letters: an open row end offers letters that complete a word', () => {
  const g = game({ vertical: false });
  g.setRows(['CA........']);
  const h = ST.finishingLetters(g.board.grid, dict(), 3, false);
  for (const ch of ['T', 'N', 'R']) assert.ok(h[ch] > 0, ch);
});

test('finishing letters: covered or unsupported ends offer nothing', () => {
  const covered = game({ vertical: false });
  covered.setRows(['..Z.......', 'CA........']); // the cell after CA is under a Z
  assert.deepEqual(ST.finishingLetters(covered.board.grid, dict(), 3, false), {});
  const floating = game({ vertical: false });
  floating.setRows(['CA........', 'ZZ........']); // the cell after CA has nothing under it
  assert.deepEqual(ST.finishingLetters(floating.board.grid, dict(), 3, false), {});
});

test('finishing letters: with vertical words, the top of a column counts', () => {
  const g = game({ vertical: true });
  g.setRows(['O.........', 'P.........']);
  assert.deepEqual(ST.finishingLetters(g.board.grid, dict(), 3, false), {});
  assert.ok(ST.finishingLetters(g.board.grid, dict(), 3, true).T > 0); // T + OP = TOP
});

test('the session record keeps how each piece was played', () => {
  const g = game();
  g.start();
  g.move(-1);
  g.move(-1);
  g.rotate(1);
  const first = g.current;
  g.softDropping = true;
  for (let i = 0; i < 200 && g.current === first; i++) g.update(50);
  while (g.state === 'clearing') g.update(cfg.CLEAR_FLASH + 1);

  const rec = g.sessionRecord();
  const p = rec.pieces[0];
  assert.equal(rec.status, 'in progress');
  assert.equal(p.n, 1);
  assert.equal(p.letters.length, 4);
  assert.equal(p.moves, 2);
  assert.equal(p.rotations, 1);
  assert.equal(p.rot, 1);
  assert.ok(p.softCells > 0);
  assert.ok(p.thinkMs > 0);
  assert.equal(typeof p.x, 'number');
  assert.equal(p.board.length, cfg.ROWS); // board after the piece settled
  assert.ok(rec.pieces.length === 2 && !rec.pieces[1].board); // the next piece is in play
  assert.ok(JSON.stringify(rec).length < 5000);

  g.gameOver();
  assert.equal(g.sessionRecord().status, 'over');
});

test('the game log records every piece and word', () => {
  const g = game();
  g.start();
  for (let i = 0; i < 400 && g.state !== 'over'; i += 1) { g.softDropping = true; g.update(50); }
  assert.ok(g.log.pieces.length >= 2);
  assert.ok(g.log.pieces.every((p) => p.letters.length === 4));
  const text = g.logText();
  assert.match(text, /Pieces \(\d+/);
  assert.match(text, /Board at the end/);
});

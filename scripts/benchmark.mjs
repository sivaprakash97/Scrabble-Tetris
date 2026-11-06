// Measures how playable the current rules are. A computer player tries every rotation
// and column for each piece and places it where it clears the most tiles while keeping
// the stack low. It plays the real ST.Game, so letters, helper letters and clearing
// rules are always the current ones.
//
// Usage: node scripts/benchmark.mjs [--games 40] [--cap 400] [--vertical|--no-vertical] [--min-len 3] [--keep-gaps]
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
for (const f of ['config', 'tiles', 'letters', 'pieces', 'words', 'board', 'game']) require(`../src/${f}.js`);
require('../data/words.js');
const ST = globalThis.ST;
const cfg = ST.CONFIG;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const GAMES = arg('games', 40);
const CAP = arg('cap', 400);
const minLen = arg('min-len', cfg.MIN_WORD_LEN);
const vertical = process.argv.includes('--no-vertical') ? false : process.argv.includes('--vertical') ? true : cfg.VERTICAL_WORDS;
cfg.VERTICAL_WORDS = vertical; // Game reads this from the config
if (process.argv.includes('--keep-gaps')) cfg.CLOSE_GAPS = false;

const dict = new ST.Dictionary(ST.WORDS, cfg);
const { COLS, ROWS } = cfg;

// Same clearing rules as Game.resolveWords and finishClear: words (across, and down if
// on) plus full rows, then gaps close when CLOSE_GAPS is on.
function resolve(board) {
  let tiles = 0;
  let score = 0;
  for (;;) {
    const found = ST.findAllWords(board.grid, dict, cfg, minLen, vertical);
    const cells = new Map();
    for (const w of found) for (const c of w.cells) cells.set(c.x + ',' + c.y, c);
    board.grid.forEach((row, y) => { if (row.every(Boolean)) row.forEach((_, x) => cells.set(x + ',' + y, { x, y })); });
    if (!cells.size) break;
    for (const w of found) score += w.score;
    tiles += cells.size;
    board.clearCells([...cells.values()]);
    if (cfg.CLOSE_GAPS) board.compact();
  }
  return { tiles, score };
}

function shape(grid) {
  const heights = [];
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let y = 0;
    while (y < ROWS && !grid[y][x]) y++;
    heights.push(ROWS - y);
    for (let yy = y + 1; yy < ROWS; yy++) if (!grid[yy][x]) holes++;
  }
  const bump = heights.slice(1).reduce((s, h, i) => s + Math.abs(h - heights[i]), 0);
  return { agg: heights.reduce((s, h) => s + h, 0), max: Math.max(...heights), holes, bump };
}

function bestPlacement(game) {
  const cur = game.current;
  let best = null;
  let grid = cur.grid;
  for (let r = 0; r < 4; r++, grid = ST.rotateGrid(grid, 1)) {
    for (let x = -3; x < COLS; x++) {
      const p = { ...cur, grid, x, y: -grid.findIndex((row) => row.some(Boolean)) };
      if (game.board.collides(p)) continue;
      while (!game.board.collides(p, 0, 1)) p.y++;
      const b = new ST.Board(COLS, ROWS);
      b.grid = game.board.grid.map((row) => row.slice());
      if (!b.lock(p)) continue;
      const res = resolve(b);
      const s = shape(b.grid);
      const value = res.tiles * 4 + res.score / 50 - s.agg * 0.5 - s.holes * 1.2 - s.bump * 0.3 - s.max * 0.5;
      if (!best || value > best.value) best = { grid, x: p.x, y: p.y, value };
    }
  }
  return best;
}

function play(seed) {
  const game = new ST.Game({ dict, seed, settings: { minLen, vertical } });
  game.start();
  let placed = 0;
  while (game.state !== 'over' && placed < CAP) {
    const best = bestPlacement(game);
    if (!best) break;
    Object.assign(game.current, { grid: best.grid, x: best.x, y: best.y });
    game.lockPiece();
    placed++;
    while (game.state === 'clearing') game.update(cfg.CLEAR_FLASH + 1);
  }
  const left = game.board.grid.flat().filter(Boolean).length;
  const down = game.log.words.filter((w) => w.includes(' down ')).length;
  return { placed, words: game.words, down, cleared: placed * 4 - left };
}

const t0 = Date.now();
const runs = Array.from({ length: GAMES }, (_, i) => play(5000 + i));
const sum = (k) => runs.reduce((s, r) => s + r[k], 0);
const sorted = runs.map((r) => r.placed).sort((a, b) => a - b);
console.log(`Rules: shortest word ${minLen}, words read ${vertical ? 'across and down' : 'across only'}, gaps ${cfg.CLOSE_GAPS ? 'close after a clear' : 'stay'}`);
console.log(`${GAMES} games, capped at ${CAP} pieces (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
console.log(`  median pieces placed     ${sorted[GAMES >> 1]}`);
console.log(`  average pieces placed    ${(sum('placed') / GAMES).toFixed(0)}`);
console.log(`  tiles cleared per piece  ${(sum('cleared') / sum('placed')).toFixed(2)} (each piece adds 4)`);
console.log(`  words per game           ${(sum('words') / GAMES).toFixed(0)} (${((100 * sum('down')) / Math.max(1, sum('words'))).toFixed(0)}% down)`);
console.log(`  games reaching ${CAP}       ${runs.filter((r) => r.placed >= CAP).length}/${GAMES}`);

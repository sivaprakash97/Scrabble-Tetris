// Dictionary lookup, word finding in rows, and word scoring.
(function (root) {
  const ST = (root.ST = root.ST || {});
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  class Dictionary {
    constructor(text, cfg) {
      this.cfg = cfg;
      this.set = new Set();
      for (const line of text.split('\n')) {
        const w = line.trim().toUpperCase();
        if (w.length >= 2 && w.length <= cfg.MAX_WORD_LEN) this.set.add(w);
      }
    }

    get size() {
      return this.set.size;
    }

    // tokens: array of 'A'..'Z' | 'QU' | '*'. Returns { word, display } or null.
    // Blanks are tried as every letter; display shows them in lowercase.
    match(tokens) {
      const blanks = [];
      tokens.forEach((t, i) => t === '*' && blanks.push(i));
      if (blanks.length === 0) {
        const word = tokens.join('');
        return this.set.has(word) ? { word, display: word } : null;
      }
      if (blanks.length > this.cfg.MAX_BLANKS_PER_WORD) return null;

      const filled = tokens.slice();
      const tryFill = (k) => {
        if (k === blanks.length) return this.set.has(filled.join(''));
        for (const ch of ALPHABET) {
          filled[blanks[k]] = ch;
          if (tryFill(k + 1)) return true;
        }
        return false;
      };
      if (!tryFill(0)) return null;
      return {
        word: filled.join(''),
        display: filled.map((ch, i) => (tokens[i] === '*' ? ch.toLowerCase() : ch)).join(''),
      };
    }
  }

  function letterLength(tiles) {
    return tiles.reduce((n, t) => n + (t.ch === '*' ? 1 : t.ch.length), 0);
  }

  function lengthMultiplier(len, cfg) {
    return cfg.LENGTH_MULT[len] || (len > 7 ? cfg.LENGTH_MULT_MAX : 0);
  }

  // Base points for one word, before chain and level multipliers.
  function wordScore(tiles, cfg) {
    const sum = tiles.reduce((s, t) => s + t.value, 0);
    return sum * lengthMultiplier(letterLength(tiles), cfg) * cfg.WORD_BASE;
  }

  // Best set of non-overlapping words inside one run of touching tiles.
  // Ranked by total score, then by number of tiles cleared.
  function bestWordsInRun(run, dict, cfg, minLen) {
    const n = run.length;
    const best = Array(n + 1);
    best[n] = { key: 0, picks: [] };
    for (let i = n - 1; i >= 0; i--) {
      best[i] = best[i + 1];
      for (let j = i + 1; j <= n; j++) {
        const tiles = run.slice(i, j);
        const len = letterLength(tiles);
        if (len > cfg.MAX_WORD_LEN) break;
        if (len < minLen) continue;
        const m = dict.match(tiles.map((t) => t.ch));
        if (!m) continue;
        const score = wordScore(tiles, cfg);
        const key = best[j].key + score * 100 + (j - i);
        if (key > best[i].key) {
          best[i] = { key, picks: [{ start: i, end: j, len, score, ...m }, ...best[j].picks] };
        }
      }
    }
    return best[0].picks;
  }

  // Scans every row of `grid` (array of rows of null | tile) left to right.
  function findWords(grid, dict, cfg, minLen) {
    const found = [];
    grid.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (!row[x]) { x++; continue; }
        const x0 = x;
        while (x < row.length && row[x]) x++;
        const run = row.slice(x0, x);
        for (const p of bestWordsInRun(run, dict, cfg, minLen)) {
          const cells = [];
          for (let k = p.start; k < p.end; k++) cells.push({ x: x0 + k, y });
          found.push({ word: p.word, display: p.display, len: p.len, score: p.score, y, cells });
        }
      }
    });
    return found;
  }

  // Words across every row, plus (when `vertical`) down every column, read top to bottom.
  // Each word gets `dir`; a tile can belong to both an across and a down word.
  function findAllWords(grid, dict, cfg, minLen, vertical) {
    const across = findWords(grid, dict, cfg, minLen).map((w) => ({ ...w, dir: 'across' }));
    if (!vertical) return across;
    const columns = grid[0].map((_, x) => grid.map((row) => row[x]));
    const down = findWords(columns, dict, cfg, minLen).map((w) => {
      const cells = w.cells.map(({ x, y }) => ({ x: y, y: x }));
      return { ...w, dir: 'down', y: cells[0].y, cells };
    });
    return across.concat(down);
  }

  // Letters a falling piece could add to finish a word already on the board, as
  // letter -> weight (longer finished words weigh more). A cell counts only if a piece
  // can land in it: empty, nothing above it, and resting on the floor or a tile.
  const HELPER_LETTERS = 'ABCDEFGHIJKLMNOPRSTUVWY'.split(''); // no Qu, X or Z
  function finishingLetters(grid, dict, minLen, vertical) {
    const rows = grid.length;
    const cols = grid[0].length;
    const top = grid[0].map((_, x) => {
      let y = 0;
      while (y < rows && !grid[y][x]) y++;
      return y;
    });
    const open = (x, y) => x >= 0 && x < cols && y === top[x] - 1;
    const out = {};
    const tryEnd = (tokens, atStart) => {
      for (const ch of HELPER_LETTERS) {
        for (let k = Math.min(tokens.length, 7); k >= 1; k--) {
          const part = atStart ? tokens.slice(0, k) : tokens.slice(-k);
          const word = atStart ? [ch, ...part] : [...part, ch];
          if (word.join('').length < minLen || !dict.match(word)) continue;
          out[ch] = (out[ch] || 0) + k;
          break;
        }
      }
    };

    grid.forEach((row, y) => {
      let x = 0;
      while (x < cols) {
        if (!row[x]) { x++; continue; }
        const x0 = x;
        while (x < cols && row[x]) x++;
        const tokens = row.slice(x0, x).map((t) => t.ch);
        if (open(x, y)) tryEnd(tokens, false);
        if (open(x0 - 1, y)) tryEnd(tokens, true);
      }
    });

    if (vertical) {
      for (let x = 0; x < cols; x++) {
        if (top[x] === 0 || top[x] === rows) continue;
        const tokens = [];
        for (let y = top[x]; y < rows && grid[y][x]; y++) tokens.push(grid[y][x].ch);
        tryEnd(tokens, true);
      }
    }
    return out;
  }

  // Short definitions come from data/definitions.js (WordNet 3.0 plus a hand-written supplement).
  const POS_NAMES = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };
  let defIndex = null;

  // Returns { lemma, pos, gloss } for a word, or null when there's no definition.
  // `lemma` is the base form when it differs (CATS -> cat).
  function lookupDefinition(word) {
    if (!ST.DEF_INDEX || !ST.GLOSSES) return null;
    if (!defIndex) {
      defIndex = new Map();
      for (const entry of ST.DEF_INDEX.split(',')) {
        const [w, i, lemma] = entry.split(':');
        defIndex.set(w, [Number(i), lemma || w]);
      }
    }
    const hit = defIndex.get(word.toLowerCase());
    if (!hit) return null;
    const text = ST.GLOSSES[hit[0]];
    const bar = text.indexOf('|');
    const pos = text.slice(0, bar);
    return { lemma: hit[1], pos: POS_NAMES[pos] || pos, gloss: text.slice(bar + 1) };
  }

  ST.lookupDefinition = lookupDefinition;
  ST.Dictionary = Dictionary;
  ST.letterLength = letterLength;
  ST.lengthMultiplier = lengthMultiplier;
  ST.wordScore = wordScore;
  ST.bestWordsInRun = bestWordsInRun;
  ST.findWords = findWords;
  ST.findAllWords = findAllWords;
  ST.finishingLetters = finishingLetters;

  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

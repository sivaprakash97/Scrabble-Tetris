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

  ST.Dictionary = Dictionary;
  ST.letterLength = letterLength;
  ST.lengthMultiplier = lengthMultiplier;
  ST.wordScore = wordScore;
  ST.bestWordsInRun = bestWordsInRun;
  ST.findWords = findWords;

  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

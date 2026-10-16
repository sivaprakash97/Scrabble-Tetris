// The well: a ROWS x COLS grid of null | tile.
(function (root) {
  const ST = (root.ST = root.ST || {});

  class Board {
    constructor(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      this.grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    }

    inside(x, y) {
      return x >= 0 && x < this.cols && y < this.rows;
    }

    // Cells above the top (y < 0) are allowed while a piece is falling.
    collides(piece, dx = 0, dy = 0, grid = piece.grid) {
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid.length; c++) {
          if (!grid[r][c]) continue;
          const x = piece.x + c + dx;
          const y = piece.y + r + dy;
          if (!this.inside(x, y)) return true;
          if (y >= 0 && this.grid[y][x]) return true;
        }
      }
      return false;
    }

    // Writes the piece into the grid. Returns false if any tile is above the top.
    lock(piece) {
      let ok = true;
      for (const { x, y, tile } of ST.pieceCells(piece)) {
        if (y < 0) ok = false;
        else this.grid[y][x] = tile;
      }
      return ok;
    }

    // Removes the given cells. In each column, everything above a removed
    // cell drops by one, empty cells included, so existing holes stay holes.
    clearCells(cells) {
      const byCol = new Map();
      for (const { x, y } of cells) {
        if (!byCol.has(x)) byCol.set(x, new Set());
        byCol.get(x).add(y);
      }
      for (const [x, ys] of byCol) {
        const col = [];
        for (let y = 0; y < this.rows; y++) if (!ys.has(y)) col.push(this.grid[y][x]);
        while (col.length < this.rows) col.unshift(null);
        for (let y = 0; y < this.rows; y++) this.grid[y][x] = col[y];
      }
    }

    // Vowel ratio among tiles in the top `rows` occupied rows, or null when
    // there are too few tiles to judge. Blanks are ignored.
    vowelShare(rows, minTiles, vowels) {
      const top = this.grid.findIndex((row) => row.some(Boolean));
      if (top < 0) return null;
      let v = 0;
      let n = 0;
      for (let y = top; y < Math.min(this.rows, top + rows); y++) {
        for (const t of this.grid[y]) {
          if (!t || t.ch === '*') continue;
          n++;
          if (vowels.includes(t.ch)) v++;
        }
      }
      return n >= minTiles ? v / n : null;
    }

    isEmpty() {
      return this.grid.every((row) => row.every((t) => !t));
    }
  }

  ST.Board = Board;

  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

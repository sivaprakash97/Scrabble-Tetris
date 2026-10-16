// Tetromino shapes whose cells carry letter tiles.
// A piece is { type, grid, x, y } where grid is an NxN array of null | tile.
// Rotating rotates the grid, so letters travel with their cells.
(function (root) {
  const ST = (root.ST = root.ST || {});

  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  };
  const TYPES = Object.keys(SHAPES);

  // Tried in order after a rotation collides. Negative y is up.
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];

  let nextTileId = 1;
  function makeTile(ch, cfg) {
    return { id: nextTileId++, ch, value: cfg.LETTER_VALUES[ch] || 0 };
  }

  function makePiece(type, letters, cfg) {
    let k = 0;
    const grid = SHAPES[type].map((row) => row.map((v) => (v ? makeTile(letters[k++], cfg) : null)));
    return { type, grid, x: 0, y: 0 };
  }

  function rotateGrid(grid, dir) {
    const n = grid.length;
    const out = Array.from({ length: n }, () => Array(n).fill(null));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (dir > 0) out[r][c] = grid[n - 1 - c][r];
        else out[r][c] = grid[c][n - 1 - r];
      }
    }
    return out;
  }

  // Shifts every letter one step along reading order: ABCD -> DABC.
  function cycleLetters(piece) {
    const slots = [];
    piece.grid.forEach((row, r) => row.forEach((t, c) => t && slots.push([r, c])));
    const tiles = slots.map(([r, c]) => piece.grid[r][c]);
    tiles.unshift(tiles.pop());
    const grid = piece.grid.map((row) => row.slice());
    slots.forEach(([r, c], i) => (grid[r][c] = tiles[i]));
    return { ...piece, grid };
  }

  function cells(piece) {
    const out = [];
    piece.grid.forEach((row, r) =>
      row.forEach((tile, c) => tile && out.push({ x: piece.x + c, y: piece.y + r, tile }))
    );
    return out;
  }

  function topRow(piece) {
    return piece.grid.findIndex((row) => row.some(Boolean));
  }

  ST.SHAPES = SHAPES;
  ST.PIECE_TYPES = TYPES;
  ST.KICKS = KICKS;
  ST.makeTile = makeTile;
  ST.makePiece = makePiece;
  ST.rotateGrid = rotateGrid;
  ST.cycleLetters = cycleLetters;
  ST.pieceCells = cells;
  ST.pieceTopRow = topRow;

  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

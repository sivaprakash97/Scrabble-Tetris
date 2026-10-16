# Scrabble-Tetris
it's a tetris game but instead of tetris blocks, they would be alphabet scrabble pieces. the way to clear a row would be to create a word with those letters as they fall down

## Play

Open `index.html` in a browser. There's no build step and no server needed.

- Spell words **left to right in any row**. Any word of 3 or more letters vanishes, and the tiles above it drop. Drops that spell new words score chain bonuses.
- Letters use Scrabble values, and longer words multiply steeply. See [DESIGN.md](DESIGN.md) for the letter rules and the scoring.

| Key | Action |
|---|---|
| ← → | Move |
| ↑ / X, Z | Rotate clockwise / counter-clockwise (letters rotate with the piece) |
| A | Cycle the letters within the piece |
| ↓ | Soft drop |
| Space | Hard drop |
| C | Hold |
| P | Pause |

On phones, use the touch buttons under the board.

## Develop

```sh
npm test                 # unit tests (Node 22+, no dependencies)
npm run build            # dist/scrabble-tetris.html, a single self-contained page
npm run wordlist         # rebuild data/words.js from ENABLE1
```

| Path | What it holds |
|---|---|
| `src/config.js` | Every tunable number |
| `src/tiles.js` | Letter generation |
| `src/words.js` | Word finding and scoring |
| `src/board.js` | The grid and gravity |
| `src/game.js` | Rules and state |
| `src/ui.js` | Canvas rendering and input |

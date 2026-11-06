# Scrabble-Tetris
it's a tetris game but instead of tetris blocks, they would be alphabet scrabble pieces. the way to clear a row would be to create a word with those letters as they fall down

## Play

This is a **mobile game**, planned for release as a phone app. Open `index.html` on a phone, or in a browser's phone view. There's no build step and no server needed.

- Spell words **left to right in any row**. Any word of 3 or more letters vanishes, and the tiles above it drop. Drops that spell new words score chain bonuses.
- Letters use Scrabble values, and longer words multiply steeply. See [DESIGN.md](DESIGN.md) for the letter rules and the scoring.

The control pad sits under the board:

| Button | Action |
|---|---|
| Hold | Put the piece aside and swap it back later (once per piece) |
| Rotate | Turn the piece clockwise. Its letters turn with it. |
| Pause | Pause or resume |
| Left / Right | Move. Hold to keep moving. |
| Down | Hold to drop faster. The piece locks a moment after it lands. |

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
| `src/ui.js` | Canvas rendering and touch input |

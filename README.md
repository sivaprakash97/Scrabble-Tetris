# Scrabble-Tetris
it's a tetris game but instead of tetris blocks, they would be alphabet scrabble pieces. the way to clear a row would be to create a word with those letters as they fall down

## Play

This is a **mobile game**, planned for release as a phone app. Open `index.html` on a phone, or in a browser's phone view. There's no build step and no server needed.

- Spell words **left to right in any row**. Any everyday English word of 3 or more letters vanishes, and the tiles above it drop. Drops that spell new words score chain bonuses.
- Letters use Scrabble values, and longer words multiply steeply.
- "Words found", below the board, shows each word with a short definition.
- See [DESIGN.md](DESIGN.md) for the letter rules, the dictionary and the scoring.

| Control | Action |
|---|---|
| Left / Right | Move. Hold to keep moving. |
| Down | Hold to drop faster. The piece locks a moment after it lands. |
| Rotate | Turn the piece clockwise. Its letters turn with it. |
| Pause (top right) | Pause or resume |

## Develop

```sh
npm test         # unit tests (Node 22+, no dependencies)
npm run build    # dist/scrabble-tetris.html, a single self-contained page
```

To rebuild the word list and definitions (`data/words.js`, `data/definitions.js`), download the three sources and pass them to the script:

```sh
curl -sSLO https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
curl -sSLO https://downloads.sourceforge.net/wordlist/scowl-2020.12.07.tar.gz
curl -sSLO https://registry.npmjs.org/wndb-with-exceptions/-/wndb-with-exceptions-3.0.2.tgz
npm run wordlist -- enable1.txt scowl-2020.12.07.tar.gz wndb-with-exceptions-3.0.2.tgz
```

Hand-written definitions for words WordNet lacks are in `scripts/supplement-defs.json`.

| Path | What it holds |
|---|---|
| `src/config.js` | Every tunable number |
| `src/tiles.js` | Letter generation |
| `src/words.js` | Word finding, scoring and definition lookup |
| `src/board.js` | The grid and gravity |
| `src/game.js` | Rules and state |
| `src/ui.js` | Canvas rendering and touch input |

## Credits

- **Word list:** ENABLE1 (public domain), filtered with SCOWL by Kevin Atkinson.
- **Definitions:** WordNet 3.0, © 2006 Princeton University.

Full notices are in [data/LICENSES.md](data/LICENSES.md).

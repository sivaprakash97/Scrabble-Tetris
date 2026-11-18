# Alphaboom

A falling-block word game for phones. Pieces of four letter tiles fall into a 10 × 10 well; spell a word across any row and it clears.

Where it started: "it's a tetris game but instead of tetris blocks, they would be alphabet scrabble pieces. the way to clear a row would be to create a word with those letters as they fall down"

## Play

This is a **mobile game**, planned for release as a phone app. Open `index.html` on a phone, or in a browser's phone view. There's no build step and no server needed.

- The board is 10 × 10 tiles.
- Spell words **left to right in any row**. Words reading down a column don't count.
- Any common everyday English word of 3 or more letters vanishes (38,790 words; abbreviation-like words such as EMS or SIS don't count), and every tile drops to fill the gaps below, so buried gaps don't build up. Drops that spell new words score chain bonuses.
- A completely full row also clears, but only words score.
- Letters use Scrabble values, and longer words multiply steeply.
- "Words found", below the board, shows each word with a short definition.
- "How to play" shows four illustrated cards; they open by themselves on a first visit.
- After a game, "Post score" puts it on the scoreboard under a nickname. "My best" keeps your 10 best games on the device.
- After a game, "Copy game log" copies every piece's letters and the final board, so a tricky game can be shared and looked at.
- On the hosted page, every game is also saved automatically for review. This covers each piece's letters, where it went, how long it took and what it spelled. See "Saved sessions" in DESIGN.md.
- See [DESIGN.md](DESIGN.md) for the letter rules, the dictionary, the scoring and the benchmark.

| Control | Action |
|---|---|
| Rotate (red, alone on the left) | Turn the piece clockwise. Its letters turn with it. |
| Left / Right (top row on the right) | Move. Hold to keep moving. |
| Down (wide button under Left and Right) | Hold to drop faster. The piece locks a moment after it lands. |
| Pause (top right) | Pause or resume |
| Speaker (under Pause) | Sound on or off |

## Hosting

The website runs on Vercel and saves games anonymously to Supabase so they can be reviewed. Players can post a finished game to the scoreboard under a nickname; the database side is in `supabase/scoreboard.sql`.

**Sandbox.** Every preview link (each branch gets one) and every local copy is a sandbox: its games and scores go to a separate sandbox board, never the live one, and it shows a yellow "Sandbox" tag. Only the live site uses the live scoreboard. See "Sandbox" in DESIGN.md and `supabase/sandbox.sql`. The project URL and public key live in `src/backend-config.js`. See "Hosting and saving" in [DESIGN.md](DESIGN.md).

## Develop

```sh
npm test             # unit tests (Node 22+, no dependencies)
npm run build:web    # dist/web, the website Vercel serves (pushes to main deploy it)
npm run build        # dist/alphaboom.html, a single self-contained page
npm run benchmark    # a computer player measures how playable the rules are
npm run benchmark -- --keep-gaps --games 20
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
| `src/screens.js` | How to play cards, the scoreboard dialog and the one-time tips |
| `src/sound.js` | Sound effects, made in the browser |
| `src/scores.js` | Talks to the scoreboard functions in Supabase |
| `supabase/scoreboard.sql` | The scoreboard's table and functions |
| `supabase/sandbox.sql` | The sandbox board: what keeps testing off the live scoreboard |
| `src/deploy.js` | Live site or sandbox (the website build fills it in) |

## Credits

- **Word list:** ENABLE1 (public domain), filtered with SCOWL by Kevin Atkinson. Words to leave out by hand go in `scripts/blocklist.txt`, and everyday words to add go in `scripts/allowlist.txt`.
- **Definitions:** WordNet 3.0, © 2006 Princeton University.

Full notices are in [data/LICENSES.md](data/LICENSES.md).

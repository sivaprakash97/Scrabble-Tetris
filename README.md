# Alphaboom

A falling-block word game for phones and laptops. Pieces of four letter tiles fall into a 10 × 10 well; spell a word across any row and it clears.

Where it started: "it's a tetris game but instead of tetris blocks, they would be alphabet scrabble pieces. the way to clear a row would be to create a word with those letters as they fall down"

## Play

Built for phones first, planned for release as a phone app, and it plays on a laptop too. Open `index.html` on a phone, or in a browser on a laptop or desktop (a window 1000 px wide or more gets the wide layout and keyboard controls). There's no build step and no server needed.

- The board is 10 × 10 tiles.
- Spell words **left to right in any row**. Words reading down a column don't count.
- Any common everyday English word of 3 or more letters vanishes (38,790 words; abbreviation-like words such as EMS or SIS don't count), and every tile drops to fill the gaps below, so buried gaps don't build up. Drops that spell new words score chain bonuses.
- A completely full row also clears, but only words score.
- Letters use Scrabble values, and longer words multiply steeply.
- "Words found", below the board, shows each word with a short definition.
- "How to play" shows four illustrated cards; they open by themselves on a first visit.
- After a game, "Post score" is the big button: it puts the game on the scoreboard under a nickname. "Play again" sits under it. "My best" keeps your 10 best games on the device.
- On preview links and local copies, a small "Copy game log" link copies every piece's letters and the final board, so a tricky game can be shared and looked at. The live site doesn't show it: saved games already hold all of that.
- On the hosted page, every game is also saved automatically for review. This covers each piece's letters, where it went, how long it took and what it spelled. See "Saved sessions" in DESIGN.md.
- See [DESIGN.md](DESIGN.md) for the letter rules, the dictionary, the scoring and the benchmark.

| Control | Phone | Keyboard |
|---|---|---|
| Rotate | Red button, alone on the left | Up or W |
| Left / Right | Top row on the right. Hold to keep moving. | Left / Right or A / D. Hold to keep moving. |
| Down | Wide button under Left and Right. Hold to drop faster. | Down or S. Hold to drop faster. |
| Pause or resume | Pause button, top right | P or Esc |
| Sound on or off | Speaker, under Pause | M |
| Start, resume, play again | The big button on the screen (after a game, Play again is under Post score) | Space or Enter |

Rotating turns the piece clockwise and its letters turn with it. A piece locks a moment after it lands. There's no hard drop.

## Hosting

The website runs on Vercel and saves games anonymously to Supabase so they can be reviewed. PostHog counts visits, tutorial use, game starts and game summaries (see "Product analytics" in DESIGN.md). Players can post a finished game to the scoreboard under a nickname; the database side is in `supabase/scoreboard.sql`.

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
| `src/ui.js` | Canvas rendering, touch and keyboard input |
| `src/screens.js` | How to play cards, the scoreboard dialog and the one-time tips |
| `src/sound.js` | Sound effects, made in the browser |
| `src/scores.js` | Talks to the scoreboard functions in Supabase |
| `src/analytics.js` | Product analytics events sent to PostHog |
| `supabase/scoreboard.sql` | The scoreboard's table and functions |
| `supabase/sandbox.sql` | The sandbox board: what keeps testing off the live scoreboard |
| `src/deploy.js` | Live site or sandbox (the website build fills it in) |

## Credits

- **Word list:** ENABLE1 (public domain), filtered with SCOWL by Kevin Atkinson. Words to leave out by hand go in `scripts/blocklist.txt`, and everyday words to add go in `scripts/allowlist.txt`.
- **Definitions:** WordNet 3.0, © 2006 Princeton University.

Full notices are in [data/LICENSES.md](data/LICENSES.md).

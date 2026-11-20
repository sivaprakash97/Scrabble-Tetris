# CLAUDE.md

Guidance for Claude working on **Alphaboom**, a falling-block word game: pieces of four letter tiles fall into a 10 × 10 well, and spelling a word across a row clears it. It started out as "Scrabble-Tetris" (the repo name), and it was renamed Alphaboom so neither trademark shows anywhere players can see it.

- **Live site:** https://alphaboom.vercel.app (Vercel project `alphaboom`; every push to `main` deploys it)
- **Preview links:** every other branch gets `alphaboom-git-<branch>-…vercel.app`. Each one is a **Sandbox**.
- **Rules and reasons:** [DESIGN.md](DESIGN.md) is the source of truth for every rule, number, screen and backend detail, and for *why* each one is the way it is. Read the section for the area you're changing before you change it.
- **History of changes:** [memory.md](memory.md), oldest first.

## How to talk and write

The owner reads everything in plain English. Write that way in chat, commit messages, PR descriptions and docs:
- Use short, everyday sentences about what a player sees and does ("the Leaderboard tab opens first"), not about code ("refactored renderResults").
- Use code names (functions, files, config keys) only where someone needs them to find something.
- Look at the existing commit messages and DESIGN.md for the tone to match.

## Hard rules

1. **No dependencies, no framework, no required build step.** Write plain browser JavaScript and plain CSS. `package.json` has no dependencies and must stay that way. `index.html` has to keep working when opened straight from a file. No modules or bundler: see "How the code fits together".
2. **Phone first.** The game is built for phones and is headed for a phone app. Every change must work and fit on the phone layout: the score strip, the board and the control pad all on one screen, with no scrolling. The wide laptop layout (`min-width: 1000px` with `hover: hover` and `pointer: fine`, at the end of `style.css`) comes second. Touch tablets, including an iPad in landscape, keep the phone layout.
3. **Update the docs in the same commit as the code.** Any change to a rule, a number, the UI, the backend or analytics updates DESIGN.md, and README.md too where it covers the same thing. Then add an entry to **memory.md** (see below).
4. **The Sandbox stays sandboxed.** Only the live site (`ST.DEPLOY.env === 'production'`) may save to the live board, post to the live scoreboard or send PostHog events. Preview links and local copies use the sandbox board and send no analytics. Never weaken this rule. Test any change to saving, scores or analytics on a preview link first.

## Shipping work

- Work on a branch and never push to `main` directly. Open a PR and fill in the description in plain English. **The owner tries the preview link and merges it.** Claude doesn't merge.
- PRs are numbered, and the merge commit title carries the number, e.g. `Results screen after every game (#3)`.
- Before you open a PR, run `npm test`. Once Vercel finishes building, check that the preview link loads and shows the yellow "Sandbox" tag.

## Database changes (Supabase)

The Supabase project `alphaboom` (region ap-south-1, free plan) holds the saved games (`games`) and the scoreboard (`scores`).
- **Write the SQL** in `supabase/` (one file per feature, like `scoreboard.sql`, `sandbox.sql` and `standing.sql`), with a comment at the top saying what it does.
- **Test it on throwaway data first**, e.g. in a temporary table, covering the edge cases (new player, ties, a score of 0, the sandbox board kept separate).
- **Ask the owner before applying anything to the live project.** Apply it with the Supabase tools only after they say yes.
- **Never change a function that live pages already call.** Add a `_v2`, `_v3`, … beside it, as with `save_game_v2` and `post_score_v2`, so pages that are already open keep working.
- **Keep the lockdown.** Row-level security stays on with no policies, there are no table grants for `anon`, and the only way in is a `security definer` function that `anon` may call. Player ids never leave the database: functions return `mine`, not the id.
- **When you read player data, leave test games out** with `where not sandbox`.

## Commands

```sh
npm test                                                  # all unit tests (Node 22+, node:test, no dependencies)
node --test test/words.test.js                            # one test file
node --test --test-name-pattern="chain" test/*.test.js    # tests whose name matches
npm run build:web                                         # dist/web, what Vercel serves
npm run build                                             # dist/alphaboom.html, one self-contained page for the Claude page
npm run benchmark -- --keep-gaps --games 20               # a computer player measures how playable the rules are
npm run wordlist -- <enable1.txt> <scowl.tar.gz> <wndb.tgz>   # rebuild data/words.js and data/definitions.js (README has the download links)
```

There is no linter and no server. To play locally, open `index.html` in a browser. A local copy is a Sandbox. To see the wide layout, make the window at least 1000 px wide.

## How the code fits together

- **One global `ST` namespace, no modules.** Every `src/*.js` file is an IIFE that hangs its parts on `window.ST` (`globalThis.ST` under Node). `index.html` loads them in a fixed order: config, sound, tiles, pieces, words, board, game, `data/words.js`, `data/definitions.js`, deploy, backend-config, sessions, scores, analytics, ui, screens. **A new script must be added to that list in `index.html`.** `scripts/build-web.mjs` publishes whatever `index.html` references, and `scripts/build-artifact.mjs` inlines what sits between the `build:artifact-*` markers. Anything above those markers is website only.
- **Rules files vs browser files.** `config`, `tiles`, `pieces`, `words`, `board` and `game` never touch the page and also export for Node, so they run under the tests: `test/helpers.js` loads exactly those plus `data/`. `sessions.js` and `analytics.js` are tested against a stub `window`. `ui.js`, `screens.js`, `scores.js` and `sound.js` are browser only and have no tests, so check changes to them in a browser, on both layouts.
- **Rules code reads `cfg`**, never a hard-coded number, so the tests and the benchmark can pass different settings. Shelved rules (vertical words, letter cycling) are forced from the config in the `Game` constructor, so an old saved setting can't turn them back on.
- **Game flow.** `Game` (`game.js`) moves through the states `ready → playing ↔ clearing → over`, and it can be paused from playing or clearing. It is seeded with `mulberry32`, so a seed always replays the same game. `TileDirector` (`tiles.js`) picks each piece's letters, `Dictionary` and the scoring live in `words.js`, and `Board` handles the grid and gravity.

## Where things are

| Path | What it holds |
|---|---|
| `src/config.js` | **Every tunable number.** Change numbers here, never inline. |
| `src/game.js` | Rules and state, with no DOM, so it runs under Node |
| `src/board.js`, `src/pieces.js` | The grid, gravity, shapes and rotation |
| `src/tiles.js` | Letter generation (the Tile Director: shuffle bags, vowel quota, helper letters) |
| `src/words.js` | Word finding, scoring and definition lookup |
| `src/ui.js` | Canvas drawing, touch and keyboard input. It holds no game rules. |
| `src/screens.js` | How to play, the results screen, the scoreboard and the first-time tips |
| `src/sound.js` | Sound effects, made with Web Audio (no audio files) |
| `src/sessions.js`, `src/scores.js` | Saving games and talking to the scoreboard (Supabase) |
| `src/analytics.js` | PostHog events, sent from the live site only |
| `src/backend-config.js` | Supabase URL and publishable key, and the PostHog key. Both keys are meant to be public. |
| `src/deploy.js` | Live or sandbox. The checked-in file says `development`, and `scripts/build-web.mjs` stamps the real value at build time. |
| `data/words.js`, `data/definitions.js` | Generated files. Rebuild them with `npm run wordlist` and never edit them by hand. |
| `scripts/blocklist.txt`, `scripts/allowlist.txt` | Words to remove from or add to the dictionary, grouped, with a comment explaining each group |
| `scripts/supplement-defs.json` | Hand-written definitions for words WordNet lacks or gets wrong |
| `supabase/*.sql` | Database tables and functions |
| `test/*.test.js` | Node tests. Rule changes come with a test. |

## Conventions

- **Game logic stays out of the DOM.** Rules go in `game.js`, `board.js`, `tiles.js` and `words.js`, and `ui.js` only draws and forwards input. Keyboard and touch both go through the same `press`/`release`.
- **Browser storage** is only for per-device conveniences, under keys prefixed `alphaboom.` (older `scrabble-tetris.` keys are still read). Wrap every access in try/catch, since the game must work without storage.
- **The look:** a glossy, chunky cartoon toy. Thick `--ink` outlines, a lighter top with a darker lip, a gloss band and a hard ink drop shadow. The fonts are Lilita One and Fredoka. Use line icons and never emoji on buttons. Skip animations when the device asks for reduced motion. Tile colours follow the letter, as in the table in DESIGN.md.
- **Player-facing text** is short and friendly. Write numbers in it from `config.js` values (e.g. the shortest word length, words per level) so the text stays right when the rules change.
- **Dictionary:** use common everyday words only. When a word reads as an abbreviation, a name or Latin, add it to the blocklist. When an everyday word is missing, add it to the allowlist along with its forms. Comment each group.
- **Shelved features stay in the code** behind config flags (`VERTICAL_WORDS`, `CYCLE_LETTERS`), with their history kept in DESIGN.md. Don't delete them.
- **Analytics:** a new event goes in the Events table in DESIGN.md, and gets a test in `test/analytics.test.js`.

## Playtests

The owner's playtests drive most changes. When they report one:
1. Find the game in Supabase (`games`, newest first, `where not sandbox` unless it was played on a preview) and check what they describe against the saved record.
2. Write it up in DESIGN.md as a `## Playtest N` section: the result (pieces, words, score, level), what held the game back, what worked, and the change it led to.
3. Keep in mind that the benchmark bot can't judge how hard the game feels. Only human playtests can.

## memory.md

memory.md keeps a running, dated record, oldest first, of every rule, UI, backend or analytics change. Every change that updates DESIGN.md also adds an entry at the bottom of memory.md, in the same commit. An entry looks like this:

```
## YYYY-MM-DD: Short title (#PR)
- What changed, in plain English.
- Why (playtest, feedback, a number), and the DESIGN.md section it touched.
```

Never rewrite past entries. If a later change undoes one, say so in the new entry.

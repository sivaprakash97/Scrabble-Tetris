# Scrabble-Tetris design

Tetris where every block cell is a Scrabble-style letter tile, and you clear lines by spelling words.
This doc records the rules the prototype uses and why. Every number in it lives in `src/config.js`.

**Platform:** mobile only, for a future phone app. There's no desktop layout and no keyboard controls. On a computer the page shows the phone layout, and the buttons work with a mouse.

## Controls

The control pad under the board is one row of four buttons: Left, Down, Right and Rotate. Pause is a small button in the top-right corner of the score strip.
- Every button uses the same set of line icons, and none of them is an emoji.
- **Down is the only way to drop.** Holding it makes the piece fall fast, and the piece locks 0.5 s after it lands. There's no hard drop.
- Down doesn't carry over: if you keep holding it after a piece locks, the next piece still falls at normal speed until you press Down again.
- There's no Hold and no preview of upcoming pieces. Both were removed in v0.3 because they weren't used, and removing them gave the board more room.

## Core loop

- The 7 classic tetrominoes fall, each carrying 4 letter tiles.
- Rotating a piece rotates its letters with it, so an I-piece flipped 180° reads backwards.
- **Word clear.** When a piece locks, every row is read left to right. Any word of 3 or more letters inside a run of touching tiles disappears. Rows don't need to be full.
- **Vertical words (a Rules switch, on by default).**
  - With "Words read: Across and down", columns are also read top to bottom.
  - A tile can belong to both an across word and a down word, as in a Scrabble crossword. Both words score, and the shared tile clears once.
  - The Words found list tags vertical words "down".
- Within a run, a small dynamic-programming pass chooses the highest-scoring set of words that don't overlap. Ties go to the set that clears more tiles. So `XCATSZ` clears CATS rather than CAT, and `CATDOG` clears both CAT and DOG.
- **Full rows clear, but don't score.** A completely full row clears even if it holds no word. Its tiles fade out grey rather than flashing gold, and it's worth 0 points.
  - Words stay the only way to score.
  - A wave that only clears full rows doesn't advance the chain.
  - This safety valve was added in v0.4. Without it, even a strong player falls behind, because every piece adds 4 tiles and words cleared only about 2.5 of them (see Benchmark).
- **Gravity.** In each column, everything above a cleared cell drops by one, holes included. Holes elsewhere stay holes, as in classic Tetris.
- Tiles that drop can form new words, which starts another **chain wave**. Waves repeat until nothing clears, and then the next piece spawns.
- The game ends when a new piece can't spawn, or a piece locks above the top.

## Letter rules (the Tile Director, `src/tiles.js`)

The aim is randomness that still feels fair.

| Rule | Value | Why |
|---|---|---|
| Two shuffle-bags (vowels, consonants) | Counts per 200 tiles match how often each letter appears in the 3–5 letter everyday words. **Vowels:** A17 E21 O14 I11 U7. **Consonants:** S21 R12 T11 L11 D9 N9 P7 C6 H6 M6 B5 G5 Y5 F4 K4 W4 V2 J1 X1 Z1 Qu1 | A bag refills only when empty, so every letter turns up at its fair rate and long droughts can't happen. This is the same idea as Tetris's 7-bag. |
| Vowels per 4-tile piece | 1 / 2 / 3 at 45% / 50% / 5% | That's about 40% vowels; short everyday words are about 35%. Every piece is spellable. |
| Adaptive nudge | Top 4 rows of the stack: under 35% vowels → +1 vowel; over 60% → −1 | A rubber band against consonant pile-ups. |
| Helper letters | 35% of pieces swap one tile for a letter that would finish a word already on the board | The board can always be fed. See below. |
| Rare letters (J K Qu X Z) | At most 1 per piece, and never in back-to-back pieces | Stops unplayable clumps. |
| Q | Always arrives as one **Qu** tile | Makes Q usable (QUIZ, QUA, QUIT). |
| Blank ✦ | About 5% of pieces; it replaces a consonant, preferring a rare one | A wildcard pressure valve, scoring 0 like a Scrabble blank. A word may contain at most 2 blanks. |

**Why not Scrabble's counts?**
- v0.1–0.3 used them, but Scrabble is a game where you choose where every tile goes. Here a tile lands wherever its piece falls.
- Compared with short everyday words, Scrabble's counts dealt these letters too often: Qu about 6×, J, X and Z about 2×, and I 1.8×.
- They dealt S only a third as often as it's needed. Scrabble keeps S scarce on purpose, but plurals make it the most useful letter here.
- Vowels made up 46% of tiles.
- Letter **values** for scoring are still Scrabble's, so hard letters still pay more.

**Helper letters.** When a piece spawns, `ST.finishingLetters` looks for open word ends a piece could reach:
- **At either end of a run in a row:** the cell must be empty, with nothing above it, resting on the floor or on a tile.
- **On top of a column**, when vertical words are on.

It lists the letters that would finish a word there, giving longer words more weight. Qu, X and Z are never offered. With a 35% chance, the piece swaps one tile for one of those letters, vowel for vowel or consonant for consonant, so the vowel quota holds.

Tests check these rules over 10,000 generated pieces (`test/tiles.test.js`, `test/rules.test.js`).

Letters are picked when a piece spawns, so the adaptive nudge and the helper letters always react to the stack as it is right now.

**Game log.** After a game ends, "Copy game log" copies a text summary:
- every piece's letters, with helper letters marked;
- the words found;
- the final board.

Paste it into a conversation to look at what came up.

## Saved sessions (playtesting)

On the hosted page, every game is saved to the page's own database (`src/sessions.js`), so a session a person played can be reviewed afterwards.

**What's saved, one document per game.** `Game.sessionRecord()` builds it.

The game as a whole:
- the settings and the seed;
- score, level, words and longest chain;
- play time, not counting pauses;
- the number of pauses;
- the final board.

For **every piece**:

| Field | What it records |
|---|---|
| `letters` | The piece's letters |
| `helper` | The helper letter swapped in, if any |
| `offered` | The letters that would have finished a word at that moment |
| `x`, `y`, `rot` | Where it landed and its net rotation |
| `moves`, `rotations` | How many moves and rotations the player made |
| `thinkMs` | Time from spawn to lock |
| `softCells` | Cells soft-dropped |
| `words` | The words it made, with direction, points and chain |
| `junkRows` | Full rows it cleared |
| `board` | The board after everything settled |

**When it's saved:**
- when a game starts;
- every 10 pieces;
- on pause, including leaving the app;
- at game over.

**Where it's saved:** `sessions/<player id>/games/<game id>`, plus `sessions/<player id>` = `{ lastGame, lastPlayedAt }` so players can be listed.

**Who can read and write it.** The database rules let each player write only their own subtree. Only the page's owner and its editors can read everyone's sessions. The Rules panel says this to players.

**Size.** A 100-piece game is about 50 KB. The cap is 256 KB per document; above it, boards are kept for every 5th piece only.

**When nothing is saved.** With no database (a local file, or a signed-out viewer), nothing is saved and the game plays normally.

## Points

- **Letter values are Scrabble's:** A1 B3 C3 D2 E1 F4 G2 H4 I1 J8 K5 L1 M3 N1 O1 P3 Qu10 R1 S1 T1 U1 V4 W4 X8 Y4 Z10, and ✦0.
- **Word score** = (sum of the letter values) × length multiplier × 10.
- **Length multipliers:**

  | Letters | 3 | 4 | 5 | 6 | 7 | 8+ |
  |---|---|---|---|---|---|---|
  | Multiplier | ×1 | ×2 | ×3 | ×5 | ×8 | ×12 |

  A Qu tile counts as 2 letters.
- **Examples:** CAT 50, QUIZ 420, TRAINS 300.
- **Chain:** the n-th wave of a cascade scores ×n.
- **Level:** every word is also multiplied by the level. The level goes up every 10 words, and each level makes pieces fall 15% faster.
- **Drops:** holding Down scores +1 per cell.

## Dictionary: everyday words

Only everyday English words count. Rare words that are legal only in Scrabble don't.
- **The list:** ENABLE1 ∩ SCOWL size 50, with US + UK spellings. That's 58,771 words of 3–12 letters.
  - **ENABLE1** is a public-domain Scrabble-style list. It contributes clean, lowercase entries with no names or abbreviations.
  - **SCOWL** is the list behind standard spell-checkers. Size 50 is its "medium" dictionary, so it filters ENABLE1 down to words people actually use.
- **Why it changed:** v0.1–0.2 used all of ENABLE1 (152k words), which accepted words like OKE (a Turkish unit of weight), PAC (a winter boot) and DOL (a unit of pain).

| Kept | Dropped |
|---|---|
| WOW, ERA, TEEN, AYE, DIE, TORT, HOG, OAT, AXE, QUIZ, QUA, CATS, TRAINS | GAR, TUT, OKE, PAC, DOL, ZAX, EME, ANA, BOXY |

`data/LICENSES.md` holds the licence notices for every source. All of them allow use in a paid app as long as the notices are included.

## Definitions

Each word in "Words found" shows a short definition, so players can see why a word counted.

Every word in the list gets its definition at build time, in this order:
1. **Hand-written supplement** (`scripts/supplement-defs.json`), covering about 150 words.
   - These are function words and interjections that WordNet lacks (THE, AND, SHE, WITH, HEY).
   - It also fixes words WordNet misreads: HIS would otherwise be the plural of "hi", WHO the World Health Organization, and US the United States.
2. **WordNet 3.0 entry for the word itself.** Use the most-used sense. A noun wins when another sense is only slightly more used, so HOG and QUIZ read as nouns.
3. **The base form.** This covers irregular forms from WordNet's exception lists (WENT → go, MICE → mouse) and suffix rules (CATS → cat, BOGGED → bog, CHALKIER → chalky, ADEPTLY → adept). When there are several candidates, the most-used sense wins, so DIES means the verb die, not dice.

Coverage is 97.3% of the list. Every common word is covered, and the gaps are rare inflections such as DIALINGS. A word with no definition shows "Everyday word, no short definition yet."

Glosses are cut at WordNet's example sentences and trimmed to 100 characters. `data/definitions.js` is about 2.5 MB, because each distinct definition text is stored only once.

## Benchmark

`npm run benchmark` has a computer player try every rotation and column for each piece. It places each piece where it clears the most tiles while keeping the stack low, playing 40 seeded games capped at 400 pieces.

Every piece adds 4 tiles, so the game is sustainable only when clearing comes close to 4 tiles per piece.

| Rules | Median pieces | Tiles cleared per piece | Words per game | Games reaching 400 |
|---|---|---|---|---|
| v0.3: Scrabble counts, across only | 99 | 2.39 | 74 | 0/40 |
| v0.4, across only | **400** | 3.68 | 280 | **22/40** |
| v0.4, across and down (default) | 170 | 3.61 | 208 (55% down) | 0/40 |

How much each v0.4 change helped, across only, measured one at a time:

| Change | Median pieces |
|---|---|
| Letters matched to everyday words | 99 → 108 |
| Plus helper letters | 118 |
| Plus full rows clearing | about 350–400 |

**Vertical words on their own** are the biggest boost to word clears. On v0.3 rules they took the median from 99 to 134 pieces and doubled words per game. But with the full-row valve, the computer player does better across only: chasing column words leaves fewer complete rows.

Vertical words stay a switch until people have played both ways. This computer player isn't a human, so treat these numbers as a comparison between rule sets, not a difficulty rating.

A separate random-placement bot finds only about 1.9 words per game, so words don't clear themselves by accident. A 4-letter minimum is a real "hard mode".

## Later-phase ideas

- **Letter cycle.** This would keep the shape and shift each letter one step along the piece (ABCD → DABC).
  - It was tried in v0.1, but it was too easy to confuse with Rotate, because both move letters around. It's shelved for now.
  - The logic is still in the code: `ST.cycleLetters` and `Game.cycle()`, behind `CYCLE_LETTERS` in the config.
  - Before bringing it back, decide how to keep the two visibly separate. One idea: Rotate changes only the shape and the letters always keep their reading order, while Cycle is the only thing that changes letter order. It would also need its own button style and animation.
- Scrabble premium squares (DL / TL / DW / TW) fixed into the well.
- Decide the default for vertical words once people have played both ways.
- Earning a blank by spelling a word of 6+ letters.
- A profanity filter for the word list. SCOWL size 50 still contains some vulgar words.
- An optional "Scrabble expert" mode that accepts the full ENABLE list.
- Sound, daily seeded runs, and a high-score table.

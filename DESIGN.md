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
- Within a run, a small dynamic-programming pass chooses the highest-scoring set of words that don't overlap. Ties go to the set that clears more tiles. So `XCATSZ` clears CATS rather than CAT, and `CATDOG` clears both CAT and DOG.
- **Gravity.** In each column, everything above a cleared cell drops by one, holes included. Holes elsewhere stay holes, as in classic Tetris.
- Tiles that drop can form new words, which starts another **chain wave**. Waves repeat until nothing clears, and then the next piece spawns.
- The game ends when a new piece can't spawn, or a piece locks above the top.
- Only horizontal words count for now. Vertical words are a later phase.

## Letter rules (the Tile Director, `src/tiles.js`)

The aim is randomness that still feels fair.

| Rule | Value | Why |
|---|---|---|
| Two shuffle-bags (vowels, consonants) | Real Scrabble counts: A9 E12 I9 O8 U4 / 56 consonants | A bag refills only when empty, so every letter turns up at its fair rate and long droughts can't happen. This is the same idea as Tetris's 7-bag. |
| Vowels per 4-tile piece | 1 / 2 / 3 at 30% / 55% / 15% | That's about 46% vowels, against 42% in Scrabble and about 38% in English. Every piece is spellable. |
| Adaptive nudge | Top 4 rows of the stack: under 35% vowels → +1 vowel; over 60% → −1 | A rubber band against consonant pile-ups. |
| Rare letters (J K Q X Z) | At most 1 per piece, and never in back-to-back pieces | Stops unplayable clumps. |
| Q | Always arrives as one **Qu** tile | Makes Q usable (QUIZ, QUA, QUIT). |
| Blank ✦ | About 5% of pieces; it replaces a consonant, preferring a rare one | A wildcard pressure valve, scoring 0 like a Scrabble blank. A word may contain at most 2 blanks. |

Tests check these rules over 10,000 generated pieces (`test/tiles.test.js`).

Letters are picked when a piece spawns, so the adaptive nudge always reacts to the stack as it is right now.

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

## Feasibility check

A bot drops pieces at random columns and rotations and soft-drops each one into place. With the everyday list:
- It survives about 20 pieces.
- At minimum length 3, it lucks into about 1.9 words per game, down from 3.1 with the full ENABLE list.
- At minimum length 4, it finds about 0.2 words.

So words don't clear themselves, and aiming matters. A 4-letter minimum is a real "hard mode".

## Later-phase ideas

- **Letter cycle.** This would keep the shape and shift each letter one step along the piece (ABCD → DABC).
  - It was tried in v0.1, but it was too easy to confuse with Rotate, because both move letters around. It's shelved for now.
  - The logic is still in the code: `ST.cycleLetters` and `Game.cycle()`, behind `CYCLE_LETTERS` in the config.
  - Before bringing it back, decide how to keep the two visibly separate. One idea: Rotate changes only the shape and the letters always keep their reading order, while Cycle is the only thing that changes letter order. It would also need its own button style and animation.
- Vertical words (top → bottom).
- Scrabble premium squares (DL / TL / DW / TW) fixed into the well.
- A helper Director that sometimes feeds the one letter that would finish a near-word on the surface.
- Earning a blank by spelling a word of 6+ letters.
- A profanity filter for the word list. SCOWL size 50 still contains some vulgar words.
- An optional "Scrabble expert" mode that accepts the full ENABLE list.
- Sound, daily seeded runs, and a high-score table.

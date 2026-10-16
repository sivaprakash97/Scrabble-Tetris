# Scrabble-Tetris design

Tetris where every block cell is a Scrabble-style letter tile, and you clear lines by spelling words.
This doc records the rules the prototype uses and why. Every number in it lives in `src/config.js`.

## Core loop

- The 7 classic tetrominoes fall, each carrying 4 letter tiles.
- Rotating a piece rotates its letters with it, so an I-piece flipped 180° reads backwards.
- **Cycle letters** (`A`) keeps the shape and shifts every letter one step along the piece's reading order (ABCD → DABC). This is the main tool for spelling on purpose.
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

The preview queue shows the next 3 pieces, so the adaptive nudge acts about 3 pieces late.

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
- **Drops:** soft drop scores +1 per cell and hard drop +2 per cell.

## Feasibility check

`ENABLE1` (152k words of 3–12 letters) is the dictionary.

A bot that drops pieces at random columns and rotations survives about 21 pieces. Along the way it lucks into about 3 words at minimum length 3, and about 0.3 at minimum length 4. So words don't clear themselves, and aiming matters. A 4-letter minimum is a real "hard mode".

## Later-phase ideas

- Vertical words (top → bottom).
- Scrabble premium squares (DL / TL / DW / TW) fixed into the well.
- A helper Director that sometimes feeds the one letter that would finish a near-word on the surface.
- Earning a blank by spelling a word of 6+ letters, plus a limited number of letter cycles per piece.
- A common-word dictionary mode. ENABLE accepts obscure words like EME and ANA.
- A profanity filter for the found-words list.
- Sound, daily seeded runs, and a high-score table.

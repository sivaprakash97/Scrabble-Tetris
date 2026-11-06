# Weighted letter generation

This is how the experiment branch (`experiment/letter-frequency`) decides which letters the falling pieces carry. It replaces the main game's shuffle bags, vowel quota and helper letters with a deliberately simple system:

1. Every tile is drawn **independently** from a table of **weights** based on English letter frequency.
2. A light **recent-letter balancing** step turns uncommon letters down for a while after they've bunched up.

Nothing else steers the letters. The system doesn't look at the board, doesn't guarantee vowels, doesn't add helper letters and doesn't try to make words. The player still gets surprising combinations; they're just fairer on average.

---

## 1. How weighted random selection works

**Weights, not percentages.** Each letter gets a number saying how common it should be relative to the others. E has 12 and Z has 0.1, so E should come up 120 times as often as Z. The numbers don't need to add up to 100.

**From weight to probability.** A letter's probability is its weight divided by the sum of all weights:

```
p(letter) = w(letter) / Σw
```

The table's weights add up to **Σw = 98.9**, so:

| | Calculation | Probability |
|---|---|---|
| E | 12 / 98.9 | 0.1213 (12.13%) |
| T | 9 / 98.9 | 0.0910 (9.10%) |
| B | 1.5 / 98.9 | 0.0152 (1.52%) |
| Z | 0.1 / 98.9 | 0.0010 (0.10%) |

Every probability is between 0 and 1, and together they add up to exactly 1. That's why the weights are "normalised": dividing by the total turns any set of positive numbers into a valid probability distribution.

**Picking a letter: the roulette wheel.** The code never builds the probability table to draw a letter. It uses an equivalent trick:

1. Lay the weights end to end on a line 98.9 units long. E takes the first 12 units, T the next 9, then A takes 8, and so on, with Z the last 0.1 units.
2. Pick a uniformly random point `r` between 0 and 98.9.
3. Walk along the line, and return the letter whose stretch contains `r`.

Because E's stretch is 12 units long, a random point lands in it 12/98.9 of the time, which is exactly `p(E)`.

A worked example, with `r = 30.5`:

| Stretch | Covers | Does r = 30.5 fall inside? |
|---|---|---|
| E | 0 – 12 | no; carry on with 30.5 − 12 = 18.5 |
| T | 12 – 21 | no; carry on with 18.5 − 9 = 9.5 |
| A | 21 – 29 | no; carry on with 9.5 − 8 = 1.5 |
| O | 29 – 37 | yes: 1.5 < 8, so the letter is **O** |

In code (`weightedPick` in `src/letters.js`):

```js
let r = rng() * total;           // uniform in [0, total)
for (const [letter, w] of entries) {
  if (r < w) return letter;      // r fell inside this letter's stretch
  r -= w;                        // measure r from the start of the next stretch
}
```

`rng()` is the game's seeded random number generator (`ST.mulberry32`), so a given seed always gives the same letters, which makes testing repeatable.

**Q.** Q is drawn like any other letter (weight 0.1), but it arrives in the game as the **Qu** tile, so it can actually be used.

## 2. The probability of every letter

| Letter | Weight | Probability | | Letter | Weight | Probability |
|---|---|---|---|---|---|---|
| E | 12 | 12.13% | | M | 2 | 2.02% |
| T | 9 | 9.10% | | W | 2 | 2.02% |
| A | 8 | 8.09% | | F | 2 | 2.02% |
| O | 8 | 8.09% | | G | 2 | 2.02% |
| I | 7 | 7.08% | | Y | 2 | 2.02% |
| N | 7 | 7.08% | | P | 2 | 2.02% |
| S | 6 | 6.07% | | B | 1.5 | 1.52% |
| H | 6 | 6.07% | | V* | 1 | 1.01% |
| R | 6 | 6.07% | | K* | 0.8 | 0.81% |
| D | 4 | 4.04% | | J* | 0.2 | 0.20% |
| L | 4 | 4.04% | | X* | 0.2 | 0.20% |
| C | 3 | 3.03% | | Q* | 0.1 | 0.10% |
| U | 3 | 3.03% | | Z* | 0.1 | 0.10% |

\* These six letters are uncommon (see section 3). Together they're 2.4 / 98.9 = **2.43%** of letters.

**Two numbers that follow from the table:**
- **Vowels** (A E I O U) carry 38 of the 98.9 weight, so they're **38.4%** of letters.
- **A piece with no vowel at all:** each of its 4 tiles is independently a consonant with probability 0.616, so the chance is 0.616⁴ = **14.4%**, about 1 piece in 7. There's no vowel guarantee on this branch, by design.

## 3. Recent-letter balancing

**What it remembers.** The generator keeps the last **5** letters it produced (`RECENT_WINDOW`). The memory runs across pieces, so the last letters of one piece count toward the next.

**Which letters count as uncommon.** Any letter whose weight is **1 or less** (`RARE_MAX_WEIGHT`). With the current table, those are V, K, J, X, Q and Z.

**When it switches on.** When **2 or more** of the remembered letters are uncommon (`RARE_THRESHOLD`), balancing is on for the next draw.

**What it does.** While balancing is on, every uncommon letter's weight is multiplied by **0.3** (`RARE_DAMPING`), and common letters keep their weights. The probabilities are then recalculated in the usual way, by dividing by the new total.

| | Balancing off | Balancing on |
|---|---|---|
| V, K, J, X, Q, Z weights | 1, 0.8, 0.2, 0.2, 0.1, 0.1 (sum 2.4) | 0.3, 0.24, 0.06, 0.06, 0.03, 0.03 (sum 0.72) |
| Total weight | 98.9 | 98.9 − 2.4 + 0.72 = 97.22 |
| p(any uncommon letter) | 2.4 / 98.9 = **2.43%** | 0.72 / 97.22 = **0.74%** |
| p(V) | 1 / 98.9 = 1.01% | 0.3 / 97.22 = 0.31% |
| p(E) | 12 / 98.9 = 12.13% | 12 / 97.22 = 12.34% |

Uncommon letters become about 3.3× less likely. The probability they lose goes to the common letters in proportion to their weights, which is why E rises slightly.

**It never removes randomness.**
- Uncommon letters are never impossible. The damping is clamped to at least 0.01, and an uncommon letter can still come out while balancing is on.
- Balancing switches off by itself as soon as the cluster scrolls out of the 5-letter memory.
- Nothing checks whether the letters can make a word.

## 4. What the simulation shows

`npm run letters` runs the production generator: the same `WeightedLetters.nextLetters(4)` call the game makes for each piece. It makes 10,000 letters (2,500 pieces) with balancing on, then the same with balancing off, then a million letters each way for precision.

**Results with seed 2026, 10,000 letters:**
- **Every letter matches its theoretical probability within random noise.** The biggest gap is E at +0.54 percentage points. With 10,000 draws, a gap of about ±0.5 points is normal for a common letter.
- **Uncommon share:** theory 2.43%, observed 2.60%. That's within the ±0.46% tolerance (3 standard errors), so **as designed**: not too often and not too rare.
- **Pieces with no vowel:** 13.4%, against 14.4% in theory.

**What balancing changes, over 1,000,000 letters:**

| | Balancing off | Balancing on |
|---|---|---|
| Uncommon share | 2.433% | 2.425% |
| 5-letter stretches with 2+ uncommon | 0.562% | 0.545% |
| Longest run of uncommon letters | 4 | 3 |
| Draws with balancing switched on | (n/a) | 0.545% |

**Takeaways:**
- **With these weights, balancing rarely matters.** Uncommon letters are already scarce (2.4%), so two of them inside 5 letters happens in only about 1 stretch in 180. That makes balancing a safety net for unlucky streaks, not something you'll notice in a normal game.
- **What it would take to make it matter.** If you count everything with weight 2 or less as uncommon, that adds B, M, W, F, G, Y and P. Try it with `npm run letters -- --rare-max 2`:

  | | Balancing off | Balancing on |
  |---|---|---|
  | Draws with balancing switched on | (n/a) | 15% |
  | Stretches with 2+ uncommon | 18.5% | 15.0% |
  | Longest uncommon run | 7 | 5 |
  | Uncommon share | 16.1% | 14.5% |

  The share drops below the weights' design. That's a real trade-off: the balancing then shapes the overall mix, not just streaks.

## 5. Which files and functions control it

| File | What's there |
|---|---|
| `src/config.js` → `LETTER_SYSTEM`, `LETTER_GENERATION` | **Every number.** `LETTER_SYSTEM: 'weighted'` switches this system on; `'bags'` goes back to the main game's system. |
| `src/letters.js` | **The algorithm**, with no game or drawing code. See the function list below. |
| `src/game.js` → `reset()`, `newPiece()` | `reset()` builds `WeightedLetters` when `LETTER_SYSTEM` is `'weighted'`. `newPiece()` asks it for 4 letters per piece and hands them to `ST.makePiece()` (`src/pieces.js`), which puts them on the tetromino's cells. |
| `src/ui.js` | Only draws the tiles; it never chooses letters. |
| `scripts/letter-sim.mjs` | The simulation (`npm run letters`). |
| `test/letters.test.js` | Tests for the maths, the balancing, the window, Qu, config-only changes and the game wiring. |

The functions in `src/letters.js`:

| Function | What it does |
|---|---|
| `normaliseWeights(weights)` | Turns weights into probabilities |
| `weightedPick(weights, rng)` | The roulette wheel |
| `isRare(letter)` | Is the letter uncommon (weight ≤ `RARE_MAX_WEIGHT`)? |
| `rareInWindow()` | How many uncommon letters are in the recent window |
| `balancing()` | Is balancing on? |
| `currentWeights()` | The weights the next draw will use (damped or not) |
| `probabilities()` | The next draw's probabilities |
| `nextLetter()` | Draws one letter and remembers it |
| `nextLetters(size)` | One piece's tiles, with Q delivered as `QU` |

All of them belong to `class WeightedLetters`, and the class also keeps counters in `stats`.

## 6. How to change the distribution yourself

Edit `LETTER_GENERATION` in `src/config.js`. You never need to touch the algorithm.

| Setting | What it changes | Example |
|---|---|---|
| `WEIGHTS` | How common each letter is, relative to the others | Raise `S: 6` to `S: 9` for more plurals. Set `Z: 0` to remove Z entirely. |
| `RECENT_WINDOW` | How many recent letters are remembered | 8 catches clusters spread further apart |
| `RARE_MAX_WEIGHT` | Which letters count as uncommon | 2 also includes B M W F G Y P |
| `RARE_THRESHOLD` | How many uncommon letters in the window switch balancing on | 1 reacts to every single uncommon letter |
| `RARE_DAMPING` | How strongly balancing turns uncommon letters down | 0.5 is gentler, 0.1 is stronger, 1 switches balancing off |

**Try before you edit.** The simulation takes the balancing settings as flags, so you can compare without editing anything:

```sh
npm run letters                                  # current settings
npm run letters -- --rare-max 2 --damping 0.5    # what-if
npm run letters -- --letters 100000 --seed 7     # bigger sample, different seed
```

After you change `src/config.js`, run `npm test`. The tests read the same config, so they keep checking that the maths holds. Then run `npm run build` to make the playable page.

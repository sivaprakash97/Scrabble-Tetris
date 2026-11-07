# Weighted letter generation

This is how the experiment branch (`experiment/letter-frequency`) decides which letters the falling pieces carry. It replaces the main game's shuffle bags, vowel quota and helper letters with a deliberately simple system:

1. Every tile is drawn **independently** from a table of **weights** based on English letter frequency.
2. A light **recent-letter balancing** step turns uncommon letters down for a while after they've bunched up.
3. A **vowel floor** makes sure every piece carries at least one vowel. It was added after playtest 6, when 1 piece in 7 had none.

Nothing else steers the letters. The system doesn't look at the board, doesn't add helper letters and doesn't try to make words. The player still gets surprising combinations; they're just fairer on average.

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
- **A piece with no vowel at all:** each of its 4 tiles is independently a consonant with probability 0.616, so the chance is 0.616⁴ = **14.4%**, about 1 piece in 7. The weights alone don't prevent it; the vowel floor (section 4) does.

These are the probabilities **from the weights alone**. The vowel floor moves a little share from consonants to vowels; section 4 works out by how much.

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

## 4. Vowel floor

**Why it's there.** In playtest 6 the weighted game "had barely any vowels", and the main game played better. The saved game agreed:

| | Weighted, no floor (29 pieces) | Main game (37 pieces) |
|---|---|---|
| Vowels among all letters | 36% | 44% |
| Pieces with no vowel | 4 (STNR, SRCR, NTNN, RHNY) | 0 |
| Pieces with at most one vowel | 59% | 43% |

Four pieces out of 29 is 14%: exactly the 0.616⁴ = 14.4% that section 2 predicts. The weights were working as designed; the design just let too many pieces arrive with nothing to build a word around. The main game deals 1–3 vowels to every piece.

**The rule.** Every piece carries at least `VOWEL_FLOOR` vowels (1). Tiles are still drawn one at a time, with the weights and balancing. Before each tile, the generator compares two numbers:
- the vowels the piece still needs (`VOWEL_FLOOR` minus the vowels drawn so far);
- the tiles left to draw.

When they're equal, there's no room left to wait for a vowel by chance, so that tile is drawn from the vowels only. With a floor of 1 and 4 tiles, that means: **if the first 3 letters have no vowel, the 4th is a vowel.**

In code (`nextLetters` in `src/letters.js`):

```js
const force = floor - vowels >= size - i;   // vowels still needed >= tiles left
const letter = this.nextLetter(force);      // force: draw from the vowels only
```

**Which vowel.** The forced draw uses the same roulette wheel with the consonants taken off it (`vowelWeights()`). The vowels keep their weights: E 12, A 8, O 8, I 7, U 3, which sum to 38. So a forced vowel is:
- E 12/38 = 31.6%;
- A and O 21.1% each;
- I 18.4%;
- U 7.9%.

These are the same odds a vowel has when it turns up by chance.

**Where it lands.** The forced vowel is always the last tile drawn, and the game puts tiles on the tetromino's cells in order. So after a forced vowel the piece's tiles are shuffled, and the vowel can land on any cell.

**What doesn't change:**
- A piece that gets its vowel by chance is drawn exactly as before, with no extra random numbers.
- Every letter is still possible; consonants only lose a little share.
- Balancing is unaffected, because no vowel is uncommon.
- If no vowel has any weight (say you set them all to 0), the floor does nothing rather than fail.

**The maths.** Without the floor, a piece's vowel count is binomial: 4 tiles, each a vowel with probability V = 38 / 98.9 = 0.384. The floor turns every count below 1 into 1:

| Vowels in a piece | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Without the floor | 14.4% | 35.9% | 33.6% | 14.0% | 2.2% |
| With the floor | **0%** | **50.3%** | 33.6% | 14.0% | 2.2% |

- **Vowels per piece:** 4V = 1.537 becomes 1.537 + 0.144 = 1.681. Each of the 14.4% of pieces that had none gains exactly one.
- **Vowel share:** 1.681 / 4 = **42.0%**. As a formula, V + (1 − V)⁴ / 4.
- **Each letter's share.** Every vowel's share grows by the same factor, 42.0 / 38.4 = 1.094; for example, E goes from 12.13% to 13.27%. Every consonant's share shrinks by (100 − 42.0) / (100 − 38.4) = 0.942; T goes from 9.10% to 8.57%. Uncommon letters fall from 2.43% to 2.29%.

**Forced isn't the same as rescued.** The floor forces a vowel whenever the first 3 letters are consonants, which is 0.616³ = **23.4%** of pieces. Only 14.4% of pieces are actually rescued. In the other 8.9%, the 4th letter would have been a vowel anyway, with the same odds, so forcing it changes nothing. That's why `stats.forcedVowels` counts more forced tiles than there are rescued pieces.

**Compared with the main game:**

| | Weighted with the floor | Main game |
|---|---|---|
| Vowel share | 42.0% | 40% from its quota; 42–44% in play, because it adds vowels when the stack runs short |
| Pieces with no vowel | 0% | 0% |
| Pieces with exactly one vowel | 50.3% | 45% from its quota; 43% in play |

In 2,000 pieces of scripted play on each version, both dealt 42.0% vowels and no vowel-less piece. The difference left is shape: the weighted game deals more one-vowel pieces (50% against 43%) and more three- and four-vowel ones, while the main game clusters on two.

**Changing it:**
- `VOWEL_FLOOR: 0` turns the floor off; the game is back to the playtest-5 behaviour.
- `VOWEL_FLOOR: 2` gives every piece at least two vowels. That pushes the vowel share to about 55%, which is probably too many.
- Raising the vowel **weights** instead also adds vowels, but it can't rule out a vowel-less piece. For example, A 11, E 15, I 9, O 10, U 4 gives about 45% vowels, and 9% of pieces would still have none.

## 5. What the simulation shows

`npm run letters` runs the production generator: the same `WeightedLetters.nextLetters(4)` call the game makes for each piece. It makes 10,000 letters (2,500 pieces) three ways from the same seed:
- as configured;
- with balancing off;
- with the vowel floor off.

Then it makes a million letters each way for precision. Each letter is compared with its **expected** share with the floor (section 4), not its weights-only share, because the floor moves some share from consonants to vowels.

**Results with seed 2026, 10,000 letters:**
- **Every letter matches its expected share within random noise.** The biggest gap is O at −0.65 percentage points. With 10,000 draws, a gap within about ±0.85 points (3 standard errors) is normal for a common letter.
- **Uncommon share:** expected 2.29%, observed 2.40%. That's within the ±0.45% tolerance (3 standard errors), so **as designed**: not too often and not too rare.
- **Vowel floor:**

  | | With the floor | Without it |
  |---|---|---|
  | Vowel share | 41.8% (theory 42.0%) | 38.6% (theory 38.4%) |
  | Pieces with no vowel | 0.0% (theory 0%) | 13.4% (theory 14.4%) |
  | Pieces with exactly one vowel | 50.1% (theory 50.3%) | 36.2% (theory 35.9%) |
  | Tiles forced by the floor | 582, or 0.233 per piece (theory 0.234) | (n/a) |

**Over 1,000,000 letters:**

| | Balancing off | Balancing on |
|---|---|---|
| Uncommon share | 2.290% | 2.285% (expected 2.285%) |
| 5-letter stretches with 2+ uncommon | 0.474% | 0.463% |
| Longest run of uncommon letters | 4 | 3 |
| Draws with balancing switched on | (n/a) | 0.468% |

- **Vowel share:** 42.047% with the floor, against 42.017% in theory. Without the floor it was 38.426%, against 38.423%.
- **Pieces with no vowel:** 0.000% with the floor. Without it, 14.310%, against 14.378% in theory.

**Takeaways:**
- **The floor does exactly what the maths says.** It adds 3.6 points of vowels, all of them in pieces that would otherwise have had none.
- **With these weights, balancing rarely matters.** Uncommon letters are already scarce (2.3%), so two of them inside 5 letters happens in only about 1 stretch in 200. That makes balancing a safety net for unlucky streaks, not something you'll notice in a normal game.
- **What it would take to make balancing matter.** If you count everything with weight 2 or less as uncommon, that adds B, M, W, F, G, Y and P. Try it with `npm run letters -- --rare-max 2` (1,000,000 letters):

  | | Balancing off | Balancing on |
  |---|---|---|
  | Draws with balancing switched on | (n/a) | 13.6% |
  | Stretches with 2+ uncommon | 16.5% | 13.6% |
  | Longest uncommon run | 6 | 5 |
  | Uncommon share | 15.1% | 13.8% |

  The share drops below the weights' design. That's a real trade-off: balancing then shapes the overall mix, not just streaks. It also nudges vowels up (42.5% instead of 42.0%), because the damped consonants' share goes partly to vowels.

## 6. Which files and functions control it

| File | What's there |
|---|---|
| `src/config.js` → `LETTER_SYSTEM`, `LETTER_GENERATION` | **Every number.** `LETTER_SYSTEM: 'weighted'` switches this system on; `'bags'` goes back to the main game's system. |
| `src/letters.js` | **The algorithm**, with no game or drawing code. See the function list below. |
| `src/game.js` → `reset()`, `newPiece()` | `reset()` builds `WeightedLetters` when `LETTER_SYSTEM` is `'weighted'`. `newPiece()` asks it for 4 letters per piece and hands them to `ST.makePiece()` (`src/pieces.js`), which puts them on the tetromino's cells. |
| `src/ui.js` | Only draws the tiles; it never chooses letters. |
| `scripts/letter-sim.mjs` | The simulation (`npm run letters`). |
| `test/letters.test.js` | Tests for the maths, the balancing, the window, Qu, config-only changes, the vowel floor and the game wiring. |

The functions in `src/letters.js`:

| Function | What it does |
|---|---|
| `normaliseWeights(weights)` | Turns weights into probabilities |
| `weightedPick(weights, rng)` | The roulette wheel |
| `isRare(letter)` | Is the letter uncommon (weight ≤ `RARE_MAX_WEIGHT`)? |
| `isVowel(letter)` | Is the letter one of `VOWELS`? |
| `rareInWindow()` | How many uncommon letters are in the recent window |
| `balancing()` | Is balancing on? |
| `currentWeights()` | The weights the next draw will use (damped or not) |
| `probabilities()` | The next draw's probabilities |
| `vowelWeights()` | The current weights with the consonants removed: the vowel floor's draw |
| `nextLetter(onlyVowels)` | Draws one letter (from the vowels only when `onlyVowels` is true) and remembers it |
| `nextLetters(size)` | One piece's tiles: applies the vowel floor, shuffles after a forced vowel, and delivers Q as `QU` |

All of them belong to `class WeightedLetters`, and the class also keeps counters in `stats`.

## 7. How to change the distribution yourself

Edit `LETTER_GENERATION` in `src/config.js`. You never need to touch the algorithm.

| Setting | What it changes | Example |
|---|---|---|
| `WEIGHTS` | How common each letter is, relative to the others | Raise `S: 6` to `S: 9` for more plurals. Set `Z: 0` to remove Z entirely. |
| `RECENT_WINDOW` | How many recent letters are remembered | 8 catches clusters spread further apart |
| `RARE_MAX_WEIGHT` | Which letters count as uncommon | 2 also includes B M W F G Y P |
| `RARE_THRESHOLD` | How many uncommon letters in the window switch balancing on | 1 reacts to every single uncommon letter |
| `RARE_DAMPING` | How strongly balancing turns uncommon letters down | 0.5 is gentler, 0.1 is stronger, 1 switches balancing off |
| `VOWEL_FLOOR` | The fewest vowels a piece can carry | 0 switches the floor off; 2 gives about 55% vowels |
| `VOWELS` | Which letters count as vowels for the floor | Add `'Y'` to let Y satisfy the floor |

**Try before you edit.** The simulation takes the balancing settings and the vowel floor as flags, so you can compare without editing anything:

```sh
npm run letters                                  # current settings
npm run letters -- --rare-max 2 --damping 0.5    # what-if
npm run letters -- --vowel-floor 0               # without the vowel floor
npm run letters -- --letters 100000 --seed 7     # bigger sample, different seed
```

After you change `src/config.js`, run `npm test`. The tests read the same config, so they keep checking that the maths holds. Then run `npm run build` to make the playable page.

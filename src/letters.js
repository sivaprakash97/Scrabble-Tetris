// Weighted random letter generation: the 'weighted' LETTER_SYSTEM.
//
// Every tile is drawn on its own from a table of weights (English letter frequency, set in
// CONFIG.LETTER_GENERATION). Two light corrections sit on top:
// - Recent-letter balancing: when uncommon letters have just bunched up, their weights are
//   turned down for a while, so runs of V, K, J, X, Q and Z become less likely without ever
//   becoming impossible.
// - Vowel floor: every piece carries at least VOWEL_FLOOR vowels. When the tiles left in a
//   piece equal the vowels it still needs, the next tile is drawn from the vowels only, and
//   the piece's tiles are then shuffled so that vowel can land on any cell.
//
// This module only hands out letters. It knows nothing about the board, words, scoring or
// drawing, so it can be tested and simulated on its own (test/letters.test.js,
// scripts/letter-sim.mjs). The maths is explained in docs/letter-generation.md.
(function (root) {
  const ST = (root.ST = root.ST || {});

  // Relative weights -> probabilities that add up to 1.
  //   p(letter) = w(letter) / (sum of all weights)
  // e.g. E: 12 / 98.9 = 0.1213, about 12.1% of draws.
  function normalise(weights) {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const probabilities = {};
    for (const [letter, w] of Object.entries(weights)) probabilities[letter] = w / total;
    return probabilities;
  }

  // Roulette-wheel selection.
  // Lay the weights end to end on a line whose length is their sum, pick a uniformly random
  // point r on that line, and return the letter whose stretch contains r. A letter with
  // weight 12 owns a stretch 12 units long, so it is landed on 12 times as often as a letter
  // with weight 1. That is exactly p(letter) = w / sum, without computing the probabilities.
  function weightedPick(weights, rng) {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let r = rng() * total; // uniform in [0, total)
    for (const [letter, w] of entries) {
      if (r < w) return letter; // r fell inside this letter's stretch
      r -= w; // move on: measure r from the start of the next stretch
    }
    return entries[entries.length - 1][0]; // only reached through floating-point rounding
  }

  class WeightedLetters {
    // settings: CONFIG.LETTER_GENERATION (WEIGHTS, RECENT_WINDOW, RARE_MAX_WEIGHT,
    //           RARE_THRESHOLD, RARE_DAMPING, VOWEL_FLOOR, VOWELS).
    // rng: a function returning [0, 1).
    constructor(settings, rng = Math.random) {
      this.settings = settings;
      this.rng = rng;
      this.base = { ...settings.WEIGHTS };
      // Never let damping reach 0: a weight of 0 would make a letter impossible, and the
      // design keeps every letter possible at all times.
      this.damping = Math.min(1, Math.max(0.01, settings.RARE_DAMPING));
      this.vowels = new Set(settings.VOWELS || []);
      this.vowelFloor = Math.max(0, Math.floor(settings.VOWEL_FLOOR || 0));
      // The floor can only work if some vowel can be drawn at all (a test table like
      // { B: 1 } has none); without one it does nothing rather than loop or fail.
      this.canForceVowel = [...this.vowels].some((v) => this.base[v] > 0);
      this.recent = []; // the last RECENT_WINDOW letters generated, oldest first
      this.lastHelper = null; // this system never adds helper letters (Game logs this field)
      // draws: letters generated. dampedDraws: draws made while balancing was on.
      // rareDraws: uncommon letters generated. rareWhileDamped: uncommon letters that came
      // out anyway while balancing was on (it lowers their odds, never to zero).
      // forcedVowels: tiles the vowel floor drew from the vowels only.
      this.stats = { draws: 0, dampedDraws: 0, rareDraws: 0, rareWhileDamped: 0, forcedVowels: 0 };
    }

    // Uncommon = base weight at or below RARE_MAX_WEIGHT (V 1, K 0.8, J/X 0.2, Q/Z 0.1).
    isRare(letter) {
      return (this.base[letter] ?? 0) <= this.settings.RARE_MAX_WEIGHT;
    }

    isVowel(letter) {
      return this.vowels.has(letter);
    }

    rareInWindow() {
      return this.recent.filter((letter) => this.isRare(letter)).length;
    }

    // Balancing is on while at least RARE_THRESHOLD of the remembered letters are uncommon.
    balancing() {
      return this.rareInWindow() >= this.settings.RARE_THRESHOLD;
    }

    // The weights the next draw will use. With balancing off they are the base weights.
    // With it on, each uncommon letter's weight is multiplied by RARE_DAMPING and every
    // common letter keeps its weight. Because the probabilities are re-normalised, the
    // share taken away from uncommon letters is spread over the common ones in proportion
    // to their weights.
    currentWeights() {
      if (!this.balancing()) return this.base;
      const adjusted = {};
      for (const [letter, w] of Object.entries(this.base)) {
        adjusted[letter] = this.isRare(letter) ? w * this.damping : w;
      }
      return adjusted;
    }

    // The probability of each letter on the next draw, given what was just generated.
    probabilities() {
      return normalise(this.currentWeights());
    }

    // The current weights with every consonant removed: the vowel floor's draw. Each vowel
    // keeps its weight, so a forced vowel is E 12/38 of the time, A 8/38, O 8/38, I 7/38
    // and U 3/38 with the default table.
    vowelWeights() {
      const weights = {};
      for (const [letter, w] of Object.entries(this.currentWeights())) {
        if (this.isVowel(letter) && w > 0) weights[letter] = w;
      }
      return weights;
    }

    // One letter: pick with the current weights (vowels only when onlyVowels), then
    // remember it.
    nextLetter(onlyVowels = false) {
      const damped = this.balancing();
      const letter = weightedPick(onlyVowels ? this.vowelWeights() : this.currentWeights(), this.rng);
      const rare = this.isRare(letter);
      this.stats.draws++;
      if (damped) this.stats.dampedDraws++;
      if (rare) this.stats.rareDraws++;
      if (rare && damped) this.stats.rareWhileDamped++;
      this.recent.push(letter);
      if (this.recent.length > this.settings.RECENT_WINDOW) this.recent.shift();
      return letter;
    }

    // The tiles for one piece, as game tokens (Q arrives as the game's 'QU' tile).
    // Same signature as TileDirector.nextLetters, so Game can use either system. The vowel
    // share and helper letters that the bag system uses are ignored on purpose.
    //
    // Vowel floor: before each tile, compare the vowels the piece still needs with the tiles
    // left. When they are equal, there is no room left to wait for a vowel by chance, so this
    // tile is drawn from the vowels only. With VOWEL_FLOOR 1 and 4 tiles, that means: if the
    // first 3 letters have no vowel, the 4th is a vowel. A piece that already has its vowels
    // is drawn exactly as without the floor.
    nextLetters(size) {
      const floor = this.canForceVowel ? Math.min(this.vowelFloor, size) : 0;
      const tiles = [];
      let vowels = 0;
      let forced = false;
      for (let i = 0; i < size; i++) {
        const force = floor - vowels >= size - i; // vowels still needed >= tiles left
        const letter = this.nextLetter(force);
        if (force) {
          forced = true;
          this.stats.forcedVowels++;
        }
        if (this.isVowel(letter)) vowels++;
        tiles.push(letter === 'Q' ? 'QU' : letter);
      }
      // A forced vowel is always the last tile drawn; shuffling puts it on any cell.
      if (forced) ST.shuffle(tiles, this.rng);
      return tiles;
    }
  }

  ST.normaliseWeights = normalise;
  ST.weightedPick = weightedPick;
  ST.WeightedLetters = WeightedLetters;

  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

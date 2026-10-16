// Tile Director: decides which letters each falling piece carries.
// Goal: random but fair. No vowel droughts, no clumps of rare letters.
(function (root) {
  const ST = (root.ST = root.ST || {});

  // Small seedable RNG so runs (and tests) can be reproduced.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Draws every item once before refilling, like Tetris's 7-bag.
  class ShuffleBag {
    constructor(counts, rng) {
      this.rng = rng;
      this.template = [];
      for (const [item, n] of Object.entries(counts)) {
        for (let i = 0; i < n; i++) this.template.push(item);
      }
      this.items = [];
    }
    draw() {
      if (this.items.length === 0) this.items = shuffle(this.template.slice(), this.rng);
      return this.items.pop();
    }
    putBack(item) {
      const i = Math.floor(this.rng() * (this.items.length + 1));
      this.items.splice(i, 0, item);
    }
  }

  class TileDirector {
    constructor(cfg, rng) {
      this.cfg = cfg;
      this.rng = rng || Math.random;
      this.vowels = new ShuffleBag(cfg.VOWEL_BAG, this.rng);
      this.consonants = new ShuffleBag(cfg.CONSONANT_BAG, this.rng);
      this.rare = new Set(cfg.RARE);
      this.lastHadRare = false;
    }

    pickVowelCount(vowelShare) {
      const { VOWEL_QUOTA, ADAPTIVE, MIN_VOWELS, MAX_VOWELS } = this.cfg;
      const total = VOWEL_QUOTA.reduce((s, q) => s + q.weight, 0);
      let r = this.rng() * total;
      let count = VOWEL_QUOTA[VOWEL_QUOTA.length - 1].count;
      for (const q of VOWEL_QUOTA) {
        if ((r -= q.weight) < 0) { count = q.count; break; }
      }
      if (vowelShare != null) {
        if (vowelShare < ADAPTIVE.LOW) count++;
        else if (vowelShare > ADAPTIVE.HIGH) count--;
      }
      return Math.max(MIN_VOWELS, Math.min(MAX_VOWELS, count));
    }

    drawConsonant(rareTaken) {
      const blockRare = rareTaken || this.lastHadRare;
      for (let attempt = 0; attempt < 20; attempt++) {
        const c = this.consonants.draw();
        if (!(blockRare && this.rare.has(c))) return c;
        this.consonants.putBack(c);
      }
      const pool = this.cfg.COMMON_FALLBACK;
      return pool[Math.floor(this.rng() * pool.length)];
    }

    // Returns `size` letter tokens ('A'..'Z', 'QU', '*') in random order.
    // `vowelShare` is the vowel ratio near the top of the stack, or null.
    nextLetters(size, vowelShare) {
      const nVowels = Math.min(this.pickVowelCount(vowelShare), size - 1);
      const letters = [];
      for (let i = 0; i < nVowels; i++) letters.push(this.vowels.draw());

      let hasRare = false;
      const consonantIdx = [];
      for (let i = nVowels; i < size; i++) {
        const c = this.drawConsonant(hasRare);
        if (this.rare.has(c)) hasRare = true;
        consonantIdx.push(letters.length);
        letters.push(c);
      }

      if (this.rng() < this.cfg.BLANK_CHANCE) {
        // Prefer replacing a rare consonant so the blank feels like a gift.
        let idx = consonantIdx.find((i) => this.rare.has(letters[i]));
        if (idx === undefined) idx = consonantIdx[Math.floor(this.rng() * consonantIdx.length)];
        if (this.rare.has(letters[idx])) {
          this.consonants.putBack(letters[idx]);
          hasRare = consonantIdx.some((i) => i !== idx && this.rare.has(letters[i]));
        }
        letters[idx] = '*';
      }

      this.lastHadRare = hasRare;
      return shuffle(letters, this.rng);
    }
  }

  ST.mulberry32 = mulberry32;
  ST.shuffle = shuffle;
  ST.ShuffleBag = ShuffleBag;
  ST.TileDirector = TileDirector;

  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

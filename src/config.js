// All tunable numbers live here so we can tweak the feel while playtesting.
(function (root) {
  const ST = (root.ST = root.ST || {});

  ST.CONFIG = {
    COLS: 10,
    ROWS: 20,

    // Scrabble face values. 'QU' is a single tile; '*' is the blank wildcard.
    LETTER_VALUES: {
      A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
      N: 1, O: 1, P: 3, QU: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
      '*': 0,
    },

    // Shuffle-bag contents (real Scrabble tile counts, Q replaced by a Qu tile).
    VOWEL_BAG: { A: 9, E: 12, I: 9, O: 8, U: 4 },
    CONSONANT_BAG: {
      B: 2, C: 2, D: 4, F: 2, G: 3, H: 2, J: 1, K: 1, L: 4, M: 2, N: 6,
      P: 2, QU: 1, R: 6, S: 4, T: 6, V: 2, W: 2, X: 1, Y: 2, Z: 1,
    },
    VOWELS: ['A', 'E', 'I', 'O', 'U'],

    // How many of a piece's 4 tiles are vowels, and how often.
    VOWEL_QUOTA: [
      { count: 1, weight: 30 },
      { count: 2, weight: 55 },
      { count: 3, weight: 15 },
    ],
    MIN_VOWELS: 1,
    MAX_VOWELS: 3,

    // Adaptive nudge: look at the vowel share near the top of the stack.
    ADAPTIVE: { ROWS: 4, MIN_TILES: 6, LOW: 0.35, HIGH: 0.6 },

    // At most one per piece, and never in two pieces back to back.
    RARE: ['J', 'K', 'QU', 'X', 'Z'],
    COMMON_FALLBACK: ['T', 'N', 'S', 'R', 'L', 'D'],

    BLANK_CHANCE: 0.05, // chance a piece swaps one consonant for a blank

    // Words
    MIN_WORD_LEN: 3,
    MAX_WORD_LEN: 12,
    MAX_BLANKS_PER_WORD: 2,

    // Scoring: word = sum(letter values) x LENGTH_MULT x WORD_BASE x chain x level
    WORD_BASE: 10,
    LENGTH_MULT: { 3: 1, 4: 2, 5: 3, 6: 5, 7: 8 }, // 8+ uses LENGTH_MULT_MAX
    LENGTH_MULT_MAX: 12,
    SOFT_DROP_POINTS: 1,
    HARD_DROP_POINTS: 2,
    WORDS_PER_LEVEL: 10,

    // Timing (ms)
    GRAVITY_START: 900,
    GRAVITY_FACTOR: 0.85, // each level multiplies the fall interval by this
    GRAVITY_MIN: 70,
    SOFT_DROP_INTERVAL: 40,
    LOCK_DELAY: 500,
    MAX_LOCK_RESETS: 15,
    CLEAR_FLASH: 420,
    DAS: 160,
    ARR: 45,

    NEXT_COUNT: 3,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

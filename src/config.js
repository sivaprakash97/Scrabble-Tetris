// All tunable numbers live here so we can tweak the feel while playtesting.
(function (root) {
  const ST = (root.ST = root.ST || {});

  ST.CONFIG = {
    COLS: 10,
    ROWS: 10, // halved after playtest 3: at 20 rows the stack rarely passed row 4

    // Scrabble face values. 'QU' is a single tile; '*' is the blank wildcard.
    LETTER_VALUES: {
      A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
      N: 1, O: 1, P: 3, QU: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
      '*': 0,
    },

    // =====================================================================================
    // LETTER GENERATION: which letters the falling pieces carry.
    //
    // 'weighted' (this experiment) draws every tile from LETTER_GENERATION below: English
    //            letter-frequency weights plus recent-letter balancing. See src/letters.js
    //            and docs/letter-generation.md.
    // 'bags'     (the main game, v0.4–0.9) uses the shuffle bags, vowel quota, helper letters
    //            and other safeguards further down, in src/tiles.js.
    // =====================================================================================
    LETTER_SYSTEM: 'weighted',

    LETTER_GENERATION: {
      // Relative weights, not percentages: each letter's chance is its weight divided by the
      // sum of all weights (98.9 for this table). Q is drawn as Q and arrives as a Qu tile.
      WEIGHTS: {
        E: 12, T: 9, A: 8, O: 8, I: 7, N: 7, S: 6, H: 6, R: 6,
        D: 4, L: 4, C: 3, U: 3,
        M: 2, W: 2, F: 2, G: 2, Y: 2, P: 2,
        B: 1.5, V: 1, K: 0.8, J: 0.2, X: 0.2, Q: 0.1, Z: 0.1,
      },
      // How many of the most recently generated letters are remembered (across pieces).
      RECENT_WINDOW: 5,
      // A letter counts as uncommon when its weight is at or below this (V K J X Q Z).
      RARE_MAX_WEIGHT: 1,
      // When this many uncommon letters are among the remembered ones, balancing switches on.
      RARE_THRESHOLD: 2,
      // While balancing is on, every uncommon letter's weight is multiplied by this.
      // 1 turns balancing off; values near 0 almost (never fully) stop uncommon letters.
      RARE_DAMPING: 0.3,
      // Vowel floor (added after playtest 6, when 1 piece in 7 had no vowel): every piece
      // carries at least this many vowels. When the tiles left in a piece equal the vowels
      // it still needs, the next tile is drawn from the vowels' weights only. 0 turns it off.
      VOWEL_FLOOR: 1,
      VOWELS: ['A', 'E', 'I', 'O', 'U'],
    },

    // ---- 'bags' system settings (not used while LETTER_SYSTEM is 'weighted') ----------

    // Shuffle-bag contents per 200 tiles, in proportion to how often each letter appears
    // in the 3-5 letter words of data/words.js. Scrabble's counts suit a game where you
    // place every tile; here they over-supplied Qu, J, X, Z and I and starved S.
    VOWEL_BAG: { A: 17, E: 21, I: 11, O: 14, U: 7 },
    CONSONANT_BAG: {
      B: 5, C: 6, D: 9, F: 4, G: 5, H: 6, J: 1, K: 4, L: 11, M: 6, N: 9,
      P: 7, QU: 1, R: 12, S: 21, T: 11, V: 2, W: 4, X: 1, Y: 5, Z: 1,
    },
    VOWELS: ['A', 'E', 'I', 'O', 'U'],

    // How many of a piece's 4 tiles are vowels, and how often (about 40% vowels overall).
    VOWEL_QUOTA: [
      { count: 1, weight: 45 },
      { count: 2, weight: 50 },
      { count: 3, weight: 5 },
    ],
    MIN_VOWELS: 1,
    MAX_VOWELS: 3,

    // Adaptive nudge: look at the vowel share near the top of the stack.
    ADAPTIVE: { ROWS: 4, MIN_TILES: 6, LOW: 0.35, HIGH: 0.6 },

    // At most one per piece, and never in two pieces back to back.
    RARE: ['J', 'K', 'QU', 'X', 'Z'],
    COMMON_FALLBACK: ['T', 'N', 'S', 'R', 'L', 'D'],

    BLANK_CHANCE: 0.05, // chance a piece swaps one consonant for a blank

    // Chance a piece carries one letter that would finish a word already on the board.
    HELPER_CHANCE: 0.35,

    // After anything clears, every tile drops to fill the gaps below it.
    CLOSE_GAPS: true,

    // Words
    // Also read columns top to bottom. Removed after playtest 2 made the game too easy
    // (48% of words were down words); the code is kept behind this flag.
    VERTICAL_WORDS: false,
    MIN_WORD_LEN: 3,
    MAX_WORD_LEN: 12,
    MAX_BLANKS_PER_WORD: 2,

    // Scoring: word = sum(letter values) x LENGTH_MULT x WORD_BASE x chain x level
    WORD_BASE: 10,
    LENGTH_MULT: { 3: 1, 4: 2, 5: 3, 6: 5, 7: 8 }, // 8+ uses LENGTH_MULT_MAX
    LENGTH_MULT_MAX: 12,
    SOFT_DROP_POINTS: 1,
    WORDS_PER_LEVEL: 10,

    // Shifting letters within a piece (ABCD -> DABC). Saved for a later phase.
    CYCLE_LETTERS: false,

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
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

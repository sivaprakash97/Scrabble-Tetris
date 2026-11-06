// Game rules and state. No DOM here, so it can run under Node tests.
// States: ready -> playing <-> clearing -> ... -> over (paused from playing/clearing).
(function (root) {
  const ST = (root.ST = root.ST || {});

  class Game {
    constructor({ dict, cfg = ST.CONFIG, seed = Date.now(), settings = {} }) {
      this.dict = dict;
      this.cfg = cfg;
      // Shelved rules come from the config, so an older saved setting can't turn them back on.
      this.settings = {
        minLen: cfg.MIN_WORD_LEN,
        ...settings,
        vertical: cfg.VERTICAL_WORDS,
        cycleEnabled: cfg.CYCLE_LETTERS,
      };
      this.reset(seed);
    }

    reset(seed = Date.now()) {
      const cfg = this.cfg;
      this.rng = ST.mulberry32(seed);
      this.board = new ST.Board(cfg.COLS, cfg.ROWS);
      this.director = new ST.TileDirector(cfg, this.rng);
      this.shapes = new ST.ShuffleBag(Object.fromEntries(ST.PIECE_TYPES.map((t) => [t, 1])), this.rng);
      this.current = null;
      this.score = 0;
      this.level = 1;
      this.words = 0;
      this.bestWord = null;
      this.maxChain = 0;
      this.chain = 0;
      this.recent = [];
      this.clearing = null;
      this.events = [];
      this.softDropping = false;
      this.gravityTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.state = 'ready';
      this.pausedFrom = null;
      this.seed = seed;
      this.sessionId = null; // set by the page when it starts saving this game
      this.clock = 0; // ms of play (paused time excluded)
      // What happened this game, piece by piece: for "Copy game log" and saved sessions.
      this.log = { pieces: [], words: [], pauses: 0 };
    }

    // The log entry for the piece in play (or the one that just locked).
    get pieceLog() {
      return this.log.pieces[this.log.pieces.length - 1] || null;
    }

    boardRows() {
      return this.board.grid.map((row) => row.map((t) => (t ? (t.ch === 'QU' ? 'q' : t.ch) : '.')).join(''));
    }

    // ---- piece supply -------------------------------------------------

    // Letters are picked at spawn time, so the vowel nudge and helper letters see the
    // stack as it is right now.
    newPiece() {
      const { ADAPTIVE, VOWELS } = this.cfg;
      const share = this.board.vowelShare(ADAPTIVE.ROWS, ADAPTIVE.MIN_TILES, VOWELS);
      const helpers = ST.finishingLetters(this.board.grid, this.dict, this.settings.minLen, this.settings.vertical);
      const piece = ST.makePiece(this.shapes.draw(), this.director.nextLetters(4, share, helpers), this.cfg);
      const letters = piece.grid.flat().filter(Boolean).map((t) => (t.ch === 'QU' ? 'Qu' : t.ch));
      const offered = Object.entries(helpers).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ch]) => ch).join('');
      this.log.pieces.push({
        n: this.log.pieces.length + 1,
        type: piece.type,
        letters,
        helper: this.director.lastHelper, // the letter swapped in to finish a word, or null
        offered, // letters that would have finished a word, best first
        spawnMs: Math.round(this.clock),
        moves: 0,
        rotations: 0,
        rot: 0, // net quarter turns clockwise from how it spawned
        softCells: 0,
        words: [],
        junkRows: 0,
      });
      return piece;
    }

    spawnNext() {
      const piece = this.newPiece();
      piece.x = Math.floor((this.cfg.COLS - piece.grid.length) / 2);
      piece.y = -ST.pieceTopRow(piece);
      this.current = piece;
      this.gravityTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      // A held Down button doesn't carry over: press it again to speed up the new piece.
      this.softDropping = false;
      if (this.board.collides(piece)) this.gameOver();
    }

    // ---- lifecycle ----------------------------------------------------

    start() {
      if (this.state !== 'ready') return;
      this.state = 'playing';
      this.spawnNext();
    }

    togglePause() {
      if (this.state === 'paused') {
        this.state = this.pausedFrom;
        this.pausedFrom = null;
      } else if (this.state === 'playing' || this.state === 'clearing') {
        this.pausedFrom = this.state;
        this.state = 'paused';
        this.log.pauses++;
        this.events.push({ type: 'pause' });
      }
    }

    gameOver() {
      this.state = 'over';
      this.current = null;
      const rec = this.pieceLog;
      if (rec && !rec.board) rec.board = this.boardRows();
      this.events.push({ type: 'over' });
    }

    gravityInterval() {
      const c = this.cfg;
      return Math.max(c.GRAVITY_MIN, c.GRAVITY_START * Math.pow(c.GRAVITY_FACTOR, this.level - 1));
    }

    update(dt) {
      if (this.state === 'playing' || this.state === 'clearing') this.clock += dt;
      if (this.state === 'clearing') {
        this.clearing.timer -= dt;
        if (this.clearing.timer <= 0) this.finishClear();
        return;
      }
      if (this.state !== 'playing' || !this.current) return;

      const interval = this.softDropping
        ? Math.min(this.cfg.SOFT_DROP_INTERVAL, this.gravityInterval())
        : this.gravityInterval();
      this.gravityTimer += dt;
      while (this.gravityTimer >= interval) {
        this.gravityTimer -= interval;
        if (this.board.collides(this.current, 0, 1)) { this.gravityTimer = 0; break; }
        this.current.y++;
        if (this.softDropping) {
          this.score += this.cfg.SOFT_DROP_POINTS;
          if (this.pieceLog) this.pieceLog.softCells++;
        }
      }

      if (this.board.collides(this.current, 0, 1)) {
        this.lockTimer += dt;
        if (this.lockTimer >= this.cfg.LOCK_DELAY) this.lockPiece();
      } else {
        this.lockTimer = 0;
      }
    }

    // ---- player actions ----------------------------------------------

    canAct() {
      return this.state === 'playing' && this.current;
    }

    // Moving or rotating while grounded buys more time, up to a limit.
    touchedGround() {
      if (this.board.collides(this.current, 0, 1) && this.lockResets < this.cfg.MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }

    move(dx) {
      if (!this.canAct() || this.board.collides(this.current, dx, 0)) return false;
      this.current.x += dx;
      if (this.pieceLog) this.pieceLog.moves++;
      this.touchedGround();
      return true;
    }

    rotate(dir) {
      if (!this.canAct()) return false;
      const grid = ST.rotateGrid(this.current.grid, dir);
      for (const [kx, ky] of ST.KICKS) {
        if (!this.board.collides(this.current, kx, ky, grid)) {
          this.current.grid = grid;
          this.current.x += kx;
          this.current.y += ky;
          const rec = this.pieceLog;
          if (rec) {
            rec.rotations++;
            rec.rot = (rec.rot + dir + 4) % 4;
          }
          this.touchedGround();
          return true;
        }
      }
      return false;
    }

    cycle() {
      if (!this.canAct() || !this.settings.cycleEnabled) return false;
      this.current = ST.cycleLetters(this.current);
      this.touchedGround();
      return true;
    }

    dropDistance() {
      let d = 0;
      while (!this.board.collides(this.current, 0, d + 1)) d++;
      return d;
    }

    // ---- locking, words and chains -----------------------------------

    lockPiece() {
      const rec = this.pieceLog;
      if (rec) {
        Object.assign(rec, { x: this.current.x, y: this.current.y, lockMs: Math.round(this.clock) });
        rec.thinkMs = rec.lockMs - rec.spawnMs;
      }
      const ok = this.board.lock(this.current);
      this.current = null;
      this.events.push({ type: 'lock' });
      if (!ok) return this.gameOver();
      this.chain = 0;
      this.resolveWords();
    }

    // Clears every word on the board (across, and down when that's switched on), plus any
    // completely full row. Full rows score nothing: only words score, and only waves
    // with words count toward the chain.
    resolveWords() {
      const { minLen, vertical } = this.settings;
      const found = ST.findAllWords(this.board.grid, this.dict, this.cfg, minLen, vertical);
      const wordCells = new Map();
      for (const w of found) for (const c of w.cells) wordCells.set(c.x + ',' + c.y, c);
      const junkCells = [];
      let fullRows = 0;
      this.board.grid.forEach((row, y) => {
        if (!row.every(Boolean)) return;
        fullRows++;
        row.forEach((_, x) => { if (!wordCells.has(x + ',' + y)) junkCells.push({ x, y }); });
      });

      const rec = this.pieceLog;
      if (found.length === 0 && junkCells.length === 0) {
        // The piece and everything it set off have settled.
        if (rec && !rec.board) rec.board = this.boardRows();
        this.events.push({ type: 'settled', piece: rec ? rec.n : 0 });
        this.state = 'playing';
        this.spawnNext();
        return;
      }
      if (rec && fullRows && junkCells.length) rec.junkRows += fullRows;

      if (found.length) {
        this.chain++;
        this.maxChain = Math.max(this.maxChain, this.chain);
        const mult = this.chain * this.level;
        let points = 0;
        for (const w of found) {
          w.points = w.score * mult;
          points += w.points;
          if (!this.bestWord || w.points > this.bestWord.points) {
            this.bestWord = { display: w.display, points: w.points };
          }
          this.recent.unshift({ display: w.display, points: w.points, chain: this.chain, dir: w.dir });
          this.log.words.push(`${w.display} ${w.dir} +${w.points}`);
          if (rec) rec.words.push({ word: w.display, dir: w.dir, points: w.points, chain: this.chain });
        }
        this.recent.length = Math.min(this.recent.length, 12);
        this.score += points;
        this.words += found.length;
        this.events.push({ type: 'words', found, chain: this.chain, level: this.level, points });
      }
      if (junkCells.length) this.events.push({ type: 'rows', count: fullRows });

      this.clearing = {
        found,
        cells: [...wordCells.values(), ...junkCells],
        junkCells,
        timer: this.cfg.CLEAR_FLASH,
      };
      this.state = 'clearing';
    }

    finishClear() {
      this.board.clearCells(this.clearing.cells);
      // Close every gap on the board; tiles that land somewhere new can spell the next wave.
      if (this.cfg.CLOSE_GAPS) this.board.compact();
      this.clearing = null;
      const level = 1 + Math.floor(this.words / this.cfg.WORDS_PER_LEVEL);
      if (level > this.level) {
        this.level = level;
        this.events.push({ type: 'level', level });
      }
      this.state = 'playing';
      this.resolveWords();
    }

    // ---- save / restore (keeps a run alive across page updates) ------

    serialize() {
      return {
        grid: this.board.grid.map((row) => row.map((t) => (t ? t.ch : null))),
        score: this.score,
        level: this.level,
        words: this.words,
        bestWord: this.bestWord,
        maxChain: this.maxChain,
        recent: this.recent,
        settings: this.settings,
        state: this.state,
        seed: this.seed,
        clock: this.clock,
        log: this.log,
        sessionId: this.sessionId,
      };
    }

    restore(data) {
      if (!data || !Array.isArray(data.grid)) return false;
      this.board.grid = data.grid.map((row) => row.map((ch) => (ch ? ST.makeTile(ch, this.cfg) : null)));
      Object.assign(this, {
        score: data.score || 0,
        level: data.level || 1,
        words: data.words || 0,
        bestWord: data.bestWord || null,
        maxChain: data.maxChain || 0,
        recent: data.recent || [],
        seed: data.seed || this.seed,
        clock: data.clock || 0,
        log: data.log && Array.isArray(data.log.pieces) ? data.log : this.log,
        sessionId: data.sessionId || null,
      });
      Object.assign(this.settings, data.settings || {}, {
        vertical: this.cfg.VERTICAL_WORDS,
        cycleEnabled: this.cfg.CYCLE_LETTERS,
      });
      if (data.state === 'playing' || data.state === 'clearing' || data.state === 'paused') {
        this.state = 'playing';
        this.spawnNext();
        if (this.state === 'playing') this.togglePause();
      }
      return true;
    }

    // Plain-text summary of this game: settings, every piece's letters, the words found,
    // and the board. [x] marks a helper letter; * is a blank.
    logText() {
      const { minLen, vertical } = this.settings;
      const pieces = this.log.pieces.map((p, i) => {
        let helped = false;
        const letters = p.letters.map((l) => {
          if (!helped && p.helper && l.toUpperCase() === p.helper) { helped = true; return `[${l}]`; }
          return l;
        });
        return `${String(i + 1).padStart(3)}. ${p.type}  ${letters.join(' ')}`;
      });
      const board = this.boardRows();
      return [
        `Scrabble-Tetris game log: score ${this.score}, ${this.words} words, level ${this.level}`,
        `Rules: shortest word ${minLen}, words read ${vertical ? 'across and down' : 'across only'}`,
        '',
        `Pieces (${this.log.pieces.length}, letters in reading order; [x] = helper letter, * = blank, q = Qu):`,
        ...pieces,
        '',
        `Words found (${this.log.words.length}):`,
        ...this.log.words.map((w) => `  ${w}`),
        '',
        'Board at the end (q = Qu):',
        ...board.map((r) => `  ${r}`),
      ].join('\n');
    }

    // Everything worth keeping about this game, as one plain-JSON document, so a session
    // can be reviewed later: every piece's letters, where it went, how long it took,
    // what it spelled, and the board after it settled.
    sessionRecord() {
      const { minLen, vertical } = this.settings;
      return {
        v: 1,
        status: this.state === 'over' ? 'over' : 'in progress',
        seed: this.seed,
        settings: { minLen, vertical, closeGaps: !!this.cfg.CLOSE_GAPS },
        score: this.score,
        level: this.level,
        words: this.words,
        maxChain: this.maxChain,
        bestWord: this.bestWord,
        playMs: Math.round(this.clock),
        pauses: this.log.pauses,
        pieceCount: this.log.pieces.length,
        pieces: this.log.pieces,
        board: this.boardRows(),
      };
    }

    // Debug helper: rows like '..CAT.....' laid onto the bottom of the well.
    // '.' is empty, 'q' is a Qu tile, '*' is a blank.
    setRows(rows) {
      const top = this.cfg.ROWS - rows.length;
      rows.forEach((s, i) => {
        [...s].forEach((ch, x) => {
          const tok = ch === '.' ? null : ch === 'q' ? 'QU' : ch.toUpperCase();
          this.board.grid[top + i][x] = tok ? ST.makeTile(tok, this.cfg) : null;
        });
      });
    }
  }

  ST.Game = Game;

  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

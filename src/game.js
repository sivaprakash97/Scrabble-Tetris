// Game rules and state. No DOM here, so it can run under Node tests.
// States: ready -> playing <-> clearing -> ... -> over (paused from playing/clearing).
(function (root) {
  const ST = (root.ST = root.ST || {});

  class Game {
    constructor({ dict, cfg = ST.CONFIG, seed = Date.now(), settings = {} }) {
      this.dict = dict;
      this.cfg = cfg;
      this.settings = { minLen: cfg.MIN_WORD_LEN, cycleEnabled: true, ...settings };
      this.reset(seed);
    }

    reset(seed = Date.now()) {
      const cfg = this.cfg;
      this.rng = ST.mulberry32(seed);
      this.board = new ST.Board(cfg.COLS, cfg.ROWS);
      this.director = new ST.TileDirector(cfg, this.rng);
      this.shapes = new ST.ShuffleBag(Object.fromEntries(ST.PIECE_TYPES.map((t) => [t, 1])), this.rng);
      this.queue = [];
      this.current = null;
      this.held = null;
      this.holdUsed = false;
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
      this.fillQueue();
    }

    // ---- piece supply -------------------------------------------------

    newPiece() {
      const share = this.board.vowelShare(
        this.cfg.ADAPTIVE.ROWS, this.cfg.ADAPTIVE.MIN_TILES, this.cfg.VOWELS
      );
      return ST.makePiece(this.shapes.draw(), this.director.nextLetters(4, share), this.cfg);
    }

    fillQueue() {
      while (this.queue.length < this.cfg.NEXT_COUNT) this.queue.push(this.newPiece());
    }

    spawn(piece) {
      piece.x = Math.floor((this.cfg.COLS - piece.grid.length) / 2);
      piece.y = -ST.pieceTopRow(piece);
      this.current = piece;
      this.gravityTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      if (this.board.collides(piece)) this.gameOver();
    }

    spawnNext() {
      const piece = this.queue.shift();
      this.fillQueue();
      this.holdUsed = false;
      this.spawn(piece);
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
      }
    }

    gameOver() {
      this.state = 'over';
      this.current = null;
      this.events.push({ type: 'over' });
    }

    gravityInterval() {
      const c = this.cfg;
      return Math.max(c.GRAVITY_MIN, c.GRAVITY_START * Math.pow(c.GRAVITY_FACTOR, this.level - 1));
    }

    update(dt) {
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
        if (this.softDropping) this.score += this.cfg.SOFT_DROP_POINTS;
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

    hardDrop() {
      if (!this.canAct()) return;
      const d = this.dropDistance();
      this.current.y += d;
      this.score += d * this.cfg.HARD_DROP_POINTS;
      this.lockPiece();
    }

    hold() {
      if (!this.canAct() || this.holdUsed) return false;
      const piece = this.current;
      if (this.held) {
        const swap = this.held;
        this.held = piece;
        this.spawn(swap);
      } else {
        this.held = piece;
        this.spawnNext();
      }
      this.holdUsed = true;
      return true;
    }

    // ---- locking, words and chains -----------------------------------

    lockPiece() {
      const ok = this.board.lock(this.current);
      this.current = null;
      this.events.push({ type: 'lock' });
      if (!ok) return this.gameOver();
      this.chain = 0;
      this.resolveWords();
    }

    resolveWords() {
      const found = ST.findWords(this.board.grid, this.dict, this.cfg, this.settings.minLen);
      if (found.length === 0) {
        this.state = 'playing';
        this.spawnNext();
        return;
      }
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
        this.recent.unshift({ display: w.display, points: w.points, chain: this.chain });
      }
      this.recent.length = Math.min(this.recent.length, 12);
      this.score += points;
      this.words += found.length;
      this.events.push({ type: 'words', found, chain: this.chain, level: this.level, points });
      this.clearing = {
        found,
        cells: found.flatMap((w) => w.cells),
        timer: this.cfg.CLEAR_FLASH,
      };
      this.state = 'clearing';
    }

    finishClear() {
      this.board.clearCells(this.clearing.cells);
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
      });
      Object.assign(this.settings, data.settings || {});
      if (data.state === 'playing' || data.state === 'clearing' || data.state === 'paused') {
        this.state = 'playing';
        this.spawnNext();
        if (this.state === 'playing') this.togglePause();
      }
      return true;
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

// Rendering, touch input and HUD for the phone layout. Talks to ST.Game; holds no game rules of its own.
(function () {
  const ST = window.ST;
  const cfg = ST.CONFIG;
  const $ = (id) => document.getElementById(id);
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const COLOR = {
    felt: token('--felt'), feltDeep: token('--felt-deep'), maple: token('--maple'),
    mapleHi: token('--maple-hi'), mapleLo: token('--maple-lo'), ink: token('--ink'),
    accent: token('--accent'), gold: token('--gold'), text: token('--text'), muted: token('--muted'),
    table: token('--table'),
  };
  const TILE_FONT = '"Archivo Black", "Arial Black", Impact, sans-serif';
  const NUM_FONT = '"Archivo", "Helvetica Neue", Arial, sans-serif';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => n.toLocaleString('en-US');

  // Per-viewer conveniences only; the game works without storage.
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('scrabble-tetris.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('scrabble-tetris.' + key, JSON.stringify(value)); } catch {}
    },
  };

  const dict = new ST.Dictionary(ST.WORDS, cfg);
  const game = new ST.Game({ dict, settings: store.get('settings', {}) });
  ST.game = game;

  // ---- canvas setup ---------------------------------------------------

  const boardEl = $('board');
  let bctx;
  let cell = 26;
  const GAP = 12;
  const WELL_PAD = 12; // frame around the board, both sides together

  function setupCanvas(canvas, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // Sizes the board so the score strip, board and control pad fit on one phone screen.
  function fit() {
    const app = $('app');
    const appStyle = getComputedStyle(app);
    const rootStyle = getComputedStyle(document.documentElement);
    const px = (s, prop) => parseFloat(s[prop]) || 0;
    const viewH = window.visualViewport ? window.visualViewport.height : innerHeight;

    const innerW = app.clientWidth - px(appStyle, 'paddingLeft') - px(appStyle, 'paddingRight');
    const byW = (innerW - WELL_PAD) / cfg.COLS;

    const chrome =
      $('top').offsetHeight + $('touch').offsetHeight + 2 * GAP + WELL_PAD +
      px(appStyle, 'paddingTop') + px(rootStyle, 'paddingTop') + px(rootStyle, 'paddingBottom') + 20;
    const byH = (viewH - chrome) / cfg.ROWS;

    cell = Math.max(14, Math.min(40, Math.floor(Math.min(byW, byH))));
    bctx = setupCanvas(boardEl, cell * cfg.COLS, cell * cfg.ROWS);
  }

  // ---- drawing ----------------------------------------------------------

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawStar(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i - Math.PI / 2;
      const rr = i % 2 ? r * 0.38 : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  // The letter (or blank star) of a tile in a w-wide box, in the current fill colour.
  function drawGlyph(ctx, tile, x, y, w, cx) {
    if (tile.ch === '*') {
      ctx.globalAlpha *= 0.55;
      drawStar(ctx, x + w / 2, y + w * 0.47, w * 0.26);
      return;
    }
    const qu = tile.ch === 'QU';
    ctx.font = `${Math.round(w * (qu ? 0.44 : 0.58))}px ${TILE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(qu ? 'Qu' : tile.ch, x + w * cx, y + w * 0.5);
  }

  // A Scrabble-style tile: maple face, bevelled lower edge, letter and value.
  function drawTile(ctx, px, py, s, tile, o = {}) {
    const inset = Math.max(1, s * 0.045);
    const scale = o.scale || 1;
    const w = (s - 2 * inset) * scale;
    const x = px + (s - w) / 2;
    const y = py + (s - w) / 2;
    const r = Math.max(2, w * 0.14);
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;

    // Landing shadow: an outline with the letter inside, so you can read what lands where.
    if (o.ghost) {
      roundRect(ctx, x + 0.5, y + 0.5, w - 1, w - 1, r);
      ctx.strokeStyle = COLOR.maple;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = COLOR.maple;
      drawGlyph(ctx, tile, x, y, w, 0.5);
      ctx.restore();
      return;
    }

    const face = o.flash ? COLOR.gold : COLOR.maple;
    roundRect(ctx, x, y, w, w, r);
    ctx.fillStyle = o.flash ? '#b8862a' : COLOR.mapleLo;
    ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + w);
    g.addColorStop(0, o.flash ? '#fff1b8' : COLOR.mapleHi);
    g.addColorStop(1, face);
    roundRect(ctx, x, y, w, w - Math.max(1.5, w * 0.08), r);
    ctx.fillStyle = g;
    ctx.fill();
    if (o.dim) {
      roundRect(ctx, x, y, w, w, r);
      ctx.fillStyle = COLOR.table;
      ctx.globalAlpha *= 0.55;
      ctx.fill();
      ctx.globalAlpha /= 0.55;
    }

    ctx.fillStyle = COLOR.ink;
    drawGlyph(ctx, tile, x, y, w, 0.46);
    if (tile.ch !== '*' && w >= 14) {
      ctx.font = `700 ${Math.max(7, Math.round(w * 0.22))}px ${NUM_FONT}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(tile.value), x + w - w * 0.08, y + w - w * 0.12);
    }
    ctx.restore();
  }

  const effects = [];

  function renderBoard(now) {
    const ctx = bctx;
    const W = cell * cfg.COLS;
    const H = cell * cfg.ROWS;
    ctx.fillStyle = COLOR.felt;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < cfg.COLS; x++) { ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, H); }
    for (let y = 1; y < cfg.ROWS; y++) { ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(W, y * cell + 0.5); }
    ctx.stroke();

    // Warn when the stack reaches the top four rows.
    const grid = game.board.grid;
    if (grid.slice(0, 4).some((row) => row.some(Boolean))) {
      const g = ctx.createLinearGradient(0, 0, 0, cell * 5);
      g.addColorStop(0, 'rgba(224,87,74,0.35)');
      g.addColorStop(1, 'rgba(224,87,74,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, cell * 5);
    }

    // Word tiles flash gold; tiles cleared only because their row was full fade out grey.
    const flash = new Set();
    const junk = new Set();
    let p = 0;
    if (game.clearing) {
      game.clearing.found.forEach((w) => w.cells.forEach(({ x, y }) => flash.add(x + ',' + y)));
      game.clearing.junkCells.forEach(({ x, y }) => junk.add(x + ',' + y));
      p = 1 - Math.max(0, game.clearing.timer) / cfg.CLEAR_FLASH;
    }

    for (let y = 0; y < cfg.ROWS; y++) {
      for (let x = 0; x < cfg.COLS; x++) {
        const t = grid[y][x];
        if (!t) continue;
        const key = x + ',' + y;
        if (flash.has(key)) {
          const scale = reduceMotion ? 1 : 1 + 0.1 * Math.sin(p * Math.PI);
          drawTile(ctx, x * cell, y * cell, cell, t, { flash: true, scale, alpha: 1 - Math.pow(p, 4) });
        } else if (junk.has(key)) {
          drawTile(ctx, x * cell, y * cell, cell, t, { dim: true, scale: reduceMotion ? 1 : 1 - 0.2 * p, alpha: 1 - p });
        } else {
          drawTile(ctx, x * cell, y * cell, cell, t);
        }
      }
    }

    const cur = game.current;
    if (cur && (game.state === 'playing' || game.state === 'paused')) {
      const d = game.dropDistance();
      for (const { x, y, tile } of ST.pieceCells(cur)) {
        if (d > 0 && y + d >= 0) drawTile(ctx, x * cell, (y + d) * cell, cell, tile, { ghost: true });
      }
      for (const { x, y, tile } of ST.pieceCells(cur)) {
        if (y >= 0) drawTile(ctx, x * cell, y * cell, cell, tile);
      }
    }

    // Floating score text and banners.
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      const t = (now - e.born) / e.life;
      if (t >= 1) { effects.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      if (e.kind === 'banner') {
        const size = Math.round(cell * 1.1);
        ctx.font = `${size}px ${TILE_FONT}`;
        const y = H * 0.38 - (reduceMotion ? 0 : t * cell);
        ctx.lineWidth = 6;
        ctx.strokeStyle = COLOR.ink;
        ctx.strokeText(e.text, W / 2, y);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, W / 2, y);
      } else {
        const y = e.y - (reduceMotion ? 0 : t * cell * 1.6);
        ctx.font = `${Math.round(cell * 0.72)}px ${TILE_FONT}`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = COLOR.ink;
        ctx.strokeText(e.text, e.x, y);
        ctx.fillStyle = COLOR.gold;
        ctx.fillText(e.text, e.x, y);
        ctx.font = `700 ${Math.round(cell * 0.42)}px ${NUM_FONT}`;
        ctx.lineWidth = 4;
        ctx.strokeText(e.sub, e.x, y + cell * 0.62);
        ctx.fillStyle = COLOR.text;
        ctx.fillText(e.sub, e.x, y + cell * 0.62);
      }
      ctx.restore();
    }
  }

  // ---- HUD, overlay and word list --------------------------------------

  const hud = { score: $('score'), level: $('level'), words: $('words'), best: $('best') };
  const shown = {};
  function setText(key, value) {
    if (shown[key] !== value) { shown[key] = value; hud[key].textContent = value; }
  }

  function updateHud() {
    setText('score', fmt(game.score));
    setText('level', String(game.level));
    setText('words', String(game.words));
    setText('best', game.bestWord ? `${game.bestWord.display} · ${fmt(game.bestWord.points)}` : '–');
  }

  const recentEl = $('recent');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  // "cat · noun" and the gloss; the base form only shows when it differs (CATS -> cat).
  function definitionLine(display) {
    const word = display.toLowerCase(); // blanks are shown in lowercase; the filled-in word is what counts
    const d = ST.lookupDefinition(word);
    const p = el('p', 'def');
    if (!d) {
      p.textContent = 'Everyday word, no short definition yet.';
      return p;
    }
    p.append(el('span', 'pos', `${d.lemma !== word ? d.lemma + ' · ' : ''}${d.pos}`), ` ${d.gloss}`);
    return p;
  }

  function renderRecent(freshCount) {
    recentEl.replaceChildren();
    if (game.recent.length === 0) {
      recentEl.append(el('li', 'empty', 'Your words show up here, with what they mean.'));
      return;
    }
    game.recent.forEach((r, i) => {
      const li = el('li', i < freshCount ? 'fresh' : '');
      const row = el('div', 'row');
      row.append(el('span', 'w', r.display));
      if (r.dir === 'down') row.append(el('span', 'tag', 'down'));
      if (r.chain > 1) row.append(el('span', 'chain', `chain ×${r.chain}`));
      row.append(el('span', 'pts', '+' + fmt(r.points)));
      li.append(row, definitionLine(r.display));
      recentEl.append(li);
    });
  }

  const overlay = {
    root: $('overlay'), eyebrow: $('overlay-eyebrow'), title: $('overlay-title'),
    text: $('overlay-text'), primary: $('overlay-primary'), secondary: $('overlay-secondary'),
    log: $('overlay-log'), logText: $('log-text'),
  };
  let overlayState = null;

  function rulesLine() {
    const where = game.settings.vertical
      ? 'left to right in any row, or top to bottom in any column'
      : 'left to right in any row';
    return `Spell words ${where}. Any word of ${game.settings.minLen} or more letters disappears, and every tile drops to fill the gaps below. A full row also clears, but only words score.`;
  }

  function updateOverlay(force) {
    if (!force && overlayState === game.state) return;
    overlayState = game.state;
    const o = overlay;
    o.root.hidden = game.state === 'playing' || game.state === 'clearing';
    o.secondary.hidden = game.state !== 'paused';
    o.log.hidden = game.state !== 'over';
    o.log.textContent = 'Copy game log';
    o.logText.hidden = true;
    if (game.state === 'ready') {
      o.eyebrow.textContent = 'Prototype';
      o.title.textContent = 'Scrabble-Tetris';
      o.text.textContent = rulesLine();
      o.primary.textContent = 'Start';
    } else if (game.state === 'paused') {
      o.eyebrow.textContent = 'Paused';
      o.title.textContent = fmt(game.score);
      o.text.textContent = `${game.words} words so far. ${rulesLine()}`;
      o.primary.textContent = 'Resume';
    } else if (game.state === 'over') {
      const best = Math.max(store.get('best', 0), game.score);
      store.set('best', best);
      o.eyebrow.textContent = 'Game over';
      o.title.textContent = fmt(game.score);
      const bw = game.bestWord ? ` Best word ${game.bestWord.display} for ${fmt(game.bestWord.points)}.` : '';
      const ch = game.maxChain > 1 ? ` Longest chain ×${game.maxChain}.` : '';
      o.text.textContent = `${game.words} words, level ${game.level}.${bw}${ch} Your best score: ${fmt(best)}.`;
      o.primary.textContent = 'Play again';
    }
    showSaveStatus();
  }

  function primaryAction() {
    if (game.state === 'ready') {
      game.start();
      saver.begin(game);
    } else if (game.state === 'paused') game.togglePause();
    else if (game.state === 'over') restart();
  }

  function restart() {
    game.reset();
    effects.length = 0;
    renderRecent(0);
    game.start();
    saver.begin(game);
  }

  // ---- saved sessions ------------------------------------------------------

  const saveStatusEl = $('save-status');
  const historyNoteEl = $('history-note');
  let saveState = 'off';
  const SAVE_TEXT = {
    saving: 'Saving this game for review…',
    saved: 'This game is saved for review.',
    error: 'This game could not be saved.',
  };
  function showSaveStatus() {
    const text = game.state === 'over' && game.sessionId ? SAVE_TEXT[saveState] : null;
    saveStatusEl.hidden = !text;
    if (text) saveStatusEl.textContent = text;
  }
  const saver = ST.createSessionSaver((state) => {
    saveState = state === 'ready' ? saveState : state;
    if (state === 'ready') historyNoteEl.hidden = false;
    showSaveStatus();
  });

  overlay.primary.addEventListener('click', primaryAction);
  overlay.secondary.addEventListener('click', restart);

  // Copies a text summary of the game, so a tricky run can be shared and looked at.
  // If the clipboard is blocked, the text appears in a box to select by hand.
  overlay.log.addEventListener('click', () => {
    const text = game.logText();
    const showBox = () => {
      overlay.logText.value = text;
      overlay.logText.hidden = false;
      overlay.logText.focus();
      overlay.logText.select();
      overlay.log.textContent = 'Select the text below to copy';
    };
    try {
      navigator.clipboard.writeText(text).then(() => { overlay.log.textContent = 'Copied'; }, showBox);
    } catch {
      showBox();
    }
  });

  function drainEvents(now) {
    for (const e of game.events) {
      saver.onEvent(game, e);
      if (e.type === 'words') {
        for (const w of e.found) {
          const xs = w.cells.map((c) => c.x);
          const ys = w.cells.map((c) => c.y);
          const mid = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * cell;
          const cx = Math.min(Math.max(mid, cell * 1.4), cell * (cfg.COLS - 1.4)); // keep text on the board
          const cy = ((Math.min(...ys) + Math.max(...ys)) / 2) * cell;
          effects.push({ kind: 'word', text: '+' + fmt(w.points), sub: w.display, x: cx, y: cy, born: now, life: 1300 });
        }
        if (e.chain > 1) effects.push({ kind: 'banner', text: `CHAIN ×${e.chain}`, color: COLOR.accent, born: now, life: 1200 });
        renderRecent(e.found.length);
      } else if (e.type === 'rows') {
        effects.push({ kind: 'banner', text: e.count > 1 ? `${e.count} ROWS CLEARED` : 'ROW CLEARED', color: COLOR.muted, born: now, life: 1000 });
      } else if (e.type === 'level') {
        effects.push({ kind: 'banner', text: `LEVEL ${e.level}`, color: COLOR.gold, born: now, life: 1400 });
      }
    }
    game.events.length = 0;
  }

  // ---- settings ----------------------------------------------------------

  const minLenEl = $('min-len');
  function syncSettings() {
    minLenEl.value = String(game.settings.minLen);
  }
  minLenEl.addEventListener('change', () => {
    game.settings.minLen = Number(minLenEl.value);
    store.set('settings', { minLen: game.settings.minLen });
    updateOverlay(true);
  });

  // ---- input: the on-screen control pad ------------------------------------

  const held = new Map();
  let lastDir = null;

  function press(action) {
    if (action === 'pause') { game.togglePause(); return; }
    switch (action) {
      case 'left':
      case 'right':
        game.move(action === 'left' ? -1 : 1);
        held.set(action, { t: 0, charged: false });
        lastDir = action;
        break;
      case 'down': game.softDropping = true; break;
      case 'rotate': game.rotate(1); break;
    }
  }

  function release(action) {
    held.delete(action);
    if (action === 'down') game.softDropping = false;
    if (lastDir === action) lastDir = held.has('left') ? 'left' : held.has('right') ? 'right' : null;
  }

  function autoRepeat(dt) {
    if (!lastDir) return;
    const h = held.get(lastDir);
    if (!h) return;
    const dx = lastDir === 'left' ? -1 : 1;
    h.t += dt;
    if (!h.charged) {
      if (h.t < cfg.DAS) return;
      h.charged = true;
      h.t -= cfg.DAS;
      game.move(dx);
    }
    while (h.t >= cfg.ARR) { h.t -= cfg.ARR; game.move(dx); }
  }

  window.addEventListener('blur', () => [...held.keys(), 'down'].forEach(release));
  // Leaving the app pauses the game and saves it right away (the frame loop stops while hidden).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (game.state === 'playing' || game.state === 'clearing') game.togglePause();
    if (game.state === 'paused') saver.save(game);
  });

  for (const btn of document.querySelectorAll('button[data-action]')) {
    const action = btn.dataset.action;
    const up = () => { btn.classList.remove('on'); release(action); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch {}
      btn.classList.add('on');
      press(action);
    });
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---- main loop -----------------------------------------------------------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last);
    last = now;
    autoRepeat(dt);
    game.update(dt);
    drainEvents(now);
    renderBoard(now);
    updateHud();
    updateOverlay(false);
    requestAnimationFrame(frame);
  }

  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; fit(); });
  });

  function boot(data) {
    if (data && data.grid) game.restore(data);
    syncSettings();
    fit();
    renderRecent(0);
    updateOverlay(true);
    requestAnimationFrame(frame);
  }

  // Keeps a run alive when the hosted page is updated while open.
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => game.serialize());
  if (hot && hot.ready) hot.ready(boot);
  else boot(hot && hot.data ? hot.data : {});

  ST.ui = { fit, restart };
})();

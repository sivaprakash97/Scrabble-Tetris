// Rendering, input and HUD. Talks to ST.Game; holds no game rules of its own.
(function () {
  const ST = window.ST;
  const cfg = ST.CONFIG;
  const $ = (id) => document.getElementById(id);
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const COLOR = {
    felt: token('--felt'), feltDeep: token('--felt-deep'), maple: token('--maple'),
    mapleHi: token('--maple-hi'), mapleLo: token('--maple-lo'), ink: token('--ink'),
    accent: token('--accent'), gold: token('--gold'), text: token('--text'),
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
  const holdEl = $('hold');
  const nextEl = $('next');
  let bctx, hctx, nctx;
  let cell = 30;
  let mini = 20;
  const SLOT_PAD = 6;

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

  function slotSize() {
    return { w: 4 * mini + 2 * SLOT_PAD, h: 2 * mini + 2 * SLOT_PAD };
  }

  function fit() {
    const phone = innerWidth < 720;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const reservedW = phone ? 32 + 12 + 80 : 32 + 200 + 240 + 56;
    const reservedH = phone ? 250 : coarse ? 300 : 160;
    const byW = (innerWidth - reservedW) / cfg.COLS;
    const byH = (innerHeight - reservedH) / cfg.ROWS;
    cell = Math.max(14, Math.min(38, Math.floor(Math.min(byW, byH))));
    mini = phone ? 16 : Math.max(16, Math.round(cell * 0.62));
    bctx = setupCanvas(boardEl, cell * cfg.COLS, cell * cfg.ROWS);
    const s = slotSize();
    hctx = setupCanvas(holdEl, s.w, s.h);
    nctx = setupCanvas(nextEl, s.w, s.h * cfg.NEXT_COUNT);
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

    if (o.ghost) {
      roundRect(ctx, x + 0.5, y + 0.5, w - 1, w - 1, r);
      ctx.strokeStyle = COLOR.maple;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.5;
      ctx.stroke();
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

    ctx.fillStyle = COLOR.ink;
    if (tile.ch === '*') {
      ctx.globalAlpha *= 0.55;
      drawStar(ctx, x + w / 2, y + w * 0.47, w * 0.26);
    } else {
      const qu = tile.ch === 'QU';
      ctx.font = `${Math.round(w * (qu ? 0.44 : 0.58))}px ${TILE_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(qu ? 'Qu' : tile.ch, x + w * 0.46, y + w * 0.5);
      if (w >= 14) {
        ctx.font = `700 ${Math.max(7, Math.round(w * 0.22))}px ${NUM_FONT}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(tile.value), x + w - w * 0.08, y + w - w * 0.12);
      }
    }
    ctx.restore();
  }

  // Draws a piece centred in a slot, shrinking tiles if a rotated piece is tall.
  function drawPieceInSlot(ctx, piece, sx, sy, sw, sh, alpha) {
    const cells = [];
    piece.grid.forEach((row, r) => row.forEach((t, c) => t && cells.push({ r, c, t })));
    const minR = Math.min(...cells.map((k) => k.r));
    const minC = Math.min(...cells.map((k) => k.c));
    const bw = Math.max(...cells.map((k) => k.c)) - minC + 1;
    const bh = Math.max(...cells.map((k) => k.r)) - minR + 1;
    const s = Math.min(mini, (sw - 2 * SLOT_PAD) / bw, (sh - 2 * SLOT_PAD) / bh);
    const ox = sx + (sw - bw * s) / 2;
    const oy = sy + (sh - bh * s) / 2;
    for (const k of cells) drawTile(ctx, ox + (k.c - minC) * s, oy + (k.r - minR) * s, s, k.t, { alpha });
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

    const flash = new Set();
    let p = 0;
    if (game.clearing) {
      game.clearing.cells.forEach(({ x, y }) => flash.add(x + ',' + y));
      p = 1 - Math.max(0, game.clearing.timer) / cfg.CLEAR_FLASH;
    }

    for (let y = 0; y < cfg.ROWS; y++) {
      for (let x = 0; x < cfg.COLS; x++) {
        const t = grid[y][x];
        if (!t) continue;
        if (flash.has(x + ',' + y)) {
          const scale = reduceMotion ? 1 : 1 + 0.1 * Math.sin(p * Math.PI);
          drawTile(ctx, x * cell, y * cell, cell, t, { flash: true, scale, alpha: 1 - Math.pow(p, 4) });
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

  function renderSide() {
    const s = slotSize();
    hctx.clearRect(0, 0, s.w, s.h);
    if (game.held) drawPieceInSlot(hctx, game.held, 0, 0, s.w, s.h, game.holdUsed ? 0.45 : 1);
    nctx.clearRect(0, 0, s.w, s.h * cfg.NEXT_COUNT);
    game.queue.forEach((piece, i) => drawPieceInSlot(nctx, piece, 0, i * s.h, s.w, s.h, i === 0 ? 1 : 0.7));
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
  function renderRecent(freshCount) {
    recentEl.replaceChildren();
    if (game.recent.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Your words show up here.';
      recentEl.append(li);
      return;
    }
    game.recent.forEach((r, i) => {
      const li = document.createElement('li');
      if (i < freshCount) li.className = 'fresh';
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = r.display;
      li.append(w);
      if (r.chain > 1) {
        const c = document.createElement('span');
        c.className = 'chain';
        c.textContent = `chain ×${r.chain}`;
        li.append(c);
      }
      const pts = document.createElement('span');
      pts.className = 'pts';
      pts.textContent = '+' + fmt(r.points);
      li.append(pts);
      recentEl.append(li);
    });
  }

  const overlay = {
    root: $('overlay'), eyebrow: $('overlay-eyebrow'), title: $('overlay-title'),
    text: $('overlay-text'), primary: $('overlay-primary'), secondary: $('overlay-secondary'),
  };
  let overlayState = null;

  function rulesLine() {
    return `Spell words left to right in any row. Any word of ${game.settings.minLen} or more letters disappears, and the tiles above it drop. Chains score more.`;
  }

  function updateOverlay(force) {
    if (!force && overlayState === game.state) return;
    overlayState = game.state;
    const o = overlay;
    o.root.hidden = game.state === 'playing' || game.state === 'clearing';
    o.secondary.hidden = game.state !== 'paused';
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
    if (!o.root.hidden) o.primary.focus({ preventScroll: true });
    else if (o.root.contains(document.activeElement)) document.activeElement.blur();
  }

  function primaryAction() {
    if (game.state === 'ready') game.start();
    else if (game.state === 'paused') game.togglePause();
    else if (game.state === 'over') restart();
  }

  function restart() {
    game.reset();
    effects.length = 0;
    renderRecent(0);
    game.start();
  }

  overlay.primary.addEventListener('click', primaryAction);
  overlay.secondary.addEventListener('click', restart);

  function drainEvents(now) {
    for (const e of game.events) {
      if (e.type === 'words') {
        for (const w of e.found) {
          const xs = w.cells.map((c) => c.x);
          const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * cell;
          effects.push({ kind: 'word', text: '+' + fmt(w.points), sub: w.display, x: cx, y: w.y * cell, born: now, life: 1300 });
        }
        if (e.chain > 1) effects.push({ kind: 'banner', text: `CHAIN ×${e.chain}`, color: COLOR.accent, born: now, life: 1200 });
        renderRecent(e.found.length);
      } else if (e.type === 'level') {
        effects.push({ kind: 'banner', text: `LEVEL ${e.level}`, color: COLOR.gold, born: now, life: 1400 });
      }
    }
    game.events.length = 0;
  }

  // ---- settings ----------------------------------------------------------

  const minLenEl = $('min-len');
  const cycleEl = $('cycle-enabled');
  const cycleBtn = document.querySelector('[data-action="cycle"]');
  function syncSettings() {
    minLenEl.value = String(game.settings.minLen);
    cycleEl.checked = game.settings.cycleEnabled;
    cycleBtn.disabled = !game.settings.cycleEnabled;
  }
  minLenEl.addEventListener('change', () => {
    game.settings.minLen = Number(minLenEl.value);
    store.set('settings', game.settings);
    updateOverlay(true);
  });
  cycleEl.addEventListener('change', () => {
    game.settings.cycleEnabled = cycleEl.checked;
    store.set('settings', game.settings);
    syncSettings();
  });

  // ---- input -------------------------------------------------------------

  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate',
    x: 'rotate', X: 'rotate', z: 'rotateCCW', Z: 'rotateCCW', ' ': 'drop',
    c: 'hold', C: 'hold', Shift: 'hold', a: 'cycle', A: 'cycle',
    p: 'pause', P: 'pause', Escape: 'pause', r: 'restart', R: 'restart',
  };
  const held = new Map();
  let lastDir = null;

  function press(action) {
    if (game.state === 'ready' || game.state === 'over') {
      if (action === 'drop') primaryAction();
      return;
    }
    if (action === 'pause') { game.togglePause(); return; }
    if (action === 'restart') { if (game.state === 'paused') restart(); return; }
    switch (action) {
      case 'left':
      case 'right':
        game.move(action === 'left' ? -1 : 1);
        held.set(action, { t: 0, charged: false });
        lastDir = action;
        break;
      case 'down': game.softDropping = true; break;
      case 'rotate': game.rotate(1); break;
      case 'rotateCCW': game.rotate(-1); break;
      case 'cycle': game.cycle(); break;
      case 'drop': game.hardDrop(); break;
      case 'hold': game.hold(); break;
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

  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('select, input')) return;
    // A focused overlay button handles Enter and Space itself.
    if (!overlay.root.hidden && e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    const action = KEYS[e.key];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    press(action);
  });
  window.addEventListener('keyup', (e) => {
    const action = KEYS[e.key];
    if (action) release(action);
  });
  window.addEventListener('blur', () => [...held.keys(), 'down'].forEach(release));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (game.state === 'playing' || game.state === 'clearing')) game.togglePause();
  });

  for (const btn of document.querySelectorAll('.touch [data-action]')) {
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
    renderSide();
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

// Rendering, touch input and HUD for the phone layout. Talks to ST.Game; holds no game rules of its own.
(function () {
  const ST = window.ST;
  const cfg = ST.CONFIG;
  const $ = (id) => document.getElementById(id);
  const css = getComputedStyle(document.documentElement);
  const token = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  // The board is painted to the same recipe as the page (see style.css): thick ink outlines,
  // glossy toy colours, hard drops.
  const INK = token('--ink', '#1b1139');
  const WELL = token('--well', '#22145f');
  const WELL_DEEP = token('--well-deep', '#170c47');
  const TILE_FONT = '"Lilita One", "Arial Rounded MT Bold", "Arial Black", Impact, sans-serif';
  const NUM_FONT = '"Fredoka", "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => n.toLocaleString('en-US');

  // Per-viewer conveniences only; the game works without storage.
  // Keys were 'scrabble-tetris.*' before the game was named Alphaboom; those are still read.
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('alphaboom.' + key) ?? localStorage.getItem('scrabble-tetris.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('alphaboom.' + key, JSON.stringify(value)); } catch {}
    },
  };

  const dict = new ST.Dictionary(ST.WORDS, cfg);
  const game = new ST.Game({ dict, settings: store.get('settings', {}) });
  ST.game = game;

  // ---- canvas setup ---------------------------------------------------

  const boardEl = $('board');
  const wellEl = $('well');
  let bctx;
  let cell = 26;
  let dpr = 1;
  let backdrop = null; // the empty well, painted once per size
  const sprites = new Map(); // painted tiles, by letter and look
  const GAP = 12;

  function setupCanvas(canvas, w, h) {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    return ctx;
  }

  // Sizes the board so the score strip, board and control pad fit on one phone screen.
  function fit() {
    const app = $('app');
    const appStyle = getComputedStyle(app);
    const rootStyle = getComputedStyle(document.documentElement);
    const wellStyle = getComputedStyle(wellEl);
    const px = (s, prop) => parseFloat(s[prop]) || 0;
    const viewH = window.visualViewport ? window.visualViewport.height : innerHeight;

    // The tray around the board: padding and outline on both sides, and the drop under it.
    const frameW = px(wellStyle, 'paddingLeft') + px(wellStyle, 'paddingRight') +
      px(wellStyle, 'borderLeftWidth') + px(wellStyle, 'borderRightWidth');
    const frameH = px(wellStyle, 'paddingTop') + px(wellStyle, 'paddingBottom') +
      px(wellStyle, 'borderTopWidth') + px(wellStyle, 'borderBottomWidth') + px(wellStyle, 'marginBottom');

    const innerW = app.clientWidth - px(appStyle, 'paddingLeft') - px(appStyle, 'paddingRight');
    const byW = (innerW - frameW) / cfg.COLS;

    const chrome =
      $('top').offsetHeight + $('touch').offsetHeight + 2 * GAP + frameH +
      px(appStyle, 'paddingTop') + px(rootStyle, 'paddingTop') + px(rootStyle, 'paddingBottom') + 20;
    const byH = (viewH - chrome) / cfg.ROWS;

    cell = Math.max(14, Math.min(40, Math.floor(Math.min(byW, byH))));
    bctx = setupCanvas(boardEl, cell * cfg.COLS, cell * cfg.ROWS);
    sprites.clear();
    paintBackdrop();
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

  // A star with `points` tips; `inner` is how deep the notches go (0-1).
  function starPath(ctx, cx, cy, r, points, inner, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (Math.PI / points) * i - Math.PI / 2 + rot;
      const rr = i % 2 ? r * inner : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  // The empty well: a deep violet tray with a rounded socket for every cell.
  function paintBackdrop() {
    const W = cell * cfg.COLS;
    const H = cell * cfg.ROWS;
    backdrop = document.createElement('canvas');
    backdrop.width = boardEl.width;
    backdrop.height = boardEl.height;
    const ctx = backdrop.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, WELL_DEEP);
    g.addColorStop(1, WELL);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const pad = Math.max(1, cell * 0.06);
    const r = cell * 0.26;
    for (let y = 0; y < cfg.ROWS; y++) {
      for (let x = 0; x < cfg.COLS; x++) {
        const sx = x * cell + pad;
        const sy = y * cell + pad;
        const s = cell - 2 * pad;
        // A lighter rim below and a dark dish on top of it, so each socket looks pressed in.
        roundRect(ctx, sx, sy + 1.5, s, s, r);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fill();
        roundRect(ctx, sx, sy, s, s, r);
        ctx.fillStyle = WELL_DEEP;
        ctx.fill();
        roundRect(ctx, sx, sy, s, s, r);
        ctx.fillStyle = 'rgba(122,92,255,0.13)';
        ctx.fill();
      }
    }

    // The tray's rim throws a shadow onto the top of the well.
    const shade = ctx.createLinearGradient(0, 0, 0, cell * 0.6);
    shade.addColorStop(0, 'rgba(8,3,36,0.6)');
    shade.addColorStop(1, 'rgba(8,3,36,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, cell * 0.6);
  }

  // Tile colours, as glossy toy blocks: hi (top of the face), face, mid (bottom of the face)
  // and lo (the lip underneath). The colour follows the letter, so nothing extra is saved:
  // vowels are yellow, and consonants go blue, green, pink, purple as their value climbs.
  const SKIN = {
    vowel: { hi: '#fff6b0', face: '#ffd930', mid: '#ffc20f', lo: '#e58a00' },
    one: { hi: '#cdf4ff', face: '#5fd4ff', mid: '#33bbf7', lo: '#1283d0' },
    low: { hi: '#e4ffb5', face: '#a2e845', mid: '#84d326', lo: '#479a10' },
    mid: { hi: '#ffd9ec', face: '#ff93cb', mid: '#ff74ba', lo: '#d63c8a' },
    high: { hi: '#eedfff', face: '#c69eff', mid: '#ad7dfc', lo: '#7741d6' },
    blank: { hi: '#ffffff', face: '#f6f2ff', mid: '#ded7f6', lo: '#a39bcb' },
    flash: { hi: '#fffbe0', face: '#ffe23d', mid: '#ffc400', lo: '#ff8400' }, // part of a word
    dim: { hi: '#d5d1e6', face: '#b4aecd', mid: '#9f99bb', lo: '#6c668d' }, // cleared without scoring
  };

  function skinName(tile) {
    if (tile.ch === '*') return 'blank';
    if (cfg.VOWELS.includes(tile.ch)) return 'vowel';
    if (tile.value <= 1) return 'one';
    if (tile.value <= 3) return 'low';
    if (tile.value <= 5) return 'mid';
    return 'high';
  }

  // The letter of a tile, centred on (cx, cy), in the current fill colour.
  function drawLetter(ctx, tile, cx, cy, w) {
    const qu = tile.ch === 'QU';
    ctx.font = `${Math.round(w * (qu ? 0.47 : 0.66))}px ${TILE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(qu ? 'Qu' : tile.ch, cx, cy);
  }

  // Paints one tile into an s-wide box at the origin. Looks: 'base' (coloured by letter),
  // 'flash', 'dim', and 'ghost' (the landing shadow).
  function paintTile(ctx, s, tile, look) {
    const inset = Math.max(0.5, s * 0.025);
    const w = s - 2 * inset;
    const line = Math.min(4, Math.max(1.25, w * 0.085)); // ink outline
    const R = w * 0.27;
    const lip = Math.max(1.5, w * 0.11);
    const fx = inset + line;
    const fy = inset + line;
    const fw = w - 2 * line; // face width; the face is `lip` shorter than it is wide
    const fh = fw - lip;
    const fr = Math.max(1, R - line);

    // Landing shadow: a dashed outline with the letter inside, so you can read what lands where.
    if (look === 'ghost') {
      const lw = Math.max(1.25, w * 0.06);
      roundRect(ctx, inset + lw / 2, inset + lw / 2, w - lw, w - lw, R);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fill();
      ctx.setLineDash([w * 0.17, w * 0.13]);
      ctx.lineCap = 'round';
      ctx.lineWidth = lw;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      if (tile.ch === '*') { starPath(ctx, s / 2, s / 2, w * 0.24, 4, 0.42); ctx.fill(); }
      else drawLetter(ctx, tile, s / 2, s / 2 + w * 0.02, fw);
      return;
    }

    const skin = SKIN[look === 'base' ? skinName(tile) : look];

    // Ink outline (white-hot while a word flashes), then the darker body whose bottom edge
    // shows as the lip.
    roundRect(ctx, inset, inset, w, w, R);
    ctx.fillStyle = look === 'flash' ? '#ffffff' : INK;
    ctx.fill();
    roundRect(ctx, fx, fy, fw, fw, fr);
    ctx.fillStyle = skin.lo;
    ctx.fill();

    // Face, lighter at the top.
    const g = ctx.createLinearGradient(0, fy, 0, fy + fh);
    g.addColorStop(0, skin.hi);
    g.addColorStop(0.45, skin.face);
    g.addColorStop(1, skin.mid);
    roundRect(ctx, fx, fy, fw, fh, fr);
    ctx.fillStyle = g;
    ctx.fill();

    // Gloss: a soft white dome across the top of the face, and two specks of shine.
    ctx.save();
    roundRect(ctx, fx, fy, fw, fh, fr);
    ctx.clip();
    const gloss = ctx.createLinearGradient(0, fy, 0, fy + fh * 0.48);
    gloss.addColorStop(0, 'rgba(255,255,255,0.6)');
    gloss.addColorStop(1, 'rgba(255,255,255,0.1)');
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.ellipse(fx + fw / 2, fy - fh * 0.04, fw * 0.6, fh * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(fx + fw * 0.2, fy + fh * 0.16, fw * 0.1, fh * 0.052, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx + fw * 0.37, fy + fh * 0.1, fw * 0.035, 0, Math.PI * 2);
    ctx.fill();

    const ink = look === 'dim' ? '#4a4468' : INK;
    if (tile.ch === '*') {
      // A blank: a gold star with its own outline.
      starPath(ctx, fx + fw / 2, fy + fh * 0.52, fw * 0.33, 4, 0.42);
      ctx.lineJoin = 'round';
      ctx.lineWidth = line * 1.7;
      ctx.strokeStyle = ink;
      ctx.stroke();
      ctx.fillStyle = look === 'dim' ? '#cfcbe0' : '#ffc20f';
      ctx.fill();
      return;
    }

    // The letter, pressed into the face: a pale edge just below it, then the ink.
    const cx = fx + fw * (tile.value > 9 ? 0.42 : 0.45);
    const cy = fy + fh * (tile.value > 9 ? 0.47 : 0.51);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    drawLetter(ctx, tile, cx, cy + Math.max(0.75, w * 0.035), fw);
    ctx.fillStyle = ink;
    drawLetter(ctx, tile, cx, cy, fw);
    if (w >= 13) {
      ctx.font = `700 ${Math.max(7, Math.round(fw * (tile.value > 9 ? 0.27 : 0.3)))}px ${NUM_FONT}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(tile.value), fx + fw - fw * 0.07, fy + fh - fh * 0.06);
    }
  }

  // Tiles are painted once per letter and look, then stamped each frame.
  function sprite(tile, look) {
    const key = tile.ch + '|' + look;
    let img = sprites.get(key);
    if (!img) {
      img = document.createElement('canvas');
      img.width = img.height = Math.max(1, Math.round(cell * dpr));
      const ctx = img.getContext('2d');
      ctx.scale(img.width / cell, img.width / cell);
      paintTile(ctx, cell, tile, look);
      sprites.set(key, img);
    }
    return img;
  }

  // Tiles are painted before the web fonts arrive; repaint them once the fonts are in.
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(() => sprites.clear());
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => sprites.clear());
  }

  // Stamps a tile into the cell at (px, py). Options: ghost / flash / dim pick the look;
  // scale, or sx and sy, stretch it; foot keeps its bottom edge planted; alpha fades it.
  function drawTile(ctx, px, py, s, tile, o = {}) {
    const alpha = o.alpha == null ? 1 : o.alpha;
    if (alpha <= 0) return;
    const img = sprite(tile, o.ghost ? 'ghost' : o.flash ? 'flash' : o.dim ? 'dim' : 'base');
    const w = s * (o.sx || o.scale || 1);
    const h = s * (o.sy || o.scale || 1);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, px + (s - w) / 2, o.foot ? py + s - h : py + (s - h) / 2, w, h);
    ctx.globalAlpha = 1;
  }

  // Easing: a drop that bounces to rest, and a pop that overshoots.
  function bounceOut(k) {
    const n = 7.5625;
    const d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  }
  const backOut = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);

  // Outlined cartoon lettering: a fat ink stroke, the same stroke again as a hard drop,
  // and a fill that runs from `top` to `bottom`.
  function chunkyText(ctx, text, x, y, size, font, top, bottom) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.26);
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y + size * 0.12);
    ctx.strokeText(text, x, y);
    const g = ctx.createLinearGradient(0, y - size * 0.42, 0, y + size * 0.38);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillText(text, x, y);
  }

  const effects = []; // floating score text and banners
  const particles = []; // stars and confetti
  const BANNER = {
    chain: ['#ffb3ba', '#ff4b5f'],
    rows: ['#ffffff', '#b9c4f5'],
    level: ['#fff6b0', '#ffc20f'],
  };
  const CONFETTI = ['#ffd930', '#ffffff', '#ff93cb', '#5fd4ff', '#a2e845', '#ff4b5f'];

  // Throws `count` stars or confetti bits out from (x, y). Speeds are in cells per second.
  function burst(now, x, y, count, speed, kind) {
    if (reduceMotion) return;
    for (let i = 0; i < count && particles.length < 160; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (speed * cell / 1000) * (0.4 + Math.random() * 0.8);
      particles.push({
        kind, x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (speed * cell / 1000) * 0.5,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.016,
        size: cell * (0.15 + Math.random() * 0.13),
        color: CONFETTI[(Math.random() * CONFETTI.length) | 0],
        born: now,
        life: 620 + Math.random() * 480,
      });
    }
  }

  function drawParticles(ctx, now, dt) {
    const gravity = (cell * 11) / 1e6; // px per ms, per ms
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const t = (now - p.born) / p.life;
      if (t >= 1) { particles.splice(i, 1); continue; }
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      const grow = t < 0.15 ? t / 0.15 : 1;
      ctx.save();
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(grow, grow);
      if (p.kind === 'star') starPath(ctx, 0, 0, p.size, 5, 0.5);
      else roundRect(ctx, -p.size * 0.6, -p.size * 0.35, p.size * 1.2, p.size * 0.7, p.size * 0.2);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.5, p.size * 0.5);
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    }
  }

  let rowOf = new Map(); // tile id -> the row it was drawn in last frame
  const falls = new Map(); // tile id -> a drop in progress, after a clear closes the gaps
  let landed = null; // the tiles of the piece that just locked, for a quick squash
  let lastPieceIds = [];
  let lastRender = 0;

  function renderBoard(now) {
    const ctx = bctx;
    const W = cell * cfg.COLS;
    const H = cell * cfg.ROWS;
    const dt = Math.min(50, Math.max(0, now - lastRender));
    lastRender = now;
    ctx.globalAlpha = 1;
    ctx.drawImage(backdrop, 0, 0, W, H);

    // Warn when the stack reaches the top fifth of the board (2 rows on a 10-row board).
    const grid = game.board.grid;
    const warnRows = Math.max(2, Math.round(cfg.ROWS / 5));
    if (grid.slice(0, warnRows).some((row) => row.some(Boolean))) {
      const pulse = reduceMotion ? 0.42 : 0.36 + 0.14 * Math.sin(now / 260);
      const g = ctx.createLinearGradient(0, 0, 0, cell * (warnRows + 1));
      g.addColorStop(0, `rgba(255,75,95,${pulse})`);
      g.addColorStop(1, 'rgba(255,75,95,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, cell * (warnRows + 1));
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

    const squash = landed && !reduceMotion ? (now - landed.born) / 200 : 1;
    if (squash >= 1) landed = null;
    const nextRowOf = new Map();
    for (let y = 0; y < cfg.ROWS; y++) {
      for (let x = 0; x < cfg.COLS; x++) {
        const t = grid[y][x];
        if (!t) continue;
        nextRowOf.set(t.id, y);
        const was = rowOf.get(t.id);
        if (was != null && was < y && !reduceMotion) {
          falls.set(t.id, { from: was, born: now, dur: 190 + 55 * Math.min(4, y - was) });
        }
        const key = x + ',' + y;
        if (flash.has(key)) {
          // A quick jump up in size, then the tile shrinks away.
          const scale = reduceMotion ? 1 : 1 + 0.16 * Math.sin(Math.min(1, p * 1.6) * Math.PI) - 0.25 * Math.pow(p, 4);
          drawTile(ctx, x * cell, y * cell, cell, t, { flash: true, scale, alpha: 1 - Math.pow(p, 4) });
        } else if (junk.has(key)) {
          drawTile(ctx, x * cell, y * cell, cell, t, { dim: true, scale: reduceMotion ? 1 : 1 - 0.25 * p, alpha: 1 - p });
        } else {
          let py = y * cell;
          const f = falls.get(t.id);
          if (f) {
            const k = (now - f.born) / f.dur;
            if (k >= 1) falls.delete(t.id);
            else py += (f.from - y) * cell * (1 - bounceOut(k));
          }
          if (landed && landed.ids.has(t.id)) {
            const q = Math.sin(squash * Math.PI) * 0.14;
            drawTile(ctx, x * cell, py, cell, t, { sx: 1 + q * 0.45, sy: 1 - q, foot: true });
          } else {
            drawTile(ctx, x * cell, py, cell, t);
          }
        }
      }
    }
    rowOf = nextRowOf;
    for (const id of falls.keys()) if (!rowOf.has(id)) falls.delete(id);

    const cur = game.current;
    if (cur && (game.state === 'playing' || game.state === 'paused')) {
      const cells = ST.pieceCells(cur);
      const d = game.dropDistance();
      for (const { x, y, tile } of cells) {
        if (d > 0 && y + d >= 0) drawTile(ctx, x * cell, (y + d) * cell, cell, tile, { ghost: true });
      }
      // The falling piece floats above the well: a soft shadow sits under it.
      ctx.fillStyle = 'rgba(8,3,36,0.4)';
      for (const { x, y } of cells) {
        if (y < 0) continue;
        roundRect(ctx, x * cell + cell * 0.04, y * cell + cell * 0.16, cell * 0.92, cell * 0.92, cell * 0.26);
        ctx.fill();
      }
      for (const { x, y, tile } of cells) {
        if (y >= 0) drawTile(ctx, x * cell, y * cell, cell, tile);
      }
    }

    drawParticles(ctx, now, dt);

    // Floating score text and banners.
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      const t = (now - e.born) / e.life;
      if (t >= 1) { effects.splice(i, 1); continue; }
      const pop = reduceMotion ? 1 : t < 0.14 ? 0.35 + 0.65 * backOut(t / 0.14) : 1;
      ctx.save();
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      if (e.kind === 'banner') {
        const size = Math.round(cell * 1.15);
        const font = `${size}px ${TILE_FONT}`;
        ctx.font = font;
        const fitW = Math.min(1, (W * 0.9) / (ctx.measureText(e.text).width + size * 0.3));
        ctx.translate(W / 2, H * 0.38 - (reduceMotion ? 0 : t * cell));
        ctx.rotate(-0.05);
        ctx.scale(pop * fitW, pop * fitW);
        chunkyText(ctx, e.text, 0, 0, size, font, e.colors[0], e.colors[1]);
      } else {
        const size = Math.round(cell * 0.8);
        ctx.translate(e.x, e.y - (reduceMotion ? 0 : t * cell * 1.6));
        ctx.scale(pop, pop);
        chunkyText(ctx, e.text, 0, 0, size, `${size}px ${TILE_FONT}`, '#fff6b0', '#ffc20f');
        const sub = Math.round(cell * 0.46);
        chunkyText(ctx, e.sub, 0, cell * 0.68, sub, `${sub}px ${TILE_FONT}`, '#ffffff', '#e6deff');
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

  // Makes a stat jump, to show that a word just changed it.
  function bump(key) {
    if (reduceMotion) return;
    const node = hud[key];
    node.classList.remove('bump');
    void node.offsetWidth; // restart the animation if it's still running
    node.classList.add('bump');
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
      o.title.textContent = 'Alphaboom';
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
    particles.length = 0;
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
  // What the Rules panel says about saving, by where games are saved (see src/sessions.js).
  const HISTORY_NOTE = {
    web:
      "Games are saved anonymously to help improve Alphaboom: each piece's letters, where it went, " +
      'how long it took, and the words it made. No name or account is stored.',
  };
  const saver = ST.createSessionSaver((state, info) => {
    saveState = state === 'ready' ? saveState : state;
    if (state === 'ready') {
      if (info && HISTORY_NOTE[info.backend]) historyNoteEl.textContent = HISTORY_NOTE[info.backend];
      historyNoteEl.hidden = false;
    }
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
      if (e.type === 'lock') {
        // The piece that just landed squashes for a moment.
        landed = { ids: new Set(lastPieceIds), born: now };
      } else if (e.type === 'words') {
        for (const w of e.found) {
          const xs = w.cells.map((c) => c.x);
          const ys = w.cells.map((c) => c.y);
          const mid = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * cell;
          const cx = Math.min(Math.max(mid, cell * 1.4), cell * (cfg.COLS - 1.4)); // keep text on the board
          const cy = ((Math.min(...ys) + Math.max(...ys)) / 2) * cell;
          effects.push({ kind: 'word', text: '+' + fmt(w.points), sub: w.display, x: cx, y: cy, born: now, life: 1300 });
          // Stars fly out of every tile of the word.
          for (const c of w.cells) burst(now, (c.x + 0.5) * cell, (c.y + 0.5) * cell, 3, 5.5, 'star');
        }
        if (e.chain > 1) effects.push({ kind: 'banner', text: `CHAIN ×${e.chain}`, colors: BANNER.chain, born: now, life: 1200 });
        renderRecent(e.found.length);
        bump('score');
        bump('words');
      } else if (e.type === 'rows') {
        effects.push({ kind: 'banner', text: e.count > 1 ? `${e.count} ROWS CLEARED` : 'ROW CLEARED', colors: BANNER.rows, born: now, life: 1000 });
      } else if (e.type === 'level') {
        effects.push({ kind: 'banner', text: `LEVEL ${e.level}`, colors: BANNER.level, born: now, life: 1400 });
        // Confetti from the top of the well.
        for (let i = 0; i < 6; i++) burst(now, ((i + 0.5) / 6) * cell * cfg.COLS, cell * 0.5, 6, 6.5, 'bit');
        bump('level');
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
    if (game.current) lastPieceIds = ST.pieceCells(game.current).map((c) => c.tile.id);
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

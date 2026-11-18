// How to play (four illustrated cards) and the scoreboard (everyone's best posted games, and
// your own best games on this device). Both open as dialogs over the page; opening one pauses
// a game in progress. Holds no game rules: the card text reads its numbers from ST.CONFIG.
(function () {
  const ST = window.ST;
  const cfg = ST.CONFIG;
  const ui = ST.ui;
  const game = ui.game;
  const store = ui.store;
  const board = ST.scoreboard || { enabled: false };
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  // ---- dialogs ------------------------------------------------------------

  function openSheet(dlg) {
    if (game.state === 'playing' || game.state === 'clearing') game.togglePause();
    if (dlg.open) return;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function closeSheet(dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else {
      dlg.removeAttribute('open');
      dlg.dispatchEvent(new Event('close'));
    }
  }

  function focusCard(dlg) {
    dlg.querySelector('.sheet-card').focus({ preventScroll: true });
  }

  for (const dlg of document.querySelectorAll('dialog.sheet')) {
    // A tap on the dimmed backdrop (outside the card) closes it, as Escape does.
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(dlg); });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet(dlg)));
  }

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (!opener) return;
    if (opener.dataset.open === 'howto') openHowTo();
    else if (opener.dataset.open === 'scoreboard') openScoreboard();
  });

  // ---- how to play ----------------------------------------------------------

  const howto = $('howto');
  const track = $('howto-track');
  const cards = [...track.children];
  const dots = [...$('howto-dots').children];
  const backBtn = $('howto-back');
  const nextBtn = $('howto-next');
  let page = 0;

  // A word's points before chain and level bonuses, as src/words.js scores it.
  function points(tokens) {
    const length = tokens.reduce((n, t) => n + (t === 'QU' ? 2 : 1), 0);
    const mult = cfg.LENGTH_MULT[length] || cfg.LENGTH_MULT_MAX;
    return tokens.reduce((n, t) => n + (cfg.LETTER_VALUES[t] || 0), 0) * mult * cfg.WORD_BASE;
  }

  function tileRow(tokens, look, size, popFrom = -1, popTo = -1) {
    const row = el('div', 'tile-row');
    tokens.forEach((t, i) => {
      const pop = i >= popFrom && i <= popTo;
      const c = ui.tileCanvas(t, pop ? 'flash' : look, size);
      if (pop) {
        c.classList.add('pop');
        c.style.setProperty('--i', i - popFrom);
      }
      row.append(c);
    });
    return row;
  }

  // Paints the cards' pictures with the game's own tile painter.
  function paintArt() {
    const size = Math.min(44, Math.floor((track.clientWidth - 70) / 6)) || 40;
    for (const art of howto.querySelectorAll('[data-art]')) {
      const kind = art.dataset.art;
      art.querySelectorAll('.tile-row, .art-points, .score-row').forEach((n) => n.remove());
      if (kind === 'spell') {
        spellBuild(art);
      } else if (kind === 'steer') {
        demoBuild(art);
      } else if (kind === 'score') {
        // A short word and a long one, side by side, with what each is worth.
        const small = Math.min(size, Math.floor((art.clientWidth - 110) / 6)) || 30;
        [['C', 'A', 'T'], ['T', 'R', 'A', 'I', 'N', 'S']].forEach((word, i) => {
          const row = el('div', 'score-row');
          const coin = el('span', 'art-coin', '+' + points(word));
          coin.style.setProperty('--i', i);
          row.append(tileRow(word, 'base', small), coin);
          art.append(row);
        });
      } else if (kind === 'tips') {
        art.append(tileRow(['*', 'QU'], 'base', size), tileRow(['R', 'S', 'T', 'L', 'N', 'E'], 'dim', Math.round(size * 0.7)));
      }
    }
    howto.querySelectorAll('[data-minlen]').forEach((n) => { n.textContent = game.settings.minLen; });
    howto.querySelectorAll('[data-perlevel]').forEach((n) => { n.textContent = cfg.WORDS_PER_LEVEL; });
  }

  // ---- the first card's demo: the whole game in one look ----------------------
  // A piece falls into a little well and completes CAT in the bottom row. CAT lights up and
  // pops for +50, then every tile above it tumbles down into the gap. Then it starts again.
  // Scripted (not the real rules), so it always plays the same, clear story.

  const SPELL = {
    cols: 6,
    rows: 5,
    board: ['......', '......', '.D....', '.OU..I', 'KCA.ZL'],
    piece: [[3, 2, 'R'], [3, 3, 'E'], [4, 3, 'N'], [3, 4, 'T']], // [column, row it lands in, letter]
    word: ['1,4', '2,4', '3,4'], // C A T
    fallFrom: -4, // rows above its landing spot that the piece starts
  };
  const spell = { well: null, cell: 32, tiles: [], piece: [], timers: [], running: false, points: null };

  function spellAt(t, x, y) {
    t.x = x;
    t.y = y;
    t.el.style.transform = `translate(${x * spell.cell}px, ${y * spell.cell}px)`;
  }

  function spellTile(ch, x, y, kind) {
    const wrap = el('div', 'spell-tile' + (kind ? ' ' + kind : ''));
    wrap.append(ui.tileCanvas(ch, 'base', spell.cell));
    if (kind && kind.includes('word')) {
      const lit = ui.tileCanvas(ch, 'flash', spell.cell);
      lit.className = 'flash';
      wrap.append(lit);
    }
    const t = { el: wrap, x, y };
    spellAt(t, x, y);
    spell.well.append(wrap);
    spell.tiles.push(t);
    return t;
  }

  // Lays out the opening position: the board, the piece above it, and its landing outline.
  function spellReset() {
    const { cols, rows } = SPELL;
    const w = spell.well;
    if (!w) return;
    w.className = 'demo-well spell-well instant';
    w.replaceChildren();
    spell.tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellEl = el('span', 'demo-cell');
        cellEl.style.transform = `translate(${c * spell.cell}px, ${r * spell.cell}px)`;
        w.append(cellEl);
      }
    }
    for (const [x, y, ch] of SPELL.piece) {
      const g = ui.tileCanvas(ch, 'ghost', spell.cell);
      g.className = 'spell-ghost';
      g.style.transform = `translate(${x * spell.cell}px, ${y * spell.cell}px)`;
      w.append(g);
    }
    SPELL.board.forEach((line, y) => [...line].forEach((ch, x) => {
      if (ch !== '.') spellTile(ch, x, y, SPELL.word.includes(`${x},${y}`) ? 'word' : '');
    }));
    spell.piece = SPELL.piece.map(([x, y, ch]) => {
      const t = spellTile(ch, x, y + SPELL.fallFrom, 'piece' + (SPELL.word.includes(`${x},${y}`) ? ' word' : ''));
      t.land = y;
      return t;
    });
    spell.points = el('div', 'spell-points', '+' + points(['C', 'A', 'T']));
    spell.points.style.left = 1 * spell.cell + 'px';
    spell.points.style.top = 2.75 * spell.cell + 'px';
    spell.points.style.width = 3 * spell.cell + 'px';
    w.append(spell.points);
    void w.offsetWidth; // apply the start positions before turning transitions back on
    w.classList.remove('instant');
  }

  function spellBuild(art) {
    let well = art.querySelector('.spell-well');
    if (!well) {
      well = el('div', 'demo-well spell-well');
      well.setAttribute('aria-hidden', 'true');
      art.append(well);
    }
    spell.well = well;
    const maxCell = window.innerHeight < 700 ? 26 : 34;
    spell.cell = Math.max(20, Math.min(maxCell, Math.floor((art.clientWidth - 28) / SPELL.cols)));
    well.style.setProperty('--c', spell.cell + 'px');
    well.style.width = SPELL.cols * spell.cell + 'px';
    well.style.height = SPELL.rows * spell.cell + 'px';
    spellReset();
    if (reduceMotion) spellStill();
  }

  // Under reduced motion: one still frame, with CAT lit up and its points showing.
  function spellStill() {
    spell.well.classList.add('instant');
    for (const t of spell.piece) spellAt(t, t.x, t.land);
    spell.well.querySelectorAll('.spell-tile.word').forEach((n) => n.classList.add('lit'));
    spell.points.classList.add('still');
  }

  function spellLater(ms, fn) {
    spell.timers.push(setTimeout(fn, ms));
  }

  function spellPlay() {
    spell.timers = [];
    spellReset();
    const STEP = 260;
    let t = 500;
    // The piece falls a row at a time, like in the game.
    for (let k = SPELL.fallFrom + 1; k <= 0; k++) {
      spellLater(t, () => { for (const p of spell.piece) spellAt(p, p.x, p.land + k); });
      t += STEP;
    }
    spellLater(t - STEP + 200, () => spell.well.classList.add('landed'));
    t += 250;
    // CAT lights up and pops, with its points.
    spellLater(t, () => {
      spell.well.querySelectorAll('.spell-tile.word').forEach((n) => n.classList.add('lit'));
      spell.points.classList.add('show');
    });
    t += 750;
    spellLater(t, () => spell.well.querySelectorAll('.spell-tile.word').forEach((n) => n.classList.add('gone')));
    t += 320;
    // Every tile above the gap tumbles down, column by column.
    spellLater(t, () => {
      spell.well.classList.add('tumbling');
      const left = spell.tiles.filter((x) => !x.el.classList.contains('word'));
      for (let c = 0; c < SPELL.cols; c++) {
        const col = left.filter((x) => x.x === c).sort((a, b) => b.y - a.y);
        col.forEach((x, i) => {
          const to = SPELL.rows - 1 - i;
          if (to !== x.y) {
            x.el.style.transitionDelay = `${Math.max(0, c - 1) * 70 + i * 40}ms`;
            spellAt(x, x.x, to);
          }
        });
      }
    });
    t += 1700;
    spellLater(t, () => spell.well.classList.add('fading'));
    t += 380;
    spellLater(t, spellPlay);
  }

  // Runs only while the first card is the one showing.
  function spellSync() {
    const showing = howto.open && page === 0 && !!spell.well;
    if (showing && !spell.running && !reduceMotion) {
      spell.running = true;
      spellPlay();
    } else if (!showing && spell.running) {
      spell.running = false;
      spell.timers.forEach(clearTimeout);
      spell.timers = [];
      spellReset();
    }
  }

  // ---- the steering demo: a tiny well whose piece obeys the mini keys --------
  // It plays a short loop by itself (rotate, left, right, drop) while its card is showing,
  // and the player can tap the keys to try them; a tap pauses the loop for a few seconds.
  // It uses the game's own piece shapes and rotation, so letters turn the way they do in play.

  const demo = { cols: 5, rows: 5, cell: 26, piece: null, x: 0, y: 0, tiles: new Map(), ghosts: new Map(), timer: null, busy: false, manualUntil: 0, step: 0 };
  const demoWell = $('demo-well');
  const demoKeys = [...howto.querySelectorAll('[data-demo]')];
  const DEMO_LOOP = [['rotate', 900], ['left', 650], ['right', 650], ['right', 650], ['rotate', 750], ['down', 1300], ['reset', 500]];

  function demoCells(piece = demo.piece, x = demo.x, y = demo.y) {
    const cells = [];
    piece.grid.forEach((row, r) => row.forEach((t, c) => t && cells.push({ x: x + c, y: y + r, tile: t })));
    return cells;
  }
  const demoFits = (cells) => cells.every((c) => c.x >= 0 && c.x < demo.cols && c.y >= 0 && c.y < demo.rows);
  function demoDrop() {
    let d = 0;
    while (demoFits(demoCells(demo.piece, demo.x, demo.y + d + 1))) d++;
    return d;
  }

  function demoPlace() {
    const s = demo.cell;
    const d = demoDrop();
    for (const c of demoCells()) {
      demo.tiles.get(c.tile.id).style.transform = `translate(${c.x * s}px, ${c.y * s}px)`;
      demo.ghosts.get(c.tile.id).style.transform = `translate(${c.x * s}px, ${(c.y + d) * s}px)`;
    }
  }

  function demoSpawn() {
    demo.piece = ST.makePiece('T', ['S', 'C', 'A', 'T'], cfg);
    demo.x = 1;
    demo.y = -ST.pieceTopRow(demo.piece);
    demo.busy = false;
    demoWell.classList.remove('fast', 'landed');
    demoWell.replaceChildren();
    for (let r = 0; r < demo.rows; r++) {
      for (let c = 0; c < demo.cols; c++) {
        const cellEl = el('span', 'demo-cell');
        cellEl.style.transform = `translate(${c * demo.cell}px, ${r * demo.cell}px)`;
        demoWell.append(cellEl);
      }
    }
    demo.tiles.clear();
    demo.ghosts.clear();
    for (const c of demoCells()) {
      const ghost = ui.tileCanvas(c.tile.ch, 'ghost', demo.cell);
      ghost.className = 'demo-ghost';
      const tile = ui.tileCanvas(c.tile.ch, 'base', demo.cell);
      tile.className = 'demo-tile';
      demo.ghosts.set(c.tile.id, ghost);
      demo.tiles.set(c.tile.id, tile);
      demoWell.append(ghost);
    }
    demo.tiles.forEach((t) => demoWell.append(t));
    demoWell.classList.add('instant');
    demoPlace();
    void demoWell.offsetWidth; // apply the start positions before turning transitions back on
    demoWell.classList.remove('instant');
  }

  function demoBuild(art) {
    const keysW = 94;
    demo.cell = Math.max(18, Math.min(32, Math.floor((art.clientWidth - keysW - 42) / demo.cols)));
    demoWell.style.setProperty('--c', demo.cell + 'px');
    demoWell.style.width = demo.cols * demo.cell + 'px';
    demoWell.style.height = demo.rows * demo.cell + 'px';
    demoSpawn();
  }

  function pressKey(name, ms = 170) {
    const key = demoKeys.find((k) => k.dataset.demo === name);
    if (!key) return;
    key.classList.add('on');
    setTimeout(() => key.classList.remove('on'), ms);
  }

  function demoAct(name) {
    if (!demo.piece) return;
    if (name === 'reset') {
      demoWell.classList.add('fading');
      setTimeout(() => { demoWell.classList.remove('fading'); demoSpawn(); }, 260);
      return;
    }
    if (demo.busy) return; // the piece is dropping; a new one comes next
    if (name === 'rotate') {
      const turned = { ...demo.piece, grid: ST.rotateGrid(demo.piece.grid, 1) };
      for (const [kx, ky] of ST.KICKS) {
        if (demoFits(demoCells(turned, demo.x + kx, demo.y + ky))) {
          demo.piece = turned;
          demo.x += kx;
          demo.y += ky;
          if (ST.sound) ST.sound.play('rotate');
          break;
        }
      }
      pressKey('rotate');
    } else if (name === 'left' || name === 'right') {
      const dx = name === 'left' ? -1 : 1;
      if (demoFits(demoCells(demo.piece, demo.x + dx, demo.y))) {
        demo.x += dx;
        if (ST.sound) ST.sound.play('move');
      }
      pressKey(name);
    } else if (name === 'down') {
      const d = demoDrop();
      pressKey('down', 420);
      demo.busy = true;
      demoWell.classList.add('fast');
      demo.y += d;
      setTimeout(() => {
        demoWell.classList.remove('fast');
        demoWell.classList.add('landed');
        if (ST.sound) ST.sound.play('land');
      }, d ? 300 : 0);
    }
    demoPlace();
  }

  // Tapping a mini key: do it now, then let the loop take over again a little later.
  for (const key of demoKeys) {
    key.addEventListener('click', () => {
      demo.manualUntil = performance.now() + 5000;
      if (demo.busy) { demoAct('reset'); return; }
      demoAct(key.dataset.demo);
      if (key.dataset.demo === 'down') setTimeout(() => demoAct('reset'), 1100);
    });
  }

  function demoTick() {
    demo.timer = null;
    if (!howto.open || page !== 1) return;
    let wait = 400;
    if (performance.now() >= demo.manualUntil) {
      const [name, ms] = DEMO_LOOP[demo.step % DEMO_LOOP.length];
      demo.step++;
      demoAct(name);
      wait = ms;
    }
    demo.timer = setTimeout(demoTick, wait);
  }

  // Runs only while the steering card is the one showing, and not under reduced motion.
  function demoSync() {
    const showing = howto.open && page === 1;
    if (showing && !demo.timer && !reduceMotion) {
      demo.step = 0;
      demo.manualUntil = 0;
      demoSpawn();
      demo.timer = setTimeout(demoTick, 500);
    } else if (!showing && demo.timer) {
      clearTimeout(demo.timer);
      demo.timer = null;
    }
  }

  function syncNav() {
    dots.forEach((d, i) => d.setAttribute('aria-current', i === page ? 'step' : 'false'));
    cards.forEach((c, i) => c.toggleAttribute('inert', i !== page));
    backBtn.style.visibility = page > 0 ? 'visible' : 'hidden';
    nextBtn.textContent = page < cards.length - 1 ? 'Next' : game.state === 'ready' ? 'Play!' : 'Got it';
    demoSync();
    spellSync();
  }

  function goTo(i) {
    page = Math.max(0, Math.min(cards.length - 1, i));
    track.scrollTo({ left: page * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
    syncNav();
  }

  // Swiping moves the cards natively (scroll snap); keep the dots and buttons in step.
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i !== page) { page = i; syncNav(); }
  }, { passive: true });

  dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));
  backBtn.addEventListener('click', () => goTo(page - 1));
  nextBtn.addEventListener('click', () => {
    if (page < cards.length - 1) { goTo(page + 1); return; }
    closeSheet(howto);
    if (game.state === 'ready') ui.start();
  });
  howto.addEventListener('close', () => {
    store.set('seenHowTo', true);
    demoSync();
    spellSync();
  });

  function openHowTo() {
    openSheet(howto);
    paintArt();
    page = 0;
    track.scrollLeft = 0;
    syncNav();
    focusCard(howto);
  }

  // The first paint may come before the web fonts arrive.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (howto.open) paintArt(); });

  // ---- your best games (this device) ----------------------------------------

  const HISTORY = 'games';
  const KEEP = 10;
  let lastGameAt = null;

  ui.onGameOver((g) => {
    if (!(g.score > 0)) return;
    lastGameAt = new Date().toISOString();
    const list = store.get(HISTORY, []).filter((x) => x && x.score > 0);
    list.push({
      score: g.score, words: g.words, level: g.level, at: lastGameAt,
      best: g.bestWord ? g.bestWord.display : null, bestPoints: g.bestWord ? g.bestWord.points : null,
    });
    list.sort((a, b) => b.score - a.score);
    store.set(HISTORY, list.slice(0, KEEP));
  });

  function when(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    if (d.toDateString() === new Date().toDateString()) return 'Today';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function rankBadge(rank) {
    return el('span', `rank${rank <= 3 ? ' r' + rank : ''}`, String(rank));
  }

  function entry(rank, name, meta, score, mine) {
    const li = el('li', `entry${mine ? ' mine' : ''}`);
    const who = el('div', 'who');
    who.append(el('span', 'name', name), el('span', 'meta', meta));
    li.append(rankBadge(rank), who, el('span', 'coin', fmt(score)));
    return li;
  }

  function note(text) {
    return el('li', 'board-note', text);
  }

  function wordsMeta(words, best, bestPoints) {
    const parts = [];
    if (words != null) parts.push(`${words} ${words === 1 ? 'word' : 'words'}`);
    if (best) parts.push(`best ${best}${bestPoints ? ' ' + fmt(bestPoints) : ''}`);
    return parts.join(' · ');
  }

  function renderMine() {
    const list = store.get(HISTORY, []).filter((x) => x && x.score > 0);
    const legacyBest = store.get('best', 0);
    if (!list.length && legacyBest > 0) list.push({ score: legacyBest, legacy: true });
    const ol = $('board-mine');
    if (!list.length) {
      ol.replaceChildren(note('Your best games on this device show up here.'));
      return;
    }
    ol.replaceChildren(...list.map((g, i) => {
      if (g.legacy) return entry(i + 1, 'Earlier game', 'Before the scoreboard', g.score, false);
      const meta = [`level ${g.level}`, wordsMeta(g.words, g.best, g.bestPoints)].filter(Boolean).join(' · ');
      return entry(i + 1, when(g.at), meta, g.score, g.at === lastGameAt);
    }));
  }

  // ---- the shared scoreboard (website only) ---------------------------------

  const LIMIT = 20;
  const sheet = $('scoreboard');
  const form = $('post-form');
  const nameInput = $('post-name');
  const submitBtn = $('post-submit');
  const statusEl = $('post-status');
  const postedNote = $('posted-note');
  const tabs = [...$('board-tabs').children];
  const lists = { top: $('board-top'), mine: $('board-mine') };
  let posted = null; // { gameId, nickname, rank, players } for the last game you posted
  let topRequest = 0;

  function canPost() {
    return board.enabled && game.state === 'over' && !!game.sessionId && game.score > 0 &&
      !(posted && posted.gameId === game.sessionId);
  }

  function selectTab(name) {
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === name));
    for (const [key, ol] of Object.entries(lists)) ol.hidden = key !== name;
  }
  tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

  async function loadTop() {
    if (!board.enabled) return;
    const request = ++topRequest;
    lists.top.replaceChildren(note('Loading…'));
    try {
      const rows = (await board.top(LIMIT)) || [];
      if (request !== topRequest) return;
      if (!rows.length) {
        lists.top.replaceChildren(note('No scores yet. Finish a game and post yours!'));
        return;
      }
      const items = [];
      for (const r of rows) {
        if (r.rank > LIMIT) items.push(el('li', 'board-gap', '⋯')); // your own row, further down
        items.push(entry(r.rank, r.nickname, wordsMeta(r.words, r.best_word, r.best_points), r.score, r.mine));
      }
      lists.top.replaceChildren(...items);
    } catch {
      if (request !== topRequest) return;
      const li = note("Couldn't load the scoreboard. ");
      const retry = el('button', 'link-btn', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', loadTop);
      li.append(retry);
      lists.top.replaceChildren(li);
    }
  }

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', !!isError);
  }

  function showPosted() {
    const here = posted && posted.gameId === game.sessionId;
    postedNote.hidden = !here;
    if (here) {
      postedNote.textContent = posted.rank
        ? `Posted as ${posted.nickname}: #${posted.rank} of ${posted.players}!`
        : `Posted as ${posted.nickname}!`;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nick = board.cleanNickname(nameInput.value);
    if (!nick) {
      setStatus("Use 2–16 letters or numbers. Spaces and _ . ' - are fine too.", true);
      nameInput.focus();
      return;
    }
    const gameId = game.sessionId;
    submitBtn.disabled = nameInput.disabled = true;
    setStatus('Posting…');
    try {
      const result = await board.post(gameId, nick);
      store.set('nickname', nick);
      posted = { gameId, nickname: nick, rank: result && result.rank, players: result && result.players };
      if (sound) sound.play('cheer');
      form.hidden = true;
      setStatus('');
      showPosted();
      $('overlay-board').querySelector('span').textContent = 'Scoreboard';
      selectTab('top');
      loadTop();
    } catch (err) {
      setStatus(/nickname/.test(err.reason || '')
        ? "That nickname can't be used. Try another."
        : "Couldn't post your score. Check your connection and try again.", true);
    } finally {
      submitBtn.disabled = nameInput.disabled = false;
    }
  });

  function openScoreboard() {
    const postable = canPost();
    form.hidden = !postable;
    setStatus('');
    if (postable) {
      $('post-score').textContent = fmt(game.score);
      nameInput.value = store.get('nickname', '');
    }
    showPosted();
    $('board-title').textContent = board.enabled ? 'Scoreboard' : 'My best games';
    $('board-tabs').hidden = !board.enabled;
    selectTab(board.enabled ? 'top' : 'mine');
    renderMine();
    loadTop();
    openSheet(sheet);
    // Focus the card itself: no phone keyboard popping up, and no focus ring on a button.
    focusCard(sheet);
  }

  // ---- tips for first-time players ---------------------------------------------
  // The first time each moment comes up (a word, a chain, a full row, a new level, the stack
  // nearing the top), the game pauses once things settle and shows a tip with a picture made
  // from what just happened. Closing it counts down 3-2-1, then play picks up again. Each tip
  // shows once per device; several from one moment show one after another.

  const tipSheet = $('tip-sheet');
  const tipTitle = $('tip-title');
  const tipBody = $('tip-body');
  const tipArt = $('tip-art');
  const countdownEl = $('countdown');
  const COUNT_MS = 700;
  const seenTips = new Set(store.get('tips', []));
  const pendingTips = [];
  let holding = false; // a tip or its countdown is holding the game paused
  let countdownTimer = null;

  const lettersAt = (cells) => cells.map(({ x, y }) => (game.board.grid[y][x] || {}).ch).filter(Boolean);
  const artSize = (count) => Math.max(18, Math.min(40, Math.floor((tipArt.clientWidth - 24) / Math.max(count, 3)) - 2));

  // Tip contents. The pictures are captured when the moment happens (the board changes after).
  const TIPS = {
    word(e) {
      const w = e.found[0];
      const letters = lettersAt(w.cells);
      return {
        title: 'Nice word!',
        text: 'Words score points, and longer words score a lot more.',
        art: () => [el('div', 'art-points', '+' + fmt(w.points)), tileRow(letters, 'flash', artSize(letters.length))],
      };
    },
    chain(e) {
      const w = e.found[0];
      const letters = lettersAt(w.cells);
      return {
        title: `Chain ×${e.chain}!`,
        text: `When a word clears, the tiles above it fall. If they spell another word, that's a chain, and it scores ×${e.chain}.`,
        art: () => [el('div', 'art-points', `×${e.chain}`), tileRow(letters, 'flash', artSize(letters.length))],
      };
    },
    row() {
      const c = game.clearing && game.clearing.junkCells[0];
      const letters = c ? game.board.grid[c.y].map((t) => t && t.ch).filter(Boolean) : ['R', 'S', 'T', 'L', 'N'];
      return {
        title: 'Full row',
        text: 'A full row clears too, but it scores nothing. Only words score points.',
        art: () => [tileRow(letters, 'dim', artSize(letters.length))],
      };
    },
    level(e) {
      return {
        title: `Level ${e.level}!`,
        text: `Pieces fall faster now, and every word scores ×${e.level}.`,
        art: () => [el('div', 'level-badge', String(e.level))],
      };
    },
    danger() {
      return {
        title: 'Careful!',
        text: 'The stack is near the top. Spell words to bring it back down.',
        art: () => [el('div', 'danger-badge', '!')],
      };
    },
  };

  function queueTip(id, e) {
    if (seenTips.has(id) || pendingTips.some((t) => t.id === id)) return;
    pendingTips.push({ id, ...TIPS[id](e) });
  }

  // Shows queued tips once play is calm: after the piece and its chain have settled.
  function showTipsSoon() {
    if (!pendingTips.length || holding) return;
    setTimeout(() => {
      if (pendingTips.length && !holding && game.state === 'playing' && !document.hidden) startHold();
    }, 0);
  }

  function startHold() {
    holding = true;
    if (game.state === 'playing' || game.state === 'clearing') game.togglePause();
    ui.refreshOverlay(); // keeps the pause screen out of the way
    nextTip();
  }

  function nextTip() {
    const t = pendingTips.shift();
    if (!t) { countdown(); return; }
    seenTips.add(t.id);
    store.set('tips', [...seenTips]);
    tipSheet.className = `sheet tip-sheet tip-${t.id}`;
    tipTitle.textContent = t.title;
    tipBody.textContent = t.text;
    tipArt.replaceChildren();
    openSheet(tipSheet);
    tipArt.replaceChildren(...t.art());
    focusCard(tipSheet);
    if (sound) sound.play('tip');
  }

  // Closing a tip (Got it, Escape, or a tap outside) shows the next, or counts down.
  $('tip-ok').addEventListener('click', () => closeSheet(tipSheet));
  tipSheet.addEventListener('close', () => { if (holding) nextTip(); });

  function countdown() {
    let n = 3;
    const num = countdownEl.querySelector('span');
    countdownEl.hidden = false;
    const step = () => {
      if (!holding) return;
      if (n === 0) {
        endHold();
        if (game.state === 'paused') game.togglePause();
        if (sound) sound.play('go');
        return;
      }
      num.textContent = String(n);
      num.classList.remove('pop');
      void num.offsetWidth; // restart the pop for each number
      num.classList.add('pop');
      if (sound) sound.play('count');
      n--;
      countdownTimer = setTimeout(step, COUNT_MS);
    };
    step();
  }

  function endHold() {
    holding = false;
    clearTimeout(countdownTimer);
    countdownTimer = null;
    countdownEl.hidden = true;
    ui.refreshOverlay();
  }

  // Pause during the countdown, or leaving the app: stop and show the ordinary pause screen.
  function cancelHold() {
    if (!holding) return;
    pendingTips.length = 0;
    const wasOpen = tipSheet.open;
    holding = false;
    if (wasOpen) closeSheet(tipSheet);
    endHold();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && countdownTimer) cancelHold(); });

  ui.onEvent((e) => {
    if (e.type === 'words') {
      queueTip('word', e);
      if (e.chain > 1) queueTip('chain', e);
    } else if (e.type === 'rows') queueTip('row', e);
    else if (e.type === 'level') queueTip('level', e);
    else if (e.type === 'danger') { queueTip('danger', e); showTipsSoon(); }
    else if (e.type === 'settled') showTipsSoon();
    else if (e.type === 'over') { pendingTips.length = 0; cancelHold(); }
  });

  // ---- sound ----------------------------------------------------------------

  const sound = ST.sound;
  const soundBtn = $('sound-btn');
  const soundToggle = $('sound-toggle');
  if (!sound || !sound.supported) {
    soundBtn.hidden = true;
    $('sound-setting').hidden = true;
  } else {
    const sync = (on) => {
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
      soundToggle.setAttribute('aria-pressed', String(on));
      soundToggle.textContent = on ? 'On' : 'Off';
    };
    sync(sound.on);
    sound.onChange(sync);
    soundBtn.addEventListener('click', () => sound.set(!sound.on));
    soundToggle.addEventListener('click', () => sound.set(!sound.on));
  }

  // A soft tap for on-screen buttons (the control pad and the sound switches have their own).
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && !b.dataset.action && !b.dataset.demo && b !== soundBtn && b !== soundToggle && !b.disabled) {
      if (sound) sound.play('tap');
    }
  });

  // ---- sandbox ----------------------------------------------------------------
  // Preview links and local copies say so, so testing never gets mixed up with the live game.
  if (board.sandbox) {
    const branch = (ST.DEPLOY && ST.DEPLOY.branch) || '';
    $('sandbox-branch').textContent = branch ? ' · ' + branch : '';
    $('sandbox-tag').hidden = false;
    $('sandbox-note').hidden = false;
  }

  ST.screens = {
    openHowTo,
    openScoreboard,
    holding: () => holding,
    cancelHold,
    // The label of the scoreboard button on the game-over screen.
    boardLabel: () => (canPost() ? 'Post score' : 'Scoreboard'),
  };
  ui.refreshOverlay();

  // First visit: show how to play before the first game.
  if (!store.get('seenHowTo', false) && game.state === 'ready') openHowTo();
})();

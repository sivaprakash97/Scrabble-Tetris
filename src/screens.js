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
  // Product analytics (src/analytics.js); does nothing where analytics is off.
  const trackEvent = (name, props) => { if (ST.analytics) ST.analytics.track(name, props); };
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
    // A tap on the dimmed backdrop (outside the card) closes it, as Escape does. The results
    // ignore one in their first moments: a player still tapping the pad as the game ends would
    // close them before they appear.
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      if (dlg.id === 'results' && Date.now() - resultsOpenedAt < RESULTS_GUARD) return;
      closeSheet(dlg);
    });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet(dlg)));
    // The browser hands focus back to the button that opened the dialog. Let go of it, so on a
    // keyboard Space or Enter means "start / resume" again instead of re-opening the dialog.
    dlg.addEventListener('close', () => {
      const a = document.activeElement;
      if (a && a !== document.body && a.blur) a.blur();
    });
  }

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (!opener) return;
    if (opener.dataset.open === 'howto') openHowTo(false);
    else if (opener.dataset.open === 'scoreboard') openScoreboard();
    else if (opener.dataset.open === 'results') openResults();
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
        spellBuild(art, Math.min(size, 38));
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

  // ---- the steering demo: a tiny well whose piece obeys the mini keys --------
  // It plays a short loop by itself (rotate, left, right, drop) while its card is showing,
  // and the player can tap the keys to try them; a tap pauses the loop for a few seconds.
  // It uses the game's own piece shapes and rotation, so letters turn the way they do in play.

  const demo = { cols: 5, rows: 5, cell: 26, piece: null, x: 0, y: 0, stage: null, fall: null, timer: null, busy: false, manualUntil: 0, step: 0 };
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
    demo.stage.setPiece(demoCells(), demoDrop());
    demo.stage.draw();
  }

  function demoSpawn() {
    clearTimeout(demo.fall);
    demo.fall = null;
    demo.piece = ST.makePiece('T', ['S', 'C', 'A', 'T'], cfg);
    demo.x = 1;
    demo.y = -ST.pieceTopRow(demo.piece);
    demo.busy = false;
    demo.stage.setGrid([]);
    demoPlace();
  }

  function demoBuild(art) {
    const keysW = 94;
    demo.cell = Math.max(18, Math.min(32, Math.floor((art.clientWidth - keysW - 42) / demo.cols)));
    demoWell.style.width = demo.cols * demo.cell + 'px';
    demoWell.style.height = demo.rows * demo.cell + 'px';
    if (demo.stage) demo.stage.stop();
    demo.stage = ui.miniStage(demoWell, demo.cols, demo.rows, demo.cell);
    demoSpawn();
    if (demo.timer) demo.stage.start();
  }

  function pressKey(name, ms = 170) {
    const key = demoKeys.find((k) => k.dataset.demo === name);
    if (!key) return;
    key.classList.add('on');
    setTimeout(() => key.classList.remove('on'), ms);
  }

  // Down drops one row every SOFT_DROP_INTERVAL, as holding Down does in play, then the piece squashes in.
  function demoDown() {
    if (demoFits(demoCells(demo.piece, demo.x, demo.y + 1))) {
      demo.y++;
      demoPlace();
      demo.fall = setTimeout(demoDown, cfg.SOFT_DROP_INTERVAL);
    } else {
      demo.fall = null;
      demo.stage.lock();
      demo.stage.draw();
      if (ST.sound) ST.sound.play('land');
    }
  }

  function demoAct(name) {
    if (!demo.piece) return;
    if (name === 'reset') {
      clearTimeout(demo.fall);
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
      pressKey('down', 420);
      demo.busy = true;
      demoDown();
      return;
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
      demo.stage.start();
      demo.timer = setTimeout(demoTick, 500);
    } else if (!showing && demo.timer) {
      clearTimeout(demo.timer);
      clearTimeout(demo.fall);
      demo.timer = null;
      demo.stage.stop();
    }
  }

  // ---- the spelling demo: a tile drops in, a word pops, the tiles above fall into the gap ----
  // The same stage as the steering demo, so it falls, squashes, flashes and closes up like play.

  const spell = { stage: null, host: null, timers: [], running: false };
  const SPELL_COLS = 6;
  const SPELL_ROWS = 6;
  // Stacked tiles in the well. The falling L piece drops straight down with its T right beside C and A.
  const SPELL_GRID = ['', '', '', ' DK', ' BU', ' CA'];
  const SPELL_WORD = ['C', 'A', 'T'];

  const spellAt = (ms, fn) => spell.timers.push(setTimeout(fn, ms));
  function spellStop() {
    spell.timers.forEach(clearTimeout);
    spell.timers = [];
    spell.running = false;
    if (spell.stage) spell.stage.stop();
  }

  function spellPlay() {
    const st = spell.stage;
    spell.host.classList.remove('fading');
    st.setGrid(SPELL_GRID);
    const filled = SPELL_GRID.map((row) => Array.from({ length: SPELL_COLS }, (_, x) => !!row[x] && row[x] !== ' '));
    const free = (cells) => cells.every((c) => c.x >= 0 && c.x < SPELL_COLS && c.y < SPELL_ROWS && (c.y < 0 || !filled[c.y][c.x]));
    // A real piece: the game's L, letters in reading order. It is not turned, so the lesson stays simple.
    const piece = ST.makePiece('L', ['N', 'T', 'Z', 'L'], cfg);
    piece.x = 3;
    piece.y = -1;
    const cellsOf = (pc = piece, dx = 0, dy = 0) => ST.pieceCells({ ...pc, x: pc.x + dx, y: pc.y + dy });
    const drop = () => { let d = 0; while (free(cellsOf(piece, 0, d + 1))) d++; return d; };
    const show = () => st.setPiece(cellsOf(), drop());

    const step = () => {
      if (free(cellsOf(piece, 0, 1))) {
        piece.y += 1;
      } else {
        st.lock();
        if (ST.sound) ST.sound.play('land');
        spellAt(260, () => {
          st.clear([1, 2, 3].map((x) => ({ x, y: SPELL_ROWS - 1 })), '+' + points(SPELL_WORD), SPELL_WORD.join(''));
          if (ST.sound) ST.sound.play('word', { letters: SPELL_WORD.length });
        });
        spellAt(2300, () => spell.host.classList.add('fading'));
        spellAt(2560, spellPlay);
        return;
      }
      show();
      spellAt(130, step);
    };
    show();
    spellAt(700, step);
  }

  function spellBuild(art, size) {
    spellStop();
    art.querySelectorAll('.demo-well').forEach((n) => n.remove());
    spell.host = el('div', 'demo-well');
    spell.host.setAttribute('aria-hidden', 'true');
    spell.host.style.width = SPELL_COLS * size + 'px';
    spell.host.style.height = SPELL_ROWS * size + 'px';
    art.append(spell.host);
    spell.stage = ui.miniStage(spell.host, SPELL_COLS, SPELL_ROWS, size);
    spell.stage.setGrid(SPELL_GRID);
    spell.stage.draw();
    spellSync();
  }

  // Plays only while the first card is showing; under reduced motion it stays a still picture.
  function spellSync() {
    if (!spell.stage) return;
    const showing = howto.open && page === 0;
    if (showing && !spell.running && !reduceMotion) {
      spell.running = true;
      spell.stage.start();
      spellPlay();
    } else if (!showing && spell.running) {
      spellStop();
      spell.host.classList.remove('fading');
      spell.stage.setGrid(SPELL_GRID);
      spell.stage.draw();
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

  // For analytics: the furthest card reached, and whether How to play opened by itself.
  let furthest = 0;
  let openedAuto = false;
  let finishedHowTo = false; // closed with Play! or Got it on the last card

  function goTo(i) {
    page = Math.max(0, Math.min(cards.length - 1, i));
    furthest = Math.max(furthest, page);
    track.scrollTo({ left: page * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
    syncNav();
  }

  // Swiping moves the cards natively (scroll snap); keep the dots and buttons in step.
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i !== page) { page = i; syncNav(); }
    furthest = Math.max(furthest, page);
  }, { passive: true });

  dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));
  backBtn.addEventListener('click', () => goTo(page - 1));
  nextBtn.addEventListener('click', () => {
    if (page < cards.length - 1) { goTo(page + 1); return; }
    finishedHowTo = true;
    closeSheet(howto);
    if (game.state === 'ready') ui.start();
  });
  howto.addEventListener('close', () => {
    trackEvent('tutorial_closed', {
      auto: openedAuto, furthest_card: furthest + 1, cards: cards.length,
      finished: finishedHowTo, first_visit: !store.get('seenHowTo', false),
    });
    store.set('seenHowTo', true);
    demoSync();
    spellSync();
  });
  // On a keyboard: left and right turn the cards, Enter goes on (and starts the game on the last).
  howto.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(page + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(page - 1); }
    else if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); nextBtn.click(); }
  });

  // `auto` is true when it opens by itself on a first visit.
  function openHowTo(auto) {
    openedAuto = auto === true;
    furthest = 0;
    finishedHowTo = false;
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

  // Your best games on this device. The scoreboard shows all of them; the results screen shows
  // the first `limit`, with a shorter line under each so a row stays on one line.
  function renderMine(ol = $('board-mine'), { limit = KEEP, short = false } = {}) {
    const list = store.get(HISTORY, []).filter((x) => x && x.score > 0);
    const legacyBest = store.get('best', 0);
    if (!list.length && legacyBest > 0) list.push({ score: legacyBest, legacy: true });
    if (!list.length) {
      ol.replaceChildren(note('Your scores on this device show up here.'));
      return;
    }
    ol.replaceChildren(...list.slice(0, limit).map((g, i) => {
      if (g.legacy) return entry(i + 1, 'Earlier game', short ? '' : 'Before the scoreboard', g.score, false);
      const meta = short
        ? `${g.words} ${g.words === 1 ? 'word' : 'words'}`
        : [`level ${g.level}`, wordsMeta(g.words, g.best, g.bestPoints)].filter(Boolean).join(' · ');
      return entry(i + 1, when(g.at), meta, g.score, g.at === lastGameAt);
    }));
  }

  // ---- the shared scoreboard (website only) ---------------------------------

  const LIMIT = 20;
  const sheet = $('scoreboard');
  const postedNote = $('posted-note');
  const tabs = [...$('board-tabs').children];
  const lists = { top: $('board-top'), mine: $('board-mine') };
  let posted = null; // { gameId, nickname, rank, players } for the last game you posted
  let topRequest = 0;

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

  function showPosted() {
    const here = posted && posted.gameId === game.sessionId;
    postedNote.hidden = !here;
    if (here) {
      postedNote.textContent = posted.rank
        ? `Posted as ${posted.nickname}: #${posted.rank} of ${posted.players}!`
        : `Posted as ${posted.nickname}!`;
    }
  }

  const NICK_RULE = "Use 2–16 letters or numbers. Spaces and _ . ' - are fine too.";

  // Posts a finished game under a nickname, from your row on the results screen. The scoreboard
  // dialog is for looking only: every finished game is already kept in My scores.
  async function postGame(gameId, nick) {
    const result = await board.post(gameId, nick);
    store.set('nickname', nick);
    posted = { gameId, nickname: nick, rank: result && result.rank, players: result && result.players };
    trackEvent('score_posted', { game_id: gameId, score: game.score, rank: posted.rank || null, players: posted.players || null });
    if (sound) sound.play('cheer');
  }

  const postError = (err) => (/nickname/.test((err && err.reason) || '')
    ? "That nickname can't be used. Try another."
    : "Couldn't post your score. Check your connection and try again.");

  function openScoreboard() {
    trackEvent('scoreboard_opened', { game_state: game.state });
    showPosted();
    $('board-title').textContent = board.enabled ? 'Scoreboard' : 'My scores';
    $('board-tabs').hidden = !board.enabled;
    selectTab(board.enabled ? 'top' : 'mine');
    renderMine();
    loadTop();
    openSheet(sheet);
    // Focus the card itself: no phone keyboard popping up, and no focus ring on a button.
    focusCard(sheet);
  }

  // ---- results: the screen after every game -------------------------------------
  // Opens by itself a moment after a game ends. First where you stand on the scoreboard, with a
  // box for your name in your own row, because most players would otherwise close the page
  // without posting; then how the game went. "Results" on the game-over card opens it again.

  const results = $('results');
  const resultsList = $('results-list');
  const resultsNote = $('results-note');
  const resultsPosted = $('results-posted');
  const resultsMine = $('results-mine');
  const rTabBoard = $('rtab-board');
  const rTabMine = $('rtab-mine');
  const RESULTS_MINE = 5; // your best games shown here; the scoreboard has all 10

  // Leaderboard (where this game stands) or My scores (this device's best games).
  function selectResultsTab(name) {
    const mine = name === 'mine';
    rTabBoard.setAttribute('aria-selected', String(!mine));
    rTabMine.setAttribute('aria-selected', String(mine));
    $('results-board').classList.toggle('on-mine', mine);
    resultsList.hidden = mine;
    resultsMine.hidden = !mine;
  }
  rTabBoard.addEventListener('click', () => selectResultsTab('board'));
  rTabMine.addEventListener('click', () => {
    selectResultsTab('mine');
    trackEvent('results_my_scores', { game_id: game.sessionId || null });
  });
  const RESULTS_DELAY = 900; // ms after the game ends, so the game-over sound and card land first
  const RESULTS_GUARD = 700; // ms in which a stray tap or Space can't close or skip it
  let resultsOpenedAt = 0;
  let standingRequest = 0; // a newer request makes an older answer stale
  let resultsTracked = null; // the game id `results_shown` was last sent for

  // The performance card: plain numbers from the game (Game.stats in src/game.js).
  function showStats() {
    const s = game.stats();
    const best = ui.newBest();
    const title = $('results-title');
    title.textContent = best ? 'New best!' : 'Game over';
    title.classList.toggle('gold', best);
    $('perf-score').textContent = fmt(s.score);
    $('perf-words').textContent = fmt(s.words);
    $('perf-level').textContent = fmt(s.level);
    $('perf-chains').textContent = fmt(s.chains);
    $('perf-chains-sub').hidden = !(s.longestChain > 1);
    $('perf-chains-sub').textContent = `longest ×${s.longestChain}`;
    $('perf-rows').textContent = fmt(s.fullRows);
    $('perf-rows-sub').hidden = !s.fullRows; // full rows score nothing, so say so
    $('perf-best').textContent = s.bestWord ? s.bestWord.display : '–';
    $('perf-best-sub').hidden = !s.bestWord;
    if (s.bestWord) $('perf-best-sub').textContent = `${fmt(s.bestWord.points)} points`;
  }

  function setResultsNote(text, isError) {
    resultsNote.hidden = !text;
    resultsNote.textContent = text || '';
    resultsNote.classList.toggle('error', !!isError);
  }

  function showResultsPosted() {
    const here = posted && posted.gameId === game.sessionId;
    resultsPosted.hidden = !here;
    if (here) {
      resultsPosted.textContent = posted.rank
        ? `Posted as ${posted.nickname}: #${posted.rank} of ${posted.players}!`
        : `Posted as ${posted.nickname}!`;
    }
  }

  // Your row before you've posted: the name goes in a box, with Post under it.
  function youRow(r, gameId) {
    const li = el('li', 'entry mine you');
    const formEl = el('form', 'you-form');
    const input = el('input');
    Object.assign(input, {
      type: 'text', name: 'nickname', maxLength: 16, autocomplete: 'nickname', autocapitalize: 'words',
      spellcheck: false, enterKeyHint: 'send', placeholder: 'Nickname',
    });
    input.setAttribute('aria-label', 'Your nickname');
    input.value = store.get('nickname', ''); // returning players post in one tap
    const who = el('div', 'who');
    who.append(input);
    const btn = el('button', 'btn-primary btn-small', 'Post to scoreboard');
    btn.type = 'submit';
    const status = el('p', 'you-status');
    status.setAttribute('role', 'status');
    const actions = el('div', 'you-post');
    actions.append(btn, status);
    formEl.append(rankBadge(r.rank), who, el('span', 'coin', fmt(r.score)), actions);
    li.append(formEl);

    const say = (text, isError) => {
      status.textContent = text;
      status.classList.toggle('error', !!isError);
    };
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nick = board.cleanNickname(input.value);
      if (!nick) {
        say(NICK_RULE, true);
        input.focus();
        return;
      }
      input.disabled = btn.disabled = true;
      say('Posting…');
      try {
        await postGame(gameId, nick);
      } catch (err) {
        input.disabled = btn.disabled = false;
        say(postError(err), true);
        return;
      }
      // Draw the board again: your row is now a real one, with your name on it.
      focusCard(results); // the box is about to go; keep Space and Enter working
      showResultsPosted();
      showStanding();
    });
    return li;
  }

  function renderStanding(rows, gameId, score) {
    const items = [];
    let last = 0;
    for (const r of rows) {
      if (last && r.pos - last > 1) items.push(el('li', 'board-gap', '⋯'));
      last = r.pos;
      items.push(r.kind === 'you'
        ? youRow(r, gameId)
        : entry(r.rank, r.nickname || 'Player', when(r.posted_at), r.score, r.mine));
    }
    if (!items.length) items.push(note('No scores yet. Finish a game and post yours!'));
    resultsList.replaceChildren(...items);

    const players = rows.length ? rows[0].players : 0;
    $('rtab-count').textContent = players ? ` · ${fmt(players)} ${players === 1 ? 'player' : 'players'}` : '';
    const mine = rows.find((r) => r.mine && r.kind !== 'you');
    if (score <= 0) setResultsNote('Score some words to get on the scoreboard.');
    else if (mine && mine.score > score) {
      setResultsNote(`This game didn't beat your best (${fmt(mine.score)}), so you stay at #${mine.rank}.`);
    } else setResultsNote('');

    if (resultsTracked !== gameId) {
      resultsTracked = gameId;
      const you = rows.find((r) => r.mine);
      trackEvent('results_shown', {
        game_id: gameId, score, rank: you ? you.rank : null, players: players || null,
        can_post: rows.some((r) => r.kind === 'you'), has_board: true,
      });
    }
  }

  async function showStanding() {
    rTabBoard.hidden = !board.enabled; // no shared board here: My scores only
    if (!board.enabled) {
      if (resultsTracked !== game.sessionId) {
        resultsTracked = game.sessionId;
        trackEvent('results_shown', { game_id: game.sessionId || null, score: game.score, has_board: false });
      }
      return;
    }
    const request = ++standingRequest;
    const gameId = game.sessionId;
    const score = game.score;
    showResultsPosted();
    setResultsNote('');
    resultsList.replaceChildren(note('Finding your place…'));
    let rows;
    try {
      rows = (await board.standing(score)) || [];
    } catch {
      if (request !== standingRequest) return;
      const li = note("Couldn't load the scoreboard. ");
      const retry = el('button', 'link-btn', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', showStanding);
      li.append(retry);
      resultsList.replaceChildren(li);
      return;
    }
    if (request !== standingRequest || game.sessionId !== gameId) return;
    renderStanding(rows, gameId, score);
  }

  function openResults() {
    showStats();
    renderMine(resultsMine, { limit: RESULTS_MINE, short: true });
    selectResultsTab(board.enabled ? 'board' : 'mine');
    resultsOpenedAt = Date.now();
    openSheet(results);
    focusCard(results); // no phone keyboard popping up over the stats
    showStanding();
  }

  function playAgain() {
    closeSheet(results);
    ui.restart('play_again');
  }
  $('results-again').addEventListener('click', playAgain);

  // Space or Enter plays again, unless a box or button has the focus (a name being typed, say).
  results.addEventListener('keydown', (e) => {
    if ((e.key !== ' ' && e.key !== 'Enter') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, button, a')) return;
    e.preventDefault();
    if (!e.repeat && Date.now() - resultsOpenedAt > RESULTS_GUARD) playAgain();
  });

  ui.onGameOver((g) => {
    const id = g.sessionId;
    setTimeout(() => {
      if (game.state === 'over' && game.sessionId === id && !document.querySelector('dialog[open]')) openResults();
    }, RESULTS_DELAY);
  });

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
    trackEvent('tip_shown', { tip: t.id, game_id: game.sessionId || null, pieces: game.log.pieces.length });
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
  // On a keyboard, Enter or Space is "Got it".
  tipSheet.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('button')) {
      e.preventDefault();
      closeSheet(tipSheet);
    }
  });
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
    const toggle = () => {
      sound.set(!sound.on);
      trackEvent('sound_toggled', { on: sound.on });
    };
    soundBtn.addEventListener('click', toggle);
    soundToggle.addEventListener('click', toggle);
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
  };
  ui.refreshOverlay();

  // First visit: show how to play before the first game.
  if (!store.get('seenHowTo', false) && game.state === 'ready') openHowTo(true);
})();

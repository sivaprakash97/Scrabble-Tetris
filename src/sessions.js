// Saves every game so a session a person played can be reviewed later: each piece's
// letters, where it went, how long it took, and what it spelled.
//
// Where it goes depends on where the page runs:
// - On the Claude-hosted page (window.claude with the `db` and `user` capabilities): that
//   page's database. Layout: sessions/<player id>/games/<game id>, one document per game,
//   and sessions/<player id> = { lastGame, lastPlayedAt } so players can be listed.
// - On the website (ST.BACKEND, set in src/backend-config.js): the Supabase function
//   save_game(), which keeps one row per game in the `games` table. Players are anonymous:
//   a random id kept in their browser, with no name or account.
// - Anywhere else (a local file, a signed-out viewer): nothing is saved; the game plays on.
(function (W) {
  const ST = W.ST;
  const MAX_BYTES = 240 * 1024; // both stores cap a game at 256 KiB
  const SAVE_EVERY = 3; // pieces between saves while playing (10 lost short games, playtest 6)
  const PLAYER_KEY = 'alphaboom.player';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const newId = () => 'g-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6);

  // Long games: keep the board after every 5th piece (and the last) so the record fits.
  function fit(body) {
    if (JSON.stringify(body).length <= MAX_BYTES) return body;
    const last = body.pieces.length - 1;
    const pieces = body.pieces.map((p, i) => {
      if (i % 5 === 4 || i === last) return p;
      const { board, ...rest } = p;
      return rest;
    });
    return { ...body, pieces, trimmed: 'boards kept for every 5th piece' };
  }

  // ---- Claude-hosted page: the page's own database ----------------------------------------

  async function claudeStore(claude) {
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    const uid = db && user ? await user.id() : null;
    if (!uid) return null;
    const listed = new Set();
    return {
      backend: 'claude',
      async write(job) {
        const ref = db.doc(`sessions/${uid}/games/${job.id}`);
        try {
          await ref.set(job.body);
        } catch (e) {
          if (!e || e.code !== 'unavailable') throw e;
          await sleep(400 + Math.random() * 800);
          await ref.set(job.body);
        }
        if (!listed.has(job.id)) {
          await db.doc(`sessions/${uid}`).set({ lastGame: job.id, lastPlayedAt: job.body.savedAt });
          listed.add(job.id);
        }
      },
    };
  }

  // ---- Website: Supabase ------------------------------------------------------------------

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function randomUuid() {
    const c = W.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    const b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // The anonymous player id: kept in this browser so one person's games group together.
  // If storage is blocked, it lasts for this page visit only.
  function playerId() {
    try {
      const saved = W.localStorage.getItem(PLAYER_KEY);
      if (saved && UUID.test(saved)) return saved;
      const id = randomUuid();
      W.localStorage.setItem(PLAYER_KEY, id);
      return id;
    } catch {
      return randomUuid();
    }
  }

  function supabaseStore(backend) {
    const player = playerId();
    const url = backend.url.replace(/\/+$/, '') + '/rest/v1/rpc/save_game';
    return {
      backend: 'web',
      player,
      async write(job) {
        const body = JSON.stringify({ p_id: job.id, p_player: player, p_record: job.body });
        const post = () =>
          W.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: backend.publishableKey },
            body,
            // Lets a small save finish even if the page is closing (browsers cap this at 64 KB).
            keepalive: body.length < 60000,
          });
        let res;
        try {
          res = await post();
        } catch {
          await sleep(400 + Math.random() * 800); // network blip: try once more
          res = await post();
        }
        if (!res.ok) {
          const err = new Error(`save failed (${res.status})`);
          err.code = `http-${res.status}`;
          throw err;
        }
      },
    };
  }

  // Picks where this page saves to, or null when it can't save anywhere.
  async function pickStore() {
    const claude = W.claude;
    if (claude && typeof claude.use === 'function') {
      try {
        return await claudeStore(claude);
      } catch {
        return null;
      }
    }
    const backend = ST.BACKEND;
    if (backend && backend.url && backend.publishableKey && typeof W.fetch === 'function') {
      return supabaseStore(backend);
    }
    return null;
  }

  // ---- The saver the game uses ----------------------------------------------------------

  function createSessionSaver(onStatus) {
    let store = null;
    let busy = false;
    let pending = null;
    const startedAt = new Map();

    const ready = (async () => {
      store = await pickStore();
      if (!store) return false;
      onStatus('ready', { backend: store.backend });
      return true;
    })();

    // One write at a time; a save asked for mid-write replaces any older queued one.
    async function flush() {
      if (busy || !pending || !(await ready)) return;
      busy = true;
      const job = pending;
      pending = null;
      try {
        onStatus('saving');
        await store.write(job);
        onStatus('saved', job.body);
      } catch (e) {
        onStatus('error', (e && e.code) || 'unknown');
      } finally {
        busy = false;
        if (pending) flush();
      }
    }

    function save(game) {
      if (!game.sessionId) return;
      const now = new Date().toISOString();
      if (!startedAt.has(game.sessionId)) startedAt.set(game.sessionId, now);
      const body = {
        ...game.sessionRecord(),
        id: game.sessionId,
        startedAt: startedAt.get(game.sessionId),
        savedAt: now,
        screen: { w: W.innerWidth, h: W.innerHeight },
      };
      pending = { id: game.sessionId, body: fit(body) };
      flush();
    }

    return {
      ready,
      // A new game: give it an id and save its first state.
      begin(game) {
        game.sessionId = newId();
        save(game);
      },
      save,
      // Called for game events; saves every SAVE_EVERY pieces, on pause and at game over.
      onEvent(game, e) {
        if (e.type === 'over' || e.type === 'pause') save(game);
        else if (e.type === 'settled' && e.piece % SAVE_EVERY === 0) save(game);
      },
    };
  }

  ST.createSessionSaver = createSessionSaver;
})(window);

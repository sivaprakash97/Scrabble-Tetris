// Saves every game to this page's database, so a session a person played can be reviewed
// later: each piece's letters, where it went, how long it took, and what it spelled.
// Works only on the hosted page, which offers the `db` and `user` capabilities; when they
// aren't there (a local file, a signed-out viewer) nothing is saved and the game plays on.
//
// Layout: sessions/<player id>/games/<game id>  one document per game
//         sessions/<player id>                  { lastGame, lastPlayedAt }, so players can be listed
(function () {
  const ST = window.ST;
  const MAX_BYTES = 240 * 1024; // documents are capped at 256 KiB
  const SAVE_EVERY = 3; // pieces between saves while playing (10 lost short games, playtest 6)

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const newId = () => 'g-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6);

  // Long games: keep the board after every 5th piece (and the last) so the document fits.
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

  function createSessionSaver(onStatus) {
    let db = null;
    let uid = null;
    let busy = false;
    let pending = null;
    const startedAt = new Map();
    const listed = new Set();

    const ready = (async () => {
      const claude = window.claude;
      if (!claude || typeof claude.use !== 'function') return false;
      try {
        const [store, user] = await Promise.all([claude.use('db'), claude.use('user')]);
        const id = store && user ? await user.id() : null;
        if (!id) return false;
        db = store;
        uid = id;
        onStatus('ready');
        return true;
      } catch {
        return false;
      }
    })();

    async function write(job) {
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
    }

    // One write at a time; a save asked for mid-write replaces any older queued one.
    async function flush() {
      if (busy || !pending || !(await ready)) return;
      busy = true;
      const job = pending;
      pending = null;
      try {
        onStatus('saving');
        await write(job);
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
        screen: { w: window.innerWidth, h: window.innerHeight },
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
})();

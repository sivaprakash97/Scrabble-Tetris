// Tests for src/sessions.js: where games are saved, what's sent, and how often.
// The file is a browser script, so each test loads it into a stub `window`.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SESSIONS = path.join(__dirname, '..', 'src', 'sessions.js');
const tick = () => new Promise((r) => setTimeout(r, 0));

// Loads sessions.js against a fresh stub window and returns its saver plus what it did.
function load({ claude, backend, storage = new Map(), status = 204 } = {}) {
  const requests = [];
  const statuses = [];
  const docs = [];
  const window = {
    ST: { BACKEND: backend },
    innerWidth: 400,
    innerHeight: 800,
    claude,
    crypto: require('node:crypto').webcrypto,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    fetch: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return { ok: status < 300, status };
    },
  };
  globalThis.window = window;
  delete require.cache[require.resolve(SESSIONS)];
  require(SESSIONS);
  delete globalThis.window;
  const saver = window.ST.createSessionSaver((state, info) => statuses.push({ state, info }));
  return { saver, requests, statuses, docs, storage };
}

const fakeGame = () => ({
  sessionRecord: () => ({ status: 'in progress', score: 10, words: 1, pieceCount: 0, pieces: [] }),
});

// Starts a game and settles `pieces` pieces, letting each save finish.
async function play(saver, pieces) {
  await saver.ready;
  const game = fakeGame();
  saver.begin(game);
  await tick();
  for (let piece = 1; piece <= pieces; piece++) {
    saver.onEvent(game, { type: 'settled', piece });
    for (let i = 0; i < 5; i++) await tick();
  }
  return game;
}

const BACKEND = { url: 'https://example.supabase.co/', publishableKey: 'sb_publishable_test' };

test('on the website it posts each save to the Supabase save_game function', async () => {
  const { saver, requests, statuses } = load({ backend: BACKEND });
  const game = await play(saver, 9);
  assert.equal(requests.length, 4, 'start + every 3rd of 9 pieces');
  const { url, init, body } = requests[0];
  assert.equal(url, 'https://example.supabase.co/rest/v1/rpc/save_game');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.apikey, 'sb_publishable_test');
  assert.equal(body.p_id, game.sessionId);
  assert.match(body.p_id, /^g-[0-9A-Za-z-]{10,60}$/, 'matches the id check in save_game');
  assert.match(body.p_player, /^[0-9a-f-]{36}$/);
  assert.equal(body.p_record.score, 10);
  assert.ok(body.p_record.startedAt && body.p_record.savedAt);
  assert.deepEqual(statuses[0], { state: 'ready', info: { backend: 'web' } });
});

test('the anonymous player id is kept between visits', async () => {
  const storage = new Map();
  const first = load({ backend: BACKEND, storage });
  await play(first.saver, 0);
  const second = load({ backend: BACKEND, storage });
  await play(second.saver, 0);
  assert.equal(first.requests[0].body.p_player, second.requests[0].body.p_player);
  assert.equal(storage.get('alphaboom.player'), first.requests[0].body.p_player);
});

test('a failed save is reported to the page, not thrown', async () => {
  const { saver, requests, statuses } = load({ backend: BACKEND, status: 500 });
  await play(saver, 0);
  assert.equal(requests.length, 1);
  assert.deepEqual(statuses.at(-1), { state: 'error', info: 'http-500' });
});

test('on the Claude page it saves to the page database, not the website backend', async () => {
  const written = [];
  const db = { doc: (p) => ({ set: async (body) => written.push({ path: p, body }) }) };
  const claude = { use: async (name) => (name === 'db' ? db : { id: async () => 'u_test' }) };
  const { saver, requests, statuses } = load({ claude, backend: BACKEND });
  await play(saver, 3);
  assert.equal(requests.length, 0);
  const games = written.filter((w) => w.path.startsWith('sessions/u_test/games/'));
  assert.equal(games.length, 2, 'start + piece 3');
  assert.deepEqual(statuses[0], { state: 'ready', info: { backend: 'claude' } });
});

test('with no backend it saves nothing and never reports ready', async () => {
  const { saver, requests, statuses } = load({});
  assert.equal(await saver.ready, false);
  await play(saver, 6);
  assert.equal(requests.length, 0);
  assert.equal(statuses.length, 0);
});

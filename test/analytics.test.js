// Tests for src/analytics.js: where PostHog turns on, how it's set up, and the game summary.
// The file is a browser script, so each test loads it into a stub `window`.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ANALYTICS = path.join(__dirname, '..', 'src', 'analytics.js');

function load({ env = 'production', protocol = 'https:', claude, key = 'phc_test', storage = new Map() } = {}) {
  const scripts = [];
  const window = {
    ST: {
      DEPLOY: { env, branch: 'main', commit: 'abc1234' },
      ANALYTICS: { key, host: 'https://us.i.posthog.com' },
      playerId: () => '11111111-2222-4333-8444-555555555555',
    },
    claude,
    location: { protocol },
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    document: {
      createElement: () => ({}),
      getElementsByTagName: () => [{ parentNode: { insertBefore: (s) => scripts.push(s) } }],
    },
  };
  globalThis.window = window;
  delete require.cache[require.resolve(ANALYTICS)];
  require(ANALYTICS);
  delete globalThis.window;
  return { window, scripts, storage, analytics: window.ST.analytics };
}

// The calls queued on PostHog's stand-in before its library loads, e.g. ['capture', name, props].
const queued = (window, method) => window.posthog.filter((c) => Array.isArray(c) && c[0] === method);

test('the live site loads PostHog without cookies, under the anonymous player id', () => {
  const { window, scripts, analytics } = load();
  assert.equal(analytics.enabled, true);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://us-assets.i.posthog.com/static/array.js');
  const [key, config] = window.posthog._i[0];
  assert.equal(key, 'phc_test');
  assert.equal(config.persistence, 'memory');
  assert.equal(config.bootstrap.distinctID, '11111111-2222-4333-8444-555555555555');
  assert.equal(config.autocapture, false, 'control taps must not each become an event');
  assert.equal(config.session_recording.maskAllInputs, true);
  const [[, props]] = queued(window, 'register');
  assert.equal(props.deploy_env, 'production');
  assert.equal(props.app_version, 'abc1234');
});

test('a Vercel build that cannot tell its environment counts as live, like the scoreboard', () => {
  assert.equal(load({ env: 'unknown' }).analytics.enabled, true);
});

test('sandboxes (preview links, local copies), local files, the Claude page and an empty key send nothing', () => {
  for (const opts of [{ env: 'preview' }, { env: 'development' }, { protocol: 'file:' }, { claude: { use() {} } }, { key: '' }]) {
    const { window, scripts, analytics } = load(opts);
    assert.equal(analytics.enabled, false, JSON.stringify(opts));
    assert.equal(scripts.length, 0);
    assert.equal(window.posthog, undefined);
    analytics.track('anything'); // a no-op, not an error
  }
});

test('game_started counts games on this device; a device with a best score is not new', () => {
  const fresh = load();
  const game = { sessionId: 'g-1', settings: { minLen: 3 } };
  fresh.analytics.gameStarted(game, 'start');
  fresh.analytics.gameStarted(game, 'play_again');
  const [first, second] = queued(fresh.window, 'capture').map((c) => c[2]);
  assert.equal(first.first_game, true);
  assert.equal(first.game_number, 1);
  assert.equal(second.first_game, false);
  assert.equal(second.from, 'play_again');

  const returning = load({ storage: new Map([['alphaboom.best', '420']]) });
  returning.analytics.gameStarted(game, 'start');
  assert.equal(queued(returning.window, 'capture')[0][2].first_game, false);
});

test('first_word is sent once per game, and game_over carries the summary', () => {
  const { window, analytics } = load();
  const record = {
    score: 150, level: 1, playMs: 60000, pauses: 0, maxChain: 2, bestWord: { display: 'CATS', points: 100 },
    pieces: [
      { helper: null, words: [], junkRows: 0, junkTiles: 0 },
      { helper: 'S', words: [{ word: 'CATS', chain: 1, points: 100 }, { word: 'DOG', chain: 2, points: 50 }], junkRows: 0, junkTiles: 0 },
      { helper: 'E', words: [], junkRows: 1, junkTiles: 7 },
    ],
  };
  const game = {
    sessionId: 'g-1', clock: 30000, log: { pieces: record.pieces.slice(0, 2) },
    inputs: { touch: 40 }, analytics: { gameNumber: 1 }, sessionRecord: () => record,
  };
  analytics.onEvent(game, { type: 'words', found: [{ display: 'CATS' }] });
  analytics.onEvent(game, { type: 'words', found: [{ display: 'DOG' }] });
  analytics.onEvent(game, { type: 'over' });
  const sent = queued(window, 'capture').map((c) => [c[1], c[2]]);
  assert.deepEqual(sent.map((s) => s[0]), ['first_word', 'game_over']);
  assert.equal(sent[0][1].word, 'CATS');
  assert.equal(sent[0][1].pieces, 2);
  const over = sent[1][1];
  assert.equal(over.input, 'touch');
  assert.equal(over.first_game, true);
  assert.equal(over.words, 2);
  assert.equal(over.chain_words, 1);
  assert.equal(over.full_rows, 1);
  assert.equal(over.full_row_tile_pct, 50, '7 full-row tiles of 14 cleared');
  assert.equal(over.helper_pieces, 2);
  assert.equal(over.helper_hits, 1);
  assert.equal(over.pieces_to_first_word, 2);
  assert.equal(over.longest_word, 4);
  assert.equal(over.words_3, 1);
  assert.equal(over.play_min, 1);
});

test('a game with no words or clears summarizes without dividing by zero', () => {
  const { analytics } = load();
  const s = analytics.summarize({ score: 0, pieces: [{ words: [] }] });
  assert.equal(s.full_row_tile_pct, null);
  assert.equal(s.avg_word_len, null);
  assert.equal(s.pieces_to_first_word, null);
  assert.equal(s.words_per_piece, 0);
});

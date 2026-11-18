// Product analytics with PostHog: who plays, where new players get stuck, and whether they come
// back. The full game record still goes to Supabase (src/sessions.js); this sends only a few
// milestones per visit, each small:
//
//   game_started     a game began (from the start screen, Play again, or the pause screen)
//   first_word       the first word of a game: how many pieces and how long it took
//   game_over        a summary of the game (score, words, full-row share, chains, input, ...)
//   tutorial_closed  How to play closed: how far the player got, and whether it opened by itself
//   tip_shown        a first-time tip popped up
//   scoreboard_opened, score_posted, game_log_copied, sound_toggled
//
// Plus page views, page leaves, session recordings (typing is masked) and JavaScript errors.
//
// Where it runs: only the live site. Every sandbox sends nothing: preview links ('preview') and
// local copies ('development'), the same rule that keeps them off the live scoreboard (see
// src/backend-config.js). The Claude page and local files send nothing either.
//
// Privacy: no cookies and nothing stored on the device by PostHog (persistence: 'memory'). The
// PostHog id is the same anonymous player id the saved games use (alphaboom.player), so the two
// can be joined. The project key in src/backend-config.js is meant to be public.
(function (W) {
  const ST = W.ST;
  const settings = ST.ANALYTICS || {};
  const deploy = ST.DEPLOY || {};
  const env = deploy.env || 'unknown';
  const onClaudePage = !!(W.claude && typeof W.claude.use === 'function');
  const onWeb = !!(W.location && /^https?:$/.test(W.location.protocol));
  const sandbox = env === 'preview' || env === 'development';
  const enabled = !!settings.key && !onClaudePage && onWeb && !sandbox &&
    !!W.document && typeof ST.playerId === 'function';

  // ---- what a finished game adds up to (pure; tested in test/analytics.test.js) ------------

  function summarize(record, extra = {}) {
    const pieces = (record && record.pieces) || [];
    const words = pieces.flatMap((p) => p.words || []);
    const lengths = words.map((w) => String(w.word || '').length);
    const wordTiles = lengths.reduce((a, b) => a + b, 0);
    const fullRows = pieces.reduce((n, p) => n + (p.junkRows || 0), 0);
    const junkTiles = pieces.reduce((n, p) => n + (p.junkTiles || 0), 0);
    const helperPieces = pieces.filter((p) => p.helper);
    const firstAt = pieces.findIndex((p) => p.words && p.words.length);
    const share = (part, whole) => (whole ? Math.round((1000 * part) / whole) / 10 : null);
    return {
      score: record.score || 0,
      words: words.length,
      level: record.level || 1,
      pieces: pieces.length,
      play_ms: record.playMs || 0,
      play_min: Math.round((record.playMs || 0) / 6000) / 10,
      pauses: record.pauses || 0,
      max_chain: record.maxChain || 0,
      chain_words: words.filter((w) => w.chain > 1).length,
      best_word: record.bestWord ? record.bestWord.display : null,
      best_points: record.bestWord ? record.bestWord.points : null,
      longest_word: lengths.length ? Math.max(...lengths) : 0,
      avg_word_len: lengths.length ? Math.round((10 * wordTiles) / lengths.length) / 10 : null,
      words_3: lengths.filter((n) => n === 3).length,
      words_4: lengths.filter((n) => n === 4).length,
      words_5_plus: lengths.filter((n) => n >= 5).length,
      words_per_piece: pieces.length ? Math.round((100 * words.length) / pieces.length) / 100 : 0,
      full_rows: fullRows,
      // Of all tiles cleared, the share that went in full rows (which score nothing).
      full_row_tile_pct: share(junkTiles, junkTiles + wordTiles),
      // Pieces given a helper letter, and how many of those made a word straight away.
      helper_pieces: helperPieces.length,
      helper_hits: helperPieces.filter((p) => (p.words || []).some((w) => w.chain === 1)).length,
      pieces_to_first_word: firstAt >= 0 ? firstAt + 1 : null,
      ...extra,
    };
  }

  // ---- PostHog --------------------------------------------------------------------------

  // PostHog's standard loader: a stand-in that queues calls until the real library arrives
  // from PostHog's own asset host.
  function loadPostHog(host) {
    if (W.posthog && W.posthog.__SV) return W.posthog;
    const ph = (W.posthog = []);
    ph._i = [];
    ph.init = function (key, config, name) {
      const s = W.document.createElement('script');
      s.type = 'text/javascript';
      s.crossOrigin = 'anonymous';
      s.async = true;
      s.src = host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
      const first = W.document.getElementsByTagName('script')[0];
      first.parentNode.insertBefore(s, first);
      const methods = 'capture register register_once unregister identify reset get_distinct_id ' +
        'get_session_id captureException startSessionRecording stopSessionRecording ' +
        'getFeatureFlag isFeatureEnabled onFeatureFlags opt_in_capturing opt_out_capturing set_config';
      for (const m of methods.split(' ')) {
        ph[m] = function () { ph.push([m].concat(Array.prototype.slice.call(arguments, 0))); };
      }
      ph._i.push([key, config, name]);
    };
    ph.__SV = 1;
    return ph;
  }

  let ph = null;
  const local = (key, fallback) => {
    try {
      const v = W.localStorage.getItem('alphaboom.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  };
  const saveLocal = (key, value) => {
    try { W.localStorage.setItem('alphaboom.' + key, JSON.stringify(value)); } catch {}
  };

  if (enabled) {
    try {
      const host = settings.host || 'https://us.i.posthog.com';
      ph = loadPostHog(host);
      ph.init(settings.key, {
        api_host: host,
        ui_host: settings.uiHost || 'https://us.posthog.com',
        persistence: 'memory', // no cookies, nothing kept on the device by PostHog
        bootstrap: { distinctID: ST.playerId() },
        person_profiles: 'always',
        autocapture: false, // the control pad would send an event per tap
        capture_pageview: true,
        capture_pageleave: true,
        rageclick: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        disable_surveys: true,
        capture_exceptions: true,
        session_recording: { maskAllInputs: true },
      });
      const wide = W.matchMedia && W.matchMedia('(min-width: 1000px) and (hover: hover) and (pointer: fine)').matches;
      const coarse = W.matchMedia && W.matchMedia('(pointer: coarse)').matches;
      ph.register({
        app: 'alphaboom',
        deploy_env: env,
        branch: deploy.branch || null,
        app_version: deploy.commit || null,
        layout: wide ? 'wide' : 'phone',
        touch_screen: !!coarse,
      });
    } catch (e) {
      ph = null;
      if (W.console) W.console.warn('analytics off:', e);
    }
  }

  // Always through window.posthog: when the library arrives it replaces the stand-in there,
  // so a reference kept from before would keep queueing onto the stand-in, never sent.
  function track(name, props) {
    if (!ph) return;
    try { W.posthog.capture(name, props || {}); } catch {}
  }

  // ---- game milestones ------------------------------------------------------------------

  let firstWordSent = null; // the game id whose first word has been sent

  function gameStarted(game, from) {
    // Games started on this device. Counting began with analytics; a device that already has
    // a best score has played before, so it starts at 1 rather than looking brand new.
    let started = local('gamesStarted', null);
    if (started == null) started = local('best', null) != null ? 1 : 0;
    started += 1;
    saveLocal('gamesStarted', started);
    game.analytics = { gameNumber: started };
    track('game_started', {
      game_id: game.sessionId || null,
      from: from || 'start',
      game_number: started,
      first_game: started === 1,
      min_word_len: game.settings && game.settings.minLen,
    });
  }

  function onEvent(game, e) {
    if (!ph) return;
    const gameNumber = game.analytics ? game.analytics.gameNumber : null;
    if (e.type === 'words' && firstWordSent !== game.sessionId) {
      firstWordSent = game.sessionId;
      const w = e.found[0];
      track('first_word', {
        game_id: game.sessionId || null,
        word: w && w.display,
        letters: w && w.display ? w.display.length : null,
        pieces: game.log.pieces.length,
        play_ms: Math.round(game.clock || 0),
        game_number: gameNumber,
        first_game: gameNumber === 1,
      });
    } else if (e.type === 'over') {
      const inputs = game.inputs || {};
      const used = Object.keys(inputs).filter((k) => inputs[k] > 0);
      track('game_over', summarize(game.sessionRecord(), {
        game_id: game.sessionId || null,
        game_number: gameNumber,
        first_game: gameNumber === 1,
        input: used.length === 0 ? 'none' : used.length === 1 ? used[0] : 'mixed',
        presses_keyboard: inputs.keyboard || 0,
        presses_touch: inputs.touch || 0,
        presses_mouse: inputs.mouse || 0,
      }));
    }
  }

  ST.analytics = { enabled: !!ph, track, gameStarted, onEvent, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

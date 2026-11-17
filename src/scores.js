// The website's scoreboard: players post a finished game under a nickname, and everyone sees
// each player's best posted game. Talks to two Supabase functions (supabase/scoreboard.sql):
// post_score() and top_scores(). Neither reveals player ids: the board marks your own row.
//
// Only on the website. On the Claude page and in a local file there is no shared board.
(function (W) {
  const ST = W.ST;
  const backend = ST.BACKEND;
  const onClaudePage = !!(W.claude && typeof W.claude.use === 'function');
  const enabled = !onClaudePage && !!(backend && backend.url && backend.publishableKey) &&
    typeof W.fetch === 'function' && typeof ST.playerId === 'function';
  const base = enabled ? backend.url.replace(/\/+$/, '') + '/rest/v1/rpc/' : '';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function rpc(name, args) {
    const res = await W.fetch(base + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: backend.publishableKey },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && data.message) || `request failed (${res.status})`);
      err.reason = (data && data.message) || '';
      throw err;
    }
    return data;
  }

  // Nicknames: 2-16 letters, numbers, spaces or _ . ' -, with at least one letter or number.
  // The database checks the same rule.
  function cleanNickname(s) {
    const nick = String(s || '').trim().replace(/\s+/g, ' ');
    const ok = nick.length >= 2 && nick.length <= 16 && /^[\p{L}\p{N} _.'-]+$/u.test(nick) && /[\p{L}\p{N}]/u.test(nick);
    return ok ? nick : null;
  }

  ST.scoreboard = {
    enabled,
    cleanNickname,
    // Each player's best posted game, top `limit`, plus your own row if it's further down.
    top(limit = 20) {
      return rpc('top_scores', { p_player: ST.playerId(), p_limit: limit });
    },
    // Posts a finished game. The game's last save may still be on its way, so a game the
    // database hasn't seen finish yet is retried for a few seconds.
    // Resolves to { rank, players }.
    async post(gameId, nickname) {
      for (let attempt = 0; ; attempt++) {
        try {
          const rows = await rpc('post_score', { p_game: gameId, p_player: ST.playerId(), p_nickname: nickname });
          return (rows && rows[0]) || null;
        } catch (e) {
          if (attempt < 6 && /game not (found|finished)/.test(e.reason)) {
            await sleep(800);
            continue;
          }
          throw e;
        }
      }
    },
  };
})(window);

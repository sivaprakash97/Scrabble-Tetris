// Where the website saves games: the Supabase project "alphaboom" (see src/sessions.js and
// DESIGN.md, "Hosting and saving").
//
// The publishable key is meant to be public: with it a browser can only call save_game_v2(),
// which adds or updates one game. It can't read, list or delete anything; the `games` table
// has row-level security with no policies. Saved games are read with the project's secret
// key or the Supabase dashboard, never from the page.
//
// Delete this file's settings (or set url to '') to turn website saving off.
//
// Sandbox: only the live site (ST.DEPLOY.env 'production', from src/deploy.js) saves to the live
// board. Preview links and local copies save games and post scores to the sandbox board, so
// testing never shows up on the live scoreboard. A build that can't tell counts as live, which
// is how the game behaved before the sandbox existed.
(function (root) {
  const ST = (root.ST = root.ST || {});
  ST.BACKEND = {
    url: 'https://nkmgngaxequbzobhmalj.supabase.co',
    publishableKey: 'sb_publishable_xyOesUPqOz_JP9T13heljA_ewUVNoaS',
  };
  // Product analytics (src/analytics.js): the PostHog project "Alphaboom" on the US cloud.
  // The project key is meant to be public: it can only send events. Set key to '' to turn
  // analytics off.
  ST.ANALYTICS = {
    key: 'phc_sBgDbw3GkmsxQdEchL9hPMQ4PaUEPMHxuRFdMqVU2JPF',
    host: 'https://us.i.posthog.com',
    uiHost: 'https://us.posthog.com',
  };
  const env = (ST.DEPLOY && ST.DEPLOY.env) || 'unknown';
  ST.BACKEND.sandbox = env === 'preview' || env === 'development';
  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

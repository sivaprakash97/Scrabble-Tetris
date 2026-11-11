// Where the website saves games: the Supabase project "alphaboom" (see src/sessions.js and
// DESIGN.md, "Hosting and saving").
//
// The publishable key is meant to be public: with it a browser can only call save_game(),
// which adds or updates one game. It can't read, list or delete anything; the `games` table
// has row-level security with no policies. Saved games are read with the project's secret
// key or the Supabase dashboard, never from the page.
//
// Delete this file's settings (or set url to '') to turn website saving off.
(function (root) {
  const ST = (root.ST = root.ST || {});
  ST.BACKEND = {
    url: 'https://nkmgngaxequbzobhmalj.supabase.co',
    publishableKey: 'sb_publishable_xyOesUPqOz_JP9T13heljA_ewUVNoaS',
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

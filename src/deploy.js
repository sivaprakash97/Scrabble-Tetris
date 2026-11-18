// Which copy of the game this is. The website build (scripts/build-web.mjs) replaces this file
// with what Vercel says: 'production' for the live site, 'preview' for a branch's preview link.
// This checked-in version is for local copies: 'development'.
//
// Anything but the live site is a sandbox: its games and scores go to the sandbox board, never
// the live one (see src/backend-config.js and supabase/sandbox.sql).
(function (root) {
  const ST = (root.ST = root.ST || {});
  ST.DEPLOY = { env: 'development', branch: '', commit: '' };
  if (typeof module !== 'undefined' && module.exports) module.exports = ST;
})(typeof window !== 'undefined' ? window : globalThis);

// Loads the browser scripts into Node's global ST namespace.
for (const f of ['config', 'tiles', 'pieces', 'words', 'board', 'game']) require(`../src/${f}.js`);
require('../data/words.js');

const ST = globalThis.ST;
let dict;

module.exports = {
  ST,
  cfg: ST.CONFIG,
  dict() {
    if (!dict) dict = new ST.Dictionary(ST.WORDS, ST.CONFIG);
    return dict;
  },
  // 'XCATSZ' -> array of tiles. 'q' is a Qu tile, '*' a blank.
  tiles(s) {
    return [...s].map((ch) => ST.makeTile(ch === 'q' ? 'QU' : ch, ST.CONFIG));
  },
};

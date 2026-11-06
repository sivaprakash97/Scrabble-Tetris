const test = require('node:test');
const assert = require('node:assert/strict');
const { ST, dict } = require('./helpers');

const def = (w) => ST.lookupDefinition(w);

test('base words get their own definition', () => {
  assert.equal(def('cat').lemma, 'cat');
  assert.equal(def('cat').pos, 'noun');
  assert.match(def('cat').gloss, /feline/);
  assert.equal(def('hog').pos, 'noun');
});

test('inflected words point at their base form', () => {
  assert.equal(def('cats').lemma, 'cat');
  assert.equal(def('went').lemma, 'go');
  assert.equal(def('mice').lemma, 'mouse');
  assert.equal(def('mice').pos, 'noun');
  assert.equal(def('dies').pos, 'verb');
});

test('hand-written definitions cover the words WordNet lacks or misreads', () => {
  assert.equal(def('the').pos, 'article');
  assert.equal(def('his').lemma, 'his'); // not the plural of "hi"
  assert.equal(def('his').pos, 'pronoun');
  assert.equal(def('who').pos, 'pronoun'); // not the World Health Organization
  assert.equal(def('wow').pos, 'interjection');
});

test('lookup is case-insensitive and ignores built-in object names', () => {
  assert.equal(def('CAT').lemma, 'cat');
  assert.equal(def('zzzz'), null);
  assert.equal(def('toString'), null);
});

test('at least 97% of the word list has a definition', () => {
  const words = [...dict().set];
  const defined = words.filter((w) => def(w)).length;
  assert.ok(defined / words.length >= 0.97, `${((100 * defined) / words.length).toFixed(1)}%`);
});

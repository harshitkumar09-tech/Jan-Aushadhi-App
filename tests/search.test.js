const test = require('node:test');
const assert = require('node:assert');
const catalog = require('../js/data/medicines.js');
const S = require('../js/search.js');

const index = S.buildIndex(catalog.medicines, catalog);
const top = (q, opts) => S.search(index, q, opts).items[0];

test('brand name finds the Jan Aushadhi generic and says which brand matched', () => {
  const r = top('Dolo 650');
  assert.strictEqual(r.med.name, 'Paracetamol 650 mg Tablet');
  assert.strictEqual(r.matchedBrand, 'Dolo 650');
});

test('generic name ranks the plain medicine above combinations', () => {
  const items = S.search(index, 'paracetamol').items.map((i) => i.med.salt);
  assert.strictEqual(items[0], 'Paracetamol');
  assert.ok(items.indexOf('Ibuprofen + Paracetamol') > 0);
});

test('typos are tolerated', () => {
  assert.strictEqual(top('paracetmol').med.salt, 'Paracetamol');
  assert.strictEqual(top('metfromin').med.salt, 'Metformin');
  assert.strictEqual(top('dollo').matchedBrand, 'Dolo 650');
});

test('Hinglish and Hindi keywords work', () => {
  assert.strictEqual(top('bukhar').med.cls, 'antipyretic');
  assert.strictEqual(top('बुखार').med.cls, 'antipyretic');
  assert.ok(S.search(index, 'sugar').items.every((i) => /diab|surg/.test(i.med.category)));
});

test('"B12" and "D3" style names are matched as one word', () => {
  assert.deepStrictEqual(S.tokenize('Vitamin B12 / D3 60K 12.5mg'), ['vitamin', 'b12', 'd3', '60', 'k', '12.5', 'mg']);
  assert.strictEqual(top('b12').med.cls, 'b12');
});

test('short queries do not search (min length) unless a category is chosen', () => {
  const r = S.search(index, 'pa');
  assert.strictEqual(r.tooShort, true);
  assert.strictEqual(r.total, 0);
  const cat = S.search(index, '', { category: 'heart' });
  assert.ok(cat.total > 10);
  assert.ok(cat.items.every((i) => i.med.category === 'heart'));
});

test('every word typed must match (no irrelevant results)', () => {
  const r = S.search(index, 'pantoprazole 20');
  assert.strictEqual(r.total, 0);
  assert.ok(S.search(index, 'dolo 650').items.every((i) => i.med.strength.includes('650')));
});

test('no result gives "did you mean" suggestions', () => {
  const r = S.search(index, 'xyzabc');
  assert.strictEqual(r.total, 0);
  assert.ok(r.didYouMean.includes('xyzal'));
});

test('search over the whole catalogue is fast', () => {
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) S.search(index, 'amlodipine 5');
  assert.ok((Date.now() - t0) / 200 < 5, 'each search should take well under 5 ms');
});

test('levenshtein handles swaps, inserts and early exit', () => {
  assert.strictEqual(S.levenshtein('metfromin', 'metformin', 2), 1);
  assert.strictEqual(S.levenshtein('dolo', 'dollo', 1), 1);
  assert.ok(S.levenshtein('abc', 'xyz12345', 2) > 2);
});

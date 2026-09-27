const test = require('node:test');
const assert = require('node:assert');
const catalog = require('../js/data/medicines.js');
const K = require('../js/data/kendras.js');
const S = require('../js/services.js');

const med = (id) => catalog.medicines.find((m) => m.id === id);

test('alternatives: same-salt brands, other strengths and similar medicines', () => {
  const alt = S.alternativesFor(med('m039'), catalog); // Telmisartan 40
  assert.ok(alt.brands.some((b) => b.name === 'Telma 40'));
  assert.ok(alt.brands.every((b, i, a) => i === 0 || a[i - 1].price <= b.price), 'brands sorted by price');
  assert.ok(alt.similar.some((m) => m.salt === 'Losartan'), 'another ARB is a similar medicine');
  assert.ok(alt.similar.every((m) => m.cls === 'arb' && m.salt !== 'Telmisartan'));
  assert.ok(alt.related.every((m) => !m.salt.includes('Telmisartan')), 'related list never repeats the same salt');
});

test('alternatives: other strengths of the same salt', () => {
  const alt = S.alternativesFor(med('m002'), catalog); // Paracetamol 650
  const ids = alt.strengths.map((m) => m.id);
  assert.ok(ids.includes('m001') && ids.includes('m003'));
  assert.ok(!ids.includes('m002'));
});

test('every medicine has alternatives, except items with nothing comparable in the sample data', () => {
  const none = catalog.medicines.filter((m) => {
    const a = S.alternativesFor(m, catalog);
    return a.brands.length + a.strengths.length + a.similar.length + a.related.length === 0;
  }).map((m) => m.name);
  assert.deepStrictEqual(none, ['N95 Face Mask']);
});

test('savings are computed against the brand average', () => {
  const ps = S.priceSummary(med('m059')); // Pantoprazole 40, JA 8 vs brands 155/150/120
  assert.strictEqual(Math.round(ps.avg), 142);
  assert.strictEqual(ps.savePct, 94);
  assert.strictEqual(S.pct(10, 8), 0, 'never shows negative savings');
});

test('kendras are sorted by real distance and far ones are not shown silently', () => {
  const haldwani = K.cities.find((c) => c.id === 'haldwani');
  const r = S.kendrasNear(K.kendras, haldwani, 5);
  assert.strictEqual(r.items.length, 2);
  assert.ok(r.items.every((x) => x.kendra.city === 'Haldwani'));
  assert.ok(r.items[0].km <= r.items[1].km);

  const nowhere = { lat: 23.0, lng: 72.5 }; // no Kendra in the sample data nearby
  const far = S.kendrasNear(K.kendras, nowhere, 50);
  assert.strictEqual(far.items.length, 0);
  assert.ok(far.nearestOutside.km > 50, 'the UI gets the nearest one to explain instead');
});

test('permanently closed kendras are hidden unless asked for', () => {
  const g = K.cities.find((c) => c.id === 'gurugram');
  assert.ok(S.kendrasNear(K.kendras, g, 10).items.every((x) => x.kendra.status !== 'closed'));
  assert.ok(S.kendrasNear(K.kendras, g, 10, { includeClosed: true }).items.some((x) => x.kendra.status === 'closed'));
});

test('opening hours', () => {
  const k = { opens: '09:00', closes: '21:00', status: 'active' };
  assert.strictEqual(S.openState(k, new Date(2026, 8, 26, 10, 0)).open, true);
  assert.strictEqual(S.openState(k, new Date(2026, 8, 26, 22, 0)).open, false);
  assert.strictEqual(S.openState({ opens: '00:00', closes: '23:59', status: 'active' }, new Date(2026, 8, 26, 3, 0)).open, true);
  assert.strictEqual(S.fmtTime('21:00'), '9:00 PM');
});

test('stock is stable, and a user report overrides it', () => {
  const k = K.kendras[0], m = med('m002');
  const a = S.stockFor(k, m, {}), b = S.stockFor(k, m, {});
  assert.deepStrictEqual(a, b);
  assert.ok(a.minutesAgo >= 2 && a.minutesAgo < 120);
  assert.strictEqual(S.stockFor(k, m, { [k.id + '|' + m.id]: { at: 1 } }).status, 'reported');
  const closed = K.kendras.find((x) => x.status === 'closed');
  assert.strictEqual(S.stockFor(closed, m, {}).status, 'na');
});

test('a low-stock Kendra (like the Ludhiana civil hospital one) has most items missing', () => {
  const ludhiana = K.kendras.find((k) => k.id === 'k34');
  const available = catalog.medicines.filter((m) => S.isAvailable(S.stockFor(ludhiana, m, {}))).length;
  assert.ok(available < catalog.medicines.length * 0.4);
});

/*
 * Business logic that does not touch the page: alternatives, savings,
 * Kendra distance / opening hours, and (simulated) live stock.
 * Kept separate so it can be unit-tested with `node --test`.
 */
(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { window.JA = window.JA || {}; window.JA.services = api; }
})(function () {
  'use strict';

  /* ---------------- Prices & savings ---------------- */

  function priceSummary(med) {
    var prices = (med.brands || []).map(function (b) { return b.price; });
    if (!prices.length) return { count: 0, avg: null, min: null, max: null, savePct: 0, saveMaxPct: 0 };
    var sum = prices.reduce(function (a, b) { return a + b; }, 0);
    var avg = sum / prices.length;
    var max = Math.max.apply(null, prices);
    return {
      count: prices.length,
      avg: avg,
      min: Math.min.apply(null, prices),
      max: max,
      savePct: pct(med.price, avg),
      saveMaxPct: pct(med.price, max)
    };
  }

  /** % saved by paying `ja` instead of `brand` (0 if the generic is not cheaper). */
  function pct(ja, brand) {
    if (!brand || brand <= ja) return 0;
    return Math.round(((brand - ja) / brand) * 100);
  }

  /* ---------------- Alternatives ---------------- */

  /**
   * Alternatives for one medicine:
   *  brands    - branded medicines with the SAME salt + strength (what you would buy at a normal chemist)
   *  strengths - Jan Aushadhi medicines with the same salt but another strength / form
   *  similar   - same therapeutic class, different salt (e.g. Telmisartan -> Losartan). Doctor must decide.
   *  related   - same family, different class (e.g. ARB -> calcium channel blocker). Doctor must decide.
   */
  function alternativesFor(med, catalog) {
    var meds = catalog.medicines;
    var classes = catalog.classes || {};
    var family = (classes[med.cls] || {}).family;

    var brands = (med.brands || []).map(function (b) {
      return { name: b.name, price: b.price, save: b.price - med.price, savePct: pct(med.price, b.price) };
    }).sort(function (a, b) { return a.price - b.price; });

    var strengths = [], similar = [], related = [];
    meds.forEach(function (m) {
      if (m.id === med.id) return;
      if (m.salt === med.salt) strengths.push(m);
      else if (m.cls === med.cls) similar.push(m);
      else if (family && (classes[m.cls] || {}).family === family && !sharesSalt(m, med)) related.push(m);
    });
    var byPrice = function (a, b) { return a.price - b.price; };
    return {
      brands: brands,
      strengths: strengths.sort(byPrice),
      similar: similar.sort(byPrice),
      related: related.sort(byPrice).slice(0, 6)
    };
  }

  function sharesSalt(a, b) {
    var sa = a.salt.split(' + ');
    return b.salt.split(' + ').some(function (s) { return sa.indexOf(s) >= 0; });
  }

  /* ---------------- Location ---------------- */

  function haversineKm(a, b) {
    var R = 6371;
    var dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function rad(d) { return d * Math.PI / 180; }

  /**
   * Kendras sorted by real distance. Never silently shows far-away stores:
   * returns the ones inside the radius plus `nearestOutside` so the UI can offer
   * "Nearest is 12 km away - widen search?".
   */
  function kendrasNear(kendras, loc, radiusKm, opts) {
    opts = opts || {};
    var q = (opts.query || '').trim().toLowerCase();
    var list = kendras
      .filter(function (k) { return opts.includeClosed || k.status !== 'closed'; })
      .filter(function (k) { return !q || (k.name + ' ' + k.address + ' ' + k.city).toLowerCase().indexOf(q) >= 0; })
      .map(function (k) { return { kendra: k, km: haversineKm(loc, k) }; })
      .sort(function (a, b) { return a.km - b.km; });
    var inside = list.filter(function (x) { return x.km <= radiusKm; });
    var outside = list.filter(function (x) { return x.km > radiusKm; });
    return { items: inside, nearestOutside: outside[0] || null };
  }

  /* ---------------- Opening hours ---------------- */

  function toMin(hhmm) {
    var p = hhmm.split(':');
    return Number(p[0]) * 60 + Number(p[1]);
  }

  function openState(k, date) {
    date = date || new Date();
    if (k.status === 'closed') return { open: false, closedForever: true };
    var mins = date.getHours() * 60 + date.getMinutes();
    var o = toMin(k.opens), c = toMin(k.closes);
    var always = o === 0 && c >= 23 * 60 + 59;
    return { open: always || (mins >= o && mins < c), always: always, opens: k.opens, closes: k.closes };
  }

  function fmtTime(hhmm) {
    var m = toMin(hhmm), h = Math.floor(m / 60), mm = m % 60;
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ampm;
  }

  /* ---------------- Stock (simulated live feed) ---------------- */

  /** FNV-1a hash -> stable pseudo-random numbers, so the demo shows the same stock every time. */
  function hash32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * Stock of one medicine at one Kendra.
   * In a real system this comes from the Kendra's billing (POS) software every few minutes.
   * Here it is simulated, but the UI always shows HOW OLD the information is, and user
   * reports ("they said out of stock") override it until the Kendra confirms.
   *
   * status: 'in' | 'low' | 'out' | 'reported' | 'na' (Kendra closed)
   */
  function stockFor(kendra, med, reports) {
    if (kendra.status === 'closed') return { status: 'na', minutesAgo: null };
    var key = kendra.id + '|' + med.id;
    var rep = reports && reports[key];
    var minutesAgo = 2 + (hash32(med.id + '@' + kendra.id) % 118);
    if (rep) return { status: 'reported', minutesAgo: minutesAgo, reportedAt: rep.at };
    var r = hash32(key) / 4294967296;
    var level = kendra.stockLevel * (med.availability || 1);
    var status = r > level ? 'out' : (r > level - 0.12 ? 'low' : 'in');
    return { status: status, minutesAgo: minutesAgo };
  }

  function isAvailable(stock) {
    return stock.status === 'in' || stock.status === 'low';
  }

  /** How many cart lines a Kendra can supply right now. */
  function basketCoverage(kendra, lines, medById, reports) {
    var ok = 0;
    lines.forEach(function (l) {
      var med = medById[l.id];
      if (med && isAvailable(stockFor(kendra, med, reports))) ok++;
    });
    return ok;
  }

  /* ---------------- Misc ---------------- */

  function makeCode(prefix, seed) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var n = seed != null ? hash32(String(seed)) : Math.floor(Math.random() * 4294967296);
    var s = '';
    for (var i = 0; i < 6; i++) { s += chars[n % chars.length]; n = Math.floor(n / chars.length) || hash32(s + i); }
    return prefix + '-' + s;
  }

  return {
    priceSummary: priceSummary,
    pct: pct,
    alternativesFor: alternativesFor,
    haversineKm: haversineKm,
    kendrasNear: kendrasNear,
    openState: openState,
    fmtTime: fmtTime,
    hash32: hash32,
    stockFor: stockFor,
    isAvailable: isAvailable,
    basketCoverage: basketCoverage,
    makeCode: makeCode
  };
});

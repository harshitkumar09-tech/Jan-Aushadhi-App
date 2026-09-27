/*
 * Offline medicine search engine.
 *
 * Fixes from the problem report:
 *  - No network call per keystroke: the catalogue is on the device and searched in memory
 *    (about a millisecond, even for a full 2,000+ item basket — see the Performance Lab).
 *  - Debounced input + minimum query length (see DEBOUNCE_MS / MIN_QUERY_LENGTH).
 *  - Ranked results instead of a long alphabetical list:
 *      exact name/brand > starts-with > word starts-with > contains > typo-tolerant match.
 *  - Brand -> generic: typing "Dolo 650" finds "Paracetamol 650 mg" and says which brand matched.
 *  - Typos are tolerated ("paracetmol", "metfromin").
 *  - Hinglish / Hindi keywords ("bukhar", "sugar", "बुखार") map to the right medicines.
 */
(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { window.JA = window.JA || {}; window.JA.search = api; }
})(function () {
  'use strict';

  var MIN_QUERY_LENGTH = 3;
  var DEBOUNCE_MS = 300;

  // Field weights: how much a match in each field counts.
  var W = { name: 1, brand: 0.95, hindi: 0.9, cls: 0.35, kw: 0.35, category: 0.3 };

  /**
   * Split text into lowercase tokens: words, numbers (12.5 kept whole) and Hindi words.
   * A 1-2 letter token glued to a number is merged: "B12" -> "b12", "D3" -> "d3".
   */
  function tokenize(text) {
    var s = String(text || '').toLowerCase();
    var re = /\d+(?:\.\d+)?|[a-z]+|[ऀ-ॿ]+/g;
    var out = [];
    var m, prevEnd = -1, prev = null;
    while ((m = re.exec(s)) !== null) {
      var tok = m[0];
      var isNum = /^\d/.test(tok);
      if (isNum && prev && m.index === prevEnd && /^[a-z]{1,2}$/.test(prev)) {
        out[out.length - 1] = prev + tok;
        prev = null;
      } else {
        out.push(tok);
        prev = isNum ? null : tok;
      }
      prevEnd = m.index + tok.length;
    }
    return out;
  }

  function normalize(text) {
    return tokenize(text).join(' ');
  }

  /**
   * Edit distance (insert / delete / replace / swap two neighbouring letters),
   * with an early exit once it is clearly above `max`.
   */
  function levenshtein(a, b, max) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev2 = null, prev = [], cur, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (var i = 1; i <= la; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= lb; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        // swapped letters: "metfromin" -> "metformin"
        if (prev2 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[lb];
  }

  function allowedEdits(len) {
    if (len >= 8) return 2;
    if (len >= 4) return 1;
    return 0;
  }

  /**
   * Score one query word against one indexed word:
   * 1 = same word, 0.8 = starts with it, 0.45 = contains it, 0.55 / 0.4 = typo match.
   * Returns 0 when there is no match. `fuzzyOut[0]` is set to true for typo matches.
   */
  function scoreWord(t, tok, isNum, maxEdits, fuzzyOut) {
    fuzzyOut[0] = false;
    if (tok === t) return 1;
    if (tok.indexOf(t) === 0) return t.length === 1 ? 0.5 : 0.8;
    if (isNum) return 0;
    if (t.length >= 3 && tok.indexOf(t) > 0) return 0.45;
    if (maxEdits === 0) return 0;
    fuzzyOut[0] = true;
    if (levenshtein(t, tok, maxEdits) <= maxEdits) return 0.55;
    if (tok.length > t.length && levenshtein(t, tok.slice(0, t.length), maxEdits) <= maxEdits) return 0.4;
    fuzzyOut[0] = false;
    return 0;
  }

  function field(kind, weight, text, label) {
    var tokens = tokenize(text);
    return { kind: kind, w: weight, tokens: tokens, ids: null, text: tokens.join(' '), label: label || text };
  }

  /**
   * Build the search index once at start-up.
   * Besides the medicines it keeps a vocabulary (every distinct word) and, for each word,
   * the list of medicines that contain it. A query word is then compared with each distinct
   * word only once, instead of with every word of every medicine.
   */
  function buildIndex(medicines, catalog) {
    var classes = (catalog && catalog.classes) || {};
    var cats = (catalog && catalog.categories) || {};
    var vocab = [], vocabId = Object.create(null), postings = [], nameWord = [];

    function idOf(tok, docIdx, isName) {
      var id = vocabId[tok];
      if (id === undefined) {
        id = vocabId[tok] = vocab.length;
        vocab.push(tok);
        postings.push([]);
        nameWord.push(false);
      }
      var list = postings[id];
      if (list[list.length - 1] !== docIdx) list.push(docIdx);
      if (isName) nameWord[id] = true;
      return id;
    }

    var docs = medicines.map(function (med, i) {
      var cls = classes[med.cls] || {};
      var cat = cats[med.category] || {};
      var fields = [field('name', W.name, med.name)];
      if (med.salt && normalize(med.salt) !== normalize(med.name)) fields.push(field('name', W.name * 0.9, med.salt));
      (med.brands || []).forEach(function (b) { fields.push(field('brand', W.brand, b.name, b.name)); });
      if (med.nameHi) fields.push(field('hindi', W.hindi, med.nameHi));
      if (cls.label) fields.push(field('cls', W.cls, cls.label + ' ' + (cls.uses || '')));
      if (cls.kw) fields.push(field('kw', W.kw, cls.kw));
      if (cat.en) fields.push(field('category', W.category, cat.en + ' ' + (cat.hi || '')));
      fields.push(field('form', 0.5, med.form));
      fields.forEach(function (f) {
        var isName = f.kind === 'name' || f.kind === 'brand';
        f.ids = f.tokens.map(function (tok) { return idOf(tok, i, isName); });
      });
      return { med: med, fields: fields, nameLen: med.name.length };
    });
    return { docs: docs, vocab: vocab, postings: postings, nameWord: nameWord, size: docs.length };
  }

  /** Compare one query word with the whole vocabulary: scores per word + which medicines match. */
  function wordTable(index, t) {
    var n = index.vocab.length;
    var scores = new Float64Array(n), fuzzy = new Uint8Array(n), docs = new Uint8Array(index.docs.length);
    var isNum = /^\d/.test(t), maxEdits = isNum ? 0 : allowedEdits(t.length), f = [false];
    for (var v = 0; v < n; v++) {
      var s = scoreWord(t, index.vocab[v], isNum, maxEdits, f);
      if (!s) continue;
      scores[v] = s;
      fuzzy[v] = f[0] ? 1 : 0;
      var list = index.postings[v];
      for (var k = 0; k < list.length; k++) docs[list[k]] = 1;
    }
    return { scores: scores, fuzzy: fuzzy, docs: docs };
  }

  function scoreDoc(doc, tables, qText) {
    var total = 0, anyFuzzy = false, f, k;
    var fieldTotals = new Array(doc.fields.length);
    for (f = 0; f < fieldTotals.length; f++) fieldTotals[f] = 0;

    for (var i = 0; i < tables.length; i++) {
      var tb = tables[i];
      var best = 0, bestFuzzy = false, bestField = -1;
      for (f = 0; f < doc.fields.length; f++) {
        var fld = doc.fields[f];
        for (k = 0; k < fld.ids.length; k++) {
          var id = fld.ids[k];
          var s = tb.scores[id] * fld.w;
          if (s > best) { best = s; bestFuzzy = tb.fuzzy[id] === 1; bestField = f; }
        }
      }
      if (best === 0) return null; // every word the user typed must match something
      total += best;
      if (bestFuzzy) anyFuzzy = true;
      fieldTotals[bestField] += best;
    }

    // Phrase bonuses: the whole query equals / starts a name or a brand.
    var nameTotal = 0, nameBonus = 0;
    var bestBrand = null, bestBrandVal = 0, bestBrandBonus = 0;
    for (f = 0; f < doc.fields.length; f++) {
      var fd = doc.fields[f];
      if (fd.kind === 'name') {
        nameTotal += fieldTotals[f];
        nameBonus = Math.max(nameBonus, phraseBonus(fd.text, qText));
      } else if (fd.kind === 'brand') {
        var bonus = phraseBonus(fd.text, qText);
        var val = fieldTotals[f] + bonus;
        if (val > bestBrandVal) { bestBrandVal = val; bestBrand = fd.label; bestBrandBonus = bonus; }
      }
    }
    // Say "generic for <brand>" only when the brand explains the query better than the generic name.
    var brandWins = bestBrand !== null && bestBrandVal > nameTotal + nameBonus;
    return {
      score: total + Math.max(nameBonus, brandWins ? bestBrandBonus : 0),
      matchedBrand: brandWins ? bestBrand : null,
      fuzzy: anyFuzzy
    };
  }

  function phraseBonus(text, qText) {
    if (text === qText) return 3;
    if (text.indexOf(qText) === 0) return 1.5;
    if ((' ' + text).indexOf(' ' + qText) >= 0) return 0.6;
    return 0;
  }

  function compare(a, b) {
    return (b.score - a.score) || (a.doc.nameLen - b.doc.nameLen) || (a.doc.med.name < b.doc.med.name ? -1 : 1);
  }

  /**
   * Search the index.
   * opts: { category, sort: 'relevance' | 'price' | 'savings', minLength }
   * Returns { items: [{ med, score, matchedBrand, fuzzy }], total, tookMs, tooShort, didYouMean }
   */
  function search(index, query, opts) {
    opts = opts || {};
    var t0 = now();
    var minLen = opts.minLength != null ? opts.minLength : MIN_QUERY_LENGTH;
    var qTokens = tokenize(query);
    var qText = qTokens.join(' ');
    var result = { items: [], total: 0, tookMs: 0, tooShort: false, didYouMean: [] };

    if (qText.replace(/\s/g, '').length < minLen) {
      // Short query: only a category filter can produce results.
      if (opts.category) {
        result.items = index.docs.filter(function (d) { return d.med.category === opts.category; })
          .map(function (d) { return { med: d.med, doc: d, score: 0, matchedBrand: null, fuzzy: false }; });
        sortItems(result.items, opts.sort || 'name');
      } else {
        result.tooShort = qText.length > 0;
      }
      result.total = result.items.length;
      result.tookMs = now() - t0;
      return strip(result);
    }

    // 1. Compare each query word with the vocabulary once.
    var tables = qTokens.map(function (t) { return wordTable(index, t); });
    // 2. Score only medicines that contain a match for every query word.
    var items = [];
    for (var i = 0; i < index.docs.length; i++) {
      var candidate = true;
      for (var j = 0; j < tables.length && candidate; j++) candidate = tables[j].docs[i] === 1;
      if (!candidate) continue;
      var d = index.docs[i];
      if (opts.category && d.med.category !== opts.category) continue;
      var r = scoreDoc(d, tables, qText);
      if (r) items.push({ med: d.med, doc: d, score: r.score, matchedBrand: r.matchedBrand, fuzzy: r.fuzzy });
    }
    sortItems(items, opts.sort || 'relevance');

    if (!items.length) result.didYouMean = didYouMean(index, qTokens);
    result.items = items;
    result.total = items.length;
    result.tookMs = now() - t0;
    return strip(result);
  }

  function sortItems(items, sort) {
    if (sort === 'price') items.sort(function (a, b) { return (a.med.price - b.med.price) || compare(a, b); });
    else if (sort === 'savings') items.sort(function (a, b) { return (savePct(b.med) - savePct(a.med)) || compare(a, b); });
    else if (sort === 'name') items.sort(function (a, b) { return a.med.name < b.med.name ? -1 : 1; });
    else items.sort(compare);
  }

  function savePct(med) {
    if (!med.brands || !med.brands.length) return 0;
    var avg = med.brands.reduce(function (s, b) { return s + b.price; }, 0) / med.brands.length;
    return avg > 0 ? (avg - med.price) / avg : 0;
  }

  /** When nothing matched: the closest medicine / brand words by spelling. */
  function didYouMean(index, qTokens) {
    var word = qTokens.filter(function (t) { return !/^\d/.test(t); }).sort(function (a, b) { return b.length - a.length; })[0];
    if (!word || word.length < 3) return [];
    var out = [];
    index.vocab.forEach(function (tok, v) {
      if (!index.nameWord[v] || tok.length < 3) return;
      var dist = levenshtein(word, tok, 3);
      if (dist <= 3) out.push({ word: tok, dist: dist });
    });
    return out.sort(function (a, b) { return a.dist - b.dist; }).slice(0, 3).map(function (x) { return x.word; });
  }

  function strip(result) {
    result.items = result.items.map(function (it) { return { med: it.med, score: it.score, matchedBrand: it.matchedBrand, fuzzy: it.fuzzy }; });
    return result;
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function debounce(fn, ms) {
    var timer = null;
    function debounced() {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    }
    debounced.cancel = function () { clearTimeout(timer); };
    return debounced;
  }

  return {
    MIN_QUERY_LENGTH: MIN_QUERY_LENGTH,
    DEBOUNCE_MS: DEBOUNCE_MS,
    tokenize: tokenize,
    normalize: normalize,
    levenshtein: levenshtein,
    buildIndex: buildIndex,
    search: search,
    debounce: debounce
  };
});

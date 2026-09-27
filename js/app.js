/*
 * Jan Aushadhi Sugam — prototype website.
 * Plain JavaScript (no framework, no build step) so it loads fast on low-end phones.
 *
 * Pages (hash routes):
 *   #/                home            #/search?q=&cat=   search + alternatives
 *   #/medicine/:id    medicine detail #/kendras          Kendra locator (list / map)
 *   #/kendra/:id      Kendra + stock  #/compare          prescription savings
 *   #/cart            reserve pickup  #/orders           my reservations
 *   #/feedback        complaints      #/login            optional OTP login
 *   #/settings        language, text size, contrast, offline data
 *   #/help  #/about  #/more  #/lab (performance before/after demo)
 */
(function () {
  'use strict';

  var JA = window.JA;
  var catalog = JA.catalog;
  var K = JA.kendras;
  var S = JA.services;
  var SE = JA.search;
  var I18N = JA.i18n;

  var medById = {};
  catalog.medicines.forEach(function (m) { medById[m.id] = m; });
  var kendraById = {};
  K.kendras.forEach(function (k) { kendraById[k.id] = k; });

  var index = SE.buildIndex(catalog.medicines, catalog);
  // Warm up once, then measure a typical search so the home page shows a real number.
  SE.search(index, 'paracetamol');
  var searchMs = (function () {
    var qs = ['dolo 650', 'metformin', 'pan 40', 'telma', 'vit d3'], t0 = performance.now();
    qs.forEach(function (q) { SE.search(index, q); });
    return (performance.now() - t0) / qs.length;
  })();

  var PAGE_SIZE = 20;
  var RADII = [2, 5, 10, 25, 50];
  var HELPLINE = '1800-180-8080';
  var SYNC_EVERY_MS = 12 * 60 * 60 * 1000; // check for catalogue changes at most twice a day — never on a timer loop
  var hasVoice = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

  /* ================= Storage (safe: works even when storage is blocked) ================= */

  var store = {
    get: function (key, fallback) {
      try {
        var v = localStorage.getItem('jas.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem('jas.' + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
    clearAll: function () {
      try {
        Object.keys(localStorage).forEach(function (k) { if (k.indexOf('jas.') === 0) localStorage.removeItem(k); });
      } catch (e) { /* ignore */ }
    }
  };

  var DEFAULT_LOC = { lat: 28.6139, lng: 77.2090, label: 'New Delhi', city: 'delhi', source: 'city' };

  var state = {
    lang: store.get('lang', 'en'),
    textSize: store.get('textSize', 'normal'),
    contrast: store.get('contrast', false),
    cart: store.get('cart', []),
    cartKendra: store.get('cartKendra', null),
    orders: store.get('orders', []),
    tickets: store.get('tickets', []),
    reports: store.get('reports', {}),
    kendraReports: store.get('kendraReports', {}),
    loc: store.get('loc', DEFAULT_LOC),
    radius: store.get('radius', 10),
    user: store.get('user', null),
    recent: store.get('recent', []),
    lastSync: store.get('lastSync', null),
    rxDraft: store.get('rxDraft', '')
  };
  function save(key) { store.set(key, state[key]); }

  // In-memory UI state that should survive a re-render but not a reload.
  var ui = { kendraMode: 'list', kendraQuery: '', includeClosed: false, installPrompt: null };

  /* ================= Helpers ================= */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function t(key, vars) {
    var s = (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rupee(n) {
    if (n == null) return '—';
    return '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function kmLabel(d) {
    if (d < 1) return Math.round(d * 1000) + ' m';
    return (d < 10 ? d.toFixed(1) : Math.round(d)) + ' km';
  }

  function ago(min) {
    if (min < 1) return t('justNow');
    if (min < 60) return t('minAgo', { n: Math.round(min) });
    var h = Math.round(min / 60);
    if (h < 24) return t('hrAgo', { n: h });
    return t('daysAgo', { n: Math.round(h / 24) });
  }

  function daysLabel(d) {
    if (d <= 0) return t('today');
    if (d === 1) return t('yesterday');
    return t('daysAgo', { n: d });
  }

  function dateLabel(ms) {
    return new Date(ms).toLocaleString(state.lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
  }

  var CAT_ICON = { pain: 'thermometer', anti: 'shield', diab: 'droplet', heart: 'heart', gastro: 'pill', resp: 'wind', vit: 'sun', skin: 'layers', neuro: 'activity', hormone: 'target', eye: 'eye', surg: 'plus-square' };

  function catName(id) {
    var c = catalog.categories[id];
    return c ? (state.lang === 'hi' ? c.hi : c.en) : id;
  }

  function shortName(m) {
    if (!m.strength) return m.name;
    return m.salt + ' ' + m.strength + (/tablet/i.test(m.form) ? '' : ' ' + m.form);
  }

  function directionsUrl(k) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + k.lat + ',' + k.lng;
  }

  function telHref(phone) { return 'tel:' + phone.replace(/[^\d+]/g, ''); }

  function unitsInPack(m) {
    if (!/tablet|capsule/i.test(m.form)) return 0;
    var n = parseInt(m.pack, 10);
    return isNaN(n) ? 0 : n;
  }

  function addRecent(q) {
    q = (q || '').trim();
    if (q.length < SE.MIN_QUERY_LENGTH) return;
    state.recent = [q].concat(state.recent.filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); })).slice(0, 8);
    save('recent');
  }

  /* ================= Toasts ================= */

  function toast(msg, type, action) {
    var host = $('#toasts');
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.setAttribute('role', 'status');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<a href="' + esc(action.href) + '">' + esc(action.label) + '</a>' : '');
    host.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 300);
    }, 3800);
  }

  /* ================= Shell (header, nav, footer) ================= */

  var NAV = [
    { path: '/', icon: 'home', key: 'navHome' },
    { path: '/search', icon: 'search', key: 'navSearch' },
    { path: '/kendras', icon: 'pin', key: 'navKendras' },
    { path: '/compare', icon: 'scale', key: 'navCompare', desktopOnly: true },
    { path: '/cart', icon: 'cart', key: 'navCart', badge: true },
    { path: '/more', icon: 'grid', key: 'navMore' }
  ];

  function applyPrefs() {
    var root = document.documentElement;
    root.lang = state.lang === 'hi' ? 'hi' : 'en';
    root.setAttribute('data-text', state.textSize);
    root.setAttribute('data-contrast', state.contrast ? 'high' : 'normal');
  }

  function renderShell() {
    $('#top-nav').innerHTML = NAV.map(function (n) {
      return '<a href="#' + n.path + '" data-path="' + n.path + '">' + esc(t(n.key)) +
        (n.badge ? ' <span class="badge" data-cart-badge hidden></span>' : '') + '</a>';
    }).join('');
    $('#bottom-nav').innerHTML = NAV.filter(function (n) { return !n.desktopOnly; }).map(function (n) {
      return '<a href="#' + n.path + '" data-path="' + n.path + '">' + icon(n.icon) + '<span>' + esc(t(n.key)) + '</span>' +
        (n.badge ? '<span class="badge" data-cart-badge hidden></span>' : '') + '</a>';
    }).join('');
    var langBtn = $('#lang-btn');
    langBtn.textContent = state.lang === 'en' ? 'हिंदी' : 'English';
    langBtn.setAttribute('aria-label', t('switchLanguage'));
    $('#brand-sub').textContent = t('brandSub');
    $('#proto-bar').textContent = t('protoBar');
    $('#user-btn').setAttribute('aria-label', state.user ? t('profile') : t('login'));
    $('#user-btn').classList.toggle('signed-in', !!state.user);
    $('#site-footer').innerHTML = footerHtml();
    updateCartBadge();
    updateNet();
  }

  function footerHtml() {
    return '<div class="wrap footer-inner">' +
      '<div class="footer-about"><strong>' + esc(t('appName')) + ' — ' + esc(t('prototype')) + '</strong>' +
      '<p>' + esc(t('footerDisclaimer')) + '</p></div>' +
      '<nav class="footer-links" aria-label="' + esc(t('moreLinks')) + '">' +
      '<a href="#/about">' + esc(t('navAbout')) + '</a><a href="#/help">' + esc(t('navHelp')) + '</a>' +
      '<a href="#/feedback">' + esc(t('navFeedback')) + '</a><a href="#/lab">' + esc(t('navLab')) + '</a>' +
      '<a href="#/settings">' + esc(t('navSettings')) + '</a></nav>' +
      '<p class="small footer-meta">' + esc(t('catalogueLine', { v: catalog.version, n: catalog.medicines.length })) + '</p>' +
      '</div>';
  }

  function sectionOf(path) {
    if (path === '/') return '/';
    if (path.indexOf('/search') === 0 || path.indexOf('/medicine') === 0) return '/search';
    if (path.indexOf('/kendra') === 0) return '/kendras';
    if (path === '/compare') return '/compare';
    if (path === '/cart' || path === '/orders') return '/cart';
    return '/more';
  }

  function setActiveNav(path) {
    var sec = sectionOf(path);
    $all('[data-path]').forEach(function (a) {
      var on = a.getAttribute('data-path') === sec;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function cartCount() {
    return state.cart.reduce(function (s, l) { return s + l.qty; }, 0);
  }

  function updateCartBadge() {
    var n = cartCount();
    $all('[data-cart-badge]').forEach(function (b) {
      b.hidden = n === 0;
      b.textContent = n;
    });
  }

  function updateNet() {
    var online = navigator.onLine !== false;
    var bar = $('#offline-bar');
    bar.hidden = online;
    bar.textContent = t('offlineBar');
    var badge = $('#net-badge');
    var ready = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    badge.hidden = online && !ready;
    badge.className = 'net-badge ' + (online ? 'ok' : 'off');
    badge.innerHTML = online ? icon('check') + '<span>' + esc(t('offlineReady')) + '</span>' : icon('wifi-off') + '<span>' + esc(t('offline')) + '</span>';
  }

  /* ================= Router ================= */

  var routes = [
    [/^\/$/, viewHome],
    [/^\/search$/, viewSearch],
    [/^\/medicine\/(\w+)$/, viewMedicine],
    [/^\/kendras$/, viewKendras],
    [/^\/kendra\/(\w+)$/, viewKendra],
    [/^\/compare$/, viewCompare],
    [/^\/cart$/, viewCart],
    [/^\/orders$/, viewOrders],
    [/^\/feedback$/, viewFeedback],
    [/^\/login$/, viewLogin],
    [/^\/settings$/, viewSettings],
    [/^\/help$/, viewHelp],
    [/^\/about$/, viewAbout],
    [/^\/more$/, viewMore],
    [/^\/lab$/, viewLab]
  ];

  var cleanup = null;
  var currentPath = '/';

  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var i = h.indexOf('?');
    return { path: i >= 0 ? h.slice(0, i) : h, params: new URLSearchParams(i >= 0 ? h.slice(i + 1) : '') };
  }

  function render(keepScroll) {
    var loc = parseHash();
    if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
    var view = viewNotFound, args = [];
    for (var i = 0; i < routes.length; i++) {
      var m = loc.path.match(routes[i][0]);
      if (m) { view = routes[i][1]; args = m.slice(1); break; }
    }
    var out = view.apply(null, [loc.params].concat(args));
    var main = $('#view');
    var y = window.scrollY;
    main.innerHTML = out.html;
    document.title = (out.title ? out.title + ' · ' : '') + t('appName');
    var pathChanged = loc.path !== currentPath;
    currentPath = loc.path;
    setActiveNav(loc.path);
    if (out.mount) cleanup = out.mount(main, loc.params) || null;
    if (keepScroll) window.scrollTo(0, y);
    else {
      window.scrollTo(0, 0);
      if (pathChanged) main.focus({ preventScroll: true });
    }
  }

  function refresh() { render(true); }

  window.addEventListener('hashchange', function () { render(false); });

  /* ================= Shared components ================= */

  function searchForm(q, opts) {
    opts = opts || {};
    var id = opts.id || 'q-' + Math.random().toString(36).slice(2, 7);
    return '<form class="search-form' + (opts.big ? ' big' : '') + '" data-form="search" role="search">' +
      '<label class="sr-only" for="' + id + '">' + esc(t('searchLabel')) + '</label>' +
      icon('search', 'search-ic') +
      '<input id="' + id + '" type="search" name="q" value="' + esc(q) + '" placeholder="' + esc(t('searchPlaceholder')) + '"' +
      ' autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">' +
      (hasVoice ? '<button type="button" class="icon-btn voice-btn" data-action="voice" aria-label="' + esc(t('voiceSearch')) + '" title="' + esc(t('voiceSearch')) + '">' + icon('mic') + '</button>' : '') +
      '<button type="submit" class="btn btn-accent">' + esc(t('search')) + '</button>' +
      '</form>';
  }

  function pill(kind, text) { return '<span class="pill pill-' + kind + '">' + esc(text) + '</span>'; }

  function openPill(k) {
    var os = S.openState(k);
    if (os.closedForever) return pill('bad', t('permClosed'));
    if (os.open) return pill('ok', os.always ? t('open24') : t('openTill', { time: S.fmtTime(k.closes) }));
    return pill('warn', t('closedNow', { time: S.fmtTime(k.opens) }));
  }

  var STOCK_UI = {
    'in': ['ok', 'inStock'],
    'low': ['warn', 'lowStock'],
    'out': ['bad', 'outOfStock'],
    'reported': ['bad', 'reportedOut'],
    'na': ['bad', 'kendraClosed']
  };

  function stockLine(stock, k, med) {
    var ui2 = STOCK_UI[stock.status];
    var reportBtn = (stock.status === 'in' || stock.status === 'low')
      ? '<button type="button" class="link-btn small" data-action="report-stock" data-k="' + k.id + '" data-m="' + med.id + '">' + icon('flag') + ' ' + esc(t('saidOutOfStock')) + '</button>'
      : (stock.status === 'reported' ? '<button type="button" class="link-btn small" data-action="undo-report" data-k="' + k.id + '" data-m="' + med.id + '">' + esc(t('undo')) + '</button>' : '');
    return '<div class="stock-line">' + pill(ui2[0], t(ui2[1])) +
      (stock.minutesAgo != null ? ' <span class="muted small">' + icon('clock') + ' ' + esc(t('updatedAgo', { when: ago(stock.minutesAgo) })) + '</span>' : '') +
      ' ' + reportBtn + '</div>';
  }

  function kendraCard(entry, opts) {
    opts = opts || {};
    var k = entry.kendra;
    var stock = opts.med ? S.stockFor(k, opts.med, state.reports) : null;
    var reported = state.kendraReports[k.id];
    var actions = '<a class="btn btn-sm btn-ghost" href="' + telHref(k.phone) + '">' + icon('phone') + ' ' + esc(t('call')) + '</a>' +
      '<a class="btn btn-sm btn-ghost" href="' + directionsUrl(k) + '" target="_blank" rel="noopener">' + icon('navigation') + ' ' + esc(t('directions')) + '</a>';
    if (opts.med) {
      if (stock && S.isAvailable(stock)) {
        actions += '<button type="button" class="btn btn-sm btn-accent" data-action="add-cart" data-id="' + opts.med.id + '" data-kendra="' + k.id + '">' + icon('plus') + ' ' + esc(t('reserveHere')) + '</button>';
      }
    } else {
      actions += '<a class="btn btn-sm btn-primary" href="#/kendra/' + k.id + '">' + esc(t('stockDetails')) + '</a>';
    }
    return '<article class="kendra-card' + (k.status === 'closed' ? ' is-closed' : '') + '">' +
      '<div class="kc-head"><div>' +
      '<h3><a href="#/kendra/' + k.id + '">' + esc(k.name) + '</a></h3>' +
      '<p class="muted small">' + esc(k.address) + '</p></div>' +
      '<span class="kc-dist">' + icon('pin') + ' ' + esc(kmLabel(entry.km)) + '</span></div>' +
      '<p class="kc-status">' + openPill(k) + ' <span class="muted small">' + esc(t('verifiedAgo', { when: daysLabel(k.verifiedDaysAgo) })) + '</span>' +
      (reported ? ' ' + pill('info', t('youReportedKendra')) : '') + '</p>' +
      (stock ? stockLine(stock, k, opts.med) : '') +
      '<div class="kc-actions">' + actions + '</div>' +
      '</article>';
  }

  /** Honest "nothing nearby" message — never silently shows a store hundreds of km away. */
  function noneNearby(near) {
    var html = '<div class="empty">' + icon('pin', 'empty-ic') +
      '<p><strong>' + esc(t('noneInRadius', { r: state.radius, place: state.loc.label })) + '</strong></p>';
    if (near.nearestOutside) {
      var d = near.nearestOutside.km;
      var next = RADII.filter(function (r) { return r >= d; })[0];
      html += '<p>' + t('nearestIs', { name: '<b>' + esc(near.nearestOutside.kendra.name) + '</b>', km: esc(kmLabel(d)) }) + '</p>';
      if (next) html += '<button type="button" class="btn btn-primary" data-action="set-radius" data-r="' + next + '">' + esc(t('widenTo', { r: next })) + '</button>';
      else html += '<p class="muted small">' + esc(t('tooFarHint')) + '</p><a class="btn btn-ghost" href="#/kendra/' + near.nearestOutside.kendra.id + '">' + esc(t('viewIt')) + '</a>';
    }
    return html + '</div>';
  }

  function locationBar() {
    var gps = state.loc.source === 'gps';
    return '<div class="loc-bar">' +
      '<span class="loc-now">' + icon('pin') + ' ' + esc(t('showingNear')) + ' <b>' + esc(state.loc.label) + '</b></span>' +
      '<div class="loc-actions">' +
      '<button type="button" class="btn btn-sm btn-ghost" data-action="use-location">' + icon('crosshair') + ' ' + esc(t('useMyLocation')) + '</button>' +
      '<label class="sr-only" for="city-select">' + esc(t('chooseCity')) + '</label>' +
      '<select id="city-select" data-change="city">' +
      (gps ? '<option value="" selected>' + esc(t('myLocation')) + '</option>' : '') +
      K.cities.map(function (c) {
        return '<option value="' + c.id + '"' + (!gps && state.loc.city === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('') +
      '</select></div></div>';
  }

  function medChip(m) {
    return '<a class="alt-chip med" href="#/medicine/' + m.id + '">' + esc(shortName(m)) + ' <b>' + rupee(m.price) + '</b></a>';
  }

  function moreChip(n, id) {
    return n > 0 ? '<a class="alt-chip more" href="#/medicine/' + id + '?focus=alternatives">+' + n + '</a>' : '';
  }

  /** Compact alternatives shown on EVERY search result. */
  function altBlock(m, alt, matchedBrand) {
    var rows = [];
    function row(label, content, caution) {
      rows.push('<div class="alt-row' + (caution ? ' caution' : '') + '"><span class="alt-label">' + esc(label) + '</span><div class="alt-chips">' + content + '</div></div>');
    }
    if (alt.brands.length) {
      var brands = alt.brands.slice();
      if (matchedBrand) brands.sort(function (a, b) { return (b.name === matchedBrand) - (a.name === matchedBrand); });
      row(t('altBrands'), brands.slice(0, 3).map(function (b) {
        return '<span class="alt-chip brand' + (b.name === matchedBrand ? ' hl' : '') + '">' + esc(b.name) + ' <b>' + rupee(b.price) + '</b></span>';
      }).join('') + moreChip(brands.length - 3, m.id));
    }
    if (alt.strengths.length) row(t('altStrengths'), alt.strengths.slice(0, 3).map(medChip).join('') + moreChip(alt.strengths.length - 3, m.id));
    if (alt.similar.length) row(t('altSimilar'), alt.similar.slice(0, 3).map(medChip).join('') + moreChip(alt.similar.length - 3, m.id), true);
    else if (alt.related.length) row(t('altRelated'), alt.related.slice(0, 3).map(medChip).join('') + moreChip(alt.related.length - 3, m.id), true);
    if (!rows.length) return '<div class="alts"><p class="muted small">' + esc(t('noAlternatives')) + '</p></div>';
    return '<div class="alts"><p class="alts-title">' + icon('scale') + ' ' + esc(t('alternatives')) + '</p>' + rows.join('') + '</div>';
  }

  function medCard(item) {
    var m = item.med;
    var ps = S.priceSummary(m);
    var alt = S.alternativesFor(m, catalog);
    var brandLine = item.matchedBrand
      ? '<p class="match-note">' + icon('check') + ' ' + t('genericFor', { brand: '<b>' + esc(item.matchedBrand) + '</b>' }) + '</p>' : '';
    var price = ps.count
      ? '<span class="save-badge">' + esc(t('savePct', { n: ps.savePct })) + '</span><span class="mc-vs">' + esc(t('vsBrandAvg', { p: rupee(ps.avg) })) + '</span>'
      : '<span class="mc-vs">' + esc(t('noBrandData')) + '</span>';
    return '<article class="med-card">' +
      '<div class="mc-top">' +
      '<a class="mc-main" href="#/medicine/' + m.id + '" data-med="' + m.id + '">' +
      '<span class="cat-dot">' + icon(CAT_ICON[m.category] || 'pill') + '</span>' +
      '<span class="mc-text"><span class="mc-name">' + esc(m.name) + '</span>' +
      (m.nameHi && state.lang === 'hi' ? '<span class="mc-hi">' + esc(m.nameHi) + '</span>' : '') +
      '<span class="mc-meta">' + esc(m.pack) + ' · ' + esc(catName(m.category)) + (m.rx ? ' <span class="tag tag-rx" title="' + esc(t('rxNeeded')) + '">Rx</span>' : '') + '</span>' +
      brandLine + '</span></a>' +
      '<div class="mc-price"><span class="mc-ja-label">' + esc(t('jaPrice')) + '</span><span class="mc-ja">' + rupee(m.price) + '</span>' + price + '</div>' +
      '</div>' +
      altBlock(m, alt, item.matchedBrand) +
      '<div class="mc-actions">' +
      '<button type="button" class="btn btn-sm btn-accent" data-action="add-cart" data-id="' + m.id + '">' + icon('plus') + ' ' + esc(t('reserve')) + '</button>' +
      '<a class="btn btn-sm btn-ghost" href="#/medicine/' + m.id + '?focus=availability" data-med="' + m.id + '">' + icon('store') + ' ' + esc(t('checkStock')) + '</a>' +
      '<a class="btn btn-sm btn-ghost" href="#/medicine/' + m.id + '?focus=alternatives" data-med="' + m.id + '">' + esc(t('allAlternatives')) + ' ' + icon('chevron-right') + '</a>' +
      '</div></article>';
  }

  function emptyState(ic, title, body, actions) {
    return '<div class="empty">' + icon(ic, 'empty-ic') + '<p><strong>' + esc(title) + '</strong></p>' +
      (body ? '<p class="muted">' + body + '</p>' : '') + (actions || '') + '</div>';
  }

  function pageHead(title, lead) {
    return '<header class="page-head"><h1 class="page-title">' + esc(title) + '</h1>' + (lead ? '<p class="lead">' + esc(lead) + '</p>' : '') + '</header>';
  }

  /* ================= Views ================= */

  function viewHome() {
    var popular = ['Dolo 650', 'Telma 40', 'Pan 40', 'Glycomet 500', 'Shelcal 500', 'Azithral 500'];
    var services = [
      ['#/search', 'search', 'svcSearch', 'svcSearchD', 'c-green'],
      ['#/kendras', 'pin', 'svcKendra', 'svcKendraD', 'c-orange'],
      ['#/compare', 'scale', 'svcCompare', 'svcCompareD', 'c-blue'],
      ['#/cart', 'cart', 'svcReserve', 'svcReserveD', 'c-purple'],
      ['#/feedback', 'message', 'svcFeedback', 'svcFeedbackD', 'c-red'],
      ['#/help', 'phone', 'svcHelp', 'svcHelpD', 'c-teal'],
      ['#/about', 'info', 'svcAbout', 'svcAboutD', 'c-grey'],
      ['#/lab', 'bolt', 'svcLab', 'svcLabD', 'c-yellow']
    ];
    var withBrands = catalog.medicines.filter(function (m) { return m.brands.length; });
    var avgSave = Math.round(withBrands.reduce(function (s, m) { return s + S.priceSummary(m).savePct; }, 0) / withBrands.length);
    var near = S.kendrasNear(K.kendras, state.loc, 50).items[0];

    var nearestCard = '<div class="card hero-card"><p class="eyebrow">' + icon('store') + ' ' + esc(t('nearestKendra')) + '</p>' +
      (near
        ? '<h3><a href="#/kendra/' + near.kendra.id + '">' + esc(near.kendra.name) + '</a></h3><p class="muted small">' + esc(near.kendra.address) + '</p>' +
          '<p class="kc-status">' + openPill(near.kendra) + ' <span class="kc-dist">' + icon('pin') + ' ' + esc(kmLabel(near.km)) + '</span></p>' +
          '<div class="kc-actions"><a class="btn btn-sm btn-ghost" href="' + directionsUrl(near.kendra) + '" target="_blank" rel="noopener">' + icon('navigation') + ' ' + esc(t('directions')) + '</a>' +
          '<a class="btn btn-sm btn-primary" href="#/kendra/' + near.kendra.id + '">' + esc(t('stockDetails')) + '</a></div>'
        : '<p>' + esc(t('noKendra50')) + '</p>') +
      '<p class="small muted hero-loc">' + esc(t('showingNear')) + ' <b>' + esc(state.loc.label) + '</b> · <a href="#/kendras">' + esc(t('change')) + '</a></p></div>';

    var html =
      '<section class="hero">' +
        '<div class="hero-text">' +
          '<p class="eyebrow">' + esc(t('heroEyebrow')) + '</p>' +
          '<h1>' + esc(t('heroTitle')) + '</h1>' +
          '<p class="lead">' + esc(t('heroLead')) + '</p>' +
          searchForm('', { big: true, id: 'home-q' }) +
          '<div class="chip-row"><span class="muted small">' + esc(t('popular')) + ':</span>' +
          popular.map(function (p) { return '<a class="chip" href="#/search?q=' + encodeURIComponent(p) + '">' + esc(p) + '</a>'; }).join('') +
          '</div>' +
        '</div>' + nearestCard +
      '</section>' +

      '<section class="banners" aria-label="' + esc(t('highlights')) + '">' +
        '<div class="banner b1"><strong>' + esc(t('banner1')) + '</strong><span>' + esc(t('banner1d')) + '</span></div>' +
        '<div class="banner b2"><strong>' + esc(t('banner2')) + '</strong><span>' + esc(t('banner2d')) + '</span></div>' +
        '<div class="banner b3"><strong>' + esc(t('banner3')) + '</strong><span>' + esc(t('banner3d')) + '</span></div>' +
      '</section>' +

      '<section class="stat-row">' +
        stat(catalog.medicines.length, t('statMeds')) +
        stat(avgSave + '%', t('statSave')) +
        stat(K.kendras.filter(function (k) { return k.status === 'active'; }).length, t('statKendras')) +
        stat(t('lessThanMs', { ms: Math.max(1, Math.ceil(searchMs)) }), t('statSpeed')) +
      '</section>' +

      '<h2 class="section-title">' + esc(t('ourServices')) + '</h2>' +
      '<section class="svc-grid">' + services.map(function (s) {
        return '<a class="svc-tile ' + s[4] + '" href="' + s[0] + '"><span class="svc-ic">' + icon(s[1]) + '</span>' +
          '<span class="svc-name">' + esc(t(s[2])) + '</span><span class="svc-desc">' + esc(t(s[3])) + '</span></a>';
      }).join('') + '</section>' +

      '<h2 class="section-title">' + esc(t('browseCategories')) + '</h2>' +
      '<section class="cat-grid">' + Object.keys(catalog.categories).map(function (id) {
        var n = catalog.medicines.filter(function (m) { return m.category === id; }).length;
        return '<a class="cat-tile" href="#/search?cat=' + id + '">' + icon(CAT_ICON[id]) + '<span>' + esc(catName(id)) + '</span><small>' + n + '</small></a>';
      }).join('') + '</section>' +

      '<section class="card fixes">' +
        '<h2>' + esc(t('whatsFixed')) + '</h2>' +
        '<ul class="fix-list">' + ['fix1', 'fix2', 'fix3', 'fix4', 'fix5', 'fix6'].map(function (k) {
          return '<li>' + icon('check', 'ok') + '<span>' + esc(t(k)) + '</span></li>';
        }).join('') + '</ul>' +
        '<a class="btn btn-primary" href="#/lab">' + icon('bolt') + ' ' + esc(t('seeBeforeAfter')) + '</a>' +
      '</section>';

    return { html: html };
  }

  function stat(value, label) {
    return '<div class="stat"><span class="stat-v">' + esc(value) + '</span><span class="stat-l">' + esc(label) + '</span></div>';
  }

  /* ---------- Search ---------- */

  function viewSearch(params) {
    var cur = { q: params.get('q') || '', cat: params.get('cat') || '', sort: params.get('sort') || 'relevance' };
    var chips = '<button type="button" class="chip' + (!cur.cat ? ' active' : '') + '" data-cat="">' + esc(t('all')) + '</button>' +
      Object.keys(catalog.categories).map(function (id) {
        return '<button type="button" class="chip' + (cur.cat === id ? ' active' : '') + '" data-cat="' + id + '">' + esc(catName(id)) + '</button>';
      }).join('');

    var html = pageHead(t('searchTitle'), t('searchLead')) +
      searchForm(cur.q, { id: 'search-input', big: true }) +
      '<div class="filter-row" role="group" aria-label="' + esc(t('category')) + '">' + chips + '</div>' +
      '<div class="result-bar"><p id="result-meta" class="muted small" aria-live="polite"></p>' +
      '<label class="sort-label small">' + esc(t('sortBy')) + ' <select id="sort-select">' +
      ['relevance', 'price', 'savings'].map(function (s) {
        return '<option value="' + s + '"' + (cur.sort === s ? ' selected' : '') + '>' + esc(t('sort_' + s)) + '</option>';
      }).join('') + '</select></label></div>' +
      '<div id="results" class="results"></div>' +
      '<div id="more-wrap" class="more-wrap" hidden><button type="button" class="btn btn-ghost" id="more-btn">' + esc(t('showMore')) + '</button></div>';

    function mount(root) {
      var input = $('#search-input', root);
      var form = input.form;
      var resultsEl = $('#results', root);
      var metaEl = $('#result-meta', root);
      var moreWrap = $('#more-wrap', root);
      var res = null, shown = 0;

      function url() {
        var p = new URLSearchParams();
        if (cur.q) p.set('q', cur.q);
        if (cur.cat) p.set('cat', cur.cat);
        if (cur.sort !== 'relevance') p.set('sort', cur.sort);
        var s = p.toString();
        return '#/search' + (s ? '?' + s : '');
      }

      function update() {
        res = SE.search(index, cur.q, { category: cur.cat, sort: cur.sort });
        history.replaceState(null, '', url());
        shown = 0;
        resultsEl.innerHTML = '';
        if (!cur.q.trim() && !cur.cat) {
          metaEl.textContent = '';
          resultsEl.innerHTML = startPanel();
        } else if (res.tooShort) {
          metaEl.textContent = '';
          resultsEl.innerHTML = '<p class="hint">' + icon('info') + ' ' + esc(t('typeMore', { n: SE.MIN_QUERY_LENGTH })) + '</p>';
        } else if (!res.total) {
          metaEl.textContent = t('noResultsMeta', { ms: res.tookMs.toFixed(1) });
          resultsEl.innerHTML = noResults(res);
        } else {
          var fuzzy = res.items.length && res.items[0].fuzzy;
          metaEl.textContent = t(res.total === 1 ? 'resultsMeta1' : 'resultsMeta', { n: res.total, ms: res.tookMs.toFixed(1) }) + (fuzzy ? ' · ' + t('similarSpelling') : '');
          appendPage();
        }
        moreWrap.hidden = !res || shown >= res.total;
      }

      function appendPage() {
        var next = res.items.slice(shown, shown + PAGE_SIZE);
        resultsEl.insertAdjacentHTML('beforeend', next.map(medCard).join(''));
        shown += next.length;
        moreWrap.hidden = shown >= res.total;
      }

      function startPanel() {
        var recent = state.recent.length
          ? '<div class="panel-block"><div class="panel-head"><h2 class="h3">' + esc(t('recentSearches')) + '</h2>' +
            '<button type="button" class="link-btn small" data-action="clear-recent">' + esc(t('clear')) + '</button></div><div class="chip-row">' +
            state.recent.map(function (r) { return '<button type="button" class="chip" data-q="' + esc(r) + '">' + icon('clock') + ' ' + esc(r) + '</button>'; }).join('') + '</div></div>'
          : '';
        var tryThese = ['Dolo 650', 'Pan 40', 'metformin', 'bukhar', 'sugar', 'Telma', 'vit d3', 'paracetmol'];
        return recent + '<div class="panel-block"><h2 class="h3">' + esc(t('tryThese')) + '</h2><div class="chip-row">' +
          tryThese.map(function (q) { return '<button type="button" class="chip" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') +
          '</div><p class="muted small">' + esc(t('searchTip')) + '</p></div>';
      }

      function noResults(r) {
        var dym = r.didYouMean.length
          ? '<p>' + esc(t('didYouMean')) + ' ' + r.didYouMean.map(function (w) { return '<button type="button" class="chip" data-q="' + esc(w) + '">' + esc(w) + '</button>'; }).join(' ') + '</p>' : '';
        return emptyState('search', t('noResults', { q: cur.q }), esc(t('noResultsBody')),
          dym + '<a class="btn btn-ghost" href="#/feedback?type=request&med=' + encodeURIComponent(cur.q) + '">' + icon('message') + ' ' + esc(t('requestMedicine')) + '</a>');
      }

      var debounced = SE.debounce(function () { cur.q = input.value; update(); }, SE.DEBOUNCE_MS);
      input.addEventListener('input', debounced);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        debounced.cancel();
        cur.q = input.value;
        addRecent(cur.q);
        update();
        if (window.matchMedia('(max-width: 720px)').matches) input.blur();
      });

      root.addEventListener('click', function (e) {
        var chip = e.target.closest('[data-cat]');
        if (chip && root.contains(chip)) {
          cur.cat = chip.getAttribute('data-cat');
          $all('[data-cat]', root).forEach(function (c) { c.classList.toggle('active', c === chip); });
          update();
          return;
        }
        var qChip = e.target.closest('[data-q]');
        if (qChip) {
          input.value = qChip.getAttribute('data-q');
          cur.q = input.value;
          addRecent(cur.q);
          update();
          return;
        }
        if (e.target.closest('[data-med]')) addRecent(cur.q);
      });

      $('#sort-select', root).addEventListener('change', function (e) { cur.sort = e.target.value; update(); });
      $('#more-btn', root).addEventListener('click', appendPage);

      // Load the next page automatically when the user scrolls near the end.
      var observer = null;
      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(function (entries) {
          if (entries[0].isIntersecting && res && shown < res.total) appendPage();
        }, { rootMargin: '400px' });
        observer.observe(moreWrap);
      }

      update();
      if (!cur.q && !cur.cat && window.matchMedia('(min-width: 721px)').matches) input.focus();

      return function () { debounced.cancel(); if (observer) observer.disconnect(); };
    }

    return { html: html, mount: mount, title: t('navSearch') };
  }

  /* ---------- Medicine detail ---------- */

  function viewMedicine(params, id) {
    var m = medById[id];
    if (!m) return viewNotFound();
    var ps = S.priceSummary(m);
    var alt = S.alternativesFor(m, catalog);
    var cls = catalog.classes[m.cls] || {};
    var maxBar = Math.max(m.price, ps.max || 0) || 1;
    var units = unitsInPack(m);

    var priceBars = ps.count
      ? '<div class="bars" aria-hidden="true">' +
        '<div class="bar-row"><span>' + esc(t('janAushadhi')) + '</span><div class="bar"><i class="ja" style="width:' + Math.max(3, m.price / maxBar * 100) + '%"></i></div><b>' + rupee(m.price) + '</b></div>' +
        '<div class="bar-row"><span>' + esc(t('brandAvg')) + '</span><div class="bar"><i class="br" style="width:' + (ps.avg / maxBar * 100) + '%"></i></div><b>' + rupee(ps.avg) + '</b></div>' +
        '</div>'
      : '';

    var brandsTable = alt.brands.length
      ? '<div class="table-wrap"><table class="alt-table"><caption class="sr-only">' + esc(t('altBrandsLong')) + '</caption><thead><tr><th scope="col">' + esc(t('brand')) + '</th><th scope="col">' + esc(t('price')) + '</th><th scope="col">' + esc(t('youSave')) + '</th></tr></thead><tbody>' +
        alt.brands.map(function (b) {
          return '<tr><th scope="row">' + esc(b.name) + '</th><td>' + rupee(b.price) + '</td><td class="' + (b.save > 0 ? 'save' : '') + '">' +
            (b.save > 0 ? rupee(b.save) + ' (' + b.savePct + '%)' : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="muted">' + esc(t('noBrandData')) + '</p>';

    function miniList(list) {
      return '<div class="mini-grid">' + list.map(function (x) {
        var xs = S.priceSummary(x);
        return '<a class="mini-med" href="#/medicine/' + x.id + '"><span class="mm-name">' + esc(x.name) + '</span>' +
          '<span class="mm-meta">' + esc(x.pack) + (x.rx ? ' · Rx' : '') + '</span>' +
          '<span class="mm-price">' + rupee(x.price) + (xs.count ? ' <small>' + esc(t('savePct', { n: xs.savePct })) + '</small>' : '') + '</span></a>';
      }).join('') + '</div>';
    }

    var calc = units && ps.count
      ? '<section class="card" aria-labelledby="calc-h"><h2 id="calc-h">' + esc(t('calcTitle')) + '</h2>' +
        '<div class="seg" role="group" aria-label="' + esc(t('perDay')) + '"><span class="small muted">' + esc(t('perDay')) + '</span>' +
        [1, 2, 3].map(function (n) { return '<button type="button" class="chip' + (n === 1 ? ' active' : '') + '" data-perday="' + n + '">' + n + '</button>'; }).join('') + '</div>' +
        '<div id="calc-out" class="calc-out"></div></section>'
      : '';

    var near = S.kendrasNear(K.kendras, state.loc, state.radius);
    var avail = near.items.map(function (e) { return { e: e, s: S.stockFor(e.kendra, m, state.reports) }; })
      .sort(function (a, b) { return (S.isAvailable(b.s) - S.isAvailable(a.s)) || (a.e.km - b.e.km); })
      .slice(0, 6);
    var availCount = near.items.filter(function (e) { return S.isAvailable(S.stockFor(e.kendra, m, state.reports)); }).length;

    var html =
      '<nav class="crumbs" aria-label="Breadcrumb"><a href="#/search">' + esc(t('navSearch')) + '</a> ' + icon('chevron-right') +
      ' <a href="#/search?cat=' + m.category + '">' + esc(catName(m.category)) + '</a></nav>' +

      '<section class="card med-hero">' +
        '<div class="med-hero-main">' +
          '<p class="tags">' + (m.rx ? '<span class="tag tag-rx">' + esc(t('rxNeeded')) + '</span>' : '<span class="tag tag-otc">' + esc(t('otc')) + '</span>') +
          '<span class="tag">' + esc(m.form) + '</span><span class="tag">' + esc(catName(m.category)) + '</span></p>' +
          '<h1>' + esc(m.name) + '</h1>' +
          (m.nameHi ? '<p class="hi-name" lang="hi">' + esc(m.nameHi) + '</p>' : '') +
          '<p class="muted">' + esc(t('packOf', { pack: m.pack })) + ' · ' + esc(t('productCode')) + ' ' + esc(m.id.toUpperCase()) + '</p>' +
          '<p class="uses"><strong>' + esc(t('usedFor')) + ':</strong> ' + esc(cls.uses || '') + ' <span class="muted small">(' + esc(cls.label || '') + ')</span></p>' +
        '</div>' +
        '<div class="price-panel">' +
          '<span class="mc-ja-label">' + esc(t('jaPrice')) + '</span>' +
          '<span class="ja-big">' + rupee(m.price) + '</span>' +
          '<span class="muted small">' + esc(t('perPack', { pack: m.pack })) + '</span>' +
          (ps.count ? '<span class="save-badge big">' + esc(t('savePct', { n: ps.savePct })) + ' · ' + esc(t('vsBrandAvg', { p: rupee(ps.avg) })) + '</span>' : '') +
          priceBars +
          '<div class="kc-actions">' +
            '<button type="button" class="btn btn-accent" data-action="add-cart" data-id="' + m.id + '">' + icon('plus') + ' ' + esc(t('reserve')) + '</button>' +
            '<button type="button" class="btn btn-ghost" data-action="share">' + icon('share') + ' ' + esc(t('share')) + '</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      calc +

      '<section class="card" id="alternatives" aria-labelledby="alt-h">' +
        '<h2 id="alt-h">' + icon('scale') + ' ' + esc(t('alternatives')) + '</h2>' +
        '<h3>' + esc(t('altBrandsLong')) + ' <span class="count">' + alt.brands.length + '</span></h3>' +
        '<p class="muted small">' + esc(t('altBrandsNote')) + '</p>' + brandsTable +
        (alt.strengths.length ? '<h3>' + esc(t('altStrengthsLong')) + ' <span class="count">' + alt.strengths.length + '</span></h3>' + miniList(alt.strengths) : '') +
        (alt.similar.length ? '<h3>' + esc(t('altSimilarLong')) + ' <span class="count">' + alt.similar.length + '</span></h3>' +
          '<p class="caution-note">' + icon('alert') + ' ' + esc(t('altSimilarNote')) + '</p>' + miniList(alt.similar) : '') +
        (alt.related.length ? '<details class="related"><summary>' + esc(t('altRelatedLong')) + ' <span class="count">' + alt.related.length + '</span></summary>' +
          '<p class="caution-note">' + icon('alert') + ' ' + esc(t('altSimilarNote')) + '</p>' + miniList(alt.related) + '</details>' : '') +
      '</section>' +

      '<section class="card" id="availability" aria-labelledby="av-h">' +
        '<h2 id="av-h">' + icon('store') + ' ' + esc(t('availabilityNear')) + '</h2>' +
        locationBar() +
        (near.items.length ? '<p class="muted small">' + esc(t('availSummary', { a: availCount, n: near.items.length, r: state.radius })) + '</p>' : '') +
        (avail.length ? '<div class="kendra-list">' + avail.map(function (x) { return kendraCard(x.e, { med: m }); }).join('') + '</div>' : noneNearby(near)) +
        '<p class="muted small stock-note">' + icon('info') + ' ' + esc(t('stockNote')) + '</p>' +
      '</section>' +

      '<p class="disclaimer">' + icon('alert') + ' ' + esc(t('medDisclaimer')) + '</p>';

    function mount(root, p) {
      var out = $('#calc-out', root);
      function calcFor(n) {
        var perUnit = m.price / units, brandUnit = ps.avg / units;
        var month = perUnit * n * 30, bMonth = brandUnit * n * 30;
        out.innerHTML = '<div class="calc-grid">' +
          '<div><span class="small muted">' + esc(t('monthJa')) + '</span><b>' + rupee(Math.round(month)) + '</b></div>' +
          '<div><span class="small muted">' + esc(t('monthBrand')) + '</span><b>' + rupee(Math.round(bMonth)) + '</b></div>' +
          '<div class="save"><span class="small muted">' + esc(t('yearSave')) + '</span><b>' + rupee(Math.round((bMonth - month) * 12)) + '</b></div></div>';
      }
      if (out) {
        calcFor(1);
        root.addEventListener('click', function (e) {
          var b = e.target.closest('[data-perday]');
          if (!b) return;
          $all('[data-perday]', root).forEach(function (x) { x.classList.toggle('active', x === b); });
          calcFor(Number(b.getAttribute('data-perday')));
        });
      }
      var focus = p.get('focus');
      if (focus && $('#' + focus, root)) setTimeout(function () { $('#' + focus, root).scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
    }

    return { html: html, mount: mount, title: m.name };
  }

  /* ---------- Kendra locator ---------- */

  var leafletPromise = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (!leafletPromise) {
      leafletPromise = new Promise(function (resolve, reject) {
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(css);
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        s.onload = function () { resolve(window.L); };
        s.onerror = function () { leafletPromise = null; reject(new Error('map failed')); };
        document.head.appendChild(s);
      });
    }
    return leafletPromise;
  }

  function viewKendras() {
    var html = pageHead(t('kendrasTitle'), t('kendrasLead')) +
      locationBar() +
      '<div class="toolbar">' +
        '<div class="radius-chips" role="group" aria-label="' + esc(t('radius')) + '"><span class="small muted">' + esc(t('radius')) + '</span>' +
        RADII.map(function (r) { return '<button type="button" class="chip' + (state.radius === r ? ' active' : '') + '" data-radius="' + r + '">' + r + ' km</button>'; }).join('') +
        '</div>' +
        '<div class="toolbar-right">' +
          '<label class="sr-only" for="kq">' + esc(t('filterKendras')) + '</label>' +
          '<input id="kq" class="input" type="search" placeholder="' + esc(t('filterKendras')) + '" value="' + esc(ui.kendraQuery) + '">' +
          '<label class="check small"><input type="checkbox" id="kclosed"' + (ui.includeClosed ? ' checked' : '') + '> ' + esc(t('showClosed')) + '</label>' +
          '<div class="seg-toggle" role="group" aria-label="' + esc(t('view')) + '">' +
            '<button type="button" data-mode="list" class="' + (ui.kendraMode === 'list' ? 'active' : '') + '">' + icon('list') + ' ' + esc(t('list')) + '</button>' +
            '<button type="button" data-mode="map" class="' + (ui.kendraMode === 'map' ? 'active' : '') + '">' + icon('map') + ' ' + esc(t('map')) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<p id="k-count" class="muted small" aria-live="polite"></p>' +
      '<div class="kendra-layout" id="k-layout"><div id="k-list" class="kendra-list"></div><div id="k-map" class="map-box" hidden></div></div>';

    function mount(root) {
      var listEl = $('#k-list', root), mapEl = $('#k-map', root), countEl = $('#k-count', root), layout = $('#k-layout', root);
      var map = null, layer = null, current = [];

      function draw() {
        var near = S.kendrasNear(K.kendras, state.loc, state.radius, { includeClosed: ui.includeClosed, query: ui.kendraQuery });
        current = near.items;
        countEl.textContent = t('kendraCount', { n: near.items.length, r: state.radius });
        listEl.innerHTML = near.items.length ? near.items.map(function (e) { return kendraCard(e); }).join('') : noneNearby(near);
        drawMarkers();
      }

      function drawMarkers() {
        if (!map || !window.L) return;
        var L = window.L;
        layer.clearLayers();
        var pts = [[state.loc.lat, state.loc.lng]];
        L.circleMarker([state.loc.lat, state.loc.lng], { radius: 8, color: '#1a56db', fillColor: '#1a56db', fillOpacity: 0.9 })
          .addTo(layer).bindPopup(esc(t('youAreHere')));
        current.forEach(function (e) {
          var k = e.kendra, closed = k.status === 'closed';
          pts.push([k.lat, k.lng]);
          L.circleMarker([k.lat, k.lng], { radius: 9, color: '#fff', weight: 2, fillColor: closed ? '#8a8f8c' : '#0b6b35', fillOpacity: 1 })
            .addTo(layer)
            .bindPopup('<b>' + esc(k.name) + '</b><br>' + esc(kmLabel(e.km)) + '<br><a href="#/kendra/' + k.id + '">' + esc(t('stockDetails')) + '</a>');
        });
        if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
        else map.setView(pts[0], 12);
      }

      function setMode(mode) {
        ui.kendraMode = mode;
        $all('[data-mode]', root).forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-mode') === mode); });
        layout.classList.toggle('with-map', mode === 'map');
        mapEl.hidden = mode !== 'map';
        if (mode !== 'map') return;
        if (map) { setTimeout(function () { map.invalidateSize(); }, 50); return; }
        mapEl.innerHTML = '<div class="skeleton map-skel">' + esc(t('loadingMap')) + '</div>';
        // The map library (~150 KB) is only downloaded when the user asks for the map.
        loadLeaflet().then(function (L) {
          if (!document.body.contains(mapEl)) return;
          mapEl.innerHTML = '';
          map = L.map(mapEl, { scrollWheelZoom: false });
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
          layer = L.layerGroup().addTo(map);
          drawMarkers();
        }).catch(function () {
          mapEl.innerHTML = '<div class="empty">' + icon('wifi-off', 'empty-ic') + '<p>' + esc(t('mapOffline')) + '</p></div>';
        });
      }

      root.addEventListener('click', function (e) {
        var r = e.target.closest('[data-radius]');
        if (r) {
          state.radius = Number(r.getAttribute('data-radius'));
          save('radius');
          $all('[data-radius]', root).forEach(function (c) { c.classList.toggle('active', c === r); });
          draw();
          return;
        }
        var md = e.target.closest('[data-mode]');
        if (md) setMode(md.getAttribute('data-mode'));
      });
      var filter = SE.debounce(function (v) { ui.kendraQuery = v; draw(); }, 200);
      $('#kq', root).addEventListener('input', function (e) { filter(e.target.value); });
      $('#kclosed', root).addEventListener('change', function (e) { ui.includeClosed = e.target.checked; draw(); });

      draw();
      if (ui.kendraMode === 'map') setMode('map');
      return function () { filter.cancel(); if (map) map.remove(); };
    }

    return { html: html, mount: mount, title: t('navKendras') };
  }

  function viewKendra(params, id) {
    var k = kendraById[id];
    if (!k) return viewNotFound();
    var d = S.haversineKm(state.loc, k);
    var cur = { q: '', cat: '' };

    var html =
      '<nav class="crumbs" aria-label="Breadcrumb"><a href="#/kendras">' + esc(t('navKendras')) + '</a> ' + icon('chevron-right') + ' ' + esc(k.city) + '</nav>' +
      '<section class="card kendra-hero">' +
        '<h1>' + esc(k.name) + '</h1>' +
        '<p class="muted">' + esc(k.address) + '</p>' +
        '<p class="kc-status">' + openPill(k) + ' <span class="kc-dist">' + icon('pin') + ' ' + esc(t('kmFromYou', { km: kmLabel(d), place: state.loc.label })) + '</span></p>' +
        '<dl class="facts">' +
          '<div><dt>' + esc(t('hours')) + '</dt><dd>' + (S.openState(k).always ? esc(t('open24')) : esc(S.fmtTime(k.opens) + ' – ' + S.fmtTime(k.closes))) + '</dd></div>' +
          '<div><dt>' + esc(t('phone')) + '</dt><dd>' + esc(k.phone) + ' <span class="muted small">(' + esc(t('demoNumber')) + ')</span></dd></div>' +
          '<div><dt>' + esc(t('lastVerified')) + '</dt><dd>' + esc(daysLabel(k.verifiedDaysAgo)) + '</dd></div>' +
        '</dl>' +
        '<div class="kc-actions">' +
          '<a class="btn btn-ghost" href="' + telHref(k.phone) + '">' + icon('phone') + ' ' + esc(t('call')) + '</a>' +
          '<a class="btn btn-primary" href="' + directionsUrl(k) + '" target="_blank" rel="noopener">' + icon('navigation') + ' ' + esc(t('directions')) + '</a>' +
        '</div>' +
        '<details class="report-box"><summary>' + icon('flag') + ' ' + esc(t('reportKendra')) + '</summary><div class="chip-row">' +
          ['rClosed', 'rLocation', 'rPhone', 'rHours'].map(function (r) {
            return '<button type="button" class="chip" data-action="report-kendra" data-k="' + k.id + '" data-r="' + r + '">' + esc(t(r)) + '</button>';
          }).join('') + '</div></details>' +
      '</section>' +

      (k.status === 'closed'
        ? '<div class="notice bad">' + icon('alert') + ' ' + esc(t('closedNotice')) + ' <a href="#/kendras">' + esc(t('findOpen')) + '</a></div>'
        : '<section class="card" aria-labelledby="st-h"><h2 id="st-h">' + esc(t('stockAtKendra')) + '</h2>' +
          '<p class="muted small">' + icon('info') + ' ' + esc(t('stockNote')) + '</p>' +
          '<label class="sr-only" for="ks">' + esc(t('filterStock')) + '</label>' +
          '<input id="ks" class="input" type="search" placeholder="' + esc(t('filterStock')) + '">' +
          '<div class="filter-row">' +
            '<button type="button" class="chip active" data-scat="">' + esc(t('all')) + '</button>' +
            Object.keys(catalog.categories).map(function (c) { return '<button type="button" class="chip" data-scat="' + c + '">' + esc(catName(c)) + '</button>'; }).join('') +
          '</div>' +
          '<p id="ks-meta" class="muted small"></p>' +
          '<div id="ks-list" class="stock-list"></div>' +
          '<div class="more-wrap"><button type="button" class="btn btn-ghost" id="ks-more" hidden>' + esc(t('showMore')) + '</button></div>' +
          '</section>');

    function mount(root) {
      var listEl = $('#ks-list', root);
      if (!listEl) return null;
      var metaEl = $('#ks-meta', root), moreBtn = $('#ks-more', root);
      var rows = [], shown = 0;

      function draw() {
        var meds = cur.q.trim().length >= 2
          ? SE.search(index, cur.q, { category: cur.cat, minLength: 2 }).items.map(function (x) { return x.med; })
          : catalog.medicines.filter(function (m) { return !cur.cat || m.category === cur.cat; });
        rows = meds.map(function (m) { return { m: m, s: S.stockFor(k, m, state.reports) }; });
        var inStock = rows.filter(function (r) { return S.isAvailable(r.s); }).length;
        metaEl.textContent = t('stockMeta', { a: inStock, n: rows.length });
        shown = 0;
        listEl.innerHTML = '';
        more();
      }

      function more() {
        listEl.insertAdjacentHTML('beforeend', rows.slice(shown, shown + PAGE_SIZE).map(function (r) {
          var avail = S.isAvailable(r.s);
          return '<div class="stock-row"><a href="#/medicine/' + r.m.id + '" class="sr-name">' + esc(r.m.name) + '<span class="muted small">' + esc(r.m.pack) + '</span></a>' +
            '<span class="sr-price">' + rupee(r.m.price) + '</span>' + stockLine(r.s, k, r.m) +
            (avail ? '<button type="button" class="btn btn-sm btn-accent" data-action="add-cart" data-id="' + r.m.id + '" data-kendra="' + k.id + '" aria-label="' + esc(t('reserve') + ' ' + r.m.name) + '">' + icon('plus') + '</button>' : '<span></span>') +
            '</div>';
        }).join(''));
        shown = Math.min(rows.length, shown + PAGE_SIZE);
        moreBtn.hidden = shown >= rows.length;
      }

      var deb = SE.debounce(function (v) { cur.q = v; draw(); }, SE.DEBOUNCE_MS);
      $('#ks', root).addEventListener('input', function (e) { deb(e.target.value); });
      root.addEventListener('click', function (e) {
        var c = e.target.closest('[data-scat]');
        if (!c) return;
        cur.cat = c.getAttribute('data-scat');
        $all('[data-scat]', root).forEach(function (x) { x.classList.toggle('active', x === c); });
        draw();
      });
      moreBtn.addEventListener('click', more);
      draw();
      return function () { deb.cancel(); };
    }

    return { html: html, mount: mount, title: k.name };
  }

  /* ---------- Prescription savings ---------- */

  var SAMPLE_RX = 'Dolo 650\nTelma 40\nPan 40\nGlycomet 500\nShelcal 500\nAtorva 10';

  function viewCompare() {
    var html = pageHead(t('compareTitle'), t('compareLead')) +
      '<section class="card">' +
        '<form data-form="rx" class="rx-form">' +
          '<label for="rx-input" class="label">' + esc(t('rxLabel')) + '</label>' +
          '<textarea id="rx-input" class="input" rows="6" placeholder="Dolo 650&#10;Telma 40&#10;Pan 40">' + esc(state.rxDraft) + '</textarea>' +
          '<div class="kc-actions">' +
            '<button type="submit" class="btn btn-accent">' + icon('scale') + ' ' + esc(t('findGenerics')) + '</button>' +
            '<button type="button" class="btn btn-ghost" id="rx-sample">' + esc(t('trySample')) + '</button>' +
          '</div>' +
        '</form>' +
      '</section>' +
      '<div id="rx-result"></div>';

    function mount(root) {
      var ta = $('#rx-input', root), out = $('#rx-result', root);
      var rows = [];

      function analyse() {
        state.rxDraft = ta.value;
        save('rxDraft');
        var lines = ta.value.split(/\n|,/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 30);
        rows = lines.map(function (line) {
          var r = SE.search(index, line, { minLength: 2 });
          return { line: line, options: r.items.slice(0, 4), pick: 0 };
        });
        draw();
      }

      function brandPriceFor(opt) {
        var m = opt.med;
        if (opt.matchedBrand) {
          var b = m.brands.filter(function (x) { return x.name === opt.matchedBrand; })[0];
          if (b) return { price: b.price, name: b.name };
        }
        var ps = S.priceSummary(m);
        return ps.count ? { price: ps.avg, name: t('brandAvg') } : null;
      }

      function draw() {
        if (!rows.length) { out.innerHTML = ''; return; }
        var totalJa = 0, totalBrand = 0, found = 0;
        var body = rows.map(function (r, i) {
          if (!r.options.length) {
            return '<tr class="not-found"><th scope="row">' + esc(r.line) + '</th><td colspan="4">' + icon('alert') + ' ' + esc(t('rxNotFound')) +
              ' <a href="#/feedback?type=request&med=' + encodeURIComponent(r.line) + '">' + esc(t('requestMedicine')) + '</a></td></tr>';
          }
          var opt = r.options[r.pick];
          var bp = brandPriceFor(opt);
          found++;
          totalJa += opt.med.price;
          totalBrand += bp ? bp.price : opt.med.price;
          var select = r.options.length > 1
            ? '<select data-row="' + i + '" aria-label="' + esc(t('chooseMatch')) + '">' + r.options.map(function (o, j) {
                return '<option value="' + j + '"' + (j === r.pick ? ' selected' : '') + '>' + esc(o.med.name) + '</option>';
              }).join('') + '</select>'
            : '<a href="#/medicine/' + opt.med.id + '">' + esc(opt.med.name) + '</a>';
          return '<tr><th scope="row">' + esc(r.line) + (opt.matchedBrand ? '<span class="muted small"> = ' + esc(opt.med.salt) + '</span>' : '') + '</th>' +
            '<td class="rx-gen">' + select + '<span class="muted small block">' + esc(opt.med.pack) + '</span></td>' +
            '<td data-label="' + esc(t('rxBrandPrice')) + '">' + (bp ? rupee(bp.price) + '<span class="muted small block">' + esc(bp.name) + '</span>' : '—') + '</td>' +
            '<td data-label="' + esc(t('jaPrice')) + '"><b>' + rupee(opt.med.price) + '</b></td>' +
            '<td class="save" data-label="' + esc(t('youSave')) + '">' + (bp && bp.price > opt.med.price ? rupee(bp.price - opt.med.price) : '—') + '</td></tr>';
        }).join('');
        var saveAmt = totalBrand - totalJa;
        out.innerHTML = '<section class="card">' +
          '<div class="rx-summary">' +
            stat(rupee(Math.round(totalBrand)), t('rxBrandTotal')) +
            stat(rupee(Math.round(totalJa)), t('rxJaTotal')) +
            stat(rupee(Math.round(saveAmt)) + ' (' + S.pct(totalJa, totalBrand) + '%)', t('rxYouSave')) +
            stat(rupee(Math.round(saveAmt * 12)), t('rxYearly')) +
          '</div>' +
          '<div class="table-wrap"><table class="alt-table rx-table"><thead><tr>' +
            '<th scope="col">' + esc(t('rxYouTyped')) + '</th><th scope="col">' + esc(t('rxGeneric')) + '</th><th scope="col">' + esc(t('rxBrandPrice')) + '</th>' +
            '<th scope="col">' + esc(t('jaPrice')) + '</th><th scope="col">' + esc(t('youSave')) + '</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
          '<p class="muted small">' + esc(t('rxNote')) + '</p>' +
          (found ? '<button type="button" class="btn btn-accent" id="rx-reserve">' + icon('cart') + ' ' + esc(t('reserveAll', { n: found })) + '</button>' : '') +
          '</section>';
      }

      root.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); analyse(); });
      $('#rx-sample', root).addEventListener('click', function () { ta.value = SAMPLE_RX; analyse(); });
      out.addEventListener('change', function (e) {
        var s = e.target.closest('[data-row]');
        if (!s) return;
        rows[Number(s.getAttribute('data-row'))].pick = Number(s.value);
        draw();
      });
      out.addEventListener('click', function (e) {
        if (!e.target.closest('#rx-reserve')) return;
        rows.forEach(function (r) { if (r.options.length) addToCart(r.options[r.pick].med.id, 1, true); });
        toast(t('addedAll'), 'ok');
        location.hash = '#/cart';
      });
      if (state.rxDraft.trim()) analyse();
    }

    return { html: html, mount: mount, title: t('navCompare') };
  }

  /* ---------- Cart / reserve for pickup ---------- */

  function addToCart(id, qty, silent) {
    var line = state.cart.filter(function (l) { return l.id === id; })[0];
    if (line) line.qty = Math.min(20, line.qty + (qty || 1));
    else state.cart.push({ id: id, qty: qty || 1 });
    save('cart');
    updateCartBadge();
    if (!silent) toast(t('addedToCart', { name: medById[id].name }), 'ok', { label: t('viewCart'), href: '#/cart' });
  }

  function viewCart() {
    if (!state.cart.length) {
      return {
        html: pageHead(t('cartTitle'), t('cartLead')) +
          emptyState('cart', t('cartEmpty'), esc(t('cartEmptyBody')),
            '<a class="btn btn-accent" href="#/search">' + icon('search') + ' ' + esc(t('searchMedicines')) + '</a>' +
            (state.orders.length ? ' <a class="btn btn-ghost" href="#/orders">' + esc(t('myOrders')) + '</a>' : '')),
        title: t('navCart')
      };
    }
    var lines = state.cart.filter(function (l) { return medById[l.id]; });
    var total = 0, brandTotal = 0;
    var items = lines.map(function (l) {
      var m = medById[l.id], ps = S.priceSummary(m);
      total += m.price * l.qty;
      brandTotal += (ps.count ? ps.avg : m.price) * l.qty;
      return '<div class="cart-row"><div><a href="#/medicine/' + m.id + '" class="cr-name">' + esc(m.name) + '</a><span class="muted small block">' + esc(m.pack) + ' · ' + rupee(m.price) + (m.rx ? ' · ' + esc(t('rxCarry')) : '') + '</span></div>' +
        '<div class="stepper" role="group" aria-label="' + esc(t('quantity')) + '">' +
          '<button type="button" data-action="qty" data-id="' + m.id + '" data-d="-1" aria-label="' + esc(t('decrease')) + '">' + icon('minus') + '</button>' +
          '<span aria-live="polite">' + l.qty + '</span>' +
          '<button type="button" data-action="qty" data-id="' + m.id + '" data-d="1" aria-label="' + esc(t('increase')) + '">' + icon('plus') + '</button>' +
        '</div><b class="cr-total">' + rupee(m.price * l.qty) + '</b>' +
        '<button type="button" class="icon-btn" data-action="remove" data-id="' + m.id + '" aria-label="' + esc(t('remove')) + '">' + icon('trash') + '</button></div>';
    }).join('');

    var near = S.kendrasNear(K.kendras, state.loc, Math.max(state.radius, 25)).items
      .map(function (e) { return { e: e, cov: S.basketCoverage(e.kendra, lines, medById, state.reports) }; })
      .sort(function (a, b) { return (b.cov - a.cov) || (a.e.km - b.e.km); })
      .slice(0, 5);
    var chosen = state.cartKendra && near.some(function (x) { return x.e.kendra.id === state.cartKendra; }) ? state.cartKendra : (near[0] && near[0].e.kendra.id);

    var kendraOptions = near.length
      ? near.map(function (x) {
          var k = x.e.kendra, full = x.cov === lines.length;
          return '<label class="radio-card' + (k.id === chosen ? ' checked' : '') + '"><input type="radio" name="kendra" value="' + k.id + '"' + (k.id === chosen ? ' checked' : '') + '>' +
            '<span><b>' + esc(k.name) + '</b><span class="muted small block">' + esc(kmLabel(x.e.km)) + ' · ' + esc(k.area) + '</span></span>' +
            pill(full ? 'ok' : (x.cov ? 'warn' : 'bad'), t('coverage', { a: x.cov, n: lines.length })) + '</label>';
        }).join('')
      : '<p class="muted">' + esc(t('noKendraForCart')) + '</p>';

    var html = pageHead(t('cartTitle'), t('cartLead')) +
      '<div class="cart-layout">' +
        '<section class="card"><h2>' + esc(t('yourItems')) + '</h2>' + items +
          '<div class="cart-total"><span>' + esc(t('total')) + '</span><b>' + rupee(total) + '</b></div>' +
          (brandTotal > total ? '<p class="save-line">' + icon('check', 'ok') + ' ' + esc(t('cartSaving', { amt: rupee(Math.round(brandTotal - total)) })) + '</p>' : '') +
        '</section>' +
        '<form class="card" data-form="reserve" novalidate><h2>' + esc(t('pickupAt')) + '</h2>' +
          '<div class="radio-list">' + kendraOptions + '</div>' +
          '<div class="form-grid">' +
            '<label class="label">' + esc(t('pickupWhen')) + '<select name="when" class="input"><option value="today">' + esc(t('today')) + '</option><option value="tomorrow">' + esc(t('tomorrow')) + '</option></select></label>' +
            '<label class="label">' + esc(t('yourName')) + '<input name="name" class="input" autocomplete="name" value="' + esc(state.user && state.user.name || '') + '"></label>' +
            '<label class="label">' + esc(t('mobile')) + '<input name="mobile" class="input" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="98XXXXXXXX" value="' + esc(state.user ? state.user.phone : '') + '"></label>' +
          '</div>' +
          '<label class="check disabled"><input type="checkbox" disabled> ' + esc(t('homeDelivery')) + ' <span class="pill pill-info">' + esc(t('comingSoon')) + '</span></label>' +
          '<p class="form-error" id="cart-err" role="alert" hidden></p>' +
          '<button type="submit" class="btn btn-accent btn-block"' + (near.length ? '' : ' disabled') + '>' + icon('check') + ' ' + esc(t('reserveNow')) + '</button>' +
          '<p class="muted small">' + esc(t('reserveNote')) + '</p>' +
        '</form>' +
      '</div>';

    function mount(root) {
      root.addEventListener('change', function (e) {
        if (e.target.name !== 'kendra') return;
        state.cartKendra = e.target.value;
        save('cartKendra');
        $all('.radio-card', root).forEach(function (c) { c.classList.toggle('checked', c.contains(e.target)); });
      });
    }

    return { html: html, mount: mount, title: t('navCart') };
  }

  function orderStatus(o) {
    if (o.status === 'cancelled') return 'cancelled';
    if (o.status === 'collected') return 'collected';
    return Date.now() - o.at > 60 * 1000 ? 'ready' : 'sent'; // demo: "ready" after one minute
  }

  function viewOrders() {
    var html = pageHead(t('ordersTitle'), t('ordersLead'));
    if (!state.orders.length) {
      html += emptyState('cart', t('noOrders'), '', '<a class="btn btn-accent" href="#/search">' + esc(t('searchMedicines')) + '</a>');
    } else {
      html += '<div class="order-list">' + state.orders.map(function (o) {
        var k = kendraById[o.kendra] || { name: '—', address: '' };
        var st = orderStatus(o);
        var stepIdx = { sent: 0, ready: 1, collected: 2, cancelled: -1 }[st];
        return '<article class="card order">' +
          '<div class="order-head"><div><span class="muted small">' + esc(t('pickupCode')) + '</span><span class="code">' + esc(o.code) + '</span></div>' +
          pill(st === 'ready' ? 'ok' : (st === 'cancelled' ? 'bad' : 'info'), t('st_' + st)) + '</div>' +
          (st !== 'cancelled' ? '<ol class="steps">' + ['st_sent', 'st_ready', 'st_collected'].map(function (s, i) {
            return '<li class="' + (i <= stepIdx ? 'done' : '') + '">' + esc(t(s)) + '</li>';
          }).join('') + '</ol>' : '') +
          '<p><b>' + esc(k.name) + '</b><span class="muted small block">' + esc(k.address) + '</span></p>' +
          '<p class="small">' + o.items.map(function (l) { return esc((medById[l.id] || {}).name) + ' × ' + l.qty; }).join(', ') + '</p>' +
          '<p class="small muted">' + esc(dateLabel(o.at)) + ' · ' + esc(t(o.when)) + ' · ' + esc(t('total')) + ' ' + rupee(o.total) + '</p>' +
          '<div class="kc-actions">' +
            (k.lat ? '<a class="btn btn-sm btn-ghost" href="' + directionsUrl(k) + '" target="_blank" rel="noopener">' + icon('navigation') + ' ' + esc(t('directions')) + '</a>' : '') +
            (st === 'sent' || st === 'ready' ? '<button type="button" class="btn btn-sm btn-ghost" data-action="cancel-order" data-code="' + esc(o.code) + '">' + esc(t('cancel')) + '</button>' : '') +
          '</div></article>';
      }).join('') + '</div>';
    }
    return { html: html, title: t('myOrders') };
  }

  /* ---------- Feedback / complaints ---------- */

  var TICKET_TYPES = ['stock', 'closed', 'price', 'request', 'app', 'other'];

  function viewFeedback(params) {
    var type = params.get('type') || 'stock';
    var med = params.get('med') || '';
    var kid = params.get('kendra') || '';
    var near = S.kendrasNear(K.kendras, state.loc, 50).items.slice(0, 15);

    var html = pageHead(t('feedbackTitle'), t('feedbackLead')) +
      '<div class="two-col">' +
      '<form class="card" data-form="feedback" novalidate>' +
        '<label class="label">' + esc(t('fbType')) + '<select name="type" class="input">' +
          TICKET_TYPES.map(function (x) { return '<option value="' + x + '"' + (x === type ? ' selected' : '') + '>' + esc(t('tt_' + x)) + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="label">' + esc(t('fbKendra')) + '<select name="kendra" class="input"><option value="">' + esc(t('notSpecific')) + '</option>' +
          near.map(function (e) { return '<option value="' + e.kendra.id + '"' + (e.kendra.id === kid ? ' selected' : '') + '>' + esc(e.kendra.name + ' (' + kmLabel(e.km) + ')') + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="label">' + esc(t('fbMedicine')) + '<input name="med" class="input" value="' + esc(med) + '" placeholder="' + esc(t('optional')) + '"></label>' +
        '<label class="label">' + esc(t('fbMessage')) + '<textarea name="message" class="input" rows="4" required minlength="10" placeholder="' + esc(t('fbMessagePh')) + '"></textarea></label>' +
        '<label class="label">' + esc(t('fbMobile')) + '<input name="mobile" class="input" inputmode="numeric" maxlength="10" value="' + esc(state.user ? state.user.phone : '') + '" placeholder="' + esc(t('optional')) + '"></label>' +
        '<p class="form-error" id="fb-err" role="alert" hidden></p>' +
        '<button type="submit" class="btn btn-accent btn-block">' + icon('message') + ' ' + esc(t('submit')) + '</button>' +
      '</form>' +
      '<section class="card"><h2>' + esc(t('yourTickets')) + '</h2>' +
        (state.tickets.length ? '<ul class="ticket-list">' + state.tickets.map(function (tk) {
          return '<li><div><b>' + esc(tk.id) + '</b> · ' + esc(t('tt_' + tk.type)) + '<span class="muted small block">' + esc(dateLabel(tk.at)) +
            (tk.kendra && kendraById[tk.kendra] ? ' · ' + esc(kendraById[tk.kendra].name) : '') + '</span>' +
            '<span class="small block">' + esc(tk.message) + '</span></div>' + pill('info', t('received')) + '</li>';
        }).join('') + '</ul>' : '<p class="muted">' + esc(t('noTickets')) + '</p>') +
        '<div class="helpline-mini">' + icon('phone') + ' ' + esc(t('orCall')) + ' <a href="tel:' + HELPLINE.replace(/-/g, '') + '"><b>' + HELPLINE + '</b></a></div>' +
      '</section></div>';

    return { html: html, title: t('navFeedback') };
  }

  /* ---------- Login (optional) ---------- */

  function viewLogin(params) {
    if (state.user) {
      var masked = state.user.phone.replace(/^(\d{2})\d{5}(\d{3})$/, '$1•••••$2');
      return {
        html: pageHead(t('profile'), '') +
          '<section class="card narrow"><p>' + icon('user') + ' ' + esc(t('signedInAs')) + ' <b>+91 ' + esc(masked) + '</b></p>' +
          '<div class="kc-actions"><a class="btn btn-ghost" href="#/orders">' + esc(t('myOrders')) + '</a><a class="btn btn-ghost" href="#/feedback">' + esc(t('yourTickets')) + '</a>' +
          '<button type="button" class="btn btn-ghost" data-action="logout">' + esc(t('logout')) + '</button></div></section>',
        title: t('profile')
      };
    }

    var html = pageHead(t('loginTitle'), t('loginLead')) +
      '<section class="card narrow" id="login-box"></section>';

    function mount(root) {
      var box = $('#login-box', root);
      var phone = '', otp = '', attempts = 0, timer = null, left = 0;

      function stepPhone(err) {
        clearInterval(timer);
        box.innerHTML = '<form id="phone-form" novalidate>' +
          '<label class="label" for="ph">' + esc(t('mobile')) + '</label>' +
          '<div class="phone-input"><span>+91</span><input id="ph" class="input" inputmode="numeric" autocomplete="tel-national" maxlength="10" value="' + esc(phone) + '" placeholder="98XXXXXXXX"></div>' +
          '<p class="form-error" role="alert"' + (err ? '' : ' hidden') + '>' + esc(err || '') + '</p>' +
          '<button type="submit" class="btn btn-accent btn-block">' + esc(t('sendOtp')) + '</button>' +
          '<a class="btn btn-ghost btn-block" href="#/">' + esc(t('continueGuest')) + '</a>' +
          '<p class="muted small">' + icon('shield') + ' ' + esc(t('loginPrivacy')) + '</p></form>';
        var ph = $('#ph', box);
        ph.focus();
        $('#phone-form', box).addEventListener('submit', function (e) {
          e.preventDefault();
          var v = ph.value.replace(/\D/g, '');
          if (!/^[6-9]\d{9}$/.test(v)) { stepPhone(t('badPhone')); return; }
          phone = v;
          sendOtp();
        });
      }

      function sendOtp() {
        otp = String(100000 + Math.floor(Math.random() * 900000));
        attempts = 0;
        stepOtp();
        toast(t('demoOtpToast', { otp: otp }), 'info');
      }

      function stepOtp(err) {
        box.innerHTML = '<form id="otp-form" novalidate>' +
          '<p>' + esc(t('otpSentTo')) + ' <b>+91 ' + esc(phone) + '</b> · <button type="button" class="link-btn" id="chg">' + esc(t('changeNumber')) + '</button></p>' +
          '<div class="notice info small">' + icon('info') + ' ' + esc(t('demoOtp')) + ' <b>' + esc(otp) + '</b></div>' +
          '<fieldset class="otp-boxes"><legend class="sr-only">' + esc(t('enterOtp')) + '</legend>' +
          [0, 1, 2, 3, 4, 5].map(function (i) {
            return '<input class="otp" inputmode="numeric" maxlength="1" autocomplete="' + (i === 0 ? 'one-time-code' : 'off') + '" aria-label="' + esc(t('digit', { n: i + 1 })) + '">';
          }).join('') + '</fieldset>' +
          '<p class="form-error" role="alert"' + (err ? '' : ' hidden') + '>' + esc(err || '') + '</p>' +
          '<button type="submit" class="btn btn-accent btn-block">' + esc(t('verify')) + '</button>' +
          '<p class="resend"><button type="button" class="link-btn" id="resend" disabled></button></p></form>';

        var boxes = $all('.otp', box);
        boxes[0].focus();
        boxes.forEach(function (inp, i) {
          inp.addEventListener('input', function () {
            inp.value = inp.value.replace(/\D/g, '').slice(-1);
            if (inp.value && i < 5) boxes[i + 1].focus();
            if (boxes.every(function (b) { return b.value; })) verify();
          });
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace' && !inp.value && i > 0) boxes[i - 1].focus();
          });
          inp.addEventListener('paste', function (e) {
            var text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
            if (!text) return;
            e.preventDefault();
            text.split('').forEach(function (ch, j) { if (boxes[j]) boxes[j].value = ch; });
            if (text.length === 6) verify(); else boxes[text.length].focus();
          });
        });

        function verify() {
          var code = boxes.map(function (b) { return b.value; }).join('');
          if (code.length < 6) { stepOtpError(t('otpIncomplete')); return; }
          if (code === otp) {
            clearInterval(timer);
            state.user = { phone: phone, since: Date.now() };
            save('user');
            renderShell();
            toast(t('loggedIn'), 'ok');
            location.hash = params.get('next') || '#/';
            return;
          }
          attempts++;
          if (attempts >= 3) { otp = ''; stepOtpError(t('otpLocked')); boxes.forEach(function (b) { b.disabled = true; }); return; }
          stepOtpError(t('otpWrong', { n: 3 - attempts }));
          boxes.forEach(function (b) { b.value = ''; });
          boxes[0].focus();
        }
        function stepOtpError(msg) {
          var el = $('.form-error', box);
          el.textContent = msg;
          el.hidden = false;
        }

        $('#otp-form', box).addEventListener('submit', function (e) { e.preventDefault(); verify(); });
        $('#chg', box).addEventListener('click', function () { stepPhone(); });
        var resend = $('#resend', box);
        resend.addEventListener('click', function () { sendOtp(); });
        left = 30;
        clearInterval(timer);
        (function tick() {
          resend.disabled = left > 0;
          resend.textContent = left > 0 ? t('resendIn', { s: left }) : t('resendOtp');
        })();
        timer = setInterval(function () {
          left--;
          resend.disabled = left > 0;
          resend.textContent = left > 0 ? t('resendIn', { s: left }) : t('resendOtp');
          if (left <= 0) clearInterval(timer);
        }, 1000);
      }

      stepPhone();
      return function () { clearInterval(timer); };
    }

    return { html: html, mount: mount, title: t('login') };
  }

  /* ---------- Settings ---------- */

  function viewSettings() {
    var bytes = JSON.stringify(catalog).length;
    var html = pageHead(t('settingsTitle'), '') +
      '<div class="two-col">' +
      '<section class="card"><h2>' + esc(t('language')) + '</h2>' +
        '<div class="seg-toggle">' +
          '<button type="button" data-set-lang="en" class="' + (state.lang === 'en' ? 'active' : '') + '">English</button>' +
          '<button type="button" data-set-lang="hi" class="' + (state.lang === 'hi' ? 'active' : '') + '" lang="hi">हिंदी</button>' +
        '</div>' +
        '<h2>' + esc(t('textSize')) + '</h2>' +
        '<div class="seg-toggle">' + ['normal', 'large', 'xl'].map(function (s) {
          return '<button type="button" data-set-size="' + s + '" class="' + (state.textSize === s ? 'active' : '') + '">' + esc(t('size_' + s)) + '</button>';
        }).join('') + '</div>' +
        '<h2>' + esc(t('display')) + '</h2>' +
        '<label class="check"><input type="checkbox" id="contrast"' + (state.contrast ? ' checked' : '') + '> ' + esc(t('highContrast')) + '</label>' +
      '</section>' +
      '<section class="card"><h2>' + esc(t('offlineData')) + '</h2>' +
        '<dl class="facts">' +
          '<div><dt>' + esc(t('catalogueVersion')) + '</dt><dd>' + esc(catalog.version) + '</dd></div>' +
          '<div><dt>' + esc(t('itemsOnDevice')) + '</dt><dd>' + catalog.medicines.length + ' ' + esc(t('medicinesWord')) + ' · ' + K.kendras.length + ' ' + esc(t('kendrasWord')) + '</dd></div>' +
          '<div><dt>' + esc(t('dataSize')) + '</dt><dd>' + Math.round(bytes / 1024) + ' KB</dd></div>' +
          '<div><dt>' + esc(t('lastChecked')) + '</dt><dd id="last-sync">' + (state.lastSync ? esc(dateLabel(state.lastSync)) : '—') + '</dd></div>' +
        '</dl>' +
        '<p class="muted small">' + esc(t('syncExplain')) + '</p>' +
        '<button type="button" class="btn btn-ghost" data-action="sync-now">' + icon('refresh') + ' ' + esc(t('checkUpdates')) + '</button>' +
        (ui.installPrompt ? ' <button type="button" class="btn btn-primary" data-action="install">' + icon('download') + ' ' + esc(t('installApp')) + '</button>' : '') +
        '<h2>' + esc(t('yourData')) + '</h2>' +
        '<p class="muted small">' + esc(t('yourDataExplain')) + '</p>' +
        '<button type="button" class="btn btn-danger" data-action="clear-data">' + icon('trash') + ' ' + esc(t('clearData')) + '</button>' +
      '</section></div>';

    function mount(root) {
      root.addEventListener('click', function (e) {
        var l = e.target.closest('[data-set-lang]');
        if (l) { setLang(l.getAttribute('data-set-lang')); return; }
        var s = e.target.closest('[data-set-size]');
        if (s) { state.textSize = s.getAttribute('data-set-size'); save('textSize'); applyPrefs(); refresh(); }
      });
      $('#contrast', root).addEventListener('change', function (e) { state.contrast = e.target.checked; save('contrast'); applyPrefs(); });
    }

    return { html: html, mount: mount, title: t('navSettings') };
  }

  function setLang(lang) {
    state.lang = lang;
    save('lang');
    applyPrefs();
    renderShell();
    refresh();
  }

  /* ---------- Help, About, More ---------- */

  function viewHelp() {
    var faqs = ['faq1', 'faq2', 'faq3', 'faq4', 'faq5', 'faq6'];
    var html = pageHead(t('helpTitle'), t('helpLead')) +
      '<section class="card helpline">' + icon('phone', 'big-ic') +
        '<div><p class="muted small">' + esc(t('tollFree')) + '</p><a class="helpline-no" href="tel:' + HELPLINE.replace(/-/g, '') + '">' + HELPLINE + '</a>' +
        '<p class="muted small">' + esc(t('helplineNote')) + '</p></div>' +
        '<a class="btn btn-accent" href="#/feedback">' + icon('message') + ' ' + esc(t('raiseComplaint')) + '</a>' +
      '</section>' +
      '<h2 class="section-title">' + esc(t('faqTitle')) + '</h2>' +
      '<div class="faq">' + faqs.map(function (f) {
        return '<details class="card"><summary>' + esc(t(f + 'q')) + '</summary><p>' + esc(t(f + 'a')) + '</p></details>';
      }).join('') + '</div>';
    return { html: html, title: t('navHelp') };
  }

  function viewAbout() {
    var html = pageHead(t('aboutTitle'), '') +
      '<div class="two-col">' +
      '<section class="card"><h2>' + esc(t('aboutPmbjp')) + '</h2><p>' + esc(t('aboutPmbjpText')) + '</p><p>' + esc(t('aboutPmbjpText2')) + '</p></section>' +
      '<section class="card"><h2>' + esc(t('aboutProto')) + '</h2><p>' + esc(t('aboutProtoText')) + '</p>' +
        '<ul class="fix-list">' + ['fix1', 'fix2', 'fix3', 'fix4', 'fix5', 'fix6'].map(function (k) {
          return '<li>' + icon('check', 'ok') + '<span>' + esc(t(k)) + '</span></li>';
        }).join('') + '</ul>' +
        '<div class="notice warn">' + icon('alert') + ' ' + esc(t('footerDisclaimer')) + '</div>' +
      '</section></div>';
    return { html: html, title: t('navAbout') };
  }

  function viewMore() {
    var items = [
      ['#/compare', 'scale', 'navCompare', 'svcCompareD'],
      ['#/orders', 'cart', 'myOrders', 'ordersLead'],
      ['#/feedback', 'message', 'navFeedback', 'svcFeedbackD'],
      ['#/help', 'phone', 'navHelp', 'svcHelpD'],
      ['#/login', 'user', state.user ? 'profile' : 'login', 'loginMoreD'],
      ['#/settings', 'sliders', 'navSettings', 'settingsD'],
      ['#/lab', 'bolt', 'navLab', 'svcLabD'],
      ['#/about', 'info', 'navAbout', 'svcAboutD']
    ];
    var html = pageHead(t('navMore'), '') +
      '<nav class="more-list">' + items.map(function (i) {
        return '<a class="more-item card" href="' + i[0] + '">' + icon(i[1], 'more-ic') + '<span><b>' + esc(t(i[2])) + '</b><span class="muted small block">' + esc(t(i[3])) + '</span></span>' + icon('chevron-right') + '</a>';
      }).join('') + '</nav>';
    return { html: html, title: t('navMore') };
  }

  function viewLab() {
    return JA.lab({ t: t, esc: esc, icon: icon, index: index, catalog: catalog, SE: SE, S: S, rupee: rupee });
  }

  function viewNotFound() {
    return {
      html: emptyState('alert', t('notFound'), '', '<a class="btn btn-accent" href="#/">' + esc(t('navHome')) + '</a>'),
      title: t('notFound')
    };
  }

  /* ================= Global event handling ================= */

  var actions = {
    'toggle-lang': function () { setLang(state.lang === 'en' ? 'hi' : 'en'); },

    'add-cart': function (el) {
      if (el.getAttribute('data-kendra')) { state.cartKendra = el.getAttribute('data-kendra'); save('cartKendra'); }
      addToCart(el.getAttribute('data-id'), 1);
    },

    'qty': function (el) {
      var id = el.getAttribute('data-id'), d = Number(el.getAttribute('data-d'));
      state.cart.forEach(function (l) { if (l.id === id) l.qty = Math.max(1, Math.min(20, l.qty + d)); });
      save('cart'); updateCartBadge(); refresh();
    },

    'remove': function (el) {
      var id = el.getAttribute('data-id');
      state.cart = state.cart.filter(function (l) { return l.id !== id; });
      save('cart'); updateCartBadge(); refresh();
    },

    'cancel-order': function (el) {
      var code = el.getAttribute('data-code');
      state.orders.forEach(function (o) { if (o.code === code) o.status = 'cancelled'; });
      save('orders'); refresh();
    },

    'use-location': function () {
      if (!navigator.geolocation) { toast(t('noGeo'), 'bad'); return; }
      toast(t('locating'), 'info');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        var city = K.cities.slice().sort(function (a, b) { return S.haversineKm(here, a) - S.haversineKm(here, b); })[0];
        state.loc = { lat: here.lat, lng: here.lng, label: t('myLocationNear', { city: city.name }), city: city.id, source: 'gps' };
        save('loc');
        refresh();
      }, function () {
        toast(t('geoDenied'), 'bad');
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    },

    'set-radius': function (el) {
      state.radius = Number(el.getAttribute('data-r'));
      save('radius');
      refresh();
    },

    'report-stock': function (el) {
      state.reports[el.getAttribute('data-k') + '|' + el.getAttribute('data-m')] = { at: Date.now() };
      save('reports');
      toast(t('thanksStock'), 'ok');
      refresh();
    },

    'undo-report': function (el) {
      delete state.reports[el.getAttribute('data-k') + '|' + el.getAttribute('data-m')];
      save('reports');
      refresh();
    },

    'report-kendra': function (el) {
      var kid = el.getAttribute('data-k');
      state.kendraReports[kid] = { reason: el.getAttribute('data-r'), at: Date.now() };
      save('kendraReports');
      toast(t('thanksKendra'), 'ok');
      refresh();
    },

    'clear-recent': function () { state.recent = []; save('recent'); refresh(); },

    'share': function () {
      var data = { title: document.title, url: location.href };
      if (navigator.share) { navigator.share(data).catch(function () { /* cancelled */ }); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { toast(t('linkCopied'), 'ok'); });
    },

    'voice': function (el) {
      var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
      var input = el.form && el.form.querySelector('input[type=search]');
      if (!Rec || !input) return;
      var rec = new Rec();
      rec.lang = state.lang === 'hi' ? 'hi-IN' : 'en-IN';
      rec.interimResults = false;
      el.classList.add('listening');
      toast(t('listening'), 'info');
      rec.onresult = function (e) {
        input.value = e.results[0][0].transcript;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit();
      };
      rec.onerror = function () { toast(t('voiceError'), 'bad'); };
      rec.onend = function () { el.classList.remove('listening'); };
      rec.start();
    },

    'logout': function () {
      state.user = null;
      save('user');
      renderShell();
      toast(t('loggedOut'), 'info');
      location.hash = '#/';
    },

    'sync-now': function (el) { checkForUpdates(true, el); },

    'install': function () {
      if (!ui.installPrompt) return;
      ui.installPrompt.prompt();
      ui.installPrompt = null;
    },

    'clear-data': function () {
      if (!window.confirm(t('confirmClear'))) return;
      store.clearAll();
      location.reload();
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || !actions[el.getAttribute('data-action')]) return;
    e.preventDefault();
    actions[el.getAttribute('data-action')](el, e);
  });

  document.addEventListener('change', function (e) {
    if (e.target.getAttribute('data-change') !== 'city' || !e.target.value) return;
    var c = K.cities.filter(function (x) { return x.id === e.target.value; })[0];
    if (!c) return;
    state.loc = { lat: c.lat, lng: c.lng, label: c.name, city: c.id, source: 'city' };
    save('loc');
    refresh();
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    var kind = form.getAttribute('data-form');
    if (!kind || e.defaultPrevented) return;
    e.preventDefault();
    if (kind === 'search') {
      var q = form.querySelector('input[name=q]').value.trim();
      addRecent(q);
      location.hash = '#/search' + (q ? '?q=' + encodeURIComponent(q) : '');
    } else if (kind === 'reserve') {
      submitReservation(form);
    } else if (kind === 'feedback') {
      submitFeedback(form);
    }
  });

  function showFormError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function submitReservation(form) {
    var err = $('#cart-err', form);
    var kendra = form.querySelector('input[name=kendra]:checked');
    var mobile = form.mobile.value.replace(/\D/g, '');
    if (!kendra) return showFormError(err, t('pickKendra'));
    if (!/^[6-9]\d{9}$/.test(mobile)) { form.mobile.focus(); return showFormError(err, t('badPhone')); }
    var lines = state.cart.filter(function (l) { return medById[l.id]; });
    var total = lines.reduce(function (s, l) { return s + medById[l.id].price * l.qty; }, 0);
    var order = {
      code: S.makeCode('JA'),
      kendra: kendra.value,
      items: lines.map(function (l) { return { id: l.id, qty: l.qty }; }),
      total: total,
      when: form.when.value,
      name: form.name.value.trim(),
      mobile: mobile,
      at: Date.now(),
      status: 'sent'
    };
    state.orders.unshift(order);
    state.cart = [];
    save('orders'); save('cart');
    updateCartBadge();
    toast(t('reserved', { code: order.code }), 'ok');
    location.hash = '#/orders';
  }

  function submitFeedback(form) {
    var err = $('#fb-err', form);
    var msg = form.message.value.trim();
    var mobile = form.mobile.value.replace(/\D/g, '');
    if (msg.length < 10) { form.message.focus(); return showFormError(err, t('msgTooShort')); }
    if (mobile && !/^[6-9]\d{9}$/.test(mobile)) { form.mobile.focus(); return showFormError(err, t('badPhone')); }
    var ticket = {
      id: S.makeCode('JAS'),
      type: form.type.value,
      kendra: form.kendra.value,
      med: form.med.value.trim(),
      message: msg,
      mobile: mobile,
      at: Date.now()
    };
    state.tickets.unshift(ticket);
    save('tickets');
    if (ticket.type === 'closed' && ticket.kendra) { state.kendraReports[ticket.kendra] = { reason: 'rClosed', at: Date.now() }; save('kendraReports'); }
    toast(t('ticketCreated', { id: ticket.id }), 'ok');
    location.hash = '#/feedback';
    refresh();
  }

  /* ================= Offline, install, updates ================= */

  /**
   * Checks for catalogue changes. Runs once when the app opens (only if the last check is older
   * than 12 hours) or when the user taps "Check for updates". Never on a repeating timer — the
   * old app's "reloads every 2 seconds" problem.
   * A real server would answer GET /catalog/changes?since=<version> with only the changed rows.
   */
  function checkForUpdates(manual, btn) {
    if (!manual && state.lastSync && Date.now() - state.lastSync < SYNC_EVERY_MS) return;
    if (navigator.onLine === false) { if (manual) toast(t('offlineNoSync'), 'bad'); return; }
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    setTimeout(function () {
      state.lastSync = Date.now();
      save('lastSync');
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
      var ls = $('#last-sync');
      if (ls) ls.textContent = dateLabel(state.lastSync);
      if (manual) toast(t('upToDate'), 'ok');
    }, manual ? 500 : 0);
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').then(function () {
      navigator.serviceWorker.ready.then(updateNet);
    }).catch(function () { /* offline mode unavailable */ });
    navigator.serviceWorker.addEventListener('controllerchange', updateNet);
  }

  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    ui.installPrompt = e;
  });

  /* ================= Start ================= */

  applyPrefs();
  renderShell();
  render(false);
  registerSW();
  checkForUpdates(false);
  document.documentElement.classList.add('ready');
})();

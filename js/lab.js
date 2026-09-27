/*
 * Performance Lab (#/lab) — a side-by-side "before vs after" demo for the project presentation.
 *
 * LEFT  = how the current app behaves (simulated): a server request on every keystroke,
 *         a blocking "Please wait" dialog, only generic names searched, alphabetical list.
 * RIGHT = this prototype: debounced, offline, ranked search with brand -> generic matching.
 *
 * Network delay on the left is SCALED DOWN (about 1 second instead of the 2-4 minutes users
 * report) so the demo finishes quickly. The request count and ordering problems are real.
 */
(function () {
  'use strict';
  window.JA = window.JA || {};

  window.JA.lab = function (ctx) {
    var t = ctx.t, esc = ctx.esc, icon = ctx.icon, SE = ctx.SE, index = ctx.index, catalog = ctx.catalog;

    var fixes = [
      ['labP1', 'labF1', 'js/search.js, sw.js'],
      ['labP2', 'labF2', 'js/search.js'],
      ['labP3', 'labF3', 'js/app.js → checkForUpdates()'],
      ['labP4', 'labF4', 'js/services.js → stockFor()'],
      ['labP5', 'labF5', 'js/services.js → kendrasNear()'],
      ['labP6', 'labF6', '#/login'],
      ['labP7', 'labF7', '#/cart, #/orders'],
      ['labP8', 'labF8', '#/compare'],
      ['labP9', 'labF9', '#/settings, voice search'],
      ['labP10', 'labF10', 'index.html, js/app.js → loadLeaflet()']
    ];

    function panel(kind) {
      return '<section class="card lab-panel ' + kind + '">' +
        '<h2>' + esc(t(kind === 'old' ? 'labOld' : 'labNew')) + '</h2>' +
        '<p class="muted small">' + esc(t(kind === 'old' ? 'labOldD' : 'labNewD')) + '</p>' +
        '<div class="phone">' +
          '<div class="phone-bar">' + icon('search') + '<span id="' + kind + '-typed" class="typed"></span><span class="caret"></span></div>' +
          '<div class="phone-body" id="' + kind + '-body"><p class="muted small">' + esc(t('labIdle')) + '</p></div>' +
          (kind === 'old' ? '<div class="phone-overlay" id="old-overlay" hidden><div class="spinner"></div><span>Please wait...</span></div>' : '') +
        '</div>' +
        '<dl class="metrics">' +
          '<div><dt>' + esc(t('labRequests')) + '</dt><dd id="' + kind + '-req">0</dd></div>' +
          '<div><dt>' + esc(t('labWaited')) + '</dt><dd id="' + kind + '-wait">0 ms</dd></div>' +
          '<div><dt>' + esc(t('labResults')) + '</dt><dd id="' + kind + '-count">—</dd></div>' +
          '<div><dt>' + esc(t('labPosition')) + '</dt><dd id="' + kind + '-pos">—</dd></div>' +
        '</dl></section>';
    }

    var html =
      '<header class="page-head"><h1 class="page-title">' + esc(t('labTitle')) + '</h1><p class="lead">' + esc(t('labLead')) + '</p></header>' +
      '<section class="card lab-controls">' +
        '<label class="label" for="lab-q">' + esc(t('labQueryLabel')) + '</label>' +
        '<div class="lab-row">' +
          '<input id="lab-q" class="input" value="dolo 650" autocomplete="off">' +
          '<button type="button" class="btn btn-accent" id="lab-run">' + icon('bolt') + ' ' + esc(t('labRun')) + '</button>' +
        '</div>' +
        '<div class="chip-row"><span class="small muted">' + esc(t('labTry')) + '</span>' +
          ['dolo 650', 'metformin 500', 'pan 40', 'paracetmol', 'telma'].map(function (q) {
            return '<button type="button" class="chip" data-labq="' + esc(q) + '">' + esc(q) + '</button>';
          }).join('') + '</div>' +
        '<p class="muted small">' + icon('info') + ' ' + esc(t('labNote')) + '</p>' +
      '</section>' +
      '<div class="lab-grid">' + panel('old') + panel('new') + '</div>' +
      '<section class="card"><h2>' + esc(t('labBench')) + '</h2><p>' + esc(t('labBenchLead')) + '</p>' +
        '<button type="button" class="btn btn-primary" id="bench-run">' + icon('activity') + ' ' + esc(t('labBenchRun')) + '</button>' +
        '<div id="bench-out" class="bench-out" aria-live="polite"></div></section>' +
      '<section class="card"><h2>' + esc(t('labFixesTitle')) + '</h2>' +
        '<div class="table-wrap"><table class="alt-table fixes-table"><thead><tr>' +
          '<th scope="col">' + esc(t('labProblem')) + '</th><th scope="col">' + esc(t('labFix')) + '</th><th scope="col">' + esc(t('labWhere')) + '</th>' +
        '</tr></thead><tbody>' + fixes.map(function (f) {
          return '<tr><td>' + esc(t(f[0])) + '</td><td>' + esc(t(f[1])) + '</td><td><code>' + esc(f[2]) + '</code></td></tr>';
        }).join('') + '</tbody></table></div></section>';

    function mount(root) {
      var timers = [];
      var running = false;
      var alive = true;

      function later(fn, ms) { var id = setTimeout(function () { if (alive) fn(); }, ms); timers.push(id); return id; }
      function $(id) { return root.querySelector('#' + id); }

      /** Old behaviour: substring on generic names only, alphabetical, no brand names, no ranking. */
      function oldSearch(q) {
        var s = q.toLowerCase();
        return catalog.medicines
          .filter(function (m) { return m.name.toLowerCase().indexOf(s) >= 0; })
          .sort(function (a, b) { return a.name < b.name ? -1 : 1; });
      }

      function listHtml(meds, targetId) {
        if (!meds.length) return '<p class="lab-empty">' + esc(t('labNoResult')) + '</p>';
        return '<ol class="lab-list">' + meds.slice(0, 8).map(function (m) {
          return '<li class="' + (m.id === targetId ? 'target' : '') + '">' + esc(m.name) + '</li>';
        }).join('') + (meds.length > 8 ? '<li class="muted">+ ' + (meds.length - 8) + ' ' + esc(t('labMore')) + '</li>' : '') + '</ol>';
      }

      function position(meds, targetId) {
        for (var i = 0; i < meds.length; i++) if (meds[i].id === targetId) return '#' + (i + 1);
        return t('labNotFound');
      }

      function run() {
        if (running) return;
        running = true;
        var q = $('lab-q').value.trim() || 'dolo 650';
        var best = SE.search(index, q).items[0];
        var targetId = best ? best.med.id : null;
        var start = performance.now();
        var TYPE_MS = 160;

        // reset
        ['old', 'new'].forEach(function (k) {
          $(k + '-typed').textContent = '';
          $(k + '-body').innerHTML = '';
          $(k + '-req').textContent = '0';
          $(k + '-wait').textContent = '0 ms';
          $(k + '-count').textContent = '—';
          $(k + '-pos').textContent = '—';
          root.querySelector('.lab-panel.' + k).classList.remove('done');
        });
        $('lab-run').disabled = true;

        // ----- OLD: one request per keystroke, processed one after another -----
        var oldReq = 0, oldWait = 0, queueFree = 0, oldPending = 0;
        function oldKeystroke(text) {
          oldReq++;
          oldPending++;
          $('old-req').textContent = oldReq;
          $('old-overlay').hidden = false;
          var latency = 700 + Math.round(Math.random() * 600); // scaled down from minutes
          var begin = Math.max(performance.now() - start, queueFree);
          queueFree = begin + latency;
          oldWait += latency;
          later(function () {
            oldPending--;
            var meds = oldSearch(text);
            $('old-body').innerHTML = listHtml(meds, targetId);
            $('old-count').textContent = meds.length;
            $('old-pos').textContent = position(meds, targetId);
            $('old-wait').textContent = Math.round(oldWait) + ' ms';
            if (!oldPending) {
              $('old-overlay').hidden = true;
              root.querySelector('.lab-panel.old').classList.add('done');
              $('old-wait').textContent = Math.round(performance.now() - start) + ' ms';
              finish();
            }
          }, queueFree - (performance.now() - start));
        }

        // ----- NEW: debounced, offline, ranked -----
        var newRuns = 0;
        var debounced = SE.debounce(function (text) {
          var r = SE.search(index, text);
          newRuns++;
          $('new-req').textContent = '0 (' + t('labLocalRuns', { n: newRuns }) + ')';
          var meds = r.items.map(function (x) { return x.med; });
          $('new-body').innerHTML = r.tooShort ? '<p class="muted small">' + esc(t('typeMore', { n: SE.MIN_QUERY_LENGTH })) + '</p>' : listHtml(meds, targetId);
          $('new-count').textContent = r.tooShort ? '—' : meds.length;
          $('new-pos').textContent = r.tooShort ? '—' : position(meds, targetId);
          $('new-wait').textContent = Math.round(performance.now() - start) + ' ms (' + t('labCompute', { ms: r.tookMs.toFixed(2) }) + ')';
        }, SE.DEBOUNCE_MS);

        q.split('').forEach(function (ch, i) {
          later(function () {
            var text = q.slice(0, i + 1);
            $('old-typed').textContent = text;
            $('new-typed').textContent = text;
            oldKeystroke(text);
            debounced(text);
            if (i === q.length - 1) later(function () { root.querySelector('.lab-panel.new').classList.add('done'); }, SE.DEBOUNCE_MS + 20);
          }, i * TYPE_MS);
        });

        function finish() {
          running = false;
          $('lab-run').disabled = false;
        }
      }

      function bench() {
        var out = $('bench-out');
        out.innerHTML = '<div class="skeleton">' + esc(t('labBenchRunning')) + '</div>';
        later(function () {
          // Build a synthetic catalogue as big as the real basket (~2,300 items).
          var big = [];
          var n = 0;
          while (big.length < 2300) {
            catalog.medicines.forEach(function (m) {
              if (big.length >= 2300) return;
              var copy = Object.assign({}, m, { id: m.id + '-' + n, strength: m.strength + ' v' + n, name: m.name + ' (variant ' + n + ')' });
              big.push(copy);
            });
            n++;
          }
          var t0 = performance.now();
          var bigIndex = SE.buildIndex(big, catalog);
          var buildMs = performance.now() - t0;

          var queries = [];
          catalog.medicines.forEach(function (m) {
            queries.push(m.name.slice(0, 5));
            if (m.brands[0]) queries.push(m.brands[0].name);
          });
          queries = queries.concat(['paracetmol', 'metfromin 500', 'bukhar', 'sugar', 'vit d3']);
          var times = queries.map(function (q) {
            var s = performance.now();
            SE.search(bigIndex, q);
            return performance.now() - s;
          }).sort(function (a, b) { return a - b; });
          var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
          var p95 = times[Math.floor(times.length * 0.95)];
          var bytes = JSON.stringify(big.map(function (m) { return [m.id, m.name, m.pack, m.category, m.cls, m.price, m.rx, m.brands]; })).length;

          out.innerHTML = '<div class="rx-summary">' +
            statBox(big.length.toLocaleString('en-IN'), t('labBenchItems')) +
            statBox(buildMs.toFixed(1) + ' ms', t('labBenchBuild')) +
            statBox(avg.toFixed(2) + ' ms', t('labBenchAvg', { n: times.length })) +
            statBox(p95.toFixed(2) + ' ms', t('labBenchP95')) +
            statBox(Math.round(bytes / 1024) + ' KB', t('labBenchSize')) +
            '</div><p class="muted small">' + esc(t('labBenchExplain')) + '</p>';
        }, 30);
      }

      function statBox(v, l) {
        return '<div class="stat"><span class="stat-v">' + esc(v) + '</span><span class="stat-l">' + esc(l) + '</span></div>';
      }

      $('lab-run').addEventListener('click', run);
      $('bench-run').addEventListener('click', bench);
      root.addEventListener('click', function (e) {
        var c = e.target.closest('[data-labq]');
        if (!c || running) return;
        $('lab-q').value = c.getAttribute('data-labq');
        run();
      });

      return function () {
        alive = false;
        timers.forEach(clearTimeout);
      };
    }

    return { html: html, mount: mount, title: t('navLab') };
  };
})();

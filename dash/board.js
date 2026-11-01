// High scores (Today / This week / All time) voor Polder Dash, voor zowel game3d.js als classic.js.
// Server: Cloudflare Worker (code in de privé-notities). Het spel roept DashBoard.runStart() en DashBoard.runEnd() aan.
(function () {
  'use strict';
  var API = 'https://polder-dash-scores.dddgames.workers.dev';
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('polderdash.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('polderdash.' + k, JSON.stringify(v)); } catch (e) { /* privé-venster */ } },
  };

  function utcDay(t) { return new Date(t).toISOString().slice(0, 10); }
  function utcWeek(t) {
    var d = new Date(t), dow = (d.getUTCDay() + 6) % 7;
    return utcDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  }
  // eigen beste ingestuurde score per periode, zodat we alleen insturen wat de lijst kan veranderen
  function posted() {
    var p = store.get('posted', null), now = Date.now();
    if (!p || typeof p !== 'object') p = {};
    if (p.day !== utcDay(now)) { p.day = utcDay(now); p.dayBest = 0; }
    if (p.week !== utcWeek(now)) { p.week = utcWeek(now); p.weekBest = 0; }
    if (typeof p.allBest !== 'number') p.allBest = 0;
    return p;
  }

  function req(path, body) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : 0;
    var opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    if (ctl) opt.signal = ctl.signal;
    return fetch(API + path, opt).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; });
    }, function (e) { clearTimeout(timer); throw e; });
  }

  var tokenP = null;   // token van de lopende run
  var nextTok = null;  // alvast opgehaald token voor de volgende run (tijd ligt dan zeker vóór de start)
  var pending = null;  // naam om in te sturen zodra de vorige verzending klaar is
  function prefetch() {
    nextTok = { at: Date.now(), p: req('/start').then(function (j) { return j.token || null; }, function () { return null; }) };
  }
  var run = null;      // laatste uitslag
  var sending = false;

  function ordinal(n) { return '#' + n; }
  function rankText(r) {
    return ordinal(r.day) + ' today · ' + ordinal(r.week) + ' this week · ' + ordinal(r.all) + ' all time';
  }
  function setMsg(t, cls) { var m = $('lbMsg'); m.textContent = t; m.className = 'how' + (cls ? ' ' + cls : ''); }
  function showForm(on) {
    $('lbForm').classList.toggle('hidden', !on);
    $('lbName').classList.toggle('hidden', on || !store.get('name', ''));
  }

  function post(name) {
    if (!run) return;
    if (sending) { pending = name; return; }
    if (run.done) { // deze run staat er al; nieuwe naam geldt vanaf de volgende run
      store.set('name', String(name).trim());
      $('lbWho').textContent = String(name).trim();
      showForm(false);
      setMsg('Name saved. It counts from your next run.');
      return;
    }
    var data = run;
    sending = true;
    $('lbPost').disabled = true;
    setMsg('Posting…');
    (tokenP || Promise.resolve(null)).then(function (token) {
      if (!token) throw new Error('offline');
      return req('/score', { token: token, name: name, score: data.score, meters: data.meters, loot: data.loot, coins: data.coins });
    }).then(function (j) {
      done();
      if (run !== data) { flush(); return; }
      if (j.ok) {
        tokenP = null; // token is gebruikt
        store.set('name', j.name);
        var p = posted();
        p.dayBest = Math.max(p.dayBest, data.score); p.weekBest = Math.max(p.weekBest, data.score); p.allBest = Math.max(p.allBest, data.score);
        store.set('posted', p);
        data.done = true;
        showForm(false);
        $('lbWho').textContent = j.name;
        setMsg(rankText(j.ranks), 'lbgood');
        cache = {};
      } else if (j.error === 'name') {
        showForm(true);
        setMsg('Pick another name: 3–12 letters or numbers, nothing rude.', 'lbbad');
      } else if (j.status === 429) {
        setMsg('Too many scores at once. Try again later.', 'lbbad');
      } else {
        tokenP = null;
        setMsg("This run can't be posted. Try the next one!", 'lbbad');
      }
    }).catch(function () {
      done();
      if (run !== data) { flush(); return; }
      setMsg("Couldn't reach the high scores. Check your internet.", 'lbbad');
    });
  }

  function done() { sending = false; $('lbPost').disabled = false; }
  // een nieuwere run wachtte op de vorige verzending
  function flush() { var n = pending; pending = null; if (n && run && !run.done) post(n); }

  // ---------- lijst ----------
  var cache = {}, tab = 'day', backTo = [];
  function fmtLeft(ms) {
    var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
    if (h >= 48) return Math.round(h / 24) + ' days';
    return h > 0 ? h + ' h ' + m + ' min' : m + ' min';
  }
  function draw(period) {
    var list = $('lbList'), c = cache[period];
    list.textContent = '';
    $('lbReset').textContent = '';
    if (!c || c.loading) { $('lbEmpty').textContent = 'Loading…'; $('lbEmpty').classList.remove('hidden'); return; }
    if (c.error) { $('lbEmpty').textContent = "Couldn't load the high scores."; $('lbEmpty').classList.remove('hidden'); return; }
    var me = String(store.get('name', '')).toLowerCase();
    $('lbEmpty').textContent = 'No scores yet. Be the first!';
    $('lbEmpty').classList.toggle('hidden', c.rows.length > 0);
    c.rows.forEach(function (r, i) {
      var li = document.createElement('li');
      if (me && String(r.name).toLowerCase() === me) li.className = 'me';
      var a = document.createElement('span'); a.className = 'rk'; a.textContent = i + 1;
      var b = document.createElement('span'); b.className = 'nm'; b.textContent = r.name;
      var d = document.createElement('span'); d.className = 'sc'; d.textContent = r.score;
      var e = document.createElement('span'); e.className = 'mt'; e.textContent = r.meters + ' m';
      li.appendChild(a); li.appendChild(b); li.appendChild(e); li.appendChild(d);
      list.appendChild(li);
    });
    if (c.resets) $('lbReset').textContent = 'New list in ' + fmtLeft(c.resets - Date.now());
  }
  function load(period) {
    tab = period;
    var tabs = document.querySelectorAll('#board .tabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-p') === period);
    var c = cache[period];
    if (!c || (!c.loading && Date.now() - c.at > 20000)) {
      cache[period] = { loading: true };
      req('/top?period=' + period).then(function (j) {
        cache[period] = { rows: Array.isArray(j.rows) ? j.rows : [], resets: j.resets, at: Date.now(), error: !Array.isArray(j.rows) };
        if (tab === period) draw(period);
      }, function () {
        cache[period] = { error: true, at: Date.now() - 15000 };
        if (tab === period) draw(period);
      });
    }
    draw(period);
  }
  function openBoard() {
    backTo = ['title', 'over'].filter(function (id) { return !$(id).classList.contains('hidden'); });
    backTo.forEach(function (id) { $(id).classList.add('hidden'); });
    $('board').classList.remove('hidden');
    api.open = true;
    load(tab);
    $('lbBack').focus();
  }
  function closeBoard() {
    $('board').classList.add('hidden');
    backTo.forEach(function (id) { $(id).classList.remove('hidden'); });
    api.open = false;
  }

  // ---------- koppeling met het spel ----------
  var api = {
    open: false,
    runStart: function () {
      run = null;
      pending = null;
      if (!nextTok || Date.now() - nextTok.at > 2.5 * 3600 * 1000) prefetch();
      var mine = nextTok.p;
      nextTok = null;
      // mislukt het alvast ophalen (geen internet), probeer dan nu nog een keer
      tokenP = mine.then(function (t) { return t || req('/start').then(function (j) { return j.token || null; }, function () { return null; }); });
    },
    runEnd: function (r) {
      run = { score: r.score, meters: r.meters, loot: r.loot, coins: r.coins, done: false };
      prefetch(); // token voor de volgende run
      var box = $('lb');
      box.classList.toggle('hidden', !(r.score > 0));
      if (!(r.score > 0)) return;
      var name = store.get('name', ''), p = posted();
      $('lbIn').value = name || '';
      $('lbWho').textContent = name;
      if (!name) { showForm(true); setMsg('Put your score on the high scores!'); return; }
      showForm(false);
      if (r.score > p.dayBest || r.score > p.weekBest || r.score > p.allBest) post(name);
      else setMsg('Your best today: ' + p.dayBest + ' points');
    },
  };
  window.DashBoard = api;

  function init() {
    $('lbPost').addEventListener('click', function () { post($('lbIn').value); });
    $('lbChange').addEventListener('click', function () { showForm(true); $('lbIn').focus(); if (run && run.done) setMsg('Post this run under a new name.'); });
    var inp = $('lbIn');
    // typen in het naamveld mag het spel niet starten of besturen
    ['keydown', 'keyup'].forEach(function (t) {
      inp.addEventListener(t, function (e) {
        e.stopPropagation();
        if (t === 'keydown' && e.key === 'Enter') { e.preventDefault(); post(inp.value); }
      });
    });
    inp.addEventListener('touchend', function (e) { e.stopPropagation(); });
    // toetsenbord weg: pagina terug op zijn plek en opnieuw schalen
    inp.addEventListener('blur', function () {
      setTimeout(function () { window.scrollTo(0, 0); window.dispatchEvent(new Event('resize')); }, 60);
    });
    inp.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    $('lbOpen').addEventListener('click', openBoard);
    $('lbOpen2').addEventListener('click', openBoard);
    $('lbBack').addEventListener('click', closeBoard);
    var tabs = document.querySelectorAll('#board .tabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function (e) { load(e.currentTarget.getAttribute('data-p')); });
    window.addEventListener('keydown', function (e) { if (api.open && (e.code === 'Escape' || e.code === 'Backspace')) { e.preventDefault(); closeBoard(); } });
  }
  prefetch();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

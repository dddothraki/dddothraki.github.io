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

  // dagen en weken in Nederlandse tijd, net als de server (wisselt om 00:00 in Amsterdam)
  var nlFmt = null;
  try { nlFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (e) { nlFmt = null; }
  function utcDay(t) {
    if (nlFmt) {
      try {
        var p = {};
        nlFmt.formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
        if (p.year && p.month && p.day) return p.year + '-' + p.month + '-' + p.day;
      } catch (e) { /* oude browser */ }
    }
    return new Date(t).toISOString().slice(0, 10);
  }
  function utcWeek(t) {
    var d = utcDay(t).split('-');
    var u = Date.UTC(+d[0], +d[1] - 1, +d[2]);
    var dow = (new Date(u).getUTCDay() + 6) % 7; // maandag = 0
    return new Date(u - dow * 86400000).toISOString().slice(0, 10);
  }
  // eigen beste ingestuurde score per periode, zodat we alleen insturen wat de lijst kan veranderen
  function posted() {
    var p = store.get('posted', null), now = Date.now();
    var who = String(store.get('name', '')).toLowerCase();
    if (!p || typeof p !== 'object' || (p.name !== undefined && p.name !== who)) p = {}; // andere naam: opnieuw
    p.name = who;
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

  // naamcode: 8 tekens, hoort bij dit apparaat. Wie een naam als eerste gebruikt, claimt die met deze code.
  // Op een nieuwe telefoon typ je dezelfde code in om je naam (en je beste score) terug te krijgen.
  var KEY_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function cleanKey(k) { var c = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-HJ-NP-Z2-9]{8}$/.test(c) ? c : null; }
  function myKey() {
    var k = cleanKey(store.get('key', ''));
    if (!k) {
      var r = new Uint8Array(8);
      try { crypto.getRandomValues(r); } catch (e) { for (var j = 0; j < 8; j++) r[j] = Math.random() * 256; }
      k = '';
      for (var i = 0; i < 8; i++) k += KEY_ABC[r[i] % 32];
      store.set('key', k);
    }
    return k;
  }
  // code voor een naam: een ingetypte code van een andere telefoon, anders de code van dit apparaat
  function keyFor(name) {
    var keys = store.get('keys', {});
    var k = keys && typeof keys === 'object' ? cleanKey(keys[String(name || '').toLowerCase()]) : null;
    return k || myKey();
  }
  function rememberKey(name, key) {
    var keys = store.get('keys', {});
    if (!keys || typeof keys !== 'object') keys = {};
    keys[String(name).toLowerCase()] = key;
    store.set('keys', keys);
  }
  function fmtKey(k) { return k.slice(0, 4) + '-' + k.slice(4); }
  // beste score van de server overnemen (nieuwe telefoon); het spel leest 'best' bij het eindscherm
  function takeBest(b) {
    if (!b || typeof b.score !== 'number') return;
    var cur = store.get('best', null);
    if (!cur || typeof cur.score !== 'number' || b.score > cur.score) store.set('best', { score: b.score, meters: Math.max(b.meters, (cur && cur.meters) || 0) });
    var p = posted(); p.allBest = Math.max(p.allBest, b.score); store.set('posted', p);
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
  function showForm(on, withCode) {
    var wasHidden = $('lbCodeRow').classList.contains('hidden');
    $('lbForm').classList.toggle('hidden', !on);
    $('lbCodeRow').classList.toggle('hidden', !(on && withCode));
    if (on && withCode && wasHidden) $('lbCode').value = '';
    $('lbName').classList.toggle('hidden', on || !store.get('name', ''));
    drawMe();
  }
  // formulier en melding verhuizen naar het scherm waar je bent (eindscherm of high scores)
  function placeForm(where) {
    var box = where === 'board' ? $('lbMeBox') : $('lb');
    var anchor = where === 'board' ? $('lbMeBtn') : $('lbName');
    box.insertBefore($('lbForm'), anchor);
    box.insertBefore($('lbCodeRow'), anchor);
    box.appendChild($('lbMsg'));
  }
  function drawMe() {
    var name = store.get('name', ''), claimed = store.get('claimed', false);
    var me = $('lbMe');
    me.textContent = '';
    if (name && claimed) {
      me.appendChild(document.createTextNode('You: '));
      var b = document.createElement('b'); b.textContent = name; me.appendChild(b);
      me.appendChild(document.createTextNode(' · name code '));
      // code staat verborgen (geen code op screenshots); tik op "show" om hem te zien
      var real = fmtKey(keyFor(name));
      var c = document.createElement('b'); c.className = 'code'; c.textContent = '••••-••••'; me.appendChild(c);
      me.appendChild(document.createTextNode(' '));
      var sb = document.createElement('button'); sb.className = 'linkbtn'; sb.textContent = 'show';
      sb.addEventListener('click', function () { var open = sb.textContent === 'show'; c.textContent = open ? real : '••••-••••'; sb.textContent = open ? 'hide' : 'show'; });
      me.appendChild(sb);
      $('lbMeHint').textContent = 'Keep your code secret, like a password. Write it down: on a new phone it gets your name and best score back.';
    } else {
      $('lbMeHint').textContent = 'Got a name code from another phone? Use it here.';
    }
  }

  function post(name, code) {
    var key = code ? cleanKey(code) : keyFor(String(name).trim());
    if (code && !key) { setMsg('A name code has 8 letters and numbers, like ABCD-2345.', 'lbbad'); return; }
    if (sending) { pending = { name: name, code: code }; return; }
    // geen run, al ingestuurd of niet meer in te sturen: alleen de naam claimen
    var data = run && !run.done && tokenP ? run : null;
    sending = true;
    $('lbPost').disabled = true;
    setMsg(data ? 'Posting…' : 'Checking…');
    var p = data ? (tokenP || Promise.resolve(null)).then(function (token) {
      if (!token) throw new Error('offline');
      return req('/score', { token: token, key: key, name: name, score: data.score, meters: data.meters, loot: data.loot, coins: data.coins });
    }) : req('/claim', { key: key, name: name });
    p.then(function (j) {
      done();
      if (!(data && run !== data)) handle(j);
      flush();
    }).catch(function () {
      done();
      if (!(data && run !== data)) setMsg("Couldn't reach the high scores. Check your internet.", 'lbbad');
      flush();
    });
    function handle(j) {
      if (j.ok) {
        store.set('name', j.name); // eerst: de eigen besten horen bij deze naam
        if (data) {
          tokenP = null; // token is gebruikt
          var ps = posted();
          ps.dayBest = Math.max(ps.dayBest, data.score); ps.weekBest = Math.max(ps.weekBest, data.score); ps.allBest = Math.max(ps.allBest, data.score);
          store.set('posted', ps);
          data.done = true;
        }
        store.set('name', j.name);
        rememberKey(j.name, key);
        store.set('claimed', true);
        boardChanged = api.open;
        $('lbMeBtn').classList.remove('hidden');
        takeBest(j.best);
        showForm(false);
        $('lbWho').textContent = j.name;
        if (data) setMsg(rankText(j.ranks), 'lbgood');
        else setMsg(code ? 'Welcome back, ' + j.name + '!' : 'Your name is now ' + j.name + '.', 'lbgood');
        cache = {};
        if (api.open) load(tab);
      } else if (j.error === 'taken') {
        showForm(true, true);
        setMsg(code ? "That code doesn't match this name." : 'This name is taken. Is it yours? Enter your name code. You find it under 🏆 High scores, on the phone or browser where you played before. Not yours? Pick another name.', 'lbbad');
      } else if (j.error === 'name') {
        showForm(true, !!code);
        setMsg('Pick another name: 3–12 letters or numbers, nothing rude.', 'lbbad');
      } else if (j.status === 429) {
        setMsg('Too many tries. Try again later.', 'lbbad');
      } else if (data) {
        tokenP = null;
        setMsg("This run can't be posted. Try the next one!", 'lbbad');
      } else {
        setMsg('Something went wrong. Try again later.', 'lbbad');
      }
    }
  }
  function submitForm() {
    var code = $('lbCodeRow').classList.contains('hidden') ? '' : $('lbCode').value.trim();
    post($('lbIn').value, code || null);
  }

  // speelteller: alleen een willekeurig id per apparaat, verder niets
  function countPlay() {
    var id = store.get('id', '');
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,32}$/.test(id)) {
      id = '';
      var c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      var r = new Uint8Array(16);
      try { crypto.getRandomValues(r); } catch (e) { for (var k = 0; k < 16; k++) r[k] = Math.random() * 256; }
      for (var i = 0; i < 16; i++) id += c[r[i] % c.length];
      store.set('id', id);
    }
    try {
      fetch(API + '/play', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, mode: window.__dashClassic ? 'classic' : '3d' }) }).catch(function () {});
    } catch (e) { /* geen internet */ }
  }
  function done() { sending = false; $('lbPost').disabled = false; }
  // een nieuwere run wachtte op de vorige verzending
  function flush() { var n = pending; pending = null; if (n) post(n.name, n.code); }

  // ---------- lijst ----------
  var cache = {}, tab = 'day', backTo = [], saved = null, boardChanged = false;
  function snapshot() {
    return { form: !$('lbForm').classList.contains('hidden'), code: !$('lbCodeRow').classList.contains('hidden'),
      msg: $('lbMsg').textContent, cls: $('lbMsg').className };
  }
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
      if (r.owner) { var cr = document.createElement('span'); cr.className = 'own'; cr.textContent = ' 👑'; cr.title = 'Maker of Polder Dash'; b.appendChild(cr); }
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
    saved = snapshot();
    boardChanged = false;
    api.open = true;
    placeForm('board');
    showForm(false);
    setMsg('');
    $('lbMeBtn').classList.remove('hidden');
    load(tab);
    $('lbBack').focus();
  }
  function closeBoard() {
    $('board').classList.add('hidden');
    backTo.forEach(function (id) { $(id).classList.remove('hidden'); });
    api.open = false;
    var sb = store.get('best', null); // kan net via de naamcode zijn opgehaald
    if (sb && sb.score > 0 && !$('title').classList.contains('hidden')) $('bestTitle').textContent = 'Your best: ' + sb.score + ' points · ' + sb.meters + ' m';
    placeForm('over');
    if (saved && !boardChanged) {
      showForm(saved.form, saved.code);
      $('lbMsg').textContent = saved.msg; $('lbMsg').className = saved.cls;
    } else {
      showForm(false); // op het high-scores-scherm net een naam gekozen: melding daarvan laten staan
    }
    saved = null;
  }

  // ---------- koppeling met het spel ----------
  var api = {
    open: false,
    runStart: function () {
      run = null;
      countPlay();
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
      placeForm('over');
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
    $('lbPost').addEventListener('click', submitForm);
    $('lbChange').addEventListener('click', function () {
      $('lbIn').value = store.get('name', '');
      showForm(true); $('lbIn').focus();
      setMsg(run && !run.done ? 'Post this run under another name.' : 'New name? It counts from your next run.');
    });
    $('lbMeBtn').addEventListener('click', function () {
      $('lbIn').value = store.get('name', '');
      showForm(true, true);
      $('lbMeBtn').classList.add('hidden');
      setMsg('Type your name. Coming from another phone? Add your name code.');
      $('lbIn').focus();
    });
    ['lbIn', 'lbCode'].forEach(function (id) {
      var inp = $(id);
      // typen in de velden mag het spel niet starten of besturen
      ['keydown', 'keyup'].forEach(function (t) {
        inp.addEventListener(t, function (e) {
          e.stopPropagation();
          if (t === 'keydown' && e.key === 'Enter') { e.preventDefault(); submitForm(); }
        });
      });
      inp.addEventListener('touchend', function (e) { e.stopPropagation(); });
      inp.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      // toetsenbord weg: pagina terug op zijn plek en opnieuw schalen
      inp.addEventListener('blur', function () {
        setTimeout(function () { window.scrollTo(0, 0); window.dispatchEvent(new Event('resize')); }, 60);
      });
    });
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

// High scores (Today / This week / All time) voor Ditch Jumper. Zelfde server als Polder Dash, met game: 'jump'.
// Naam, naamcode en apparaat-id zijn gedeeld met Polder Dash (sleutels 'polderdash.'), eigen besten onder 'ditchjumper.'.
// Het spel roept JumpBoard.runStart() en JumpBoard.runEnd({score, ditches, bonus, seconds}) aan.
(function () {
  'use strict';
  var API = 'https://polder-dash-scores.dddgames.workers.dev';
  var GAME = 'jump';
  var $ = function (id) { return document.getElementById(id); };
  function mk(prefix) {
    return {
      get: function (k, d) { try { var v = localStorage.getItem(prefix + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
      set: function (k, v) { try { localStorage.setItem(prefix + k, JSON.stringify(v)); } catch (e) { /* privé-venster */ } },
    };
  }
  var shared = mk('polderdash.');  // name, key, keys, claimed, id
  var own = mk('ditchjumper.');    // best, posted

  // dagen en weken in Nederlandse tijd, net als de server (wisselt om 00:00 in Amsterdam)
  var nlFmt = null;
  try { nlFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (e) { nlFmt = null; }
  function nlDay(t) {
    if (nlFmt) {
      try {
        var p = {};
        nlFmt.formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
        if (p.year && p.month && p.day) return p.year + '-' + p.month + '-' + p.day;
      } catch (e) { /* oude browser */ }
    }
    return new Date(t).toISOString().slice(0, 10);
  }
  function nlWeek(t) {
    var d = nlDay(t).split('-');
    var u = Date.UTC(+d[0], +d[1] - 1, +d[2]);
    var dow = (new Date(u).getUTCDay() + 6) % 7; // maandag = 0
    return new Date(u - dow * 86400000).toISOString().slice(0, 10);
  }
  // eigen beste ingestuurde score per periode, zodat we alleen insturen wat de lijst kan veranderen
  function posted() {
    var p = own.get('posted', null), now = Date.now();
    var who = String(shared.get('name', '')).toLowerCase();
    if (!p || typeof p !== 'object' || (p.name !== undefined && p.name !== who)) p = {}; // andere naam: opnieuw
    p.name = who;
    if (p.day !== nlDay(now)) { p.day = nlDay(now); p.dayBest = 0; }
    if (p.week !== nlWeek(now)) { p.week = nlWeek(now); p.weekBest = 0; }
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

  // Staat de nieuwe server (met meerdere spellen) al online? Die stuurt 'game' mee in /top.
  // Zo niet, dan niets insturen: de oude server zou een Ditch Jumper-score bij Polder Dash zetten.
  var live = null; // null = nog niet bekend
  var firstTop = null;
  var liveP = null;
  function checkLive() {
    checking = true;
    liveP = req('/top?game=' + GAME + '&period=day').then(function (j) {
      live = j.game === GAME && Array.isArray(j.rows);
      if (live) firstTop = { rows: j.rows, resets: j.resets, at: Date.now(), error: false };
      checking = false;
      return live;
    }, function () { live = null; checking = false; return false; }); // geen internet: later opnieuw proberen
    return liveP;
  }
  var checking = false;
  function whenLive() { return live !== null ? Promise.resolve(live) : checking ? liveP : checkLive(); }

  // naamcode: 8 tekens, hoort bij dit apparaat (gedeeld met Polder Dash).
  var KEY_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function cleanKey(k) { var c = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-HJ-NP-Z2-9]{8}$/.test(c) ? c : null; }
  function myKey() {
    var k = cleanKey(shared.get('key', ''));
    if (!k) {
      var r = new Uint8Array(8);
      try { crypto.getRandomValues(r); } catch (e) { for (var j = 0; j < 8; j++) r[j] = Math.random() * 256; }
      k = '';
      for (var i = 0; i < 8; i++) k += KEY_ABC[r[i] % 32];
      shared.set('key', k);
    }
    return k;
  }
  function keyFor(name) {
    var keys = shared.get('keys', {});
    var k = keys && typeof keys === 'object' ? cleanKey(keys[String(name || '').toLowerCase()]) : null;
    return k || myKey();
  }
  function rememberKey(name, key) {
    var keys = shared.get('keys', {});
    if (!keys || typeof keys !== 'object') keys = {};
    keys[String(name).toLowerCase()] = key;
    shared.set('keys', keys);
  }
  function fmtKey(k) { return k.slice(0, 4) + '-' + k.slice(4); }
  // beste score van de server overnemen (nieuwe telefoon); het spel leest 'best' bij het eindscherm
  function takeBest(b) {
    if (!b || typeof b.score !== 'number') return;
    var cur = own.get('best', null);
    if (!cur || typeof cur.score !== 'number' || b.score > cur.score) own.set('best', { score: b.score, ditches: Math.max(b.meters, (cur && cur.ditches) || 0) });
    var p = posted(); p.allBest = Math.max(p.allBest, b.score); own.set('posted', p);
  }

  var tokenP = null;   // token van de lopende run
  var nextTok = null;  // alvast opgehaald token voor de volgende run
  var pending = null;  // naam om in te sturen zodra de vorige verzending klaar is
  function fetchToken() { return req('/start').then(function (j) { return j.token || null; }, function () { return null; }); }
  function prefetch() {
    nextTok = { at: Date.now(), p: whenLive().then(function (ok) { return ok ? fetchToken() : null; }) };
  }
  var run = null;      // laatste uitslag
  var sending = false;

  function rankText(r) { return '#' + r.day + ' today · #' + r.week + ' this week · #' + r.all + ' all time'; }
  function setMsg(t, cls) { var m = $('lbMsg'); m.textContent = t; m.className = 'how' + (cls ? ' ' + cls : ''); }
  function showForm(on, withCode) {
    var wasHidden = $('lbCodeRow').classList.contains('hidden');
    $('lbForm').classList.toggle('hidden', !on);
    $('lbCodeRow').classList.toggle('hidden', !(on && withCode));
    if (on && withCode && wasHidden) $('lbCode').value = '';
    $('lbName').classList.toggle('hidden', on || !shared.get('name', ''));
    drawMe();
  }
  function placeForm(where) {
    var box = where === 'board' ? $('lbMeBox') : $('lb');
    var anchor = where === 'board' ? $('lbMeBtn') : $('lbName');
    box.insertBefore($('lbForm'), anchor);
    box.insertBefore($('lbCodeRow'), anchor);
    box.appendChild($('lbMsg'));
  }
  function drawMe() {
    var name = shared.get('name', ''), claimed = shared.get('claimed', false);
    var me = $('lbMe');
    me.textContent = '';
    if (live === false) { $('lbMeHint').textContent = ''; $('lbMeBtn').classList.add('hidden'); return; }
    if (name && claimed) {
      me.appendChild(document.createTextNode('You: '));
      var b = document.createElement('b'); b.textContent = name; me.appendChild(b);
      me.appendChild(document.createTextNode(' · name code '));
      var c = document.createElement('b'); c.className = 'code'; c.textContent = fmtKey(keyFor(name)); me.appendChild(c);
      $('lbMeHint').textContent = 'Same name and code as in Polder Dash. Write the code down!';
    } else {
      $('lbMeHint').textContent = 'Got a name code from Polder Dash or another phone? Use it here.';
    }
  }

  function post(name, code) {
    var key = code ? cleanKey(code) : keyFor(String(name).trim());
    if (code && !key) { setMsg('A name code has 8 letters and numbers, like ABCD-2345.', 'lbbad'); return; }
    if (live !== true) { setMsg('High scores coming soon!'); return; }
    if (sending) { pending = { name: name, code: code }; return; }
    var data = run && !run.done && tokenP ? run : null;
    sending = true;
    $('lbPost').disabled = true;
    setMsg(data ? 'Posting…' : 'Checking…');
    var p = data ? (tokenP || Promise.resolve(null)).then(function (token) {
      if (!token) throw new Error('offline');
      return req('/score', { game: GAME, token: token, key: key, name: name, score: data.score, meters: data.meters, loot: data.loot, coins: data.coins });
    }) : req('/claim', { game: GAME, key: key, name: name });
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
        shared.set('name', j.name); // eerst: de eigen besten horen bij deze naam
        if (data) {
          tokenP = null; // token is gebruikt
          var ps = posted();
          ps.dayBest = Math.max(ps.dayBest, data.score); ps.weekBest = Math.max(ps.weekBest, data.score); ps.allBest = Math.max(ps.allBest, data.score);
          own.set('posted', ps);
          data.done = true;
        }
        rememberKey(j.name, key);
        shared.set('claimed', true);
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

  // speelteller: alleen een willekeurig id per apparaat (gedeeld met Polder Dash), verder niets
  function countPlay() {
    var id = shared.get('id', '');
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,32}$/.test(id)) {
      id = '';
      var c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      var r = new Uint8Array(16);
      try { crypto.getRandomValues(r); } catch (e) { for (var k = 0; k < 16; k++) r[k] = Math.random() * 256; }
      for (var i = 0; i < 16; i++) id += c[r[i] % c.length];
      shared.set('id', id);
    }
    try {
      fetch(API + '/play', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, mode: GAME }) }).catch(function () {});
    } catch (e) { /* geen internet */ }
  }
  function done() { sending = false; $('lbPost').disabled = false; }
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
    var empty = $('lbEmpty');
    if (live === false) { empty.textContent = 'High scores coming soon!'; empty.classList.remove('hidden'); return; }
    if (!c || c.loading) { empty.textContent = 'Loading…'; empty.classList.remove('hidden'); return; }
    if (c.error) { empty.textContent = "Couldn't load the high scores."; empty.classList.remove('hidden'); return; }
    var me = String(shared.get('name', '')).toLowerCase();
    empty.textContent = 'No scores yet. Be the first!';
    empty.classList.toggle('hidden', c.rows.length > 0);
    c.rows.forEach(function (r, i) {
      var li = document.createElement('li');
      if (me && String(r.name).toLowerCase() === me) li.className = 'me';
      var a = document.createElement('span'); a.className = 'rk'; a.textContent = i + 1;
      var b = document.createElement('span'); b.className = 'nm'; b.textContent = r.name;
      if (r.owner) { var cr = document.createElement('span'); cr.className = 'own'; cr.textContent = ' 👑'; cr.title = 'Maker of Ditch Jumper'; b.appendChild(cr); }
      var d = document.createElement('span'); d.className = 'sc'; d.textContent = r.score;
      var e = document.createElement('span'); e.className = 'mt'; e.textContent = r.meters + (r.meters === 1 ? ' ditch' : ' ditches');
      li.appendChild(a); li.appendChild(b); li.appendChild(e); li.appendChild(d);
      list.appendChild(li);
    });
    if (c.resets) $('lbReset').textContent = 'New list in ' + fmtLeft(c.resets - Date.now());
  }
  function load(period) {
    tab = period;
    var tabs = document.querySelectorAll('#board .tabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-p') === period);
    if (live !== true) {
      draw(period);
      if (live === null) whenLive().then(function () { if (api.open && tab === period) load(period); });
      return;
    }
    if (period === 'day' && firstTop && !cache.day) cache.day = firstTop;
    firstTop = null;
    var c = cache[period];
    if (!c || (!c.loading && Date.now() - c.at > 20000)) {
      cache[period] = { loading: true };
      req('/top?game=' + GAME + '&period=' + period).then(function (j) {
        cache[period] = { rows: Array.isArray(j.rows) ? j.rows : [], resets: j.resets, at: Date.now(), error: !Array.isArray(j.rows) };
        if (tab === period) draw(period);
      }, function () {
        cache[period] = { error: true, at: Date.now() - 15000 };
        if (tab === period) draw(period);
      });
    }
    draw(period);
  }
  function bestLine(sb) { return 'Your best: ' + sb.score + (sb.score === 1 ? ' point · ' : ' points · ') + sb.ditches + (sb.ditches === 1 ? ' ditch' : ' ditches'); }
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
    $('lbMeBtn').classList.toggle('hidden', live === false);
    load(tab);
    $('lbBack').focus();
  }
  function closeBoard() {
    $('board').classList.add('hidden');
    backTo.forEach(function (id) { $(id).classList.remove('hidden'); });
    api.open = false;
    var sb = own.get('best', null); // kan net via de naamcode zijn opgehaald
    if (sb && sb.score > 0 && !$('title').classList.contains('hidden')) $('bestTitle').textContent = bestLine(sb);
    placeForm('over');
    if (saved && !boardChanged) {
      showForm(saved.form, saved.code);
      $('lbMsg').textContent = saved.msg; $('lbMsg').className = saved.cls;
    } else {
      showForm(false);
    }
    saved = null;
    var f = backTo.indexOf('over') >= 0 ? $('againBtn') : $('playBtn');
    if (f) f.focus();
  }

  // ---------- koppeling met het spel ----------
  var api = {
    open: false,
    runStart: function () {
      run = null;
      pending = null;
      if (!nextTok || Date.now() - nextTok.at > 2 * 3600 * 1000) prefetch();
      var mine = nextTok.p;
      nextTok = null;
      // het token wordt vóór de start opgehaald; mislukt dat (geen internet), dan nu nog een keer
      tokenP = mine.then(function (t) {
        if (t) return t;
        return whenLive().then(function (ok) { return ok ? fetchToken() : null; });
      });
      whenLive().then(function (ok) { if (ok) countPlay(); });
    },
    runEnd: function (r) {
      var data = { score: r.score, meters: r.ditches, loot: r.bonus, coins: r.bonus, done: false };
      run = data;
      prefetch(); // token voor de volgende run
      showEnd(r, data);
    },
  };
  function showEnd(r, data) {
      placeForm('over');
      var box = $('lb');
      box.classList.toggle('hidden', !(r.score > 0));
      if (!(r.score > 0)) return;
      var name = shared.get('name', ''), p = posted();
      $('lbIn').value = name || '';
      $('lbWho').textContent = name;
      if (live !== true) {
        showForm(false);
        $('lbName').classList.add('hidden');
        setMsg(live === false ? 'High scores coming soon!' : 'Checking the high scores…');
        whenLive().then(function (ok) { if (run === data && ok) showEnd(r, data); else if (run === data) setMsg(live === false ? 'High scores coming soon!' : "Couldn't reach the high scores."); });
        return;
      }
      if (!name) { showForm(true); setMsg('Put your score on the high scores!'); return; }
      showForm(false);
      if (r.score > p.dayBest || r.score > p.weekBest || r.score > p.allBest) post(name);
      else setMsg('Your best today: ' + p.dayBest + (p.dayBest === 1 ? ' point' : ' points'));
  }
  window.JumpBoard = api;

  function init() {
    $('lbPost').addEventListener('click', submitForm);
    $('lbChange').addEventListener('click', function () {
      $('lbIn').value = shared.get('name', '');
      showForm(true); $('lbIn').focus();
      setMsg(run && !run.done ? 'Post this run under another name.' : 'New name? It counts from your next run.');
    });
    $('lbMeBtn').addEventListener('click', function () {
      $('lbIn').value = shared.get('name', '');
      showForm(true, true);
      $('lbMeBtn').classList.add('hidden');
      setMsg('Type your name. Coming from Polder Dash or another phone? Add your name code.');
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
      inp.addEventListener('blur', function () {
        setTimeout(function () { window.scrollTo(0, 0); window.dispatchEvent(new Event('resize')); }, 60);
      });
    });
    $('lbOpen').addEventListener('click', openBoard);
    $('lbOpen2').addEventListener('click', openBoard);
    $('lbBack').addEventListener('click', closeBoard);
    var tabs = document.querySelectorAll('#board .tabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function (e) { load(e.currentTarget.getAttribute('data-p')); });
    window.addEventListener('keydown', function (e) {
      if (!api.open || !(e.code === 'Escape' || e.code === 'Backspace')) return;
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
      e.preventDefault(); closeBoard();
    });
  }
  checkLive();
  prefetch();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

// Polder Dash RACE: reeksen overwinningen per niveau + het race-scorebord (langste reeks per niveau).
// Uitslagen bewaren we hier (localStorage 'polderdash.race'). Met een geclaimde naam (🏆 High scores) gaat elke uitslag
// ook naar de server (/race), en daar staat het scorebord. Halverwege stoppen (of het venster sluiten) telt als verlies.
// game3d.js roept aan: start(level) bij het aftellen, go(level) bij GO, result({level, won, time}) bij de finish, quit(level).
(function () {
  'use strict';
  var W = window.DDDWallet; // naam, code en server-adres (../shared/wallet.js)
  var API = W ? W.url() : 'https://polder-dash-scores.dddgames.workers.dev';
  var LEVELS = ['rookie', 'advanced', 'pro', 'expert'];
  var NAMES = { rookie: 'Rookie', advanced: 'Advanced', pro: 'Pro', expert: 'Expert' };
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('polderdash.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('polderdash.' + k, JSON.stringify(v)); } catch (e) { /* privé-venster */ } },
  };
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
  var who = function () { return W ? W.who() : null; };
  var num = function (v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0; };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };

  // ---------- eigen uitslagen per niveau ----------
  // rec = { best (snelste overwinning, s), wins, races, cur (reeks nu), streak (langste reeks) }
  function recs() {
    var r = store.get('race', null);
    if (!r || typeof r !== 'object' || Array.isArray(r)) r = {};
    for (var i = 0; i < LEVELS.length; i++) {
      var x = r[LEVELS[i]];
      if (!x || typeof x !== 'object') x = {};
      r[LEVELS[i]] = { best: num(x.best), wins: num(x.wins), races: num(x.races), cur: num(x.cur), streak: num(x.streak) };
    }
    return r;
  }
  function rec(level) { return recs()[level] || { best: 0, wins: 0, races: 0, cur: 0, streak: 0 }; }
  // Reeksen van de server overnemen (die tellen, ook als je op een ander apparaat speelde).
  // Heeft de server nog niets van deze naam (net een naam gekozen), dan houden we wat dit apparaat had.
  function takeServer(level, j) {
    if (!j || typeof j.cur !== 'number' || !(j.races > 0)) return;
    var r = recs(), x = r[level];
    x.cur = num(j.cur); x.streak = num(j.best);
    if (typeof j.fast === 'number' && j.fast > 0 && (!x.best || j.fast < x.best)) x.best = j.fast;
    store.set('race', r);
  }

  // ---------- uitslagen insturen (op volgorde; geen internet of te druk: later nog eens) ----------
  var tokenP = null, sending = false, retryT = 0;
  var waiting = {}; // id -> functie die het antwoord van de server krijgt
  function queue() { var q = store.get('racePend', []); return Array.isArray(q) ? q.filter(function (x) { return x && x.id && LEVELS.indexOf(x.level) >= 0; }) : []; }
  function later() { clearTimeout(retryT); retryT = setTimeout(flush, 45000); }
  function flush() {
    if (sending) return;
    var u = who(), q = queue();
    if (!q.length || !u) return; // geen naam op dit moment (bijvoorbeeld net aan het wisselen): laten staan
    var x = q[0];
    if (x.name !== u.name.toLowerCase()) { store.set('racePend', q.slice(1)); flush(); return; } // hoort bij een andere naam
    sending = true;
    var body = { name: u.name, key: u.key, level: x.level, won: !!x.won };
    if (x.won) { body.time = x.time; body.token = x.token; }
    req('/race', body).then(function (j) {
      sending = false;
      if (j.status === 429 || j.status >= 500) { later(); return; } // even te druk: straks nog eens
      store.set('racePend', queue().filter(function (y) { return y.id !== x.id; }));
      if (j.ok) takeServer(x.level, j);
      var cb = waiting[x.id]; delete waiting[x.id];
      if (cb) cb(j);
      flush();
    }, function () { sending = false; later(); });
  }
  function push(entry, cb) {
    var q = queue();
    q.push(entry);
    store.set('racePend', q.slice(-10));
    if (cb) waiting[entry.id] = cb;
    flush();
  }

  // ---------- race bezig: per tabblad, met een hartslag ----------
  // Een race die na GO niet afgemaakt wordt (venster dicht, telefoon sloot de pagina) telt bij het volgende bezoek als verlies.
  // Elk tabblad heeft een eigen regel met een hartslag; een andere tab telt alleen races mee waar al even geen hartslag meer van kwam.
  var TAB = uid(), beatT = 0, liveRace = null;
  function lives() { var l = store.get('raceLive', null); return l && typeof l === 'object' && !Array.isArray(l) ? l : {}; }
  function setLive(entry) {
    var l = lives();
    if (entry) l[TAB] = entry; else delete l[TAB];
    store.set('raceLive', l);
  }
  function beat() { if (liveRace) { liveRace.beat = Date.now(); setLive(liveRace); } }
  function staleLosses() {
    var l = lives(), now = Date.now(), changed = false, u = who();
    for (var t in l) {
      var x = l[t];
      if (t === TAB) continue;
      if (!x || typeof x !== 'object' || LEVELS.indexOf(x.level) < 0) { delete l[t]; changed = true; continue; }
      if (now - num(x.beat) < 12000) continue; // die tab racet nog
      delete l[t]; changed = true;
      var all = recs(); all[x.level].races++; all[x.level].cur = 0; store.set('race', all);
      if (u && x.name && x.name === u.name.toLowerCase()) push({ id: uid(), level: x.level, won: false, name: x.name });
    }
    if (changed) store.set('raceLive', l);
  }

  // ---------- het scorebord ----------
  var cache = {}, tab = 'rookie', backTo = null;
  function draw() {
    var list = $('rsList'), c = cache[tab], u = who(), me = u ? u.name.toLowerCase() : '';
    list.textContent = '';
    var tabs = document.querySelectorAll('#rsTabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-l') === tab);
    var r = rec(tab);
    $('rsMine').textContent = 'You vs ' + NAMES[tab] + ': streak ' + r.cur + ' · longest ' + r.streak + (r.best ? ' · fastest ' + fmt(r.best) : '');
    $('rsHint').textContent = u ? '' : 'Get a name under 🏆 High scores to join the race board.';
    if (!c || c.loading) { $('rsEmpty').textContent = 'Loading…'; $('rsEmpty').classList.remove('hidden'); return; }
    if (c.error) { $('rsEmpty').textContent = "Couldn't load the race board."; $('rsEmpty').classList.remove('hidden'); return; }
    $('rsEmpty').textContent = 'No streaks yet. Win a race and be the first!';
    $('rsEmpty').classList.toggle('hidden', c.rows.length > 0);
    c.rows.forEach(function (row, i) {
      var li = document.createElement('li');
      if (me && String(row.name).toLowerCase() === me) li.className = 'me';
      var a = document.createElement('span'); a.className = 'rk'; a.textContent = i + 1;
      var b = document.createElement('span'); b.className = 'nm'; b.textContent = row.name;
      if (row.owner) { var cr = document.createElement('span'); cr.className = 'own'; cr.textContent = ' 👑'; cr.title = 'Maker of Polder Dash'; b.appendChild(cr); }
      var e = document.createElement('span'); e.className = 'mt'; e.textContent = num(row.wins) + ' wins';
      var d = document.createElement('span'); d.className = 'sc'; d.textContent = '🔥 ' + num(row.streak);
      li.appendChild(a); li.appendChild(b); li.appendChild(e); li.appendChild(d);
      list.appendChild(li);
    });
  }
  function load(level) {
    tab = level;
    var c = cache[level];
    if (!c || (!c.loading && Date.now() - c.at > 20000)) {
      cache[level] = { loading: true };
      req('/top?game=race&level=' + level).then(function (j) {
        cache[level] = { rows: Array.isArray(j.rows) ? j.rows : [], at: Date.now(), error: !Array.isArray(j.rows) };
        if (tab === level) draw();
      }, function () {
        cache[level] = { error: true, at: Date.now() - 15000 };
        if (tab === level) draw();
      });
    }
    draw();
  }
  function openBoard(level) {
    backTo = ['raceMenu', 'raceOver'].filter(function (id) { return !$(id).classList.contains('hidden'); });
    backTo.forEach(function (id) { $(id).classList.add('hidden'); });
    $('raceBoard').classList.remove('hidden');
    api.open = true;
    syncStats();
    load(LEVELS.indexOf(level) >= 0 ? level : tab);
    $('rsBack').focus();
  }
  function closeBoard() {
    $('raceBoard').classList.add('hidden');
    (backTo || []).forEach(function (id) { $(id).classList.remove('hidden'); });
    api.open = false;
    if (api.onClose) api.onClose();
    // toetsenbord: weer op een knop van het scherm waar je terugkomt
    var back = backTo && backTo[0] && $(backTo[0]), btn = back && back.querySelector('button');
    if (btn && !matchMedia('(pointer: coarse)').matches) btn.focus();
  }
  // eigen reeksen van de server (nieuw apparaat): hooguit één keer per minuut
  var statsAt = 0;
  function syncStats(cb) {
    var u = who();
    if (!u || Date.now() - statsAt < 60000 || queue().length) { if (cb) cb(); return; }
    statsAt = Date.now();
    req('/racestats', { name: u.name, key: u.key }).then(function (j) {
      if (j.ok && j.levels) for (var i = 0; i < LEVELS.length; i++) takeServer(LEVELS[i], j.levels[LEVELS[i]]);
      if (api.open) draw();
      if (cb) cb();
    }, function () { if (cb) cb(); });
  }
  function fmt(s) {
    var t = Math.round(num(s) * 10), m = Math.floor(t / 600), r = (t % 600) / 10;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
  }

  var api = {
    open: false,
    onClose: null,
    rec: rec,
    fmt: fmt,
    syncStats: syncStats,
    // aftellen begint: token ophalen (tijd ligt dan vóór de start)
    start: function () {
      tokenP = req('/start').then(function (j) { return j.token || null; }, function () { return null; });
    },
    // GO: vanaf nu telt stoppen als verlies, ook als het venster dichtgaat
    go: function (level) {
      var u = who();
      liveRace = { level: level, beat: Date.now(), name: u ? u.name.toLowerCase() : '' };
      setLive(liveRace);
      clearInterval(beatT); beatT = setInterval(beat, 3000);
    },
    // Einde van de race (meteen bij de finish). Geeft meteen de eigen cijfers terug;
    // onServer(j) volgt als de server antwoordt (j.ok, j.rank, j.cur, j.best).
    result: function (r, onServer) {
      liveRace = null; clearInterval(beatT); setLive(null);
      var all = recs(), x = all[r.level];
      if (!x) return null;
      x.races++;
      if (r.won) {
        x.wins++; x.cur++; x.streak = Math.max(x.streak, x.cur);
        if (!x.best || r.time < x.best) x.best = Math.round(r.time * 10) / 10;
      } else x.cur = 0;
      store.set('race', all);
      var u = who();
      if (u) {
        var tp = r.won ? (tokenP || Promise.resolve(null)) : Promise.resolve(null);
        tokenP = null;
        tp.then(function (token) {
          // gewonnen zonder token (geen internet bij de start): telt alleen hier
          if (r.won && !token) { if (onServer) onServer({ ok: false, error: 'offline' }); return; }
          push({ id: uid(), level: r.level, won: !!r.won, time: r.time, token: token, name: u.name.toLowerCase() }, onServer);
        });
      }
      return rec(r.level);
    },
    // stoppen tijdens de race (na GO): verlies
    quit: function (level) {
      if (!liveRace) return;
      api.result({ level: level, won: false });
    },
    openBoard: openBoard,
    LEVELS: LEVELS,
  };
  window.DashRaceBoard = api;

  staleLosses();
  flush();

  function init() {
    $('rsBack').addEventListener('click', closeBoard);
    var tabs = document.querySelectorAll('#rsTabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function (e) { load(e.currentTarget.getAttribute('data-l')); });
    window.addEventListener('keydown', function (e) {
      if (!api.open) return;
      // het spel (game3d.js) mag deze toets niet ook nog krijgen, anders sluit Escape ook het scherm erachter
      if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); closeBoard(); }
      else if (e.code === 'Space' && e.target.closest && e.target.closest('#raceBoard button')) { e.preventDefault(); e.stopImmediatePropagation(); e.target.closest('button').click(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

// Polder Dash RACE online: met een vriend racen, elk op een eigen apparaat.
// Eén race-kamer per code (5 tekens) op de server (Durable Object RaceRoom, zie de privé-notities). Maak een kamer,
// stuur de code of de link (?room=CODE) naar een vriend, allebei op READY, en de race begint tegelijk.
// game3d.js zet DashOnline.game = { start, p, drop, ghost, fin, quit, done, lost } en roept pos/drop/ghost/fin/leave aan.
(function () {
  'use strict';
  var W = window.DDDWallet;
  var API = W ? W.url() : 'https://polder-dash-scores.dddgames.workers.dev';
  var WSURL = API.replace(/^http/, 'ws');
  var ABC = /^[A-HJ-NP-Z2-9]{5}$/;
  var $ = function (id) { return document.getElementById(id); };
  var ws = null, code = '', you = -1, room = null, racing = false, closing = false, backTo = null;
  var isTouch = window.matchMedia && matchMedia('(pointer: coarse)').matches;

  function myName() {
    try { var n = JSON.parse(localStorage.getItem('polderdash.name') || '""'); return typeof n === 'string' ? n : ''; } catch (e) { return ''; }
  }
  function myWear() {
    var L = window.DashLook, w = L && L.wear;
    return w ? { coat: w.coat, hat: w.hat, boots: w.boots, hand: w.hand } : null;
  }
  function cleanCode(c) { c = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return ABC.test(c) ? c : null; }
  function send(o) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (e) { /* dicht */ } } }

  // ---------- scherm ----------
  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function status(t) { $('olStatus').textContent = t || ''; }
  function openScreen(view) {
    if (!api.open) {
      backTo = ['raceMenu', 'title', 'raceOver'].filter(function (id) { return !$(id).classList.contains('hidden'); });
      backTo.forEach(function (id) { show(id, false); });
    }
    api.open = true;
    show('online', true);
    show('olChoose', view === 'choose');
    show('olJoinBox', view === 'join');
    show('olRoom', view === 'room');
    if (view === 'join') { $('olCode').value = ''; setTimeout(function () { $('olCode').focus(); }, 50); }
  }
  function closeScreen(starting) {
    show('online', false);
    api.open = false;
    if (!starting && api.onClose) api.onClose(backTo || []);
    backTo = null;
  }
  function draw() {
    if (!room) return;
    $('olCodeTxt').textContent = room.code || code;
    var list = $('olPlayers');
    list.textContent = '';
    var both = room.players[0].here && room.players[1].here;
    room.players.forEach(function (p) {
      var li = document.createElement('li');
      var me = p.slot === you;
      li.className = me ? 'me' : '';
      var a = document.createElement('span'); a.className = 'rk'; a.textContent = me ? '🟡' : '🔵';
      var b = document.createElement('span'); b.className = 'nm';
      b.textContent = p.here ? (me ? 'You · ' + p.name : p.name) : (me ? 'You' : 'Waiting for a friend…');
      var c = document.createElement('span'); c.className = 'sc'; c.textContent = p.here && p.ready ? '✓ ready' : '';
      li.appendChild(a); li.appendChild(b); li.appendChild(c);
      list.appendChild(li);
    });
    var mine = room.players[you] || {}, theirs = room.players[1 - you] || {};
    var rb = $('olReady');
    show('olReady', both);
    rb.disabled = !!mine.ready;
    rb.textContent = mine.ready ? 'Waiting…' : room.round > 0 ? '↻ READY for a rematch' : 'READY';
    if (!theirs.here) status(room.round > 0 ? 'Your friend left the room.' : 'Send the code to a friend. The race starts when you are both ready.');
    else if (mine.ready) status('Waiting for ' + theirs.name + ' to press READY…');
    else if (theirs.ready) status(theirs.name + ' is ready!');
    else status('Both press READY to start.');
  }

  // ---------- verbinding ----------
  function connect(c) {
    code = c;
    closing = false;
    you = -1; room = null; racing = false;
    openScreen('room');
    $('olCodeTxt').textContent = code;
    $('olPlayers').textContent = '';
    show('olReady', false);
    status('Connecting…');
    try { if (ws) { closing = true; ws.close(); } } catch (e) { /* */ }
    closing = false;
    var s;
    try { s = new WebSocket(WSURL + '/room/' + code + '?name=' + encodeURIComponent(myName())); } catch (e) { status("Couldn't connect. Check your internet."); return; }
    ws = s;
    s.onopen = function () { send({ t: 'hi', wear: myWear() }); };
    s.onmessage = function (e) {
      if (s !== ws) return;
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      handle(m);
    };
    s.onclose = function () {
      if (s !== ws) return;
      ws = null;
      if (closing) return;
      if (racing && api.game) api.game.lost();
      racing = false;
      if (api.open) { status('Connection lost.'); show('olReady', false); show('olRetry', true); }
    };
  }
  function handle(m) {
    var g = api.game;
    switch (m.t) {
      case 'room': you = m.you; room = m; show('olRetry', false); if (api.open && !racing) draw(); break;
      case 'full': status('This room is full. Make a new room.'); closing = true; break;
      case 'start': {
        racing = true;
        var offset = m.now - Date.now(); // klok van de server min de eigen klok
        var other = room && room.players[1 - you] || { name: 'Friend', wear: null };
        closeScreen(true);
        if (g) g.start({ seed: m.seed, start: m.startAt - offset, slot: you, round: m.round, friend: { name: other.name || 'Friend', wear: other.wear } });
        break;
      }
      case 'p': if (g && racing) g.p(m); break;
      case 'drop': if (g && racing) g.drop(m); break;
      case 'ghost': if (g && racing) g.ghost(); break;
      case 'fin': if (g) g.fin(m, m.slot === you); break;
      case 'quit': if (g) g.quit(m, m.slot === you); break;
      case 'done': racing = false; if (g) g.done(m, you); break;
    }
  }

  // ---------- knoppen ----------
  function create() {
    openScreen('room');
    status('Making a room…');
    $('olCodeTxt').textContent = '·····';
    $('olPlayers').textContent = '';
    show('olReady', false);
    fetch(API + '/room/new').then(function (r) { return r.json(); }).then(function (j) {
      if (j && cleanCode(j.code)) connect(j.code); else status("Couldn't make a room. Try again later.");
    }, function () { status("Couldn't make a room. Check your internet."); });
  }
  function join() {
    var c = cleanCode($('olCode').value);
    if (!c) { $('olJoinMsg').textContent = 'A room code has 5 letters and numbers.'; return; }
    $('olJoinMsg').textContent = '';
    connect(c);
  }
  function share() {
    var url = location.origin + location.pathname + '?room=' + code;
    var text = 'Race me in POLDER DASH! 🏁 Room code ' + code;
    var btn = $('olShare');
    if (navigator.share) {
      navigator.share({ title: 'Polder Dash race', text: text, url: url }).catch(function () {});
      return;
    }
    var done = function () { btn.textContent = '✓ Copied!'; setTimeout(function () { btn.textContent = '📤 Send to a friend'; }, 2000); };
    try { navigator.clipboard.writeText(text + ' ' + url).then(done, function () { status(url); }); } catch (e) { status(url); }
  }
  function leave() {
    if (racing) send({ t: 'quit' });
    racing = false;
    closing = true;
    try { if (ws) ws.close(); } catch (e) { /* */ }
    ws = null; room = null; you = -1;
    if (api.open) closeScreen();
  }

  var api = {
    open: false,
    game: null,
    onClose: null,
    slot: function () { return you; },
    inRoom: function () { return !!ws; },
    choose: function () { openScreen('choose'); },
    create: create,
    // na een race: terug naar de kamer voor een rematch
    lobby: function () {
      if (!ws) { openScreen('choose'); status('Connection lost. Make a new room.'); return; }
      openScreen('room');
      draw();
    },
    ready: function () { send({ t: 'ready' }); if (room && room.players[you]) { room.players[you].ready = true; draw(); } },
    leave: leave,
    pos: function (o) { if (racing) send({ t: 'p', d: o.d, l: o.l, j: o.j, s: o.s, x: o.x }); },
    drop: function (d, l) { if (racing) send({ t: 'drop', d: d, l: l }); },
    ghost: function () { if (racing) send({ t: 'ghost' }); },
    fin: function (time) { send({ t: 'fin', time: time }); },
    quit: function () { if (racing) send({ t: 'quit' }); },
    // link met ?room=CODE: meteen meedoen
    boot: function () {
      var m = /[?&]room=([A-Za-z0-9]{5})/.exec(location.search), c = m && cleanCode(m[1]);
      if (!c) return false;
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* oude browser */ }
      connect(c);
      return true;
    },
  };
  window.DashOnline = api;

  function init() {
    $('olNew').addEventListener('click', create);
    $('olJoinOpen').addEventListener('click', function () { openScreen('join'); });
    $('olGo').addEventListener('click', join);
    $('olShare').addEventListener('click', share);
    $('olReady').addEventListener('click', api.ready);
    $('olRetry').addEventListener('click', function () { if (code) connect(code); });
    $('olLeave').addEventListener('click', leave);
    $('olBack').addEventListener('click', closeScreen);
    $('olBack2').addEventListener('click', function () { openScreen('choose'); });
    var inp = $('olCode');
    ['keydown', 'keyup'].forEach(function (t) {
      inp.addEventListener(t, function (e) {
        e.stopPropagation();
        if (t === 'keydown' && e.key === 'Enter') { e.preventDefault(); join(); }
      });
    });
    inp.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    inp.addEventListener('touchend', function (e) { e.stopPropagation(); });
    inp.addEventListener('blur', function () { setTimeout(function () { window.scrollTo(0, 0); window.dispatchEvent(new Event('resize')); }, 60); });
    window.addEventListener('keydown', function (e) {
      if (!api.open || e.target === inp) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!$('olRoom').classList.contains('hidden')) leave(); else closeScreen(); }
      else if (e.code === 'Space' && e.target.closest && e.target.closest('#online button')) { e.preventDefault(); e.stopImmediatePropagation(); e.target.closest('button').click(); }
    });
    if (isTouch) $('olCode').setAttribute('inputmode', 'text');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

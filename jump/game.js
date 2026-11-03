// Ditch Jumper: fierljeppen over Hollandse sloten. Eén knop: ingedrukt houden = aanloop, loslaten = afzetten.
// Alles wordt in canvas getekend (geen plaatjes). High scores via board.js (window.JumpBoard).
(function () {
  'use strict';

  // ---------- instellingen ----------
  var LW = 360;              // logische breedte
  var L = 150;               // lengte van de aanloop (px)
  var ACC = 248;             // versnelling tijdens de aanloop (px/s²)
  var RANGE_K = 0.623;       // spronglengte = snelheid × RANGE_K
  var PERFECT = 10;          // afzetten binnen zoveel px van de rand = perfect
  var START_PAD = 26;        // vanaf de vorige overkant tot het startpaaltje
  var WALK = 170;            // looptempo naar het volgende startpaaltje
  var GRAV = 1100;

  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var wrap = document.getElementById('wrap');
  var ui = document.getElementById('ui');
  var $ = function (id) { return document.getElementById(id); };

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('ditchjumper.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('ditchjumper.' + k, JSON.stringify(v)); } catch (e) { /* privé-venster */ } },
  };

  // ---------- schermmaat ----------
  var H = 680, GY = 420, scale = 1, dpr = 1;
  function fit() {
    var iw = window.innerWidth, ih = window.innerHeight;
    var touch = matchMedia('(pointer: coarse)').matches;
    $('rotate').classList.toggle('hidden', !(touch && iw > ih * 1.1));
    var w, h;
    if (iw / ih < 0.62) { // telefoon staand: hele scherm
      w = iw; h = ih; H = Math.max(560, Math.min(820, LW * ih / iw));
    } else {
      H = 680; h = Math.min(ih * 0.96, 900); w = h * LW / H;
      if (w > iw) { w = iw; h = w * H / LW; }
    }
    scale = w / LW;
    wrap.style.width = w + 'px'; wrap.style.height = h + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ui.style.transform = 'scale(' + scale + ')';
    ui.style.height = H + 'px';
    GY = Math.round(H * 0.64);
    if (!running || paused) draw();
  }

  // ---------- willekeur (vast per run) ----------
  var seed = 1;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // ---------- sloten ----------
  // ditch: { xs (startpaaltje), e (afzetrand), W (breedte), f (overkant), wind, mud: [s0, s1] of null, clog: {x,y} of null }
  var ditches = [];
  function simRun(d, mud, untilS) {
    // snelheid na untilS px aanloop (zelfde stapjes als in het spel, 240 Hz)
    var v = 0, s = 0, dt = 1 / 240;
    while (s < untilS) {
      var inMud = mud && s > mud[0] && s < mud[1];
      v += ACC * (inMud ? 0.4 : 1) * dt;
      if (inMud) v -= v * 0.9 * dt;
      s += v * dt;
    }
    return v;
  }
  function rangeOf(v, wind) { return v * RANGE_K * (1 + 0.07 * wind); }
  function makeDitch(n) {
    var prev = ditches[n - 1];
    var xs = prev ? prev.f + START_PAD : 40;
    var e = xs + L;
    var wind = 0, mud = null;
    if (n >= 8) wind = Math.round((rnd() * 2 - 1) * Math.min(1, (n - 7) / 15) * 10) / 10;
    if (n >= 12 && rnd() < 0.3) { var m0 = 40 + rnd() * 70; mud = [m0, m0 + 38]; }
    var W = 55 + 105 * (1 - Math.exp(-n / 20)) + (rnd() * 12 - 6);
    // altijd te halen: hooguit 95% van de langste sprong (afzetten precies op de rand, met wind en modder)
    var maxR = rangeOf(simRun(0, mud, L), wind);
    W = Math.max(48, Math.min(W, maxR * 0.95 - 3));
    W = Math.round(W);
    var dch = { n: n, xs: xs, e: e, W: W, f: e + W, wind: wind, mud: mud, clog: null, duck: rnd() < 0.55, duckSeed: rnd() * 100 };
    // gouden klomp: op de boog van een bijna perfecte sprong, boven het midden van de sloot
    if (n >= 3 && rnd() < 0.35) {
      var d = 6, v = simRun(0, mud, L - d), R = rangeOf(v, wind), x0 = e - d;
      var cx = e + W * 0.5, u = (cx - x0) / R;
      if (u > 0.15 && u < 0.85) dch.clog = { x: cx, y: GY - arcH(R) * 4 * u * (1 - u) - 26, got: false };
    }
    return dch;
  }
  function ditch(n) { while (ditches.length <= n) ditches.push(makeDitch(ditches.length)); return ditches[n]; }
  function arcH(R) { return 30 + 0.34 * R; }

  // ---------- spelstaat ----------
  var running = false, paused = false, over = false;
  var mode = 'ready';   // ready | run | fly | land | walk | fall | swim | flop
  var n = 0;            // huidige sloot
  var ditchesDone = 0, bonus = 0;
  var p = { x: 0, y: 0, v: 0, vx: 0, vy: 0, phase: 0, t: 0 };
  var fly = null;       // { x0, x1, R, T, u, hpk, plant, perfect }
  var cam = 0;
  var holding = false, ignoreHold = false;
  var parts = [];
  var banner = { t: 0, a: '', b: '' };
  var killer = '';
  var runStartT = 0;
  var runId = 0;         // timers van een oude run doen niets meer
  function later(fn, ms) { var id = runId; setTimeout(function () { if (id === runId) fn(); }, ms); }
  var time = 0;         // echte tijd in s (voor wolken, eenden)

  function resetRun() {
    runId++;
    seed = (Date.now() ^ 0x5bd1e995) >>> 0;
    ditches = []; n = 0; ditchesDone = 0; bonus = 0;
    var d0 = ditch(0); ditch(1); ditch(2);
    p.x = d0.xs; p.y = GY; p.v = 0; p.phase = 0; p.t = 0;
    cam = p.x - 24; mode = 'ready'; fly = null; parts = []; banner.t = 0;
    ignoreHold = holding;
    hud();
  }

  // ---------- invoer ----------
  function press() {
    holding = true;
    audio.unlock();
    if (!running || paused || over) return;
    if (mode === 'ready' && !ignoreHold) { mode = 'run'; p.v = 0; p.t = 0; }
  }
  function release() {
    holding = false;
    ignoreHold = false;
    if (!running || paused || over) return;
    if (mode === 'run') takeoff();
  }
  function isUi(t) { return t && t.closest && t.closest('button, a, input, textarea, .screen:not(.hidden)'); }
  wrap.addEventListener('pointerdown', function (e) {
    if (isUi(e.target)) return;
    e.preventDefault();
    try { wrap.setPointerCapture(e.pointerId); } catch (x) { /* oud toestel */ }
    press();
  });
  wrap.addEventListener('pointerup', function (e) { if (holding) { e.preventDefault(); release(); } });
  wrap.addEventListener('pointercancel', function () { if (holding) release(); });
  wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  wrap.addEventListener('touchstart', function (e) { if (!isUi(e.target)) e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      if (paused && running && !over) { e.preventDefault(); if (!e.repeat) setPause(false); return; }
      if (!running || over) { if (e.code === 'Space' && !e.repeat) { var b = document.activeElement; if (b && b.tagName === 'BUTTON') return; } }
      e.preventDefault();
      if (!e.repeat) press();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (running && !over) setPause(!paused);
    } else if (e.code === 'KeyM') {
      toggleMute();
    }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { if (holding) { e.preventDefault(); release(); } }
  });
  window.addEventListener('blur', function () { if (holding) holding = false; if (running && !over) setPause(true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && running && !over) setPause(true); });

  // ---------- spelregels ----------
  function takeoff() {
    var dch = ditch(n);
    var d = dch.e - p.x;
    var R = rangeOf(p.v, dch.wind);
    if (R < d + 6 || p.v < 40) {
      // te vroeg: de stok komt niet eens bij het water
      mode = 'flop'; p.t = 0; p.vx = p.v * 0.5; p.vy = -160;
      killer = 'early';
      audio.whoosh(0.4);
      return;
    }
    var x1 = p.x + R;
    fly = { x0: p.x, x1: x1, R: R, T: 0.5 + R / 420, u: 0, hpk: arcH(R), perfect: d <= PERFECT,
      plant: Math.max(dch.e + 10, Math.min(dch.f - 10, (p.x + x1) / 2)) };
    mode = 'fly';
    audio.whoosh(1);
    for (var i = 0; i < 8; i++) parts.push({ x: p.x, y: GY, vx: -40 - Math.random() * 80, vy: -40 - Math.random() * 60, t: 0, life: 0.5, c: '#a8875a', r: 2.5 });
  }

  function landOk(dch) {
    ditchesDone++;
    var got = [];
    if (fly.perfect) { bonus++; got.push('PERFECT! +1'); audio.ding(); }
    if (dch.clog && dch.clog.got) { bonus++; got.push('GOLDEN CLOG +1'); }
    var close = fly.x1 < dch.f + 12;
    mode = 'land'; p.t = 0; p.y = GY; p.x = fly.x1;
    p.teeter = close;
    audio.thud();
    for (var i = 0; i < 10; i++) parts.push({ x: p.x, y: GY, vx: (Math.random() - 0.5) * 140, vy: -30 - Math.random() * 70, t: 0, life: 0.45, c: '#7cc35b', r: 2 });
    if (ditchesDone % 10 === 0) { showBanner(ditchesDone + ' DITCHES!', milestone(ditchesDone)); audio.jingle(); }
    else if (got.length) showBanner(got[0], got[1] || '');
    else if (close) showBanner('PHEW!', '');
    n++;
    ditch(n + 2);
    hud();
  }
  function milestone(k) {
    var m = { 10: 'The ducks are impressed', 20: 'Golden hour on the polder', 30: 'Frisian champion material', 40: 'The sun is setting...',
      50: 'Night jumping!', 60: 'Legend of the polder', 80: 'Are you even human?', 100: 'Nobody gets here. Except you.' };
    return m[k] || 'Keep going!';
  }
  function fail(why) {
    if (over) return;
    killer = why;
    over = true;
    audio.splash();
    later(function () { audio.quack(); }, 450);
    later(showOver, 1300);
  }

  function update(dt) {
    time += dt;
    var dch = ditch(n);
    p.t += dt;
    if (mode === 'run') {
      var s = p.x - dch.xs;
      var inMud = dch.mud && s > dch.mud[0] && s < dch.mud[1];
      p.v += ACC * (inMud ? 0.4 : 1) * dt;
      if (inMud) p.v -= p.v * 0.9 * dt;
      p.x += p.v * dt;
      var before = p.phase;
      p.phase += p.v * dt * 0.055;
      if (Math.floor(before / Math.PI) !== Math.floor(p.phase / Math.PI)) {
        audio.step(inMud);
        if (inMud) parts.push({ x: p.x, y: GY, vx: -30, vy: -60, t: 0, life: 0.4, c: '#6b4a2b', r: 3 });
      }
      if (p.x >= dch.e) {
        // te lang doorgelopen: zo de sloot in
        mode = 'fall'; p.vx = Math.max(60, p.v * 0.45); p.vy = -60; p.x = dch.e + 2; p.y = GY;
        killer = 'overrun';
      }
    } else if (mode === 'fly') {
      fly.u = Math.min(1, fly.u + dt / fly.T);
      var u = fly.u;
      p.x = fly.x0 + fly.R * u;
      p.y = GY - fly.hpk * 4 * u * (1 - u);
      if (dch.clog && !dch.clog.got) {
        var dx = p.x - dch.clog.x, dy = (p.y - 22) - dch.clog.y;
        if (dx * dx + dy * dy < 24 * 24) {
          dch.clog.got = true; audio.coin();
          for (var i = 0; i < 14; i++) parts.push({ x: dch.clog.x, y: dch.clog.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, t: 0, life: 0.6, c: '#ffd34d', r: 2.5 });
        }
      }
      if (u >= 1) {
        if (fly.x1 >= dch.f + 2) landOk(dch);
        else { mode = 'fall'; p.vx = 30; p.vy = 0; killer = fly.x1 < dch.e + dch.W * 0.5 ? 'short' : 'edge'; if (killer === 'edge') p.vx = -40; }
      }
    } else if (mode === 'land') {
      if (p.t > (p.teeter ? 0.8 : 0.35)) { mode = 'walk'; p.t = 0; }
    } else if (mode === 'walk') {
      var tx = ditch(n).xs;
      var dir = tx > p.x ? 1 : -1;
      p.x += dir * WALK * dt;
      p.phase += WALK * dt * 0.05;
      if ((dir > 0 && p.x >= tx) || (dir < 0 && p.x <= tx)) {
        p.x = tx; mode = 'ready'; p.t = 0;
        ignoreHold = holding; // eerst loslaten, dan opnieuw indrukken
      }
    } else if (mode === 'faceplant') {
      if (p.t > 0.5 && !over) { over = true; audio.quack(); later(showOver, 900); }
    } else if (mode === 'fall' || mode === 'flop') {
      p.vy += GRAV * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      var fd = ditch(n);
      if (mode === 'flop') {
        if (p.y >= GY) { p.y = GY; p.vx = 0; p.vy = 0; mode = 'faceplant'; p.t = 0; audio.thud(); }
      } else {
        // binnen de sloot blijven
        if (p.x < fd.e + 8) p.x = fd.e + 8;
        if (p.x > fd.f - 8) p.x = fd.f - 8;
        if (p.y >= GY + 40) {
          p.y = GY + 40; mode = 'swim'; p.t = 0;
          for (var j = 0; j < 26; j++) parts.push({ x: p.x, y: GY + 38, vx: (Math.random() - 0.5) * 220, vy: -120 - Math.random() * 220, t: 0, life: 0.9, c: j % 3 ? '#9fd8f5' : '#ffffff', r: 2 + Math.random() * 2, g: true });
          fail(killer);
        }
      }
    }
    // camera
    var target;
    if (mode === 'ready' || mode === 'walk') target = (mode === 'walk' ? ditch(n).xs : p.x) - 24;
    else target = Math.max(ditch(n).xs - 24, p.x - 150);
    cam += (target - cam) * Math.min(1, dt * 4.5);
    // deeltjes
    for (var k = parts.length - 1; k >= 0; k--) {
      var q = parts[k];
      q.t += dt;
      if (q.t >= q.life) { parts.splice(k, 1); continue; }
      q.vy += (q.g ? 700 : 260) * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
    }
    if (banner.t > 0) banner.t -= dt;
  }

  // ---------- tekenen ----------
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(c, al) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (al === undefined ? 1 : al) + ')'; }
  // tijd van de dag hangt af van hoe ver je bent: dag -> gouden uur -> zonsondergang -> nacht
  var SKY = [
    { at: 0, top: [96, 170, 235], bot: [196, 230, 250], sun: [255, 236, 150], light: 1 },
    { at: 18, top: [110, 160, 225], bot: [250, 222, 170], sun: [255, 210, 110], light: 0.95 },
    { at: 34, top: [90, 90, 160], bot: [250, 150, 100], sun: [255, 140, 80], light: 0.8 },
    { at: 48, top: [20, 26, 60], bot: [60, 60, 110], sun: [240, 240, 255], light: 0.55 },
  ];
  function skyAt(k) {
    for (var i = SKY.length - 1; i >= 0; i--) {
      if (k >= SKY[i].at) {
        var a = SKY[i], b = SKY[i + 1];
        if (!b) return { top: a.top, bot: a.bot, sun: a.sun, light: a.light, t: 1, night: true };
        var t = (k - a.at) / (b.at - a.at);
        t = t * t * (3 - 2 * t);
        return { top: mix(a.top, b.top, t), bot: mix(a.bot, b.bot, t), sun: mix(a.sun, b.sun, t), light: a.light + (b.light - a.light) * t, t: (i + t) / 3, night: false };
      }
    }
    return SKY[0];
  }
  var skyK = 0;

  // 3D-weergave (jump3d.js) zet window.__jumpR; dan tekent dit canvas alleen nog deeltjes, tekst en meldingen eroverheen
  function draw() {
    var s = scale * dpr;
    skyK += ((running ? ditchesDone : 0) - skyK) * 0.02;
    var R = window.__jumpR;
    if (R) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      try { R.draw(view); } catch (e) { window.__jumpR = null; if (R.fail) R.fail(e); draw(); return; }
      overlay3d(R);
      return;
    }
    ctx.setTransform(s, 0, 0, s, 0, 0);
    var sky = skyAt(skyK);
    var lt = sky.light;
    // lucht
    var g = ctx.createLinearGradient(0, 0, 0, GY);
    g.addColorStop(0, rgb(sky.top)); g.addColorStop(1, rgb(sky.bot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, H);
    // sterren
    var starA = Math.max(0, (skyK - 38) / 10);
    if (starA > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, starA) * 0.8 + ')';
      for (var i = 0; i < 40; i++) {
        var sx = ((hash(i) * 900 - cam * 0.05) % LW + LW) % LW, sy = hash(i + 50) * GY * 0.6;
        var tw = 0.6 + 0.4 * Math.sin(time * 2 + i);
        ctx.fillRect(sx, sy, 1.4 * tw, 1.4 * tw);
      }
    }
    // zon / maan (zakt langzaam)
    var sunY = 70 + Math.min(1, skyK / 46) * (GY - 120);
    var moon = skyK > 44;
    ctx.save();
    if (!moon) {
      var sg = ctx.createRadialGradient(285, sunY, 4, 285, sunY, 70);
      sg.addColorStop(0, rgb(sky.sun, 0.9)); sg.addColorStop(0.35, rgb(sky.sun, 0.35)); sg.addColorStop(1, rgb(sky.sun, 0));
      ctx.fillStyle = sg; ctx.fillRect(200, sunY - 80, 170, 160);
      ctx.fillStyle = rgb(sky.sun); ctx.beginPath(); ctx.arc(285, sunY, 22, 0, 7); ctx.fill();
    } else {
      var my = 80;
      ctx.fillStyle = 'rgba(240,240,255,0.95)'; ctx.beginPath(); ctx.arc(80, my, 16, 0, 7); ctx.fill();
      ctx.fillStyle = rgb(sky.top); ctx.beginPath(); ctx.arc(88, my - 5, 14, 0, 7); ctx.fill();
    }
    ctx.restore();
    // wolken
    for (var c = 0; c < 6; c++) {
      var span = LW + 260;
      var cx = ((hash(c + 7) * span - cam * 0.15 - time * (6 + c * 2)) % span + span) % span - 130;
      var cy = 40 + hash(c + 13) * (GY * 0.4);
      cloud(cx, cy, 0.7 + hash(c + 3) * 0.6, lt);
    }
    // verre molens en boerderijen
    farLayer(lt);
    // weiland met koeien
    midLayer(lt);
    // dijk/akkers en sloten
    ground(lt);
    // spelfiguur
    drawPole();
    drawFarmer();
    // deeltjes
    for (var k = 0; k < parts.length; k++) {
      var q = parts[k];
      ctx.globalAlpha = Math.max(0, 1 - q.t / q.life);
      ctx.fillStyle = q.c;
      ctx.beginPath(); ctx.arc(q.x - cam, q.y, q.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // nacht: lichte vignet
    if (lt < 0.9) {
      ctx.fillStyle = 'rgba(10,14,40,' + (0.9 - lt) * 0.5 + ')';
      ctx.fillRect(0, 0, LW, H);
    }
    drawBanner();
  }

  function cloud(x, y, sc, lt) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + 0.35 * lt) * (lt < 0.7 ? 0.5 : 1) + ')';
    ctx.beginPath();
    ctx.arc(x, y, 16 * sc, 0, 7); ctx.arc(x + 18 * sc, y - 8 * sc, 20 * sc, 0, 7);
    ctx.arc(x + 40 * sc, y, 15 * sc, 0, 7); ctx.arc(x + 20 * sc, y + 5 * sc, 16 * sc, 0, 7);
    ctx.fill();
  }

  function farLayer(lt) {
    var f = 0.3, baseY = GY - 34;
    var col = rgb(mix([120, 150, 170], [40, 50, 80], 1 - lt));
    // lage horizon
    ctx.fillStyle = rgb(mix([150, 195, 150], [40, 60, 70], 1 - lt));
    ctx.fillRect(0, baseY, LW, GY - baseY);
    var step = 230;
    var first = Math.floor((cam * f - 60) / step);
    for (var i = first; i < first + 4; i++) {
      var x = i * step - cam * f + hash(i) * 80;
      if (hash(i + 99) < 0.75) mill(x, baseY + 2, 0.75 + hash(i + 5) * 0.3, col, lt);
      else farm(x, baseY + 2, col);
    }
  }
  function mill(x, y, sc, col, lt) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-8, -48); ctx.lineTo(8, -48); ctx.lineTo(12, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-11, -48); ctx.lineTo(0, -60); ctx.lineTo(11, -48); ctx.fill();
    if (lt < 0.75) { ctx.fillStyle = 'rgba(255,214,120,0.9)'; ctx.fillRect(-2, -30, 4, 5); }
    ctx.translate(0, -50);
    ctx.rotate(time * 0.8 + x * 0.01);
    ctx.strokeStyle = col; ctx.lineWidth = 2.2;
    for (var k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.stroke();
      ctx.fillStyle = col; ctx.globalAlpha = 0.75; ctx.fillRect(1, -34, 6, 26); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function farm(x, y, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x - 22, y - 16); ctx.lineTo(x, y - 34); ctx.lineTo(x + 22, y - 16); ctx.lineTo(x + 22, y); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 40, y - 14, 12, 0, 7); ctx.arc(x + 48, y - 20, 9, 0, 7); ctx.fill();
    ctx.fillRect(x + 42, y - 10, 3, 10);
  }

  function midLayer(lt) {
    var f = 0.6, y0 = GY - 14;
    ctx.fillStyle = rgb(mix([120, 190, 95], [36, 64, 52], 1 - lt));
    ctx.fillRect(0, y0, LW, GY - y0);
    var step = 140;
    var first = Math.floor((cam * f - 60) / step);
    for (var i = first; i < first + 5; i++) {
      var x = i * step - cam * f + hash(i + 3) * 60;
      var h = hash(i + 21);
      if (h < 0.5) cow(x, y0 + 4, lt, i);
      else if (h < 0.75) tulips(x, y0 + 3, i, lt);
      else tree(x, y0 + 3, lt);
    }
  }
  function cow(x, y, lt, i) {
    var dark = 1 - lt;
    ctx.save(); ctx.translate(x, y);
    if (hash(i + 8) < 0.5) ctx.scale(-1, 1);
    ctx.fillStyle = rgb(mix([250, 250, 245], [90, 95, 120], dark));
    ctx.fillRect(-11, -11, 22, 9);
    ctx.fillRect(-10, -3, 2.5, 4); ctx.fillRect(7, -3, 2.5, 4);
    ctx.fillStyle = rgb(mix([30, 30, 30], [20, 20, 30], dark));
    ctx.fillRect(-6, -11, 6, 5); ctx.fillRect(3, -8, 4, 4);
    ctx.fillStyle = rgb(mix([250, 250, 245], [90, 95, 120], dark));
    var nod = Math.sin(time * 1.3 + i) > 0.6 ? 3 : 0;
    ctx.fillRect(10, -13 + nod, 6, 6);
    ctx.fillStyle = '#f2a0a0'; ctx.fillRect(14, -9 + nod, 3, 3);
    ctx.restore();
  }
  function tulips(x, y, i, lt) {
    var cols = ['#e8413a', '#ffcf3a', '#f06fb0', '#ff8a1a'];
    for (var k = 0; k < 9; k++) {
      ctx.fillStyle = cols[(i + Math.floor(k / 3)) % 4];
      ctx.globalAlpha = 0.5 + lt * 0.5;
      ctx.fillRect(x + k * 4, y - 6 - (k % 2), 3, 3);
    }
    ctx.globalAlpha = 1;
  }
  function tree(x, y, lt) {
    ctx.fillStyle = rgb(mix([90, 70, 50], [40, 35, 40], 1 - lt));
    ctx.fillRect(x - 1.5, y - 14, 3, 14);
    ctx.fillStyle = rgb(mix([70, 140, 70], [30, 55, 50], 1 - lt));
    ctx.beginPath(); ctx.arc(x, y - 20, 10, 0, 7); ctx.arc(x - 6, y - 14, 7, 0, 7); ctx.arc(x + 6, y - 14, 7, 0, 7); ctx.fill();
  }

  function ground(lt) {
    var dark = 1 - lt;
    var grass = rgb(mix([104, 190, 80], [36, 72, 48], dark));
    var grassD = rgb(mix([74, 150, 60], [28, 56, 40], dark));
    var soil = rgb(mix([126, 92, 58], [52, 40, 36], dark));
    var soilD = rgb(mix([104, 74, 46], [42, 32, 30], dark));
    var water = mix([70, 150, 210], [30, 50, 90], dark);
    // grond over de hele breedte, sloten erin uitsparen
    ctx.fillStyle = soil; ctx.fillRect(0, GY + 6, LW, H - GY);
    ctx.fillStyle = soilD;
    for (var y = GY + 22; y < H; y += 18) ctx.fillRect(0, y, LW, 3);
    ctx.fillStyle = grass; ctx.fillRect(0, GY, LW, 8);
    // grassprietjes
    ctx.fillStyle = grassD;
    var g0 = Math.floor(cam / 9) * 9;
    for (var gx = g0; gx < cam + LW + 9; gx += 9) {
      var hh = 3 + hash(gx * 0.37) * 4;
      ctx.fillRect(gx - cam, GY - hh + 1, 2, hh);
    }
    // sloten
    for (var i = Math.max(0, n - 2); i < n + 4; i++) {
      var d = ditch(i);
      var x0 = d.e - cam, x1 = d.f - cam;
      if (x1 < -20 || x0 > LW + 20) continue;
      // uitsparing
      ctx.fillStyle = rgb(mix([90, 70, 50], [40, 32, 30], dark));
      ctx.fillRect(x0, GY, x1 - x0, H - GY);
      var wg = ctx.createLinearGradient(0, GY + 30, 0, H);
      wg.addColorStop(0, rgb(water)); wg.addColorStop(1, rgb(mix(water, [10, 30, 60], 0.6)));
      ctx.fillStyle = wg;
      ctx.fillRect(x0 + 3, GY + 30, x1 - x0 - 6, H - GY - 30);
      // golfjes
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 * lt + 0.1) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var wx = x0 + 3; wx <= x1 - 3; wx += 4) {
        var wy = GY + 30 + Math.sin(wx * 0.15 + time * 2.4) * 1.4;
        if (wx === x0 + 3) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (var r = 0; r < 3; r++) ctx.fillRect(x0 + 10 + ((time * 12 + r * 37) % Math.max(10, x1 - x0 - 30)), GY + 40 + r * 9, 12, 1.5);
      // kantjes van de sloot
      ctx.fillStyle = grass;
      ctx.beginPath(); ctx.moveTo(x0 - 2, GY); ctx.lineTo(x0 + 4, GY); ctx.lineTo(x0 + 3, GY + 30); ctx.lineTo(x0 - 2, GY + 30); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x1 + 2, GY); ctx.lineTo(x1 - 4, GY); ctx.lineTo(x1 - 3, GY + 30); ctx.lineTo(x1 + 2, GY + 30); ctx.fill();
      // riet
      reeds(x0 + 2, GY + 31, lt, i);
      reeds(x1 - 8, GY + 31, lt, i + 50);
      // eend
      if (d.duck) duck(d, x0, x1, lt);
      // gouden klomp
      if (d.clog && !d.clog.got) clog(d.clog.x - cam, d.clog.y + Math.sin(time * 3) * 3);
      // breedte in meters bij het afzetpunt
      if (i === n && (mode === 'ready' || mode === 'run')) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        var label = (d.W / 32).toFixed(1) + ' m';
        ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(label, (x0 + x1) / 2, H - 18);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(label, (x0 + x1) / 2, H - 19);
      }
    }
    // aanloop: startpaaltje, modder, afzetbalk en wind
    for (var j = Math.max(0, n - 1); j < n + 3; j++) {
      var dd = ditch(j);
      var xs = dd.xs - cam, xe = dd.e - cam;
      if (xe < -40 || xs > LW + 40) continue;
      if (dd.mud) {
        var m0 = dd.xs + dd.mud[0] - cam, m1 = dd.xs + dd.mud[1] - cam;
        ctx.fillStyle = rgb(mix([96, 66, 38], [40, 30, 26], dark));
        ctx.beginPath(); ctx.ellipse((m0 + m1) / 2, GY + 2, (m1 - m0) / 2 + 3, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect((m0 + m1) / 2 - 6, GY, 9, 1.5);
      }
      // afzetbalk (wit) met perfect-strook
      ctx.fillStyle = 'rgba(255,214,60,' + (j === n ? 0.85 : 0.5) + ')';
      ctx.fillRect(xe - PERFECT, GY, PERFECT, 4);
      ctx.fillStyle = '#f4f1e8'; ctx.fillRect(xe - PERFECT - 3, GY, 3, 4);
      // startpaaltje met nummer
      ctx.fillStyle = '#f4f1e8'; ctx.fillRect(xs - 1.5, GY - 26, 3, 26);
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath(); ctx.moveTo(xs + 1.5, GY - 26); ctx.lineTo(xs + 16, GY - 21); ctx.lineTo(xs + 1.5, GY - 16); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 7px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(j + 1), xs + 7, GY - 19);
      // windzak bij de rand
      if (dd.wind !== 0) windsock(xe + 2, GY, dd.wind, lt);
    }
  }
  function reeds(x, y, lt, i) {
    ctx.strokeStyle = rgb(mix([70, 130, 60], [30, 50, 40], 1 - lt)); ctx.lineWidth = 1.5;
    for (var k = 0; k < 4; k++) {
      var sway = Math.sin(time * 1.5 + i + k) * 1.5;
      ctx.beginPath(); ctx.moveTo(x + k * 2, y); ctx.lineTo(x + k * 2 + sway, y - 14 - (k % 2) * 5); ctx.stroke();
    }
    ctx.fillStyle = rgb(mix([110, 70, 40], [50, 40, 35], 1 - lt));
    ctx.fillRect(x + 1 + Math.sin(time * 1.5 + i) * 1.5, y - 19, 2, 6);
  }
  function duck(d, x0, x1, lt) {
    var w = x1 - x0 - 30;
    if (w < 10) return;
    var t = time * 0.25 + d.duckSeed;
    var ph = (t % 2) / 2, dir = ph < 0.5 ? 1 : -1;
    var px = x0 + 15 + (ph < 0.5 ? ph * 2 : 2 - ph * 2) * w;
    var py = GY + 30 + Math.sin(time * 3 + d.duckSeed) * 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(dir, 1);
    ctx.fillStyle = rgb(mix([140, 100, 60], [70, 60, 60], 1 - lt));
    ctx.beginPath(); ctx.ellipse(0, -3, 7, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = rgb(mix([40, 120, 60], [30, 60, 50], 1 - lt));
    ctx.beginPath(); ctx.arc(6, -8, 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2a33a'; ctx.fillRect(8.5, -8, 3.5, 1.8);
    ctx.fillStyle = '#000'; ctx.fillRect(6.5, -9.2, 1.2, 1.2);
    ctx.restore();
  }
  function clog(x, y) {
    ctx.save(); ctx.translate(x, y);
    var gl = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
    gl.addColorStop(0, 'rgba(255,230,120,0.7)'); gl.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = gl; ctx.fillRect(-22, -22, 44, 44);
    ctx.rotate(Math.sin(time * 2) * 0.2);
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath(); ctx.moveTo(-10, 2); ctx.quadraticCurveTo(-11, -6, -4, -6); ctx.lineTo(4, -5); ctx.quadraticCurveTo(12, -4, 11, 3); ctx.quadraticCurveTo(0, 6, -10, 2); ctx.fill();
    ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.ellipse(-4, -4, 3, 1.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(2, -3, 5, 1.2);
    ctx.restore();
  }
  function windsock(x, y, w, lt) {
    ctx.save(); ctx.translate(x - cam * 0, 0);
    var px = x, top = y - 40;
    ctx.fillStyle = '#ddd'; ctx.fillRect(px - 1, top, 2, 40);
    var len = 8 + Math.abs(w) * 12, dir = w > 0 ? 1 : -1, fl = Math.sin(time * 9) * 1.5 * Math.abs(w);
    for (var k = 0; k < 3; k++) {
      ctx.fillStyle = k % 2 ? '#fff' : '#ff5a2a';
      ctx.beginPath();
      var a = k / 3 * len, b = (k + 1) / 3 * len;
      ctx.moveTo(px + dir * a, top + 1 + k * 0.6 + fl * k / 3); ctx.lineTo(px + dir * b, top + 1.6 + (k + 1) * 0.6 + fl * (k + 1) / 3);
      ctx.lineTo(px + dir * b, top + 6 - (k + 1) * 0.6 + fl * (k + 1) / 3); ctx.lineTo(px + dir * a, top + 6.5 - k * 0.6 + fl * k / 3);
      ctx.fill();
    }
    ctx.restore();
  }

  // boer met klompen en stok
  function hands() {
    // handpositie (wereld) voor de stok
    if (mode === 'fly') return { x: p.x - 2, y: p.y - 34 };
    return { x: p.x + 6, y: p.y - 22 };
  }
  // stok als lijnstuk [x1, y1, x2, y2] in wereld-px (ook gebruikt door de 3D-weergave)
  function poleSeg() {
    var h = hands();
    if (mode === 'fly' && fly.u < 0.8) return [fly.plant, GY + 44, h.x, h.y];
    if (mode === 'fly' || mode === 'land' || (mode === 'fall' && fly)) {
      // stok blijft achter in de sloot en valt om
      var t = mode === 'fly' ? (fly.u - 0.8) / 0.2 : 1;
      var ang = -Math.PI / 2 + Math.min(1, t) * 0.5 - (mode !== 'fly' ? 0.4 : 0);
      return fly ? [fly.plant, GY + 44, fly.plant + Math.cos(ang) * 70, GY + 44 + Math.sin(ang) * 70] : null;
    }
    if (mode === 'walk') return [h.x - 30, h.y + 6, h.x + 50, h.y - 20];
    if (mode === 'faceplant') return [p.x - 40, GY - 2, p.x + 70, GY - 2];
    if (mode === 'swim') return [p.x - 40, GY + 36, p.x + 40, GY + 30];
    // vasthouden tijdens wachten en aanloop: schuin vooruit
    var lift = mode === 'run' ? Math.min(1, p.v / 260) * 0.25 : 0;
    var a2 = -0.55 + lift;
    return [h.x - 32 * Math.cos(a2), h.y - 32 * Math.sin(a2), h.x + 88 * Math.cos(a2), h.y + 88 * Math.sin(a2)];
  }
  function drawPole() {
    var sg = poleSeg();
    if (!sg) return;
    if (window.JumpLook) { window.JumpLook.pole2d(ctx, window.JumpLook.wear.pole, sg[0] - cam, sg[1], sg[2] - cam, sg[3]); return; }
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sg[0] - cam, sg[1]); ctx.lineTo(sg[2] - cam, sg[3]); ctx.stroke();
  }
  // bovenlaag in 3D: deeltjes, breedte van de sloot en meldingen (R.project: wereld-px -> scherm-px)
  function overlay3d(R) {
    for (var k = 0; k < parts.length; k++) {
      var q = parts[k], sp = R.project(q.x, q.y);
      if (!sp) continue;
      ctx.globalAlpha = Math.max(0, 1 - q.t / q.life);
      ctx.fillStyle = q.c;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, q.r * sp.k, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (running && (mode === 'ready' || mode === 'run')) {
      var d = ditch(n), c = R.project((d.e + d.f) / 2, GY);
      if (c) {
        var label = (d.W / 32).toFixed(1) + ' m';
        ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(label, c.x, H - 18);
        ctx.fillStyle = '#fff'; ctx.fillText(label, c.x, H - 18);
      }
    }
    drawBanner();
  }
  // alles wat de 3D-weergave mag lezen (alleen lezen)
  var view = {
    get p() { return p; }, get mode() { return mode; }, get fly() { return fly; }, get n() { return n; },
    get cam() { return cam; }, get time() { return time; }, get skyK() { return skyK; }, get H() { return H; }, get GY() { return GY; },
    get running() { return running; }, get over() { return over; }, get paused() { return paused; }, get ditchesDone() { return ditchesDone; },
    LW: LW, PERFECT: PERFECT, ditch: ditch, poleSeg: poleSeg, hands: hands, arcH: arcH,
  };
  function drawFarmer() {
    var x = p.x - cam, y = p.y;
    var L = window.JumpLook, wear = L ? L.wear : null;   // kleding uit de winkel (look.js)
    var skin = '#f2c9a0', shirt = L ? L.colors().shirt : '#e8413a', overall = '#2f6fd1', cap = '#ff7a1a', clogC = '#ffd34d';
    ctx.save(); ctx.translate(x, y);
    ctx.lineCap = 'round';
    if (mode === 'swim') {
      // alleen het hoofd steekt boven water, met eendenkroos en een kikker
      var bob = Math.sin(time * 4) * 1.5;
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -10 + bob, 7, 0, 7); ctx.fill();
      var fy = 0;   // kikker zit bovenop de hoed
      if (L) { L.hat2d(ctx, wear.hat, 0, -10 + bob); fy = 9.6 - L.hatTop(wear.hat); }
      else { ctx.fillStyle = cap; ctx.fillRect(-7, -17 + bob, 14, 4); }
      ctx.fillStyle = '#5bbf3a'; ctx.beginPath(); ctx.ellipse(1, -19 + bob + fy, 5, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillRect(-1, -21 + bob + fy, 1.4, 1.4); ctx.fillRect(3, -21 + bob + fy, 1.4, 1.4);
      ctx.fillStyle = '#000'; ctx.fillRect(-3, -11 + bob, 1.5, 1.5); ctx.fillRect(2, -11 + bob, 1.5, 1.5);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -6 + bob, 2, 0, Math.PI, true); ctx.stroke();
      ctx.fillStyle = '#7cc35b';
      for (var k = 0; k < 6; k++) ctx.fillRect(-12 + k * 4.5, -4 + Math.sin(time * 2 + k) * 0.8, 3, 1.6);
      ctx.restore(); return;
    }
    var run = mode === 'run' || mode === 'walk';
    var sw = run ? Math.sin(p.phase) : 0;
    var lean = mode === 'run' ? Math.min(0.25, p.v / 1200) : 0;
    if (mode === 'faceplant') { ctx.rotate(Math.PI / 2 * Math.min(1, p.t * 6)); }
    if (mode === 'fall') ctx.rotate(Math.sin(time * 18) * 0.4);
    if (mode === 'flop') ctx.rotate(Math.min(1.2, p.t * 3));
    if (mode === 'fly') ctx.rotate(-0.35 + fly.u * 0.5);
    ctx.rotate(lean);
    // benen
    ctx.strokeStyle = overall; ctx.lineWidth = 5;
    var legA, legB;
    if (mode === 'fly') { legA = [8, -6]; legB = [11, -2]; }
    else if (mode === 'land') { var sq = Math.max(0, 1 - p.t * 4); legA = [-5, -2 + sq * 2]; legB = [5, -2 + sq * 2]; }
    else { legA = [sw * 7, 0]; legB = [-sw * 7, 0]; }
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(legA[0], legA[1] - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(legB[0], legB[1] - 2); ctx.stroke();
    // klompen
    ctx.fillStyle = clogC;
    ctx.beginPath(); ctx.ellipse(legA[0] + 2, legA[1] - 1, 4.5, 2.4, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(legB[0] + 2, legB[1] - 1, 4.5, 2.4, 0, 0, 7); ctx.fill();
    // lijf
    ctx.fillStyle = shirt; ctx.fillRect(-6, -32, 12, 10);
    ctx.fillStyle = overall; ctx.fillRect(-6, -26, 12, 11);
    ctx.fillRect(-5, -32, 2.5, 7); ctx.fillRect(2.5, -32, 2.5, 7);
    // armen
    ctx.strokeStyle = shirt; ctx.lineWidth = 4;
    var tee = mode === 'land' && p.teeter;
    if (tee) {
      var r = time * 16;
      ctx.beginPath(); ctx.moveTo(-4, -30); ctx.lineTo(-4 + Math.cos(r) * 10, -30 + Math.sin(r) * 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -30); ctx.lineTo(4 + Math.cos(r + 2) * 10, -30 + Math.sin(r + 2) * 10); ctx.stroke();
    } else if (mode === 'fall' || mode === 'flop') {
      ctx.beginPath(); ctx.moveTo(-4, -30); ctx.lineTo(-11, -40 + Math.sin(time * 20) * 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -30); ctx.lineTo(11, -40 - Math.sin(time * 20) * 4); ctx.stroke();
    } else if (mode === 'land' && !tee) {
      ctx.beginPath(); ctx.moveTo(-4, -30); ctx.lineTo(-9, -40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -30); ctx.lineTo(9, -40); ctx.stroke();
    } else {
      var hd = hands();
      ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(hd.x - p.x, hd.y - p.y); ctx.stroke();
    }
    // hoofd
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(1, -38, 6.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillRect(3.5, -40, 1.6, 1.6);
    if (mode === 'fall' || mode === 'flop' || tee) { ctx.beginPath(); ctx.arc(4, -35, 1.8, 0, 7); ctx.fill(); }
    else { ctx.fillRect(2.5, -35.5, 3, 1); }
    ctx.fillStyle = '#c98a5a'; ctx.fillRect(6.5, -38.5, 2, 2); // neus
    // pet (of de hoed uit de winkel)
    if (L) L.hat2d(ctx, wear.hat, 1, -38);
    else { ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(1, -41, 6.6, Math.PI, 0); ctx.fill(); ctx.fillRect(4, -42, 7, 2.2); }
    ctx.restore();
  }

  function showBanner(a, b) { banner.a = a; banner.b = b; banner.t = 1.6; }
  function drawBanner() {
    if (banner.t <= 0) return;
    var t = banner.t, a = Math.min(1, t * 3, (1.6 - t) * 8);
    var y = H * 0.24 - (1.6 - t) * 8;
    ctx.globalAlpha = Math.max(0, a);
    ctx.textAlign = 'center';
    ctx.font = '900 30px system-ui, sans-serif';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(banner.a, LW / 2, y);
    ctx.fillStyle = '#fff'; ctx.fillText(banner.a, LW / 2, y);
    if (banner.b) {
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.lineWidth = 4; ctx.strokeText(banner.b, LW / 2, y + 24);
      ctx.fillStyle = '#ffd34d'; ctx.fillText(banner.b, LW / 2, y + 24);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- geluid (alles zelf gemaakt met WebAudio) ----------
  var audio = (function () {
    var ac = null, master = null, muted = store.get('muted', false);
    function unlock() {
      if (!ac) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        try { ac = new C(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ac.destination); } catch (e) { ac = null; return; }
      }
      if (ac.state !== 'running') { try { ac.resume(); } catch (e) { /* */ } }
    }
    function ok() { return ac && ac.state === 'running' && !muted; }
    function tone(f, dur, type, vol, f2, delay) {
      if (!ok()) return;
      var t = ac.currentTime + (delay || 0);
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
    var nbuf = null;
    function noise(dur, vol, freq, freq2, q) {
      if (!ok()) return;
      if (!nbuf) { nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); var d = nbuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      var t = ac.currentTime;
      var s = ac.createBufferSource(); s.buffer = nbuf; s.loop = true;
      var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q || 1; f.frequency.setValueAtTime(freq, t);
      if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
      var g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
    }
    return {
      unlock: unlock,
      get muted() { return muted; },
      setMuted: function (m) { muted = m; store.set('muted', m); if (master) master.gain.value = m ? 0 : 0.6; },
      step: function (mud) { noise(0.06, mud ? 0.25 : 0.12, mud ? 300 : 900, 0, 2); },
      whoosh: function (v) { noise(0.45, 0.25 * v, 500, 2400, 0.8); },
      thud: function () { tone(120, 0.15, 'sine', 0.4, 60); noise(0.12, 0.15, 400, 0, 1); },
      splash: function () { noise(0.9, 0.5, 1800, 300, 0.6); for (var i = 0; i < 5; i++) tone(500 + Math.random() * 600, 0.08, 'sine', 0.12, 1200, 0.15 + i * 0.09); },
      quack: function () { tone(520, 0.12, 'square', 0.08, 380); tone(500, 0.14, 'square', 0.08, 360, 0.18); },
      ding: function () { tone(880, 0.25, 'triangle', 0.18); tone(1320, 0.3, 'triangle', 0.14, 0, 0.08); },
      coin: function () { tone(988, 0.08, 'square', 0.08); tone(1319, 0.25, 'square', 0.08, 0, 0.07); },
      jingle: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.16, 0, i * 0.09); }); },
    };
  })();
  function toggleMute() { audio.setMuted(!audio.muted); $('muteBtn').textContent = audio.muted ? '🔇' : '🔊'; }

  // ---------- schermen ----------
  function hud() {
    $('hDitches').textContent = ditchesDone;
    $('hScore').textContent = 'score ' + (ditchesDone + bonus);
    var d = ditch(n);
    var w = $('hWind');
    if (d.wind) { w.textContent = 'wind ' + (d.wind > 0 ? '→' : '←') + ' ' + Math.round(Math.abs(d.wind) * 10); w.className = 'sub ' + (d.wind > 0 ? 'tail' : 'head'); }
    else { w.textContent = ''; }
  }
  function show(id) { ['title', 'pause', 'over'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); }); }
  function start() {
    audio.unlock();
    resetRun();
    running = true; paused = false; over = false;
    show(null);
    $('hud').classList.remove('hidden');
    runStartT = Date.now();
    if (window.JumpBoard) window.JumpBoard.runStart();
    last = performance.now();
  }
  function setPause(on) {
    if (!running || over) return;
    paused = on;
    holding = false;
    if (on && mode === 'run') { var d0 = ditch(n); p.x = d0.xs; p.v = 0; p.t = 0; mode = 'ready'; }
    if (on) { show('pause'); $('resumeBtn').focus(); }
    else { show(null); last = performance.now(); ignoreHold = false; }
  }
  var MSG = {
    short: ['Splash! Too short.', 'The ducks saw everything.', 'Swimming lessons, anyone?'],
    edge: ['So close! You hit the edge.', 'Almost! Then: splash.'],
    overrun: ['You forgot to let go!', 'Ran straight into the ditch.'],
    early: ['Too early! The pole hit the grass.', 'Let go a bit later!'],
  };
  function showOver() {
    running = false;
    var score = ditchesDone + bonus;
    var best = store.get('best', null);
    var isBest = !best || score > best.score;
    if (isBest && score > 0) store.set('best', { score: score, ditches: ditchesDone });
    best = store.get('best', null);
    var list = MSG[killer] || MSG.short;
    $('killer').textContent = list[Math.floor(Math.random() * list.length)];
    $('oDitches').textContent = ditchesDone;
    $('oScore').textContent = score;
    $('newBest').classList.toggle('hidden', !(isBest && score > 0));
    $('oBest').textContent = best ? bestLine(best) : '';
    $('hint').textContent = tipFor(killer);
    $('shareBox').classList.add('hidden');
    $('hud').classList.add('hidden');
    show('over');
    if (window.JumpBoard) window.JumpBoard.runEnd({ score: score, ditches: ditchesDone, bonus: bonus, seconds: (Date.now() - runStartT) / 1000 });
    $('againBtn').focus();
  }
  function bestLine(b) { return 'Your best: ' + b.score + (b.score === 1 ? ' point · ' : ' points · ') + b.ditches + (b.ditches === 1 ? ' ditch' : ' ditches'); }
  function tipFor(k) {
    if (k === 'overrun') return 'Tip: let go just before the white board.';
    if (k === 'early') return 'Tip: keep holding longer. More speed = longer jump.';
    if (ditchesDone < 3) return 'Tip: hold to run, let go right before the edge.';
    return 'Tip: let go on the yellow strip for a PERFECT (+1).';
  }
  function titleBest() {
    var b = store.get('best', null);
    $('bestTitle').textContent = b && b.score > 0 ? bestLine(b) : '';
  }
  function share() {
    var b = ditchesDone;
    var text = 'I jumped ' + b + (b === 1 ? ' ditch' : ' ditches') + ' in DITCH JUMPER 🦆 Can you beat me?';
    var url = 'https://dddothraki.github.io/jump/';
    if (navigator.share) { navigator.share({ title: 'Ditch Jumper', text: text, url: url }).catch(function () {}); return; }
    var full = text + ' ' + url;
    var box = $('shareBox');
    var done = function () { toast('Copied! Paste it anywhere.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(full).then(done, function () { box.value = full; box.classList.remove('hidden'); box.select(); });
    } else { box.value = full; box.classList.remove('hidden'); box.select(); }
  }
  var toastT = 0;
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.add('hidden'); }, 2200); }

  $('playBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);
  $('resumeBtn').addEventListener('click', function () { setPause(false); });
  $('quitBtn').addEventListener('click', function () { running = false; paused = false; $('hud').classList.add('hidden'); titleBest(); show('title'); resetRun(); });
  $('pauseBtn').addEventListener('click', function () { setPause(true); });
  $('muteBtn').addEventListener('click', toggleMute);
  $('shareBtn').addEventListener('click', share);
  $('muteBtn').textContent = audio.muted ? '🔇' : '🔊';

  // ---------- hoofdlus ----------
  var last = performance.now();
  var fixedAcc = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running && !paused && !hold) {
      // vaste stapjes van 1/240 s: zelfde uitkomst op elke telefoon
      fixedAcc += dt;
      var steps = 0;
      while (fixedAcc >= 1 / 240 && steps < 30) { update(1 / 240); fixedAcc -= 1 / 240; steps++; }
    } else if (!running) {
      time += dt; // titelscherm: wolken en molens bewegen
    }
    draw();
    requestAnimationFrame(frame);
  }
  var hold = false;

  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 200); });
  resetRun();
  fit();
  titleBest();
  requestAnimationFrame(frame);

  // testhaak, alleen lokaal
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
    window.__jump = {
      start: start, press: press, release: release,
      step: function (k) { for (var i = 0; i < (k || 1); i++) update(1 / 240); draw(); },
      sim: function (k) { for (var i = 0; i < (k || 1); i++) update(1 / 240); }, // zonder tekenen (snelle bot-tests)
      get state() { return { mode: mode, n: n, ditches: ditchesDone, bonus: bonus, x: p.x, v: p.v, over: over, running: running, d: ditch(n) }; },
      set hold(v) { hold = v; },
      ditch: ditch,
    };
  }
})();

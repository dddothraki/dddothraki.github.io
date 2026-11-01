// Polder Dash: endless runner over een spookachtige dijk. Alles wordt in code getekend en het
// geluid wordt met WebAudio gemaakt, dus er zijn geen losse plaatjes of geluidsbestanden nodig.
'use strict';
(() => {
  const ROBLOX_URL = 'https://www.roblox.com/games/77894735497943';
  const W = 360;              // logische breedte; de hoogte volgt uit het scherm
  const TILE_H = 512;         // hoogte van de herhalende grondtegel
  const ROAD_L = 80, ROAD_R = 280, LANE_W = (ROAD_R - ROAD_L) / 3;
  const PX_PER_M = 32;
  const JUMP_TIME = 0.62;
  const laneX = i => ROAD_L + LANE_W * (i + 0.5);

  const $ = id => document.getElementById(id);
  const wrap = $('wrap'), ui = $('ui'), canvas = $('game'), ctx = canvas.getContext('2d');
  const dark = document.createElement('canvas'), dctx = dark.getContext('2d');
  let H = 640, PY = 480, scale = 1, k = 1;
  let tile = null, fogSprite = null;

  // ---------- hulpjes ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
  const chance = p => Math.random() < p;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = t => 1 - (1 - t) * (1 - t);
  function weighted(opts) {
    let sum = 0;
    for (const o of opts) sum += o[1];
    let r = Math.random() * sum;
    for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
    return opts[0][0];
  }
  function mulberry32(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const store = {
    get(key, def) { try { const v = localStorage.getItem('polderdash.' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(key, v) { try { localStorage.setItem('polderdash.' + key, JSON.stringify(v)); } catch (e) { /* privévenster */ } },
  };
  let best = store.get('best', null);
  if (!best || typeof best.score !== 'number' || typeof best.meters !== 'number') best = { score: 0, meters: 0 };

  // ---------- schermgrootte ----------
  let lastSize = '';
  function resize() {
    // niet herschalen terwijl het toetsenbord open is (naam typen voor de high scores)
    if (document.activeElement && /^lb(In|Code)$/.test(document.activeElement.id)) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const size = vw + 'x' + vh + 'x' + (window.devicePixelRatio || 1);
    if (size === lastSize) return;
    lastSize = size;
    const aspect = clamp(vh / vw, 1.7, 2.2);
    H = Math.round(W * aspect);
    PY = H - 150;
    scale = Math.min(vw / W, vh / H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    k = scale * dpr;
    wrap.style.width = Math.round(W * scale) + 'px';
    wrap.style.height = Math.round(H * scale) + 'px';
    // knoppen en teksten liggen in #ui op dezelfde logische maat als het spel en schalen mee
    ui.style.height = H + 'px';
    ui.style.transform = `scale(${scale})`;
    // telefoon dwars: vragen om hem rechtop te houden
    $('rotate').classList.toggle('hidden', !(vw > vh * 1.15 && matchMedia('(pointer: coarse)').matches));
    canvas.width = Math.round(W * k);
    canvas.height = Math.round(H * k);
    // het donker is zacht, dus dat mag op halve resolutie (scheelt veel rekenwerk op telefoons)
    dark.width = Math.round(W * k / 2);
    dark.height = Math.round(H * k / 2);
    makeTile();
    makeFog();
  }

  // ---------- grondtegel (sloot, berm, dijkpad, maïs) ----------
  function makeTile() {
    tile = document.createElement('canvas');
    tile.width = Math.ceil(W * k);
    tile.height = Math.round(TILE_H * k);
    const t = tile.getContext('2d');
    t.scale(k, tile.height / TILE_H); // precies op hele pixels, anders een doorzichtige rand (naad)
    const R = mulberry32(1953); // het jaar van de watersnood
    const both = (y, fn) => { fn(y); if (y < 40) fn(y + TILE_H); if (y > TILE_H - 40) fn(y - TILE_H); };

    // sloot
    let g = t.createLinearGradient(0, 0, 62, 0);
    g.addColorStop(0, '#06161b'); g.addColorStop(1, '#0d2a2f');
    t.fillStyle = g; t.fillRect(0, 0, 62, TILE_H);
    t.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const x = 3 + R() * 46, y = R() * TILE_H, len = 7 + R() * 14;
      t.strokeStyle = `rgba(140,200,205,${0.06 + R() * 0.1})`;
      both(y, yy => { t.beginPath(); t.moveTo(x, yy); t.quadraticCurveTo(x + len / 2, yy - 2.5, x + len, yy); t.stroke(); });
    }
    for (let i = 0; i < 5; i++) { // waterlelieblaadjes
      const x = 8 + R() * 40, y = R() * TILE_H, r = 4 + R() * 4;
      both(y, yy => { t.fillStyle = '#183a24'; t.beginPath(); t.arc(x, yy, r, 0.4, Math.PI * 2); t.lineTo(x, yy); t.fill(); });
    }
    // berm links
    t.fillStyle = '#16220f'; t.fillRect(58, 0, 24, TILE_H);
    for (let i = 0; i < 70; i++) {
      const x = 55 + R() * 14, y = R() * TILE_H;
      t.strokeStyle = R() < 0.5 ? '#2c3d17' : '#41522a';
      both(y, yy => {
        t.beginPath();
        t.moveTo(x, yy); t.lineTo(x - 3, yy - 7);
        t.moveTo(x, yy); t.lineTo(x + 2, yy - 8);
        t.moveTo(x, yy); t.lineTo(x + 5, yy - 5);
        t.stroke();
      });
    }
    // dijkpad
    t.fillStyle = '#3a3023'; t.fillRect(80, 0, 200, TILE_H);
    for (let i = 0; i < 900; i++) {
      const x = 80 + R() * 200, y = R() * TILE_H;
      t.fillStyle = R() < 0.5 ? '#2e2619' : '#4a3d2b';
      t.fillRect(x, y, 1 + R() * 2, 1 + R() * 2);
    }
    t.fillStyle = 'rgba(18,13,7,0.22)'; // karrensporen
    for (let l = 0; l < 3; l++) { t.fillRect(laneX(l) - 15, 0, 6, TILE_H); t.fillRect(laneX(l) + 9, 0, 6, TILE_H); }
    for (let i = 0; i < 4; i++) { // plassen
      const x = 95 + R() * 170, y = R() * TILE_H, rx = 9 + R() * 12, ry = 4 + R() * 5;
      both(y, yy => {
        t.fillStyle = 'rgba(30,42,44,0.55)'; t.beginPath(); t.ellipse(x, yy, rx, ry, 0, 0, Math.PI * 2); t.fill();
        t.strokeStyle = 'rgba(160,190,200,0.18)'; t.beginPath(); t.ellipse(x, yy, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.7); t.stroke();
      });
    }
    // rafelige randen van het pad
    for (let y = 0; y < TILE_H; y += 6) {
      t.fillStyle = '#16220f';
      t.fillRect(80, y, 2 + R() * 4, 6);
      t.fillRect(ROAD_R - 2 - R() * 4, y, 6, 6);
    }
    // hekpaaltjes met draad langs de sloot
    t.strokeStyle = 'rgba(150,150,140,0.35)';
    t.beginPath(); t.moveTo(74, 0); t.lineTo(74, TILE_H); t.stroke();
    for (let y = 0; y < TILE_H; y += 64) { t.fillStyle = '#2a1f14'; t.fillRect(72, y, 4, 4); }
    // berm rechts en maïs
    t.fillStyle = '#18230e'; t.fillRect(280, 0, 14, TILE_H);
    t.fillStyle = '#1b220e'; t.fillRect(292, 0, W - 292, TILE_H);
    const leaf = ['#4b5a21', '#666627', '#38431a', '#58622a'];
    for (let x = 298; x < W + 4; x += 10) {
      for (let y0 = R() * 10; y0 < TILE_H; y0 += 11 + R() * 5) {
        const xx = x + R() * 4 - 2;
        both(y0, yy => {
          for (let j = 0; j < 4; j++) {
            const a = R() * Math.PI * 2, l = 5 + R() * 7;
            t.strokeStyle = leaf[(R() * leaf.length) | 0];
            t.lineWidth = 1.6;
            t.beginPath(); t.moveTo(xx, yy); t.quadraticCurveTo(xx + Math.cos(a) * l * 0.6 + 2, yy + Math.sin(a) * l * 0.6, xx + Math.cos(a) * l, yy + Math.sin(a) * l); t.stroke();
          }
          t.fillStyle = '#75702f'; t.fillRect(xx - 1, yy - 1, 2, 2);
        });
      }
    }
    t.lineWidth = 1;
  }

  function makeFog() {
    fogSprite = document.createElement('canvas');
    fogSprite.width = fogSprite.height = 128;
    const f = fogSprite.getContext('2d');
    const g = f.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(200,215,225,1)');
    g.addColorStop(1, 'rgba(200,215,225,0)');
    f.fillStyle = g; f.fillRect(0, 0, 128, 128);
  }

  // ---------- geluid ----------
  const Sound = (() => {
    let ac = null, master = null, bed = null, noiseBuf = null;
    let muted = store.get('muted', false) === true;
    function init() {
      if (ac) { wake(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* oudere iOS */ }
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // ondergrond: lage drone en wind
      bed = ac.createGain(); bed.gain.value = 0; bed.connect(master);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.connect(bed);
      for (const f of [55, 55.6, 82.4]) {
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const g = ac.createGain(); g.gain.value = f > 80 ? 0.025 : 0.05;
        o.connect(g); g.connect(lp); o.start();
      }
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.08;
      const lfoG = ac.createGain(); lfoG.gain.value = 90;
      lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
      const wind = ac.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
      const wg = ac.createGain(); wg.gain.value = 0.05;
      const wl = ac.createOscillator(); wl.frequency.value = 0.13;
      const wlg = ac.createGain(); wlg.gain.value = 0.035;
      wl.connect(wlg); wlg.connect(wg.gain); wl.start();
      wind.connect(bp); bp.connect(wg); wg.connect(bed); wind.start();
    }
    function wake() {
      if (ac && ac.state !== 'running' && ac.state !== 'closed') { const r = ac.resume(); if (r && r.catch) r.catch(() => {}); }
    }
    function env(node, t0, a, peak, dec) {
      node.gain.setValueAtTime(0.0001, t0);
      node.gain.exponentialRampToValueAtTime(peak, t0 + a);
      node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
    }
    function tone(type, f0, f1, peak, dec, delay = 0) {
      if (!ac || muted) return;
      const t0 = ac.currentTime + delay;
      const o = ac.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dec);
      const g = ac.createGain(); env(g, t0, 0.008, peak, dec);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dec + 0.05);
    }
    function noise(freq, q, peak, dec, delay = 0, type = 'bandpass') {
      if (!ac || muted) return;
      const t0 = ac.currentTime + delay;
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); env(g, t0, 0.01, peak, dec);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t0, Math.random()); s.stop(t0 + dec + 0.05);
    }
    return {
      init,
      get muted() { return muted; },
      toggle() {
        muted = !muted; store.set('muted', muted);
        if (master) master.gain.value = muted ? 0 : 0.7;
        return muted;
      },
      bed(on) { if (bed && ac) bed.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.6); },
      suspend() { if (ac && ac.state === 'running') { const r = ac.suspend(); if (r && r.catch) r.catch(() => {}); } },
      resume: wake,
      coin() { tone('triangle', 880, 1320, 0.12, 0.12); },
      loot() { [660, 880, 1320].forEach((f, i) => tone('triangle', f, f, 0.12, 0.18, i * 0.07)); },
      jump() { noise(900, 0.8, 0.12, 0.18); tone('sine', 220, 440, 0.06, 0.15); },
      land() { noise(300, 1, 0.08, 0.1); },
      beat() { tone('sine', 62, 45, 0.25, 0.16); tone('sine', 60, 42, 0.16, 0.14, 0.17); },
      splash() { noise(1300, 0.7, 0.3, 0.45); noise(400, 0.8, 0.2, 0.3, 0.05); },
      growl() { tone('sawtooth', 90, 60, 0.12, 0.5); },
      buzz() { for (let i = 0; i < 4; i++) tone('square', 120, 118, 0.04, 0.08, i * 0.22); },
      creak() { tone('sawtooth', 75, 55, 0.12, 0.6); noise(200, 2, 0.1, 0.5); },
      ghost() { tone('sine', 520, 380, 0.05, 1.2); tone('sine', 523, 392, 0.04, 1.2, 0.05); },
      milestone() { tone('sine', 196, 196, 0.12, 1.4); tone('sine', 294, 294, 0.08, 1.4, 0.02); },
      death() {
        noise(200, 0.5, 0.5, 0.9, 0, 'lowpass');
        tone('sawtooth', 220, 55, 0.25, 0.9);
        tone('sawtooth', 233, 58, 0.2, 0.9);
        tone('square', 932, 466, 0.06, 0.5);
      },
    };
  })();

  // ---------- spelstaat ----------
  let mode = 'title'; // title | play | dying | over
  let paused = false;
  let G = null;
  const fog = [];
  function newGame() {
    G = {
      dist: 0, speed: 230, lane: 1, px: laneX(1), jt: -1, jumpQueued: false,
      loot: 0, coins: 0, objs: [], parts: [], spawnD: 520, nextSign: 100,
      time: 0, banners: [], nextMilestone: 0, blackT: rnd(4, 8), blackPhase: null, blackClock: 0, light: 1,
      shake: 0, flash: 0, dieT: 0, killer: '', hints: {}, runPhase: 0, beatT: 0, god: false, firstDark: true,
    };
    fog.length = 0;
    for (let i = 0; i < 6; i++) fog.push({ x: rnd(-40, W + 40), y: rnd(-80, H), r: rnd(70, 140), vx: rnd(-6, 6), par: rnd(0.35, 0.7), a: rnd(0.04, 0.09) });
  }
  const meters = () => Math.floor(G.dist / PX_PER_M);
  const score = () => meters() + G.loot;

  // ---------- spawnen ----------
  function coinRow(d, lane) {
    for (let i = 0; i < 3; i++) {
      let kind = 'coin';
      if (i === 1) { const r = Math.random(); if (r < 0.04) kind = 'vase'; else if (r < 0.1) kind = 'cheese'; }
      G.objs.push({ type: 'coin', kind, lane, x: laneX(lane), d: d + i * 24, spin: rnd(0, 6) });
    }
  }
  function spawnPattern(d) {
    const md = d / PX_PER_M;
    const sp = Math.min(560, 230 + md * 0.42);
    const gap = sp * rnd(0.62, 0.95) + 70;
    if (md < 14) { coinRow(d, rndInt(0, 2)); return gap; }
    const type = weighted([
      ['bale', 3],
      ['bale2', md > 60 ? 2.5 : 0],
      ['fence', md > 150 ? 1.2 : 0],
      ['wolf', md > 80 ? (md > 350 ? 2 : 1.5) : 0],
      ['crow', md > 200 ? 2 : 0],
      ['ghost', md > 600 ? 1.4 : 0],
    ]);
    if (type === 'bale') {
      const l = rndInt(0, 2);
      G.objs.push({ type: 'bale', lane: l, x: laneX(l), d });
    } else if (type === 'bale2') {
      const free = rndInt(0, 2);
      for (let l = 0; l < 3; l++) if (l !== free) G.objs.push({ type: 'bale', lane: l, x: laneX(l), d });
    } else if (type === 'fence') {
      G.objs.push({ type: 'fence', x: 180, d });
    } else if (type === 'wolf') {
      G.objs.push({ type: 'wolf', d, maxLane: md > 350 && chance(0.5) ? 1 : 0, st: 'lurk', t: 0, x: 26, rip: 0 });
    } else if (type === 'crow') {
      const l = rndInt(0, 2);
      G.objs.push({ type: 'crow', lane: l, x: laneX(l), d, flare: 0 });
    } else if (type === 'ghost') {
      G.objs.push({ type: 'ghost', x: 180, d, ph: rnd(0, Math.PI * 2), sang: false });
    }
    if (chance(0.7)) coinRow(d + gap * 0.5 - 24, rndInt(0, 2));
    return gap;
  }

  // ---------- besturing ----------
  function move(dir) {
    if (mode !== 'play' || paused) return;
    G.lane = clamp(G.lane + dir, 0, 2);
  }
  function jump() {
    if (mode !== 'play' || paused) return;
    if (G.jt < 0) { G.jt = 0; Sound.jump(); }
    else if (G.jt > 0.45) G.jumpQueued = true;
  }
  let ptr = null;
  wrap.addEventListener('pointerdown', e => {
    if (e.target.closest('button, a, textarea, input')) return;
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), done: false };
  });
  wrap.addEventListener('pointermove', e => {
    if (!ptr || ptr.id !== e.pointerId || ptr.done) return;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    const th = 26;
    if (Math.abs(dx) > th && Math.abs(dx) > Math.abs(dy)) { move(dx > 0 ? 1 : -1); ptr.done = true; }
    else if (dy < -th && -dy > Math.abs(dx)) { jump(); ptr.done = true; }
    else if (dy > th * 1.5) { ptr.done = true; } // omlaag vegen doet niets
  });
  const endPtr = e => {
    if (!ptr || ptr.id !== e.pointerId) return;
    const quick = performance.now() - ptr.t < 300;
    const dist = Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y);
    if (!ptr.done && quick && dist < 16 && e.type === 'pointerup') jump();
    ptr = null;
  };
  wrap.addEventListener('pointerup', endPtr);
  wrap.addEventListener('pointercancel', endPtr);
  window.addEventListener('keydown', e => {
    if (window.DashBoard && window.DashBoard.open) return; // scorebord open
    const c = e.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(c)) e.preventDefault();
    if (e.repeat) return;
    if ((c === 'Space' || c === 'Enter') && e.target.closest && e.target.closest('a, button, textarea, input')) {
      // de knop doet zelf al wat hij moet doen; spatie mag geen knop indrukken tijdens het spel
      if (mode === 'play' && !paused) { e.preventDefault(); e.target.blur(); jump(); }
      return;
    }
    if (mode === 'title' && (c === 'Space' || c === 'Enter')) { start(); return; }
    if (mode === 'over' && (c === 'Space' || c === 'Enter') && !$('over').classList.contains('wait')) { start(); return; }
    if (c === 'KeyM') { toggleMute(); return; }
    if (mode === 'play' && (c === 'Escape' || c === 'KeyP')) { setPaused(!paused); return; }
    if (paused && (c === 'Space' || c === 'Enter')) { setPaused(false); return; }
    if (c === 'ArrowLeft' || c === 'KeyA') move(-1);
    else if (c === 'ArrowRight' || c === 'KeyD') move(1);
    else if (c === 'ArrowUp' || c === 'KeyW' || c === 'Space') jump();
  });

  // ---------- schermen ----------
  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  function start() {
    Sound.init();
    Sound.bed(true);
    newGame();
    if (window.DashBoard) window.DashBoard.runStart();
    mode = 'play';
    paused = false;
    show('title', false); show('over', false); show('pause', false); show('hud', true);
    banner('RUN!', 'Swipe ← → to dodge · ↑ or tap to jump', 2.6);
  }
  function setPaused(p) {
    if (mode !== 'play') return;
    paused = p;
    show('pause', p);
    if (p) Sound.suspend(); else { Sound.resume(); last = performance.now(); }
  }
  function toggleMute() {
    if (!paused) Sound.init();
    const m = Sound.toggle();
    $('muteBtn').textContent = m ? '🔇' : '🔊';
  }
  const KILLERS = {
    bale: 'You tripped over a hay bale.',
    fence: 'The fence stopped you cold.',
    wolf: 'The Waterwolf dragged you into the ditch.',
    crow: 'The scarecrow got you in the dark.',
    ghost: 'The White Lady caught you.',
  };
  function die(type) {
    if (G.god) return;
    mode = 'dying';
    G.dieT = 0;
    G.killer = type;
    G.shake = 1; G.flash = 1;
    Sound.death();
    try { if (navigator.vibrate) navigator.vibrate([80, 40, 160]); } catch (e) { /* niet ondersteund */ }
  }
  function gameOver() {
    mode = 'over';
    G.banners = []; // geen losse teksten achter het eindscherm
    Sound.bed(false);
    const m = meters(), s = score();
  { const sb = store.get('best', null); if (sb && typeof sb.score === 'number' && sb.score > best.score) best = { score: sb.score, meters: Math.max(sb.meters || 0, best.meters) }; }
    const isBest = s > best.score;
    if (isBest) best = { score: s, meters: Math.max(m, best.meters) };
    else if (m > best.meters) best.meters = m;
    store.set('best', best);
    if (window.DashBoard) window.DashBoard.runEnd({ score: s, meters: m, loot: G.loot, coins: G.coins });
    $('killer').textContent = KILLERS[G.killer] || 'Caught!';
    $('oMeters').textContent = m;
    $('oScore').textContent = s;
    show('newBest', isBest && s > 0);
    $('oBest').textContent = `Best: ${best.score} points · ${best.meters} m`;
    show('shareBox', false);
    $('shareBtn').textContent = 'Share my score';
    show('hud', false);
    const over = $('over');
    over.classList.add('wait');
    show('over', true);
    setTimeout(() => over.classList.remove('wait'), 700); // niet per ongeluk wegtikken
  }
  function shareText() {
    return `I ran ${meters()} m on the haunted dike in POLDER DASH 🌊 Can you beat me?`;
  }
  async function share() {
    const url = location.href.split('#')[0].split('?')[0];
    const text = shareText();
    if (navigator.share) {
      try { await navigator.share({ title: 'Polder Dash', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const full = text + ' ' + url;
    try {
      await navigator.clipboard.writeText(full);
      $('shareBtn').textContent = 'Copied! Paste it anywhere';
    } catch (e) {
      const box = $('shareBox');
      box.value = full; show('shareBox', true); box.focus(); box.select();
    }
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; show('toast', true);
    clearTimeout(toast.h); toast.h = setTimeout(() => show('toast', false), 1600);
  }
  $('playBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);
  $('shareBtn').addEventListener('click', share);
  $('pauseBtn').addEventListener('click', e => { e.currentTarget.blur(); setPaused(true); });
  $('resumeBtn').addEventListener('click', () => setPaused(false));
  $('quitBtn').addEventListener('click', () => { paused = false; mode = 'title'; Sound.bed(false); Sound.resume(); show('pause', false); show('hud', false); toTitle(); });
  $('muteBtn').addEventListener('click', e => { e.currentTarget.blur(); toggleMute(); });
  $('muteBtn').textContent = Sound.muted ? '🔇' : '🔊';
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (mode === 'play' && !paused) setPaused(true); else Sound.suspend(); }
    else if (mode !== 'play' || !paused) Sound.resume();
  });
  window.addEventListener('blur', () => { if (mode === 'play' && !paused) setPaused(true); });
  // iOS: dubbel tikken mag niet inzoomen
  wrap.addEventListener('touchend', e => { if (!e.target.closest('a, button, textarea, input')) e.preventDefault(); }, { passive: false });
  function toTitle() {
    newGame();
    show('title', true);
    $('bestTitle').textContent = best.score > 0 ? `Your best: ${best.score} points · ${best.meters} m` : '';
  }

  // ---------- banners en deeltjes ----------
  function banner(text, sub, dur = 2.4) {
    // nieuwe tekst wint: oude teksten snel laten verdwijnen, anders lopen ze door elkaar
    for (const b of G.banners) b.dur = Math.min(b.dur, b.t + 0.2);
    G.banners.push({ text, sub, t: 0, dur });
  }
  function hint(key, text, sub) { if (G.hints[key]) return; G.hints[key] = true; banner(text, sub, 2.4); }
  const MILESTONES = [[100, 'THE FOG ROLLS IN'], [250, 'THE DIKE IS CRACKING'], [500, "THEY KNOW YOU'RE HERE"], [750, "DON'T LOOK BACK"], [1000, 'LEGEND OF THE POLDER']];
  function part(x, y, vx, vy, life, color, size, world = true) {
    if (G.parts.length > 220) return;
    G.parts.push({ x, y, vx, vy, life, max: life, color, size, world });
  }

  // ---------- update ----------
  function update(rdt) {
    let dt = rdt;
    if (mode === 'dying') {
      G.dieT += rdt;
      dt = rdt * 0.2;
      if (G.dieT > 0.95) { gameOver(); return; }
    }
    G.time += dt;
    G.shake = Math.max(0, G.shake - rdt * 1.6);
    G.flash = Math.max(0, G.flash - rdt * 2.2);

    if (mode === 'title') {
      G.dist += 110 * dt;
      G.runPhase += dt * 9;
    } else {
      const m = G.dist / PX_PER_M;
      G.speed = Math.min(560, 230 + m * 0.42);
      G.dist += G.speed * dt;
      G.runPhase += dt * (8 + G.speed / 40);

      // speler
      const tx = laneX(G.lane), dx = tx - G.px, step = 1500 * dt;
      G.px = Math.abs(dx) <= step ? tx : G.px + Math.sign(dx) * step;
      if (G.jt >= 0) {
        G.jt += dt / JUMP_TIME;
        if (G.jt >= 1) {
          G.jt = -1;
          Sound.land();
          for (let i = 0; i < 6; i++) part(G.px + rnd(-8, 8), PY + 6, rnd(-40, 40), rnd(-20, 10), 0.4, '#6b5a40', 2);
          if (G.jumpQueued) { G.jumpQueued = false; G.jt = 0; Sound.jump(); }
        }
      }
      if (chance(dt * 14)) part(G.px + rnd(-5, 5), PY + 8, rnd(-15, 15), rnd(10, 30), 0.35, 'rgba(110,95,70,0.8)', 1.5);

      // hartslag die sneller gaat
      if (mode === 'play') {
        G.beatT -= dt;
        if (G.beatT <= 0) { Sound.beat(); G.beatT = 60 / (64 + Math.min(70, m / 10)); }
      }

      // spawnen
      while (G.spawnD < G.dist + PY + 140) G.spawnD += spawnPattern(G.spawnD);
      while (G.nextSign * PX_PER_M < G.dist + PY + 140) {
        G.objs.push({ type: 'sign', d: G.nextSign * PX_PER_M, label: String(G.nextSign) });
        G.nextSign += 100;
      }

      // mijlpalen
      const ms = MILESTONES[G.nextMilestone];
      const target = ms ? ms[0] : 1000 + (G.nextMilestone - MILESTONES.length + 1) * 500;
      if (m >= target) {
        if (ms) banner(`${target} m`, ms[1], 2.6); else banner(`${target} m!`, 'Still running...', 2.4);
        Sound.milestone();
        G.nextMilestone++;
      }

      // blackouts: de zaklamp valt uit en de vogelverschrikkers schuiven op
      if (m > 200) {
        if (G.blackPhase === null) {
          G.blackT -= dt;
          if (G.blackT <= 0) { G.blackPhase = 'flicker'; G.blackClock = 0; Sound.buzz(); }
          G.light = Math.min(1, G.light + dt * 4);
        } else if (G.blackPhase === 'flicker') {
          G.blackClock += dt;
          G.light = 0.7 + 0.3 * Math.cos(G.blackClock * Math.PI * 2 * 3.5);
          if (G.blackClock > 0.9) {
            G.blackPhase = 'dark'; G.blackClock = 0;
            let moved = false;
            for (const o of G.objs) {
              if (o.type === 'crow' && o.y < PY - Math.max(120, G.speed * 0.6) && o.y > -40 && o.lane !== G.lane) {
                o.lane += Math.sign(G.lane - o.lane); o.flare = 1; moved = true;
              }
            }
            if (moved) Sound.creak();
            if (G.firstDark) { G.firstDark = false; banner('LIGHTS OUT', 'In the dark, the scarecrows move...', 2.6); }
          }
        } else {
          G.blackClock += dt;
          G.light = Math.max(0.1, G.light - dt * 6);
          if (G.blackClock > 1.1) { G.blackPhase = null; G.blackT = rnd(12, 20); }
        }
      }
    }

    // objecten
    const z = G.jt >= 0 ? Math.sin(Math.PI * G.jt) : 0;
    const air = z > 0.32;
    for (const o of G.objs) {
      if (o.type === 'ghost' && mode !== 'title') o.d -= 40 * dt;
      o.y = PY - (o.d - G.dist);
      if (o.type === 'wolf') {
        if (o.st === 'lurk') {
          o.rip += dt;
          const reach = o.maxLane === 1 ? 140 : 52; // de grote wolf geeft rimpelingen tot over de eerste baan
          if (o.y > -20 && chance(dt * (o.maxLane === 1 ? 18 : 10))) part(rnd(10, reach), o.y + rnd(-10, 10), 0, 0, 0.8, 'ripple', rnd(4, 9));
          if (o.y > -20 && !G.hints.wolf) hint('wolf', 'RIPPLES IN THE DITCH', 'Something is in the water... move right!');
          else if (o.y > -20 && o.maxLane === 1 && !G.hints.wolf2) hint('wolf2', 'BIG RIPPLES!', 'This one reaches further... go FAR right!');
          if (o.y > PY - 230) { o.st = 'lunge'; o.t = 0; Sound.splash(); Sound.growl(); for (let i = 0; i < 14; i++) part(rnd(20, 60), o.y + rnd(-8, 8), rnd(30, 160), rnd(-60, 60), 0.6, 'rgba(150,200,210,0.9)', rnd(1.5, 3)); }
        } else if (o.st === 'lunge') {
          o.t = Math.min(1, o.t + dt / 0.2);
          o.x = lerp(26, laneX(o.maxLane) + 6, easeOut(o.t));
          if (o.t >= 1) o.st = 'out';
        } else if (o.st === 'out') {
          if (o.y > PY + 70) { o.st = 'back'; o.t = 0; }
        } else if (o.st === 'back') {
          o.t = Math.min(1, o.t + dt / 0.4);
          o.x = lerp(laneX(o.maxLane) + 6, 26, o.t);
        }
      } else if (o.type === 'crow') {
        const tx = laneX(o.lane), dx = tx - o.x;
        o.x = Math.abs(dx) < 900 * dt ? tx : o.x + Math.sign(dx) * 900 * dt;
        o.flare = Math.max(0, o.flare - dt * 0.8);
      } else if (o.type === 'ghost') {
        o.x = 180 + Math.sin(o.ph + G.time * 1.7) * 88;
        if (!o.sang && o.y > 0) { o.sang = true; Sound.ghost(); hint('ghost', 'THE WHITE LADY', 'She drifts side to side... time it!'); }
      } else if (o.type === 'fence' && o.y > PY - 330) {
        hint('fence', 'FENCE AHEAD', 'Swipe ↑ or tap to JUMP!');
      } else if (o.type === 'coin') {
        o.spin += dt * 5;
      }

      if (mode !== 'play' || o.dead) continue;
      const dy = Math.abs(o.y - PY);
      switch (o.type) {
        case 'coin':
          if (dy < 18 && Math.abs(o.x - G.px) < 22) {
            o.dead = true;
            const pts = o.kind === 'vase' ? 50 : o.kind === 'cheese' ? 25 : 5;
            G.loot += pts; G.coins++;
            if (o.kind === 'coin') Sound.coin(); else { Sound.loot(); banner(o.kind === 'vase' ? 'DELFT VASE!' : 'CHEESE!', `+${pts}`, 1.2); }
            for (let i = 0; i < 8; i++) part(o.x, o.y, rnd(-60, 60), rnd(-80, 20), 0.45, o.kind === 'vase' ? '#9ec3ff' : '#f2c14e', 2, false);
          }
          break;
        case 'bale': if (dy < 24 && Math.abs(o.x - G.px) < 29 && !air) die('bale'); break;
        case 'fence': if (dy < 15 && !air) die('fence'); break;
        case 'wolf': if ((o.st === 'lunge' || o.st === 'out') && dy < 22 && G.px < o.x + 24) die('wolf'); break;
        case 'crow': if (dy < 22 && Math.abs(o.x - G.px) < 26) die('crow'); break;
        case 'ghost': if (dy < 24 && Math.abs(o.x - G.px) < 24) die('ghost'); break;
      }
    }
    G.objs = G.objs.filter(o => !o.dead && o.y < H + 90);

    // deeltjes
    for (const p of G.parts) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.world && mode !== 'title') p.y += G.speed * dt;
      else if (p.world) p.y += 110 * dt;
    }
    G.parts = G.parts.filter(p => p.life > 0 && p.y < H + 20);

    // mist
    const sp = mode === 'title' ? 110 : G.speed;
    for (const f of fog) {
      f.y += sp * f.par * dt; f.x += f.vx * dt;
      if (f.y - f.r > H) { f.y = -f.r - rnd(0, 100); f.x = rnd(-40, W + 40); }
    }
    for (const b of G.banners) b.t += rdt;
    G.banners = G.banners.filter(b => b.t < b.dur);
  }

  // ---------- tekenen ----------
  function shadow(x, y, rx, ry, a = 0.35) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawPlayer() {
    const z = G.jt >= 0 ? Math.sin(Math.PI * G.jt) : 0;
    const x = G.px, y = PY;
    shadow(x + z * 6, y + 6, 11 - z * 3, 6 - z * 2, 0.4 - z * 0.15);
    ctx.save();
    ctx.translate(x, y - z * 20);
    const s = 1 + z * 0.28;
    ctx.scale(s, s);
    const ph = Math.sin(G.runPhase);
    // benen (laarzen)
    ctx.fillStyle = '#1b1f22';
    if (z < 0.1) {
      ctx.fillRect(-6, 4 + ph * 5, 4, 7);
      ctx.fillRect(2, 4 - ph * 5, 4, 7);
    } else {
      ctx.fillRect(-6, 5, 4, 6); ctx.fillRect(2, 5, 4, 6);
    }
    // armen
    ctx.fillStyle = '#c99a2c';
    ctx.beginPath(); ctx.ellipse(-10, -1 - ph * 4, 3, 5, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -3 + ph * 2, 3, 5, -0.2, 0, Math.PI * 2); ctx.fill();
    // regenjas
    ctx.fillStyle = '#e2b23a';
    ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(-3, -3, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
    // capuchon
    ctx.fillStyle = '#c99528';
    ctx.beginPath(); ctx.arc(0, -6, 6.5, 0, Math.PI * 2); ctx.fill();
    // zaklamp
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(8, -14, 4, 7);
    ctx.fillStyle = '#fff6cc'; ctx.fillRect(8, -16, 4, 2.5);
    ctx.restore();
  }
  function drawBale(o) {
    shadow(o.x + 3, o.y + 9, 24, 9);
    const x = o.x - 21, y = o.y - 14;
    ctx.fillStyle = '#a7822f';
    roundRect(x, y, 42, 28, 6); ctx.fill();
    ctx.fillStyle = '#c9a046';
    roundRect(x, y, 42, 20, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(90,65,20,0.6)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 3, y + i * 5); ctx.lineTo(x + 39, y + i * 5); ctx.stroke(); }
    ctx.strokeStyle = '#5b3f17'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 13, y); ctx.lineTo(x + 13, y + 28); ctx.moveTo(x + 29, y); ctx.lineTo(x + 29, y + 28); ctx.stroke();
    ctx.lineWidth = 1;
  }
  function drawFence(o) {
    shadow(180, o.y + 8, 104, 6, 0.3);
    ctx.fillStyle = '#4c3520';
    ctx.fillRect(ROAD_L - 4, o.y - 7, 208, 5);
    ctx.fillStyle = '#5e4429';
    ctx.fillRect(ROAD_L - 4, o.y + 1, 208, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(ROAD_L - 4, o.y - 7, 208, 1.5);
    ctx.fillStyle = '#2f2014';
    for (const x of [ROAD_L - 2, ROAD_L + LANE_W, ROAD_L + LANE_W * 2, ROAD_R - 4]) ctx.fillRect(x - 3, o.y - 11, 7, 20);
    // wit-rood bordje: ga eroverheen
    ctx.fillStyle = '#d8d2c4'; ctx.fillRect(173, o.y - 12, 14, 9);
    ctx.fillStyle = '#b8352b'; ctx.fillRect(173, o.y - 9, 14, 3);
  }
  function drawWolf(o) {
    if (o.st === 'lurk') {
      // alleen een schaduw onder water
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      if (o.maxLane === 1) { ctx.beginPath(); ctx.ellipse(34, o.y, 28, 11, 0, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(30, o.y, 18, 8, 0, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    const x = o.x, y = o.y;
    // natte sleep vanaf de sloot, zodat je ziet dat de hele strook gevaarlijk is
    if (x - 46 > 50) {
      ctx.fillStyle = 'rgba(70,110,115,0.35)';
      ctx.beginPath(); ctx.ellipse((50 + x - 46) / 2, y, (x - 96) / 2 + 6, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    shadow(x - 8, y + 9, 30, 9);
    ctx.save();
    ctx.translate(x, y);
    // lijf (naar rechts gericht, staart in het water)
    ctx.fillStyle = '#2f443c';
    ctx.beginPath(); ctx.ellipse(-22, 0, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d5a50';
    ctx.beginPath(); ctx.ellipse(-24, -3, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
    // poten
    ctx.fillStyle = '#24332d';
    ctx.fillRect(-10, -14, 6, 6); ctx.fillRect(-10, 8, 6, 6);
    // kop
    ctx.fillStyle = '#34493f';
    ctx.beginPath(); ctx.ellipse(6, 0, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14, -6); ctx.lineTo(26, -2); ctx.lineTo(26, 3); ctx.lineTo(14, 7); ctx.fill();
    // oren
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(4, -17); ctx.lineTo(8, -8); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(4, 17); ctx.lineTo(8, 8); ctx.fill();
    // bek open
    ctx.fillStyle = '#7a1d1d';
    ctx.beginPath(); ctx.moveTo(18, -1); ctx.lineTo(27, -3); ctx.lineTo(27, 4); ctx.lineTo(18, 2); ctx.fill();
    ctx.fillStyle = '#e8e2d0';
    for (let i = 0; i < 3; i++) ctx.fillRect(19 + i * 2.6, -1.5, 1.2, 1.6);
    // nat glimmen
    ctx.strokeStyle = 'rgba(160,210,215,0.35)';
    ctx.beginPath(); ctx.ellipse(-22, 0, 24, 10, 0, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
    ctx.restore();
  }
  function drawCrow(o) {
    const x = o.x, y = o.y;
    shadow(x + 4, y + 10, 22, 7);
    ctx.fillStyle = '#3a2b1c'; // paal
    ctx.fillRect(x - 2, y - 2, 4, 14);
    ctx.strokeStyle = '#4a3622'; ctx.lineWidth = 3.5; // armen
    ctx.beginPath(); ctx.moveTo(x - 21, y - 4); ctx.lineTo(x + 21, y - 4); ctx.stroke(); ctx.lineWidth = 1;
    // lompen
    ctx.fillStyle = '#4f3a2a';
    ctx.beginPath(); ctx.moveTo(x - 13, y - 8); ctx.lineTo(x + 13, y - 8); ctx.lineTo(x + 10, y + 10); ctx.lineTo(x + 4, y + 6); ctx.lineTo(x, y + 12); ctx.lineTo(x - 5, y + 6); ctx.lineTo(x - 11, y + 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a4d35'; ctx.fillRect(x - 6, y - 4, 6, 5);
    // stro
    ctx.strokeStyle = '#c9a646';
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(x + sx * 20, y - 4); ctx.lineTo(x + sx * (24 + i), y - 8 + i * 3); ctx.stroke();
    }
    // hoed
    ctx.fillStyle = '#1f1610';
    ctx.beginPath(); ctx.ellipse(x, y - 12, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2c2017';
    ctx.beginPath(); ctx.ellipse(x, y - 14, 7.5, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawGhost(o) {
    const x = o.x, y = o.y, t = G.time;
    const g = ctx.createRadialGradient(x, y, 2, x, y, 34);
    g.addColorStop(0, 'rgba(235,245,255,0.55)');
    g.addColorStop(1, 'rgba(235,245,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(240,246,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 2);
    ctx.quadraticCurveTo(x - 13, y - 16, x, y - 17);
    ctx.quadraticCurveTo(x + 13, y - 16, x + 12, y + 2);
    for (let i = 0; i <= 4; i++) {
      const xx = x + 12 - i * 6;
      ctx.lineTo(xx, y + 14 + Math.sin(t * 6 + i) * 4 + (i % 2) * 4);
    }
    ctx.closePath(); ctx.fill();
  }
  function drawCoin(o) {
    const x = o.x, y = o.y + Math.sin(o.spin * 0.6) * 1.5;
    if (o.kind === 'coin') {
      const w = Math.abs(Math.cos(o.spin)) * 6 + 1;
      ctx.fillStyle = '#a07a1e';
      ctx.beginPath(); ctx.ellipse(x, y, w, 6.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, w - 1.5), 5, 0, 0, Math.PI * 2); ctx.fill();
    } else if (o.kind === 'vase') {
      shadow(x + 2, y + 9, 8, 3);
      ctx.fillStyle = '#eef3fb';
      ctx.beginPath(); ctx.moveTo(x - 3, y - 11); ctx.lineTo(x + 3, y - 11); ctx.quadraticCurveTo(x + 11, y, x + 4, y + 9); ctx.lineTo(x - 4, y + 9); ctx.quadraticCurveTo(x - 11, y, x - 3, y - 11); ctx.fill();
      ctx.strokeStyle = '#2b5cc4'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.moveTo(x - 6, y + 5); ctx.lineTo(x + 6, y + 5); ctx.moveTo(x - 4, y - 7); ctx.lineTo(x + 4, y - 7); ctx.stroke();
      ctx.lineWidth = 1;
    } else {
      shadow(x + 2, y + 7, 10, 3);
      ctx.fillStyle = '#f0c13a';
      ctx.beginPath(); ctx.moveTo(x - 10, y + 6); ctx.lineTo(x + 10, y + 6); ctx.lineTo(x + 7, y - 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8971f';
      for (const [hx, hy] of [[-3, 2], [3, 3], [5, -3]]) { ctx.beginPath(); ctx.arc(x + hx, y + hy, 1.5, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  function drawSign(o) {
    const x = 68, y = o.y;
    shadow(x + 2, y + 6, 8, 3);
    ctx.fillStyle = '#3a2b1c'; ctx.fillRect(x - 1.5, y - 4, 3, 10);
    ctx.fillStyle = '#d9d5c7'; roundRect(x - 13, y - 14, 26, 11, 2); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(o.label + ' m', x, y - 8.5);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawDarkness() {
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, dark.width, dark.height);
    dctx.setTransform(k / 2, 0, 0, k / 2, 0, 0);
    const L = G.light;
    const base = lerp(0.96, 0.6, L);
    const g0 = dctx.createLinearGradient(0, 0, 0, H);
    g0.addColorStop(0, `rgba(3,6,11,${Math.min(1, base + 0.06)})`);
    g0.addColorStop(1, `rgba(3,6,11,${base})`);
    dctx.fillStyle = g0;
    dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = 'destination-out';
    const z = G.jt >= 0 ? Math.sin(Math.PI * G.jt) : 0;
    const px = G.px, py = PY - z * 20;
    // licht rond de speler
    let g = dctx.createRadialGradient(px, py, 0, px, py, 30 + 50 * L);
    g.addColorStop(0, `rgba(0,0,0,${0.95 * Math.max(0.3, L)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.beginPath(); dctx.arc(px, py, 30 + 50 * L, 0, Math.PI * 2); dctx.fill();
    // zaklampkegel naar voren
    if (L > 0.15) {
      const len = 360 * L;
      g = dctx.createLinearGradient(0, py, 0, py - len);
      g.addColorStop(0, `rgba(0,0,0,${0.9 * L})`);
      g.addColorStop(0.6, `rgba(0,0,0,${0.55 * L})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g;
      dctx.beginPath();
      dctx.moveTo(px - 8, py - 6);
      dctx.lineTo(px - 125, py - len);
      dctx.lineTo(px + 125, py - len);
      dctx.lineTo(px + 8, py - 6);
      dctx.closePath(); dctx.fill();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function drawGlow() {
    // ogen en glimmers bovenop het donker, zodat je ze altijd ziet
    for (const o of G.objs) {
      if (o.y < -30 || o.y > H + 30) continue;
      if (o.type === 'wolf') {
        const ex = o.st === 'lurk' ? 32 : o.x + 8, ey = o.y;
        const a = o.st === 'lurk' ? 0.35 + 0.35 * Math.sin(G.time * 5 + o.d) : 1;
        glowEye(ex, ey - 4, '#d6ff6b', a, 2.2);
        glowEye(ex, ey + 4, '#d6ff6b', a, 2.2);
      } else if (o.type === 'crow') {
        const a = 0.8 + o.flare * 0.2, r = 2 + o.flare * 2;
        glowEye(o.x - 4, o.y - 9, '#ff8a2a', a, r);
        glowEye(o.x + 4, o.y - 9, '#ff8a2a', a, r);
      } else if (o.type === 'ghost') {
        ctx.globalAlpha = 0.5;
        drawGhost(o);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0b1220';
        ctx.beginPath(); ctx.ellipse(o.x - 4, o.y - 8, 2, 3, 0, 0, Math.PI * 2); ctx.ellipse(o.x + 4, o.y - 8, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
      } else if (o.type === 'coin') {
        const a = 0.25 + 0.2 * Math.sin(o.spin);
        glowEye(o.x, o.y, o.kind === 'vase' ? '#bcd6ff' : '#ffd66b', a, 3);
      }
    }
    for (const p of G.parts) {
      if (p.color === 'ripple') {
        const t = 1 - p.life / p.max;
        ctx.strokeStyle = `rgba(150,210,215,${0.5 * (1 - t)})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * (0.5 + t), p.size * 0.45 * (0.5 + t), 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  function glowEye(x, y, color, a, r) {
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function render() {
    const sx = G.shake > 0 ? rnd(-1, 1) * G.shake * 7 : 0, sy = G.shake > 0 ? rnd(-1, 1) * G.shake * 7 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (sx || sy) { ctx.fillStyle = '#070b10'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    // grond, op hele pixels zodat er geen naden tussen de tegels komen
    ctx.setTransform(1, 0, 0, 1, Math.round(sx * k), Math.round(sy * k));
    const th = tile.height;
    const off = Math.round((G.dist % TILE_H) / TILE_H * th);
    for (let y = off - th; y < canvas.height; y += th) ctx.drawImage(tile, 0, y);
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    // objecten en speler, van boven naar onder
    const list = G.objs.filter(o => o.y > -60 && o.y < H + 60);
    list.sort((a, b) => a.y - b.y);
    let playerDrawn = false;
    for (const o of list) {
      if (!playerDrawn && o.y > PY && o.type !== 'sign') { drawPlayer(); playerDrawn = true; }
      switch (o.type) {
        case 'bale': drawBale(o); break;
        case 'fence': drawFence(o); break;
        case 'wolf': drawWolf(o); break;
        case 'crow': drawCrow(o); break;
        case 'ghost': drawGhost(o); break;
        case 'coin': drawCoin(o); break;
        case 'sign': drawSign(o); break;
      }
    }
    if (!playerDrawn) drawPlayer();
    for (const p of G.parts) {
      if (p.color === 'ripple') continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    // mist
    for (const f of fog) { ctx.globalAlpha = f.a; ctx.drawImage(fogSprite, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2); }
    ctx.globalAlpha = 1;

    drawDarkness();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawGlow();

    // banners
    for (const b of G.banners) {
      const a = Math.min(1, b.t / 0.25, (b.dur - b.t) / 0.5);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const y = H * 0.27 - (1 - Math.min(1, b.t / 0.25)) * 12;
      ctx.font = '900 30px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(b.text, W / 2, y);
      ctx.fillStyle = '#f4f1e8'; ctx.fillText(b.text, W / 2, y);
      if (b.sub) {
        ctx.font = '700 15px system-ui, -apple-system, Segoe UI, sans-serif';
        ctx.lineWidth = 4; ctx.strokeText(b.sub, W / 2, y + 28);
        ctx.fillStyle = '#f2c14e'; ctx.fillText(b.sub, W / 2, y + 28);
      }
      ctx.globalAlpha = 1;
    }
    if (G.flash > 0) { ctx.fillStyle = `rgba(190,20,20,${G.flash * 0.45})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
  }

  let lastHud = '';
  function hud() {
    if (mode !== 'play') return;
    const txt = meters() + '|' + score();
    if (txt === lastHud) return;
    lastHud = txt;
    $('hMeters').textContent = meters() + ' m';
    $('hScore').textContent = 'score ' + score();
  }

  let last = performance.now(), perf = 0, hold = false;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t0 = performance.now();
    if (!paused && mode !== 'over' && !hold) update(dt);
    if (G) render();
    perf = perf * 0.95 + (performance.now() - t0) * 0.05;
    hud();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  // oudere iPhones geven tijdens het draaien soms nog de oude maat door
  window.addEventListener('orientationchange', () => setTimeout(resize, 300));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();
  toTitle();
  requestAnimationFrame(frame);

  // voor testen vanuit de console
  // testhaak alleen lokaal (anders is valsspelen te makkelijk)
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) window.__dash = {
    get G() { return G; }, get perf() { return perf; }, set hold(v) { hold = v; },
    add(o) { G.objs.push(o); return o; }, laneX,
    // n beelden vooruit met vaste stap (testen zonder zichtbaar venster); geeft ms per beeld terug
    step(n = 1, dt = 1 / 60) { const t0 = performance.now(); for (let i = 0; i < n; i++) { if (!paused && mode !== 'over') update(dt); } render(); hud(); return (performance.now() - t0) / n; },
    tick(dt = 1 / 60) { if (!paused && mode !== 'over') update(dt); },
    renderMs(n = 20) { const t0 = performance.now(); for (let i = 0; i < n; i++) render(); return (performance.now() - t0) / n; }, get mode() { return mode; }, start, die, move, jump,
    setDist(m) { G.dist = m * PX_PER_M; G.spawnD = G.dist + PY + 140; G.objs = []; G.nextSign = Math.ceil(m / 100) * 100 || 100; while (MILESTONES[G.nextMilestone] && MILESTONES[G.nextMilestone][0] <= m) G.nextMilestone++; },
    ROBLOX_URL,
  };
})();

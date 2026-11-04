// Polder Dash: RACE. Wie is het eerst bij de finish (1000 m)? Een obstakel laat je niet af gaan, maar kost snelheid.
// Hier staat alles zonder tekenwerk: het parcours (vast per 'seed', dus voor iedereen gelijk), de snelheid,
// de spullen uit de kratten en de computer-tegenstander. game3d.js tekent het; later kan online hetzelfde gebruiken.

export const PX_PER_M = 32;
export const RACE_M = 1000;
export const FINISH_D = RACE_M * PX_PER_M;
export const JUMP_TIME = 0.62;
export const capSpeed = m => Math.min(560, 230 + m * 0.42);   // zelfde als het gewone spel

export const ACC = 260;        // px/s² optrekken (start en na een botsing)
export const HIT_KEEP = 0.3;   // na een botsing hou je 30% van je snelheid
export const STUN_T = 0.4;     // zo lang struikel je (geen optrekken)
export const GRACE_T = 1.0;    // daarna even niet nog een keer raken
export const BOOST = 1.3;      // turbo: 30% boven je topsnelheid
export const BOOST_T = 2.5;    // en zo lang (je ramt dan alles opzij)
const CRATE_EVERY = 150 * PX_PER_M;

export const ITEMS = {
  bale: { icon: '🌾', name: 'HAY BALE', how: 'to drop it behind you' },
  turbo: { icon: '⚡', name: 'TURBO', how: 'for a burst of speed' },
  ghost: { icon: '👻', name: 'WHITE LADY', how: 'to send her after the leader' },
};

// fail = kans dat hij een obstakel 'niet ziet'; react = hoe ver vooruit hij kijkt (seconden);
// mul = topsnelheid; smart = hoe slim hij zijn spullen gebruikt (0 = zomaar, 3 = op het beste moment)
export const LEVELS = {
  rookie: { name: 'ROOKIE', fail: 0.3, react: 0.42, gap: 0.2, mul: 0.96, smart: 0, look: { coat: 'green', hat: 'cap', boots: 'classic', hand: 'none' } },
  advanced: { name: 'ADVANCED', fail: 0.14, react: 0.5, gap: 0.16, mul: 0.98, smart: 1, look: { coat: 'blue', hat: 'cowboy', boots: 'red', hand: 'none' } },
  pro: { name: 'PRO', fail: 0.06, react: 0.6, gap: 0.13, mul: 1, smart: 2, look: { coat: 'red', hat: 'tophat', boots: 'yellow', hand: 'cane' } },
  expert: { name: 'EXPERT', fail: 0.02, react: 0.7, gap: 0.1, mul: 1, smart: 3, look: { coat: 'black', hat: 'pumpkin', boots: 'gold', hand: 'fork' } },
};
export const LEVEL_ORDER = ['rookie', 'advanced', 'pro', 'expert'];
// sommige dingen zijn lastiger dan andere (de geest zweeft heen en weer, een gedropte baal komt onverwacht)
const FAIL_MUL = { bale: 1, fence: 0.8, wolf: 1.1, crow: 1, ghost: 1.5, drop: 1.4, sent: 1.6 };

export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// snelheid van een renner (speler of computer): r = { dist, speed, stunT, graceT, boostT, mul }
export function stepSpeed(r, dt) {
  r.stunT = Math.max(0, r.stunT - dt);
  r.graceT = Math.max(0, r.graceT - dt);
  r.boostT = Math.max(0, r.boostT - dt);
  if (r.stunT > 0) return;
  const cap = capSpeed(r.dist / PX_PER_M) * (r.mul || 1) * (r.boostT > 0 ? BOOST : 1);
  if (r.speed < cap) r.speed = Math.min(cap, r.speed + (r.boostT > 0 ? 900 : ACC) * dt);
  else r.speed = Math.max(cap, r.speed - 300 * dt);
}
// botsing: 'hit' (snelheid kwijt), 'smash' (turbo: je ramt het opzij) of null (net al geraakt)
export function hitRunner(r) {
  if (r.boostT > 0) return 'smash';
  if (r.graceT > 0) return null;
  r.speed = Math.max(60, r.speed * HIT_KEEP);
  r.stunT = STUN_T; r.graceT = GRACE_T;
  r.hits = (r.hits || 0) + 1;
  return 'hit';
}

// Het parcours: zelfde soort patronen als het gewone spel (spawnPattern in game3d.js), maar vast per seed,
// zonder munten, met elke 150 m een rij kratten over alle drie de banen, en een finish.
// g = groep (twee balen naast elkaar horen bij elkaar), id = uniek per ding.
export function buildCourse(seed, laneX) {
  const rng = mulberry32(seed >>> 0);
  const rr = (a, b) => a + rng() * (b - a), ri = (a, b) => Math.floor(rr(a, b + 1)), ch = p => rng() < p;
  const pick = opts => {
    let sum = 0; for (const o of opts) sum += o[1];
    let r = rng() * sum;
    for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
    return opts[0][0];
  };
  const objs = [];
  let id = 0, g = 0;
  const add = o => { o.id = ++id; o.g = g; objs.push(o); };
  let d = 520, nextCrate = 40 * PX_PER_M;
  const last = FINISH_D - 260;
  while (d < last) {
    const md = d / PX_PER_M, gap = capSpeed(md) * rr(0.62, 0.95) + 70;
    g++;
    const type = pick([
      ['bale', 3],
      ['bale2', md > 60 ? 2.5 : 0],
      ['fence', md > 150 ? 1.2 : 0],
      ['wolf', md > 80 ? (md > 350 ? 2 : 1.5) : 0],
      ['crow', md > 200 ? 2 : 0],
      ['ghost', md > 600 ? 1.4 : 0],
    ]);
    if (type === 'bale') { const l = ri(0, 2); add({ type: 'bale', lane: l, x: laneX(l), d }); }
    else if (type === 'bale2') { const free = ri(0, 2); for (let l = 0; l < 3; l++) if (l !== free) add({ type: 'bale', lane: l, x: laneX(l), d }); }
    else if (type === 'fence') add({ type: 'fence', x: 180, d });
    else if (type === 'wolf') add({ type: 'wolf', d, maxLane: md > 350 && ch(0.5) ? 1 : 0 });
    else if (type === 'crow') { const l = ri(0, 2); add({ type: 'crow', lane: l, x: laneX(l), d }); }
    else add({ type: 'ghost', x: 180, d, ph: rr(0, Math.PI * 2) });
    const mid = d + gap * 0.5;
    if (mid >= nextCrate && mid < last) {
      g++;
      for (let l = 0; l < 3; l++) add({ type: 'crate', lane: l, x: laneX(l), d: mid });
      nextCrate += CRATE_EVERY;
    }
    d += gap;
  }
  g++;
  add({ type: 'finish', x: 180, d: FINISH_D });
  return objs;
}

// Waar een gedropte baal landt: 50 px achter je. Loopt de ander daar zo dicht achter dat niemand nog kan uitwijken
// (minder dan ~0,45 s), dan valt hij achter hem: mis. Zo is een baal nooit onontwijkbaar, voor de speler en voor de computer.
export function dropSpot(dropper, victim) {
  const base = dropper.dist - 50;
  const close = victim.dist < base + 24 && base - victim.dist < Math.max(120, victim.speed * 0.45);
  return close ? victim.dist - 40 : base;
}
// de Witte Wief zweeft heen en weer (zelfde beweging als in game3d.js)
export const ghostX = (ph, t) => 180 + Math.sin(ph + t * 1.7) * 88;

// wat zit er in een krat? Wie voor ligt krijgt vooral iets om achter te laten, wie achter ligt iets om in te halen.
export function rollItem(rng, me, other) {
  const gapM = (other.dist - me.dist) / PX_PER_M; // > 0: de ander ligt voor
  if (gapM <= 0) return rng() < 0.7 ? 'bale' : 'turbo';
  if (gapM > 40) return rng() < 0.55 ? 'turbo' : 'ghost';
  const r = rng();
  return r < 0.4 ? 'turbo' : r < 0.8 ? 'ghost' : 'bale';
}

// staat dit ding in baan l in de weg (op de grond)?
function blocks(o, l, laneX) {
  switch (o.type) {
    case 'bale': case 'crow': return o.lane === l;
    case 'wolf': return l <= o.maxLane;
    case 'fence': return true;
    default: return false;
  }
}

// ---------- de computer-tegenstander ----------
// Hij rent op hetzelfde parcours met dezelfde regels. Per obstakel beslist hij één keer of hij het 'ziet' (kans per niveau);
// ziet hij het niet, dan doet hij niets en botst hij misschien. Hij kijkt maar een stukje vooruit (react) en
// wisselt niet sneller dan elke 'gap' seconden van baan, dus te laat zien kan ook mislukken.
// env (van het spel): { drops, other: { dist, lane }, noItems, dropBale(cpu), sendGhost(cpu), turbo(cpu), hit(cpu, res, o) }
export class Cpu {
  constructor(level, course, seed, laneX, startLane = 2) {
    this.level = level; this.L = LEVELS[level]; this.course = course; this.laneX = laneX;
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.tag = 'cpu';
    Object.assign(this, {
      dist: 0, speed: 0, lane: startLane, px: laneX(startLane), jt: -1, stunT: 0, graceT: 0, boostT: 0, mul: this.L.mul,
      item: null, itemT: 0, useAt: 0, time: 0, clock: 0, finished: false, finishT: 0, hits: 0, items: 0, runPhase: 0, moveT: 0, ci: 0, gi: 0,
    });
    this.fate = new Map(); this.done = new Set();
    this.ghosts = [];   // geesten van het parcours: net als bij de speler zweven ze naar hem toe zodra ze 'in beeld' komen
    this.incoming = []; // geesten die de speler op hem af stuurt
  }
  // ziet hij dit obstakel? (één keer per groep beslist)
  fails(o) {
    const k = o.by ? 'd' + o.id : o.sent ? 's' + o.id : o.g;
    if (!this.fate.has(k)) {
      const kind = o.by ? 'drop' : o.sent ? 'sent' : o.type;
      let p = this.L.fail * (FAIL_MUL[kind] || 1);
      // iets wat de speler net voor hem gooit: hoe minder tijd, hoe groter de kans dat hij het niet ziet (net als een mens)
      if (o.by || o.sent) p += Math.min(1, Math.max(0, (0.9 - (o.d - this.dist) / Math.max(100, this.speed)) / 0.5)) * 0.45;
      this.fate.set(k, this.rng() < p);
    }
    return this.fate.get(k);
  }
  near(env, from, to) {
    const c = this.course;
    while (this.ci < c.length && c[this.ci].d < this.dist - 80) this.ci++;
    const out = [];
    for (let i = this.ci; i < c.length && c[i].d <= to; i++) if (c[i].d >= from && c[i].type !== 'ghost') out.push(c[i]);
    for (const o of this.ghosts) if (o.d >= from && o.d <= to) out.push(o);
    for (const o of env.drops) if (o.by !== this.tag && o.d >= from && o.d <= to) out.push(o);
    for (const o of this.incoming) if (o.d >= from && o.d <= to) out.push(o);
    if (out.length > 1) out.sort((a, b) => a.d - b.d);
    return out;
  }
  // klok voor de zwaai van de geest: die van het spel (env.time = G.time), zodat hij hier zweeft zoals je hem ziet
  gx(o) { return ghostX(o.ph || 0, this.clock); }
  step(dt, env) {
    this.clock = env && typeof env.time === 'number' ? env.time : this.time;
    if (this.finished) {
      // na de finish uitlopen en stilstaan (en klokjes laten aflopen: niet blijven knipperen)
      this.speed = Math.max(0, this.speed - 500 * dt);
      this.dist += this.speed * dt;
      this.runPhase += dt * (this.speed / 40);
      this.stunT = Math.max(0, this.stunT - dt); this.graceT = Math.max(0, this.graceT - dt); this.boostT = 0;
      this.jumpStep(dt);
      return;
    }
    // geesten van het parcours komen 'in beeld' op 950 px (zoals AHEAD in game3d.js) en zweven dan 40 px/s naar hem toe
    const c = this.course;
    while (this.gi < c.length && c[this.gi].d < this.dist + 950) {
      const t = c[this.gi++];
      if (t.type === 'ghost') this.ghosts.push({ id: t.id, g: t.g, type: 'ghost', x: 180, d: t.d, ph: t.ph });
    }
    for (const o of this.ghosts) o.d -= 40 * dt;
    if (this.ghosts.length && this.ghosts[0].d < this.dist - 200) this.ghosts.shift();
    for (let i = this.incoming.length - 1; i >= 0; i--) if (this.incoming[i].d < this.dist - 200) this.incoming.splice(i, 1);
    this.time += dt;
    stepSpeed(this, dt);
    this.dist += this.speed * dt;
    this.runPhase += dt * (8 + this.speed / 40);
    const tx = this.laneX(this.lane), dx = tx - this.px, st = 1500 * dt;
    this.px = Math.abs(dx) <= st ? tx : this.px + Math.sign(dx) * st;
    this.moveT = Math.max(0, this.moveT - dt);
    this.jumpStep(dt);
    for (const o of this.incoming) o.d -= 40 * dt; // gestuurde geest zweeft naar hem toe
    this.think(env);
    this.collide(env);
    this.useItem(dt, env);
    if (this.dist >= FINISH_D) {
      this.finished = true;
      this.finishT = this.time - (this.dist - FINISH_D) / Math.max(1, this.speed);
    }
  }
  jumpStep(dt) {
    if (this.jt < 0) return;
    this.jt += dt / JUMP_TIME;
    if (this.jt >= 1) this.jt = -1;
  }
  air() { return this.jt >= 0 && Math.sin(Math.PI * this.jt) > 0.32; }
  planJump(ahead) { if (this.jt < 0 && ahead <= this.speed * JUMP_TIME * 0.5 + 8) this.jt = 0; }
  think(env) {
    const look = Math.max(120, this.speed * this.L.react);
    const list = this.near(env, this.dist - 10, this.dist + look);
    let grp = null, gk = null;
    for (const o of list) {
      if (o.type === 'crate' || o.type === 'finish' || this.done.has(o.id)) continue;
      const k = o.by || o.sent ? o.id : o.g;
      if (gk === null) { gk = k; grp = []; }
      if (k === gk) grp.push(o);
    }
    if (!grp || this.fails(grp[0])) return;
    const type = grp[0].type;
    const ahead = grp[0].d - this.dist;
    if (type === 'fence') { this.planJump(ahead); return; }
    let unsafe;
    if (type === 'ghost') {
      // waar is ze als ik bij haar ben? (zij zweeft ook naar mij toe)
      const g = grp[0], tA = Math.max(0, ahead) / (this.speed + 40), x = ghostX(g.ph || 0, this.clock + tA);
      unsafe = [0, 1, 2].map(l => Math.abs(this.laneX(l) - x) < 50);
    } else unsafe = [0, 1, 2].map(l => grp.some(o => blocks(o, l, this.laneX)));
    if (!unsafe[this.lane]) return;
    let best = -1;
    for (let l = 0; l < 3; l++) if (!unsafe[l] && (best < 0 || Math.abs(l - this.lane) < Math.abs(best - this.lane))) best = l;
    const jumpable = grp.every(o => o.type === 'bale');
    // twee banen ver en weinig tijd: springen gaat sneller
    if (jumpable && (best < 0 || (Math.abs(best - this.lane) > 1 && ahead < this.speed * 0.45))) { this.planJump(ahead); return; }
    if (best >= 0 && this.moveT <= 0) { this.lane += Math.sign(best - this.lane); this.moveT = this.L.gap; }
  }
  collide(env) {
    const list = this.near(env, this.dist - 30, this.dist + 30);
    const air = this.air();
    for (const o of list) {
      if (this.done.has(o.id)) continue;
      const dy = Math.abs(o.d - this.dist);
      let hit = false;
      switch (o.type) {
        case 'crate':
          if (dy < 18 && Math.abs(o.x - this.px) < 22) {
            for (const c of list) if (c.type === 'crate' && c.g === o.g) this.done.add(c.id);
            if (!this.item && !env.noItems) {
              this.item = rollItem(this.rng, this, env.other); this.itemT = 0;
              this.useAt = 0.4 + this.rng() * 2.6;
            }
          }
          continue;
        case 'bale': hit = dy < 24 && Math.abs(o.x - this.px) < 29 && !air; break;
        case 'fence': hit = dy < 15 && !air; break;
        case 'wolf': hit = dy < 22 && this.px < this.laneX(o.maxLane) + 30; break;
        case 'crow': hit = dy < 22 && Math.abs(o.x - this.px) < 26; break;
        case 'ghost': hit = dy < 24 && Math.abs(this.gx(o) - this.px) < 24; break; // zelfde regel als de speler
      }
      if (!hit) continue;
      this.done.add(o.id);
      const res = hitRunner(this);
      if (res && env.hit) env.hit(this, res, o);
    }
  }
  useItem(dt, env) {
    if (!this.item || env.noItems) return;
    this.itemT += dt;
    const it = this.item, s = this.L.smart, o = env.other, gap = o.dist - this.dist; // gap > 0: speler ligt voor
    let use = false;
    if (s === 0) use = this.itemT >= this.useAt;
    else if (it === 'turbo') use = (this.stunT <= 0 && this.speed < capSpeed(this.dist / PX_PER_M) * 0.75) || this.itemT > (s === 1 ? 1.5 : 6) || (s >= 2 && gap > 0 && this.dist > FINISH_D - 2500);
    else if (it === 'bale') {
      // pas laten vallen als de speler ver genoeg achter hem loopt om te kunnen reageren (anders valt hij mis, zie dropSpot)
      const sp = Math.max(230, o.speed || 0), near = sp * 0.5 + 50, far = sp * (s === 1 ? 1.6 : s === 2 ? 1.2 : 0.95) + 50;
      use = (-gap > near && -gap < far && (s < 3 || o.lane === this.lane || this.itemT > 6)) || this.itemT > 12;
    } else if (it === 'ghost') use = gap > 0 || this.itemT > 15;
    if (!use) return;
    this.item = null; this.items++;
    if (it === 'turbo') { this.boostT = BOOST_T; this.stunT = 0; if (env.turbo) env.turbo(this); }
    else if (it === 'bale') env.dropBale(this);
    else if (it === 'ghost' && gap > 0) env.sendGhost(this);
  }
}

// ---------- tegenstander online: een mens op een ander apparaat ----------
// Zijn eigen spel rekent zijn renner (botsingen, spullen); hier komt ~10× per seconde zijn plek binnen (apply).
// Daartussen schatten we waar hij is (doorrennen op zijn snelheid en langzaam bijsturen), zodat hij vloeiend loopt.
// Zelfde velden als Cpu, zodat game3d.js hem op dezelfde manier tekent.
export class NetRival {
  constructor(laneX, lane = 2) {
    this.laneX = laneX; this.tag = 'cpu';
    Object.assign(this, {
      dist: 0, speed: 0, netSpeed: 0, lane, px: laneX(lane), jt: -1, stunT: 0, graceT: 0, boostT: 0,
      finished: false, finishT: 0, quit: false, hits: 0, items: 0, runPhase: 0, tD: 0, tAt: 0, seen: false,
    });
    this.incoming = []; // geesten die jij hem stuurde (alleen om te laten zien; raken doet zijn eigen spel)
  }
  apply(m, now) {
    this.seen = true; this.tD = m.d; this.tAt = now; this.netSpeed = m.s;
    this.lane = Math.max(0, Math.min(2, m.l | 0));
    const j = m.j >= 0 ? m.j / 100 : -1;
    if (j < 0) this.jt = -1; else if (this.jt < 0 || Math.abs(this.jt - j) > 0.25) this.jt = j;
    // vlaggen gelden tot het volgende bericht (en nog even, als er een wegvalt)
    this.stunT = m.x & 1 ? 0.25 : 0; this.boostT = m.x & 2 ? 0.25 : 0; this.graceT = m.x & 4 ? 0.25 : 0;
  }
  step(dt, env) {
    const now = env && typeof env.now === 'number' ? env.now : Date.now();
    if (this.seen) {
      // langer dan 0,6 s niets gehoord (verbinding hapert): niet eindeloos doorschatten, maar uitlopen
      const age = Math.min(0.6, Math.max(0, (now - this.tAt) / 1000));
      this.speed = now - this.tAt < 600 ? this.netSpeed : Math.max(0, this.speed - 600 * dt);
      this.dist += this.speed * dt;
      const err = this.tD + this.netSpeed * age - this.dist;
      if (Math.abs(err) > 400) this.dist += err; else this.dist += err * Math.min(1, dt * 5);
    }
    const tx = this.laneX(this.lane), dx = tx - this.px, st = 1500 * dt;
    this.px = Math.abs(dx) <= st ? tx : this.px + Math.sign(dx) * st;
    if (this.jt >= 0) { this.jt += dt / JUMP_TIME; if (this.jt >= 1) this.jt = -1; }
    if (this.speed > 1) this.runPhase += dt * (8 + this.speed / 40);
    this.stunT = Math.max(0, this.stunT - dt); this.graceT = Math.max(0, this.graceT - dt); this.boostT = Math.max(0, this.boostT - dt);
    for (const o of this.incoming) o.d -= 40 * dt;
    for (let i = this.incoming.length - 1; i >= 0; i--) if (this.incoming[i].d < this.dist - 200) this.incoming.splice(i, 1);
  }
}

export function fmtTime(s) {
  const t = Math.round((s >= 0 ? s : 0) * 10), m = Math.floor(t / 600), r = (t % 600) / 10;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
}

// Stampede: test version. One world (the polder). Animals are free CC0 models by Quaternius (models/), the ostrich is made of shapes.
// The animal runs on its own along -z. Three lanes. Swipe or keys to steer, jump, duck.
import * as THREE from '../dash/vendor/three.module.min.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

// ---------- settings ----------
const LANES = [-2.3, 0, 2.3];
const GRAV = 26;
const STEP = 1 / 120;
const SEG = 30;                 // length of one scenery piece (m)
const AHEAD = 230;              // how far ahead things are built (m)
// model: file in models/, scale: model size, seat: saddle height above the back bone, spread: rider's legs
// stride: meters per gallop cycle. Styles change colors (by material name) and can glow.
const ANIMALS = {
  horse: { name: 'Horse', em: '🐴', price: 0, speed: 1.0, jump: 9.2, laneSpeed: 14, ability: null,
    model: 'Horse', scale: 0.46, seat: 0.16, seatZ: -0.12, spread: 0.66, stride: 3.4, info: 'Steady and easy. Good jumper.' },
  ostrich: { name: 'Ostrich', em: '🐦', price: 300, speed: 1.1, jump: 8.6, laneSpeed: 16, ability: 'sprint',
    spread: 1.15, info: 'Fast. ⚡ Sprint smashes through everything.' },
  stag: { name: 'Stag', em: '🦌', price: 800, speed: 1.05, jump: 10.0, laneSpeed: 15, ability: 'double',
    model: 'Stag', scale: 0.52, seat: 0.14, seatZ: -0.6, spread: 0.66, stride: 3.6, info: 'Jumps high. Jump again in the air!' },
  wolf: { name: 'Wolf', em: '🐺', price: 1500, speed: 1.15, jump: 8.8, laneSpeed: 18, ability: 'magnet',
    model: 'Wolf', scale: 0.7, seat: 0.12, seatZ: -0.1, spread: 0.6, stride: 3.2, info: 'Very fast. Pulls coins to you.' },
  bull: { name: 'Bull', em: '🐂', price: 2500, speed: 1.0, jump: 8.4, laneSpeed: 12.5, ability: 'charge',
    model: 'Bull', scale: 0.42, seat: 0.5, seatZ: -0.25, spread: 0.85, stride: 3.6, info: 'Runs through fences. 💥 Charge smashes everything.' },
};
// button powers: how long they last, how long they take to fill up, extra speed
const POWERS = {
  sprint: { time: 3, charge: 12, speed: 1.5, icon: '⚡', label: 'SPRINT' },
  charge: { time: 3.5, charge: 10, speed: 1.25, icon: '💥', label: 'CHARGE' },
};
// styles: looks only. gems = price in 💎 (0 = free). colors by material name; glow = emissive color
const STYLES = {
  horse: [
    { key: 'chestnut', name: 'Chestnut', gems: 0, sw: '#7a4a24' },
    { key: 'snow', name: 'Snow White', gems: 2, sw: '#f2efe8', colors: { Main: 0xf3efe6, Main_Dark: 0xd9d1c4, Main_Light: 0xffffff, Hair: 0xe6dcc4, Muzzle: 0xc9b9a8, Hooves: 0x8a8177 } },
    { key: 'black', name: 'Black Beauty', gems: 3, sw: '#1d1b1b', colors: { Main: 0x1f1c1c, Main_Dark: 0x121010, Main_Light: 0x3a3535, Hair: 0x0b0b0b, Muzzle: 0x2a2525 } },
    { key: 'golden', name: 'Golden', gems: 5, sw: '#e3ad3c', colors: { Main: 0xe0a83c, Main_Dark: 0xb8812a, Main_Light: 0xf6cf6a, Hair: 0xfff1c8, Muzzle: 0x9a6a2a }, glow: { Main: 0x3a2400, Hair: 0x55452a } },
    { key: 'nightmare', name: 'Nightmare', gems: 8, sw: '#c0201a', colors: { Main: 0x161216, Main_Dark: 0x0c090c, Main_Light: 0x2a2228, Hair: 0xff3a12, Muzzle: 0x0c090c, Eye_White: 0xff2a10, Eye_Black: 0xff2a10, Hooves: 0x3a0a06 }, glow: { Hair: 0xff3000, Eye_White: 0xff2000, Eye_Black: 0xff2000, Hooves: 0x501000 } },
  ],
  ostrich: [
    { key: 'classic', name: 'Classic', gems: 0, sw: '#2a2624' },
    { key: 'flamingo', name: 'Flamingo', gems: 2, sw: '#f28bb0', colors: { feather: 0xf07aa6, wing: 0xe0608f, skin: 0xf5b8c8, tail: 0xffffff } },
    { key: 'royal', name: 'Royal', gems: 4, sw: '#2b4fd1', colors: { feather: 0x2347c8, wing: 0x18318e, skin: 0xd9a49a, tail: 0xffd34d }, glow: { tail: 0x4a3000 } },
  ],
  stag: [
    { key: 'forest', name: 'Forest', gems: 0, sw: '#6b4220' },
    { key: 'snow', name: 'Snow Stag', gems: 3, sw: '#e9eef2', colors: { Material: 0xe9edf0, 'Material.003': 0xffffff, 'Material.010': 0xc0c8d0, Horns: 0x9fd8ff }, glow: { Horns: 0x2a6fa0 } },
    { key: 'spirit', name: 'Spirit', gems: 6, sw: '#46e0d0', colors: { Material: 0x2fb7c4, 'Material.003': 0x8ff5ee, 'Material.010': 0x1a6f80, Horns: 0xe8fffd, 'Material.001': 0x1a6f80 }, glow: { Material: 0x0a4a55, 'Material.003': 0x1c8a85, Horns: 0x7fffee } },
    { key: 'gold', name: 'Golden Antlers', gems: 4, sw: '#f2c14e', colors: { Material: 0x5a3418, Horns: 0xf2c14e }, glow: { Horns: 0x6a4500 } },
  ],
  wolf: [
    { key: 'grey', name: 'Grey', gems: 0, sw: '#5c615a' },
    { key: 'arctic', name: 'Arctic', gems: 3, sw: '#eef2f4', colors: { Main: 0xdfe5e8, Main_Light: 0xffffff } },
    { key: 'shadow', name: 'Shadow', gems: 5, sw: '#151318', colors: { Main: 0x141216, Main_Light: 0x2a2630, Eyes_Black: 0xff2a10, Nose: 0x000000 }, glow: { Eyes_Black: 0xff2000 } },
    { key: 'fire', name: 'Fire Wolf', gems: 8, sw: '#ff7a1a', colors: { Main: 0xd8481a, Main_Light: 0xffc040, Eyes_Black: 0xfff2a0 }, glow: { Main: 0x401000, Main_Light: 0x803800, Eyes_Black: 0xffcc40 } },
  ],
  bull: [
    { key: 'black', name: 'Black', gems: 0, sw: '#1e1e1c' },
    { key: 'rage', name: 'Red Rage', gems: 3, sw: '#8a1a14', colors: { Main: 0x7a1510, Main_Light: 0xa83020, Horns: 0xf4ecd8, Eye_Black: 0xff3010, Eye_White: 0xff3010 }, glow: { Eye_Black: 0xff2000, Eye_White: 0xff2000 } },
    { key: 'ice', name: 'Ice', gems: 5, sw: '#9fd8ff', colors: { Main: 0x9cc8e6, Main_Light: 0xe8f6ff, Horns: 0xffffff, Hooves: 0x5a7a9a }, glow: { Main: 0x0a2a40, Horns: 0x4080b0 } },
    { key: 'golden', name: 'Golden', gems: 8, sw: '#e3ad3c', colors: { Main: 0xd89a2c, Main_Light: 0xf6cf6a, Horns: 0xfff6dc, Hooves: 0x6a4a1a }, glow: { Main: 0x3a2200, Horns: 0x5a4a2a } },
  ],
};

// ---------- storage (never breaks the game) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('stampede.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('stampede.' + k, JSON.stringify(v)); } catch (e) {} },
};

// ---------- renderer ----------
const canvas = document.getElementById('c');
const isTouch = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch || (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isTouch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
let lowQuality = false;
const scene = new THREE.Scene();
const FOG = 0xcde9f7;
scene.fog = new THREE.Fog(FOG, 70, 230);
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 700);

// ---------- helpers ----------
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mats = {};
function mat(c, opt) { const k = c + (opt ? JSON.stringify(opt) : ''); if (!mats[k]) mats[k] = new THREE.MeshLambertMaterial(Object.assign({ color: c }, opt || {})); return mats[k]; }
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 18, 14),
  sphLo: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cap: new THREE.CapsuleGeometry(1, 1, 6, 14),
  plane: new THREE.PlaneGeometry(1, 1),
  coin: new THREE.CylinderGeometry(0.32, 0.32, 0.07, 20),
  gem: new THREE.OctahedronGeometry(0.34, 0),
};
function mesh(geo, m, sx, sy, sz, x, y, z, parent) {
  const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0);
  if (parent) parent.add(o); return o;
}
function group(x, y, z, parent) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(g); return g; }
function shadows(o, cast, recv) { o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = !!recv; } }); return o; }
function canvasTex(w, h, draw, rx, ry) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1); t.anisotropy = 4; return t;
}

// ---------- materials ----------
const sandTex = canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#d6bd86'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { const v = hash(i) * 40 - 20 | 0; g.fillStyle = `rgb(${200 + v},${176 + v},${120 + v})`; g.fillRect(hash(i + 7) * w, hash(i + 9) * h, 2, 2); }
  for (const x of [0.2, 0.5, 0.8]) { g.fillStyle = 'rgba(140,105,60,.22)'; g.fillRect(x * w - 9, 0, 5, h); g.fillRect(x * w + 4, 0, 5, h); }
  for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(120,90,50,.10)'; g.fillRect(0, y, w, 6); }
}, 1, 3);
const grassTex = canvasTex(8, 64, (g) => {
  for (let y = 0; y < 64; y++) { const b = (Math.floor(y / 16) % 2 ? 0 : 14) + (hash(y) * 8 | 0); g.fillStyle = `rgb(${92 + b},${172 + b},${66 + b * 0.5})`; g.fillRect(0, y, 8, 1); }
}, 1, 4);
const M = {
  sand: new THREE.MeshLambertMaterial({ map: sandTex }), grass: new THREE.MeshLambertMaterial({ map: grassTex }),
  far: mat(0x6fb352), water: new THREE.MeshPhongMaterial({ color: 0x3f8fd0, shininess: 90, specular: 0x9ab8d8 }),
  wood: mat(0x8a5a2b), woodL: mat(0xb07d45), white: mat(0xf4f1e8), red: mat(0xd8413a), blue: mat(0x2f6fd1), skin: mat(0xf2c9a0),
  black: mat(0x1a1a1a), orange: mat(0xff7a1a), hay: mat(0xe2c25a), hayD: mat(0xc9a440), trunk: mat(0x6e4f34), leaf: mat(0x4f9a46), leaf2: mat(0x3f8a3e),
  cow: mat(0xf7f7f2), cowB: mat(0x222222), pink: mat(0xf2a0a0), mill: mat(0x6a5444), roof: mat(0x3d3d48), sail: mat(0xe9e2d0),
  house: mat(0xb5483a), wall: mat(0xe9dfcc), reed: mat(0x5a8f3c), grey: mat(0x8d8d8d), metal: mat(0x55606a),
  coin: new THREE.MeshLambertMaterial({ color: 0xffcc33, emissive: 0x8a5a00, emissiveIntensity: 0.7 }),
  gem: new THREE.MeshPhongMaterial({ color: 0x46c8ff, emissive: 0x1060a0, emissiveIntensity: 0.8, shininess: 120, flatShading: true }),
  tulip: [mat(0xe8413a), mat(0xffcf3a), mat(0xf06fb0), mat(0xff8a1a), mat(0xffffff)],
};

// ---------- light and sky ----------
const hemi = new THREE.HemisphereLight(0xe3f3ff, 0x5c8a3a, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d0, 2.1);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 14, bottom: -14, near: 1, far: 70 });
sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);
{
  const geo = new THREE.SphereGeometry(500, 24, 16), pos = geo.attributes.position, colArr = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x5fa8ea), bot = new THREE.Color(FOG);
  for (let i = 0; i < pos.count; i++) { const t = Math.min(1, Math.max(0, pos.getY(i) / 500 * 2.4)); const c = bot.clone().lerp(top, t); colArr.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  var sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; scene.add(sky);
}
const sunBall = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }), 14, 14, 14); scene.add(sunBall);
const duckTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#ffd23a'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#1a1a1a'; g.stroke();
  g.fillStyle = '#1a1a1a'; g.beginPath(); g.moveTo(34, 36); g.lineTo(94, 36); g.lineTo(64, 72); g.fill();
  g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('DUCK', 64, 106);
});
M.duckSign = new THREE.MeshBasicMaterial({ map: duckTex, transparent: true, side: THREE.DoubleSide });
const glowTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.4)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe9a0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
sunGlow.scale.setScalar(80); scene.add(sunGlow);
const farGround = mesh(G.plane, M.far, 900, 900, 1); farGround.rotation.x = -Math.PI / 2; farGround.position.y = -0.05; farGround.receiveShadow = true; scene.add(farGround);
const clouds = group(0, 0, 0, scene);
for (let i = 0; i < 9; i++) {
  const c = group((hash(i) - 0.5) * 420, 55 + hash(i + 3) * 40, -180 - hash(i + 5) * 200, clouds);
  for (let k = 0; k < 4; k++) mesh(G.sphLo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x99aabb, emissiveIntensity: 0.3, fog: false }), 9 + hash(i * 9 + k) * 6, 5 + hash(k + i) * 2, 6, k * 9 - 13, hash(k * 3 + i) * 3, 0, c);
}

// the world moves past the player: everything along the track lives in here
const world = group(0, 0, 0, scene);

// ---------- rider (farmer on top) ----------
function makeRider() {
  const g = new THREE.Group();
  const torso = group(0, 0, 0, g);
  const legs = [];
  for (const s of [-1, 1]) {               // legs over the animal and down along its sides
    const hip = group(s * 0.14, 0.06, 0, torso);
    mesh(G.cyl, M.blue, 0.085, 0.42, 0.085, 0, -0.21, 0, hip);
    const knee = group(0, -0.42, 0, hip);
    mesh(G.cyl, M.blue, 0.07, 0.4, 0.07, 0, -0.2, 0, knee);
    mesh(G.box, M.woodL, 0.13, 0.1, 0.26, 0, -0.43, -0.05, knee);
    legs.push({ hip, knee, s });
  }
  mesh(G.box, M.blue, 0.38, 0.26, 0.3, 0, 0.12, 0, torso);
  const chest = group(0, 0.25, 0, torso);
  mesh(G.box, M.red, 0.38, 0.4, 0.28, 0, 0.2, 0, chest);
  mesh(G.box, M.blue, 0.06, 0.4, 0.29, -0.12, 0.2, 0.005, chest);
  mesh(G.box, M.blue, 0.06, 0.4, 0.29, 0.12, 0.2, 0.005, chest);
  const head = group(0, 0.6, -0.02, chest);
  mesh(G.sph, M.skin, 0.2, 0.2, 0.2, 0, 0, 0, head);
  mesh(G.sphLo, mat(0xe3a47a), 0.055, 0.055, 0.055, 0, -0.02, -0.2, head);
  mesh(G.sphLo, M.black, 0.03, 0.035, 0.03, -0.07, 0.05, -0.17, head);
  mesh(G.sphLo, M.black, 0.03, 0.035, 0.03, 0.07, 0.05, -0.17, head);
  mesh(G.sph, M.orange, 0.215, 0.14, 0.215, 0, 0.08, 0, head);
  mesh(G.box, M.orange, 0.22, 0.03, 0.2, 0, 0.07, -0.18, head);
  const arms = [];
  for (const x of [-0.24, 0.24]) {
    const sh = group(x, 0.34, 0, chest);
    mesh(G.cyl, M.red, 0.065, 0.42, 0.065, 0, -0.2, 0, sh);
    mesh(G.sphLo, M.skin, 0.07, 0.07, 0.07, 0, -0.43, 0, sh);
    sh.rotation.x = 0.9; arms.push(sh);
  }
  // saddle (only shown on model animals; the shape animals have their own)
  const saddle = group(0, -0.02, 0.02, g);
  mesh(G.box, M.red, 0.5, 0.07, 0.62, 0, 0, 0, saddle);
  mesh(G.box, mat(0x6b2a20), 0.56, 0.14, 0.09, 0, 0.05, 0.3, saddle);
  for (const x of [-0.27, 0.27]) mesh(G.box, mat(0xd9b04a), 0.04, 0.3, 0.5, x, -0.14, 0, saddle);
  saddle.visible = false;
  shadows(g, true);
  // spread: how far the thighs go out (wider animal = wider legs)
  function fit(spread) { for (const L of legs) { L.hip.rotation.set(0.35, 0, L.s * spread); L.knee.rotation.set(-0.25, 0, -L.s * (spread - 0.08)); } }
  return { g, torso, chest, head, arms, fit, saddle };
}

// ---------- animals ----------
function makePony() {
  const g = new THREE.Group(), body = group(0, 0, 0, g);
  const coat = mat(0x9a5f30), dark = mat(0x3b2416), sock = mat(0xf1e9dc);
  mesh(G.cap, coat, 0.34, 0.48, 0.34, 0, 1.1, 0, body).rotation.x = Math.PI / 2;
  const neck = group(0, 1.28, -0.5, body);
  mesh(G.cap, coat, 0.17, 0.42, 0.2, 0, 0.3, -0.12, neck).rotation.x = -0.5;
  for (let i = 0; i < 6; i++) mesh(G.box, dark, 0.07, 0.16, 0.12, 0, 0.18 + i * 0.09, 0.02 + i * -0.04 + 0.08, neck);
  const head = group(0, 0.62, -0.3, neck);
  mesh(G.cap, coat, 0.15, 0.32, 0.15, 0, -0.03, -0.18, head).rotation.x = Math.PI / 2 - 0.45;
  mesh(G.box, sock, 0.06, 0.02, 0.32, 0, 0.07, -0.25, head).rotation.x = -0.45;
  mesh(G.sphLo, dark, 0.13, 0.11, 0.13, 0, -0.17, -0.44, head);
  for (const x of [-0.11, 0.11]) {
    mesh(G.sphLo, M.black, 0.04, 0.045, 0.04, x, 0.05, -0.12, head);
    mesh(G.cone, coat, 0.05, 0.16, 0.05, x * 0.8, 0.2, 0.0, head);
  }
  const tail = group(0, 1.25, 0.8, body);
  mesh(G.cap, dark, 0.08, 0.5, 0.08, 0, -0.3, 0.12, tail).rotation.x = 0.4;
  mesh(G.box, M.red, 0.5, 0.06, 0.5, 0, 1.44, 0.02, body);                 // saddle
  mesh(G.box, mat(0x6b2a20), 0.56, 0.12, 0.08, 0, 1.47, 0.24, body);
  const legs = [];
  for (const [x, z, o] of [[-0.18, -0.45, 0], [0.18, -0.45, 0.45], [-0.18, 0.48, Math.PI], [0.18, 0.48, Math.PI + 0.45]]) {
    const hip = group(x, 1.0, z, body);
    mesh(G.cap, coat, 0.09, 0.3, 0.1, 0, -0.22, 0, hip);
    const knee = group(0, -0.48, 0, hip);
    mesh(G.cyl, z < 0 ? sock : coat, 0.06, 0.4, 0.06, 0, -0.2, 0, knee);
    mesh(G.cyl, dark, 0.075, 0.1, 0.075, 0, -0.43, 0, knee);
    legs.push({ hip, knee, o, front: z < 0 });
  }
  shadows(g, true);
  return { g, body, neck, head, tail, legs, saddleY: 1.5, saddleZ: 0.02, spread: 0.62, kind: 'pony' };
}
function makeOstrich(style) {
  const g = new THREE.Group(), body = group(0, 0, 0, g);
  const c = (style && style.colors) || {}, gl = (style && style.glow) || {};
  const ownMats = [];
  const own = (k, d) => { const m = new THREE.MeshLambertMaterial({ color: c[k] !== undefined ? c[k] : d, emissive: gl[k] || 0 }); ownMats.push(m); return m; };
  const feather = own('feather', 0x2a2624), skin = own('skin', 0xd9a49a), white = own('tail', 0xf2efe8), wing = own('wing', 0x3a3532);
  mesh(G.sph, feather, 0.46, 0.38, 0.62, 0, 1.5, 0.05, body);
  for (let i = 0; i < 5; i++) { const c = mesh(G.cone, white, 0.12, 0.5, 0.12, (i - 2) * 0.1, 1.62, 0.66, body); c.rotation.x = 1.2 + (i % 2) * 0.2; c.rotation.z = (i - 2) * 0.25; }
  for (const x of [-0.42, 0.42]) { const w = mesh(G.sph, wing, 0.08, 0.26, 0.42, x, 1.55, 0.05, body); w.rotation.z = x > 0 ? -0.3 : 0.3; }
  const neck = group(0, 1.72, -0.48, body);
  const pts = [[0, 0, 0], [0, 0.22, -0.06], [0, 0.44, -0.08], [0, 0.66, -0.06], [0, 0.86, -0.1]];
  pts.forEach((p, i) => mesh(G.sphLo, skin, 0.1 - i * 0.008, 0.13, 0.1 - i * 0.008, p[0], p[1], p[2], neck));
  const head = group(0, 1.0, -0.14, neck);
  mesh(G.sph, skin, 0.14, 0.12, 0.17, 0, 0, 0, head);
  const beak = mesh(G.cone, mat(0xe0b080), 0.07, 0.2, 0.05, 0, -0.03, -0.22, head); beak.rotation.x = -Math.PI / 2;
  for (const x of [-0.1, 0.1]) { mesh(G.sphLo, M.white, 0.055, 0.055, 0.055, x, 0.04, -0.05, head); mesh(G.sphLo, M.black, 0.03, 0.03, 0.03, x * 1.25, 0.04, -0.08, head); }
  mesh(G.box, M.red, 0.5, 0.06, 0.46, 0, 1.86, 0.02, body);
  const legs = [];
  for (const [x, o] of [[-0.16, 0], [0.16, Math.PI]]) {
    const hip = group(x, 1.32, 0.08, body);
    mesh(G.cap, skin, 0.11, 0.3, 0.12, 0, -0.22, 0, hip);
    const knee = group(0, -0.48, 0, hip);
    mesh(G.cyl, skin, 0.05, 0.75, 0.05, 0, -0.37, 0, knee);
    mesh(G.box, mat(0x9a7466), 0.12, 0.05, 0.24, 0, -0.76, -0.06, knee);
    legs.push({ hip, knee, o, bird: true });
  }
  shadows(g, true);
  return { g, body, neck, head, tail: null, legs, saddleY: 1.92, saddleZ: 0.02, spread: 1.15, kind: 'ostrich', ownMats };
}

// model animals: loaded once, then reused. Materials become simple (Lambert) so phones stay fast.
const loader = new GLTFLoader();
const models = {};   // name -> { state: 'loading'|'ready'|'failed', gltf }
function loadModel(name, done) {
  if (models[name] && models[name].state === 'failed') delete models[name];   // try again (e.g. back online)
  if (models[name]) { if (done && models[name].state !== 'loading') done(); else if (done) models[name].wait.push(done); return; }
  const m = models[name] = { state: 'loading', wait: done ? [done] : [] };
  loader.load('models/' + name + '.glb', gltf => {
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const base = o.material, key = o.name === 'Stag_Horns' ? 'Horns' : base.name;
      o.material = new THREE.MeshLambertMaterial({ color: base.color.clone(), name: key });
      o.userData.baseColor = base.color.clone(); o.userData.key = key;
      o.castShadow = true; o.frustumCulled = false;
    });
    const mixer = new THREE.AnimationMixer(gltf.scene), acts = {};
    for (const clip of gltf.animations) { const a = mixer.clipAction(clip); a.play(); a.timeScale = 0; a.setEffectiveWeight(0); acts[clip.name] = a; }
    m.gltf = gltf; m.mixer = mixer; m.acts = acts; m.seat = gltf.scene.getObjectByName('Torso2');
    m.state = 'ready'; m.wait.forEach(f => f()); m.wait = [];
  }, undefined, () => { m.state = 'failed'; m.wait.forEach(f => f()); m.wait = []; });
}
function paintModel(root, style) {
  const c = (style && style.colors) || {}, gl = (style && style.glow) || {};
  root.traverse(o => {
    if (!o.isMesh) return;
    const k = o.userData.key;
    if (c[k] !== undefined) o.material.color.setHex(c[k]); else o.material.color.copy(o.userData.baseColor);
    o.material.emissive.setHex(gl[k] || 0);
  });
}
function makeModelAnimal(key, style) {
  const a = ANIMALS[key], m = models[a.model];
  const g = new THREE.Group(), body = group(0, 0, 0, g);
  const inner = m.gltf.scene;
  inner.scale.setScalar(a.scale); inner.rotation.set(0, Math.PI, 0); inner.position.set(0, 0, 0);
  body.add(inner); paintModel(inner, style);
  for (const n in m.acts) { m.acts[n].setEffectiveWeight(0); m.acts[n].time = 0; }
  return { g, body, neck: null, head: null, tail: null, legs: [], kind: 'model', model: m, inner, w: { gallop: 1, jump: 0, death: 0 }, cycle: 0, spread: a.spread };
}

// ---------- scenery pieces ----------
function tree(parent, x, z, s) {
  const t = group(x, 0, z, parent);
  mesh(G.cylLo, M.trunk, 0.18 * s, 2.2 * s, 0.18 * s, 0, 1.1 * s, 0, t);
  mesh(G.sphLo, M.leaf, 1.2 * s, 1.1 * s, 1.2 * s, 0, 2.6 * s, 0, t);
  mesh(G.sphLo, M.leaf2, 0.9 * s, 0.85 * s, 0.9 * s, 0.5 * s, 3.1 * s, 0.2 * s, t);
  shadows(t, true);
}
function cow(parent, x, z, r) {
  const c = group(x, 0, z, parent); c.rotation.y = r;
  mesh(G.box, M.cow, 0.6, 0.55, 1.2, 0, 0.85, 0, c);
  mesh(G.box, M.cowB, 0.61, 0.3, 0.4, 0, 0.95, 0.15, c);
  mesh(G.box, M.cow, 0.4, 0.4, 0.45, 0, 1.05, -0.75, c);
  mesh(G.box, M.pink, 0.36, 0.2, 0.12, 0, 0.92, -1.0, c);
  for (const [lx, lz] of [[-0.2, -0.45], [0.2, -0.45], [-0.2, 0.45], [0.2, 0.45]]) mesh(G.box, M.cow, 0.14, 0.6, 0.14, lx, 0.3, lz, c);
  shadows(c, true);
}
const mills = [];
function windmill(parent, x, z) {
  const m = group(x, 0, z, parent);
  mesh(G.cylLo, M.mill, 2.2, 1, 2.2, 0, 4, 0, m).scale.set(2.2, 8, 2.2);
  mesh(G.cone, M.roof, 2.6, 2.6, 2.6, 0, 9.3, 0, m);
  const hub = group(0, 8.4, -2.4, m); hub.rotation.y = x > 0 ? 0.5 : -0.5;
  const rot = group(0, 0, 0, hub);
  for (let i = 0; i < 4; i++) { const arm = group(0, 0, 0, rot); arm.rotation.z = i * Math.PI / 2; mesh(G.box, M.wood, 0.25, 6, 0.15, 0, 3, 0, arm); mesh(G.box, M.sail, 1.3, 4.6, 0.06, 0.75, 3.5, 0.05, arm); }
  mills.push(rot); m.userData.rot = rot;
  shadows(m, true);
}
function farmhouse(parent, x, z) {
  const h = group(x, 0, z, parent); h.rotation.y = x > 0 ? -0.3 : 0.3;
  mesh(G.box, M.house, 6, 3.2, 4.6, 0, 1.6, 0, h);
  const r = mesh(G.box, M.roof, 6.4, 0.25, 3.4, 0, 4.1, 1.15, h); r.rotation.x = 0.75;
  const r2 = mesh(G.box, M.roof, 6.4, 0.25, 3.4, 0, 4.1, -1.15, h); r2.rotation.x = -0.75;
  mesh(G.box, M.white, 0.9, 1.0, 0.05, -1.5, 1.8, -2.32, h); mesh(G.box, M.white, 0.9, 1.0, 0.05, 1.5, 1.8, -2.32, h);
  shadows(h, true);
}
const built = new Map();
function buildSeg(i) {
  const s = group(0, 0, -(i + 0.5) * SEG, world);
  const path = mesh(G.plane, M.sand, 7.8, SEG, 1, 0, 0.01, 0, s); path.rotation.x = -Math.PI / 2; path.receiveShadow = true;
  for (const side of [-1, 1]) {
    const gr = mesh(G.plane, M.grass, 9, SEG, 1, side * 8.4, 0.005, 0, s); gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true;
    mesh(G.box, M.water, 2.2, 0.1, SEG, side * 14, -0.06, 0, s).receiveShadow = true;
    for (let k = 0; k < 6; k++) mesh(G.cylLo, M.reed, 0.04, 0.9, 0.04, side * (12.8 + hash(i * 31 + k) * 0.4), 0.4, (hash(i * 7 + k) - 0.5) * SEG, s);
    // fence along the path
    for (let k = 0; k < 6; k++) mesh(G.box, M.wood, 0.12, 0.9, 0.12, side * 4.3, 0.45, -SEG / 2 + k * 5 + 2.5, s).castShadow = true;
    mesh(G.box, M.woodL, 0.06, 0.08, SEG, side * 4.3, 0.75, 0, s); mesh(G.box, M.woodL, 0.06, 0.08, SEG, side * 4.3, 0.42, 0, s);
    const h = hash(i * 13 + (side > 0 ? 5 : 0));
    if (h < 0.55) cow(s, side * (6 + hash(i + side * 3) * 4), (hash(i * 3 + side) - 0.5) * SEG, hash(i * 5 + side) * 6);
    for (let k = 0; k < 3; k++) if (hash(i * 17 + k + side * 40) < 0.5) tree(s, side * (17 + hash(i * 9 + k + side) * 16), (hash(i * 11 + k + side) - 0.5) * SEG, 0.9 + hash(i + k) * 0.6);
    if (hash(i * 19 + side) < 0.3) {            // tulip field
      const f = group(side * (24 + hash(i + side) * 10), 0, (hash(i * 23 + side) - 0.5) * 10, s), tm = M.tulip[(hash(i * 29 + side) * 5) | 0];
      for (let r = 0; r < 6; r++) mesh(G.box, r % 2 ? tm : M.leaf2, 14, 0.4, 1.0, 0, 0.2, r * 1.6 - 4, f);
    }
    if (hash(i * 37 + side) < 0.16) windmill(s, side * (40 + hash(i + 2) * 30), (hash(i * 41) - 0.5) * SEG);
    else if (hash(i * 43 + side) < 0.12) farmhouse(s, side * (26 + hash(i + 4) * 8), (hash(i * 47) - 0.5) * SEG);
  }
  built.set(i, s);
}
function updateScenery(dist) {
  const a = Math.floor((dist - 30) / SEG), b = Math.floor((dist + AHEAD) / SEG);
  for (let i = a; i <= b; i++) if (!built.has(i)) buildSeg(i);
  for (const [i, s] of built) if (i < a || i > b + 2) { s.traverse(o => { if (o.userData.rot) mills.splice(mills.indexOf(o.userData.rot), 1); }); world.remove(s); built.delete(i); }
}
function clearScenery() { for (const s of built.values()) world.remove(s); built.clear(); mills.length = 0; }

// ---------- obstacles and coins ----------
// each thing: { type, d (front edge, meters along the track), len, lane, x, obj (Object3D) }
const things = [];
function addThing(t) {
  const o = new THREE.Group();
  t.x = t.lane === undefined ? 0 : LANES[t.lane];
  o.position.set(t.x, 0, -t.d);
  if (t.type === 'fence') {
    t.len = 0.3;
    for (const x of [-0.75, 0.75]) mesh(G.box, M.wood, 0.14, 1.05, 0.14, x, 0.52, -0.15, o);
    for (const y of [0.45, 0.85]) mesh(G.box, M.white, 1.7, 0.16, 0.08, 0, y, -0.15, o);
    mesh(G.box, M.red, 0.3, 0.16, 0.09, 0, 0.85, -0.16, o);
  } else if (t.type === 'hay') {
    t.len = 1.3;
    for (const [x, y] of [[-0.42, 0.45], [0.42, 0.45], [0, 1.33]]) { const b = mesh(G.cyl, M.hay, 0.45, 1.25, 0.45, x, y, -0.65, o); b.rotation.x = Math.PI / 2; mesh(G.cyl, M.hayD, 0.36, 1.27, 0.36, x, y, -0.65, o).rotation.x = Math.PI / 2; }
  } else if (t.type === 'beam') {
    t.len = 0.4;
    for (const x of [-0.85, 0.85]) mesh(G.box, M.wood, 0.16, 2.1, 0.16, x, 1.05, -0.2, o);
    mesh(G.box, M.woodL, 1.9, 0.5, 0.3, 0, 1.75, -0.2, o);
    for (let k = 0; k < 4; k++) mesh(G.box, k % 2 ? M.red : M.white, 0.42, 0.14, 0.32, -0.66 + k * 0.44, 1.55, -0.2, o);
    // yellow "duck" sign hanging under the beam
    const sign = new THREE.Mesh(G.plane, M.duckSign); sign.scale.set(0.8, 0.8, 1); sign.position.set(0, 1.02, -0.03); o.add(sign);
    for (const x of [-0.18, 0.18]) mesh(G.box, M.black, 0.03, 0.16, 0.03, x, 1.46, -0.04, o);
  } else if (t.type === 'ditch') {
    t.len = 2.8;
    mesh(G.box, M.water, 7.9, 0.1, t.len, 0, -0.04, -t.len / 2, o);
    mesh(G.box, mat(0x6e4f34), 7.9, 0.12, 0.2, 0, -0.02, -0.05, o);
    mesh(G.box, mat(0x6e4f34), 7.9, 0.12, 0.2, 0, -0.02, -t.len + 0.05, o);
    for (let k = 0; k < 8; k++) mesh(G.cylLo, M.reed, 0.04, 0.8, 0.04, (k % 2 ? 1 : -1) * (4.0 + hash(k) * 0.3), 0.35, -0.3 - hash(k + 4) * 2.2, o);
  } else if (t.type === 'cart') {
    t.len = 2.2; t.v = 5;
    mesh(G.box, M.woodL, 1.6, 0.8, 2.2, 0, 1.0, -1.1, o);
    mesh(G.box, M.hay, 1.5, 0.6, 2.0, 0, 1.6, -1.1, o);
    for (const x of [-0.85, 0.85]) for (const z of [-0.4, -1.8]) { const w = mesh(G.cyl, M.wood, 0.42, 0.12, 0.42, x, 0.42, z, o); w.rotation.z = Math.PI / 2; }
    mesh(G.box, M.wood, 0.1, 0.1, 1.4, -0.3, 0.6, 0.6, o); mesh(G.box, M.wood, 0.1, 0.1, 1.4, 0.3, 0.6, 0.6, o);
  } else if (t.type === 'coin') {
    t.len = 0; mesh(G.coin, M.coin, 1, 1, 1, 0, 0, 0, o).rotation.x = Math.PI / 2; o.position.y = t.y;
  } else if (t.type === 'gem') {
    t.len = 0; mesh(G.gem, M.gem, 1, 1.3, 1, 0, 0, 0, o); o.position.y = t.y;
  }
  if (t.type !== 'coin' && t.type !== 'gem') shadows(o, true);
  t.obj = o; world.add(o); things.push(t);
  return t;
}
function clearThings() { for (const t of things) world.remove(t.obj); things.length = 0; }

// row generator: always leaves a way through
let rand = Math.random, nextRow = 0, lastRowEnd = 0;
function pick(w) { let s = 0; for (const k in w) s += w[k]; let r = rand() * s; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; }
function coinsBetween(from, to, lane, rowLane) {
  const n = Math.min(8, Math.floor((to - from) / 2.4));
  if (n < 3) return;
  for (let k = 0; k < n; k++) addThing({ type: 'coin', d: from + k * 2.4, lane, y: 0.9 });
  if (rowLane === 'fence') addThing({ type: 'coin', d: to + 5.15, lane, y: 2.0 });
  if (rowLane === 'beam') addThing({ type: 'coin', d: to + 5.2, lane, y: 0.3 });
}
function spawnRow(d, v) {
  const w = { one: 3, two: d > 90 ? 3 : 0, ditch: d > 160 ? 1.3 : 0, three: d > 380 ? 1.6 : 0, cart: d > 550 ? 1.3 : 0 };
  const type = pick(w);
  const lanes = [null, null, null];
  let gapAfter = 0;
  const easy = () => (rand() < 0.5 ? 'fence' : 'beam');
  if (type === 'one') { lanes[(rand() * 3) | 0] = pick({ fence: 1, hay: 1.2, beam: d > 40 ? 1 : 0 }); }
  else if (type === 'two') { const free = (rand() * 3) | 0; for (let l = 0; l < 3; l++) if (l !== free) lanes[l] = rand() < 0.7 ? 'hay' : easy(); if (rand() < 0.35) lanes[free] = easy(); }
  else if (type === 'three') { const k = (rand() * 3) | 0; for (let l = 0; l < 3; l++) lanes[l] = l === k ? easy() : (rand() < 0.5 ? 'hay' : easy()); }
  if (type === 'ditch') { addThing({ type: 'ditch', d }); gapAfter = 2.8; }
  else if (type === 'cart') {
    const l = (rand() * 3) | 0, t = (d - dist) / v;
    addThing({ type: 'cart', d: d + 5 * t, lane: l, meet: d });
    if (d > 900 && rand() < 0.5) lanes[(l + 1 + ((rand() * 2) | 0)) % 3] = 'hay';
  }
  for (let l = 0; l < 3; l++) if (lanes[l]) addThing({ type: lanes[l], d, lane: l });
  // coins in a lane you can get through
  const ok = [0, 1, 2].filter(l => lanes[l] !== 'hay' && !(type === 'cart'));
  if (ok.length && rand() < 0.75) { const l = ok[(rand() * ok.length) | 0]; coinsBetween(lastRowEnd + 5, d - 5, l, lanes[l]); }
  if (rand() < 0.05 + Math.min(0.05, d / 20000)) { const l = ok.length ? ok[(rand() * ok.length) | 0] : 1; addThing({ type: 'gem', d: d - 8, lane: l, y: 1.1 }); }
  lastRowEnd = d + Math.max(gapAfter, 1.5);
}
function genAhead(v) {
  while (nextRow < dist + AHEAD) {
    spawnRow(nextRow, v);
    const gapT = Math.max(0.78, 1.45 - nextRow / 2600) + rand() * 0.55;
    const vAt = speedAt(nextRow) * A.speed;
    nextRow = lastRowEnd + Math.max(10, vAt * gapT);
  }
}

// ---------- game state ----------
const st = { mode: 'menu', paused: false };
// what you own: animals (coins) and styles (gems). Old test saves used 'pony'.
let animalKey = store.get('animal', 'horse');
if (animalKey === 'pony') animalKey = 'horse';
const owned = (store.get('owned', null) || (animalKey === 'ostrich' ? ['horse', 'ostrich'] : ['horse']))
  .map(k => (k === 'pony' ? 'horse' : k)).filter((k, i, all) => ANIMALS[k] && all.indexOf(k) === i);
if (!owned.includes('horse')) owned.unshift('horse');
store.set('owned', owned);
const ownedStyles = store.get('styles', {});   // animal -> [style keys]
const pickedStyle = store.get('style', {});    // animal -> style key
for (const o of [ownedStyles, pickedStyle]) if (o.pony && !o.horse) { o.horse = o.pony; delete o.pony; }
if (!ANIMALS[animalKey] || !owned.includes(animalKey)) animalKey = 'horse';
let A = ANIMALS[animalKey], styleKey = pickedStyle[animalKey] || STYLES[animalKey][0].key;
const styleOf = (k, sk) => STYLES[k].find(x => x.key === sk) || STYLES[k][0];
const hasStyle = (k, sk) => styleOf(k, sk).gems === 0 || (ownedStyles[k] || []).includes(sk);
let dist = 0, v = 0, lane = 1, px = 0, py = 0, vy = 0, slide = 0, coins = 0, gems = 0, dead = null, deadT = 0, t = 0;
let charge = 0, sprint = 0, runId = 0, milestone = 500, queuedJump = 0;
let animal = null, rider = makeRider(), riderFly = null;
const speedAt = d => 9.5 + 11 * (1 - Math.exp(-d / 1400));

// ready: the model for this animal has loaded (or failed: then a simple pony stands in)
const animalReady = k => !ANIMALS[k].model || (models[ANIMALS[k].model] && models[ANIMALS[k].model].state !== 'loading');
function setAnimal(key, sk) {
  if (animal) {
    if (animal.inner) animal.body.remove(animal.inner);
    if (animal.ownMats) animal.ownMats.forEach(m => m.dispose());
    scene.remove(animal.g);
  }
  animalKey = key; A = ANIMALS[key]; styleKey = sk || styleKey;
  const style = styleOf(key, styleKey);
  const m = A.model && models[A.model];
  if (A.model && m && m.state === 'ready') animal = makeModelAnimal(key, style);
  else if (key === 'ostrich') animal = makeOstrich(style);
  else {
    animal = makePony();
    if (A.model) loadModel(A.model, () => { if (animalKey === key && st.mode !== 'run') setAnimal(key); menuStats(); });
  }
  scene.add(animal.g);
  animal.body.add(rider.g);
  rider.g.position.set(0, animal.saddleY || 1.5, animal.saddleZ || 0);
  rider.g.rotation.set(0, 0, 0);
  rider.fit(animal.spread || A.spread);
  rider.saddle.visible = animal.kind === 'model';
  if (animal.kind === 'model') { animateModel(animal, 0); }
}

// hints for new players: shown once per obstacle type per run, only while best < 1500 m
const HINTS = {
  beam: () => (isTouch ? 'Swipe DOWN to duck!' : 'Press DOWN to duck!'),
  fence: () => (isTouch ? 'Swipe UP to jump!' : 'Press UP to jump!'),
  hay: () => 'Switch lanes!',
  ditch: () => 'Jump over the ditch!',
};
let hintsLeft = 0, hintSeen = {};
function startRun() {
  if (!canRide()) { if (st.mode !== 'menu') toMenu(); return; }
  runId++;
  clearThings(); clearScenery();
  rand = rng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  dist = 0; v = speedAt(0) * A.speed; lane = 1; px = 0; py = 0; vy = 0; slide = 0; coins = 0; gems = 0; dead = null; deadT = 0; t = 0;
  charge = 0; sprint = 0; milestone = 500; queuedJump = 0; shake = 0;
  nextRow = 34; lastRowEnd = 20;
  setAnimal(animalKey);
  animal.g.position.set(0, 0, 0); animal.g.rotation.set(0, 0, 0); animal.body.position.set(0, 0, 0); animal.body.rotation.set(0, 0, 0); animal.body.scale.set(1, 1, 1);
  updateScenery(0); genAhead(v);
  st.mode = 'run'; st.paused = false;
  camera.fov = 55; camera.updateProjectionMatrix();   // the menu used a narrower view
  show('hud'); setPowerButton();
  banner('GO!', 900);
  hintSeen = {}; hintsLeft = store.get('best', 0) < 1500 ? 1 : 0;
  hud();
}

// ---------- actions ----------
function act(a) {
  if (st.mode !== 'run' || st.paused || dead) return;
  if (a === 'left' && lane > 0) { lane--; sound('lane'); }
  else if (a === 'right' && lane < 2) { lane++; sound('lane'); }
  else if (a === 'jump') {
    if (py <= 0.001) doJump();
    else if (A.ability === 'double' && !usedDouble) { usedDouble = true; vy = A.jump * 0.85; airT = 0; airTotal = 2 * vy / GRAV; slide = 0; sound('jump'); puff(px, py + 0.4, 0.3, 0xffffff, 0, -1, 2, 0.5, 1.2, true, 0.6); }
    else queuedJump = 0.15;
  }
  else if (a === 'duck') { queuedJump = 0; if (py > 0.001) { vy = Math.min(vy, -16); slide = 0.75; } else { slide = 0.75; sound('duck'); } }
  else if (a === 'ability' && POWERS[A.ability] && charge >= 1 && !sprint) { const P = POWERS[A.ability]; sprint = P.time; charge = 0; sound('sprint'); banner(P.label + '!', 800); }
}
let usedDouble = false, airT = 0, airTotal = 1;
function doJump() { vy = A.jump; py = 0.002; slide = 0; queuedJump = 0; usedDouble = false; airT = 0; airTotal = 2 * vy / GRAV; sound('jump'); }

// ---------- update ----------
function update(dt) {
  t += dt;
  updateParts(dt);
  if (dead) { updateDead(dt); return; }
  const P = POWERS[A.ability];
  const target = speedAt(dist) * A.speed * (sprint > 0 && P ? P.speed : 1);
  v += (target - v) * Math.min(1, dt * 3);
  dist += v * dt;
  // lanes
  const tx = LANES[lane];
  px += Math.sign(tx - px) * Math.min(Math.abs(tx - px), A.laneSpeed * dt);
  // jump and duck
  if (py > 0 || vy > 0) { airT += dt; vy -= GRAV * dt; py += vy * dt; if (py <= 0) { py = 0; vy = 0; if (queuedJump > 0) doJump(); else dust(6); } }
  if (queuedJump > 0) queuedJump -= dt;
  if (slide > 0) slide -= dt;
  if (sprint > 0) { sprint -= dt; if (sprint <= 0) sprint = 0; }
  else if (P && charge < 1) { charge = Math.min(1, charge + dt / P.charge); if (charge >= 1) sound('ready'); }
  if (Math.floor(dist) >= milestone) { banner(milestone + ' m!', 1100); sound('mile'); milestone += 500; }
  // hits and pickups
  for (let i = things.length - 1; i >= 0; i--) {
    const o = things[i];
    if (o.v && !o.gone) { o.d = o.meet + o.v * (o.meet - dist) / Math.max(4, v); o.obj.position.z = -o.d; }
    if (o.d + o.len < dist - 12) { world.remove(o.obj); things.splice(i, 1); continue; }
    if (o.gone) continue;
    if (o.type === 'coin' || o.type === 'gem') {
      // wolf: coins close ahead fly to you
      if (A.ability === 'magnet' && o.d - dist < 9 && o.d - dist > -0.5) {
        const k = Math.min(1, dt * 9); o.x += (px - o.x) * k; o.y += (py + 1.0 - o.y) * k; o.d += (dist - o.d) * k * 0.5;
        o.obj.position.set(o.x, o.y, -o.d);
      }
      if (Math.abs(o.d - dist) < 0.9 && Math.abs(o.x - px) < 1.0 && Math.abs(o.y - (py + (slide > 0 && py < 0.2 ? 0.45 : 1.0))) < 0.62) {
        o.gone = true; o.obj.visible = false;
        if (o.type === 'coin') { coins++; sound('coin'); } else { gems++; coins += 25; sound('gem'); banner('💎 +25', 900); }
        sparkle(o.x, o.y, -o.d, o.type === 'gem' ? 0x6fd8ff : 0xffd34d);
        hud();
      }
      continue;
    }
    if (!o.hinted && hintsLeft > 0 && HINTS[o.type] && o.d - dist < 16 && o.d > dist && (o.type === 'ditch' || Math.abs(o.x - LANES[lane]) < 0.5)) {
      o.hinted = true; const k = o.type; if (!hintSeen[k] && !(k === 'fence' && A.ability === 'charge')) { hintSeen[k] = 1; banner(HINTS[k](), 1300); }
    }
    const front = dist + 0.9, back = dist - 0.7;
    if (o.d > front || o.d + o.len < back) continue;
    if (o.type === 'ditch') {
      if (py <= 0 && dist > o.d + 0.35 && dist < o.d + o.len - 0.35 && !sprint) return die('ditch');
      continue;
    }
    if (Math.abs(o.x - px) > 0.95) continue;
    let hit = false;
    if (o.type === 'fence') hit = py < 0.85;
    else if (o.type === 'beam') hit = !(slide > 0 && py < 0.2);
    else hit = true;
    if (hit) { if (sprint > 0 || (A.ability === 'charge' && o.type === 'fence')) smash(o); else return die(o.type); }
  }
  if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) { genAhead(v); updateScenery(dist); }
  hud();
}
function smash(o) {
  o.gone = true; o.fly = { vx: (o.x - px || (rand() - 0.5)) * 3 + (rand() - 0.5) * 4, vy: 7, vz: -v * 0.9, r: (rand() - 0.5) * 12 };
  sound('smash'); dust(10);
}
function die(why) {
  dead = why; deadT = 0; sound(why === 'ditch' ? 'splash' : 'hit');
  if (why !== 'ditch') v = Math.min(v, 2.5);   // stop at what you hit, don't slide through it
  // rider flies off
  const wp = new THREE.Vector3(); rider.g.getWorldPosition(wp);
  animal.body.remove(rider.g); scene.add(rider.g); rider.g.position.copy(wp); rider.saddle.visible = false;
  riderFly = { vx: (rand() - 0.5) * 1.5, vy: why === 'ditch' ? 3 : 6.5, vz: -Math.max(4, v * 0.55), spin: why === 'ditch' ? 3 : 7 };
  if (why === 'ditch') splash(px, -dist); else dust(14);
  shake = 0.45;
}
function updateDead(dt) {
  deadT += dt;
  if (py > 0) { vy -= GRAV * dt; py = Math.max(0, py + vy * dt); }
  hud();
  v = Math.max(0, v - dt * 30); dist += v * dt;
  const f = riderFly;
  f.vy -= GRAV * dt;
  rider.g.position.x += f.vx * dt; rider.g.position.y += f.vy * dt; rider.g.position.z += f.vz * dt; rider.g.rotation.x -= f.spin * dt;
  const floor = dead === 'ditch' ? -0.3 : 0.25;
  if (rider.g.position.y < floor) { rider.g.position.y = floor; f.vy = Math.abs(f.vy) * 0.3; f.vx *= 0.6; f.vz *= 0.5; f.spin *= 0.5; }
  if (deadT > 1.35 && st.mode === 'run') gameOver();
}

// ---------- game over ----------
let overAt = 0;
const TITLES = { fence: 'Tripped over a fence!', hay: 'Bonk! Hay is hard.', beam: 'Duck next time!', cart: 'Hit by a hay cart!', ditch: 'Splash! Into the ditch.' };
function gameOver() {
  st.mode = 'over';
  const m = Math.floor(dist), best = store.get('best', 0), bank = store.get('coins', 0) + coins;
  store.set('coins', bank);
  const gemBank = store.get('gems', 0) + gems; store.set('gems', gemBank);
  const isBest = m > best; if (isBest) store.set('best', m);
  ui.overTitle.textContent = TITLES[dead] || 'Ouch!';
  ui.oDist.textContent = m; ui.oCoins.textContent = coins;
  ui.newBest.classList.toggle('hidden', !isBest);
  ui.oInfo.innerHTML = 'Best: ' + Math.max(m, best) + ' m · Saved: 🪙 ' + bank + '  💎 ' + gemBank + '<br>Spend 🪙 on new animals and 💎 on styles in the stable.';
  overAt = performance.now();
  show('over');
}

// ---------- particles ----------
const parts = [];
const partMat = c => new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, depthWrite: false });
function puff(x, y, z, c, vx, vy, vz, life, size, add, alpha) {
  const s = new THREE.Sprite(partMat(c)); if (add) s.material.blending = THREE.AdditiveBlending;
  s.position.set(x, y, z); s.scale.setScalar(size); scene.add(s);
  parts.push({ s, vx, vy, vz, life, max: life, size, alpha: alpha || (add ? 1 : 0.45) });
}
function dust(n) { for (let i = 0; i < n; i++) puff(px + (Math.random() - 0.5) * 0.8, 0.2, 0.6 + Math.random() * 0.6, 0xd8c08a, (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, 2 + Math.random() * 2, 0.6, 0.6, false); }
function sparkle(x, y, z, c) { for (let i = 0; i < 8; i++) puff(x, y, z + dist, c, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 3 + 4, 0.45, 0.5, true); }
function splash(x) { for (let i = 0; i < 24; i++) puff(x + (Math.random() - 0.5), 0.1, -0.3, 0xbfe4ff, (Math.random() - 0.5) * 5, 3 + Math.random() * 5, (Math.random() - 0.5) * 3, 0.9, 0.7, false); }
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); parts.splice(i, 1); continue; }
    p.vy -= 6 * dt; p.s.position.x += p.vx * dt; p.s.position.y = Math.max(0.05, p.s.position.y + p.vy * dt); p.s.position.z += p.vz * dt;
    const k = p.life / p.max; p.s.material.opacity = k * p.alpha; p.s.scale.setScalar(p.size * (1.6 - k * 0.6));
  }
}

// ---------- draw ----------
let shake = 0, camX = 0;
// model animals: we pick the frame of each clip ourselves (gallop follows speed, jump follows the jump)
const _v = new THREE.Vector3();
function animateModel(a, dt) {
  const m = a.model, acts = m.acts, air = py > 0.001, cfg = ANIMALS[animalKey];
  const running = !dead || deadT < 0.15;
  if (running) a.cycle += dt * Math.max(v, st.mode === 'run' ? 0 : 7) / cfg.stride;
  const target = { gallop: 1, jump: 0, death: 0 };
  if (dead && dead !== 'ditch') { target.gallop = 0; target.death = 1; }
  else if (air && !dead) { target.gallop = 0; target.jump = 1; }
  const k = Math.min(1, dt * 14);
  for (const n in target) a.w[n] += (target[n] - a.w[n]) * (dt === 0 ? 1 : k);
  const G1 = acts.Gallop, J = acts.Gallop_Jump, D = acts.Death;
  if (G1) { G1.time = (a.cycle % 1) * G1.getClip().duration; G1.setEffectiveWeight(a.w.gallop); }
  if (J) { const f = Math.min(1, airT / Math.max(0.2, airTotal)); J.time = (0.12 + f * 0.6) * J.getClip().duration; J.setEffectiveWeight(a.w.jump); }
  if (D) { D.time = Math.min(D.getClip().duration * 0.95, (dead ? deadT : 0) * 1.6); D.setEffectiveWeight(a.w.death); }
  m.mixer.update(0);
  // keep the rider on the back bone
  if (m.seat && rider.g.parent === a.body) {
    m.seat.updateWorldMatrix(true, false);
    m.seat.getWorldPosition(_v); a.body.worldToLocal(_v);
    rider.g.position.set(_v.x, _v.y + cfg.seat, _v.z - cfg.seatZ);
  }
}
function animateAnimal(dt) {
  const a = animal; if (!a) return;
  if (a.kind === 'model') {
    const air = py > 0.001, duck = slide > 0 && !air;
    a.body.scale.y += ((duck ? 0.66 : 1) - a.body.scale.y) * Math.min(1, dt * 18);
    a.g.position.set(px, py, 0);
    a.g.rotation.y = (px - LANES[lane]) * 0.18;
    if (dead === 'ditch') { a.g.position.y = -Math.min(1.1, deadT * 1.6); a.g.rotation.x = Math.min(0.5, deadT); }
    animateModel(a, dt);
    if (!dead) { rider.chest.rotation.x = -(duck ? 0.9 : sprint > 0 ? 0.6 : 0.25) - (air ? 0.15 : 0); rider.chest.position.y = 0.25; rider.arms.forEach((s, i) => { s.rotation.x = 1.0 + Math.sin(a.cycle * 12 + i) * 0.1; }); }
    if (sprint > 0 && Math.random() < 0.5) puff(px + (Math.random() - 0.5) * 0.9, 0.8 + Math.random() * 1.2, 1 + Math.random(), A.ability === 'charge' ? 0xff6a3a : 0xffd34d, 0, 0.5, 6, 0.35, 0.7, true);
    if (!air && !dead && Math.random() < dt * v * 0.5) puff(px + (Math.random() - 0.5) * 0.7, 0.15, 1.0, 0xd8c08a, (Math.random() - 0.5), 0.8, 3, 0.5, 0.45, false);
    glowPuffs(a, dt);
    return;
  }
  const running = !dead || deadT < 0.25;
  const gait = a.kind === 'ostrich' ? 1.55 : 1.15;
  a.phase = (a.phase || 0) + dt * v * gait * (running ? 1 : 0);
  const p = a.phase, air = py > 0.001;
  for (const L of a.legs) {
    if (air) { L.hip.rotation.x = L.front ? -0.7 : 0.6; L.knee.rotation.x = L.front ? 1.0 : -0.3; if (L.bird) { L.hip.rotation.x = -0.4; L.knee.rotation.x = 0.9; } continue; }
    const s = Math.sin(p + L.o);
    L.hip.rotation.x = s * (L.bird ? 0.85 : 0.75);
    L.knee.rotation.x = L.bird ? -Math.max(0, -Math.cos(p + L.o)) * 1.3 : (L.front ? Math.max(0, Math.cos(p + L.o)) * 1.1 : -Math.max(0, Math.cos(p + L.o)) * 0.6);
  }
  const bob = air ? 0 : Math.abs(Math.sin(p)) * (a.kind === 'ostrich' ? 0.12 : 0.09);
  const duck = slide > 0 && !air;
  const sq = duck ? 0.62 : 1;
  a.body.scale.y += (sq - a.body.scale.y) * Math.min(1, dt * 18);
  a.body.position.y = bob;
  a.body.rotation.x = air ? (vy > 0 ? -0.18 : 0.12) : Math.sin(p * 2) * 0.03;
  a.neck.rotation.x = (duck ? 0.6 : 0) + Math.sin(p * 2) * 0.06;
  if (a.tail) a.tail.rotation.x = 0.3 + Math.sin(p * 1.3) * 0.25;
  // rider leans
  if (!dead) { rider.chest.rotation.x = -(duck ? 0.9 : sprint > 0 ? 0.6 : 0.25) - (air ? 0.15 : 0); rider.chest.position.y = 0.25 + bob * 0.3; rider.arms.forEach((s, i) => { s.rotation.x = 1.0 + Math.sin(p * 2 + i) * 0.1; }); }
  // turning when switching lanes
  a.g.position.set(px, py, 0);
  a.g.rotation.y = (px - LANES[lane]) * 0.18;
  if (dead && dead !== 'ditch') { a.g.rotation.x = Math.min(1.2, deadT * 4); a.g.position.y = Math.min(0.4, deadT * 2) - Math.max(0, deadT - 0.3) * 0.8; }
  if (dead === 'ditch') { a.g.position.y = -Math.min(1.1, deadT * 1.6); a.g.rotation.x = Math.min(0.5, deadT); }
  // sprint glow
  if (sprint > 0 && Math.random() < 0.5) puff(px + (Math.random() - 0.5) * 0.9, 0.8 + Math.random() * 1.2, 1 + Math.random(), 0xffd34d, 0, 0.5, 6, 0.35, 0.7, true);
  if (!air && !dead && Math.random() < dt * v * 0.5) puff(px + (Math.random() - 0.5) * 0.7, 0.15, 0.8, 0xd8c08a, (Math.random() - 0.5), 0.8, 3, 0.5, 0.45, false);
  glowPuffs(a, dt);
}
// glowing styles leave a few sparks
function glowPuffs(a, dt) {
  const style = styleOf(animalKey, styleKey);
  if (!style.glow || dead || a.kind === 'pony' || Math.random() > dt * 14) return;
  const c = style.trail || Object.values(style.glow).sort((x, y) => y - x)[0];
  const col = new THREE.Color(c).multiplyScalar(2.5).getHex();
  puff(px + (Math.random() - 0.5) * 0.8, py + 0.6 + Math.random() * 1.2, 0.4 + Math.random() * 1.2, col, 0, 0.6, 3, 0.5, 0.35, true, 0.8);
}
// menu: look at the animal from the front-side, so you can see its style (it sits in the gap between title and stable)
function menuCamera(dt, aspect, portrait) {
  // keep about 5.5 m of width in view, also on a narrow phone
  const fov = 40, halfW = 2.4, r = Math.max(6.5, halfW / (Math.tan(fov * Math.PI / 360) * aspect));
  const a = 1.05 + Math.sin(t * 0.25) * 0.12;
  camera.position.set(Math.sin(a) * r, 1.4 + r * 0.12, -Math.cos(a) * r);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.lookAt(0, portrait ? 0.25 : 0.9, 0);
  sun.position.set(camera.position.x - 10, 22, 8); sun.target.position.set(0, 0, -6);
  sky.position.set(camera.position.x, 0, camera.position.z);
  sunBall.position.set(camera.position.x + 120, 95, -420); sunGlow.position.copy(sunBall.position);
  farGround.position.set(camera.position.x, -0.05, -300);
  clouds.position.z = (t * 1.5) % 60;
  renderer.render(scene, camera);
}
function draw(dt) {
  world.position.z = dist;
  animateAnimal(dt);
  for (const o of things) {
    if (o.type === 'coin' || o.type === 'gem') { o.obj.rotation.y += dt * 4; continue; }
    if (o.fly) { o.fly.vy -= GRAV * dt; o.obj.position.x += o.fly.vx * dt; o.obj.position.y += o.fly.vy * dt; o.obj.position.z += o.fly.vz * dt; o.obj.rotation.z += o.fly.r * dt; o.obj.rotation.x += o.fly.r * 0.5 * dt; if (o.obj.position.y < -5) o.obj.visible = false; }
  }
  mills.forEach((r, i) => { r.rotation.z += dt * (0.8 + (i % 3) * 0.2); });
  if (st.mode !== 'run' || st.paused) updateParts(dt);
  // camera behind and above
  const aspect = innerWidth / innerHeight, portrait = aspect < 1;
  if (st.mode === 'menu') { menuCamera(dt, aspect, portrait); return; }
  camX += (px * 0.55 - camX) * Math.min(1, dt * 6);
  const back = portrait ? 7.2 : 6.2, up = portrait ? 4.4 : 3.6;
  shake = Math.max(0, shake - dt);
  const sh = shake * 0.5;
  // a bit to the right of the animal, so you also see its side
  const side = portrait ? 1.7 : 2.6;
  camera.position.set(camX + side + (Math.random() - 0.5) * sh, up + py * 0.35 + (Math.random() - 0.5) * sh, back);
  camera.lookAt(camX * 0.6 + side * 0.2, 1.4 + py * 0.25, -8);
  const sprintFov = sprint > 0 ? 6 : 0;
  const baseV = portrait ? Math.min(82, 2 * Math.atan(Math.tan(31 * Math.PI / 180) / aspect) * 180 / Math.PI) : 55;
  const fov = baseV + sprintFov;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  sun.position.set(camera.position.x - 10, 22, 8); sun.target.position.set(camera.position.x, 0, -6);
  sky.position.set(camera.position.x, 0, camera.position.z);
  sunBall.position.set(camera.position.x + 120, 95, -420); sunGlow.position.copy(sunBall.position);
  farGround.position.set(camera.position.x, -0.05, -300);
  clouds.position.z = (t * 1.5) % 60;
  renderer.render(scene, camera);
}

// ---------- ui ----------
const $ = id => document.getElementById(id);
const ui = { hud: $('hud'), dist: $('dist'), coins: $('coins'), ability: $('ability'), banner: $('banner'), menu: $('menu'), paused: $('paused'), over: $('over'),
  overTitle: $('overTitle'), oDist: $('oDist'), oCoins: $('oCoins'), newBest: $('newBest'), oInfo: $('oInfo'), menuStats: $('menuStats') };
function show(which) {
  for (const k of ['menu', 'paused', 'over']) ui[k].classList.toggle('hidden', k !== which);
  ui.hud.classList.toggle('hidden', which === 'menu');
  if (which !== 'hud' && which !== 'paused') ui.ability.classList.add('hidden');
  if (which === 'menu') menuStats();
}
let lastHud = '';
function hud() {
  const s = Math.floor(dist) + '|' + coins + '|' + Math.round(charge * 50) + '|' + (sprint > 0);
  if (s === lastHud) return; lastHud = s;
  ui.dist.innerHTML = Math.floor(dist) + '<small> m</small>';
  ui.coins.textContent = '🪙 ' + coins + (gems ? '  💎 ' + gems : '');
  const P = POWERS[A.ability];
  ui.ability.style.setProperty('--p', (sprint > 0 && P ? sprint / P.time : charge) * 100 + '%');
  ui.ability.classList.toggle('ready', charge >= 1 && !sprint);
}
let bannerTimer = 0;
function banner(text, ms) { ui.banner.textContent = text; ui.banner.style.opacity = 1; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { ui.banner.style.opacity = 0; }, ms); }
// ---------- stable (menu): pick, buy and style your animal ----------
// You can look at any animal or style first. The big button buys it, or rides when you own it.
const playBtn = $('playBtn');
function menuStats() {
  const best = store.get('best', 0), bank = store.get('coins', 0), gemBank = store.get('gems', 0);
  ui.menuStats.textContent = best ? 'Best: ' + best + ' m' : '';
  $('wallet').textContent = '🪙 ' + bank + '    💎 ' + gemBank;
  $('pick').innerHTML = Object.keys(ANIMALS).map(k => {
    const a = ANIMALS[k], own = owned.includes(k);
    return '<button class="animal' + (k === animalKey ? ' on' : '') + (own ? '' : ' locked') + '" data-a="' + k + '"><span class="em">' + a.em + '</span><b>' + a.name + '</b><small>' + (own ? 'Yours' : '🪙 ' + a.price) + '</small></button>';
  }).join('');
  const a = ANIMALS[animalKey];
  $('info').textContent = a.info;
  const noModel = a.model && models[a.model] && models[a.model].state === 'failed';
  $('styles').innerHTML = noModel ? '<p class="how">Could not load this animal. Check your internet.</p>' : STYLES[animalKey].map(x => '<button class="style' + (x.key === styleKey ? ' on' : '') + '" data-s="' + x.key + '"><i style="background:' + x.sw + '"></i>' + x.name + (hasStyle(animalKey, x.key) ? '' : ' <small>💎 ' + x.gems + '</small>') + '</button>').join('');
  // the big button
  const sx = styleOf(animalKey, styleKey);
  playBtn.disabled = false;
  if (!owned.includes(animalKey)) { playBtn.disabled = bank < a.price; playBtn.textContent = (playBtn.disabled ? 'NEED 🪙 ' : 'BUY 🪙 ') + a.price; playBtn.dataset.do = 'buy'; }
  else if (!hasStyle(animalKey, styleKey)) { playBtn.disabled = gemBank < sx.gems; playBtn.textContent = (playBtn.disabled ? 'NEED 💎 ' : 'UNLOCK 💎 ') + sx.gems; playBtn.dataset.do = 'style'; }
  else if (!animalReady(animalKey)) { playBtn.textContent = 'LOADING…'; playBtn.disabled = true; playBtn.dataset.do = ''; }
  else { playBtn.textContent = 'RIDE'; playBtn.dataset.do = 'ride'; }
  // keep the chosen card and style in view in the scroll rows
  for (const row of [$('pick'), $('styles')]) { const on = row.querySelector('.on'); if (on) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2); }
}
function canRide() { return owned.includes(animalKey) && hasStyle(animalKey, styleKey) && animalReady(animalKey); }
$('pick').addEventListener('click', e => {
  const b = e.target.closest('.animal'); if (!b) return; b.blur();
  const k = b.dataset.a; if (k === animalKey) return;
  setAnimal(k, pickedStyle[k] || STYLES[k][0].key);
  if (owned.includes(k)) store.set('animal', k);
  menuStats(); sound('lane');
});
$('styles').addEventListener('click', e => {
  const b = e.target.closest('.style'); if (!b) return; b.blur();
  setAnimal(animalKey, b.dataset.s);
  if (hasStyle(animalKey, styleKey)) { pickedStyle[animalKey] = styleKey; store.set('style', pickedStyle); }
  menuStats(); sound('lane');
});
let buyAt = 0;
playBtn.addEventListener('click', () => {
  unlockAudio(); playBtn.blur();
  if (performance.now() - buyAt < 450) return;   // a double tap on BUY should not start a run
  const d = playBtn.dataset.do;
  if (d === 'buy' || d === 'style') buyAt = performance.now();
  if (d === 'buy') {
    const bank = store.get('coins', 0), price = ANIMALS[animalKey].price; if (bank < price) return;
    store.set('coins', bank - price); owned.push(animalKey); store.set('owned', owned); store.set('animal', animalKey);
    sound('gem'); banner(ANIMALS[animalKey].name + ' is yours!', 1400);
  } else if (d === 'style') {
    const gemBank = store.get('gems', 0), x = styleOf(animalKey, styleKey); if (gemBank < x.gems) return;
    store.set('gems', gemBank - x.gems); (ownedStyles[animalKey] = ownedStyles[animalKey] || []).push(x.key); store.set('styles', ownedStyles);
    pickedStyle[animalKey] = x.key; store.set('style', pickedStyle); sound('gem'); banner(x.name + ' unlocked!', 1400);
  } else if (d === 'ride') { startRun(); return; }
  menuStats();
});
$('againBtn').addEventListener('click', () => { unlockAudio(); startRun(); });
$('menuBtn').addEventListener('click', toMenu);
$('quitBtn').addEventListener('click', toMenu);
$('resumeBtn').addEventListener('click', resume);
$('pauseBtn').addEventListener('click', e => { e.stopPropagation(); e.currentTarget.blur(); pause(); });
ui.ability.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); act('ability'); });
let muted = store.get('muted', false);
const muteBtn = $('muteBtn');
muteBtn.textContent = muted ? '🔇' : '🔊';
muteBtn.addEventListener('click', e => { e.stopPropagation(); e.currentTarget.blur(); muted = !muted; store.set('muted', muted); muteBtn.textContent = muted ? '🔇' : '🔊'; });
function toMenu() { runId++; sprint = 0; slide = 0; vy = 0; queuedJump = 0; charge = 0; shake = 0; v = 0; st.mode = 'menu'; st.paused = false; clearThings(); clearScenery(); dist = 0; dead = null; py = 0; px = 0; lane = 1; setAnimal(animalKey); updateScenery(0); show('menu'); }
function pause() { if (st.mode !== 'run' || dead || st.paused) return; st.paused = true; show('paused'); }
function resume() { if (!st.paused) return; st.paused = false; ui.paused.classList.add('hidden'); setPowerButton(); last = performance.now(); }
function setPowerButton() {
  const P = POWERS[A.ability];
  ui.ability.classList.toggle('hidden', !P);
  if (P) ui.ability.innerHTML = '<span>' + P.icon + '</span>' + P.label;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// keyboard
const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'duck', KeyS: 'duck', ShiftLeft: 'ability', ShiftRight: 'ability', KeyE: 'ability' };
// Space/Enter are ours: never let them also press a focused button
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') e.preventDefault(); });
addEventListener('keydown', e => {
  if ((e.code === 'Space' || e.code === 'Enter') && document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
  if (e.repeat) return;
  if ((e.code === 'Escape' || e.code === 'KeyP') && st.mode === 'run') { st.paused ? resume() : pause(); return; }
  if (st.paused && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); resume(); return; }
  if (st.mode !== 'run') { if ((e.code === 'Space' || e.code === 'Enter') && !ui.menu.classList.contains('hidden') || (st.mode === 'over' && performance.now() - overAt > 800 && (e.code === 'Space' || e.code === 'Enter'))) { e.preventDefault(); unlockAudio(); startRun(); } return; }
  const a = KEYS[e.code]; if (a) { e.preventDefault(); unlockAudio(); act(a); }
});
// touch / mouse swipes
let sw = null;
canvas.addEventListener('pointerdown', e => { if (st.mode !== 'run') return; unlockAudio(); if (sw) return; sw = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), done: false }; });
addEventListener('pointermove', e => {
  if (!sw || sw.done || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y, th = Math.max(24, Math.min(innerWidth, innerHeight) * 0.05);
  if (Math.abs(dx) > th || Math.abs(dy) > th) { sw.done = true; act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'jump' : 'duck')); }
});
addEventListener('pointerup', e => { if (sw && e.pointerId !== sw.id) return; if (sw && !sw.done && performance.now() - sw.t < 350) act('jump'); sw = null; });
addEventListener('pointercancel', e => { if (sw && e.pointerId === sw.id) sw = null; });

// ---------- sound (tiny synth, no files) ----------
let ac = null;
function unlockAudio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); }
function tone(f, d, type, vol, f2, delay) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  g.gain.setValueAtTime(vol || 0.15, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
  o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
}
function noise(d, vol, f) {
  if (!ac || muted) return;
  const b = ac.createBuffer(1, ac.sampleRate * d, ac.sampleRate), ch = b.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  fl.type = 'lowpass'; fl.frequency.value = f || 900; g.gain.value = vol || 0.3; s.buffer = b; s.connect(fl).connect(g).connect(ac.destination); s.start();
}
function sound(k) {
  if (k === 'coin') tone(1320, 0.12, 'square', 0.05, 1760);
  else if (k === 'gem') { tone(880, 0.1, 'triangle', 0.12); tone(1320, 0.1, 'triangle', 0.12, 0, 0.08); tone(1760, 0.2, 'triangle', 0.12, 0, 0.16); }
  else if (k === 'jump') tone(300, 0.18, 'triangle', 0.12, 620);
  else if (k === 'duck') tone(400, 0.12, 'triangle', 0.08, 200);
  else if (k === 'lane') tone(520, 0.06, 'sine', 0.06, 640);
  else if (k === 'hit') { noise(0.35, 0.5, 600); tone(160, 0.3, 'sawtooth', 0.12, 60); }
  else if (k === 'splash') noise(0.6, 0.45, 1800);
  else if (k === 'smash') { noise(0.25, 0.4, 1200); tone(220, 0.2, 'square', 0.06, 90); }
  else if (k === 'sprint') { tone(300, 0.4, 'sawtooth', 0.08, 900); }
  else if (k === 'ready') { tone(660, 0.1, 'sine', 0.08); tone(990, 0.15, 'sine', 0.08, 0, 0.1); }
  else if (k === 'mile') { tone(660, 0.12, 'triangle', 0.1); tone(880, 0.12, 'triangle', 0.1, 0, 0.12); tone(1100, 0.25, 'triangle', 0.1, 0, 0.24); }
}

// ---------- loop ----------
function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowQuality ? 1 : isTouch ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (window.__st && window.__st.hold) return;
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (st.paused) { renderer.render(scene, camera); return; }
  if (st.mode === 'run') { acc += dt; while (acc >= STEP) { update(STEP); acc -= STEP; } }
  else if (st.mode === 'menu') { v = 7; dist += v * dt; t += dt; if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) updateScenery(dist); }
  draw(dt);
  // slow device: drop shadows and resolution
  if (st.mode === 'run' && !lowQuality) { fpsT += dt; fpsN++; if (fpsT > 4) { if (fpsN / fpsT < 32) { lowQuality = true; renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); resize(); } fpsT = 0; fpsN = 0; } }
}
// load the models: your own animal first, then the rest
for (const k of [animalKey, ...Object.keys(ANIMALS)]) if (ANIMALS[k].model) loadModel(ANIMALS[k].model, () => { if (st.mode === 'menu') { if (k === animalKey) setAnimal(animalKey); menuStats(); } });
setAnimal(animalKey); updateScenery(0); show('menu');
requestAnimationFrame(frame);

// ---------- test hook (only on this computer) ----------
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window.__st = {
    hold: false, start: (k, sk) => { if (k) { if (!owned.includes(k)) owned.push(k); setAnimal(k, sk || STYLES[k][0].key); if (sk && !hasStyle(k, sk)) (ownedStyles[k] = ownedStyles[k] || []).push(sk); } startRun(); }, act, update,
    sim(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n && st.mode === 'run'; i++) update(STEP); },
    step(n, dt) { for (let i = 0; i < (n || 1); i++) { if (st.mode === 'run') update(dt || STEP); draw(dt || STEP); } },
    get state() { return { mode: st.mode, dist, v, lane, px, py, slide, coins, gems, dead, charge, sprint, things: things.length }; },
    things: () => things.filter(o => !o.gone).map(o => ({ type: o.type, d: o.d, len: o.len, lane: o.lane, y: o.y })),
    // test: generate rows up to distance `to` and report rows with no way through
    genCheck(to) {
      const bad = []; let rows = 0;
      while (nextRow < to) { const before = things.length; const d = nextRow; spawnRow(nextRow, speedAt(nextRow)); rows++;
        const row = things.slice(before).filter(o => o.type === 'hay' || o.type === 'cart');
        const blocked = new Set(row.map(o => o.lane));
        if (blocked.size >= 3) bad.push({ d, row: row.map(o => o.type + o.lane) });
        for (const o of things.slice(before)) world.remove(o.obj); things.length = before;
        nextRow = lastRowEnd + Math.max(10, speedAt(nextRow) * 1.2); }
      return { rows, bad: bad.slice(0, 10), nBad: bad.length };
    },
    jumpTo(d) { dist = d; updateScenery(dist); },
    renderer, scene, camera,
  };
}

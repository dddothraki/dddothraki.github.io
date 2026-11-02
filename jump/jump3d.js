// Ditch Jumper in 3D (three.js). De spelregels staan in game.js; dit bestand tekent alleen.
// game.js roept elke frame window.__jumpR.draw(view) aan. Lukt 3D niet, dan blijft de 2D-versie gewoon draaien.
import * as THREE from '../dash/vendor/three.module.min.js';

const S = 0.042;            // wereld-eenheden per logische px (boer ~42 px = 1,75 m)
const Z_FRONT = 26;         // land en sloten lopen naar voren tot hier
const Z_BACK = -150;        // en naar achteren tot hier
const WATER_Y = -30 * S;
const FOV = 38, TILT = 6 * Math.PI / 180;
const FS = 1.3;              // boer iets groter dan in 2D, zodat hij goed te zien is

const canvas = document.getElementById('game3d');
const wrap = document.getElementById('wrap');
const isTouch = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch || (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isTouch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
let lowQuality = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 360 / 680, 0.5, 900);
scene.fog = new THREE.Fog(0xc4e6fa, 70, 330);

// ---------- hulpjes ----------
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mats = {};
function mat(c, opt) {
  const k = c + (opt ? JSON.stringify(opt) : '');
  if (!mats[k]) mats[k] = new THREE.MeshLambertMaterial(Object.assign({ color: c }, opt || {}));
  return mats[k];
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 16, 12),
  sphLo: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 10),
  plane: new THREE.PlaneGeometry(1, 1),
};
function mesh(geo, m, sx, sy, sz, x, y, z, parent) {
  const o = new THREE.Mesh(geo, m);
  o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0);
  if (parent) parent.add(o);
  return o;
}
const wx = x => x * S;

// ---------- licht ----------
const hemi = new THREE.HemisphereLight(0xdff2ff, 0x5c8a3a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d0, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 12; sc.bottom = -8; sc.near = 1; sc.far = 80;
sun.shadow.bias = -0.0008;
scene.add(sun); scene.add(sun.target);

// ---------- lucht ----------
const skyGeo = new THREE.SphereGeometry(500, 24, 16);
const skyCol = new Float32Array(skyGeo.attributes.position.count * 3);
skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCol, 3));
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -10;
scene.add(sky);
const SKY = [
  { at: 0, top: [96, 170, 235], bot: [205, 235, 252], sun: [255, 240, 170], light: 1 },
  { at: 18, top: [110, 160, 225], bot: [250, 222, 170], sun: [255, 210, 110], light: 0.95 },
  { at: 34, top: [90, 90, 160], bot: [250, 150, 100], sun: [255, 140, 80], light: 0.78 },
  { at: 48, top: [20, 26, 60], bot: [60, 60, 110], sun: [240, 240, 255], light: 0.5 },
];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function skyAt(k) {
  for (let i = SKY.length - 1; i >= 0; i--) {
    if (k >= SKY[i].at) {
      const a = SKY[i], b = SKY[i + 1];
      if (!b) return { top: a.top, bot: a.bot, sun: a.sun, light: a.light };
      let t = (k - a.at) / (b.at - a.at); t = t * t * (3 - 2 * t);
      return { top: mix(a.top, b.top, t), bot: mix(a.bot, b.bot, t), sun: mix(a.sun, b.sun, t), light: a.light + (b.light - a.light) * t };
    }
  }
  return SKY[0];
}
const col = c => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
let lastSkyK = -1;
const sunBall = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xfff0a0, fog: false }));
sunBall.scale.setScalar(16); scene.add(sunBall);
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe9a0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
sunGlow.scale.setScalar(70); scene.add(sunGlow);
const moon = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xeef0ff, fog: false }));
moon.scale.setScalar(9); scene.add(moon);
const starGeo = new THREE.BufferGeometry();
{
  const a = [];
  for (let i = 0; i < 260; i++) { const th = hash(i) * Math.PI * 0.9 + Math.PI * 0.05, ph = 0.08 + hash(i + 400) * 0.5;
    a.push(Math.cos(th) * Math.cos(ph) * 480, Math.sin(ph) * 480, -Math.abs(Math.sin(th)) * Math.cos(ph) * 480); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
scene.add(stars);
function updateSky(k, camX) {
  const s = skyAt(k);
  if (Math.abs(k - lastSkyK) > 0.01) {
    lastSkyK = k;
    const top = col(s.top), bot = col(s.bot), pos = skyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 500, t = Math.min(1, Math.max(0, y * 2.2));
      const c = bot.clone().lerp(top, t);
      skyCol[i * 3] = c.r; skyCol[i * 3 + 1] = c.g; skyCol[i * 3 + 2] = c.b;
    }
    skyGeo.attributes.color.needsUpdate = true;
    scene.fog.color.copy(bot);
    const L = s.light;
    hemi.intensity = 0.45 + 0.75 * L;
    hemi.color.copy(col(mix([150, 170, 230], [225, 242, 255], L)));
    hemi.groundColor.copy(col(mix([30, 40, 50], [92, 138, 58], L)));
    sun.color.copy(col(k > 44 ? [170, 185, 255] : s.sun));
    sun.intensity = k > 44 ? 0.7 : 0.6 + 1.6 * L;
    sunBall.material.color.copy(col(s.sun));
    sunGlow.material.color.copy(col(s.sun));
    stars.material.opacity = Math.min(1, Math.max(0, (k - 38) / 10));
    M.water.color.copy(col(mix([28, 48, 92], [63, 143, 208], L)));
    M.water.specular.copy(col(mix([60, 70, 110], [136, 170, 204], L)));
    nightMats.forEach(m => { m.emissiveIntensity = Math.min(1, Math.max(0, (k - 30) / 12)); });
  }
  sky.position.set(camX, 0, 0);
  stars.position.set(camX, 0, 0);
  const sunH = Math.min(1, k / 46);
  const isMoon = k > 44;
  sunBall.visible = sunGlow.visible = !isMoon;
  moon.visible = isMoon;
  sunBall.position.set(camX + 70, 130 - sunH * 140, -420);
  sunGlow.position.copy(sunBall.position);
  moon.position.set(camX - 45, 95, -420);
  sun.position.set(camX - 12 + (isMoon ? -20 : 0), 30, 22);
}

// lampjes in molens en huizen: gaan 's avonds aan
const nightMats = [];
function glowMat(c) { const m = new THREE.MeshLambertMaterial({ color: 0x302010, emissive: c, emissiveIntensity: 0 }); nightMats.push(m); return m; }
const winMat = glowMat(0xffc860);

// ---------- vaste materialen ----------
// gras met maaibanen (strepen dwars op de sloten)
const grassTex = (() => {
  const c = document.createElement('canvas'); c.width = 8; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) { const b = (Math.floor(y / 8) % 2 ? 0 : 14) + (hash(y) * 8 | 0); g.fillStyle = 'rgb(' + (96 + b) + ',' + (176 + b) + ',' + (70 + b * 0.5) + ')'; g.fillRect(0, y, 8, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 22); t.magFilter = THREE.LinearFilter;
  return t;
})();
const M = {
  grass: new THREE.MeshLambertMaterial({ map: grassTex }), grassD: mat(0x56a23e), soil: mat(0x7e5c3a), soilD: mat(0x684a2e), sand: mat(0xd8c08a),
  water: new THREE.MeshPhongMaterial({ color: 0x3f8fd0, shininess: 80, specular: 0x88aacc }),
  waterD: mat(0x2a6aa0), white: mat(0xf4f1e8), yellow: mat(0xffd23c), orange: mat(0xff7a1a), red: mat(0xe8413a),
  blue: mat(0x2f6fd1), skin: mat(0xf2c9a0), black: mat(0x1a1a1a), wood: mat(0x8a5a2b), pole: mat(0x9a6a35),
  clog: mat(0xffd34d), gold: new THREE.MeshLambertMaterial({ color: 0xffcc33, emissive: 0x996600, emissiveIntensity: 0.6 }),
  cow: mat(0xf7f7f2), cowB: mat(0x222222), pink: mat(0xf2a0a0), trunk: mat(0x6e4f34), leaf: mat(0x4f9a46), leaf2: mat(0x3f8a3e),
  mill: mat(0x6a5444), millRoof: mat(0x3d3d48), sail: mat(0xe9e2d0), house: mat(0xb5483a), roof: mat(0x3f3f45), wall: mat(0xe9dfcc),
  duck: mat(0x8c6640), duckH: mat(0x2f7a3c), beak: mat(0xf2a33a), reed: mat(0x5a8f3c), cattail: mat(0x6e4628), lily: mat(0x4caa48),
  cloud: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x99aabb, emissiveIntensity: 0.25 }), mud: mat(0x5a3d22),
  tulip: [mat(0xe8413a), mat(0xffcf3a), mat(0xf06fb0), mat(0xff8a1a), mat(0xffffff)],
};

// grote vlakte ver weg (achter de sloten)
const farGround = mesh(G.plane, mat(0x7fbf5e), 4000, 900, 1, 0, -0.02, Z_BACK - 440);
farGround.rotation.x = -Math.PI / 2; scene.add(farGround);

// ---------- boer ----------
function makeFarmer() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const legs = [], arms = [];
  for (const z of [-0.12, 0.12]) {
    const hip = new THREE.Group(); hip.position.set(0, 0.72, z); body.add(hip);
    mesh(G.cyl, M.blue, 0.1, 0.66, 0.1, 0, -0.33, 0, hip);
    mesh(G.box, M.clog, 0.34, 0.14, 0.17, 0.07, -0.68, 0, hip);
    mesh(G.sphLo, M.clog, 0.09, 0.07, 0.085, 0.24, -0.66, 0, hip);
    legs.push(hip);
  }
  mesh(G.box, M.blue, 0.4, 0.34, 0.38, 0, 0.88, 0, body);
  mesh(G.box, M.red, 0.38, 0.32, 0.36, 0, 1.2, 0, body);
  mesh(G.box, M.blue, 0.06, 0.3, 0.06, 0.1, 1.2, 0.15, body);   // bretels
  mesh(G.box, M.blue, 0.06, 0.3, 0.06, 0.1, 1.2, -0.15, body);
  const head = new THREE.Group(); head.position.set(0.02, 1.58, 0); body.add(head);
  mesh(G.sph, M.skin, 0.22, 0.22, 0.22, 0, 0, 0, head);
  mesh(G.sphLo, mat(0xe3a47a), 0.06, 0.06, 0.06, 0.22, -0.02, 0, head);    // neus
  mesh(G.sphLo, M.black, 0.03, 0.035, 0.03, 0.19, 0.06, 0.08, head);
  mesh(G.sphLo, M.black, 0.03, 0.035, 0.03, 0.19, 0.06, -0.08, head);
  const mouth = mesh(G.box, M.black, 0.02, 0.02, 0.09, 0.2, -0.1, 0, head);
  const capM = mesh(G.sph, M.orange, 0.235, 0.15, 0.235, 0, 0.09, 0, head);
  mesh(G.box, M.orange, 0.2, 0.03, 0.24, 0.2, 0.08, 0, head);
  capM.castShadow = true;
  for (const z of [-0.25, 0.25]) {
    const sh = new THREE.Group(); sh.position.set(0, 1.32, z); body.add(sh);
    mesh(G.cyl, M.red, 0.075, 0.5, 0.075, 0, -0.25, 0, sh);
    mesh(G.sphLo, M.skin, 0.08, 0.08, 0.08, 0, -0.52, 0, sh);
    arms.push(sh);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, body, legs, arms, head, mouth };
}
const F = makeFarmer();
F.g.scale.setScalar(FS);
scene.add(F.g);
const pole = mesh(G.cyl, M.pole, 0.05, 1, 0.05);
pole.castShadow = true; scene.add(pole);
// eendenkroos rond het hoofd bij zwemmen
const weed = new THREE.Group();
for (let i = 0; i < 7; i++) mesh(G.cylLo, M.lily, 0.08 + hash(i) * 0.06, 0.01, 0.08 + hash(i + 3) * 0.06, (hash(i + 9) - 0.5) * 0.9, 0, (hash(i + 20) - 0.5) * 0.9, weed);
scene.add(weed);

// ---------- sloten en land (per sloot een groepje, opruimen als het achter je ligt) ----------
const built = new Map();   // index -> group
const disposeList = [];
function numberTex(k) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 20); g.lineTo(0, 40); g.fill();
  g.fillStyle = '#fff'; g.font = '900 22px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(k), 22, 21);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function landBox(x0, x1, parent) {
  if (x1 <= x0) return;
  const w = x1 - x0, cx = (x0 + x1) / 2, depth = Z_FRONT - Z_BACK, cz = (Z_FRONT + Z_BACK) / 2;
  const top = mesh(G.box, [M.soil, M.soil, M.grass, M.soil, M.soilD, M.soil], w, 6, depth, cx, -3, cz, parent);
  top.receiveShadow = true;
}
function cow(x, z, r, parent) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; parent.add(g);
  mesh(G.box, M.cow, 1.3, 0.62, 0.62, 0, 0.82, 0, g);
  mesh(G.box, M.cowB, 0.5, 0.4, 0.64, -0.2, 0.9, 0, g);
  mesh(G.box, M.cowB, 0.3, 0.3, 0.64, 0.35, 0.78, 0, g);
  for (const [lx, lz] of [[-0.5, -0.22], [-0.5, 0.22], [0.5, -0.22], [0.5, 0.22]]) mesh(G.box, M.cow, 0.14, 0.52, 0.14, lx, 0.26, lz, g);
  const h = new THREE.Group(); h.position.set(0.72, 0.95, 0); g.add(h);
  mesh(G.box, M.cow, 0.36, 0.34, 0.34, 0.1, 0, 0, h);
  mesh(G.box, M.pink, 0.12, 0.16, 0.28, 0.32, -0.08, 0, h);
  mesh(G.box, M.cowB, 0.06, 0.12, 0.5, -0.02, 0.18, 0, h);
  g.userData.head = h; g.userData.seed = x;
  return g;
}
function tree(x, z, s, parent) {
  mesh(G.cylLo, M.trunk, 0.12 * s, 1.4 * s, 0.12 * s, x, 0.7 * s, z, parent);
  mesh(G.sphLo, M.leaf, 0.8 * s, 0.75 * s, 0.8 * s, x, 1.8 * s, z, parent);
  mesh(G.sphLo, M.leaf2, 0.55 * s, 0.5 * s, 0.55 * s, x + 0.4 * s, 1.5 * s, z + 0.2, parent);
}
function tulipField(x0, x1, z0, z1, i, parent) {
  const rows = 9, w = (z1 - z0) / rows;
  for (let r = 0; r < rows; r++) {
    const m = M.tulip[(i + Math.floor(r / 3)) % 5];
    mesh(G.box, m, x1 - x0, 0.22, w * 0.55, (x0 + x1) / 2, 0.11, z0 + w * (r + 0.5), parent);
  }
}
function reeds(x, z0, parent, seed) {
  for (let k = 0; k < 5; k++) {
    const z = z0 + hash(seed + k) * 3, h = 0.6 + hash(seed + k + 9) * 0.5;
    const r = mesh(G.cylLo, M.reed, 0.025, h, 0.025, x + (hash(seed + k + 4) - 0.5) * 0.3, WATER_Y + h / 2, z, parent);
    if (k % 2 === 0) mesh(G.cylLo, M.cattail, 0.05, 0.2, 0.05, r.position.x, WATER_Y + h, z, parent);
  }
}
function buildDitch(view, i) {
  const d = view.ditch(i);
  const g = new THREE.Group();
  g.userData = { i, d, disp: [], ducks: [], cows: [], clog: null };
  // land vóór deze sloot (vanaf de overkant van de vorige)
  const prevF = i === 0 ? d.xs - 900 : view.ditch(i - 1).f;
  landBox(wx(prevF), wx(d.e), g);
  // water
  const W = wx(d.W), cx = wx(d.e + d.W / 2), depth = Z_FRONT - Z_BACK, cz = (Z_FRONT + Z_BACK) / 2;
  const wat = mesh(G.box, [M.waterD, M.waterD, M.water, M.waterD, M.waterD, M.waterD], W, 4.5, depth, cx, WATER_Y - 2.25, cz, g);
  wat.receiveShadow = true;
  // waterlelies
  for (let k = 0; k < 3; k++) {
    if (hash(i * 7 + k) < 0.5) continue;
    mesh(G.cylLo, M.lily, 0.22, 0.02, 0.22, cx + (hash(i * 3 + k) - 0.5) * W * 0.6, WATER_Y + 0.01, -8 + hash(i + k * 5) * 14, g);
  }
  reeds(wx(d.e) + 0.12, -3, g, i * 11);
  reeds(wx(d.f) - 0.12, -1, g, i * 13 + 5);
  // aanloop: zandpad, afzetbalk met perfect-strook
  mesh(G.box, M.sand, wx(d.e - d.xs + 14), 0.03, 1.3, wx((d.xs + d.e) / 2 - 7), 0.015, 0, g).receiveShadow = true;
  mesh(G.box, M.yellow, wx(view.PERFECT), 0.06, 1.32, wx(d.e - view.PERFECT / 2), 0.03, 0, g);
  mesh(G.box, M.white, wx(3), 0.07, 1.34, wx(d.e - view.PERFECT - 1.5), 0.035, 0, g);
  if (d.mud) {
    const m0 = d.xs + d.mud[0], m1 = d.xs + d.mud[1];
    mesh(G.cyl, M.mud, wx((m1 - m0) / 2 + 3), 0.04, 0.85, wx((m0 + m1) / 2), 0.02, 0, g);
  }
  // startpaaltje met nummer
  mesh(G.cylLo, M.white, 0.04, 1.15, 0.04, wx(d.xs), 0.575, -0.75, g);
  const tex = numberTex(i + 1); g.userData.disp.push(tex);
  const fm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }); g.userData.disp.push(fm);
  mesh(G.plane, fm, 0.62, 0.39, 1, wx(d.xs) + 0.31, 0.95, -0.75, g);
  // windzak
  if (d.wind) {
    const px = wx(d.e) + 0.15;
    mesh(G.cylLo, M.white, 0.03, 1.7, 0.03, px, 0.85, -0.9, g);
    const len = wx(8 + Math.abs(d.wind) * 12) * 1.4, dir = d.wind > 0 ? 1 : -1;
    const sock = mesh(G.cone, M.orange, 0.14, len, 0.14, px + dir * len / 2, 1.62, -0.9, g);
    sock.rotation.z = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.userData.sock = sock;
  }
  // gouden klomp
  if (d.clog) {
    const c = new THREE.Group(); g.add(c);
    mesh(G.box, M.gold, 0.5, 0.2, 0.24, 0, 0, 0, c);
    mesh(G.sph, M.gold, 0.18, 0.13, 0.13, 0.25, -0.01, 0, c);
    mesh(G.sphLo, mat(0xb8860b), 0.12, 0.05, 0.08, -0.08, 0.1, 0, c);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe066, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    gl.scale.setScalar(1.6); c.add(gl); g.userData.disp.push(gl.material);
    c.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData.clog = c;
  }
  // eend die door de sloot zwemt
  if (d.duck) {
    const du = new THREE.Group(); g.add(du);
    mesh(G.sph, M.duck, 0.26, 0.16, 0.18, 0, 0.1, 0, du);
    mesh(G.sph, M.duckH, 0.11, 0.11, 0.11, 0.2, 0.28, 0, du);
    mesh(G.box, M.beak, 0.12, 0.04, 0.07, 0.33, 0.27, 0, du);
    du.userData = { seed: d.duckSeed, x: cx + (hash(i) - 0.5) * W * 0.4 };
    g.userData.ducks.push(du);
  }
  // achter op het land: koeien, bomen, tulpen, een boerderij
  const lx0 = wx(prevF) + 0.8, lx1 = wx(d.e) - 0.8;
  if (lx1 - lx0 > 2) {
    for (let k = 0; k < 4; k++) {
      const h = hash(i * 31 + k), x = lx0 + hash(i * 17 + k) * (lx1 - lx0), z = -6 - k * 14 - hash(i + k) * 10;
      if (h < 0.4) g.userData.cows.push(cow(x, z, hash(i + k * 3) * 6.28, g));
      else if (h < 0.62) tree(x, z, 0.9 + hash(i + k) * 0.5, g);
      else if (h < 0.85) tulipField(lx0, lx1, z - 5, z + 2, i + k, g);
    }
    // voorgrond: een paar bloemetjes
    for (let k = 0; k < 4; k++) mesh(G.sphLo, M.tulip[(i + k) % 5], 0.09, 0.09, 0.09, lx0 + hash(i * 5 + k) * (lx1 - lx0), 0.1, 2.5 + hash(i * 9 + k) * 6, g);
    if (hash(i * 3 + 77) < 0.3) farmhouse(lx0 + (lx1 - lx0) * 0.5, -70, g);
  }
  g.traverse(o => { if (o.isMesh && o !== wat) o.receiveShadow = true; });
  scene.add(g);
  built.set(i, g);
}
function farmhouse(x, z, parent) {
  mesh(G.box, M.wall, 3.2, 2, 2.6, x, 1, z, parent);
  const r = mesh(G.box, M.roof, 2.4, 2.4, 2.8, x, 2.1, z, parent); r.rotation.z = Math.PI / 4; r.scale.set(2.3, 2.3, 2.8);
  mesh(G.box, winMat, 0.4, 0.4, 0.05, x - 0.7, 1.1, z + 1.31, parent);
  mesh(G.box, winMat, 0.4, 0.4, 0.05, x + 0.7, 1.1, z + 1.31, parent);
}
function removeDitch(i) {
  const g = built.get(i);
  if (!g) return;
  scene.remove(g);
  g.userData.disp.forEach(x => x.dispose());
  built.delete(i);
}
// land na de laatst gebouwde sloot
const tail = new THREE.Group(); scene.add(tail);
let tailFor = -1;

// ---------- molens ver weg ----------
const mills = new Map();
function makeMill(k) {
  const g = new THREE.Group();
  const x = k * 34 + hash(k) * 14, z = -150 - hash(k + 5) * 60, s = 1.5 + hash(k + 2) * 0.5;
  g.position.set(x, 0, z); g.scale.setScalar(s);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.7, 6, 8), M.mill); body.position.y = 3; g.add(body);
  g.userData.geo = body.geometry;
  mesh(G.cone, M.millRoof, 1.25, 1.6, 1.25, 0, 6.8, 0, g);
  mesh(G.box, winMat, 0.35, 0.45, 0.05, 0, 3.4, 1.42, g);
  const hub = new THREE.Group(); hub.position.set(0, 6.1, 1.35); g.add(hub);
  for (let b = 0; b < 4; b++) {
    const arm = new THREE.Group(); arm.rotation.z = b * Math.PI / 2; hub.add(arm);
    mesh(G.box, M.wood, 0.12, 4.6, 0.08, 0, 2.3, 0, arm);
    mesh(G.box, M.sail, 0.75, 3.4, 0.04, 0.45, 2.7, 0, arm);
  }
  g.userData.hub = hub; g.userData.k = k;
  if (hash(k + 9) < 0.3) { g.position.z -= 20; }
  scene.add(g);
  return g;
}
// ---------- wolken ----------
const clouds = [];
for (let c = 0; c < 9; c++) {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) mesh(G.sphLo, M.cloud, 4 + hash(c * 4 + k) * 3, 2.6 + hash(c + k) * 1.4, 3, k * 4.5 - 7, hash(c * 9 + k) * 1.5, 0, g);
  g.userData = { off: hash(c + 7) * 400, y: 26 + hash(c + 13) * 26, z: -170 - hash(c + 3) * 80, sp: 1.2 + c * 0.3 };
  scene.add(g); clouds.push(g);
}

// ---------- tekenen ----------
const tmp = new THREE.Vector3();
let lastW = 0, lastH = 0, lastHL = 0;
function resize(view) {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (w === lastW && h === lastH && view.H === lastHL) return;
  lastW = w; lastH = h; lastHL = view.H;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowQuality ? 1 : isTouch ? 1.5 : 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
function placeCamera(view) {
  const H = view.H, GY = view.GY;
  // zo ver weg dat op het vlak z = 0 precies H logische px in beeld passen (zoals in 2D)
  const dist = (H * S / 2) / Math.tan(FOV / 2 * Math.PI / 180);
  const cx = wx(view.cam + view.LW / 2);
  // pad iets lager in beeld dan in 2D (minder leeg gras onderin, meer lucht en molens)
  const lookY = (Math.max(GY, H * 0.71) - H / 2) * S;
  camera.position.set(cx, lookY + Math.sin(TILT) * dist, Math.cos(TILT) * dist);
  camera.lookAt(cx, lookY, 0);
  return cx;
}
function setFarmer(view) {
  const p = view.p, mode = view.mode, t = view.time, fly = view.fly, GY = view.GY;
  const f = F.g;
  f.visible = true;
  f.position.set(wx(p.x), (GY - p.y) * S, 0);
  let rot = 0;
  const run = mode === 'run' || mode === 'walk';
  const sw = run ? Math.sin(p.phase) : 0;
  if (mode === 'run') rot -= Math.min(0.25, p.v / 1200);
  if (mode === 'faceplant') rot = -Math.PI / 2 * Math.min(1, p.t * 6);
  if (mode === 'fall') rot = Math.sin(t * 18) * 0.4;
  if (mode === 'flop') rot = -Math.min(1.2, p.t * 3);
  if (mode === 'fly') rot = 0.35 - fly.u * 0.5;
  f.rotation.z = rot;
  // benen
  if (mode === 'fly') { F.legs[0].rotation.z = 1.2; F.legs[1].rotation.z = 0.9; }
  else if (mode === 'land') { const sq = Math.max(0, 1 - p.t * 4); F.legs[0].rotation.z = 0.35 * sq; F.legs[1].rotation.z = -0.35 * sq; }
  else { F.legs[0].rotation.z = sw * 0.7; F.legs[1].rotation.z = -sw * 0.7; }
  F.body.position.y = run ? Math.abs(Math.cos(p.phase)) * 0.06 : 0;
  // armen
  const tee = mode === 'land' && p.teeter;
  if (tee) { F.arms[0].rotation.z = t * 16; F.arms[1].rotation.z = t * 16 + 2; }
  else if (mode === 'fall' || mode === 'flop') { F.arms[0].rotation.z = Math.PI * 0.85 + Math.sin(t * 20) * 0.4; F.arms[1].rotation.z = Math.PI * 0.85 - Math.sin(t * 20) * 0.4; }
  else if (mode === 'land') { F.arms[0].rotation.z = F.arms[1].rotation.z = Math.PI * 0.8; }
  else {
    // naar de stok toe (handen uit game.js)
    const h = view.hands();
    const dx = (h.x - p.x) * S, dy = (p.y - h.y) * S - 1.32;
    const a = Math.atan2(dy, dx) - rot + Math.PI / 2;
    F.arms[0].rotation.z = F.arms[1].rotation.z = a;
  }
  F.mouth.scale.set(0.02, mode === 'fall' || mode === 'flop' || tee || mode === 'swim' ? 0.07 : 0.02, 0.09);
  // zwemmen: alleen het hoofd boven water
  weed.visible = mode === 'swim';
  if (mode === 'swim') {
    f.rotation.z = Math.sin(t * 2) * 0.08;
    f.position.y = WATER_Y - 1.36 * FS + Math.sin(t * 4) * 0.04;
    weed.position.set(f.position.x, WATER_Y + 0.01, 0);
  }
}
function setPole(view) {
  const sg = view.poleSeg();
  if (!sg) { pole.visible = false; return; }
  pole.visible = true;
  const GY = view.GY;
  const x1 = wx(sg[0]), y1 = (GY - sg[1]) * S, x2 = wx(sg[2]), y2 = (GY - sg[3]) * S;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  pole.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.32);
  pole.scale.set(0.05, len, 0.05);
  pole.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
}

let frames = 0, fpsT = 0, fpsN = 0, playT = 0, lastNow = performance.now(), fpsChecks = 0;
const R = {
  draw(view) {
    const now = performance.now(), dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
    resize(view);
    const camX = placeCamera(view);
    // sloten bouwen rond de speler, oude opruimen
    const n = view.n;
    // nieuwe run = nieuwe sloten: oude groepen weg
    for (const [i, g] of [...built]) if (g.userData.d !== view.ditch(i)) { removeDitch(i); tailFor = -1; }
    for (let i = Math.max(0, n - 2); i <= n + 3; i++) if (!built.has(i)) buildDitch(view, i);
    for (const i of [...built.keys()]) if (i < n - 2 || i > n + 6) removeDitch(i);
    let last = -1; for (const i of built.keys()) last = Math.max(last, i);
    if (tailFor !== last) {
      tail.clear(); tailFor = last;
      const lf = view.ditch(last).f;
      landBox(wx(lf), wx(lf) + 80, tail);
    }
    // bewegende dingen in de sloten
    const t = view.time, GY = view.GY;
    for (const [i, g] of built) {
      const d = view.ditch(i), u = g.userData;
      if (u.clog && d.clog) {
        u.clog.visible = !d.clog.got;
        u.clog.position.set(wx(d.clog.x), (GY - d.clog.y) * S + Math.sin(t * 3) * 0.12, 0);
        u.clog.rotation.y = t * 2; u.clog.rotation.z = Math.sin(t * 2) * 0.2;
      }
      for (const du of u.ducks) {
        const ph = ((t * 0.08 + du.userData.seed) % 2) / 2, dir = ph < 0.5 ? 1 : -1;
        du.position.set(du.userData.x, WATER_Y + Math.sin(t * 3 + du.userData.seed) * 0.02, -14 + (ph < 0.5 ? ph * 2 : 2 - ph * 2) * 18);
        du.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      for (const c of u.cows) { c.userData.head.rotation.z = Math.sin(t * 1.3 + c.userData.seed) > 0.6 ? -0.5 : 0; }
      if (u.sock) u.sock.scale.x = 0.14 + Math.sin(t * 9 + i) * 0.015;
    }
    // molens
    const k0 = Math.floor((camX - 70) / 34), k1 = Math.floor((camX + 90) / 34);
    for (let k = k0; k <= k1; k++) if (!mills.has(k)) mills.set(k, makeMill(k));
    for (const [k, m] of mills) {
      if (k < k0 - 1 || k > k1 + 1) { scene.remove(m); m.userData.geo.dispose(); mills.delete(k); continue; }
      m.userData.hub.rotation.z = -(t * 0.7 + k);
    }
    for (const c of clouds) {
      const u = c.userData, span = 520;
      c.position.set(camX - 260 + (((u.off - t * u.sp) % span) + span) % span, u.y, u.z);
    }
    updateSky(view.skyK, camX);
    sun.target.position.set(wx(view.p.x), 0, 0);
    setFarmer(view);
    setPole(view);
    renderer.render(scene, camera);
    // snelheid meten tijdens het spelen; te traag: eerst lagere kwaliteit, dan de knop "simple mode"
    if (view.running && !view.paused && !document.hidden) {
      playT += dt; fpsT += dt; fpsN++;
      if (fpsT >= 4) {
        const fps = fpsN / fpsT; fpsT = 0; fpsN = 0; fpsChecks++;
        if (fps < 30 && !lowQuality) { lowQuality = true; renderer.shadowMap.enabled = false; sun.castShadow = false; lastW = 0; }
        else if (fps < 24 && lowQuality) window.dispatchEvent(new CustomEvent('jump-slow'));
      }
    } else { fpsT = 0; fpsN = 0; }
  },
  // wereld-px -> logische scherm-px (voor deeltjes en tekst op het 2D-canvas)
  project(x, y) {
    const GY = lastView ? lastView.GY : 400, H = lastView ? lastView.H : 680;
    tmp.set(wx(x), (GY - y) * S, 0).project(camera);
    if (tmp.z > 1) return null;
    return { x: (tmp.x + 1) / 2 * 360, y: (1 - tmp.y) / 2 * H, k: 1 };
  },
  fail(e) {
    if (window.console) console.warn('Ditch Jumper: 3D stopped, using 2D', e);
    canvas.classList.add('hidden');
  },
};
let lastView = null;
const realDraw = R.draw;
R.draw = function (view) { lastView = view; realDraw(view); };

canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  // geen 3D meer: de 2D-versie neemt het meteen over
  window.__jumpR = null; R.fail('context lost');
});

// eerst één keer tekenen (shaders voorbereiden), daarna aanzetten
try {
  canvas.classList.remove('hidden');
  window.__jumpR = R;
  window.__jump3d = true;
  document.documentElement.classList.add('is3d');
} catch (e) { R.fail(e); window.__jumpR = null; }

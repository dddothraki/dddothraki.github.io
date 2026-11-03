// Polder Dash 3D: dezelfde spelregels als classic.js, maar met three.js en de 3D-modellen uit
// Polder Escape (gemaakt met de Roblox 3D-generator). Camera schuin achter de speler.
// De spellogica rekent nog in "logische pixels" (zoals de platte versie); render() zet dat om
// naar 3D: 1 baan = LANE_W px = 5 studs.
import * as THREE from './vendor/three.module.min.js';

// Draait de platte versie al (bijvoorbeeld na de laad-time-out), dan niets doen.
if (window.__dashClassic) throw new Error('classic active');
window.__dash3dStarted = true;

const ROBLOX_URL = 'https://www.roblox.com/games/77894735497943';
const W = 360;
const ROAD_L = 80, ROAD_R = 280, LANE_W = (ROAD_R - ROAD_L) / 3;
const PX_PER_M = 32;
const JUMP_TIME = 0.62;
const PY = 600;                 // logische plek van de speler (vast, los van het scherm)
const AHEAD = 950;              // zo ver vooruit worden dingen neergezet (px)
const S = 4.2 / LANE_W;         // studs per logische pixel (1 baan = 4,2 studs)
const laneX = i => ROAD_L + LANE_W * (i + 0.5);
const wx = px => (px - 180) * S;            // logisch x -> wereld x
const wz = y => -(PY - y) * S;              // logisch y (o.y) -> wereld z (speler op 0)
const WATER_Y = -1.6;

const $ = id => document.getElementById(id);
const wrap = $('wrap'), ui = $('ui'), canvas = $('game3d');
let H = 640, scale = 1;

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

// ---------- three.js ----------
const isTouch = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch || (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isTouch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = 0x0b121b;
scene.background = new THREE.Color(0x070b11);
scene.fog = new THREE.FogExp2(FOG, 0.024);
const camera = new THREE.PerspectiveCamera(74, W / H, 0.5, 260);

// licht: koude maan, zwakke hemel, warme zaklamp
const hemi = new THREE.HemisphereLight(0x7088b0, 0x141a10, 0.55);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9db4ff, 0.55);
moon.position.set(-30, 50, -20);
scene.add(moon);
const flash = new THREE.SpotLight(0xfff0c8, 120, 75, 0.68, 0.6, 1.3);
flash.castShadow = true;
flash.shadow.mapSize.set(isTouch ? 512 : 1024, isTouch ? 512 : 1024);
flash.shadow.camera.near = 0.5; flash.shadow.camera.far = 60;
flash.shadow.bias = -0.0008;
scene.add(flash, flash.target);
const glowLight = new THREE.PointLight(0xffd9a0, 2.5, 8, 1.6); // licht om de speler zelf
scene.add(glowLight);
// Eén vast lampje voor de dichtstbijzijnde geest. Een lamp erbij of eraf laat alle materialen
// opnieuw compileren (seconden haperen), dus deze blijft altijd bestaan.
const ghostLight = new THREE.PointLight(0xbcd2ff, 0, 9, 1.5);
scene.add(ghostLight);

// ---------- textuurtjes uit code ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}
const R = mulberry32(1953);
const mudTex = canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#4a3c2a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { g.fillStyle = R() < 0.5 ? '#3a2e1f' : '#5c4b35'; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3); }
  g.fillStyle = 'rgba(25,18,10,0.28)'; // karrensporen per baan
  for (let l = 0; l < 3; l++) { const cx = (l + 0.5) * w / 3; g.fillRect(cx - 22, 0, 10, h); g.fillRect(cx + 12, 0, 10, h); }
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(40,50,52,0.22)'; g.beginPath(); g.ellipse(20 + R() * (w - 40), R() * h, 12 + R() * 16, 6 + R() * 8, 0, 0, Math.PI * 2); g.fill(); }
}, [1, 6]);
const grassTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#1d2c14'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.strokeStyle = ['#2b3f1b', '#33491f', '#172410', '#3c5226'][(R() * 4) | 0]; const x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + R() * 3 - 1.5, y - 3 - R() * 4); g.stroke(); }
}, [4, 40]);
const waterTex = canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#0b2227'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(120,180,190,${0.05 + R() * 0.12})`; const x = R() * w, y = R() * h, l = 8 + R() * 20; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 2, x + l, y); g.stroke(); }
}, [2, 20]);
const glowTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
glowTex.wrapS = glowTex.wrapT = THREE.ClampToEdgeWrapping;
const fogTex = canvasTex(128, 128, (g, w) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(190,205,215,0.55)'); gr.addColorStop(1, 'rgba(190,205,215,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
fogTex.wrapS = fogTex.wrapT = THREE.ClampToEdgeWrapping;

// ---------- de wereld ----------
const LEN = 220; // lengte van grond-stroken
function strip(width, mat, x, y, rotZ = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, LEN), mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.y = rotZ;
  m.position.set(x, y, -LEN / 2 + 25);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
const roadMat = new THREE.MeshStandardMaterial({ map: mudTex, roughness: 0.95 });
strip(wx(ROAD_R) - wx(ROAD_L), roadMat, 0, 0);
const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
// dijktalud links omlaag naar de sloot
const slopeW = Math.hypot(wx(ROAD_L) - wx(62), WATER_Y);
const slope = strip(slopeW + 0.4, grassMat, (wx(ROAD_L) + wx(62)) / 2, WATER_Y / 2);
slope.rotation.y = -Math.atan2(-WATER_Y, wx(ROAD_L) - wx(62));
const waterMat = new THREE.MeshStandardMaterial({ map: waterTex, color: 0xb8d8dc, roughness: 0.22, metalness: 0, emissive: 0x071a1e });
strip(30, waterMat, wx(62) - 15 + 0.5, WATER_Y - 0.02);
strip(40, grassMat, wx(0) - 26, 0.2); // overkant van de sloot
strip(3, grassMat, wx(ROAD_R) + 1.4, 0.02); // berm rechts
const fieldMat = new THREE.MeshStandardMaterial({ color: 0x1a2110, roughness: 1 });
strip(60, fieldMat, wx(ROAD_R) + 32, 0.01);

// paaltjes met draad langs de sloot
const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.1, 6);
const postMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
const POSTS = 30, POST_GAP = 7;
const posts = new THREE.InstancedMesh(postGeo, postMat, POSTS);
posts.frustumCulled = false;
scene.add(posts);
const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, LEN, 3), new THREE.MeshBasicMaterial({ color: 0x55575a }));
wire.rotation.x = Math.PI / 2; wire.position.set(wx(ROAD_L) - 0.4, 0.85, -LEN / 2 + 25);
scene.add(wire);

// maan
const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xdfe8ff, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
moonSprite.scale.set(26, 26, 1); moonSprite.position.set(-60, 55, -220);
scene.add(moonSprite);

// mistbanken
const fogSprites = [];
for (let i = 0; i < 12; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, transparent: true, opacity: rnd(0.25, 0.5), depthWrite: false }));
  s.scale.set(rnd(14, 26), rnd(4, 7), 1);
  s.position.set(rnd(-25, 25), rnd(0.8, 2.2), -rnd(0, 140) + 10);
  s.userData.speed = rnd(0.2, 0.6);
  scene.add(s); fogSprites.push(s);
}

// ---------- modellen laden ----------
const models = {};
const MODEL_FILES = ['farmer', 'wolf', 'ghost', 'scarecrow', 'bale', 'fence', 'vase', 'cheese', 'corn', 'tower'];
// draaiing (yaw) zodat het model goed staat; voorkant van de generator verschilt per model
const MODEL_YAW = { farmer: 0, wolf: Math.PI / 2, ghost: Math.PI, scarecrow: Math.PI, bale: 0, fence: 0, vase: 0, cheese: 0, gold: 0, corn: 0, tower: 0 };
async function loadModels(onProgress) {
  const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r; };
  const info = await (await get('models/models.json')).json();
  const texLoader = new THREE.TextureLoader();
  let done = 0;
  await Promise.all(MODEL_FILES.map(async name => {
    const meta = info[name];
    const buf = await (await get(`models/${name}.bin`)).arrayBuffer();
    const dv = new DataView(buf);
    const nV = dv.getUint32(0, true), nI = dv.getUint32(4, true);
    const vf = new Float32Array(buf, 8, nV * 8);
    const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), uv = new Float32Array(nV * 2);
    for (let i = 0; i < nV; i++) {
      pos[i * 3] = vf[i * 8]; pos[i * 3 + 1] = vf[i * 8 + 1]; pos[i * 3 + 2] = vf[i * 8 + 2];
      nrm[i * 3] = vf[i * 8 + 3]; nrm[i * 3 + 1] = vf[i * 8 + 4]; nrm[i * 3 + 2] = vf[i * 8 + 5];
      uv[i * 2] = vf[i * 8 + 6]; uv[i * 2 + 1] = vf[i * 8 + 7];
    }
    const idx = new Uint32Array(buf, 8 + nV * 32, nI);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(nV < 65536 ? Uint16Array.from(idx) : new Uint32Array(idx), 1));
    geo.rotateY(MODEL_YAW[name] || 0);
    geo.computeBoundingBox();
    let map = null;
    if (meta.tex) {
      map = await texLoader.loadAsync(`models/${name}.jpg`);
      map.colorSpace = THREE.SRGBColorSpace;
      map.flipY = false; // Roblox-uv's beginnen linksboven
      map.anisotropy = 4;
    }
    const c = meta.color;
    const mat = new THREE.MeshStandardMaterial({
      map, color: map ? 0xffffff : new THREE.Color(c[0], c[1], c[2]), roughness: 0.8, metalness: 0,
    });
    models[name] = { geo, mat, size: meta.size };
    onProgress && onProgress(++done / MODEL_FILES.length);
  }));
  // eigen aanpassingen per model
  models.wolf.mat.color.set(0x4b5d57); models.wolf.mat.roughness = 0.32; models.wolf.mat.metalness = 0.1; // nat
  models.wolf.mat.emissive = new THREE.Color(0x0c1614);
  models.ghost.mat.transparent = true; models.ghost.mat.opacity = 0.78; models.ghost.mat.depthWrite = false;
  models.ghost.mat.emissive = new THREE.Color(0xbfd4ff); models.ghost.mat.emissiveIntensity = 0.35; models.ghost.mat.emissiveMap = models.ghost.mat.map;
  for (const n of ['vase', 'cheese']) { models[n].mat.emissive = new THREE.Color(0x3a2a10); models[n].mat.emissiveMap = models[n].mat.map; models[n].mat.emissiveIntensity = 0.6; }
}
// een model op een gewenste hoogte (studs), onderkant op 0
function makeModel(name, height, opts = {}) {
  const m = models[name];
  const mesh = new THREE.Mesh(m.geo, opts.mat || m.mat);
  const s = height / m.size[1];
  mesh.scale.setScalar(s);
  if (opts.sx) mesh.scale.x *= opts.sx;
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = false;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.mesh = mesh;
  return g;
}
function eye(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.set(size, size, 1);
  return s;
}

// ---------- kleding uit de winkel (look.js) ----------
// De boer is één model met één textuur. De jas (beige, ook de capuchon) en de laarzen kleuren we om in een kopie van die textuur:
// jas = beige pixels (kleurtoon 24-50 graden; huid is roziger, ~18), laarzen = de driehoekjes onderaan het model (lager dan 0,5).
// Hoeden en wat hij vasthoudt zijn losse vormpjes op het model (maten in model-eenheden: model is 3,56 hoog).
const look3 = { key: '', paint: '', ready: false, acc: null };
function prepLook() {
  const m = models.farmer, img = m.mat.map && m.mat.map.image;
  if (!img || !img.width) return;
  const W = img.width, H = img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const base = cx.getImageData(0, 0, W, H);
  // laarzen: driehoekjes in het onderlichaam die neutraal grijs zijn (de broek is warmer van kleur).
  // Op hoogte alleen gaat niet: in de renhouding hangt het achterste been hoog. In uv-ruimte getekend, met een randje tegen naden.
  const d = base.data;
  const chromaAt = (u, v) => { const q = (Math.min(H - 1, Math.max(0, Math.floor(v * H))) * W + Math.min(W - 1, Math.max(0, Math.floor(u * W)))) * 4; return (Math.max(d[q], d[q + 1], d[q + 2]) - Math.min(d[q], d[q + 1], d[q + 2])) / 255; };
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
  const mx = mc.getContext('2d', { willReadFrequently: true });
  mx.fillStyle = mx.strokeStyle = '#fff'; mx.lineWidth = 3; mx.lineJoin = 'round';
  const pos = m.geo.attributes.position.array, uv = m.geo.attributes.uv.array, idx = m.geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const y = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3;
    if (y >= 1.05) continue;
    if (y >= 0.5) {
      const cu = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, cvv = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
      let ch = chromaAt(cu, cvv);
      for (const k of [a, b, c]) ch += chromaAt((cu + uv[k * 2]) / 2, (cvv + uv[k * 2 + 1]) / 2);
      if (ch / 4 >= 0.05) continue;
    }
    mx.beginPath(); mx.moveTo(uv[a * 2] * W, uv[a * 2 + 1] * H); mx.lineTo(uv[b * 2] * W, uv[b * 2 + 1] * H); mx.lineTo(uv[c * 2] * W, uv[c * 2 + 1] * H);
    mx.closePath(); mx.fill(); mx.stroke();
  }
  const boots = mx.getImageData(0, 0, W, H).data;
  // per pixel: 0 = laten, 1 = jas, 2 = laars; en de helderheid, zodat plooien en schaduw blijven
  const kind = new Uint8Array(W * H), lum = new Float32Array(W * H);
  for (let q = 0; q < W * H; q++) {
    const r = d[q * 4] / 255, g = d[q * 4 + 1] / 255, bl = d[q * 4 + 2] / 255;
    const hi = Math.max(r, g, bl), lo = Math.min(r, g, bl), l = (hi + lo) / 2, ch = hi - lo;
    lum[q] = l;
    if (boots[q * 4] > 127 && ch < 0.12) { kind[q] = 2; continue; }
    if (ch < 0.06) continue;
    const sat = ch / (1 - Math.abs(2 * l - 1) + 1e-6);
    let h = hi === r ? ((g - bl) / ch) % 6 : hi === g ? (bl - r) / ch + 2 : (r - g) / ch + 4;
    h *= 60; if (h < 0) h += 360;
    if (h >= 24 && h <= 50 && sat > 0.25 && l > 0.15) kind[q] = 1;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 4;
  Object.assign(look3, { cx, base, kind, lum, W, H, tex, ready: true });
  m.mat.map = tex;
  // benen laten lopen: het model is één stuk, dus de onderste hoekpunten (niet de jas) draaien in de shader om de heup,
  // het linker- en rechterbeen tegengesteld. legw = hoeveel een hoekpunt meedraait (0 bij de heup, 1 vanaf de knie).
  const pa = m.geo.attributes.position, legw = new Float32Array(pa.count);
  for (let v = 0; v < pa.count; v++) {
    const y = pa.getY(v);
    if (y >= 1.0) continue;
    const q = Math.min(H - 1, Math.max(0, Math.floor(uv[v * 2 + 1] * H))) * W + Math.min(W - 1, Math.max(0, Math.floor(uv[v * 2] * W)));
    if (kind[q] === 1) continue; // jas loopt niet mee
    const t = Math.min(1, (1.0 - y) / 0.35);
    legw[v] = t * t * (3 - 2 * t);
  }
  m.geo.setAttribute('legw', new THREE.BufferAttribute(legw, 1));
  const uLeg = { value: 0 };
  look3.uLeg = uLeg;
  m.mat.onBeforeCompile = sh => {
    sh.uniforms.uLeg = uLeg;
    sh.vertexShader = 'attribute float legw;\nuniform float uLeg;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float legA = uLeg * legw * (position.x < 0.0 ? 1.0 : -1.0), legC = cos(legA), legS = sin(legA);
  objectNormal = vec3(objectNormal.x, objectNormal.y * legC - objectNormal.z * legS, objectNormal.y * legS + objectNormal.z * legC);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec3 legQ = transformed - vec3(0.0, 1.0, 0.0);
    transformed = vec3(legQ.x, legQ.y * legC - legQ.z * legS, legQ.y * legS + legQ.z * legC) + vec3(0.0, 1.0, 0.0); }`);
  };
  m.mat.needsUpdate = true;
}
function paintFarmer(coat, boots) {
  const { cx, base, kind, lum, W, H, tex } = look3;
  const out = cx.createImageData(W, H), o = out.data, d = base.data;
  const rgb = c => (c == null ? null : [(c >> 16) & 255, (c >> 8) & 255, c & 255]);
  const tc = rgb(coat), tb = rgb(boots);
  for (let q = 0, i = 0; q < W * H; q++, i += 4) {
    const k = kind[q], t = k === 1 ? tc : k === 2 ? tb : null;
    if (!t) { o[i] = d[i]; o[i + 1] = d[i + 1]; o[i + 2] = d[i + 2]; o[i + 3] = 255; continue; }
    // schaduw en plooien houden; laarzen zijn heel donker, daar telt de kleur zelf meer mee
    const f = k === 1 ? lum[q] / 0.66 : 0.6 + 0.4 * lum[q] / 0.33;
    o[i] = Math.min(255, t[0] * f); o[i + 1] = Math.min(255, t[1] * f); o[i + 2] = Math.min(255, t[2] * f); o[i + 3] = 255;
  }
  cx.putImageData(out, 0, 0);
  tex.needsUpdate = true;
}
function makeAccessories(root) {
  const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7, metalness: 0 }, o || {}));
  const add = (g, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  const cyl = (r, h, seg = 18, open = false) => new THREE.CylinderGeometry(r, r, h, seg, 1, open);
  const X = 0.08, Z = 0;            // midden van de capuchon (boven op 3,56)
  const HX = -1.42, HY = 1.9, HZ = -0.08; // linkerhand (de rechter houdt de zaklamp)
  const hats = {}, hands = {};
  const grp = (k, store, fn) => { const g = new THREE.Group(); fn(g); g.visible = false; g.traverse(o => { if (o.isMesh) o.castShadow = true; }); root.add(g); store[k] = g; };
  grp('cap', hats, g => {
    const m = std(0x2f5a3a);
    const dome = add(g, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, X, 3.25, Z); dome.scale.set(0.5, 0.36, 0.56);
    const visor = add(g, new THREE.BoxGeometry(0.52, 0.04, 0.36), m, X, 3.27, Z - 0.66); visor.rotation.x = 0.12;
  });
  grp('tophat', hats, g => {
    const m = std(0x161618, { roughness: 0.45 });
    add(g, cyl(0.72, 0.05), m, X, 3.3, Z);
    add(g, cyl(0.47, 0.78), m, X, 3.71, Z);
    add(g, cyl(0.48, 0.11), std(0xb02a22), X, 3.39, Z);
  });
  grp('cowboy', hats, g => {
    const m = std(0x8a5a2b);
    const brim = add(g, cyl(0.8, 0.05, 22), m, X, 3.28, Z); brim.scale.z = 0.9;
    for (const sx of [-1, 1]) { const roll = add(g, new THREE.BoxGeometry(0.14, 0.05, 1.1), m, X + sx * 0.76, 3.34, Z); roll.rotation.z = sx * 0.55; }
    const top = add(g, cyl(0.45, 0.44), m, X, 3.52, Z); top.scale.z = 1.1;
    add(g, new THREE.BoxGeometry(0.08, 0.06, 0.6), std(0x6a4220), X, 3.75, Z);
    const band = add(g, cyl(0.46, 0.08), std(0x3a2410), X, 3.35, Z); band.scale.z = 1.1;
  });
  grp('pumpkin', hats, g => {
    const m = std(0xe8741a, { roughness: 0.55, emissive: 0x2a1000 });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI;
      const lobe = add(g, new THREE.SphereGeometry(1, 16, 12), m, X, 3.02, Z); lobe.scale.set(0.36, 0.56, 0.68); lobe.rotation.y = a;
    }
    add(g, cyl(0.07, 0.22, 8), std(0x3f6a22), X, 3.64, Z);
    // gezicht (voorkant = -z): oplichtende ogen en mond
    const glow = new THREE.MeshBasicMaterial({ color: 0xffc040 });
    for (const sx of [-1, 1]) { const e = add(g, new THREE.ConeGeometry(0.1, 0.14, 3), glow, X + sx * 0.2, 3.12, Z - 0.66); e.rotation.x = -Math.PI / 2; e.rotation.y = Math.PI; }
    add(g, new THREE.BoxGeometry(0.36, 0.07, 0.05), glow, X, 2.86, Z - 0.66);
  });
  grp('crown', hats, g => {
    const gold = std(0xf6c431, { metalness: 0.85, roughness: 0.3, emissive: 0x4a3000 });
    const band = add(g, cyl(0.47, 0.24, 24, true), gold, X, 3.42, Z); band.material.side = THREE.DoubleSide;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(g, new THREE.ConeGeometry(0.1, 0.3, 8), gold, X + Math.cos(a) * 0.44, 3.69, Z + Math.sin(a) * 0.44); }
    add(g, new THREE.SphereGeometry(0.07, 10, 8), std(0xe8413a, { emissive: 0x6a0000, roughness: 0.2 }), X, 3.42, Z - 0.48);
    for (const sx of [-1, 1]) add(g, new THREE.SphereGeometry(0.05, 10, 8), std(0x5ab4ee, { emissive: 0x0a3050, roughness: 0.2 }), X + sx * 0.34, 3.42, Z - 0.34);
  });
  // stok en hooivork liggen horizontaal in de hand, in het midden vastgehouden, met de punt naar voren (-z) en iets omhoog
  const held = (g, len) => { g.position.set(HX, HY, HZ); g.rotation.x = -Math.PI / 2 + 0.12; return len / 2; };
  grp('cane', hands, g => {
    const wood = std(0x6a4220), h = held(g, 1.9);
    add(g, cyl(0.05, 1.9, 8), wood, 0, 0, 0);
    const hook = add(g, new THREE.TorusGeometry(0.14, 0.05, 6, 12, Math.PI), wood, 0.14, -h, 0); hook.rotation.z = Math.PI; // handvat achteraan
  });
  grp('fork', hands, g => {
    const wood = std(0x8a5a2b), metal = std(0xb0b6bc, { metalness: 0.7, roughness: 0.35 }), h = held(g, 2.8);
    add(g, cyl(0.045, 2.8, 8), wood, 0, -0.25, 0);
    add(g, new THREE.BoxGeometry(0.46, 0.06, 0.06), metal, 0, h - 0.25, 0);
    for (const dx of [-0.19, 0, 0.19]) { add(g, cyl(0.025, 0.5, 6), metal, dx, h, 0); add(g, new THREE.ConeGeometry(0.025, 0.08, 6), metal, dx, h + 0.29, 0); }
  });
  return { hats, hands };
}
// aanpassen als look.js iets anders laat dragen (ook tijdens het passen in de winkel)
function applyLook() {
  const L = window.DashLook;
  if (!L || !look3.ready || !look3.acc) return;
  const w = L.wear, k = w.coat + '|' + w.hat + '|' + w.boots + '|' + w.hand;
  if (k === look3.key) return;
  look3.key = k;
  const pk = w.coat + '|' + w.boots;
  if (pk !== look3.paint) {
    look3.paint = pk;
    const c = L.COAT3[w.coat], b = L.BOOTS3[w.boots];
    paintFarmer(c === undefined ? null : c, b === undefined ? null : b);
  }
  for (const h in look3.acc.hats) look3.acc.hats[h].visible = h === w.hat;
  for (const h in look3.acc.hands) look3.acc.hands[h].visible = h === w.hand;
}

// speler
let player = null;
let corn = null, CORN_N = 9, CORN_GAP = 7.5; // 2 rijen; maïs is zwaar (6000 driehoekjes per plant)
const towers = [];
function buildWorldModels() {
  player = makeModel('farmer', 2.8);
  scene.add(player);
  look3.acc = makeAccessories(player.userData.mesh);
  // maïs als één InstancedMesh (veel planten, weinig rekenwerk)
  corn = new THREE.InstancedMesh(models.corn.geo, models.corn.mat, CORN_N * 2);
  corn.castShadow = false;
  corn.frustumCulled = false;
  scene.add(corn);
  for (let i = 0; i < 2; i++) { const t = makeModel('tower', 22, { shadow: false }); scene.add(t); towers.push(t); }
}

// ---------- objecten van de spellogica naar 3D ----------
const pools = {};
const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.13, 20);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.8, roughness: 0.3, emissive: 0x5a3c00, emissiveIntensity: 0.8 });
const signCache = {};
function signTex(label) {
  if (signCache[label]) return signCache[label];
  const t = canvasTex(128, 64, g => {
    g.fillStyle = '#d9d5c7'; g.fillRect(0, 0, 128, 64);
    g.strokeStyle = '#3a2b1c'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 58);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label + ' m', 64, 34);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return (signCache[label] = t);
}
function createView(o) {
  const g = new THREE.Group();
  switch (o.type) {
    case 'bale': { const m = makeModel('bale', 1.9); g.add(m); break; }
    case 'fence': {
      // laag hekje over alle drie de banen: 4 stukken naast elkaar
      for (let i = 0; i < 4; i++) { const m = makeModel('fence', 1.45, { sx: 1.02 }); m.position.x = -4.8 + i * 3.2; g.add(m); }
      break;
    }
    case 'wolf': {
      const m = makeModel('wolf', 3.0); g.add(m); g.userData.body = m;
      const e1 = eye(0xffd23a, 0.55), e2 = eye(0xffd23a, 0.55);
      g.add(e1, e2); g.userData.eyes = [e1, e2];
      break;
    }
    case 'crow': {
      const m = makeModel('scarecrow', 4.8); g.add(m);
      const e1 = eye(0xff8a2a, 0.5), e2 = eye(0xff8a2a, 0.5);
      e1.position.set(-0.28, 4.05, 0.55); e2.position.set(0.28, 4.05, 0.55);
      g.add(e1, e2); g.userData.eyes = [e1, e2];
      break;
    }
    case 'ghost': {
      const m = makeModel('ghost', 4.6, { shadow: false }); g.add(m);
      const halo = eye(0xcfe0ff, 5); halo.material.opacity = 0.35; halo.position.y = 2.4; g.add(halo);
      break;
    }
    case 'coin': {
      if (o.kind === 'coin') {
        // munt staat rechtop en draait om zijn as (spinner draait, de munt zelf staat op zijn kant)
        const spinner = new THREE.Group(); spinner.position.y = 1;
        const m = new THREE.Mesh(coinGeo, coinMat); m.rotation.x = Math.PI / 2; m.castShadow = true;
        spinner.add(m); g.add(spinner); g.userData.spin = spinner;
      } else {
        const m = makeModel(o.kind === 'vase' ? 'vase' : 'cheese', o.kind === 'vase' ? 1.7 : 0.9); m.position.y = 0.4; g.add(m); g.userData.spin = m;
      }
      const s = eye(o.kind === 'vase' ? 0x9ec3ff : 0xffd66b, o.kind === 'coin' ? 0.9 : 1.6); s.material.opacity = 0.3; s.position.y = 1; g.add(s);
      break;
    }
    case 'sign': {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.8, 0.15), postMat); post.position.y = 0.9; g.add(post);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshStandardMaterial({ map: signTex(o.label), roughness: 1 }));
      board.position.set(0, 1.9, 0.09); g.add(board);
      break;
    }
  }
  scene.add(g);
  return g;
}
function releaseView(o) {
  if (!o.view) return;
  scene.remove(o.view);
  o.view.traverse(n => {
    if (n.isSprite) n.material.dispose();
    if (n.isMesh && (n.geometry.type === 'PlaneGeometry' || n.geometry.type === 'BoxGeometry')) {
      n.geometry.dispose();
      if (n.material !== postMat) n.material.dispose(); // bordje; de textuur zelf blijft in signCache
    }
  });
  o.view = null;
}

// deeltjes (spatten, stof, sterretjes) als kleine sprites uit een pool
const partSprites = [];
function partSprite() {
  let s = partSprites.find(p => !p.visible);
  if (!s) {
    s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
    scene.add(s); partSprites.push(s);
  }
  s.visible = true;
  return s;
}
const ripples = [];
const rippleGeo = new THREE.RingGeometry(0.75, 1, 24);
function rippleMesh() {
  let r = ripples.find(p => !p.visible);
  if (!r) {
    r = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0x9fd2d8, transparent: true, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; scene.add(r); ripples.push(r);
  }
  r.visible = true;
  return r;
}

// ---------- schermgrootte ----------
let lastSize = '';
let lowQuality = false;
function resize() {
  // niet herschalen terwijl het toetsenbord open is (naam typen voor de high scores)
  if (document.activeElement && /^lb(In|Code)$/.test(document.activeElement.id)) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const size = vw + 'x' + vh + 'x' + (window.devicePixelRatio || 1);
  if (size === lastSize) return;
  lastSize = size;
  const aspect = clamp(vh / vw, 1.7, 2.2);
  H = Math.round(W * aspect);
  scale = Math.min(vw / W, vh / H);
  wrap.style.width = Math.round(W * scale) + 'px';
  wrap.style.height = Math.round(H * scale) + 'px';
  ui.style.height = H + 'px';
  ui.style.transform = `scale(${scale})`;
  $('rotate').classList.toggle('hidden', !(vw > vh * 1.15 && isTouch));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowQuality ? 1 : isTouch ? 1.25 : 2));
  renderer.setSize(Math.round(W * scale), Math.round(H * scale), false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
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
    toggle() { muted = !muted; store.set('muted', muted); if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
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
let mode = 'loading'; // loading | title | play | dying | over
let paused = false;
let G = null;
function newGame() {
  if (G) for (const o of G.objs) releaseView(o);
  for (const p of partSprites) p.visible = false;
  for (const r of ripples) r.visible = false;
  G = {
    dist: 0, speed: 230, lane: 1, px: laneX(1), jt: -1, jumpQueued: false,
    loot: 0, coins: 0, objs: [], parts: [], spawnD: 520, nextSign: 100,
    time: 0, banners: [], nextMilestone: 0, blackT: rnd(4, 8), blackPhase: null, blackClock: 0, light: 1,
    shake: 0, flash: 0, dieT: 0, killer: '', hints: {}, runPhase: 0, beatT: 0, god: false, firstDark: true,
  };
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
  else if (dy > th * 1.5) { ptr.done = true; }
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
  if (mode === 'loading') return;
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
  G.banners = [];
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
  $('shareBtn').textContent = '📤 Share';
  show('hud', false);
  const over = $('over');
  over.classList.add('wait');
  show('over', true);
  setTimeout(() => over.classList.remove('wait'), 700);
}
async function share() {
  const url = location.href.split('#')[0].split('?')[0];
  const text = `I ran ${meters()} m on the haunted dike in POLDER DASH 🌊 Can you beat me?`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Polder Dash', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const full = text + ' ' + url;
  try {
    await navigator.clipboard.writeText(full);
    $('shareBtn').textContent = '✓ Copied!';
  } catch (e) {
    const box = $('shareBox');
    box.value = full; show('shareBox', true); box.focus(); box.select();
  }
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
wrap.addEventListener('touchend', e => { if (!e.target.closest('a, button, textarea, input')) e.preventDefault(); }, { passive: false });
function toTitle() {
  newGame();
  show('title', true);
  $('bestTitle').textContent = best.score > 0 ? `Your best: ${best.score} points · ${best.meters} m` : '';
}

// ---------- banners en deeltjes ----------
function banner(text, sub, dur = 2.4) {
  for (const b of G.banners) b.dur = Math.min(b.dur, b.t + 0.2);
  G.banners.push({ text, sub, t: 0, dur });
}
function hint(key, text, sub) { if (G.hints[key]) return; G.hints[key] = true; banner(text, sub, 2.4); }
const MILESTONES = [[100, 'THE FOG ROLLS IN'], [250, 'THE DIKE IS CRACKING'], [500, "THEY KNOW YOU'RE HERE"], [750, "DON'T LOOK BACK"], [1000, 'LEGEND OF THE POLDER']];
// deeltje in logische coördinaten; h = hoogte in studs, vh = snelheid omhoog
function part(x, y, vx, vy, life, color, size, world = true, h = 0.3, vh = 0) {
  if (G.parts.length > 160) return;
  G.parts.push({ x, y, vx, vy, life, max: life, color, size, world, h, vh });
}

// ---------- update (spellogica, gelijk aan classic.js) ----------
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

    const tx = laneX(G.lane), dx = tx - G.px, step = 1500 * dt;
    G.px = Math.abs(dx) <= step ? tx : G.px + Math.sign(dx) * step;
    if (G.jt >= 0) {
      G.jt += dt / JUMP_TIME;
      if (G.jt >= 1) {
        G.jt = -1;
        Sound.land();
        for (let i = 0; i < 6; i++) part(G.px + rnd(-8, 8), PY + 2, rnd(-40, 40), rnd(-20, 10), 0.5, 0x8a7656, 0.35, true, 0.15, rnd(0.5, 1.5));
        if (G.jumpQueued) { G.jumpQueued = false; G.jt = 0; Sound.jump(); }
      }
    }
    if (chance(dt * 10)) part(G.px + rnd(-5, 5), PY + 4, rnd(-15, 15), rnd(10, 30), 0.45, 0x6e5f46, 0.28, true, 0.1, 0.5);

    if (mode === 'play') {
      G.beatT -= dt;
      if (G.beatT <= 0) { Sound.beat(); G.beatT = 60 / (64 + Math.min(70, m / 10)); }
    }

    while (G.spawnD < G.dist + AHEAD) G.spawnD += spawnPattern(G.spawnD);
    while (G.nextSign * PX_PER_M < G.dist + AHEAD) {
      G.objs.push({ type: 'sign', d: G.nextSign * PX_PER_M, label: String(G.nextSign) });
      G.nextSign += 100;
    }

    const ms = MILESTONES[G.nextMilestone];
    const target = ms ? ms[0] : 1000 + (G.nextMilestone - MILESTONES.length + 1) * 500;
    if (m >= target) {
      if (ms) banner(`${target} m`, ms[1], 2.6); else banner(`${target} m!`, 'Still running...', 2.4);
      Sound.milestone();
      G.nextMilestone++;
    }

    if (m > 200) {
      if (G.blackPhase === null) {
        G.blackT -= dt;
        if (G.blackT <= 0) { G.blackPhase = 'flicker'; G.blackClock = 0; Sound.buzz(); }
        G.light = Math.min(1, G.light + dt * 4);
      } else if (G.blackPhase === 'flicker') {
        G.blackClock += dt;
        G.light = 0.7 + 0.3 * Math.cos(G.blackClock * Math.PI * 2 * 3.5);
        if (G.blackClock > 0.9) { G.blackPhase = 'dark'; G.blackClock = 0; G.crowsMoved = false; }
      } else {
        G.blackClock += dt;
        G.light = Math.max(0.1, G.light - dt * 6);
        if (!G.crowsMoved && G.light <= 0.15) {
          // pas schuiven als het licht echt uit is (in 3D zie je het anders gebeuren)
          G.crowsMoved = true;
          let moved = false;
          for (const o of G.objs) {
            if (o.type === 'crow' && o.y < PY - Math.max(120, G.speed * 0.6) && o.y > PY - AHEAD + 100 && o.lane !== G.lane) {
              o.lane += Math.sign(G.lane - o.lane); o.flare = 1; moved = true;
            }
          }
          if (moved) Sound.creak();
          if (G.firstDark) { G.firstDark = false; banner('LIGHTS OUT', 'In the dark, the scarecrows move...', 2.6); }
        }
        if (G.blackClock > 1.1) { G.blackPhase = null; G.blackT = rnd(12, 20); }
      }
    }
  }

  const z = G.jt >= 0 ? Math.sin(Math.PI * G.jt) : 0;
  const air = z > 0.32;
  const near = -20; // vanaf hier (logisch y) zie je het goed genoeg voor een hint
  for (const o of G.objs) {
    if (o.type === 'ghost' && mode !== 'title') o.d -= 40 * dt;
    o.y = PY - (o.d - G.dist);
    if (o.type === 'wolf') {
      if (o.st === 'lurk') {
        o.rip += dt;
        const reach = o.maxLane === 1 ? 140 : 52;
        if (o.y > near - 300 && chance(dt * (o.maxLane === 1 ? 14 : 8))) part(rnd(10, reach), o.y + rnd(-14, 14), 0, 0, 1.1, 'ripple', rnd(0.6, 1.3));
        if (o.y > near && !G.hints.wolf) hint('wolf', 'RIPPLES IN THE DITCH', 'Something is in the water... move right!');
        else if (o.y > near && o.maxLane === 1 && !G.hints.wolf2) hint('wolf2', 'BIG RIPPLES!', 'This one reaches further... go FAR right!');
        if (o.y > PY - 230) {
          o.st = 'lunge'; o.t = 0; Sound.splash(); Sound.growl();
          for (let i = 0; i < 18; i++) part(rnd(20, 60), o.y + rnd(-10, 10), rnd(30, 160), rnd(-60, 60), 0.8, 0xa8d4dc, 0.3, true, rnd(0, 0.6), rnd(3, 7));
        }
      } else if (o.st === 'lunge') {
        o.t = Math.min(1, o.t + dt / 0.28);
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
      if (!o.sang && o.y > near) { o.sang = true; Sound.ghost(); hint('ghost', 'THE WHITE LADY', 'She drifts side to side... time it!'); }
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
          for (let i = 0; i < 8; i++) part(o.x + rnd(-8, 8), o.y, rnd(-60, 60), rnd(-40, 20), 0.5, o.kind === 'vase' ? 0x9ec3ff : 0xffd66b, 0.35, true, 1, rnd(2, 4));
        }
        break;
      case 'bale': if (dy < 24 && Math.abs(o.x - G.px) < 29 && !air) die('bale'); break;
      case 'fence': if (dy < 15 && !air) die('fence'); break;
      case 'wolf': if ((o.st === 'lunge' || o.st === 'out') && dy < 22 && G.px < o.x + 24) die('wolf'); break;
      case 'crow': if (dy < 22 && Math.abs(o.x - G.px) < 26) die('crow'); break;
      case 'ghost': if (dy < 24 && Math.abs(o.x - G.px) < 24) die('ghost'); break;
    }
  }
  G.objs = G.objs.filter(o => {
    const keep = !o.dead && o.y < PY + 160;
    if (!keep) releaseView(o);
    return keep;
  });

  const sp = mode === 'title' ? 110 : G.speed;
  for (const p of G.parts) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.world) p.y += sp * dt;
    p.h += p.vh * dt; p.vh -= 12 * dt;
    if (p.h < 0) { p.h = 0; p.vh = 0; }
  }
  G.parts = G.parts.filter(p => p.life > 0 && p.y < PY + 160);
  for (const b of G.banners) b.t += rdt;
  G.banners = G.banners.filter(b => b.t < b.dur);
}

// ---------- tekenen ----------
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const cornJitter = Array.from({ length: CORN_N * 2 }, (_, i) => ({ x: (i % 2 ? 15.5 : 9.8) + rnd(-1, 1), s: rnd(0.8, 1.05), r: rnd(0, Math.PI * 2) }));
function render(dt = 0) {
  const worldDist = G.dist * S;
  // grond laten meelopen
  mudTex.offset.y = -(worldDist / LEN) * 6;
  grassTex.offset.y = -(worldDist / LEN) * 40;
  waterTex.offset.y = -(worldDist / LEN) * 20 - G.time * 0.01;
  // paaltjes en maïs: herhalen met de afstand
  for (let i = 0; i < POSTS; i++) {
    const z = ((i * POST_GAP + worldDist) % (POSTS * POST_GAP)) - POSTS * POST_GAP + 20;
    tmpM.makeTranslation(wx(ROAD_L) - 0.4, 0.5, z); posts.setMatrixAt(i, tmpM);
  }
  posts.instanceMatrix.needsUpdate = true;
  const cornLen = CORN_N * CORN_GAP;
  for (let i = 0; i < CORN_N * 2; i++) {
    const j = cornJitter[i];
    const z = ((Math.floor(i / 2) * CORN_GAP + (i % 2) * CORN_GAP / 2 + worldDist) % cornLen) - cornLen + 18;
    const cs = (6.6 / models.corn.size[1]) * j.s;
    tmpQ.setFromAxisAngle(up, j.r); tmpS.set(cs, cs, cs); tmpP.set(j.x, 0, z);
    tmpM.compose(tmpP, tmpQ, tmpS); corn.setMatrixAt(i, tmpM);
  }
  corn.instanceMatrix.needsUpdate = true;
  // wachttorens in de verte
  towers.forEach((t, i) => {
    const per = 260, z = ((worldDist + i * per / 2) % per) - per + 30;
    t.position.set(i ? 34 : -36, 0, z);
  });
  for (const s of fogSprites) {
    s.position.z += (mode === 'title' ? 110 : G.speed) * S * s.userData.speed * dt;
    if (s.position.z > 14) { s.position.z = -rnd(110, 140); s.position.x = rnd(-25, 25); }
  }

  // speler
  const z = G.jt >= 0 ? Math.sin(Math.PI * G.jt) : 0;
  // hoogte in beeld: snel omhoog, zodat je op het moment dat je 'in de lucht' telt al boven de baal bent
  const jh = 3.4 * Math.pow(z, 0.6);
  const pxw = wx(G.px);
  const bob = mode === 'over' ? 0 : Math.abs(Math.sin(G.runPhase)) * 0.22;
  if (mode === 'over') player.position.y = lerp(player.position.y, 0, 0.15); // niet in de lucht blijven hangen
  else player.position.set(pxw, jh + bob, 0);
  const lean = clamp((laneX(G.lane) - G.px) / LANE_W, -1, 1);
  player.rotation.set(-0.12 - z * 0.25, lean * 0.35, -lean * 0.25 + Math.sin(G.runPhase) * 0.06);
  if (mode === 'dying' || mode === 'over') { player.rotation.x = -0.9 * Math.min(1, G.dieT * 3); }

  // zaklamp volgt de speler
  const L = G.light;
  flash.position.set(pxw + 0.6, 2.6 + jh, -0.3);
  flash.target.position.set(pxw * 0.35 - 0.8, 0, -24);
  flash.intensity = 120 * L * L;
  glowLight.position.set(pxw, 3.2 + jh, 2.5);
  glowLight.intensity = 2.5 * (0.4 + 0.6 * L);
  hemi.intensity = 0.55 * (0.35 + 0.65 * L);
  moon.intensity = 0.55 * (0.4 + 0.6 * L);

  // objecten
  for (const o of G.objs) {
    if (o.y === undefined) continue;
    if (!o.view) o.view = createView(o);
    const v = o.view, oz = wz(o.y);
    switch (o.type) {
      case 'bale': case 'crow': v.position.set(wx(o.x), 0, oz); break;
      case 'fence': v.position.set(0, 0, oz); break;
      case 'sign': v.position.set(wx(ROAD_L) - 1.2, 0, oz); v.rotation.y = 0.5; break;
      case 'coin': {
        v.position.set(wx(o.x), Math.sin(o.spin * 0.6) * 0.15, oz);
        if (v.userData.spin) v.userData.spin.rotation.y = o.spin;
        break;
      }
      case 'ghost': {
        v.position.set(wx(o.x), 0.25 + Math.sin(G.time * 2 + o.ph) * 0.3, oz);
        v.rotation.y = Math.sin(G.time * 1.7 + o.ph) * 0.4;
        break;
      }
      case 'crow-flare': break;
      case 'wolf': {
        const body = v.userData.body, [e1, e2] = v.userData.eyes;
        if (o.st === 'lurk') {
          // onder water: alleen de ogen boven het wateroppervlak
          body.visible = false;
          v.position.set(wx(30), WATER_Y, oz);
          const a = 0.35 + 0.35 * Math.sin(G.time * 5 + o.d);
          e1.position.set(0.5, 0.12, -0.3); e2.position.set(0.5, 0.12, 0.3);
          e1.material.opacity = e2.material.opacity = a;
        } else {
          body.visible = true;
          const t = o.st === 'lunge' ? easeOut(o.t) : o.st === 'back' ? 1 - o.t : 1;
          const arc = o.st === 'lunge' ? Math.sin(Math.PI * o.t) * 2.2 : 0;
          v.position.set(wx(o.x) - 1.2, lerp(WATER_Y - 2.4, 0, t) + arc, oz);
          v.rotation.z = o.st === 'lunge' ? lerp(0.5, 0, o.t) : 0;
          e1.position.set(1.9, 2.55, -0.32); e2.position.set(1.9, 2.55, 0.32);
          e1.material.opacity = e2.material.opacity = 1;
        }
        break;
      }
    }
    // gloed (ogen, halo) negeert de mist: in de verte langzaam laten opkomen
    const fade = clamp((62 + oz) / 16, 0, 1);
    if (o.type === 'wolf') for (const e of v.userData.eyes) e.material.opacity *= fade; // wolf zet zijn eigen ooghelderheid hierboven
    else v.traverse(n => {
      if (!n.isSprite) return;
      if (n.userData.base === undefined) n.userData.base = n.material.opacity;
      n.material.opacity = n.userData.base * fade;
    });
    if (o.type === 'crow' && v.userData.eyes) {
      const sc = 0.5 + o.flare * 0.6;
      for (const e of v.userData.eyes) e.scale.set(sc, sc, 1);
    }
  }
  // lampje bij de dichtstbijzijnde geest
  let gl = null;
  for (const o of G.objs) if (o.type === 'ghost' && o.view && (!gl || o.y > gl.y)) gl = o;
  if (gl) { ghostLight.position.set(gl.view.position.x, gl.view.position.y + 2.5, gl.view.position.z); ghostLight.intensity = 5; }
  else ghostLight.intensity = 0;
  // deeltjes
  let pi = 0, ri = 0;
  for (const s of partSprites) s.visible = false;
  for (const r of ripples) r.visible = false;
  for (const p of G.parts) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.color === 'ripple') {
      const r = ripples[ri] || rippleMesh(); ri++;
      r.visible = true;
      const t = 1 - a;
      const onRoad = wx(p.x) > wx(62); // de grote wolf: rimpelingen in de modder op de weg
      r.position.set(wx(p.x), onRoad ? (wx(p.x) > wx(ROAD_L) ? 0.04 : WATER_Y / 2 + 0.1) : WATER_Y + 0.03, wz(p.y));
      r.scale.setScalar(p.size * (0.4 + t * 1.6));
      r.material.opacity = 0.55 * a;
    } else {
      const s = partSprites[pi] || partSprite(); pi++;
      s.visible = true;
      s.position.set(wx(p.x), p.h, wz(p.y));
      s.scale.setScalar(p.size);
      s.material.color.setHex(p.color);
      s.material.opacity = a;
    }
  }

  // camera schuin achter de speler
  const shake = G.shake;
  applyLook();
  // benen: zwaaien bij het rennen (minder in de lucht), stil als hij valt; in de winkel rent hij op de plaats
  const shopOn = !!(window.DashLook && window.DashLook.shop);
  if (look3.uLeg) look3.uLeg.value = shopOn ? Math.sin(performance.now() / 110) * 0.5 : (mode === 'play' || mode === 'title') ? Math.sin(G.runPhase) * 0.5 * (1 - z) : 0;
  if (shopOn) {
    // winkel: de boer draait rond en de camera kijkt van dichtbij; hij staat in de bovenste helft (onderin zit de winkel)
    player.rotation.set(0, performance.now() / 1400, 0);
    player.position.y = 0;
    camera.position.set(pxw, 3.0, 5.6);
    camera.lookAt(pxw, 0, 0);
  } else {
    camera.position.set(pxw * 0.45 + rnd(-1, 1) * shake * 0.5, 8.6 + z * 1.0 + rnd(-1, 1) * shake * 0.4, 10.5);
    camera.lookAt(pxw * 0.6 - 0.6, -0.6 + z * 1.0, -20);
  }
  renderer.render(scene, camera);

  // banners en rode flits (DOM)
  const b = G.banners[G.banners.length - 1];
  const bn = $('banner');
  if (b) {
    const a = clamp(Math.min(1, b.t / 0.25, (b.dur - b.t) / 0.5), 0, 1);
    if (bn.dataset.text !== b.text + b.sub) {
      bn.dataset.text = b.text + b.sub;
      bn.querySelector('b').textContent = b.text;
      bn.querySelector('span').textContent = b.sub || '';
    }
    bn.style.opacity = a;
    bn.style.transform = `translateY(${(1 - Math.min(1, b.t / 0.25)) * -12}px)`;
  } else bn.style.opacity = 0;
  $('flash').style.opacity = G.flash * 0.45;
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

let last = performance.now(), perf = 0, hold = false, lastDraw = 0, contextLost = false;
// Trage telefoon? Meet de eerste seconden de beelden per seconde; bij minder dan 24 bieden we de
// eenvoudige (platte) versie aan. De keuze wordt onthouden.
const fpsProbe = { t: 0, n: 0, skip: 45, stage: 0 }; // stage 0 = meten, 1 = na kwaliteit omlaag, 2 = klaar
function goSimple() {
  store.set('classic', true);
  location.href = location.pathname + '?classic';
}
$('simpleBtn').addEventListener('click', goSimple);
$('simpleBtn2').addEventListener('click', goSimple);
// 3: WebGL kwijt (geheugen vol, GPU herstart): pauzeren; komt het niet terug, dan de eenvoudige versie
let lostTimer = null;
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  contextLost = true;
  if (mode === 'play' && !paused) setPaused(true);
  lostTimer = setTimeout(() => { location.href = location.pathname + '?classic'; }, 4000);
});
canvas.addEventListener('webglcontextrestored', () => { contextLost = false; clearTimeout(lostTimer); last = performance.now(); });
function frame(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  // Meet tijdens het spelen (niet het lichte titelscherm). Te traag: eerst kwaliteit omlaag
  // (geen schaduw, minder pixels), daarna pas de eenvoudige versie voorstellen.
  if (fpsProbe.stage < 2 && mode === 'play' && !paused && !document.hidden && !hold) {
    if (fpsProbe.skip > 0) fpsProbe.skip--;
    else {
      fpsProbe.t += Math.min(raw, 1); fpsProbe.n++;
      if (fpsProbe.t > 5) {
        const fps = fpsProbe.n / fpsProbe.t;
        window.__dashFps = fps;
        if (fps >= 24) fpsProbe.stage = 2;
        else if (fpsProbe.stage === 0) {
          lowQuality = true; lastSize = '';
          renderer.shadowMap.enabled = false; flash.castShadow = false;
          scene.traverse(n => { if (n.material) n.material.needsUpdate = true; });
          resize();
          fpsProbe.stage = 1; fpsProbe.t = 0; fpsProbe.n = 0; fpsProbe.skip = 45;
        } else {
          fpsProbe.stage = 2;
          for (const id of ['simpleBtn', 'simpleBtn2']) {
            const b = $(id); b.classList.remove('hidden');
            b.textContent = `Running slow (${Math.round(fps)} fps)? Try simple mode`;
          }
          $('simpleBtn').classList.add('big');
        }
      }
    }
  }
  const t0 = performance.now();
  if (mode !== 'loading' && !contextLost) {
    if (!paused && mode !== 'over' && !hold) update(dt);
    // bij pauze en op het eindscherm hoeft het beeld bijna niet te veranderen: spaart de batterij
    const still = !(window.DashLook && window.DashLook.shop) && (paused || (mode === 'over' && player && Math.abs(player.position.y) < 0.01));
    if (!still || now - lastDraw > 500) { render(paused || mode === 'over' ? 0 : dt); lastDraw = now; }
    hud();
  }
  perf = perf * 0.95 + (performance.now() - t0) * 0.05;
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 300));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

const playBtn = $('playBtn');
playBtn.disabled = true;
playBtn.textContent = 'Loading…';
window.__dash3dReadyPending = true;
newGame();
loadModels(p => { playBtn.textContent = `Loading… ${Math.round(p * 100)}%`; }).then(() => {
  buildWorldModels();
  try { prepLook(); applyLook(); } catch (e) { if (window.console) console.warn('Polder Dash: outfit', e); }
  playBtn.disabled = false;
  playBtn.textContent = '▶ RUN';
  mode = 'title';
  toTitle();
  show('simpleBtn', true); // altijd een kleine link; wordt groot als het traag loopt
  // Alles een keer laten zien en tekenen, zodat de shaders klaar zijn voordat je speelt
  // (anders hapert het spel de eerste keer dat een monster verschijnt).
  const warm = ['bale', 'fence', 'wolf', 'crow', 'ghost', 'sign'].map(type => ({ type, label: '0', x: 180, y: PY - 100, st: 'out', t: 1, maxLane: 0, ph: 0, d: 0, flare: 0 }))
    .concat(['coin', 'vase', 'cheese'].map(kind => ({ type: 'coin', kind, x: 180, y: PY - 100, spin: 0, d: 0 })));
  for (const o of warm) { o.view = createView(o); o.view.position.set(0, 0, -8); }
  const warmRipple = rippleMesh(); warmRipple.position.set(0, 0.05, -8);
  try { renderer.compile(scene, camera); renderer.render(scene, camera); } catch (e) { /* oudere browsers */ }
  for (const o of warm) releaseView(o);
  warmRipple.visible = false;
}).catch(err => {
  console.error(err);
  // modellen niet geladen (slecht netwerk): opnieuw proberen met een tik
  playBtn.disabled = false;
  playBtn.textContent = '↻ Tap to retry';
  playBtn.onclick = () => location.reload();
  const b = $('simpleBtn'); b.classList.remove('hidden'); b.classList.add('big');
  b.textContent = 'Play the simple version';
  b.onclick = () => { location.href = location.pathname + '?classic'; }; // niet onthouden: volgende keer weer 3D proberen
  b.removeEventListener('click', goSimple);
});
requestAnimationFrame(frame);

// voor testen vanuit de console
// testhaak alleen lokaal (anders is valsspelen te makkelijk)
if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) window.__dash = {
  get G() { return G; }, get mode() { return mode; }, get perf() { return perf; }, set hold(v) { hold = v; },
  fpsProbe, get lowQuality() { return lowQuality; },
  start, die, move, jump, laneX, renderer, scene, camera,
  add(o) { G.objs.push(o); return o; },
  setDist(m) { G.dist = m * PX_PER_M; G.spawnD = G.dist + AHEAD; for (const o of G.objs) releaseView(o); G.objs = []; G.nextSign = Math.ceil(m / 100) * 100 || 100; while (MILESTONES[G.nextMilestone] && MILESTONES[G.nextMilestone][0] <= m) G.nextMilestone++; },
  step(n = 1, dt = 1 / 60) { const t0 = performance.now(); for (let i = 0; i < n; i++) { if (!paused && mode !== 'over') update(dt); } render(); hud(); return (performance.now() - t0) / n; },
  tick(dt = 1 / 60) { if (!paused && mode !== 'over') update(dt); },
  renderMs(n = 10) { const t0 = performance.now(); for (let i = 0; i < n; i++) render(); return (performance.now() - t0) / n; },
  ROBLOX_URL,
};

// Modèles 3D « jouet en argile » : volumes arrondis, socle-diorama, accessoires, palette pastel chaude.
// Tout est construit à partir de primitives puis fusionné par matériau (peu d'appels de rendu).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

// ------------------------------------------------------------------ palette
export const PAL = {
  cream: '#f6ead6', creamDark: '#e8d6ba', white: '#fbf8f3', paving: '#e9e1d6', asphalt: '#7b8494',
  grass: '#8fcf6e', grassDark: '#6bb257', leaf: '#5fae5a', leafLight: '#86c96a',
  wood: '#b07446', woodDark: '#8a5634', brick: '#d9704f', terracotta: '#e0674f', terracottaDark: '#b9503b',
  roofBlue: '#4f86d9', roofPurple: '#8b79d9', roofGreen: '#5cb56b', roofRed: '#e2574c',
  glass: '#3d5a80', glassLight: '#9fd3f0', gold: '#f2b632', steel: '#a9b6c4', steelDark: '#7f8c9b',
  stone: '#b9b2aa', stoneLight: '#d4cdc4', hay: '#f1c95a', skin: ['#f3d2b5', '#e0b08a', '#c68b5e', '#8d5a3b'],
  ink: '#2b2b33', water: '#7cc4e8',
};

const mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...opts }));
  return mats.get(key);
}

// --------------------------------------------------------------- primitives
const geoCache = new Map();
const cached = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };

// Variantes : pendant la construction d'un modèle, certaines couleurs sont remplacées (toits, murs).
let REMAP = null;
const VARIANTS = [
  null,
  { '#e0674f': '#d98a4e', '#4f86d9': '#3f9ac9', '#5cb56b': '#4fa88a', '#e2574c': '#c9564b', '#f6ead6': '#f1e1c9', '#8b79d9': '#b06fd0' },
  { '#e0674f': '#b8675a', '#4f86d9': '#6a7fd6', '#5cb56b': '#79b84f', '#e2574c': '#e07a5f', '#f6ead6': '#f3dcc8', '#8b79d9': '#7a8fe0' },
];
function place(geo, color, x, y, z, opts) {
  const m = new THREE.Mesh(geo, mat((REMAP && REMAP[color]) || color, opts));
  m.position.set(x, y, z);
  return m;
}
// Toutes les primitives sont posées « sur » y (leur base est à y).
export const rbox = (w, h, d, c, x = 0, y = 0, z = 0, r = 0.025) =>
  place(cached(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, Math.min(w, h, d) > 0.12 ? 2 : 1, Math.min(r, w / 2.1, h / 2.1, d / 2.1))), c, x, y + h / 2, z);
const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 16) => { const sg = Math.max(rt, rb) < 0.03 ? Math.min(seg, 8) : seg; return place(cached(`cy${rt},${rb},${h},${sg}`, () => new THREE.CylinderGeometry(rt, rb, h, sg)), c, x, y + h / 2, z); };
const sph = (r, c, x = 0, y = 0, z = 0, sy = 1) => { const m = place(cached(`sp${r}`, () => new THREE.SphereGeometry(r, r > 0.06 ? 14 : 9, r > 0.06 ? 10 : 7)), c, x, y, z); m.scale.y = sy; return m; };
const dome = (r, c, x = 0, y = 0, z = 0) => place(cached(`do${r}`, () => new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), c, x, y, z);
const cone = (r, h, c, x = 0, y = 0, z = 0, seg = 12) => place(cached(`co${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), c, x, y + h / 2, z);
const torus = (r, t, c, x, y, z) => { const m = place(cached(`to${r},${t}`, () => new THREE.TorusGeometry(r, t, 8, 20)), c, x, y, z); m.rotation.x = Math.PI / 2; return m; };

// Toit à deux pans arrondi (prisme extrudé avec biseau).
function gable(w, h, d, c, x = 0, y = 0, z = 0, rotY = 0) {
  const geo = cached(`ga${w},${h},${d}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
    g.translate(0, 0, -d / 2);
    return g;
  });
  const m = place(geo, c, x, y, z);
  m.rotation.y = rotY;
  return m;
}

const group = (...children) => { const g = new THREE.Group(); children.flat().forEach((c) => c && g.add(c)); return g; };
const rotY = (o, a) => { o.rotation.y = a; return o; };

// ------------------------------------------------------------- animations
// Les pièces animées ne sont pas fusionnées (userData.keep) ; le renderer les anime via userData.anim.
const anim = (o, a) => { o.userData.keep = true; o.userData.anim = a; o.traverse((c) => { if (c.isMesh) c.castShadow = false; }); return o; };
const smokeMat = new THREE.MeshStandardMaterial({ color: '#f4f1ee', roughness: 1, transparent: true, opacity: 0.75, depthWrite: false });
function smoke(x, y, z, s = 1) {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(cached('puff', () => new THREE.SphereGeometry(0.03, 10, 8)), smokeMat);
    m.userData.phase = k / 3;
    g.add(m);
  }
  g.position.set(x, y, z); g.scale.setScalar(s);
  return anim(g, { type: 'smoke' });
}
const spin = (o, axis = 'y', speed = 2) => anim(o, { type: 'spin', axis, speed });
const bob = (o, amp = 0.02, speed = 1.5) => anim(o, { type: 'bob', amp, speed });
const swing = (o, amp = 0.25, speed = 1.4) => anim(o, { type: 'swing', amp, speed });   // balancement autour de z (crochet, enseigne)
const slide = (o, amp = 0.06, speed = 0.8) => anim(o, { type: 'slide', amp, speed });   // va-et-vient sur x (chariot de grue)
const pulse = (o, amp = 0.12, speed = 3) => anim(o, { type: 'pulse', amp, speed });     // braises qui rougeoient
// Guirlande d'ampoules qui clignotent en alternance (les enfants pairs puis impairs).
const glowBulb = new THREE.MeshStandardMaterial({ color: '#ffe7a3', emissive: '#ffd36b', emissiveIntensity: 0.7, roughness: 0.4 });
function bulbs(n, x0, x1, y, z) {
  // Deux maillages seulement : les ampoules paires et les impaires, allumées à tour de rôle.
  const g = new THREE.Group(), base = new THREE.SphereGeometry(0.011, 8, 6);
  for (const parity of [0, 1]) {
    const geos = [];
    for (let k = parity; k < n; k += 2) geos.push(base.clone().translate(x0 + ((x1 - x0) * k) / Math.max(1, n - 1), y, z));
    g.add(new THREE.Mesh(mergeGeometries(geos, false), glowBulb));
  }
  return anim(g, { type: 'blink', speed: 2.2 });
}
const emberMat = new THREE.MeshStandardMaterial({ color: '#ff8a3d', emissive: '#ff5a1f', emissiveIntensity: 0.85, roughness: 0.5 });
function flag(color, x, y, z, h = 0.3) {
  const cloth = new THREE.Group();
  cloth.add(rbox(0.11, 0.065, 0.008, color, 0.055, -0.0325, 0, 0.004));
  cloth.position.set(x, y + h - 0.01, z);
  return group(cyl(0.006, 0.006, h, PAL.ink, x, y, z, 6), anim(cloth, { type: 'flag' }));
}

// ---------------------------------------------------------------- accessoires
const plinth = (c = PAL.paving, w = 0.9, d = 0.9) => rbox(w, 0.07, d, c, 0, 0, 0, 0.03);
const Y0 = 0.07; // dessus du socle

function windowAt(x, y, z, face = 'z', w = 0.07, h = 0.08) {
  const depth = 0.012;
  const frame = face === 'z' ? rbox(w + 0.02, h + 0.02, depth, PAL.white, x, y, z, 0.005) : rbox(depth, h + 0.02, w + 0.02, PAL.white, x, y, z, 0.005);
  const pane = face === 'z' ? rbox(w, h, depth, PAL.glass, x, y + 0.01, z + 0.004, 0.004) : rbox(depth, h, w, PAL.glass, x + 0.004, y + 0.01, z, 0.004);
  return [frame, pane];
}
function door(x, y, z, c = PAL.woodDark, face = 'z') {
  return face === 'z' ? rbox(0.08, 0.12, 0.014, c, x, y, z, 0.006) : rbox(0.014, 0.12, 0.08, c, x, y, z, 0.006);
}
function awning(w, colors, x, y, z) {
  const n = 5, sw = w / n;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const s = rbox(sw, 0.016, 0.12, colors[i % colors.length], x - w / 2 + sw * (i + 0.5), y, z + 0.06, 0.006);
    s.rotation.x = 0.35; parts.push(s);
  }
  return parts;
}
const bush = (x, z, s = 1, c = PAL.leaf) => [sph(0.05 * s, c, x, Y0 + 0.045 * s, z), sph(0.035 * s, PAL.leafLight, x + 0.025 * s, Y0 + 0.07 * s, z - 0.01)];
const pot = (x, z) => [cyl(0.026, 0.02, 0.04, PAL.terracotta, x, Y0, z, 10), sph(0.035, PAL.leaf, x, Y0 + 0.07, z)];
const lollipopTree = (x, z, s = 1) => [cyl(0.012 * s, 0.016 * s, 0.09 * s, PAL.woodDark, x, Y0, z, 8), sph(0.07 * s, PAL.leaf, x, Y0 + 0.14 * s, z), sph(0.045 * s, PAL.leafLight, x + 0.03 * s, Y0 + 0.17 * s, z + 0.02 * s)];
const lamp = (x, z) => [cyl(0.008, 0.01, 0.2, PAL.ink, x, Y0, z, 8), sph(0.022, '#ffe7a3', x, Y0 + 0.21, z)];
const crate = (x, z, c = PAL.wood, s = 0.06) => rbox(s, s, s, c, x, Y0, z, 0.008);
function bench(x, z, r = 0) {
  const g = group(rbox(0.12, 0.015, 0.04, PAL.wood, 0, 0.03, 0, 0.005), rbox(0.12, 0.04, 0.012, PAL.wood, 0, 0.045, -0.018, 0.005),
    rbox(0.012, 0.03, 0.03, PAL.ink, -0.05, 0, 0, 0.003), rbox(0.012, 0.03, 0.03, PAL.ink, 0.05, 0, 0, 0.003));
  g.position.set(x, Y0, z); g.rotation.y = r;
  return g;
}
function fence(w, d, gapSide = 'z+') {
  const parts = [];
  const post = (x, z) => rbox(0.018, 0.06, 0.018, PAL.white, x, Y0, z, 0.006);
  const railX = (z, x0, x1) => rbox(Math.abs(x1 - x0), 0.012, 0.01, PAL.white, (x0 + x1) / 2, Y0 + 0.035, z, 0.004);
  const railZ = (x, z0, z1) => rbox(0.01, 0.012, Math.abs(z1 - z0), PAL.white, x, Y0 + 0.035, (z0 + z1) / 2, 0.004);
  const hw = w / 2, hd = d / 2;
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, -hd], [-hw, 0], [hw, 0]]) parts.push(post(x, z));
  parts.push(railX(-hd, -hw, hw), railZ(-hw, -hd, hd), railZ(hw, -hd, hd));
  if (gapSide === 'z+') parts.push(railX(hd, -hw, -0.12), railX(hd, 0.12, hw));
  return parts;
}
function sign(text = '', x, y, z, c = PAL.white, accent = PAL.terracotta) {
  return [rbox(0.2, 0.06, 0.02, accent, x, y, z, 0.01), rbox(0.17, 0.035, 0.012, c, x, y + 0.012, z + 0.008, 0.008)];
}
// Petit bâtiment générique : murs + fenêtres + porte + toit à deux pans.
function cottage({ w = 0.3, h = 0.2, d = 0.26, wall = PAL.cream, roof = PAL.terracotta, x = 0, z = 0, y = Y0, chimney = true }) {
  const parts = [rbox(w, h, d, wall, x, y, z, 0.02), gable(w + 0.06, 0.13, d + 0.04, roof, x, y + h, z)];
  parts.push(door(x, y, z + d / 2 + 0.002));
  parts.push(...windowAt(x - w * 0.3, y + h * 0.45, z + d / 2 + 0.002), ...windowAt(x + w * 0.3, y + h * 0.45, z + d / 2 + 0.002));
  parts.push(...windowAt(x + w / 2 + 0.002, y + h * 0.45, z, 'x'));
  if (chimney) parts.push(rbox(0.04, 0.09, 0.04, PAL.brick, x + w * 0.25, y + h + 0.05, z - d * 0.15, 0.008), smoke(x + w * 0.25, y + h + 0.16, z - d * 0.15, 0.8));
  return parts;
}
// Bâtiment à toit plat avec acrotère (style boutique).
function shop({ w = 0.42, h = 0.26, d = 0.34, wall = PAL.cream, roof = PAL.roofGreen, x = 0, z = 0 }) {
  return [
    rbox(w, h, d, wall, x, Y0, z, 0.025),
    rbox(w + 0.04, 0.04, d + 0.04, roof, x, Y0 + h, z, 0.015),
    rbox(w - 0.04, 0.012, d - 0.04, PAL.creamDark, x, Y0 + h + 0.03, z, 0.005),
  ];
}

// ------------------------------------------------------------------ fusion
// Fusionne les maillages d'un groupe par matériau : un modèle = quelques draw calls.
// Matériau partagé : couleurs portées par les sommets → un seul appel de dessin par modèle.
const BAKED = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
const isPlain = (m) => !m.transparent && !m.metalness && m.emissive.getHex() === 0 && Math.abs(m.roughness - 0.62) < 1e-6;
function bake(root) {
  root.updateMatrixWorld(true);
  const plain = [];
  const special = new Map();
  const keep = [];
  const kept = (o) => { for (let a = o; a && a !== root; a = a.parent) if (a.userData.keep) return true; return false; };
  root.traverse((o) => { if (o.userData.keep && !kept(o.parent)) keep.push(o); });
  root.traverse((o) => {
    if (!o.isMesh || kept(o)) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(o.matrixWorld);
    if (isPlain(o.material)) {
      const n = g.attributes.position.count, c = o.material.color, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      plain.push(g);
    } else {
      if (!special.has(o.material)) special.set(o.material, []);
      special.get(o.material).push(g);
    }
  });
  const out = new THREE.Group();
  const add = (geos, m) => {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
    geos.forEach((g) => g.dispose());
  };
  if (plain.length) add(plain, BAKED);
  for (const [m, geos] of special) add(geos, m);
  for (const k of keep) {
    const mw = k.matrixWorld.clone();
    k.removeFromParent();
    mw.decompose(k.position, k.quaternion, k.scale);
    out.add(mergeKept(k));
  }
  return out;
}
// Une pièce animée faite de plusieurs primitives (pales, roue, grue…) est fusionnée dans son propre repère :
// elle bouge d'un bloc et ne coûte qu'un appel de dessin par matériau. La fumée et les guirlandes gardent
// leurs enfants séparés, puisqu'ils s'animent un par un.
function mergeKept(k) {
  const a = k.userData.anim;
  if (!a || a.type === 'smoke' || a.type === 'blink') return k;
  let nested = false, meshes = 0;
  k.traverse((o) => { if (o !== k && o.userData.keep) nested = true; if (o.isMesh) meshes++; });
  if (nested || meshes < 2) return k;
  k.updateMatrixWorld(true);
  const inv = k.matrixWorld.clone().invert();
  const byMat = new Map();
  k.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    let m = o.material;
    if (isPlain(m)) {
      const n = g.attributes.position.count, c = m.color, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      m = BAKED;
    }
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(g);
  });
  const out = new THREE.Group();
  out.position.copy(k.position); out.quaternion.copy(k.quaternion); out.scale.copy(k.scale);
  out.userData = k.userData;
  for (const [m, geos] of byMat) { const mesh = new THREE.Mesh(mergeGeometries(geos, false), m); mesh.castShadow = false; mesh.receiveShadow = true; out.add(mesh); geos.forEach((g) => g.dispose()); }
  return out;
}

// --------------------------------------------------------------------- villes
const WALLS = [PAL.cream, '#f3d9c4', '#dfe9f2', '#f5e3a8', '#e6dcf3'];
// Maisons de ville : leur style suit le palier de la ville. Chaumières à colombages au départ, maisons de bourg
// à étage avec les Artisans, petits immeubles à toit-terrasse avec les Savants.
function townHouse(i, tier, color, smoky) {
  const wall = WALLS[i % WALLS.length];
  const roof = i % 2 ? color : [PAL.terracotta, '#c9784a', PAL.terracottaDark][i % 3];
  const p = [];
  if (tier <= 0) {
    const w = 0.16, d = 0.14, h = 0.11 + (i % 2) * 0.025, y = Y0 + 0.022;
    p.push(rbox(w + 0.01, 0.022, d + 0.01, PAL.stone, 0, Y0, 0, 0.008), rbox(w, h, d, wall, 0, y, 0, 0.014));
    for (const x of [-w / 2 + 0.012, w / 2 - 0.012]) p.push(rbox(0.012, h, 0.006, PAL.woodDark, x, y, d / 2 + 0.002, 0.003));
    p.push(rbox(w, 0.01, 0.006, PAL.woodDark, 0, y + h * 0.6, d / 2 + 0.002, 0.003));
    const brace = rbox(0.008, h * 0.62, 0.006, PAL.woodDark, -0.035, y, d / 2 + 0.003, 0.002); brace.rotation.z = 0.5; p.push(brace);
    p.push(gable(w + 0.05, 0.12, d + 0.05, i % 3 === 2 ? PAL.hay : roof, 0, y + h, 0));
    p.push(door(0.035, y, d / 2 + 0.004), ...windowAt(-0.035, y + h * 0.3, d / 2 + 0.004, 'z', 0.04, 0.04));
    p.push(rbox(0.05, 0.014, 0.02, PAL.terracotta, -0.035, y + h * 0.22, d / 2 + 0.014, 0.004), sph(0.011, '#ff8fab', -0.048, y + h * 0.22 + 0.02, d / 2 + 0.014), sph(0.011, PAL.gold, -0.024, y + h * 0.22 + 0.02, d / 2 + 0.014));
    if (smoky) p.push(rbox(0.035, 0.08, 0.035, PAL.stone, 0.045, y + h + 0.03, -0.03, 0.008), smoke(0.045, y + h + 0.13, -0.03, 0.7));
  } else if (tier === 1) {
    const w = 0.15, d = 0.14, h = 0.22 + (i % 2) * 0.03;
    p.push(rbox(w, h, d, wall, 0, Y0, 0, 0.014), rbox(w + 0.008, 0.012, d + 0.008, PAL.white, 0, Y0 + h * 0.5, 0, 0.004));
    p.push(gable(w + 0.04, 0.1, d + 0.04, roof, 0, Y0 + h, 0), rbox(0.05, 0.05, 0.05, wall, -0.03, Y0 + h + 0.02, 0.03, 0.01), rbox(0.03, 0.03, 0.006, PAL.glass, -0.03, Y0 + h + 0.03, 0.056, 0.003));
    for (const x of [-0.04, 0.04]) p.push(...windowAt(x, Y0 + h * 0.62, d / 2 + 0.003, 'z', 0.035, 0.05));
    p.push(...windowAt(-0.04, Y0 + h * 0.18, d / 2 + 0.003, 'z', 0.035, 0.045), door(0.04, Y0, d / 2 + 0.003, PAL.woodDark));
    const aw = rbox(0.06, 0.008, 0.035, color, 0.04, Y0 + 0.13, d / 2 + 0.017, 0.003); aw.rotation.x = 0.35; p.push(aw);
    if (smoky) p.push(rbox(0.03, 0.07, 0.03, PAL.brick, 0.045, Y0 + h + 0.04, -0.03, 0.006), smoke(0.045, Y0 + h + 0.12, -0.03, 0.7));
  } else {
    const w = 0.16, d = 0.15, h = 0.3 + (i % 3) * 0.04;
    p.push(rbox(w, h, d, wall, 0, Y0, 0, 0.018), rbox(w + 0.012, 0.018, d + 0.012, PAL.white, 0, Y0 + h, 0, 0.006));
    for (let f = 0; f < 3; f++) {
      const y = Y0 + 0.07 + f * (h - 0.08) / 3;
      p.push(rbox(w - 0.03, 0.04, 0.006, '#7fa9c9', 0, y, d / 2 + 0.002, 0.003));
      if (f > 0 && f % 2 === i % 2) p.push(rbox(w * 0.6, 0.008, 0.03, PAL.white, 0, y - 0.006, d / 2 + 0.015, 0.003), rbox(w * 0.6, 0.02, 0.004, color, 0, y, d / 2 + 0.03, 0.002));
    }
    p.push(rbox(0.06, 0.06, 0.008, '#9fd3f0', 0, Y0, d / 2 + 0.003, 0.004), rbox(0.08, 0.008, 0.03, color, 0, Y0 + 0.07, d / 2 + 0.014, 0.003));
    p.push(rbox(0.06, 0.03, 0.05, PAL.creamDark, -0.03, Y0 + h + 0.018, -0.02, 0.008), sph(0.025, PAL.leaf, 0.04, Y0 + h + 0.04, 0.03, 0.8));
  }
  return p;
}
export function cityModel(color, pop, capital, tier = 0) {
  const parts = [plinth(PAL.paving, 0.92, 0.92)];
  // Palier Artisans : place avec fontaine et étal ; palier Savants : maisons à étage et tour à coupole.
  if (tier >= 1) {
    parts.push(cyl(0.075, 0.08, 0.035, PAL.stoneLight, 0, Y0, 0.3, 18), cyl(0.06, 0.06, 0.01, PAL.water, 0, Y0 + 0.03, 0.3, 18), cyl(0.012, 0.016, 0.07, PAL.stoneLight, 0, Y0 + 0.03, 0.3, 8), sph(0.016, PAL.glassLight, 0, Y0 + 0.11, 0.3));
    parts.push(rbox(0.1, 0.05, 0.06, PAL.wood, 0.32, Y0, 0.05, 0.01), ...awning(0.1, [PAL.roofRed, PAL.white], 0.32, Y0 + 0.08, -0.02));
  }
  if (tier >= 2) {
    parts.push(cyl(0.05, 0.06, 0.34, PAL.white, -0.32, Y0, 0.32, 12), dome(0.05, color, -0.32, Y0 + 0.34, 0.32), flag(color, -0.32, Y0 + 0.39, 0.32, 0.14));
  }
  const spots = [[-0.24, -0.22, 0], [0.24, -0.24, 0], [-0.26, 0.2, 1], [0.25, 0.22, 1], [0, -0.3, 0], [-0.3, -0.02, 1]];
  const n = Math.min(spots.length, 2 + pop);
  for (let i = 0; i < n; i++) {
    const [x, z] = spots[i];
    const g = group(townHouse(i, tier, color, i === 0)); // une seule cheminée fumante par ville
    g.position.set(x, 0, z); g.rotation.y = spots[i][2] ? Math.PI : 0;
    parts.push(g);
  }
  // Hôtel de ville avec tour d'horloge
  const hall = capital ? 0.26 : 0.2;
  parts.push(rbox(hall, 0.2, hall * 0.8, PAL.white, 0, Y0, 0.02, 0.02), gable(hall + 0.06, 0.1, hall * 0.8 + 0.04, color, 0, Y0 + 0.2, 0.02));
  parts.push(door(0, Y0, 0.02 + hall * 0.4 + 0.002, color));
  if (capital) {
    parts.push(rbox(0.09, 0.22, 0.09, PAL.cream, 0, Y0 + 0.2, -0.02, 0.012), cyl(0.03, 0.03, 0.01, PAL.white, 0, Y0 + 0.36, 0.025, 16));
    parts.push(rotY(gable(0.12, 0.09, 0.12, color, 0, Y0 + 0.42, -0.02), 0));
    parts[parts.length - 2].rotation.x = Math.PI / 2;
    parts.push(flag(color, 0, Y0 + 0.5, -0.02, 0.16));
  }
  parts.push(...lollipopTree(0.33, 0.33, 0.8), ...lollipopTree(-0.34, 0.34, 0.7), ...lamp(0.12, 0.2), ...lamp(-0.12, 0.2));
  return bake(group(parts));
}

// ------------------------------------------------------------------ bâtiments
const BUILDERS = {
  farm: () => {
    const p = [plinth(PAL.grass), ...fence(0.82, 0.82)];
    p.push(...cottage({ w: 0.26, h: 0.18, d: 0.22, wall: PAL.roofRed, roof: PAL.white, x: 0.17, z: -0.17, chimney: false }));
    p.push(rbox(0.07, 0.2, 0.07, PAL.white, -0.05, Y0, -0.24, 0.02), dome(0.045, PAL.roofRed, -0.05, Y0 + 0.2, -0.24));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) p.push(sph(0.028, r % 2 ? PAL.hay : PAL.leafLight, -0.3 + c * 0.08, Y0 + 0.02, 0.05 + r * 0.1, 0.8));
    p.push(rbox(0.1, 0.06, 0.06, PAL.hay, 0.25, Y0, 0.15, 0.02), rbox(0.1, 0.06, 0.06, PAL.hay, 0.25, Y0 + 0.06, 0.15, 0.02), rbox(0.1, 0.06, 0.06, PAL.hay, 0.25, Y0, 0.24, 0.02));
    // Moulin à vent
    p.push(cyl(0.045, 0.07, 0.3, PAL.cream, -0.3, Y0, -0.28, 10), cone(0.06, 0.08, PAL.roofRed, -0.3, Y0 + 0.3, -0.28, 10));
    const blades = new THREE.Group();
    for (let k = 0; k < 4; k++) { const b = rbox(0.022, 0.16, 0.006, PAL.white, 0, 0, 0, 0.004); b.position.y = 0.08; const arm = new THREE.Group(); arm.add(b); arm.rotation.z = (k * Math.PI) / 2; blades.add(arm); }
    blades.add(sph(0.018, PAL.woodDark, 0, 0, 0));
    blades.position.set(-0.3, Y0 + 0.26, -0.22);
    p.push(spin(blades, 'z', 1.6));
    // Petits animaux
    p.push(sph(0.025, PAL.white, -0.05, Y0 + 0.03, 0.3), sph(0.014, PAL.ink, -0.025, Y0 + 0.04, 0.3), sph(0.022, '#f3d2b5', 0.08, Y0 + 0.025, 0.32));
    return p;
  },
  market: () => {
    const p = [plinth(PAL.paving)];
    p.push(...shop({ w: 0.44, h: 0.24, d: 0.3, wall: '#f3d9c4', roof: PAL.roofGreen, z: -0.1 }));
    p.push(...awning(0.44, [PAL.roofGreen, PAL.white], 0, Y0 + 0.2, 0.05));
    p.push(rbox(0.18, 0.14, 0.012, PAL.glassLight, -0.1, Y0 + 0.02, 0.052, 0.006), door(0.12, Y0, 0.052, PAL.roofGreen));
    p.push(...sign('', 0, Y0 + 0.3, 0.065, PAL.white, PAL.roofBlue));
    for (const [x, c] of [[-0.25, '#ff9f43'], [-0.13, PAL.roofRed], [0.0, '#ffd23f']]) p.push(crate(x, 0.28), sph(0.022, c, x - 0.012, Y0 + 0.07, 0.28), sph(0.022, c, x + 0.014, Y0 + 0.07, 0.285));
    p.push(...pot(0.3, 0.12), ...pot(0.3, 0.3), flag(PAL.roofGreen, 0.18, Y0 + 0.3, -0.2, 0.16));
    return p;
  },
  library: () => {
    const p = [plinth(PAL.paving)];
    p.push(rbox(0.5, 0.06, 0.4, PAL.creamDark, 0, Y0, -0.06, 0.02), rbox(0.44, 0.22, 0.3, PAL.cream, 0, Y0 + 0.06, -0.08, 0.02));
    p.push(rotY(gable(0.36, 0.12, 0.52, PAL.roofBlue, 0, Y0 + 0.28, -0.08), Math.PI / 2));
    for (const x of [-0.16, -0.055, 0.055, 0.16]) p.push(cyl(0.018, 0.02, 0.22, PAL.white, x, Y0 + 0.06, 0.1, 12));
    p.push(rbox(0.46, 0.03, 0.06, PAL.white, 0, Y0 + 0.27, 0.1, 0.01), door(0, Y0 + 0.06, 0.072, PAL.roofBlue));
    p.push(...windowAt(-0.12, Y0 + 0.14, 0.072), ...windowAt(0.12, Y0 + 0.14, 0.072));
    p.push(bench(-0.25, 0.3), ...pot(0.3, 0.3), ...bush(0.18, 0.32), ...lollipopTree(-0.34, -0.3, 0.8), flag(PAL.roofBlue, 0.2, Y0 + 0.28, -0.2, 0.18));
    return p;
  },
  lab: () => {
    const p = [plinth(PAL.paving)];
    p.push(...shop({ w: 0.36, h: 0.24, d: 0.3, wall: PAL.white, roof: PAL.roofBlue, x: -0.08, z: -0.06 }));
    p.push(rbox(0.36, 0.015, 0.012, PAL.roofBlue, -0.08, Y0 + 0.12, 0.092, 0.005), ...windowAt(-0.17, Y0 + 0.15, 0.092), ...windowAt(0.01, Y0 + 0.15, 0.092), door(-0.08, Y0, 0.092, PAL.steelDark));
    p.push(dome(0.1, PAL.glassLight, -0.08, Y0 + 0.28, -0.06));
    p.push(cyl(0.07, 0.07, 0.24, PAL.steel, 0.26, Y0, -0.12, 18), dome(0.07, PAL.steel, 0.26, Y0 + 0.24, -0.12), torus(0.071, 0.008, PAL.roofBlue, 0.26, Y0 + 0.08, -0.12));
    const pipe = cyl(0.015, 0.015, 0.16, PAL.steelDark, 0.16, Y0 + 0.15, -0.1, 8); pipe.rotation.z = Math.PI / 2; pipe.position.y = Y0 + 0.17; p.push(pipe);
    const dish = group(cyl(0.006, 0.006, 0.12, PAL.ink, 0, 0, 0, 6), dome(0.035, PAL.white, 0.0, 0.12, 0)); dish.children[1].rotation.x = 0.6;
    dish.position.set(-0.2, Y0 + 0.3, -0.16); p.push(spin(dish, 'y', 0.6));
    p.push(...pot(0.3, 0.3), bench(0.1, 0.3));
    return p;
  },
  district: () => {
    const p = [plinth(PAL.paving)];
    p.push(...cottage({ w: 0.2, h: 0.32, d: 0.2, wall: '#f3d9c4', roof: PAL.roofPurple, x: -0.2, z: -0.18 }));
    p.push(...cottage({ w: 0.2, h: 0.24, d: 0.2, wall: '#dfe9f2', roof: PAL.terracotta, x: 0.12, z: -0.2, chimney: false }));
    p.push(...shop({ w: 0.26, h: 0.18, d: 0.2, wall: PAL.cream, roof: PAL.roofBlue, x: 0.08, z: 0.18 }));
    p.push(...awning(0.26, [PAL.roofBlue, PAL.white], 0.08, Y0 + 0.15, 0.28));
    p.push(...lamp(-0.3, 0.3), ...pot(-0.18, 0.12), ...lollipopTree(-0.3, 0.12, 0.7));
    return p;
  },
  monument: () => {
    const p = [plinth(PAL.paving)];
    p.push(cyl(0.3, 0.32, 0.03, PAL.creamDark, 0, Y0, 0, 28), cyl(0.18, 0.2, 0.04, PAL.cream, 0, Y0 + 0.03, 0, 24));
    p.push(rbox(0.12, 0.12, 0.12, PAL.white, 0, Y0 + 0.07, 0, 0.015), cyl(0.03, 0.045, 0.28, PAL.cream, 0, Y0 + 0.19, 0, 4), bob(group(sph(0.045, PAL.gold, 0, Y0 + 0.52, 0)), 0.012, 1.2));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; p.push(...bush(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0.9)); }
    return p;
  },
  lighthouse: () => {
    const p = [plinth('#f2dfb4')];
    p.push(sph(0.14, PAL.stone, -0.2, Y0, 0.2, 0.6), sph(0.1, PAL.stoneLight, 0.24, Y0, 0.22, 0.6));
    p.push(cyl(0.14, 0.17, 0.05, PAL.white, 0, Y0, -0.05, 20));
    for (let i = 0; i < 4; i++) p.push(cyl(0.12 - i * 0.015, 0.13 - i * 0.015, 0.12, i % 2 ? PAL.roofRed : PAL.white, 0, Y0 + 0.05 + i * 0.12, -0.05, 20));
    p.push(cyl(0.11, 0.11, 0.02, PAL.ink, 0, Y0 + 0.53, -0.05, 20), cyl(0.07, 0.07, 0.09, '#ffe58a', 0, Y0 + 0.55, -0.05, 16), dome(0.09, PAL.roofRed, 0, Y0 + 0.64, -0.05));
    const beam = group(place(cached('beam', () => new THREE.ConeGeometry(0.06, 0.5, 10, 1, true)), '#fff3b0', 0.27, 0, 0, { transparent: true, opacity: 0.35, emissive: '#fff3b0', emissiveIntensity: 0.6, depthWrite: false }));
    beam.children[0].rotation.z = Math.PI / 2; beam.position.set(0, Y0 + 0.595, -0.05); p.push(spin(beam, 'y', 1.2));
    p.push(...cottage({ w: 0.18, h: 0.12, d: 0.14, wall: PAL.white, roof: PAL.roofRed, x: 0.26, z: -0.22, chimney: false }));
    return p;
  },
  grandlibrary: () => {
    const p = [plinth(PAL.paving, 0.94, 0.94)];
    p.push(rbox(0.74, 0.06, 0.56, PAL.creamDark, 0, Y0, -0.05, 0.02), rbox(0.66, 0.28, 0.44, PAL.cream, 0, Y0 + 0.06, -0.06, 0.025));
    for (let i = 0; i < 7; i++) p.push(cyl(0.02, 0.022, 0.28, PAL.white, -0.27 + i * 0.09, Y0 + 0.06, 0.2, 12));
    p.push(rbox(0.7, 0.04, 0.08, PAL.white, 0, Y0 + 0.34, 0.2, 0.012));
    p.push(cyl(0.16, 0.17, 0.08, PAL.white, 0, Y0 + 0.34, -0.06, 24), dome(0.16, PAL.roofBlue, 0, Y0 + 0.42, -0.06), sph(0.025, PAL.gold, 0, Y0 + 0.59, -0.06));
    p.push(...lollipopTree(-0.38, 0.35, 0.8), ...lollipopTree(0.38, 0.35, 0.8), bench(0, 0.36), flag(PAL.roofBlue, -0.28, Y0 + 0.38, 0.2, 0.18), flag(PAL.gold, 0.28, Y0 + 0.38, 0.2, 0.18));
    return p;
  },
  observatory: () => {
    const p = [plinth(PAL.stoneLight, 0.94, 0.94)];
    p.push(cyl(0.28, 0.3, 0.26, PAL.white, 0, Y0, 0, 28), torus(0.285, 0.012, PAL.roofBlue, 0, Y0 + 0.13, 0));
    const d = dome(0.28, '#eef3f8', 0, Y0 + 0.26, 0); p.push(d);
    const slit = rbox(0.07, 0.3, 0.06, PAL.glass, 0.12, 0.02, 0.1, 0.02); slit.rotation.z = -0.5;
    const scope = cyl(0.035, 0.045, 0.24, PAL.steelDark, 0.2, 0.16, 0.12, 12); scope.rotation.z = -0.9;
    const turret = group(slit, scope); turret.position.y = Y0 + 0.26; p.push(spin(turret, 'y', 0.25));
    p.push(door(0, Y0, 0.295, PAL.roofBlue), ...lamp(0.36, 0.36), ...lamp(-0.36, 0.36));
    return p;
  },
  exchange: () => {
    const p = [plinth(PAL.paving, 0.94, 0.94)];
    p.push(rbox(0.76, 0.08, 0.6, PAL.creamDark, 0, Y0, -0.04, 0.02), rbox(0.64, 0.28, 0.44, PAL.white, 0, Y0 + 0.08, -0.06, 0.025));
    for (let i = 0; i < 6; i++) p.push(cyl(0.024, 0.026, 0.28, PAL.white, -0.26 + i * 0.104, Y0 + 0.08, 0.2, 12));
    p.push(rotY(gable(0.74, 0.16, 0.56, PAL.gold, 0, Y0 + 0.36, -0.04), 0));
    const coin = cyl(0.05, 0.05, 0.012, PAL.gold, 0, -0.006, 0, 20); coin.rotation.x = Math.PI / 2; const coinG = group(coin); coinG.position.set(0, Y0 + 0.47, 0.25); p.push(spin(coinG, 'y', 1.2));
    p.push(...pot(-0.38, 0.38), ...pot(0.38, 0.38));
    return p;
  },
  nations: () => {
    const p = [plinth(PAL.paving, 0.94, 0.94)];
    p.push(rbox(0.6, 0.26, 0.4, PAL.white, 0, Y0, -0.08, 0.025), cyl(0.15, 0.16, 0.1, PAL.white, 0, Y0 + 0.26, -0.08, 24), dome(0.15, '#5ccfc0', 0, Y0 + 0.36, -0.08));
    for (let i = 0; i < 4; i++) p.push(...windowAt(-0.21 + i * 0.14, Y0 + 0.13, 0.122));
    const colors = ['#ff6b4a', '#8b5cf6', '#f5b700', '#14b8a6', '#ec4899'];
    colors.forEach((c, i) => p.push(flag(c, -0.36 + i * 0.18, Y0, 0.32, 0.3)));
    return p;
  },
  sawmill: () => {
    const p = [plinth('#e9dcc5')];
    p.push(rbox(0.34, 0.2, 0.26, PAL.wood, -0.12, Y0, -0.12, 0.02), rotY(gable(0.4, 0.12, 0.3, PAL.roofRed, -0.12, Y0 + 0.2, -0.12), 0));
    p.push(door(-0.12, Y0, 0.012, PAL.woodDark), ...windowAt(-0.24, Y0 + 0.1, 0.012));
    for (let i = 0; i < 4; i++) p.push(rbox(0.3, 0.025, 0.09, i % 2 ? '#e2b27a' : PAL.planksLight || '#d9a46a', 0.18, Y0 + i * 0.026, 0.2, 0.006));
    const saw = cyl(0.08, 0.08, 0.012, PAL.steel, 0.2, Y0 + 0.1, -0.12, 22); saw.rotation.x = Math.PI / 2; p.push(rbox(0.2, 0.08, 0.08, PAL.roofBlue, 0.2, Y0, -0.12, 0.015), spin(saw, 'y', 6));
    p.push(...lollipopTree(0.34, -0.34, 0.7));
    return p;
  },
  manufactory: () => {
    const p = [plinth(PAL.paving)];
    p.push(rbox(0.5, 0.24, 0.32, PAL.brick, -0.05, Y0, -0.1, 0.02));
    for (let i = 0; i < 3; i++) p.push(rotY(gable(0.18, 0.08, 0.34, i % 2 ? PAL.white : PAL.roofBlue, -0.22 + i * 0.17, Y0 + 0.24, -0.1), 0));
    p.push(cyl(0.035, 0.045, 0.32, PAL.brick, 0.26, Y0, -0.24, 12), torus(0.04, 0.008, PAL.white, 0.26, Y0 + 0.3, -0.24), smoke(0.26, Y0 + 0.36, -0.24, 1.6));
    p.push(...windowAt(-0.2, Y0 + 0.1, 0.062), ...windowAt(0.1, Y0 + 0.1, 0.062), rbox(0.12, 0.14, 0.014, PAL.gold, -0.05, Y0, 0.062, 0.006));
    p.push(rbox(0.5, 0.025, 0.08, PAL.ink, 0.0, Y0 + 0.02, 0.25, 0.01));
    for (let i = 0; i < 4; i++) p.push(rbox(0.05, 0.05, 0.05, ['#e0677e', PAL.gold, '#e0677e', PAL.roofBlue][i], -0.18 + i * 0.12, Y0 + 0.045, 0.25, 0.01));
    return p;
  },
  campus: () => {
    const p = [rbox(1.86, 0.07, 1.86, PAL.paving, 0, 0, 0, 0.04), rbox(0.7, 0.012, 0.7, PAL.grass, 0, Y0, 0.15, 0.01)];
    p.push(rbox(0.7, 0.32, 0.4, PAL.cream, -0.45, Y0, -0.55, 0.03), rotY(gable(0.48, 0.16, 0.76, PAL.roofBlue, -0.45, Y0 + 0.32, -0.55), Math.PI / 2));
    for (let i = 0; i < 4; i++) p.push(...windowAt(-0.7 + i * 0.17, Y0 + 0.14, -0.348));
    p.push(cyl(0.22, 0.24, 0.3, PAL.white, 0.5, Y0, -0.5, 24), dome(0.22, PAL.glassLight, 0.5, Y0 + 0.3, -0.5));
    p.push(rbox(0.36, 0.3, 0.5, PAL.white, 0.6, Y0, 0.45, 0.03), rbox(0.38, 0.04, 0.52, PAL.roofBlue, 0.6, Y0 + 0.3, 0.45, 0.012));
    p.push(rbox(0.3, 0.06, 0.06, PAL.ink, -0.55, Y0, 0.55, 0.01), cyl(0.012, 0.012, 0.5, PAL.ink, -0.2, Y0, 0.15, 6), dome(0.06, PAL.white, -0.2, Y0 + 0.5, 0.15));
    for (const [x, z] of [[-0.75, 0.75], [0.15, 0.75], [-0.75, -0.05], [0.25, 0.05]]) p.push(...lollipopTree(x, z, 1.1));
    p.push(bench(-0.1, 0.45), bench(0.15, 0.45), ...lamp(-0.4, 0.2), ...lamp(0.35, 0.2), flag(PAL.roofBlue, -0.75, Y0 + 0.32, -0.4, 0.22));
    return p;
  },
  artsquarter: () => {
    const p = [rbox(1.86, 0.07, 1.86, PAL.paving, 0, 0, 0, 0.04), cyl(0.3, 0.32, 0.03, PAL.creamDark, 0, Y0, 0.2, 28)];
    p.push(rbox(0.8, 0.3, 0.45, '#efe0f5', -0.35, Y0, -0.55, 0.03), dome(0.22, PAL.roofPurple, -0.35, Y0 + 0.3, -0.55));
    for (let i = 0; i < 5; i++) p.push(cyl(0.02, 0.022, 0.3, PAL.white, -0.65 + i * 0.15, Y0, -0.3, 10));
    p.push(rbox(0.4, 0.26, 0.5, '#f5e3a8', 0.6, Y0, -0.45, 0.03), rotY(gable(0.56, 0.14, 0.46, PAL.terracotta, 0.6, Y0 + 0.26, -0.45), Math.PI / 2));
    p.push(rbox(0.12, 0.12, 0.12, PAL.white, 0, Y0 + 0.03, 0.2, 0.015), sph(0.08, PAL.gold, 0, Y0 + 0.22, 0.2));
    p.push(rbox(0.5, 0.2, 0.3, PAL.cream, 0.55, Y0, 0.55, 0.025), ...awning(0.5, [PAL.roofPurple, PAL.white], 0.55, Y0 + 0.17, 0.7));
    for (const [x, z] of [[-0.75, 0.75], [-0.4, 0.75], [-0.75, 0.3]]) p.push(...bush(x, z, 1.4));
    p.push(...lamp(-0.3, 0.2), ...lamp(0.3, 0.2), bench(0, 0.6), flag(PAL.roofPurple, -0.7, Y0 + 0.3, -0.35, 0.2), flag(PAL.gold, 0.0, Y0 + 0.3, -0.35, 0.2));
    return p;
  },
  merchantquarter: () => {
    const p = [rbox(1.86, 0.07, 1.86, PAL.paving, 0, 0, 0, 0.04)];
    const shops = [[-0.5, -0.5, PAL.roofGreen, '#f3d9c4'], [0.45, -0.5, PAL.roofRed, PAL.cream], [-0.5, 0.45, PAL.roofBlue, '#dfe9f2'], [0.45, 0.45, PAL.gold, '#f5e3a8']];
    for (const [x, z, roof, wall] of shops) {
      p.push(...shop({ w: 0.6, h: 0.28 + (x > 0 ? 0.06 : 0), d: 0.5, wall, roof, x, z: z - 0.05 }));
      p.push(...awning(0.6, [roof, PAL.white], x, Y0 + 0.22, z + 0.2), rbox(0.3, 0.14, 0.012, PAL.glassLight, x, Y0 + 0.02, z + 0.205, 0.006));
    }
    p.push(cyl(0.12, 0.14, 0.04, PAL.stoneLight, 0, Y0, 0, 20), cyl(0.03, 0.03, 0.12, PAL.stoneLight, 0, Y0 + 0.04, 0, 10), bob(group(sph(0.05, PAL.water, 0, Y0 + 0.17, 0)), 0.015, 2.5));
    p.push(...lamp(-0.1, 0.0), ...lamp(0.1, 0.0));
    return p;
  },
};

const LUX_PROPS = {
  spices: () => [sph(0.06, '#4f9e55', 0, Y0 - 0.02, 0), sph(0.02, '#e2573a', 0.04, Y0 + 0.03, 0.02), sph(0.02, '#e2573a', -0.03, Y0 + 0.04, -0.01), sph(0.02, '#f08a24', 0.0, Y0 + 0.06, 0.03)],
  marble: () => [rbox(0.1, 0.08, 0.1, '#f1ede6', -0.02, Y0 - 0.06, 0, 0.012), rbox(0.07, 0.06, 0.07, '#e4ded4', 0.07, Y0 - 0.06, 0.05, 0.01), rbox(0.06, 0.05, 0.06, '#f6f3ee', 0.0, Y0 + 0.02, 0.0, 0.01)],
  crystal: () => {
    const g = new THREE.OctahedronGeometry(0.06, 0);
    const a = place(g, '#4cc3d9', 0, Y0 + 0.03, 0, { roughness: 0.2, metalness: 0.1 }); a.scale.y = 1.6;
    const b = place(g, '#8fe3f0', 0.07, Y0, 0.03, { roughness: 0.2, metalness: 0.1 }); b.scale.set(0.7, 1.1, 0.7);
    return [a, b];
  },
  furs: () => [rbox(0.13, 0.025, 0.1, '#a0714f', 0, Y0 - 0.06, 0, 0.012), rbox(0.12, 0.025, 0.09, '#e9e2d6', 0.01, Y0 - 0.035, 0.01, 0.012), rbox(0.11, 0.025, 0.085, '#7a5238', -0.005, Y0 - 0.01, -0.005, 0.012), sph(0.012, '#2b2b33', 0.05, Y0 + 0.006, 0.02)],
  wine: () => {
    const barrel = cyl(0.04, 0.04, 0.09, '#8a5634', -0.03, Y0 - 0.07, 0, 12); barrel.rotation.z = Math.PI / 2; barrel.position.y = Y0 - 0.03;
    return [barrel, torus(0.041, 0.005, PAL.steelDark, -0.06, Y0 - 0.03, 0), torus(0.041, 0.005, PAL.steelDark, 0.0, Y0 - 0.03, 0),
      sph(0.018, '#7b2a6a', 0.06, Y0 - 0.04, 0.03), sph(0.018, '#9b2d5a', 0.08, Y0 - 0.04, 0.0), sph(0.018, '#7b2a6a', 0.07, Y0 - 0.015, 0.015), sph(0.012, '#5fae5a', 0.075, Y0 + 0.005, 0.01)].map((m, k) => { if (k > 0 && k < 3) m.rotation.y = Math.PI / 2; return m; });
  },
  silk: () => {
    const out = [];
    [['#e98fd0', -0.04], ['#5fd3c4', 0.0], ['#ffd166', 0.04]].forEach(([c, x], k) => { const b = cyl(0.022, 0.022, 0.12, c, x, Y0 - 0.07 + k * 0.0, 0.0, 12); b.rotation.x = Math.PI / 2; b.position.y = Y0 - 0.045 + (k === 1 ? 0.035 : 0); out.push(b); });
    return out;
  },
  pearls: () => {
    const bottom = sph(0.06, '#e8d9c8', 0, Y0 - 0.05, 0, 0.35); const top = sph(0.06, '#d9c6b2', 0, Y0 - 0.02, -0.04, 0.3); top.rotation.x = -0.9;
    return [bottom, top, sph(0.022, '#fbf7f2', 0, Y0 - 0.025, 0.005)];
  },
  salt: () => [cone(0.05, 0.07, '#f4f7f8', -0.03, Y0 - 0.07, 0, 10), cone(0.04, 0.055, '#e6ecef', 0.045, Y0 - 0.07, 0.03, 10), cone(0.03, 0.04, '#ffffff', 0.03, Y0 - 0.07, -0.04, 8)],
  incense: () => [cyl(0.04, 0.025, 0.04, '#c99a3b', 0, Y0 - 0.07, 0, 12), cyl(0.045, 0.045, 0.008, '#e0b552', 0, Y0 - 0.03, 0, 12), sph(0.012, '#b8642a', -0.01, Y0 - 0.02, 0.01), sph(0.01, '#d98a3b', 0.015, Y0 - 0.02, -0.005), smoke(0, Y0 - 0.01, 0, 0.6)],
};

// Marqueur posé sur une case de ressource rare encore inexploitée.
export function luxuryModel(lux) {
  const g = bake(group((LUX_PROPS[lux] || LUX_PROPS.marble)()));
  g.scale.setScalar(1.6);
  return g;
}

BUILDERS.markethall = () => {
  const p = [plinth(PAL.paving)];
  for (const [x, z] of [[-0.3, -0.22], [0.3, -0.22], [-0.3, 0.18], [0.3, 0.18]]) p.push(cyl(0.022, 0.026, 0.22, PAL.white, x, Y0, z, 10));
  const roof = place(cached('hallroof', () => new THREE.CylinderGeometry(0.26, 0.26, 0.72, 20, 1, false, 0, Math.PI)), PAL.roofGreen, 0, Y0 + 0.22, -0.02);
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.scale.set(1, 1, 0.75);
  p.push(roof, rbox(0.74, 0.03, 0.46, PAL.white, 0, Y0 + 0.21, -0.02, 0.01));
  for (const [x, c] of [[-0.18, '#e0677e'], [0.02, PAL.gold], [0.2, PAL.roofBlue]]) p.push(rbox(0.14, 0.07, 0.12, PAL.wood, x, Y0, -0.02, 0.012), sph(0.025, c, x - 0.03, Y0 + 0.09, -0.02), sph(0.025, c, x + 0.03, Y0 + 0.09, 0.0));
  p.push(crate(-0.3, 0.33, PAL.wood, 0.07), crate(-0.22, 0.33, '#d29a5b', 0.07), crate(0.32, 0.33, PAL.steelDark, 0.06));
  p.push(flag(PAL.roofGreen, 0.34, Y0, -0.3, 0.32));
  p.push(rbox(0.18, 0.08, 0.02, PAL.gold, 0, Y0 + 0.3, 0.215, 0.01), cyl(0.025, 0.025, 0.012, '#fff3c4', 0, Y0 + 0.3, 0.228, 16));
  p[p.length - 1].rotation.x = Math.PI / 2; p[p.length - 1].position.y = Y0 + 0.34;
  return p;
};

BUILDERS.outpost = (lux = 'spices') => {
  const p = [plinth('#e9dcc5')];
  p.push(rbox(0.26, 0.16, 0.2, PAL.wood, -0.15, Y0, -0.15, 0.02), rotY(gable(0.32, 0.1, 0.24, PAL.roofGreen, -0.15, Y0 + 0.16, -0.15), 0), door(-0.15, Y0, -0.048));
  p.push(crate(0.12, 0.12, PAL.wood, 0.08), crate(0.22, 0.12, PAL.wood, 0.08), crate(0.17, 0.22, PAL.wood, 0.08));
  const props = (LUX_PROPS[lux] || LUX_PROPS.spices)();
  const holder = group(props); holder.position.set(0.18, 0.04, -0.2); holder.scale.setScalar(1.4);
  p.push(holder, cyl(0.006, 0.006, 0.28, PAL.ink, 0.32, Y0, 0.3, 6), rbox(0.09, 0.05, 0.008, { spices: '#e2573a', marble: '#cfc8bd', crystal: '#4cc3d9', furs: '#a0714f', wine: '#9b2d5a', silk: '#e98fd0', pearls: '#f3eadf', salt: '#dfe6ea', incense: '#c99a3b' }[lux] || PAL.gold, 0.365, Y0 + 0.22, 0.3, 0.004));
  return p;
};

// Bâtiments propres à chaque profil : silhouettes reconnaissables, accent doré.
BUILDERS.guildhall = () => { // Négociant : halle à colombages, enseigne, tonneaux
  const p = [plinth(PAL.paving)];
  p.push(rbox(0.5, 0.2, 0.34, '#f3d9c4', 0, Y0, -0.08, 0.02), rbox(0.54, 0.03, 0.38, PAL.woodDark, 0, Y0 + 0.2, -0.08, 0.01));
  for (const x of [-0.24, -0.08, 0.08, 0.24]) p.push(rbox(0.02, 0.2, 0.012, PAL.woodDark, x, Y0, 0.092, 0.004));
  p.push(rbox(0.5, 0.16, 0.3, '#f6ead6', 0, Y0 + 0.23, -0.08, 0.02), rotY(gable(0.56, 0.16, 0.36, PAL.terracotta, 0, Y0 + 0.39, -0.08), 0));
  p.push(door(0, Y0, 0.093, PAL.woodDark), ...windowAt(-0.16, Y0 + 0.08, 0.092), ...windowAt(0.16, Y0 + 0.08, 0.092), ...windowAt(-0.12, Y0 + 0.28, 0.072), ...windowAt(0.12, Y0 + 0.28, 0.072));
  p.push(cyl(0.008, 0.008, 0.08, PAL.ink, 0.28, Y0 + 0.28, 0.12, 6), rbox(0.1, 0.08, 0.012, PAL.gold, 0.28, Y0 + 0.2, 0.15, 0.006));
  for (const [x, z] of [[-0.3, 0.26], [-0.2, 0.3], [0.32, 0.3]]) p.push(cyl(0.04, 0.04, 0.08, PAL.wood, x, Y0, z, 12), torus(0.04, 0.006, PAL.steelDark, x, Y0 + 0.02, z), torus(0.04, 0.006, PAL.steelDark, x, Y0 + 0.06, z));
  p.push(flag(PAL.gold, -0.3, Y0 + 0.36, -0.22, 0.2));
  return p;
};
BUILDERS.academy = () => { // Érudit : rotonde à colonnes et coupole bleue, télescope
  const p = [plinth(PAL.paving)];
  p.push(cyl(0.26, 0.28, 0.05, PAL.creamDark, 0, Y0, -0.04, 24), cyl(0.2, 0.2, 0.2, PAL.cream, 0, Y0 + 0.05, -0.04, 24));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.push(cyl(0.016, 0.018, 0.2, PAL.white, Math.cos(a) * 0.235, Y0 + 0.05, -0.04 + Math.sin(a) * 0.235, 10)); }
  p.push(cyl(0.255, 0.255, 0.03, PAL.white, 0, Y0 + 0.25, -0.04, 24), dome(0.19, PAL.roofBlue, 0, Y0 + 0.28, -0.04), sph(0.025, PAL.gold, 0, Y0 + 0.47, -0.04));
  const scope = cyl(0.018, 0.026, 0.16, PAL.steelDark, 0, -0.06, 0, 10); scope.rotation.z = 0.7; const scopeG = group(scope); scopeG.position.set(0.3, Y0 + 0.12, 0.26); p.push(cyl(0.006, 0.006, 0.12, PAL.ink, 0.3, Y0, 0.26, 6), spin(scopeG, 'y', 0.4));
  p.push(...lamp(-0.3, 0.28), bench(-0.12, 0.33), ...bush(0.33, -0.3));
  return p;
};
BUILDERS.chancery = () => { // Diplomate : palais blanc, perron, rangée de drapeaux
  const p = [plinth(PAL.paving)];
  p.push(rbox(0.56, 0.05, 0.38, PAL.white, 0, Y0, -0.08, 0.02), rbox(0.5, 0.22, 0.3, '#eef3f8', 0, Y0 + 0.05, -0.1, 0.02), rbox(0.54, 0.035, 0.34, PAL.white, 0, Y0 + 0.27, -0.1, 0.01));
  p.push(rbox(0.2, 0.08, 0.2, '#eef3f8', 0, Y0 + 0.3, -0.1, 0.02), dome(0.08, '#14b8a6', 0, Y0 + 0.38, -0.1));
  for (const x of [-0.18, -0.06, 0.06, 0.18]) p.push(...windowAt(x, Y0 + 0.13, 0.052));
  p.push(door(0, Y0 + 0.05, 0.053, '#14b8a6'), rbox(0.2, 0.025, 0.06, PAL.white, 0, Y0, 0.12, 0.008), rbox(0.16, 0.025, 0.04, PAL.white, 0, Y0 + 0.025, 0.11, 0.008));
  ['#ff6b4a', '#8b5cf6', '#f5b700', '#14b8a6', '#2f6fde'].forEach((c, k) => p.push(flag(c, -0.28 + k * 0.14, Y0, 0.3, 0.24)));
  return p;
};
BUILDERS.lodge = () => { // Explorateur : chalet en rondins, tour de guet, globe et longue-vue
  const p = [plinth('#d9e8c4')];
  p.push(rbox(0.36, 0.18, 0.28, PAL.wood, -0.1, Y0, -0.12, 0.02), rotY(gable(0.42, 0.14, 0.34, PAL.roofGreen, -0.1, Y0 + 0.18, -0.12), 0));
  for (let k = 0; k < 4; k++) p.push(rbox(0.37, 0.012, 0.012, PAL.woodDark, -0.1, Y0 + 0.03 + k * 0.045, 0.022, 0.004));
  p.push(door(-0.1, Y0, 0.024, PAL.woodDark));
  for (const [x, z] of [[0.18, -0.08], [0.32, -0.08], [0.18, -0.24], [0.32, -0.24]]) p.push(rbox(0.018, 0.36, 0.018, PAL.woodDark, x, Y0, z, 0.004));
  p.push(rbox(0.2, 0.02, 0.2, PAL.wood, 0.25, Y0 + 0.36, -0.16, 0.008), cone(0.15, 0.12, PAL.roofRed, 0.25, Y0 + 0.38, -0.16, 4));
  const globe = group(sph(0.055, '#6fb3e0', 0, 0, 0), sph(0.03, PAL.leaf, 0.03, 0.02, 0.03), sph(0.025, PAL.leaf, -0.035, -0.01, -0.02)); globe.position.set(0.2, Y0 + 0.13, 0.24);
  p.push(cyl(0.012, 0.016, 0.08, PAL.woodDark, 0.2, Y0, 0.24, 8), spin(globe, 'y', 0.8), torus(0.06, 0.005, PAL.gold, 0.2, Y0 + 0.13, 0.24));
  p.push(...lollipopTree(-0.32, 0.26, 0.8), ...lollipopTree(0.36, 0.3, 0.6));
  return p;
};

BUILDERS.watermill = () => { // Moulin à eau : maison de pierre, roue à aubes qui tourne, bief d'eau
  const p = [plinth('#cfe6c0')];
  p.push(rbox(0.3, 0.2, 0.26, PAL.stoneLight, -0.08, Y0, -0.06, 0.025), rotY(gable(0.36, 0.13, 0.3, PAL.terracotta, -0.08, Y0 + 0.2, -0.06), 0));
  p.push(door(-0.08, Y0, 0.072, PAL.woodDark), ...windowAt(-0.17, Y0 + 0.12, 0.072));
  p.push(rbox(0.16, 0.025, 0.86, '#7cc4e8', 0.22, Y0 - 0.012, 0, 0.01));
  const wheel = new THREE.Group();
  wheel.add(cyl(0.12, 0.12, 0.03, PAL.wood, 0, -0.015, 0, 16));
  for (let k = 0; k < 8; k++) { const b = rbox(0.03, 0.05, 0.05, PAL.woodDark, 0, 0, 0, 0.006); b.position.set(Math.cos(k * Math.PI / 4) * 0.12, 0, Math.sin(k * Math.PI / 4) * 0.12); b.rotation.y = -k * Math.PI / 4; wheel.add(b); }
  wheel.rotation.z = Math.PI / 2;
  const holder = new THREE.Group(); holder.add(wheel); holder.position.set(0.12, Y0 + 0.13, 0.02);
  p.push(spin(holder, 'x', 1.2), rbox(0.04, 0.02, 0.02, PAL.woodDark, 0.09, Y0 + 0.13, 0.02, 0.005));
  p.push(crate(-0.28, 0.28, '#f1c95a', 0.06), crate(-0.2, 0.3, '#f1c95a', 0.06), ...bush(-0.3, -0.3));
  return p;
};

BUILDERS.park = () => { // Parc : pelouse, arbres, bassin et bancs
  const p = [plinth(PAL.grass)];
  const pond = new THREE.Mesh(cached('parkpond', () => new THREE.CylinderGeometry(0.16, 0.17, 0.02, 20)), mat(PAL.water, { roughness: 0.2 })); pond.position.set(0.1, Y0 + 0.01, 0.08); p.push(pond);
  p.push(...lollipopTree(-0.25, -0.25, 1.1), ...lollipopTree(0.25, -0.28, 0.9), ...lollipopTree(-0.3, 0.2, 0.8), bench(-0.08, -0.12), bench(0.2, 0.32, Math.PI));
  const duck = group(sph(0.02, PAL.white, 0, 0, 0, 0.8), sph(0.012, PAL.white, 0.016, 0.016, 0), cone(0.006, 0.012, PAL.gold, 0.03, 0.012, 0, 6)); duck.children[2].rotation.z = -Math.PI / 2; duck.position.set(0.1, Y0 + 0.03, 0.08); p.push(bob(duck, 0.006, 2));
  p.push(...bush(0.32, -0.05), ...bush(-0.05, 0.32, 0.8), ...lamp(-0.1, 0.12), sph(0.02, '#ff8fab', 0.05, Y0 + 0.02, -0.3), sph(0.02, '#ffd23f', 0.0, Y0 + 0.02, -0.28));
  return p;
};
BUILDERS.aqueduct = () => { // Aqueduc : arches de pierre et canal d'eau
  const p = [plinth(PAL.stoneLight)];
  for (const x of [-0.3, -0.1, 0.1, 0.3]) p.push(rbox(0.07, 0.3, 0.1, PAL.cream, x, Y0, 0, 0.012));
  p.push(rbox(0.8, 0.06, 0.12, PAL.creamDark, 0, Y0 + 0.3, 0, 0.012), rbox(0.78, 0.02, 0.06, '#7cc4e8', 0, Y0 + 0.36, 0, 0.008));
  for (const x of [-0.2, 0, 0.2]) { const arch = new THREE.Mesh(cached('arch', () => new THREE.TorusGeometry(0.065, 0.018, 6, 12, Math.PI)), mat(PAL.cream)); arch.position.set(x, Y0 + 0.24, 0); p.push(arch); }
  p.push(cyl(0.06, 0.07, 0.06, PAL.stone, 0.32, Y0, 0.28, 14), cyl(0.05, 0.05, 0.01, '#7cc4e8', 0.32, Y0 + 0.06, 0.28, 14), ...bush(-0.3, 0.3), flag(PAL.roofBlue, -0.38, Y0 + 0.36, 0, 0.14));
  return p;
};

// ------------------------------------------------- troisième passage : bâtiments retravaillés
// Le style suit l'époque : rustique pour les premiers bâtiments (bois, pierre, tuiles), plus moderne
// pour les bâtiments avancés (hôpital, port). Chaque bâtiment a une petite animation, jouée de près.
const strata = (w, d, x, y, z, c) => rbox(w, 0.008, d, c, x, y, z, 0.003);
function barrel(x, z, s = 1) { return [cyl(0.035 * s, 0.035 * s, 0.08 * s, PAL.wood, x, Y0, z, 12), torus(0.036 * s, 0.005, PAL.steelDark, x, Y0 + 0.02 * s, z), torus(0.036 * s, 0.005, PAL.steelDark, x, Y0 + 0.06 * s, z)]; }
function wheelGeo(r, spokes, c, hub = PAL.woodDark) {
  const g = new THREE.Group();
  g.add(torus(r, r * 0.14, c, 0, 0, 0));
  for (let k = 0; k < spokes; k++) { const s = rbox(0.008, r * 2, 0.008, hub, 0, -r, 0, 0.003); const arm = new THREE.Group(); arm.add(s); arm.rotation.y = 0; arm.rotation.x = Math.PI / 2; arm.rotation.z = (k / spokes) * Math.PI; g.add(arm); }
  g.add(sph(r * 0.18, hub, 0, 0, 0));
  return g; // roue couchée dans le plan xz : la faire pivoter pour la dresser
}

BUILDERS.quarry = () => { // Carrière : front de taille en gradins, derrick en bois et wagonnet
  const p = [plinth('#d9d1c6')];
  // Colline entaillée en gradins, au fond
  p.push(rbox(0.86, 0.3, 0.2, '#ada190', 0, Y0, -0.33, 0.015), rbox(0.88, 0.04, 0.22, PAL.grassDark, 0, Y0 + 0.3, -0.33, 0.018));
  p.push(rbox(0.7, 0.2, 0.14, '#cbbfae', -0.08, Y0, -0.17, 0.012), rbox(0.46, 0.1, 0.12, '#e2d9cc', -0.2, Y0, -0.05, 0.01));
  for (const [y, z, w, x] of [[0.08, -0.229, 0.84, 0], [0.17, -0.229, 0.84, 0], [0.24, -0.229, 0.84, 0], [0.06, -0.099, 0.68, -0.08], [0.13, -0.099, 0.68, -0.08], [0.05, 0.011, 0.44, -0.2]]) p.push(strata(w, 0.006, x, Y0 + y, z, '#968a7b'));
  for (const [x, z, s] of [[0.33, -0.12, 0.035], [0.37, -0.06, 0.025], [0.04, -0.02, 0.03], [-0.42, 0.04, 0.025]]) p.push(sph(s, '#b8ad9e', x, Y0 + s * 0.6, z, 0.7));
  p.push(...bush(-0.3, -0.33, 1.1).map((m) => { m.position.y += 0.3; return m; }), ...bush(0.24, -0.36, 0.9).map((m) => { m.position.y += 0.3; return m; }));
  // Blocs taillés sur palette
  p.push(rbox(0.2, 0.02, 0.14, PAL.wood, 0.24, Y0, 0.2, 0.006));
  for (const [x, z, y] of [[0.19, 0.17, 0], [0.29, 0.17, 0], [0.19, 0.24, 0], [0.29, 0.24, 0], [0.24, 0.2, 1]]) p.push(rbox(0.085, 0.07, 0.065, y ? '#f1ece4' : '#e4ddd2', x, Y0 + 0.02 + y * 0.07, z, 0.012));
  // Rails et wagonnet chargé
  for (const z of [0.3, 0.36]) p.push(rbox(0.56, 0.008, 0.01, PAL.steelDark, -0.12, Y0, z, 0.003));
  for (let k = 0; k < 6; k++) p.push(rbox(0.016, 0.006, 0.09, PAL.woodDark, -0.36 + k * 0.095, Y0, 0.33, 0.002));
  p.push(rbox(0.12, 0.07, 0.09, PAL.steelDark, -0.2, Y0 + 0.025, 0.33, 0.014), sph(0.028, '#cfc7bd', -0.22, Y0 + 0.1, 0.33), sph(0.024, '#bdb4a8', -0.18, Y0 + 0.1, 0.32));
  for (const x of [-0.24, -0.16]) for (const z of [0.29, 0.37]) { const w = cyl(0.016, 0.016, 0.012, PAL.ink, x, 0, z, 10); w.rotation.x = Math.PI / 2; w.position.y = Y0 + 0.018; p.push(w); }
  // Derrick : mât, flèche, câble et bloc qui monte et descend
  p.push(rbox(0.03, 0.42, 0.03, PAL.wood, 0.32, Y0, -0.02, 0.008), rbox(0.36, 0.025, 0.025, PAL.wood, 0.17, Y0 + 0.4, -0.02, 0.008));
  const brace = rbox(0.018, 0.2, 0.018, PAL.woodDark, 0.25, Y0 + 0.25, -0.02, 0.005); brace.rotation.z = 0.8; p.push(brace);
  const load = group(cyl(0.003, 0.003, 0.14, PAL.ink, 0, -0.14, 0, 4), rbox(0.07, 0.05, 0.05, '#ece6dd', 0, -0.19, 0, 0.01));
  load.position.set(0.02, Y0 + 0.4, -0.02); p.push(bob(load, 0.04, 0.9));
  p.push(rbox(0.012, 0.1, 0.012, PAL.woodDark, 0.36, Y0, 0.1, 0.003), rbox(0.05, 0.012, 0.012, PAL.steel, 0.36, Y0 + 0.1, 0.1, 0.003));
  return p;
};

BUILDERS.forge = () => { // Forge : bâtisse de pierre, appentis ouvert, foyer rougeoyant, enclume
  const p = [plinth('#d8cfc4')];
  p.push(rbox(0.34, 0.22, 0.28, PAL.stone, -0.14, Y0, -0.12, 0.03), rotY(gable(0.4, 0.13, 0.32, '#6f7682', -0.14, Y0 + 0.22, -0.12), 0));
  for (const [x, y] of [[-0.3, 0.02], [-0.3, 0.1], [-0.3, 0.18], [0.02, 0.06], [0.02, 0.14]]) p.push(rbox(0.04, 0.05, 0.03, PAL.stoneLight, x, Y0 + y, 0.02, 0.008));
  p.push(door(-0.18, Y0, 0.022, PAL.woodDark), rbox(0.07, 0.06, 0.012, '#ff9a3c', -0.06, Y0 + 0.1, 0.022, 0.006));
  // Cheminée de briques et fumée
  p.push(rbox(0.09, 0.44, 0.09, PAL.brick, 0.0, Y0, -0.24, 0.015), rbox(0.11, 0.025, 0.11, '#b85b40', 0.0, Y0 + 0.44, -0.24, 0.008), smoke(0.0, Y0 + 0.5, -0.24, 1.4));
  // Appentis : poteaux et toit en pente
  for (const [x, z] of [[0.34, -0.3], [0.34, -0.12]]) p.push(rbox(0.022, 0.2, 0.022, PAL.wood, x, Y0, z, 0.006));
  const lean = rbox(0.26, 0.018, 0.24, '#8c5a3c', 0.22, Y0 + 0.21, -0.22, 0.008); lean.rotation.z = -0.2; p.push(lean);
  // Foyer en avant de l'appentis : bac de pierre et braises qui rougeoient
  p.push(rbox(0.15, 0.08, 0.13, PAL.stoneLight, 0.2, Y0, -0.04, 0.015), rbox(0.12, 0.012, 0.1, '#5a4a42', 0.2, Y0 + 0.07, -0.04, 0.004));
  const ember = new THREE.Mesh(cached('ember', () => new THREE.SphereGeometry(0.05, 12, 8)), emberMat); ember.scale.set(1.1, 0.4, 0.9);
  const coals = group(ember); coals.position.set(0.2, Y0 + 0.085, -0.04); p.push(pulse(coals, 0.14, 3.2));
  // Enclume, marteau, tonneau d'eau, charbon et fers à cheval
  p.push(rbox(0.05, 0.06, 0.05, PAL.woodDark, 0.2, Y0, 0.16, 0.01), rbox(0.11, 0.035, 0.05, PAL.ink, 0.2, Y0 + 0.06, 0.16, 0.01));
  const horn = cone(0.02, 0.05, PAL.ink, 0.28, Y0 + 0.067, 0.16, 8); horn.rotation.z = -Math.PI / 2; p.push(horn);
  const ham = group(rbox(0.012, 0.012, 0.08, PAL.woodDark, 0, 0, 0, 0.003), rbox(0.03, 0.025, 0.025, PAL.steelDark, 0, -0.005, 0.04, 0.005)); ham.position.set(0.17, Y0 + 0.1, 0.17); ham.rotation.y = 0.6; p.push(ham);
  p.push(...barrel(0.34, 0.3), sph(0.03, '#2f2f36', -0.3, Y0 + 0.01, 0.3, 0.6), sph(0.025, '#3a3a42', -0.26, Y0 + 0.01, 0.33, 0.6), sph(0.022, '#2f2f36', -0.33, Y0 + 0.01, 0.34, 0.6));
  for (const x of [-0.27, -0.21]) { const h = new THREE.Mesh(cached('shoe', () => new THREE.TorusGeometry(0.018, 0.005, 6, 12, Math.PI * 1.4)), mat(PAL.steelDark)); h.position.set(x, Y0 + 0.16, 0.024); h.rotation.z = Math.PI * 0.8; p.push(h); }
  return p;
};

// Comptoir : chaque ressource rare a sa boutique ; souk pour les épices, diamantaire pour le cristal.
const souk = () => {
  const p = [plinth('#f0dcb5')];
  // Bâtisse en terre crue, toit-terrasse crénelé et petite coupole
  p.push(rbox(0.6, 0.24, 0.24, '#e2b77e', 0, Y0, -0.28, 0.025));
  for (let k = 0; k < 7; k++) p.push(rbox(0.05, 0.035, 0.05, '#d8a96c', -0.27 + k * 0.09, Y0 + 0.24, -0.18, 0.01));
  p.push(cyl(0.07, 0.075, 0.05, '#efe3cc', 0.18, Y0 + 0.24, -0.3, 16), dome(0.07, '#3fa7a0', 0.18, Y0 + 0.29, -0.3), sph(0.012, PAL.gold, 0.18, Y0 + 0.36, -0.3));
  p.push(rbox(0.09, 0.12, 0.014, '#7a4a2e', -0.14, Y0, -0.158, 0.008), cyl(0.045, 0.045, 0.014, '#7a4a2e', -0.14, Y0 + 0.12, -0.158, 16));
  p[p.length - 1].rotation.x = Math.PI / 2; p[p.length - 1].position.y = Y0 + 0.12;
  for (const x of [0.04, 0.26]) p.push(rbox(0.07, 0.07, 0.012, '#9c6a3c', x, Y0 + 0.11, -0.158, 0.008), rbox(0.05, 0.05, 0.014, '#5b3a22', x, Y0 + 0.12, -0.155, 0.006));
  // Trois étals à auvent rayé, chargés de cônes d'épices
  const SP = ['#d9452b', '#f08a24', '#f2c230', '#9c5a2e', '#7a9a3a', '#c2185b'];
  [[-0.24, ['#e2573a', PAL.white]], [0.0, ['#f2b632', PAL.white]], [0.24, ['#3fa7a0', PAL.white]]].forEach(([x, cols], s) => {
    p.push(rbox(0.2, 0.06, 0.12, PAL.wood, x, Y0, 0.04, 0.01));
    for (const dx of [-0.09, 0.09]) for (const dz of [-0.05, 0.05]) p.push(rbox(0.012, 0.2, 0.012, PAL.woodDark, x + dx, Y0, 0.04 + dz, 0.003));
    for (let k = 0; k < 4; k++) { const st = rbox(0.05, 0.012, 0.15, cols[k % 2], x - 0.075 + k * 0.05, Y0 + 0.2, 0.05, 0.004); st.rotation.x = 0.25; p.push(st); }
    for (let k = 0; k < 3; k++) { const c = SP[(s * 2 + k) % SP.length]; p.push(cyl(0.028, 0.024, 0.02, '#c89a62', x - 0.06 + k * 0.06, Y0 + 0.06, 0.04, 12), cone(0.026, 0.045, c, x - 0.06 + k * 0.06, Y0 + 0.078, 0.04, 12)); }
  });
  // Tapis, sacs ouverts et lanternes
  p.push(rbox(0.3, 0.008, 0.16, '#b23a48', 0.0, Y0, 0.3, 0.004), rbox(0.26, 0.009, 0.12, '#e3a33b', 0.0, Y0, 0.3, 0.004), rbox(0.2, 0.01, 0.07, '#b23a48', 0.0, Y0, 0.3, 0.004));
  for (const [x, c] of [[-0.3, '#f08a24'], [0.3, '#d9452b']]) p.push(cyl(0.035, 0.04, 0.07, '#d9c3a0', x, Y0, 0.3, 12), sph(0.033, c, x, Y0 + 0.07, 0.3, 0.5));
  p.push(flag('#3fa7a0', 0.28, Y0 + 0.24, -0.36, 0.2));
  return p;
};
const diamantaire = () => {
  const p = [plinth('#d6d0c8')];
  for (let k = 0; k < 5; k++) p.push(rbox(0.86, 0.004, 0.012, '#c4bdb3', 0, Y0, -0.36 + k * 0.18, 0.002));
  // Maison étroite en brique, pignon à gradins façon Flandres
  const W = 0.32, D = 0.3, H = 0.4, z0 = -0.1, front = z0 + D / 2;
  p.push(rbox(W, H, D, '#a9553f', 0, Y0, z0, 0.02), gable(W, 0.2, D, '#4f5563', 0, Y0 + H, z0));
  [[W, 0.06], [W * 0.74, 0.06], [W * 0.5, 0.06], [W * 0.26, 0.06]].forEach(([w, h], k) => p.push(rbox(w, h, 0.03, '#a9553f', 0, Y0 + H + k * 0.055, front - 0.012, 0.008), rbox(w + 0.012, 0.012, 0.036, PAL.white, 0, Y0 + H + k * 0.055 + h - 0.008, front - 0.012, 0.004)));
  for (const y of [0.16, 0.29]) p.push(rbox(W + 0.008, 0.014, 0.012, PAL.white, 0, Y0 + y, front + 0.002, 0.004));
  for (const x of [-0.08, 0.08]) for (const y of [0.19, 0.31]) p.push(...windowAt(x, Y0 + y, front + 0.004, 'z', 0.06, 0.07));
  // Devanture vert sombre, grande vitrine, enseigne dorée et pierres exposées
  p.push(rbox(W + 0.02, 0.15, 0.02, '#1f4b3f', 0, Y0, front + 0.006, 0.008), rbox(0.2, 0.09, 0.014, PAL.glassLight, -0.04, Y0 + 0.025, front + 0.014, 0.006), rbox(0.05, 0.11, 0.014, '#2a2420', 0.115, Y0, front + 0.014, 0.006));
  p.push(rbox(W - 0.02, 0.03, 0.014, PAL.gold, 0, Y0 + 0.125, front + 0.018, 0.005), rbox(0.18, 0.02, 0.04, '#5b2a4a', -0.04, Y0 + 0.02, front + 0.03, 0.006));
  const gem = (x, s, c) => { const g = place(cached('gem', () => new THREE.OctahedronGeometry(0.02, 0)), c, x, Y0 + 0.062, front + 0.03, { roughness: 0.15, metalness: 0.1 }); g.scale.set(s, s * 1.4, s); return g; };
  p.push(gem(-0.1, 0.8, '#9fe6f5'), gem(-0.05, 1.1, '#9fe6f5'), gem(0.0, 0.8, '#9fe6f5'), gem(0.03, 0.7, '#9fe6f5'));
  // Enseigne en potence : un gros cristal qui se balance
  p.push(rbox(0.1, 0.01, 0.01, PAL.ink, 0.21, Y0 + 0.24, front - 0.01, 0.003));
  const sign0 = place(cached('bigGem', () => new THREE.OctahedronGeometry(0.035, 0)), '#4cc3d9', 0, -0.07, 0, { roughness: 0.15, metalness: 0.1 }); sign0.scale.y = 1.4;
  const hanger = group(cyl(0.002, 0.002, 0.03, PAL.ink, 0, -0.03, 0, 4), sign0); hanger.position.set(0.25, Y0 + 0.24, front - 0.01); p.push(swing(hanger, 0.18, 1.3));
  // Bornes et réverbère
  for (const x of [-0.3, -0.18, 0.3]) p.push(cyl(0.014, 0.016, 0.06, PAL.ink, x, Y0, 0.32, 8), sph(0.016, PAL.ink, x, Y0 + 0.06, 0.32));
  p.push(...lamp(0.36, 0.1), ...pot(-0.34, 0.08));
  return p;
};
const OUTPOST_GENERIC = BUILDERS.outpost;
BUILDERS.outpost = (lux = 'spices') => (lux === 'spices' ? souk() : lux === 'crystal' ? diamantaire() : [...OUTPOST_GENERIC(lux), flag(PAL.gold, -0.32, Y0, 0.3, 0.24)]);

BUILDERS.amphitheatre = () => { // Amphithéâtre : arène ovale à deux rangs d'arcades, gradins, oriflammes
  const p = [plinth(PAL.paving, 0.94, 0.94)];
  const prof = [[0.42, 0], [0.42, 0.32], [0.37, 0.32], [0.37, 0.27], [0.32, 0.27], [0.32, 0.22], [0.27, 0.22], [0.27, 0.17], [0.22, 0.17], [0.22, 0.11], [0.0, 0.11]].map(([r, y]) => new THREE.Vector2(r, y));
  const bowl = place(cached('amphBowl', () => new THREE.LatheGeometry(prof, 32)), '#efe3cf', 0, Y0, 0); bowl.scale.set(1, 1, 0.82); p.push(bowl);
  for (const [r, y] of [[0.37, 0.27], [0.32, 0.22], [0.27, 0.17], [0.22, 0.11]]) { const ring = torus(r, 0.007, PAL.roofPurple, 0, Y0 + y + 0.004, 0); ring.scale.set(1, 0.82, 1); p.push(ring); }
  const sand = cyl(0.21, 0.21, 0.012, '#ecd9a8', 0, Y0 + 0.11, 0, 28); sand.scale.z = 0.82; p.push(sand);
  // Arcades : deux rangées de baies sombres tout autour
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2, x = Math.cos(a) * 0.425, z = Math.sin(a) * 0.425 * 0.82;
    for (const y of [0.05, 0.19]) { const bay = rbox(0.045, 0.08, 0.014, '#9b7d66', x, Y0 + y, z, 0.012); bay.rotation.y = -a + Math.PI / 2; p.push(bay); }
  }
  for (const y of [0.15, 0.3]) { const band = torus(0.424, 0.008, '#f6eddd', 0, Y0 + y, 0); band.scale.set(1, 0.82, 1); p.push(band); }
  // Scène et entrée d'honneur
  p.push(rbox(0.16, 0.04, 0.06, PAL.cream, 0, Y0 + 0.11, -0.12, 0.01), rbox(0.12, 0.16, 0.05, '#f6eddd', 0, Y0, 0.35, 0.012), rbox(0.06, 0.1, 0.054, '#7d6250', 0, Y0, 0.35, 0.012), rbox(0.1, 0.03, 0.056, PAL.roofPurple, 0, Y0 + 0.12, 0.35, 0.006));
  // Oriflammes animées sur le pourtour
  for (let k = 0; k < 4; k++) { const a = Math.PI * 0.25 + k * Math.PI / 2; p.push(flag(k % 2 ? PAL.gold : PAL.roofPurple, Math.cos(a) * 0.4, Y0 + 0.32, Math.sin(a) * 0.4 * 0.82, 0.16)); }
  return p;
};

BUILDERS.workshop = () => { // Atelier des maîtres (Bâtisseur) : halle à colombages, grue à roue, plans et matériaux
  const p = [plinth(PAL.stoneLight)];
  p.push(rbox(0.44, 0.08, 0.3, PAL.stone, -0.06, Y0, -0.14, 0.02), rbox(0.44, 0.17, 0.3, '#f3e2c6', -0.06, Y0 + 0.08, -0.14, 0.02));
  for (const x of [-0.26, -0.13, 0.01, 0.14]) p.push(rbox(0.016, 0.17, 0.008, PAL.woodDark, x, Y0 + 0.08, 0.012, 0.003));
  p.push(rbox(0.44, 0.014, 0.008, PAL.woodDark, -0.06, Y0 + 0.16, 0.012, 0.003), rotY(gable(0.5, 0.17, 0.34, PAL.roofBlue, -0.06, Y0 + 0.25, -0.14), 0));
  p.push(rbox(0.14, 0.15, 0.012, '#4a3426', -0.06, Y0, 0.014, 0.008), rbox(0.16, 0.02, 0.016, PAL.gold, -0.06, Y0 + 0.15, 0.016, 0.005));
  p.push(rbox(0.05, 0.28, 0.05, PAL.brick, -0.22, Y0 + 0.22, -0.22, 0.01), smoke(-0.22, Y0 + 0.52, -0.22, 0.9), flag(PAL.gold, 0.14, Y0 + 0.3, -0.14, 0.18));
  // Grue à roue de carrier : la roue tourne, la charge se balance
  for (const dz of [-0.06, 0.06]) { const leg = rbox(0.022, 0.4, 0.022, PAL.wood, 0.3, Y0, 0.12 + dz, 0.006); leg.rotation.x = dz * 2; p.push(leg); }
  p.push(rbox(0.3, 0.025, 0.025, PAL.wood, 0.22, Y0 + 0.38, 0.12, 0.006));
  const tw = wheelGeo(0.1, 6, PAL.wood); tw.rotation.x = Math.PI / 2; const treadwheel = group(tw); treadwheel.position.set(0.3, Y0 + 0.12, 0.2); p.push(spin(treadwheel, 'z', 0.9));
  const hook = group(cyl(0.003, 0.003, 0.16, PAL.ink, 0, -0.16, 0, 4), rbox(0.08, 0.04, 0.05, PAL.stoneLight, 0, -0.2, 0, 0.01)); hook.position.set(0.09, Y0 + 0.38, 0.12); p.push(swing(hook, 0.12, 1.1));
  // Blocs taillés, poutres, table à dessin avec plan bleu
  for (const [x, z, y] of [[-0.32, 0.22, 0], [-0.24, 0.22, 0], [-0.28, 0.3, 0], [-0.28, 0.25, 1]]) p.push(rbox(0.075, 0.06, 0.06, '#e4ddd2', x, Y0 + y * 0.06, z, 0.01));
  for (let k = 0; k < 3; k++) p.push(rbox(0.28, 0.025, 0.025, k % 2 ? PAL.wood : '#c89462', -0.05, Y0 + k * 0.025, 0.34, 0.006));
  p.push(rbox(0.12, 0.012, 0.09, PAL.wood, -0.1, Y0 + 0.09, 0.18, 0.004), rbox(0.1, 0.006, 0.07, '#3f7fd0', -0.1, Y0 + 0.102, 0.18, 0.002), rbox(0.06, 0.004, 0.004, PAL.white, -0.1, Y0 + 0.106, 0.17, 0.001));
  for (const [x, z] of [[-0.15, 0.14], [-0.05, 0.14], [-0.15, 0.22], [-0.05, 0.22]]) p.push(rbox(0.01, 0.09, 0.01, PAL.woodDark, x, Y0, z, 0.003));
  return p;
};

BUILDERS.hospital = () => { // Hôpital (moderne) : blocs blancs, bandeaux vitrés, croix rouge, jardins
  const p = [plinth('#eef0ee')];
  p.push(rbox(0.86, 0.012, 0.12, PAL.grass, 0, Y0, 0.36, 0.006), rbox(0.12, 0.012, 0.5, PAL.grass, -0.36, Y0, 0.0, 0.006));
  const RED = '#e2453c';
  // Corps principal et ses bandeaux vitrés
  p.push(rbox(0.4, 0.32, 0.28, PAL.white, 0.08, Y0, -0.1, 0.02), rbox(0.42, 0.025, 0.3, '#e6eaec', 0.08, Y0 + 0.32, -0.1, 0.008));
  for (const y of [0.08, 0.16, 0.24]) p.push(rbox(0.38, 0.04, 0.006, '#7fa9c9', 0.08, Y0 + y, 0.043, 0.003), rbox(0.006, 0.04, 0.26, '#7fa9c9', 0.283, Y0 + y, -0.1, 0.003));
  p.push(rbox(0.03, 0.32, 0.012, RED, 0.27, Y0, 0.046, 0.004));
  // Tour avec la grande croix
  p.push(rbox(0.17, 0.46, 0.17, PAL.white, -0.18, Y0, -0.16, 0.02), rbox(0.18, 0.02, 0.18, '#e6eaec', -0.18, Y0 + 0.46, -0.16, 0.006));
  p.push(rbox(0.1, 0.03, 0.012, RED, -0.18, Y0 + 0.36, -0.07, 0.004), rbox(0.03, 0.1, 0.012, RED, -0.18, Y0 + 0.325, -0.07, 0.004));
  for (const y of [0.1, 0.18, 0.26]) p.push(rbox(0.15, 0.035, 0.006, '#7fa9c9', -0.18, Y0 + y, -0.074, 0.003));
  // Aile basse, auvent d'entrée avec médaillon et marches
  p.push(rbox(0.22, 0.13, 0.14, PAL.white, -0.2, Y0, 0.1, 0.02), rbox(0.2, 0.035, 0.006, '#7fa9c9', -0.2, Y0 + 0.06, 0.172, 0.003));
  p.push(rbox(0.18, 0.02, 0.1, PAL.white, 0.08, Y0 + 0.13, 0.09, 0.008), rbox(0.08, 0.11, 0.012, '#9fd3f0', 0.08, Y0, 0.05, 0.004));
  p.push(cyl(0.03, 0.03, 0.012, PAL.white, 0.08, Y0 + 0.17, 0.142, 16), rbox(0.036, 0.01, 0.006, RED, 0.08, Y0 + 0.17, 0.15, 0.002), rbox(0.01, 0.036, 0.006, RED, 0.08, Y0 + 0.157, 0.15, 0.002));
  p[p.length - 3].rotation.x = Math.PI / 2; p[p.length - 3].position.y = Y0 + 0.175;
  p.push(rbox(0.14, 0.015, 0.05, '#dfe3e4', 0.08, Y0, 0.17, 0.004), rbox(0.12, 0.015, 0.03, '#dfe3e4', 0.08, Y0 + 0.015, 0.16, 0.004));
  // Toit : verrière et ventilateur qui tourne
  p.push(rbox(0.12, 0.03, 0.08, PAL.glassLight, 0.15, Y0 + 0.345, -0.14, 0.01), rbox(0.06, 0.04, 0.06, '#cfd6da', 0.0, Y0 + 0.345, -0.16, 0.01));
  const fan = group(rbox(0.07, 0.006, 0.014, PAL.steelDark, 0, 0, 0, 0.002), rbox(0.014, 0.006, 0.07, PAL.steelDark, 0, 0, 0, 0.002)); fan.position.set(0.0, Y0 + 0.39, -0.16); p.push(spin(fan, 'y', 3));
  p.push(...lollipopTree(-0.36, 0.32, 0.8), ...lollipopTree(0.36, 0.34, 0.7), ...bush(-0.36, -0.05), ...bush(0.3, 0.36, 0.8), bench(-0.1, 0.35));
  return p;
};

BUILDERS.lumber = () => { // Scierie : cabane de bois au toit de planches bleu, palan, grumes, charrette et scie
  const p = [plinth('#a9d98a')];
  p.push(rbox(0.28, 0.2, 0.22, '#a65f45', -0.12, Y0, -0.14, 0.015));
  for (let k = 0; k < 4; k++) p.push(rbox(0.285, 0.008, 0.006, '#8a4b36', -0.12, Y0 + 0.04 + k * 0.045, -0.028, 0.002));
  p.push(rotY(gable(0.34, 0.13, 0.27, '#3f8fd0', -0.12, Y0 + 0.2, -0.14), 0), rbox(0.04, 0.02, 0.29, '#2f76b5', -0.12, Y0 + 0.325, -0.14, 0.006));
  p.push(...windowAt(-0.2, Y0 + 0.1, -0.026), door(-0.05, Y0, -0.026, '#5b3424'));
  const shed = rbox(0.16, 0.014, 0.18, '#3f8fd0', 0.08, Y0 + 0.17, -0.16, 0.005); shed.rotation.z = -0.25; p.push(shed, rbox(0.014, 0.15, 0.014, PAL.woodDark, 0.15, Y0, -0.08, 0.004));
  // Palan : poutre en saillie, poulie qui tourne, crochet qui se balance
  p.push(rbox(0.025, 0.025, 0.24, PAL.woodDark, -0.12, Y0 + 0.27, 0.02, 0.006));
  const pw = wheelGeo(0.035, 4, '#5b3424', PAL.steelDark); pw.rotation.z = Math.PI / 2; const pulley = group(pw); pulley.position.set(-0.12, Y0 + 0.25, 0.12); p.push(spin(pulley, 'x', 2));
  const hook = group(cyl(0.003, 0.003, 0.12, PAL.ink, 0, -0.12, 0, 4), cone(0.012, 0.025, PAL.gold, 0, -0.14, 0, 6)); hook.position.set(-0.12, Y0 + 0.22, 0.155); p.push(swing(hook, 0.2, 1.3));
  // Pile de grumes
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) { const l = cyl(0.03, 0.03, 0.22, '#c89462', -0.26 + j * 0.062 + i * 0.031, 0, 0.18, 12); l.rotation.x = Math.PI / 2; l.position.y = Y0 + 0.03 + i * 0.054; p.push(l, cyl(0.022, 0.022, 0.222, '#e6c08f', l.position.x, 0, 0.18, 10)); p[p.length - 1].rotation.x = Math.PI / 2; p[p.length - 1].position.y = l.position.y; }
  // Charrette
  p.push(rbox(0.16, 0.025, 0.1, '#d08b4c', 0.06, Y0 + 0.05, 0.27, 0.008), rbox(0.16, 0.035, 0.008, '#c07a3e', 0.06, Y0 + 0.07, 0.32, 0.003), rbox(0.16, 0.035, 0.008, '#c07a3e', 0.06, Y0 + 0.07, 0.22, 0.003));
  for (const z of [0.215, 0.325]) { const w = cyl(0.045, 0.045, 0.014, '#b06a36', 0.06, 0, z, 14); w.rotation.x = Math.PI / 2; w.position.y = Y0 + 0.045; p.push(w); }
  const shaft = rbox(0.14, 0.012, 0.012, '#c07a3e', -0.07, Y0 + 0.04, 0.27, 0.004); shaft.rotation.z = 0.25; p.push(shaft);
  // Établi et scie circulaire, planches empilées
  p.push(rbox(0.16, 0.025, 0.09, PAL.wood, 0.28, Y0 + 0.08, 0.04, 0.006));
  for (const [x, z] of [[0.21, 0.0], [0.35, 0.0], [0.21, 0.08], [0.35, 0.08]]) p.push(rbox(0.012, 0.08, 0.012, PAL.woodDark, x, Y0, z, 0.003));
  const saw = cyl(0.045, 0.045, 0.006, PAL.steel, 0, 0, 0, 20); saw.rotation.x = Math.PI / 2; const sawG = group(saw); sawG.position.set(0.28, Y0 + 0.12, 0.04); p.push(spin(sawG, 'z', 6));
  for (let k = 0; k < 4; k++) p.push(rbox(0.2, 0.014, 0.05, k % 2 ? '#e2b27a' : '#d9a46a', 0.27, Y0 + k * 0.015, 0.3, 0.004));
  for (let k = 0; k < 5; k++) p.push(rbox(0.014, 0.06, 0.014, '#c07a3e', 0.42, Y0, -0.36 + k * 0.07, 0.004));
  p.push(rbox(0.012, 0.012, 0.28, '#c07a3e', 0.42, Y0 + 0.04, -0.22, 0.004));
  return p;
};

BUILDERS.theatre = () => { // Théâtre : façade art déco rose, enseigne verticale, marquise à ampoules
  const p = [plinth(PAL.paving)];
  p.push(rbox(0.5, 0.28, 0.3, '#f2b8b0', 0, Y0, -0.1, 0.02), rbox(0.52, 0.03, 0.32, '#f6d2c8', 0, Y0 + 0.28, -0.1, 0.01), rbox(0.3, 0.06, 0.24, '#f2b8b0', 0, Y0 + 0.31, -0.12, 0.015));
  for (const x of [-0.24, 0.24]) p.push(rbox(0.04, 0.31, 0.04, '#f8e0d8', x, Y0, 0.05, 0.01));
  for (const x of [-0.17, 0.17]) { const w = cyl(0.03, 0.03, 0.012, PAL.white, x, Y0 + 0.22, 0.054, 16); w.rotation.x = Math.PI / 2; w.position.y = Y0 + 0.22; const g2 = cyl(0.022, 0.022, 0.014, PAL.glass, x, Y0 + 0.22, 0.058, 16); g2.rotation.x = Math.PI / 2; g2.position.y = Y0 + 0.22; p.push(w, g2); }
  // Enseigne verticale (lame) avec sa colonne de points dorés
  p.push(rbox(0.07, 0.4, 0.04, '#e56b7f', 0, Y0 + 0.16, 0.075, 0.012), rbox(0.052, 0.36, 0.044, PAL.white, 0, Y0 + 0.18, 0.075, 0.01));
  for (let k = 0; k < 6; k++) p.push(sph(0.011, '#e56b7f', 0, Y0 + 0.21 + k * 0.055, 0.1));
  p.push(sph(0.02, PAL.gold, 0, Y0 + 0.59, 0.075));
  // Marquise : auvent blanc et guirlande d'ampoules qui clignote
  p.push(rbox(0.36, 0.05, 0.12, PAL.white, 0, Y0 + 0.14, 0.11, 0.012), rbox(0.36, 0.012, 0.124, '#e56b7f', 0, Y0 + 0.19, 0.11, 0.004));
  p.push(bulbs(9, -0.16, 0.16, Y0 + 0.165, 0.173));
  // Entrée, affiches, masques
  p.push(rbox(0.16, 0.12, 0.012, '#c9384d', 0, Y0, 0.052, 0.006), rbox(0.006, 0.12, 0.014, PAL.gold, 0, Y0, 0.054, 0.002));
  for (const [x, c] of [[-0.17, '#5b8def'], [0.17, '#f2b632']]) p.push(rbox(0.07, 0.1, 0.012, PAL.gold, x, Y0 + 0.02, 0.052, 0.004), rbox(0.056, 0.084, 0.014, c, x, Y0 + 0.028, 0.054, 0.003));
  p.push(...lamp(0.32, 0.28), ...lamp(-0.32, 0.28), ...pot(0.2, 0.3), ...pot(-0.2, 0.3));
  return p;
};

BUILDERS.harbor = () => { // Port : quai de béton, conteneurs, portique qui va et vient, cuves, cargo
  const p = [plinth('#dcd6cc')];
  p.push(rbox(0.3, 0.014, 0.88, '#6fb6e0', 0.29, Y0, 0, 0.006), rbox(0.24, 0.002, 0.8, '#9fd3f0', 0.3, Y0 + 0.014, 0, 0.001), rbox(0.025, 0.03, 0.88, '#c8c1b6', 0.13, Y0, 0, 0.006), rbox(0.02, 0.006, 0.86, PAL.gold, 0.13, Y0 + 0.03, 0, 0.002));
  for (const z of [-0.3, -0.05, 0.2]) p.push(cyl(0.014, 0.016, 0.03, PAL.ink, 0.11, Y0, z, 8));
  // Cuves de stockage
  for (const [x, z, r] of [[-0.3, -0.3, 0.09], [-0.12, -0.33, 0.065]]) p.push(cyl(r, r, 0.2, PAL.white, x, Y0, z, 20), torus(r + 0.002, 0.005, '#c9d2d8', x, Y0 + 0.1, z), dome(r, '#eef1f3', x, Y0 + 0.2, z));
  // Conteneurs empilés
  const CT = ['#e2574c', '#4f86d9', '#f2b632', '#3fa7a0', '#e0677e', '#8b79d9'];
  [[-0.28, -0.04, 0], [-0.28, 0.06, 0], [-0.28, 0.16, 0], [-0.28, 0.0, 1], [-0.28, 0.1, 1], [-0.1, 0.0, 0], [-0.1, 0.1, 0], [-0.1, 0.05, 1], [-0.1, 0.26, 0], [-0.28, 0.3, 0]].forEach(([x, z, lv], k) => {
    const c = CT[k % CT.length];
    p.push(rbox(0.16, 0.07, 0.085, c, x, Y0 + lv * 0.07, z, 0.008));
    for (const dx of [-0.05, 0, 0.05]) p.push(rbox(0.006, 0.06, 0.088, new THREE.Color(c).multiplyScalar(0.85).getStyle(), x + dx, Y0 + lv * 0.07 + 0.005, z, 0.002));
  });
  // Portique : le chariot glisse au-dessus de l'eau
  for (const [x, z] of [[0.06, -0.12], [0.06, 0.12], [0.34, -0.12], [0.34, 0.12]]) p.push(rbox(0.025, 0.36, 0.025, PAL.gold, x, Y0, z, 0.006));
  p.push(rbox(0.5, 0.035, 0.035, PAL.gold, 0.25, Y0 + 0.36, -0.12, 0.008), rbox(0.5, 0.035, 0.035, PAL.gold, 0.25, Y0 + 0.36, 0.12, 0.008), rbox(0.03, 0.03, 0.27, PAL.gold, 0.06, Y0 + 0.36, 0, 0.006));
  const trolley = group(rbox(0.06, 0.04, 0.27, '#d99a1e', 0, 0, 0, 0.008), cyl(0.003, 0.003, 0.12, PAL.ink, 0, -0.12, 0, 4), rbox(0.1, 0.045, 0.06, '#4f86d9', 0, -0.16, 0, 0.006));
  trolley.position.set(0.28, Y0 + 0.36, 0); p.push(slide(trolley, 0.1, 0.5));
  // Petit cargo qui tangue à quai
  const boat = group(rbox(0.12, 0.05, 0.3, '#3d6fd1', 0, 0, 0, 0.03), rbox(0.1, 0.012, 0.26, '#b5503f', 0, -0.012, 0, 0.01), rbox(0.08, 0.035, 0.08, PAL.white, 0, 0.05, -0.09, 0.01), rbox(0.07, 0.03, 0.06, '#e2574c', 0, 0.05, 0.02, 0.006), rbox(0.07, 0.03, 0.06, PAL.gold, 0, 0.05, 0.09, 0.006));
  boat.position.set(0.3, Y0 - 0.015, -0.28); p.push(bob(boat, 0.012, 1.6), flag(PAL.roofRed, 0.16, Y0, 0.38, 0.26));
  return p;
};

const NO_ROTATE = new Set(['watermill', 'harbor', 'lighthouse', 'campus', 'artsquarter', 'merchantquarter', 'outpost']);
// variant : 0..3 (déterministe selon la case) ; progress : 0..1 pour un chantier.
export function buildingModel(type, wip, lux, variant = 0, progress = 0) {
  REMAP = VARIANTS[variant % VARIANTS.length];
  let body;
  try { body = bake(group((BUILDERS[type] || BUILDERS.market)(lux))); } finally { REMAP = null; }
  const g = new THREE.Group();
  g.add(body);
  if (!NO_ROTATE.has(type)) body.rotation.y = (variant % 4) * (Math.PI / 2);
  if (wip) {
    // Le bâtiment « monte » au fil des tours, sous un échafaudage, avec une grue qui pivote.
    body.scale.y = 0.25 + 0.65 * progress;
    body.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.castShadow = false; } });
    const big = type === 'campus' || type === 'artsquarter' || type === 'merchantquarter';
    const sc = bake(group(
      ...[[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]].map(([x, z]) => rbox(0.02, 0.42, 0.02, PAL.gold, x, Y0, z, 0.006)),
      rbox(0.78, 0.02, 0.02, PAL.gold, 0, Y0 + 0.4, 0.38, 0.006), rbox(0.78, 0.02, 0.02, PAL.gold, 0, Y0 + 0.4, -0.38, 0.006),
      rbox(0.78, 0.02, 0.02, PAL.gold, 0, Y0 + 0.2, 0.38, 0.006), rbox(0.02, 0.02, 0.78, PAL.gold, 0.38, Y0 + 0.2, 0, 0.006),
      cyl(0.0, 0.03, 0.07, '#ff8a3d', 0.3, Y0, 0.42, 12), cyl(0.0, 0.03, 0.07, '#ff8a3d', -0.3, Y0, 0.42, 12),
      rbox(0.06, 0.06, 0.06, PAL.wood, -0.3, Y0, 0.3, 0.01), rbox(0.05, 0.05, 0.05, PAL.stoneLight, -0.24, Y0, 0.32, 0.01),
    ));
    if (big) sc.scale.set(2.2, 1.3, 2.2);
    g.add(sc);
    const crane = new THREE.Group();
    crane.add(rbox(0.035, 0.62, 0.035, PAL.gold, 0, 0, 0, 0.008));
    const jib = group(rbox(0.5, 0.025, 0.03, PAL.gold, 0.15, 0, 0, 0.006), rbox(0.08, 0.05, 0.05, PAL.ink, -0.12, -0.012, 0, 0.01),
      cyl(0.003, 0.003, 0.18, PAL.ink, 0.34, -0.18, 0, 4), rbox(0.03, 0.03, 0.03, PAL.roofRed, 0.34, -0.21, 0, 0.006));
    jib.position.y = 0.6;
    crane.add(anim(jib, { type: 'spin', axis: 'y', speed: 0.5 }));
    crane.position.set(big ? 0.85 : 0.33, Y0, big ? -0.85 : -0.33);
    crane.userData.keep = true;
    g.add(crane);
  }
  return g;
}

// -------------------------------------------------------------------- unités
// Coque de bateau : silhouette à proue arrondie, extrudée vers le haut (s = échelle, h = hauteur).
function hullGeo(s, h) {
  return cached(`hull${s},${h}`, () => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.24 * s, -0.085 * s); sh.lineTo(0.1 * s, -0.085 * s); sh.quadraticCurveTo(0.27 * s, -0.07 * s, 0.29 * s, 0);
    sh.quadraticCurveTo(0.27 * s, 0.07 * s, 0.1 * s, 0.085 * s); sh.lineTo(-0.24 * s, 0.085 * s); sh.quadraticCurveTo(-0.27 * s, 0, -0.24 * s, -0.085 * s);
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: Math.min(0.012, h / 3), bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });
    g.rotateX(-Math.PI / 2); g.translate(0, Math.min(0.012, h / 3), 0);
    return g;
  });
}
// Personnage « toy » : grosse tête, grands yeux, bonnet et sweat à la couleur du joueur.
function character(color, skin, hat = 'beanie', s = 1) {
  const p = [];
  p.push(rbox(0.12 * s, 0.13 * s, 0.09 * s, color, 0, 0.02 * s, 0, 0.04 * s));         // sweat
  p.push(rbox(0.035 * s, 0.03 * s, 0.035 * s, PAL.ink, -0.03 * s, 0, 0, 0.012 * s), rbox(0.035 * s, 0.03 * s, 0.035 * s, PAL.ink, 0.03 * s, 0, 0, 0.012 * s));
  p.push(sph(0.085 * s, skin, 0, 0.23 * s, 0));                                         // tête
  p.push(sph(0.022 * s, skin, -0.085 * s, 0.23 * s, 0), sph(0.022 * s, skin, 0.085 * s, 0.23 * s, 0)); // oreilles
  for (const x of [-0.032, 0.032]) {
    p.push(sph(0.026 * s, '#ffffff', x * s, 0.235 * s, 0.07 * s));
    p.push(sph(0.012 * s, PAL.ink, x * s, 0.235 * s, 0.093 * s));
  }
  p.push(sph(0.018 * s, skin, 0, 0.205 * s, 0.085 * s));                                 // nez
  if (hat === 'beanie') p.push(dome(0.09 * s, color, 0, 0.255 * s, 0), torus(0.086 * s, 0.014 * s, color, 0, 0.26 * s, 0), sph(0.02 * s, PAL.white, 0, 0.35 * s, 0));
  else if (hat === 'straw') p.push(cyl(0.13 * s, 0.13 * s, 0.01 * s, PAL.hay, 0, 0.27 * s, 0, 20), cyl(0.07 * s, 0.08 * s, 0.06 * s, PAL.hay, 0, 0.27 * s, 0, 16), cyl(0.081 * s, 0.081 * s, 0.015 * s, color, 0, 0.275 * s, 0, 16));
  else if (hat === 'hardhat') p.push(dome(0.095 * s, PAL.gold, 0, 0.26 * s, 0), cyl(0.11 * s, 0.11 * s, 0.012 * s, PAL.gold, 0, 0.26 * s, 0, 20));
  else if (hat === 'cap') { p.push(dome(0.09 * s, color, 0, 0.255 * s, 0)); const v = rbox(0.1 * s, 0.01 * s, 0.07 * s, color, 0, 0.255 * s, 0.08 * s, 0.004 * s); p.push(v); }
  return p;
}

export function unitModel(type, color, skinIdx = 0) {
  const skin = PAL.skin[skinIdx % PAL.skin.length];
  let parts;
  if (type === 'explorer') {
    parts = [...character(color, skin, 'beanie', 1.2), rbox(0.09, 0.11, 0.05, PAL.wood, 0, 0.05, -0.07, 0.02)];
  } else if (type === 'settler') {
    // Charrette bâchée tirée par le colon
    const cart = [rbox(0.24, 0.07, 0.17, PAL.wood, 0.05, 0.05, 0, 0.02), dome(0.09, PAL.white, 0.05, 0.12, 0)];
    cart[1].scale.set(1.3, 1, 1);
    for (const [x, z] of [[-0.04, 0.095], [0.14, 0.095], [-0.04, -0.095], [0.14, -0.095]]) { const w = cyl(0.04, 0.04, 0.02, PAL.woodDark, x, 0.0, z, 16); w.rotation.x = Math.PI / 2; w.position.y = 0.045; cart.push(w); }
    const guy = group(character(color, skin, 'straw', 0.9)); guy.position.set(-0.16, 0, 0.02);
    parts = [...cart, guy];
  } else if (type === 'engineer') {
    parts = [...character(color, skin, 'hardhat', 1.15), rbox(0.02, 0.14, 0.02, PAL.steelDark, 0.1, 0.06, 0.04, 0.006), rbox(0.06, 0.03, 0.03, PAL.steelDark, 0.1, 0.19, 0.04, 0.008)];
  } else if (type === 'emissary') {
    const scroll = cyl(0.025, 0.025, 0.1, PAL.cream, 0.1, 0.1, 0.05, 10); scroll.rotation.z = Math.PI / 2; scroll.position.y = 0.12;
    parts = [...character(color, skin, 'cap', 1.15), scroll, rbox(0.012, 0.03, 0.012, PAL.roofRed, 0.1, 0.105, 0.05, 0.004)];
  } else if (type === 'ship') {
    // Cargo arrondi : coque bleue sur carène rouge, caisses en cale, passerelle blanche et cheminée à la couleur du joueur.
    parts = [
      place(hullGeo(0.92, 0.05), '#b5503f', 0, 0.0, 0), place(hullGeo(1, 0.07), '#3d6fd1', 0, 0.045, 0), place(hullGeo(1.02, 0.014), color, 0, 0.112, 0),
      place(hullGeo(0.86, 0.01), '#d9cbb5', 0, 0.12, 0),
    ];
    const C = ['#d9a15f', '#4f86d9', color, '#d9a15f', '#e2c08a', color];
    for (let k = 0; k < 6; k++) parts.push(rbox(0.07, 0.055, 0.065, C[k], -0.02 + (k % 3) * 0.075, 0.13, k < 3 ? -0.037 : 0.037, 0.008));
    parts.push(rbox(0.07, 0.05, 0.065, '#e2c08a', 0.055, 0.185, 0.0, 0.008));
    parts.push(rbox(0.09, 0.07, 0.13, PAL.white, -0.17, 0.13, 0, 0.014), rbox(0.1, 0.014, 0.14, '#d9a15f', -0.17, 0.2, 0, 0.005), rbox(0.065, 0.05, 0.1, PAL.white, -0.18, 0.214, 0, 0.012), rbox(0.075, 0.012, 0.11, '#d9a15f', -0.18, 0.264, 0, 0.004));
    for (const z of [-0.035, 0, 0.035]) parts.push(rbox(0.006, 0.02, 0.02, PAL.glass, -0.124, 0.16, z, 0.003));
    parts.push(cyl(0.02, 0.024, 0.07, color, -0.2, 0.276, 0, 12), cyl(0.021, 0.021, 0.012, PAL.ink, -0.2, 0.34, 0, 12), smoke(-0.2, 0.36, 0, 0.8));
    parts.push(cyl(0.012, 0.012, 0.02, PAL.gold, 0.2, 0.12, 0, 8), cyl(0.003, 0.003, 0.14, PAL.ink, 0.12, 0.12, 0, 4), rbox(0.05, 0.03, 0.004, color, 0.145, 0.23, 0, 0.002));
  } else if (type === 'airship') {
    const balloon = sph(0.16, color, 0, 0.28, 0); balloon.scale.set(1.8, 0.9, 0.9);
    parts = [balloon, torus(0.15, 0.012, PAL.white, 0, 0.28, 0), rbox(0.16, 0.06, 0.08, PAL.wood, 0, 0.08, 0, 0.02),
      cyl(0.004, 0.004, 0.12, PAL.ink, -0.05, 0.12, 0, 4), cyl(0.004, 0.004, 0.12, PAL.ink, 0.05, 0.12, 0, 4),
      rbox(0.05, 0.08, 0.01, PAL.white, -0.3, 0.26, 0, 0.005)];
    parts[1].rotation.set(0, 0, Math.PI / 2); parts[1].scale.set(1, 1, 1);
  } else {
    // Caravane : petit camion arrondi
    parts = [
      rbox(0.3, 0.07, 0.16, PAL.ink, 0, 0.03, 0, 0.02),
      rbox(0.11, 0.12, 0.15, color, -0.1, 0.08, 0, 0.035), rbox(0.04, 0.06, 0.13, PAL.glassLight, -0.155, 0.12, 0, 0.012),
      rbox(0.17, 0.13, 0.16, PAL.cream, 0.06, 0.08, 0, 0.03), rbox(0.172, 0.03, 0.162, color, 0.06, 0.14, 0, 0.01),
    ];
    for (const [x, z] of [[-0.1, 0.08], [0.1, 0.08], [-0.1, -0.08], [0.1, -0.08]]) { const w = cyl(0.035, 0.035, 0.025, PAL.ink, x, 0, z, 16); w.rotation.x = Math.PI / 2; w.position.y = 0.035; parts.push(w, (() => { const h = cyl(0.015, 0.015, 0.027, PAL.steel, x, 0, z, 10); h.rotation.x = Math.PI / 2; h.position.y = 0.035; return h; })()); }
  }
  const body = bake(group(parts));
  body.userData.anim = { type: 'bob', amp: type === 'airship' ? 0.04 : type === 'ship' ? 0.012 : 0.012, speed: type === 'airship' ? 1.2 : 2.4 };
  const g = new THREE.Group();
  g.add(body);
  const base = new THREE.Mesh(cached('ubase', () => new THREE.CircleGeometry(0.17, 24)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.012;
  g.add(base);
  return g;
}

// ------------------------------------------------------ merveilles naturelles
// Posées directement sur la case (sans socle) ; plus grandes qu'un bâtiment pour se repérer de loin.
const glowMat = new THREE.MeshStandardMaterial({ color: '#ff7a3d', emissive: '#ff5a1f', emissiveIntensity: 0.9, roughness: 0.5 });
const waterMat = new THREE.MeshStandardMaterial({ color: '#8fd3f4', roughness: 0.15, transparent: true, opacity: 0.85 });
function palmTree(x, z, h = 0.34, lean = 0.12) {
  const p = [];
  for (let k = 0; k < 4; k++) p.push(cyl(0.018 - k * 0.002, 0.02 - k * 0.002, h / 4, k % 2 ? '#a5794c' : '#b98a58', x + lean * (k / 4) * 0.3, (h / 4) * k, z, 8));
  const top = [x + lean * 0.3, h, z];
  for (let k = 0; k < 5; k++) {
    const leaf = rbox(0.2, 0.012, 0.05, k % 2 ? PAL.leaf : PAL.grassDark, 0, 0, 0, 0.006);
    const g = group(leaf); leaf.position.x = 0.08; g.position.set(...top); g.rotation.set(0, (k / 5) * Math.PI * 2, -0.35);
    p.push(g);
  }
  p.push(sph(0.028, '#8a5634', top[0], top[1], top[2]));
  return p;
}
const NATURALS = {
  falls: () => {
    const p = [rbox(0.86, 0.12, 0.86, '#cfc6b8', 0, 0, 0, 0.05)];
    p.push(rbox(0.62, 0.38, 0.34, '#bdb3a6', 0, 0.12, -0.2, 0.06), rbox(0.4, 0.22, 0.26, '#d4cbbd', -0.2, 0.5, -0.24, 0.05), rbox(0.3, 0.16, 0.22, '#c4baac', 0.2, 0.5, -0.22, 0.05));
    p.push(rbox(0.18, 0.45, 0.04, '#bfe8fb', 0, 0.12, -0.02, 0.02)); // chute
    const pool = new THREE.Mesh(cached('fallspool', () => new THREE.CylinderGeometry(0.28, 0.3, 0.04, 24)), waterMat); pool.position.set(0, 0.14, 0.2); p.push(pool);
    for (const [x, z] of [[-0.06, 0.05], [0.07, 0.07], [0, 0.12]]) p.push(anim(sph(0.045, PAL.white, x, 0.18, z), { type: 'bob', speed: 3, amp: 0.012 }));
    p.push(sph(0.07, PAL.leaf, -0.32, 0.18, 0.28), sph(0.06, PAL.leafLight, 0.33, 0.18, 0.25), sph(0.08, PAL.leaf, 0.3, 0.68, -0.22), sph(0.06, PAL.leafLight, -0.33, 0.7, -0.2));
    return p;
  },
  volcano: () => {
    const p = [cone(0.46, 0.55, '#8d6e5c', 0, 0, 0, 18), cone(0.3, 0.34, '#a3816b', 0.05, 0, 0.1, 14)];
    const crater = new THREE.Mesh(cached('crater', () => new THREE.CylinderGeometry(0.1, 0.12, 0.05, 16)), glowMat); crater.position.set(0, 0.49, 0); p.push(crater);
    // Coulées de lave figées sur les pentes et blocs sombres au pied.
    for (const a of [0.5, 2.3, 4.1]) {
      const lava = rbox(0.05, 0.012, 0.3, '#ff7a3d', 0, 0, 0, 0.005);
      lava.position.set(0, 0.29, 0.22); lava.rotation.x = Math.atan2(0.55, 0.46); // couché sur la pente du cône
      const g = group(lava); g.rotation.y = a;
      p.push(g);
    }
    for (const [x, z, r] of [[-0.36, 0.22, 0.05], [0.34, 0.26, 0.04], [0.3, -0.32, 0.05], [-0.3, -0.3, 0.04]]) p.push(sph(r, '#5e4a40', x, 0.02, z, 0.8));
    p.push(smoke(0, 0.55, 0, 2.2), smoke(0.04, 0.58, -0.03, 1.6));
    return p;
  },
  reef: () => {
    const p = [];
    const corals = [['#ff7f9e', -0.2, -0.1], ['#ffb347', 0.15, -0.18], ['#b48cf2', 0.22, 0.15], ['#ff6f61', -0.12, 0.22], ['#5fd3c4', 0.02, 0.02], ['#ffd166', -0.28, 0.08]];
    corals.forEach(([c, x, z], k) => {
      if (k % 2) { // corail cerveau : boules groupées
        p.push(sph(0.06, c, x, 0.03, z, 0.7), sph(0.04, c, x + 0.05, 0.02, z + 0.03, 0.7), sph(0.035, c, x - 0.04, 0.02, z + 0.04, 0.7));
      } else { // corail branchu : petites cornes inclinées
        for (const [dx, dz, a, h] of [[0, 0, 0, 0.14], [0.03, 0.01, 0.5, 0.11], [-0.03, 0.01, -0.5, 0.1], [0.0, -0.03, 0.4, 0.09]]) {
          const br = cone(0.02, h, c, 0, 0, 0, 7); br.position.set(x + dx, h / 2, z + dz); br.rotation.z = a; br.rotation.x = dz * 8; p.push(br, sph(0.016, c, x + dx - Math.sin(a) * h * 0.9, Math.cos(a) * h * 0.95, z + dz));
        }
      }
    });
    for (const [x, z, c] of [[0.3, -0.05, '#ffb347'], [-0.05, -0.28, '#ff7f9e']]) {
      const fish = group(sph(0.025, c, 0, 0, 0, 0.7), cone(0.018, 0.03, c, -0.035, -0.015, 0, 6));
      fish.position.set(x, 0.12, z);
      p.push(anim(fish, { type: 'bob', speed: 2, amp: 0.02 }));
    }
    return p;
  },
  greattree: () => {
    const p = [rbox(0.82, 0.05, 0.82, PAL.grassDark, 0, 0, 0, 0.03), cyl(0.09, 0.14, 0.42, '#7a4b2c', 0, 0.05, 0, 14)];
    for (const [x, z, a] of [[0.12, 0.05, 0.6], [-0.1, 0.08, -0.6], [0.02, -0.12, 0.3]]) { const r = cyl(0.03, 0.05, 0.18, '#7a4b2c', x, 0.05, z, 8); r.rotation.z = a; p.push(r); }
    for (const [x, y, z, r, c] of [[0, 0.62, 0, 0.26, PAL.leaf], [0.2, 0.52, 0.08, 0.17, PAL.leafLight], [-0.2, 0.55, -0.05, 0.18, '#4f9e55'], [0.05, 0.75, -0.12, 0.16, PAL.leafLight], [-0.08, 0.5, 0.2, 0.15, PAL.leaf]]) p.push(sph(r, c, x, y, z, 0.85));
    for (const [x, z] of [[0.18, 0.18], [-0.2, 0.14], [0.14, -0.2]]) p.push(sph(0.02, PAL.gold, x, 0.42, z));
    return p;
  },
  canyon: () => {
    const p = [];
    const layers = ['#d9704f', '#e8956b', '#c95e44', '#eaa77c'];
    for (const [x, z, w, d] of [[-0.24, -0.05, 0.34, 0.74], [0.25, 0.05, 0.3, 0.7]]) {
      let y = 0;
      layers.forEach((c, k) => { const h = 0.1 + (k % 2) * 0.04; p.push(rbox(w - k * 0.03, h, d - k * 0.04, c, x, y, z, 0.03)); y += h; });
    }
    p.push(rbox(0.12, 0.02, 0.8, '#7fc4e6', 0.01, 0, 0, 0.01));
    p.push(sph(0.05, PAL.grassDark, -0.05, 0.03, 0.3), sph(0.04, PAL.leaf, 0.06, 0.03, -0.32));
    return p;
  },
  oasis: () => {
    const p = [rbox(0.84, 0.04, 0.84, '#f3e0b5', 0, 0, 0, 0.03), cyl(0.3, 0.32, 0.03, PAL.grass, 0.02, 0.04, 0.04, 22)];
    const pond = new THREE.Mesh(cached('oasispond', () => new THREE.CylinderGeometry(0.21, 0.22, 0.03, 22)), waterMat); pond.position.set(0.02, 0.07, 0.04); p.push(pond);
    p.push(...palmTree(-0.26, -0.2, 0.42, 0.2), ...palmTree(0.27, -0.12, 0.36, -0.15), ...palmTree(-0.1, 0.3, 0.32, 0.1));
    p.push(rbox(0.08, 0.05, 0.06, '#e2574c', 0.3, 0.07, 0.28, 0.01), cone(0.07, 0.1, '#f6ead6', 0.2, 0.07, 0.3, 4));
    return p;
  },
};
export function naturalModel(id) {
  const g = bake(group((NATURALS[id] || NATURALS.canyon)()));
  return g;
}

// Ruines antiques : colonnes brisées sur un dallage envahi de mousse.
export function ruinModel() {
  const p = [rbox(0.5, 0.04, 0.42, '#d8d0c3', 0, 0, 0, 0.02)];
  for (const [x, z, h] of [[-0.17, -0.13, 0.26], [0.0, -0.13, 0.12], [0.17, -0.13, 0.2], [-0.17, 0.12, 0.08]]) p.push(cyl(0.035, 0.04, h, '#ece6dc', x, 0.04, z, 12), rbox(0.1, 0.025, 0.1, '#d4cdc4', x, 0.04 + h, z, 0.008));
  const fallen = cyl(0.035, 0.035, 0.22, '#e3dccf', 0.1, 0.075, 0.13, 12); fallen.rotation.z = Math.PI / 2; fallen.position.y = 0.075; p.push(fallen);
  p.push(sph(0.035, PAL.grassDark, -0.05, 0.05, 0.08), sph(0.025, PAL.leaf, 0.2, 0.05, -0.02), sph(0.02, PAL.leafLight, -0.2, 0.06, 0.0));
  return bake(group(p));
}

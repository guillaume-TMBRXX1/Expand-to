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
    out.add(k);
  }
  return out;
}

// --------------------------------------------------------------------- villes
const WALLS = [PAL.cream, '#f3d9c4', '#dfe9f2', '#f5e3a8', '#e6dcf3'];
export function cityModel(color, pop, capital, tier = 0) {
  const parts = [plinth(PAL.paving, 0.92, 0.92)];
  // Palier Artisans : place avec fontaine et étal ; palier Savants : maisons à étage et tour à coupole.
  if (tier >= 1) {
    parts.push(cyl(0.075, 0.08, 0.035, PAL.stoneLight, 0, Y0, 0.3, 18), cyl(0.06, 0.06, 0.01, PAL.water, 0, Y0 + 0.03, 0.3, 18), cyl(0.012, 0.016, 0.07, PAL.stoneLight, 0, Y0 + 0.03, 0.3, 8), sph(0.016, PAL.glassLight, 0, Y0 + 0.11, 0.3));
    parts.push(rbox(0.1, 0.05, 0.06, PAL.wood, 0.32, Y0, 0.05, 0.01), ...awning(0.1, [PAL.roofRed, PAL.white], 0.32, Y0 + 0.08, -0.02));
  }
  if (tier >= 2) {
    parts.push(cyl(0.05, 0.06, 0.34, PAL.white, -0.32, Y0, 0.32, 12), dome(0.05, color, -0.32, Y0 + 0.34, 0.32), sph(0.012, PAL.gold, -0.32, Y0 + 0.4, 0.32));
  }
  const spots = [[-0.24, -0.22, 0], [0.24, -0.24, 0], [-0.26, 0.2, 1], [0.25, 0.22, 1], [0, -0.3, 0], [-0.3, -0.02, 1]];
  const n = Math.min(spots.length, 2 + pop);
  for (let i = 0; i < n; i++) {
    const [x, z] = spots[i];
    const g = group(cottage({ w: 0.17, h: 0.13 + (i % 2) * 0.04 + (tier >= 2 ? 0.07 : 0), d: 0.15, wall: WALLS[i % WALLS.length], roof: i % 2 ? color : PAL.terracotta, x: 0, z: 0, y: Y0, chimney: i % 3 === 0 }));
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
  lumber: () => {
    const p = [plinth('#a9d98a')];
    p.push(...cottage({ w: 0.28, h: 0.17, d: 0.22, wall: PAL.wood, roof: PAL.roofGreen, x: -0.14, z: -0.14 }));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) {
      const l = cyl(0.032, 0.032, 0.26, '#c89462', 0.18, Y0 + 0.032 + i * 0.058, 0.02 + j * 0.065 + i * 0.032 - 0.065, 12);
      l.rotation.x = Math.PI / 2; l.position.y = Y0 + 0.032 + i * 0.056; p.push(l);
    }
    const saw = cyl(0.07, 0.07, 0.01, PAL.steel, -0.14, Y0 + 0.1, 0.22, 20); saw.rotation.x = Math.PI / 2; p.push(rbox(0.16, 0.08, 0.06, PAL.roofBlue, -0.14, Y0, 0.22, 0.015), spin(saw, 'y', 6));
    p.push(...lollipopTree(0.3, -0.3), cyl(0.04, 0.045, 0.04, PAL.woodDark, 0.32, Y0, 0.3, 12));
    return p;
  },
  quarry: () => {
    const p = [plinth(PAL.stoneLight)];
    p.push(sph(0.13, PAL.stone, -0.18, Y0 + 0.06, -0.15, 0.8), sph(0.09, '#c9c2b9', 0.05, Y0 + 0.04, -0.25, 0.8), sph(0.07, PAL.stone, -0.3, Y0 + 0.03, 0.05, 0.8));
    p.push(rbox(0.08, 0.08, 0.08, PAL.stoneLight, 0.2, Y0, 0.05, 0.015), rbox(0.08, 0.08, 0.08, '#c6bfb6', 0.29, Y0, 0.05, 0.015), rbox(0.08, 0.08, 0.08, PAL.stoneLight, 0.245, Y0 + 0.08, 0.05, 0.015));
    p.push(rbox(0.04, 0.32, 0.04, PAL.gold, 0.25, Y0, -0.25, 0.01), rbox(0.3, 0.035, 0.035, PAL.gold, 0.13, Y0 + 0.3, -0.25, 0.01), cyl(0.004, 0.004, 0.14, PAL.ink, 0.0, Y0 + 0.17, -0.25, 6));
    p.push(rbox(0.18, 0.06, 0.1, PAL.roofBlue, -0.05, Y0 + 0.02, 0.24, 0.015));
    for (const x of [-0.11, 0.01]) { const w = cyl(0.025, 0.025, 0.12, PAL.ink, x, Y0 + 0.02, 0.24, 12); w.rotation.x = Math.PI / 2; w.position.y = Y0 + 0.025; p.push(w); }
    p.push(sph(0.025, '#c9c2b9', -0.08, Y0 + 0.1, 0.24), sph(0.022, PAL.stone, -0.02, Y0 + 0.1, 0.23));
    return p;
  },
  market: () => {
    const p = [plinth(PAL.paving)];
    p.push(...shop({ w: 0.44, h: 0.24, d: 0.3, wall: '#f3d9c4', roof: PAL.roofGreen, z: -0.1 }));
    p.push(...awning(0.44, [PAL.roofGreen, PAL.white], 0, Y0 + 0.2, 0.05));
    p.push(rbox(0.18, 0.14, 0.012, PAL.glassLight, -0.1, Y0 + 0.02, 0.052, 0.006), door(0.12, Y0, 0.052, PAL.roofGreen));
    p.push(...sign('', 0, Y0 + 0.3, 0.065, PAL.white, PAL.roofBlue));
    for (const [x, c] of [[-0.25, '#ff9f43'], [-0.13, PAL.roofRed], [0.0, '#ffd23f']]) p.push(crate(x, 0.28), sph(0.022, c, x - 0.012, Y0 + 0.07, 0.28), sph(0.022, c, x + 0.014, Y0 + 0.07, 0.285));
    p.push(...pot(0.3, 0.12), ...pot(0.3, 0.3));
    return p;
  },
  library: () => {
    const p = [plinth(PAL.paving)];
    p.push(rbox(0.5, 0.06, 0.4, PAL.creamDark, 0, Y0, -0.06, 0.02), rbox(0.44, 0.22, 0.3, PAL.cream, 0, Y0 + 0.06, -0.08, 0.02));
    p.push(rotY(gable(0.36, 0.12, 0.52, PAL.roofBlue, 0, Y0 + 0.28, -0.08), Math.PI / 2));
    for (const x of [-0.16, -0.055, 0.055, 0.16]) p.push(cyl(0.018, 0.02, 0.22, PAL.white, x, Y0 + 0.06, 0.1, 12));
    p.push(rbox(0.46, 0.03, 0.06, PAL.white, 0, Y0 + 0.27, 0.1, 0.01), door(0, Y0 + 0.06, 0.072, PAL.roofBlue));
    p.push(...windowAt(-0.12, Y0 + 0.14, 0.072), ...windowAt(0.12, Y0 + 0.14, 0.072));
    p.push(bench(-0.25, 0.3), ...pot(0.3, 0.3), ...bush(0.18, 0.32), ...lollipopTree(-0.34, -0.3, 0.8));
    return p;
  },
  theatre: () => {
    const p = [plinth(PAL.paving)];
    p.push(rbox(0.46, 0.24, 0.3, '#efe0f5', 0, Y0, -0.1, 0.025), dome(0.16, PAL.roofPurple, 0, Y0 + 0.24, -0.12));
    p.push(rbox(0.5, 0.06, 0.08, PAL.roofPurple, 0, Y0 + 0.2, 0.08, 0.02));
    for (let i = 0; i < 6; i++) p.push(sph(0.012, '#ffe7a3', -0.2 + i * 0.08, Y0 + 0.23, 0.125));
    p.push(rbox(0.22, 0.16, 0.014, PAL.roofRed, 0, Y0, 0.052, 0.008), rbox(0.012, 0.16, 0.016, PAL.gold, -0.115, Y0, 0.054, 0.004), rbox(0.012, 0.16, 0.016, PAL.gold, 0.115, Y0, 0.054, 0.004));
    p.push(rbox(0.05, 0.16, 0.012, PAL.white, -0.3, Y0, 0.25, 0.006), rbox(0.04, 0.1, 0.014, PAL.roofPurple, -0.3, Y0 + 0.04, 0.257, 0.006));
    p.push(...lamp(0.28, 0.25), ...lamp(-0.18, 0.25), ...bush(0.3, -0.3));
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
  harbor: () => {
    const p = [plinth('#f2dfb4')];
    for (let i = 0; i < 6; i++) p.push(rbox(0.26, 0.025, 0.06, i % 2 ? PAL.wood : '#c48a58', 0.18, Y0 - 0.01, -0.36 + i * 0.07, 0.006));
    for (const z of [-0.38, 0.0]) for (const x of [0.07, 0.29]) p.push(cyl(0.015, 0.015, 0.12, PAL.woodDark, x, -0.05, z, 8));
    p.push(rbox(0.05, 0.36, 0.05, PAL.gold, -0.22, Y0, -0.2, 0.012), rbox(0.34, 0.04, 0.04, PAL.gold, -0.09, Y0 + 0.34, -0.2, 0.012), cyl(0.004, 0.004, 0.12, PAL.ink, 0.06, Y0 + 0.22, -0.2, 6));
    p.push(crate(-0.25, 0.1, PAL.roofBlue, 0.07), crate(-0.17, 0.1, PAL.roofRed, 0.07), crate(-0.21, 0.1, PAL.gold, 0.07));
    p[p.length - 1].position.y += 0.07;
    const boat = group(rbox(0.12, 0.05, 0.2, PAL.white, 0, 0, 0, 0.03), rbox(0.06, 0.05, 0.06, PAL.roofBlue, 0, 0.05, -0.03, 0.012));
    boat.position.set(0.2, Y0 + 0.01, 0.25); p.push(anim(boat, { type: 'bob', amp: 0.012, speed: 1.6 }), flag(PAL.roofRed, 0.08, Y0, -0.36, 0.26));
    p.push(...lamp(0.03, 0.3));
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
    p.push(rbox(0.12, 0.12, 0.12, PAL.white, 0, Y0 + 0.07, 0, 0.015), cyl(0.03, 0.045, 0.28, PAL.cream, 0, Y0 + 0.19, 0, 4), sph(0.045, PAL.gold, 0, Y0 + 0.51, 0));
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
    p.push(...lollipopTree(-0.38, 0.35, 0.8), ...lollipopTree(0.38, 0.35, 0.8), bench(0, 0.36));
    return p;
  },
  observatory: () => {
    const p = [plinth(PAL.stoneLight, 0.94, 0.94)];
    p.push(cyl(0.28, 0.3, 0.26, PAL.white, 0, Y0, 0, 28), torus(0.285, 0.012, PAL.roofBlue, 0, Y0 + 0.13, 0));
    const d = dome(0.28, '#eef3f8', 0, Y0 + 0.26, 0); p.push(d);
    const slit = rbox(0.07, 0.3, 0.06, PAL.glass, 0.12, Y0 + 0.28, 0.1, 0.02); slit.rotation.z = -0.5; p.push(slit);
    const scope = cyl(0.035, 0.045, 0.24, PAL.steelDark, 0.2, Y0 + 0.42, 0.12, 12); scope.rotation.z = -0.9; p.push(scope);
    p.push(door(0, Y0, 0.295, PAL.roofBlue), ...lamp(0.36, 0.36), ...lamp(-0.36, 0.36));
    return p;
  },
  amphitheatre: () => {
    const p = [plinth(PAL.paving, 0.94, 0.94)];
    for (let i = 0; i < 4; i++) {
      const ring = place(cached(`amph${i}`, () => new THREE.CylinderGeometry(0.42 - i * 0.06, 0.43 - i * 0.06, 0.06, 32, 1, false, Math.PI * 0.15, Math.PI * 1.2)), i % 2 ? '#e7d3f0' : PAL.roofPurple, 0, Y0 + 0.03 + i * 0.06, 0);
      ring.rotation.y = Math.PI; p.push(ring);
    }
    p.push(cyl(0.16, 0.16, 0.03, PAL.cream, 0, Y0, 0.08, 24), rbox(0.24, 0.16, 0.04, PAL.roofRed, 0, Y0, 0.3, 0.012));
    for (let i = 0; i < 5; i++) p.push(cyl(0.012, 0.014, 0.2, PAL.white, -0.16 + i * 0.08, Y0, 0.33, 10));
    return p;
  },
  exchange: () => {
    const p = [plinth(PAL.paving, 0.94, 0.94)];
    p.push(rbox(0.76, 0.08, 0.6, PAL.creamDark, 0, Y0, -0.04, 0.02), rbox(0.64, 0.28, 0.44, PAL.white, 0, Y0 + 0.08, -0.06, 0.025));
    for (let i = 0; i < 6; i++) p.push(cyl(0.024, 0.026, 0.28, PAL.white, -0.26 + i * 0.104, Y0 + 0.08, 0.2, 12));
    p.push(rotY(gable(0.74, 0.16, 0.56, PAL.gold, 0, Y0 + 0.36, -0.04), 0));
    p.push(cyl(0.05, 0.05, 0.012, PAL.gold, 0, Y0 + 0.43, 0.25, 20));
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
  forge: () => {
    const p = [plinth(PAL.stoneLight)];
    p.push(rbox(0.4, 0.22, 0.3, PAL.stone, -0.1, Y0, -0.1, 0.03), rotY(gable(0.46, 0.12, 0.34, PAL.terracottaDark, -0.1, Y0 + 0.22, -0.1), 0));
    p.push(rbox(0.07, 0.34, 0.07, PAL.stone, 0.06, Y0 + 0.08, -0.18, 0.015), smoke(0.07, Y0 + 0.44, -0.18, 1.3));
    p.push(rbox(0.14, 0.12, 0.014, '#ff9a3c', -0.1, Y0, 0.052, 0.01));
    p.push(rbox(0.1, 0.05, 0.06, PAL.ink, 0.22, Y0 + 0.06, 0.2, 0.012), rbox(0.05, 0.06, 0.05, PAL.ink, 0.22, Y0, 0.2, 0.01));
    p.push(...[0, 1, 2].map((i) => rbox(0.03, 0.03, 0.14, PAL.steelDark, -0.3 + i * 0.05, Y0, 0.25, 0.008)));
    p.push(rbox(0.1, 0.1, 0.1, PAL.wood, 0.3, Y0, -0.3, 0.015));
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
    p.push(bench(-0.1, 0.45), bench(0.15, 0.45), ...lamp(-0.4, 0.2), ...lamp(0.35, 0.2));
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
    p.push(...lamp(-0.3, 0.2), ...lamp(0.3, 0.2), bench(0, 0.6));
    return p;
  },
  merchantquarter: () => {
    const p = [rbox(1.86, 0.07, 1.86, PAL.paving, 0, 0, 0, 0.04)];
    const shops = [[-0.5, -0.5, PAL.roofGreen, '#f3d9c4'], [0.45, -0.5, PAL.roofRed, PAL.cream], [-0.5, 0.45, PAL.roofBlue, '#dfe9f2'], [0.45, 0.45, PAL.gold, '#f5e3a8']];
    for (const [x, z, roof, wall] of shops) {
      p.push(...shop({ w: 0.6, h: 0.28 + (x > 0 ? 0.06 : 0), d: 0.5, wall, roof, x, z: z - 0.05 }));
      p.push(...awning(0.6, [roof, PAL.white], x, Y0 + 0.22, z + 0.2), rbox(0.3, 0.14, 0.012, PAL.glassLight, x, Y0 + 0.02, z + 0.205, 0.006));
    }
    p.push(cyl(0.12, 0.14, 0.04, PAL.stoneLight, 0, Y0, 0, 20), cyl(0.03, 0.03, 0.12, PAL.stoneLight, 0, Y0 + 0.04, 0, 10), sph(0.05, PAL.water, 0, Y0 + 0.17, 0));
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
  p.push(holder, cyl(0.006, 0.006, 0.28, PAL.ink, 0.32, Y0, 0.3, 6), rbox(0.09, 0.05, 0.008, { spices: '#e2573a', marble: '#cfc8bd', crystal: '#4cc3d9' }[lux] || PAL.gold, 0.365, Y0 + 0.22, 0.3, 0.004));
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
  const scope = cyl(0.018, 0.026, 0.16, PAL.steelDark, 0.3, Y0 + 0.12, 0.26, 10); scope.rotation.z = 0.7; p.push(cyl(0.006, 0.006, 0.12, PAL.ink, 0.3, Y0, 0.26, 6), scope);
  p.push(...lamp(-0.3, 0.28), bench(-0.12, 0.33), ...bush(0.33, -0.3));
  return p;
};
BUILDERS.workshop = () => { // Bâtisseur : atelier en pierre, grand pignon, établi, blocs taillés
  const p = [plinth(PAL.stoneLight)];
  p.push(rbox(0.46, 0.24, 0.32, PAL.stone, -0.04, Y0, -0.1, 0.03), rotY(gable(0.52, 0.16, 0.36, PAL.roofBlue, -0.04, Y0 + 0.24, -0.1), 0));
  p.push(rbox(0.16, 0.16, 0.014, PAL.woodDark, -0.04, Y0, 0.065, 0.008), rbox(0.05, 0.3, 0.05, PAL.brick, 0.13, Y0 + 0.2, -0.18, 0.01), smoke(0.13, Y0 + 0.52, -0.18, 1));
  p.push(rbox(0.2, 0.06, 0.08, PAL.wood, 0.24, Y0 + 0.05, 0.22, 0.01), rbox(0.012, 0.05, 0.012, PAL.woodDark, 0.16, Y0, 0.2, 0.003), rbox(0.012, 0.05, 0.012, PAL.woodDark, 0.32, Y0, 0.24, 0.003));
  p.push(rbox(0.04, 0.012, 0.012, PAL.steel, 0.22, Y0 + 0.115, 0.22, 0.003), cyl(0.006, 0.006, 0.06, PAL.woodDark, 0.27, Y0 + 0.11, 0.23, 6));
  for (const [x, z, h] of [[-0.3, 0.2, 0.07], [-0.22, 0.24, 0.07], [-0.26, 0.22, 0.07]]) p.push(rbox(0.08, h, 0.08, PAL.stoneLight, x, Y0 + (x === -0.26 ? 0.07 : 0), z, 0.012));
  p.push(rbox(0.12, 0.012, 0.08, PAL.gold, -0.04, Y0 + 0.2, 0.072, 0.004));
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
  p.push(cyl(0.012, 0.016, 0.08, PAL.woodDark, 0.2, Y0, 0.24, 8), sph(0.055, '#6fb3e0', 0.2, Y0 + 0.13, 0.24), torus(0.06, 0.005, PAL.gold, 0.2, Y0 + 0.13, 0.24));
  p.push(...lollipopTree(-0.32, 0.26, 0.8), ...lollipopTree(0.36, 0.3, 0.6));
  return p;
};

const NO_ROTATE = new Set(['harbor', 'lighthouse', 'campus', 'artsquarter', 'merchantquarter', 'outpost']);
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
    parts = [
      rbox(0.42, 0.08, 0.18, PAL.wood, 0, 0.02, 0, 0.04), rbox(0.36, 0.02, 0.14, '#d9a46a', 0, 0.1, 0, 0.01),
      cyl(0.008, 0.008, 0.36, PAL.woodDark, 0.02, 0.1, 0, 6), rbox(0.012, 0.22, 0.18, PAL.white, 0.03, 0.18, 0, 0.01),
      rbox(0.016, 0.06, 0.1, color, 0.035, 0.46, 0, 0.005), crate(0.13, 0, PAL.gold, 0.06), crate(-0.12, 0, color, 0.06),
    ];
    parts[parts.length - 1].position.y = 0.14; parts[parts.length - 2].position.y = 0.14;
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

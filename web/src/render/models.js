// Modèles 3D low-poly construits à partir de primitives : aucun asset externe, style épuré.
import * as THREE from 'three';

const mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...opts }));
  return mats.get(key);
}

function mesh(geo, color, x, y, z, opts) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const box = (w, h, d, c, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z);
const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y + h / 2, z);
const cone = (r, h, c, x = 0, y = 0, z = 0, seg = 4) => {
  const m = mesh(new THREE.ConeGeometry(r, h, seg), c, x, y + h / 2, z);
  if (seg === 4) m.rotation.y = Math.PI / 4;
  return m;
};
const sphere = (r, c, x = 0, y = 0, z = 0, half = false) =>
  mesh(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI), c, x, y, z);

const group = (...children) => { const g = new THREE.Group(); children.forEach((c) => g.add(c)); return g; };
const WALL = '#f6f3ec';

function house(roof, x, z, s = 1) {
  return group(box(0.15 * s, 0.13 * s, 0.15 * s, WALL, x, 0, z), cone(0.135 * s, 0.11 * s, roof, x, 0.13 * s, z));
}

function flag(color, x, y, z, h = 0.35) {
  return group(cyl(0.008, 0.008, h, '#5b5b5b', x, y, z, 5), box(0.12, 0.07, 0.01, color, x + 0.06, y + h - 0.08, z));
}

export function cityModel(color, pop, capital) {
  const g = group(box(0.84, 0.035, 0.84, '#e7e2d6'));
  const spots = [[-0.22, -0.22], [0.22, -0.2], [-0.2, 0.22], [0.24, 0.22], [0, -0.3], [-0.3, 0], [0.3, 0], [0, 0.3]];
  const n = Math.min(spots.length, 3 + pop);
  for (let i = 0; i < n; i++) g.add(house(color, spots[i][0], spots[i][1], 1 + (i % 3) * 0.12));
  if (capital) g.add(cyl(0.075, 0.09, 0.42, WALL, 0, 0.03, 0, 8), cone(0.1, 0.16, color, 0, 0.45, 0, 8), flag(color, 0, 0.6, 0, 0.25));
  else g.add(cyl(0.06, 0.07, 0.26, WALL, 0, 0.03, 0, 8), cone(0.08, 0.12, color, 0, 0.29, 0, 8));
  return g;
}

const BUILDERS = {
  farm: () => {
    const g = group(box(0.8, 0.025, 0.8, '#ecd277'));
    for (let i = -1; i <= 1; i++) g.add(box(0.8, 0.03, 0.06, '#d4b44c', 0, 0, i * 0.22));
    g.add(box(0.22, 0.16, 0.18, '#d8574d', 0.22, 0.02, -0.2), cone(0.17, 0.1, '#8c3b33', 0.22, 0.18, -0.2));
    return g;
  },
  lumber: () => group(
    box(0.26, 0.16, 0.2, '#9a6a3c', -0.12, 0, 0), cone(0.2, 0.1, '#6e4a29', -0.12, 0.16, 0),
    ...[0, 1, 2].map((i) => { const l = cyl(0.04, 0.04, 0.3, '#b98a55', 0.2, 0.04 + i * 0.075, 0.05, 7); l.rotation.x = Math.PI / 2; return l; }),
  ),
  quarry: () => group(
    box(0.7, 0.03, 0.7, '#c9c3b8'),
    box(0.2, 0.14, 0.2, '#9aa3ad', -0.15, 0.03, -0.1), box(0.16, 0.1, 0.16, '#b3bac2', 0.15, 0.03, 0.1),
    box(0.12, 0.08, 0.12, '#8a939d', 0.12, 0.03, -0.18), box(0.12, 0.08, 0.12, '#b3bac2', -0.15, 0.17, -0.1),
  ),
  market: () => group(
    box(0.76, 0.03, 0.76, '#ece6d8'),
    ...[['#ff6b4a', -0.2, -0.18], ['#f5b700', 0.2, -0.18], ['#3a9ff0', 0, 0.2]].map(([c, x, z]) =>
      group(box(0.2, 0.12, 0.16, WALL, x, 0.03, z), cone(0.16, 0.09, c, x, 0.15, z))),
  ),
  library: () => group(
    box(0.56, 0.05, 0.42, '#e3ddd0'), box(0.48, 0.24, 0.32, WALL, 0, 0.05, 0),
    ...[-0.18, -0.06, 0.06, 0.18].map((x) => cyl(0.02, 0.02, 0.24, '#ffffff', x, 0.05, 0.19, 6)),
    (() => { const r = cone(0.36, 0.14, '#3a9ff0', 0, 0.29, 0); r.scale.set(1, 1, 0.68); return r; })(),
  ),
  theatre: () => {
    const g = group(box(0.7, 0.03, 0.7, '#ece6d8'));
    const shell = mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.22, 16, 1, false, 0, Math.PI), '#bf5bd6', 0, 0.14, 0);
    g.add(shell, box(0.5, 0.05, 0.16, WALL, 0, 0.03, 0.12));
    return g;
  },
  lab: () => group(
    box(0.6, 0.03, 0.6, '#e3ddd0'), cyl(0.2, 0.22, 0.24, WALL, 0, 0.03, 0, 12), sphere(0.2, '#7cc4f5', 0, 0.27, 0, true),
    cyl(0.01, 0.01, 0.2, '#666', 0.16, 0.27, 0.12, 5), box(0.18, 0.14, 0.18, '#dfe6ee', -0.2, 0.03, 0.18),
  ),
  harbor: () => group(
    box(0.24, 0.05, 0.8, '#9a6a3c', 0, -0.02, 0.05), box(0.6, 0.05, 0.16, '#9a6a3c', 0, -0.02, 0.35),
    box(0.04, 0.4, 0.04, '#f5b700', 0.2, 0, 0.35), box(0.3, 0.04, 0.04, '#f5b700', 0.08, 0.38, 0.35),
    box(0.14, 0.1, 0.14, '#3a9ff0', -0.2, 0.03, 0.35),
  ),
  district: () => group(
    box(0.8, 0.03, 0.8, '#e3ddd0'),
    box(0.2, 0.42, 0.2, WALL, -0.18, 0.03, -0.15), box(0.22, 0.3, 0.22, '#e8edf2', 0.17, 0.03, -0.12),
    box(0.2, 0.24, 0.2, WALL, -0.05, 0.03, 0.2), box(0.21, 0.03, 0.21, '#f5b700', -0.18, 0.45, -0.15),
  ),
  monument: () => group(box(0.4, 0.06, 0.4, '#d9ccb0'), box(0.26, 0.05, 0.26, '#e6dcc4', 0, 0.06, 0),
    (() => { const o = cyl(0.04, 0.08, 0.6, '#efe6cf', 0, 0.11, 0, 4); o.rotation.y = Math.PI / 4; return o; })(),
    cone(0.06, 0.08, '#f5b700', 0, 0.71, 0)),
  lighthouse: () => group(
    box(0.7, 0.06, 0.7, '#d9ccb0'), cyl(0.12, 0.18, 0.3, WALL, 0, 0.06, 0, 10), cyl(0.11, 0.12, 0.25, '#e8574d', 0, 0.36, 0, 10),
    cyl(0.1, 0.11, 0.2, WALL, 0, 0.61, 0, 10), sphere(0.09, '#ffd75e', 0, 0.86, 0), cone(0.12, 0.12, '#e8574d', 0, 0.92, 0, 10),
  ),
  grandlibrary: () => group(
    box(0.84, 0.06, 0.84, '#e3ddd0'), box(0.7, 0.3, 0.5, WALL, 0, 0.06, 0),
    ...[-0.27, -0.13, 0, 0.13, 0.27].map((x) => cyl(0.025, 0.025, 0.3, '#ffffff', x, 0.06, 0.28, 6)),
    cyl(0.18, 0.2, 0.1, WALL, 0, 0.36, 0, 14), sphere(0.18, '#3a9ff0', 0, 0.46, 0, true),
  ),
  observatory: () => group(
    box(0.8, 0.06, 0.8, '#d9d4cc'), cyl(0.3, 0.32, 0.3, WALL, 0, 0.06, 0, 16), sphere(0.3, '#e9eef5', 0, 0.36, 0, true),
    box(0.06, 0.32, 0.5, '#3a4a5c', 0, 0.36, 0.02), cyl(0.04, 0.04, 0.4, '#8a97a5', 0.32, 0.06, 0.32, 6),
  ),
  amphitheatre: () => {
    const g = group(box(0.86, 0.04, 0.86, '#e6dcc4'));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.4 - i * 0.07, 0.42 - i * 0.07, 0.1, 20, 1, true, 0, Math.PI * 1.3), i % 2 ? '#d9a5e6' : '#bf5bd6', 0, 0.09 + i * 0.1, 0));
    g.add(box(0.3, 0.05, 0.14, WALL, 0, 0.04, 0.1));
    return g;
  },
  exchange: () => group(
    box(0.86, 0.08, 0.7, '#e6dcc4'), box(0.7, 0.28, 0.5, WALL, 0, 0.08, 0),
    ...[-0.3, -0.15, 0, 0.15, 0.3].map((x) => cyl(0.03, 0.03, 0.28, '#ffffff', x, 0.08, 0.3, 6)),
    (() => { const r = cone(0.52, 0.18, '#e8a813', 0, 0.36, 0); r.scale.set(1, 1, 0.75); return r; })(),
  ),
  nations: () => group(
    box(0.86, 0.06, 0.86, '#e3ddd0'), box(0.62, 0.26, 0.42, WALL, 0, 0.06, 0), cyl(0.16, 0.18, 0.14, WALL, 0, 0.32, 0, 14),
    sphere(0.16, '#14b8a6', 0, 0.46, 0, true),
    ...['#ff6b4a', '#8b5cf6', '#f5b700', '#14b8a6'].map((c, i) => flag(c, -0.33 + i * 0.22, 0.06, 0.34, 0.3)),
  ),
};

export function buildingModel(type, wip) {
  const g = (BUILDERS[type] || BUILDERS.market)();
  if (wip) {
    g.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.4; o.castShadow = false; }
    });
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, 0.5, 0.8)), new THREE.LineBasicMaterial({ color: '#f5b700' }));
    frame.position.y = 0.25;
    g.add(frame);
  }
  return g;
}

export function unitModel(type, color) {
  let g;
  if (type === 'explorer') {
    g = group(cyl(0.07, 0.1, 0.22, color, 0, 0, 0, 8), sphere(0.065, '#f3d9c0', 0, 0.28, 0), cone(0.09, 0.07, '#8a6a3c', 0, 0.32, 0, 8), flag(color, 0.1, 0, 0, 0.42));
  } else if (type === 'settler') {
    g = group(box(0.34, 0.1, 0.22, '#9a6a3c', 0, 0.06, 0), cyl(0.12, 0.12, 0.3, WALL, 0, 0.13, 0, 10), flag(color, -0.18, 0.06, 0, 0.36));
    g.children[1].rotation.z = Math.PI / 2; g.children[1].position.y = 0.2; g.children[1].scale.set(1, 1, 0.9);
    for (const [x, z] of [[-0.11, 0.12], [0.11, 0.12], [-0.11, -0.12], [0.11, -0.12]]) {
      const w = cyl(0.05, 0.05, 0.03, '#4a3a2a', x, 0.0, z, 10); w.rotation.x = Math.PI / 2; w.position.y = 0.05; g.add(w);
    }
  } else {
    g = group(box(0.36, 0.08, 0.22, '#7a5230', 0, 0.06, 0), box(0.14, 0.12, 0.16, color, -0.08, 0.14, 0), box(0.1, 0.1, 0.12, '#e8a813', 0.1, 0.14, 0));
    for (const [x, z] of [[-0.12, 0.12], [0.12, 0.12], [-0.12, -0.12], [0.12, -0.12]]) {
      const w = cyl(0.05, 0.05, 0.03, '#3a2a1a', x, 0, z, 10); w.rotation.x = Math.PI / 2; w.position.y = 0.05; g.add(w);
    }
  }
  const base = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.01;
  g.add(base);
  return g;
}

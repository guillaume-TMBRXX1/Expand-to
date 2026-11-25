// Planche « quartiers conseillés » : chaque quartier posé sur un petit plateau avec les vrais modèles du jeu.
// Les bonus affichés sont calculés par le moteur (adjacencyBonus) : ils restent exacts si les règles changent.
// Usage : quartiers.html?q=savant (savant, culture, marchand, bois, pierre, grenier, residentiel) ; &capture pour une image propre.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import * as G from './core/game.js';
import { buildingModel, cityModel, prepareAnims } from './render/models.js';

// Plans : terrain (une lettre par case), cases de rivière, ville, bâtiments [type, x, y].
// p plaine · g prairie · f forêt · h colline · M montagne · s plage · w lagune · o océan
const PLANS = {
  savant: { title: 'Pôle savant', sub: "Un Campus 2×2 au cœur, entouré de Laboratoires et de Bibliothèques : chacun se renforce l'un l'autre.",
    map: ['gggggg', 'gppppg', 'gppppg', 'gppppg', 'gppppg', 'gggggg'],
    buildings: [['campus', 2, 2], ['lab', 1, 2], ['lab', 4, 3], ['library', 2, 1], ['library', 3, 4], ['library', 1, 3], ['academy', 4, 2]] },
  culture: { title: 'Pôle culturel', sub: "Un Quartier des arts 2×2 avec le Théâtre, le Monument et des merveilles autour.",
    map: ['gggggg', 'gppppg', 'gppppg', 'gppppg', 'gppppg', 'gggggg'],
    buildings: [['artsquarter', 2, 2], ['theatre', 1, 2], ['monument', 1, 3], ['amphitheatre', 4, 2], ['granddome', 1, 4], ['museum', 4, 3]] },
  marchand: { title: 'Pôle marchand', sub: 'Des Marchés collés à la ville, le Port sur la côte, un Quartier marchand 2×2 au milieu, la Halle et la Maison des Guildes à côté.',
    map: ['oossppg', 'oossppg', 'oossppg', 'oossppg', 'oossppg', 'oossppg'],
    city: [3, 1], buildings: [['harbor', 2, 2], ['market', 3, 2], ['market', 4, 1], ['merchantquarter', 4, 2], ['markethall', 6, 3], ['guildhall', 3, 3]] },
  bois: { title: 'Pôle bois', sub: 'La Scierie au milieu des forêts, la Menuiserie contre elle, le Moulin à eau sur la rivière contre la Menuiserie et une ferme.',
    map: ['fffggg', 'fffggg', 'fffppg', 'fffppg', 'gggppg', 'gggggg'],
    river: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5]],
    buildings: [['lumber', 1, 2], ['sawmill', 2, 3], ['watermill', 3, 3], ['farm', 4, 3], ['farm', 4, 2]] },
  pierre: { title: 'Pôle pierre', sub: "La Carrière sur une colline cernée de montagnes, la Forge contre elle, l'Atelier des maîtres (Bâtisseur) contre les deux.",
    map: ['MMMhgg', 'MMhhgg', 'Mhhhpg', 'hhhppg', 'gggppg', 'gggggg'],
    buildings: [['quarry', 2, 1], ['forge', 3, 2], ['workshop', 2, 2], ['quarry', 1, 2]] },
  grenier: { title: 'Grenier', sub: 'Des Fermes en grappe, un Moulin à eau sur la rivière au milieu, la Manufacture contre une ferme.',
    map: ['gggggg', 'gppppg', 'gppppg', 'gppppg', 'gppppg', 'gggggg'],
    river: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5]],
    buildings: [['farm', 2, 1], ['farm', 2, 2], ['farm', 2, 3], ['watermill', 3, 2], ['farm', 4, 1], ['farm', 4, 2], ['manufactory', 1, 2], ['granary', 4, 3]] },
  residentiel: { title: 'Ville résidentielle', sub: 'Les Quartiers résidentiels groupés autour d\'un Marché collé à la ville (+3 population max chacun), un Parc pour l\'air pur.',
    map: ['gggggg', 'gppppg', 'gppppg', 'gppppg', 'gppppg', 'gggggg'],
    city: [2, 2], buildings: [['market', 3, 2], ['district', 3, 1], ['district', 4, 2], ['park', 1, 2], ['aqueduct', 2, 3], ['hospital', 3, 3]] },
};
const TERRAIN = { p: 'plains', g: 'grass', f: 'forest', h: 'hills', M: 'mountain', s: 'sand', w: 'water', o: 'deep' };

const params = new URLSearchParams(location.search);
const key = PLANS[params.get('q')] ? params.get('q') : 'savant';
if (params.has('capture')) document.body.classList.add('capture');
const plan = PLANS[key];

const files = ['terrain', 'resources', 'buildings', 'units', 'techs', 'profiles', 'rules', 'ai', 'events', 'policies'];
const raw = {};
await Promise.all(files.map(async (f) => { raw[f] = await (await fetch(`data/${f}.json`)).json(); }));
const data = G.indexData(raw);
const rules = G.gameRules(data, {});

// Mini-partie : juste ce qu'il faut au moteur pour calculer les adjacences.
const H = plan.map.length, W = plan.map[0].length;
const rivers = new Set((plan.river || []).map(([x, y]) => y * W + x));
const tiles = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles.push({ x, y, type: TERRAIN[plan.map[y][x]] || 'grass', owner: 0, cityId: 1, river: rivers.has(y * W + x), road: -1 });
const s = { data, rules, map: { width: W, height: H, tiles }, buildings: [], cities: [], players: [{ id: 0, profile: 'builder', techs: [], res: {}, policies: [] }], wonders: {}, settings: {} };
if (plan.city) s.cities.push({ id: 1, owner: 0, x: plan.city[0], y: plan.city[1], pop: 6, tier: 1, capital: true, name: 'Ville' });
plan.buildings.forEach(([type, x, y], k) => s.buildings.push({ id: k + 1, owner: 0, type, x, y, cityId: 1, turnsLeft: 0 }));

// ------------------------------------------------------------ scène
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#efe8e4');
scene.add(new THREE.HemisphereLight('#fff8f0', '#c9b8ad', 1.9));
const sun = new THREE.DirectionalLight('#fff1dc', 2.0);
sun.position.set(-6, 12, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); sun.shadow.normalBias = 0.02;
scene.add(sun);

const wx = (x) => x - W / 2 + 0.5, wz = (y) => y - H / 2 + 0.5;
const HEIGHT = { deep: 0.12, water: 0.16, sand: 0.26, plains: 0.3, grass: 0.3, forest: 0.32, hills: 0.42, mountain: 0.42, snow: 0.42 };
const tileGeo = new RoundedBoxGeometry(0.97, 1, 0.97, 1, 0.05);
const board = new THREE.Mesh(new RoundedBoxGeometry(W + 0.8, 0.4, H + 0.8, 3, 0.2), new THREE.MeshStandardMaterial({ color: '#e8ddd2', roughness: 0.9 }));
board.position.y = -0.2; board.receiveShadow = true; scene.add(board);
const heights = [];
for (const t of tiles) {
  const h = HEIGHT[t.type];
  heights.push(h);
  const m = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ color: data.terrain[t.type].color, roughness: 0.75 }));
  m.scale.y = h; m.position.set(wx(t.x), h / 2, wz(t.y)); m.receiveShadow = true; m.castShadow = true; scene.add(m);
  const occupied = s.buildings.some((b) => { const f = G.footprintOf(s, b.type); return t.x >= b.x && t.x < b.x + f && t.y >= b.y && t.y < b.y + f; }) || (plan.city && plan.city[0] === t.x && plan.city[1] === t.y);
  if (t.type === 'forest' && !occupied) for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + t.x, dx = Math.cos(a) * 0.22, dz = Math.sin(a) * 0.22;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.2, 8), new THREE.MeshStandardMaterial({ color: '#8a5634' }));
    trunk.position.set(wx(t.x) + dx, h + 0.1, wz(t.y) + dz); scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshStandardMaterial({ color: ['#86c96a', '#5fae5a', '#4f9e55'][k] }));
    crown.position.set(wx(t.x) + dx, h + 0.3, wz(t.y) + dz); crown.castShadow = true; scene.add(crown);
  }
  if (t.type === 'mountain' && !occupied) for (const [dx, dz, r, hh] of [[-0.12, -0.05, 0.3, 0.62], [0.18, 0.14, 0.22, 0.42]]) {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 7), new THREE.MeshStandardMaterial({ color: '#b3aaa0', roughness: 0.85, flatShading: true }));
    peak.position.set(wx(t.x) + dx, h + hh / 2, wz(t.y) + dz); peak.castShadow = true; scene.add(peak);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, hh * 0.38, 7), new THREE.MeshStandardMaterial({ color: '#fbfbfb', flatShading: true }));
    cap.position.set(wx(t.x) + dx, h + hh * 0.81, wz(t.y) + dz); scene.add(cap);
  }
  if (t.river) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 1.0), new THREE.MeshStandardMaterial({ color: '#7cc4e8', roughness: 0.2 }));
    strip.position.set(wx(t.x) + (occupied ? 0.36 : 0), h + 0.012, wz(t.y)); scene.add(strip);
  }
}

// Bâtiments et ville : un numéro sur la carte, et dans la légende le bonus calculé par le moteur avec les voisins qui le donnent.
const labels = [], legend = [];
const resColor = (k) => data.resources[k]?.color || '#888';
const fmt = (bonus) => Object.entries(bonus || {}).filter(([, v]) => v).map(([k, v]) => `<span class="dot" style="background:${resColor(k)}"></span>+${v} ${data.resources[k].name}`).join(' · ');
function addMarker(x, y, h, n, isCity) {
  const el = document.createElement('div'); el.className = `marker${isCity ? ' city' : ''}`; el.textContent = n;
  document.body.appendChild(el);
  labels.push({ el, pos: new THREE.Vector3(x, h, y) });
}
// Voisins qui comptent pour chaque règle d'adjacence (dans la limite du plafond).
function why(b) {
  const def = data.buildingsById[b.type], f = def.footprint || 1, out = [];
  const ring = [];
  for (let dy = -1; dy <= f; dy++) for (let dx = -1; dx <= f; dx++) { if (dx >= 0 && dx < f && dy >= 0 && dy < f) continue; const t = G.tileAt(s, b.x + dx, b.y + dy); if (t) ring.push(t); }
  if (G.footprintTiles(s, b.type, b.x, b.y).some((t) => t && t.river) && !def.wonder) out.push('rivière');
  for (const r of def.adjacency || []) {
    let names = [];
    if (r.terrain) { const list = [].concat(r.terrain); names = ring.filter((t) => list.includes(t.type)).map((t) => data.terrain[t.type].name.toLowerCase()); }
    else {
      const list = [].concat(r.near), seen = new Set();
      for (const t of ring) {
        const c = G.cityAt(s, t.x, t.y);
        if (c && list.includes('city')) { names.push('ville'); continue; }
        const o = G.buildingAt(s, t.x, t.y);
        if (!o || o === b || seen.has(o.id)) continue;
        const od = data.buildingsById[o.type];
        if (list.includes(o.type) || (od.wonder && list.includes('wonder'))) { seen.add(o.id); names.push(od.name.toLowerCase()); }
      }
    }
    names = names.slice(0, r.max ?? Infinity);
    if (names.length) out.push(...names);
  }
  const counts = {};
  for (const n of out) counts[n] = (counts[n] || 0) + 1;
  return Object.entries(counts).map(([n, k]) => (k > 1 ? `${k} × ${n}` : n)).join(', ');
}
const totals = {};
let num = 0;
if (plan.city) {
  const [cx, cy] = plan.city, o = cityModel('#ff6b4a', 6, true, 1);
  o.position.set(wx(cx), heights[cy * W + cx], wz(cy)); o.traverse((m) => { if (m.isMesh) m.castShadow = true; }); scene.add(o);
  addMarker(wx(cx), wz(cy), heights[cy * W + cx] + 0.5, 'V', true);
  legend.push(`<div class="row"><span class="num city">V</span><div><b>Ville</b><div class="why">Centre de la ville : les Marchés, la Chancellerie et le Parc gagnent à la toucher.</div></div></div>`);
}
for (const b of s.buildings) {
  const def = data.buildingsById[b.type], f = def.footprint || 1;
  let top = 0;
  for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) top = Math.max(top, heights[(b.y + dy) * W + b.x + dx]);
  const o = buildingModel(b.type, false, undefined, (b.x * 7 + b.y * 3) % 12, 1, 0);
  o.position.set(wx(b.x) + (f - 1) / 2, top, wz(b.y) + (f - 1) / 2);
  o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  prepareAnims(o);
  scene.add(o);
  const adj = G.adjacencyBonus(s, 0, b.type, b.x, b.y);
  for (const [k, v] of Object.entries(adj)) if (v) totals[k] = (totals[k] || 0) + v;
  num++;
  addMarker(wx(b.x) + (f - 1) / 2, wz(b.y) + (f - 1) / 2, top + (f > 1 ? 0.62 : def.wonder ? 0.62 : 0.42), num, false);
  const w = why(b), bonus = fmt(adj);
  legend.push(`<div class="row"><span class="num">${num}</span><div><b>${def.name}</b>${bonus ? `<span class="bonus">${bonus}</span>` : ''}<div class="why">${bonus ? `grâce à : ${w}` : (def.adjacency ? 'pas de voisin utile ici' : def.wonder ? 'merveille : pas de bonus propre, mais elle compte comme voisine pour le Théâtre, le Monument et le Quartier des arts' : `pas de bonus d'adjacence · ${def.desc}`)}</div></div></div>`);
}
document.getElementById('legend').innerHTML = legend.join('');

document.getElementById('title').innerHTML = `${plan.title} <span>· Expand-to</span>`;
document.getElementById('sub').textContent = plan.sub;
const tot = Object.entries(totals).filter(([, v]) => v);
document.getElementById('total').innerHTML = `Total des bonus d'adjacence : ${tot.length ? fmt(totals) : 'aucun'}`;
document.getElementById('nav').innerHTML = Object.entries(PLANS).map(([k, p]) => `<a href="?q=${k}">${p.title}</a>`).join('');

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(9, 9.5, 9); camera.lookAt(0, 0, 0);
// Cadrage : le losange du plateau tient entièrement dans la vue, avec une marge.
function resize() {
  const w = view.clientWidth, h = view.clientHeight, a = w / h;
  renderer.setSize(w, h);
  const halfW = (W + H + 0.8) * 0.3536 + 0.5, halfH = (W + H + 0.8) * 0.3536 * 0.58 + 0.9;
  const sx = Math.max(halfW, halfH * a), sy = sx / a;
  camera.left = -sx; camera.right = sx; camera.top = sy + 0.35; camera.bottom = -sy + 0.35;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const v = new THREE.Vector3();
function frame() {
  renderer.render(scene, camera);
  const r = view.getBoundingClientRect();
  for (const l of labels) { v.copy(l.pos).project(camera); l.el.style.left = `${r.left + (v.x + 1) / 2 * r.width}px`; l.el.style.top = `${r.top + (1 - v.y) / 2 * r.height}px`; }
}
renderer.setAnimationLoop(frame);
window.__quarterReady = true;

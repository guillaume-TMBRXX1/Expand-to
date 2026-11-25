// Galerie de modèles : sert de planche de style pour itérer sur le design.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { buildingModel, cityModel, unitModel, luxuryModel, naturalModel, ruinModel, prepareAnims, animateParts } from './render/models.js';
import { avatarSVG } from './ui/avatar.js';

const COLORS = ['#ff6b4a', '#8b5cf6', '#f5b700', '#14b8a6', '#ec4899'];
const items = [
  ['Village', () => cityModel(COLORS[1], 2, false)], ['Ville (palissade)', () => cityModel(COLORS[0], 4, true)], ['Bourg (Artisans)', () => cityModel(COLORS[2], 5, false, 1)], ['Cité (Savants)', () => cityModel(COLORS[3], 8, true, 2)],
  ...['farm', 'lumber', 'quarry', 'market', 'library', 'theatre', 'lab', 'harbor', 'district', 'monument', 'sawmill', 'manufactory', 'forge', 'markethall'].map((t) => [t, () => buildingModel(t, false)]),
  ['Comptoir (épices)', () => buildingModel('outpost', false, 'spices')], ['Comptoir (cristal)', () => buildingModel('outpost', false, 'crystal')],
  ...[['furs', 'Fourrures'], ['crystal', 'Cristal'], ['marble', 'Marbre'], ['wine', 'Vin'], ['silk', 'Soie'], ['pearls', 'Perles'], ['salt', 'Sel'], ['spices', 'Épices'], ['incense', 'Encens']].map(([id, n]) => [n, () => luxuryModel(id)]),
  ['Moulin à eau', () => buildingModel('watermill', false)], ['Parc', () => buildingModel('park', false)], ['Aqueduc', () => buildingModel('aqueduct', false)], ['Hôpital', () => buildingModel('hospital', false)], ['Grenier', () => buildingModel('granary', false)], ['Digue', () => buildingModel('levee', false)],
  ...['campus', 'artsquarter', 'merchantquarter'].map((t) => [t, () => { const g = buildingModel(t, false); g.scale.setScalar(0.5); const w = new THREE.Group(); w.add(g); return w; }]),
  ...['lighthouse', 'grandlibrary', 'observatory', 'amphitheatre', 'exchange', 'nations'].map((t) => [t, () => buildingModel(t, false)]),
  ['Chantier', () => buildingModel('market', true)],
  ...['guildhall', 'academy', 'workshop', 'chancery', 'lodge'].map((t) => [t, () => buildingModel(t, false)]),
  ...[['falls', 'Grandes Chutes'], ['volcano', 'Mont Braise'], ['reef', 'Récif de corail'], ['greattree', 'Arbre millénaire'], ['canyon', 'Canyon rouge'], ['oasis', 'Oasis']].map(([id, n]) => [n, () => naturalModel(id)]),
  ['Ruines', () => ruinModel()],
  ['Explorateur', () => { const u = unitModel('explorer', COLORS[0], 0); u.getObjectByName('ready').visible = true; return u; }], ['Colon', () => unitModel('settler', COLORS[2], 1)], ['Caravane', () => unitModel('caravan', COLORS[3], 2)],
  ['Ingénieur', () => unitModel('engineer', COLORS[1], 3)], ['Émissaire', () => unitModel('emissary', COLORS[4], 0)], ['Navire', () => unitModel('ship', COLORS[0], 0)], ['Dirigeable', () => unitModel('airship', COLORS[2], 0)],
];
const NAMES = { farm: 'Ferme', lumber: 'Scierie', quarry: 'Carrière', market: 'Marché', library: 'Bibliothèque', theatre: 'Théâtre', lab: 'Laboratoire', harbor: 'Port', district: 'Quartier', monument: 'Monument', sawmill: 'Menuiserie', manufactory: 'Manufacture', forge: 'Forge', markethall: 'Halle marchande', campus: 'Campus (2×2)', artsquarter: 'Quartier des arts (2×2)', merchantquarter: 'Quartier marchand (2×2)', lighthouse: 'Grand Phare', grandlibrary: 'Grande Bibliothèque', observatory: 'Observatoire', amphitheatre: 'Amphithéâtre', exchange: 'Grande Bourse', nations: 'Palais des Nations', guildhall: 'Maison des Guildes', academy: 'Académie royale', workshop: 'Atelier des maîtres', chancery: 'Chancellerie', lodge: 'Relais des cartographes' };

// ?only=forge,quarry : n'affiche que ces modèles (clé ou nom affiché), en grand.
const only = new URLSearchParams(location.search).get('only')?.split(',').map((x) => x.trim().toLowerCase());
if (only) for (let i = items.length - 1; i >= 0; i--) if (!only.some((o) => items[i][0].toLowerCase() === o || (NAMES[items[i][0]] || '').toLowerCase() === o)) items.splice(i, 1);
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#efe8e4');
scene.add(new THREE.HemisphereLight('#fff8f0', '#c9b8ad', 1.9));
const sun = new THREE.DirectionalLight('#fff1dc', 2.0);
sun.position.set(-8, 14, 9); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
sun.shadow.normalBias = 0.02;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.12 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// Grille : la vue isométrique écrase la profondeur, les rangées sont donc plus espacées que les colonnes.
// Le nombre de colonnes s'adapte au format de l'écran (iPad en paysage, ordinateur, téléphone).
const gap = 1.45, rowGap = 2.1;
const R = new THREE.Vector3(1, 0, -1).normalize(), D = new THREE.Vector3(1, 0, 1).normalize();
const ROW_SCREEN = rowGap * Math.sin(Math.atan(1 / Math.SQRT2)); // pas vertical d'une rangée, à l'écran
const models = items.map(([name, make]) => {
  const m = make();
  const isUnit = /Explorateur|Colon|Caravane|Ingénieur|Émissaire|Navire|Dirigeable/.test(name);
  m.scale.setScalar(isUnit ? 1.7 : 1.15);
  scene.add(m);
  const el = document.createElement('div'); el.className = 'label'; el.textContent = NAMES[name] || name; document.body.appendChild(el);
  return { m, el, anims: prepareAnims(m), pos: new THREE.Vector3() };
});
let cols = 1, rows = 1;
function layout() {
  const n = models.length, aspect = innerWidth / Math.max(1, innerHeight - 80);
  cols = Math.max(1, Math.min(only ? 3 : 10, n, Math.round(Math.sqrt((n * aspect * ROW_SCREEN) / gap))));
  rows = Math.ceil(n / cols);
  models.forEach((o, i) => {
    const at = R.clone().multiplyScalar((i % cols - (cols - 1) / 2) * gap).add(D.clone().multiplyScalar((Math.floor(i / cols) - (rows - 1) / 2) * rowGap));
    o.m.position.set(at.x, 0, at.z);
    o.pos.set(at.x, 0, at.z).add(D.clone().multiplyScalar(0.7));
    o.m.userData.base = o.m.position.clone();
  });
}

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(10, 10, 10); camera.zoom = 1;
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0); controls.enableDamping = true;
function resize() {
  layout();
  const w = innerWidth, h = innerHeight;
  const halfW = (cols * gap) / 2 + 0.3, halfH = (rows * ROW_SCREEN) / 2 + 0.45;
  const s = Math.max(halfH * (h / Math.max(1, h - 80)), (halfW * h) / w);
  renderer.setSize(w, h);
  camera.left = -s * w / h; camera.right = s * w / h; camera.top = s + s * 80 / h; camera.bottom = -s + s * 80 / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
// Les animations tournent aussi dans la galerie, sauf si le système demande moins d'animations.
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = new THREE.Clock();
let time = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta()); time += dt;
  if (!still) for (const o of models) animateParts(o.anims, time, dt);
  controls.update(); renderer.render(scene, camera);
  const v = new THREE.Vector3();
  for (const o of models) { v.copy(o.pos).project(camera); o.el.style.left = `${(v.x + 1) / 2 * innerWidth}px`; o.el.style.top = `${(1 - v.y) / 2 * innerHeight}px`; }
});
document.getElementById('avatars').innerHTML = ['merchant', 'scholar', 'builder', 'diplomat', 'explorer'].map((p, i) => avatarSVG({ color: COLORS[i], profile: p, skin: i, size: 52, title: p })).join('');

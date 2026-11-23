// Galerie de modèles : sert de planche de style pour itérer sur le design.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { buildingModel, cityModel, unitModel, luxuryModel, naturalModel, ruinModel } from './render/models.js';
import { avatarSVG } from './ui/avatar.js';

const COLORS = ['#ff6b4a', '#8b5cf6', '#f5b700', '#14b8a6', '#ec4899'];
const items = [
  ['Capitale', () => cityModel(COLORS[0], 4, true)], ['Ville', () => cityModel(COLORS[1], 2, false)],
  ...['farm', 'lumber', 'quarry', 'market', 'library', 'theatre', 'lab', 'harbor', 'district', 'monument', 'sawmill', 'manufactory', 'forge', 'markethall'].map((t) => [t, () => buildingModel(t, false)]),
  ['Comptoir (épices)', () => buildingModel('outpost', false, 'spices')], ['Comptoir (cristal)', () => buildingModel('outpost', false, 'crystal')],
  ['Épices', () => luxuryModel('spices')], ['Marbre', () => luxuryModel('marble')], ['Cristal', () => luxuryModel('crystal')],
  ...['campus', 'artsquarter', 'merchantquarter'].map((t) => [t, () => { const g = buildingModel(t, false); g.scale.setScalar(0.5); const w = new THREE.Group(); w.add(g); return w; }]),
  ...['lighthouse', 'grandlibrary', 'observatory', 'amphitheatre', 'exchange', 'nations'].map((t) => [t, () => buildingModel(t, false)]),
  ['Chantier', () => buildingModel('market', true)],
  ...[['falls', 'Grandes Chutes'], ['volcano', 'Mont Braise'], ['reef', 'Récif de corail'], ['greattree', 'Arbre millénaire'], ['canyon', 'Canyon rouge'], ['oasis', 'Oasis']].map(([id, n]) => [n, () => naturalModel(id)]),
  ['Ruines', () => ruinModel()],
  ['Explorateur', () => unitModel('explorer', COLORS[0], 0)], ['Colon', () => unitModel('settler', COLORS[2], 1)], ['Caravane', () => unitModel('caravan', COLORS[3], 2)],
  ['Ingénieur', () => unitModel('engineer', COLORS[1], 3)], ['Émissaire', () => unitModel('emissary', COLORS[4], 0)], ['Navire', () => unitModel('ship', COLORS[0], 0)], ['Dirigeable', () => unitModel('airship', COLORS[2], 0)],
];
const NAMES = { farm: 'Ferme', lumber: 'Scierie', quarry: 'Carrière', market: 'Marché', library: 'Bibliothèque', theatre: 'Théâtre', lab: 'Laboratoire', harbor: 'Port', district: 'Quartier', monument: 'Monument', sawmill: 'Menuiserie', manufactory: 'Manufacture', forge: 'Forge', markethall: 'Halle marchande', campus: 'Campus (2×2)', artsquarter: 'Quartier des arts (2×2)', merchantquarter: 'Quartier marchand (2×2)', lighthouse: 'Grand Phare', grandlibrary: 'Grande Bibliothèque', observatory: 'Observatoire', amphitheatre: 'Amphithéâtre', exchange: 'Grande Bourse', nations: 'Palais des Nations' };

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

const cols = 9, gap = 1.45;
const R = new THREE.Vector3(1, 0, -1).normalize(), D = new THREE.Vector3(1, 0, 1).normalize();
const labels = [];
items.forEach(([name, make], i) => {
  const m = make();
  const rows = Math.ceil(items.length / cols);
  const at = R.clone().multiplyScalar((i % cols - (cols - 1) / 2) * gap).add(D.clone().multiplyScalar((Math.floor(i / cols) - (rows - 1) / 2) * gap * 1.25));
  const x = at.x, z = at.z;
  const isUnit = /Explorateur|Colon|Caravane|Ingénieur|Émissaire|Navire|Dirigeable/.test(name);
  m.scale.setScalar(isUnit ? 2.2 : 1.15);
  m.position.set(x, 0, z);
  scene.add(m);
  const el = document.createElement('div'); el.className = 'label'; el.textContent = NAMES[name] || name; document.body.appendChild(el);
  labels.push({ el, pos: new THREE.Vector3(x, 0, z).add(D.clone().multiplyScalar(0.72)) });
});

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(10, 10, 10); camera.zoom = 1;
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0); controls.enableDamping = true;
function resize() {
  const w = innerWidth, h = innerHeight, s = Math.max(4.4, 7.6 * h / w);
  renderer.setSize(w, h);
  camera.left = -s * w / h; camera.right = s * w / h; camera.top = s; camera.bottom = -s; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(() => {
  controls.update(); renderer.render(scene, camera);
  const v = new THREE.Vector3();
  for (const l of labels) { v.copy(l.pos).project(camera); l.el.style.left = `${(v.x + 1) / 2 * innerWidth}px`; l.el.style.top = `${(1 - v.y) / 2 * innerHeight}px`; }
});
document.getElementById('avatars').innerHTML = ['merchant', 'scholar', 'builder', 'diplomat', 'explorer'].map((p, i) => avatarSVG({ color: COLORS[i], profile: p, skin: i, size: 52, title: p })).join('');

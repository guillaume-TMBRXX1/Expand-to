// Villageois : petites figurines « toy » qui vont et viennent sur la carte (pur décor, aucune règle).
// Toute la population est dessinée par lots (un maillage instancié par pièce : ombre, corps, tête, chapeau,
// bras, accessoire), soit 6 appels de dessin pour toute la carte. Seules les figurines proches du point visé
// sont calculées et dessinées, et tout disparaît en vue d'ensemble.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { PAL } from './models.js';

const MAX = 700;          // plafond de figurines actives à l'écran
const Y_PLINTH = 0.07;    // dessus du socle d'un bâtiment ou d'une ville
const SCALE = 1.9;

// Métiers : tenue, chapeau, accessoire, vitesse. Le chapeau « player » prend la couleur du joueur.
const JOBS = {
  lumberjack: { body: '#c0392b', hat: '#3b3b44', acc: 'axe', speed: 0.22 },
  farmer: { body: '#4f86d9', hat: PAL.hay, acc: null, speed: 0.18 },
  worker: { body: '#f08a24', hat: PAL.gold, acc: null, speed: 0.22 },
  docker: { body: '#2f4a6d', hat: 'player', acc: 'crate', speed: 0.24 },
  tourist: { body: ['#ff8fab', '#5fd3c4', '#ffd166', '#a8e07a'], hat: '#fbf8f3', acc: 'backpack', speed: 0.2 },
  banker: { body: '#2b2b33', hat: '#1f1f24', acc: 'briefcase', speed: 0.26 },
  townsfolk: { body: ['#f3d9c4', '#dfe9f2', '#f5e3a8', '#e6dcf3', '#cfe6c0'], hat: 'player', acc: null, speed: 0.2 },
};
// Qui travaille où. Les autres bâtiments attirent des touristes ou des promeneurs.
const WORK = {
  lumber: 'lumberjack', farm: 'farmer', watermill: 'farmer', quarry: 'worker', forge: 'worker', sawmill: 'worker', manufactory: 'worker',
  workshop: 'worker', harbor: 'docker', lighthouse: 'docker', exchange: 'banker', markethall: 'banker', merchantquarter: 'banker', market: 'banker', guildhall: 'banker',
};
const TOURIST = new Set(['library', 'theatre', 'grandlibrary', 'observatory', 'amphitheatre', 'monument', 'park', 'artsquarter', 'nations', 'academy', 'campus', 'lab', 'hospital', 'aqueduct', 'chancery', 'lodge']);
const TRADING = new Set(['exchange', 'markethall', 'merchantquarter', 'guildhall']); // agitation pendant un krach

const hash = (a, b, c = 0) => (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) >>> 0) / 4294967296;

function geometries() {
  const body = new THREE.CapsuleGeometry(0.017, 0.032, 3, 8).translate(0, 0.041, 0);
  const head = new THREE.SphereGeometry(0.023, 10, 8).translate(0, 0.098, 0);
  const hat = mergeGeometries([
    new THREE.CylinderGeometry(0.029, 0.029, 0.004, 12).translate(0, 0.112, 0),
    new THREE.SphereGeometry(0.02, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.112, 0),
  ], false);
  // Bras : pivot à l'épaule (origine), ils pendent vers le bas ; une échelle y négative les lève.
  const arm = (x) => new THREE.CapsuleGeometry(0.0065, 0.024, 2, 6).translate(x, -0.018, 0);
  const arms = mergeGeometries([arm(-0.022), arm(0.022)], false);
  const acc = new THREE.BoxGeometry(1, 1, 1);
  const shadow = new THREE.CircleGeometry(0.026, 12).rotateX(-Math.PI / 2).translate(0, 0.002, 0);
  return { body, head, hat, arms, acc, shadow };
}
const ACC = { // accessoire : taille, décalage local, couleur
  backpack: { s: [0.026, 0.03, 0.014], o: [0, 0.052, -0.024], c: '#8a5634' },
  briefcase: { s: [0.024, 0.018, 0.008], o: [0.03, 0.022, 0], c: '#6b4226' },
  axe: { s: [0.006, 0.05, 0.006], o: [0.03, 0.04, 0.006], c: PAL.woodDark },
  crate: { s: [0.03, 0.026, 0.026], o: [0, 0.085, 0.018], c: PAL.wood },
  mask: { s: [0.036, 0.02, 0.01], o: [0, 0.09, 0.022], c: '#ffffff' },
  bucket: { s: [0.018, 0.018, 0.018], o: [0.03, 0.02, 0.012], c: '#5b8def' },
};
// Événements auxquels les villageois réagissent (durée : le tour de l'événement et les deux suivants).
const REACT = { storm: 'storm', fire: 'fire', flu: 'flu', harvest: 'fete', festival: 'fete' };
const REACT_TURNS = 2;
const MAX_FX = 400;

export class Villagers {
  constructor(renderer) {
    this.r = renderer;
    const g = geometries();
    const mk = (geo, opts = {}) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, ...opts }), MAX);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
      return m;
    };
    this.parts = {
      shadow: new THREE.InstancedMesh(g.shadow, new THREE.MeshBasicMaterial({ color: '#3a2a20', transparent: true, opacity: 0.18, depthWrite: false }), MAX),
      body: mk(g.body), head: mk(g.head), hat: mk(g.hat), arms: mk(g.arms), acc: mk(g.acc),
    };
    this.parts.shadow.count = 0; this.parts.shadow.frustumCulled = false; this.parts.shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group = new THREE.Group();
    this.group.add(...Object.values(this.parts));
    renderer.scene.add(this.group);
    this.list = [];
    // Effets des réactions : flammes, fumée, pluie, confettis (4 appels de dessin, seulement de près).
    const fx = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, MAX_FX); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); return m; };
    this.fx = {
      flame: fx(new THREE.ConeGeometry(0.05, 0.16, 7).translate(0, 0.08, 0), new THREE.MeshStandardMaterial({ color: '#ff8a3d', emissive: '#ff5a1f', emissiveIntensity: 0.9, roughness: 0.5 })),
      smoke: fx(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#6f6a66', roughness: 1, transparent: true, opacity: 0.6, depthWrite: false })),
      rain: fx(new THREE.BoxGeometry(0.004, 0.09, 0.004), new THREE.MeshBasicMaterial({ color: '#9fc3e6', transparent: true, opacity: 0.7, depthWrite: false })),
      confetti: fx(new THREE.PlaneGeometry(0.018, 0.012), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide })),
    };
    this.fx.confetti.setColorAt(0, new THREE.Color('#ffffff')); // couleurs par instance prêtes dès le premier rendu
    this.spots = { fire: [], storm: [], fete: [] };
    this.tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), a: new THREE.Matrix4(), b: new THREE.Matrix4(), w: new THREE.Matrix4(), c: new THREE.Color(), Y: new THREE.Vector3(0, 1, 0) };
  }

  // Hauteur du sol sous un point : dessus de la case, plus le socle s'il y a un bâtiment ou une ville.
  ground(x, z) {
    const R = this.r, tx = Math.round(x + R.W / 2 - 0.5), ty = Math.round(z + R.H / 2 - 0.5);
    if (tx < 0 || ty < 0 || tx >= R.W || ty >= R.H) return 0;
    const i = ty * R.W + tx;
    return R.heights[i] + (this.occupied?.has(i) ? Y_PLINTH : 0);
  }
  isWater(x, z) {
    const R = this.r, tx = Math.round(x + R.W / 2 - 0.5), ty = Math.round(z + R.H / 2 - 0.5);
    const t = R.state.map.tiles[ty * R.W + tx];
    return !t || R.state.data.terrain[t.type].water;
  }

  // Reconstruit la population à partir de l'état (après chaque changement : tour, construction, nouvelle ville).
  rebuild() {
    const R = this.r, s = R.state;
    if (!s) return;
    const W = R.W;
    this.occupied = new Set();
    for (const c of s.cities) this.occupied.add(c.y * W + c.x);
    for (const b of s.buildings) { const f = s.data.buildingsById[b.type].footprint || 1; for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) this.occupied.add((b.y + dy) * W + b.x + dx); }
    const list = [];
    const color = (job, k, owner) => { const j = JOBS[job]; const b = Array.isArray(j.body) ? j.body[k % j.body.length] : j.body; return { body: b, hat: j.hat === 'player' ? s.players[owner].color : j.hat }; };
    const addV = (job, owner, pts, k, opts = {}) => {
      if (pts.length < 2 || list.length >= MAX * 2) return;
      if (pts.some((p) => this.isWater(p.x, p.z))) return; // pas de promenade sur l'eau
      const segs = []; let L = 0;
      for (let n = 0; n < pts.length - 1; n++) { const d = Math.hypot(pts[n + 1].x - pts[n].x, pts[n + 1].z - pts[n].z); segs.push(d); L += d; }
      const j = JOBS[job];
      list.push({ job, owner, cityId: opts.cityId, pts, segs, L, loop: !!opts.loop, speed: (opts.speed || j.speed) * (0.85 + hash(k, owner, 3) * 0.3), pause: opts.pause ?? 1.2 + hash(k, owner, 5) * 1.5,
        phase: hash(k, owner, 7) * 40, skin: PAL.skin[Math.floor(hash(k, owner, 9) * PAL.skin.length)], ...color(job, k, owner), acc: j.acc, tile: opts.tile, trading: !!opts.trading, center: opts.center });
    };
    const P = (x, z) => ({ x, z });
    const cityOf = (b) => { let best = null, bd = 1e9; for (const c of s.cities) if (c.owner === b.owner) { const d = Math.abs(c.x - b.x) + Math.abs(c.y - b.y); if (d < bd) { bd = d; best = c; } } return bd <= 4 ? best : null; };
    s.buildings.forEach((b, k) => {
      if (b.turnsLeft > 0) return;
      const f = s.data.buildingsById[b.type].footprint || 1;
      const cx = R.wx(b.x) + (f - 1) / 2, cz = R.wz(b.y) + (f - 1) / 2, tile = b.y * W + b.x;
      const job = WORK[b.type];
      const h1 = hash(b.x, b.y, 1), h2 = hash(b.x, b.y, 2);
      const add0 = addV, cid = b.cityId ?? cityOf(b)?.id;
      const add = (j, o, pts, kk, opts = {}) => add0(j, o, pts, kk, { cityId: cid, ...opts }); // rattache la figurine à sa ville
      // Les trajets longent l'avant du socle (côté caméra) : les figurines ne traversent pas les bâtiments.
      const E = 0.37 * f + (f - 1) * 0.1, edge = (u) => (h1 < 0.5 ? P(cx - E + u * 2 * E, cz + E) : P(cx + E, cz + E - u * 2 * E));
      if (job) {
        // Un travailleur fait la navette le long de la cour (porte ↔ atelier, scierie ↔ grumes…).
        add(job, b.owner, [edge(0.08 + h2 * 0.2), edge(0.7 + h2 * 0.2)], k, { tile });
        if (job === 'banker') { const c = cityOf(b); if (c) add('banker', b.owner, [P(cx + E, cz + E), P(R.wx(c.x) + 0.34, R.wz(c.y) + 0.36)], k + 500, { tile, pause: 2 }); }
        if (job === 'farmer' || job === 'lumberjack') { const o = h1 < 0.5 ? P(cx + E, cz + E - 0.1) : P(cx - E + 0.1, cz + E); add(job, b.owner, [o, h1 < 0.5 ? P(cx + E, cz - E + 0.1) : P(cx + E - 0.1, cz + E)], k + 900, { tile }); }
      }
      if (TOURIST.has(b.type)) { // un touriste vient de la ville la plus proche, visite, et repart
        const c = cityOf(b);
        if (c) add('tourist', b.owner, [P(R.wx(c.x) + 0.36, R.wz(c.y) + 0.36), P(cx + 0.1, cz + E)], k, { tile, pause: 2.5 });
        else add('tourist', b.owner, [edge(0.1), edge(0.9)], k, { tile });
      }
      if (TRADING.has(b.type)) { // traders : en temps normal, ils discutent devant ; pendant un krach, ils courent partout
        for (let n = 0; n < 3; n++) {
          // boucle en zigzag sur le parvis avant (le long des deux bords visibles)
          const pts = []; for (let m = 0; m < 6; m++) { const u = (m + hash(b.x, b.y, 20 + n)) / 6, j = (hash(b.x + m, b.y, n) - 0.5) * 0.12; pts.push(u < 0.5 ? P(cx - E + u * 4 * E, cz + E + j) : P(cx + E + j, cz + E - (u - 0.5) * 4 * E)); }
          pts.push(pts[0]);
          add('banker', b.owner, pts, k * 7 + n, { tile, loop: true, trading: true, speed: 0.12, pause: 0, center: P(cx, cz) });
        }
      }
    });
    // Promeneurs : quelques habitants se baladent entre les maisons, d'autres vont vers un bâtiment voisin.
    s.cities.forEach((c, k) => {
      const cx = R.wx(c.x), cz = R.wz(c.y), tile = c.y * W + c.x;
      const n = Math.min(5, 2 + (c.tier || 0) + Math.floor(c.pop / 3));
      for (let m = 0; m < n; m++) {
        const a = hash(c.x, c.y, 40 + m) * Math.PI * 2;
        if (m % 2 === 0) addV('townsfolk', c.owner, m % 4 === 0 ? [P(cx - 0.3, cz + 0.36), P(cx + 0.36, cz + 0.36)] : [P(cx + 0.36, cz + 0.3), P(cx + 0.36, cz - 0.32)], k * 11 + m, { tile, cityId: c.id, pause: 0.8 + a * 0.2 });
        else {
          const nb = s.buildings.find((b) => b.owner === c.owner && Math.abs(b.x - c.x) + Math.abs(b.y - c.y) === m % 3 + 1 && b.turnsLeft <= 0);
          if (nb) addV('townsfolk', c.owner, [P(cx + 0.36, cz + 0.36), P(R.wx(nb.x) + 0.36, R.wz(nb.y) + 0.36)], k * 11 + m, { tile, cityId: c.id, pause: 1.8 });
        }
      }
    });
    this.applyReactions(list, addV, P);
    this.list = list;
  }

  // Événements récents et crises mondiales → réactions : panique sous la tempête, chaîne de seaux contre
  // l'incendie, rues plus vides et masques pendant une épidémie, ronde et confettis pour une fête.
  applyReactions(list, add, P) {
    const R = this.r, s = R.state, W = R.W;
    const cityKinds = new Map(), sick = new Set();
    const mark = (cid, kind) => { if (!cityKinds.has(cid)) cityKinds.set(cid, new Set()); cityKinds.get(cid).add(kind); };
    for (const e of s.eventLog || []) {
      const kind = REACT[e.ev];
      if (!kind || s.turn - e.turn > REACT_TURNS) continue;
      if (kind === 'flu') sick.add(e.pid); else mark(e.cityId, kind);
    }
    const cr = s.crisis, crisisOn = cr && (cr.status === 'open' || (cr.status === 'failed' && s.turn <= cr.until));
    this.crisisCrash = !!(crisisOn && cr.id === 'crash');
    const coastal = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = s.map.tiles[(c.y + dy) * W + c.x + dx]; return n && s.data.terrain[n.type].water; });
    if (crisisOn && cr.id === 'plague') for (const p of s.players) sick.add(p.id);
    if (crisisOn && cr.id === 'storms') for (const c of s.cities) if (coastal(c)) mark(c.id, 'storm');
    // Épidémie : une figurine sur deux reste chez elle (pas les travailleurs), les autres portent un masque.
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (!sick.has(v.owner)) continue;
      if ((v.job === 'townsfolk' || v.job === 'tourist') && Math.floor(v.phase) % 2 === 0) { list.splice(i, 1); continue; }
      if (v.job !== 'lumberjack' && v.job !== 'docker') v.acc = 'mask';
    }
    this.spots = { fire: [], storm: [], fete: [] };
    for (const [cid, kinds] of cityKinds) {
      const c = s.cities.find((x) => x.id === cid);
      if (!c) continue;
      const cx = R.wx(c.x), cz = R.wz(c.y), tile = c.y * W + c.x;
      if (kinds.has('storm')) { // tout le monde rentre en courant vers la ville, bras levés
        for (const v of list) if (v.cityId === cid && !v.loop) { v.pts = [v.pts[0], P(cx + 0.3, cz + 0.36)]; const d = Math.hypot(v.pts[1].x - v.pts[0].x, v.pts[1].z - v.pts[0].z); v.segs = [d]; v.L = d; v.panic = true; v.pause = 0.3; }
        this.spots.storm.push({ x: cx, z: cz, tile });
      }
      if (kinds.has('fire')) { // une chaîne de seaux devant la ville, et le feu dans un quartier
        for (let m = 0; m < 4; m++) { const x = cx - 0.4 + m * 0.12; add('townsfolk', c.owner, [P(x, cz + 0.44), P(x + 0.035, cz + 0.44)], 7000 + cid * 9 + m, { tile, cityId: cid, pause: 0.15, speed: 0.08 }); list[list.length - 1].acc = 'bucket'; list[list.length - 1].brigade = true; }
        this.spots.fire.push({ x: cx - 0.12, z: cz + 0.05, tile });
      }
      if (kinds.has('fete')) { // ronde de six habitants sur le parvis, et confettis
        const ox = cx - 0.2, oz = cz + 0.3, pts = [];
        for (let m = 0; m <= 12; m++) { const a = (m / 12) * Math.PI * 2; pts.push(P(ox + Math.cos(a) * 0.11, oz + Math.sin(a) * 0.11)); }
        for (let m = 0; m < 6; m++) { add('townsfolk', c.owner, pts, 8000 + cid * 7 + m, { tile, cityId: cid, loop: true, speed: 0.12, pause: 0 }); const v = list[list.length - 1]; v.phase = (m / 6) * v.L; v.dance = true; }
        this.spots.fete.push({ x: ox, z: oz, tile });
      }
    }
  }

  // Position et cap d'une figurine à l'instant t : aller-retour avec pauses aux deux bouts, ou boucle.
  pose(v, t, panic) {
    const speed = panic ? v.speed * 3.2 : v.speed;
    const pause = panic ? 0 : v.pause;
    let d, walking = true;
    if (v.loop) d = ((t * speed + v.phase) % v.L + v.L) % v.L;
    else {
      const T = 2 * v.L + 2 * pause * speed;
      let u = ((t * speed + v.phase) % T + T) % T;
      if (u < v.L) d = u;
      else if (u < v.L + pause * speed) { d = v.L; walking = false; }
      else if (u < 2 * v.L + pause * speed) d = 2 * v.L + pause * speed - u;
      else { d = 0; walking = false; }
    }
    let n = 0;
    while (n < v.segs.length - 1 && d > v.segs[n]) { d -= v.segs[n]; n++; }
    const a = v.pts[n], b = v.pts[n + 1], f = v.segs[n] ? Math.min(1, d / v.segs[n]) : 0;
    let x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
    let dx = b.x - a.x, dz = b.z - a.z;
    if (!v.loop) { // au retour, la figurine se retourne
      const T = 2 * v.L + 2 * pause * speed, u = ((t * speed + v.phase) % T + T) % T;
      if (u >= v.L + pause * speed) { dx = -dx; dz = -dz; }
    }
    if (panic) { x += Math.sin(t * 9 + v.phase) * 0.02; z += Math.cos(t * 7.3 + v.phase) * 0.02; }
    return { x, z, yaw: Math.atan2(dx, dz), walking };
  }

  update(t) {
    const R = this.r, s = R.state, P = this.parts;
    if (!s || !this.list.length) { for (const m of Object.values(P)) m.count = 0; return; }
    const tg = R.controls.target, dist = R.camera.position.distanceTo(tg);
    const show = dist <= R.animMaxDist;
    this.group.visible = show;
    if (!show) return;
    const still = R.reducedMotion;
    const r2 = (dist * 1.15) ** 2;
    const crash = s.world?.bubble?.phase === 'crash';
    const { m, q, p, s: sc, a, b, w, c, Y } = this.tmp;
    const viewer = s.players[R.viewer];
    let n = 0;
    for (const v of this.list) {
      if (n >= MAX) break;
      if (v.tile !== undefined && viewer.explored[v.tile] !== 1) continue;
      if (v.owner !== R.viewer && R.visible && R.visible[v.tile] !== 1) continue; // chez les autres : seulement si on voit
      const c0 = v.pts[0];
      const ddx = c0.x - tg.x, ddz = c0.z - tg.z;
      if (ddx * ddx + ddz * ddz > r2) continue;
      const marketPanic = crash || this.crisisCrash;
      const panic = (v.trading && marketPanic) || v.panic;
      if (v.trading && !marketPanic && (v.phase % 3) > 1) continue; // hors krach, un seul trader sur trois devant la bourse
      const ps = still ? { ...v.pts[0], yaw: 0, walking: false } : this.pose(v, t, panic);
      const hop = ps.walking && !still ? Math.abs(Math.sin(t * (panic ? 22 : 11) + v.phase)) * (panic ? 0.012 : 0.006) : 0;
      const y = this.ground(ps.x, ps.z);
      q.setFromAxisAngle(Y, ps.yaw + (panic ? Math.sin(t * 13 + v.phase) * 0.6 : 0));
      m.compose(p.set(ps.x, y + hop, ps.z), q, sc.setScalar(SCALE));
      P.body.setMatrixAt(n, m); P.head.setMatrixAt(n, m); P.hat.setMatrixAt(n, m);
      P.body.setColorAt(n, c.set(v.body)); P.head.setColorAt(n, c.set(v.skin)); P.hat.setColorAt(n, c.set(v.hat));
      // bras : levés en cas de panique, sinon ils balancent un peu en marchant
      a.makeTranslation(0, 0.07, 0);
      if (panic || v.dance) a.multiply(b.makeScale(1, -1, 1)).multiply(b.makeRotationX(Math.sin(t * (panic ? 16 : 6) + v.phase) * (panic ? 0.4 : 0.6)));
      else if (v.brigade && !still) a.multiply(b.makeRotationX(-0.6 + Math.sin(t * 5 + v.phase) * 0.5)); // les seaux passent de main en main
      else if (ps.walking && !still) a.multiply(b.makeRotationX(Math.sin(t * 11 + v.phase) * 0.35));
      P.arms.setMatrixAt(n, w.multiplyMatrices(m, a)); P.arms.setColorAt(n, c.set(v.body));
      const acc = ACC[v.acc];
      if (acc) { a.compose(p.set(...acc.o), q.identity(), sc.set(...acc.s)); P.acc.setMatrixAt(n, w.multiplyMatrices(m, a)); P.acc.setColorAt(n, c.set(acc.c)); }
      else { a.makeScale(0, 0, 0); P.acc.setMatrixAt(n, a); }
      a.makeTranslation(ps.x, y, ps.z); P.shadow.setMatrixAt(n, a);
      n++;
    }
    for (const mesh of Object.values(P)) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.updateFx(t, tg, r2, still, viewer);
  }

  updateFx(t, tg, r2, still, viewer) {
    const R = this.r, F = this.fx, { m, q, p, s: sc, c } = this.tmp;
    const near = (sp) => { const dx = sp.x - tg.x, dz = sp.z - tg.z; return dx * dx + dz * dz <= r2 && viewer.explored[sp.tile] === 1 && (!R.visible || R.visible[sp.tile] === 1 || R.state.cities.find((x) => x.y * R.W + x.x === sp.tile)?.owner === R.viewer); };
    const counts = { flame: 0, smoke: 0, rain: 0, confetti: 0 };
    const put = (k, x, y, z, s, rx = 0, ry = 0, col) => { const i = counts[k]; if (i >= MAX_FX) return; q.setFromEuler(new THREE.Euler(rx, ry, 0)); m.compose(p.set(x, y, z), q, sc.setScalar(s)); F[k].setMatrixAt(i, m); if (col) F[k].setColorAt(i, c.set(col)); counts[k]++; };
    for (const sp of this.spots.fire) {
      if (!near(sp)) continue;
      const y0 = this.ground(sp.x, sp.z) + 0.16;
      for (let k = 0; k < 4; k++) put('flame', sp.x + (k - 1.5) * 0.05, y0, sp.z + (k % 2) * 0.04, 1.1 + (still ? 0 : Math.sin(t * 9 + k * 2) * 0.3), 0, k);
      for (let k = 0; k < 6; k++) { const f = still ? k / 6 : (t * 0.3 + k / 6) % 1; put('smoke', sp.x + Math.sin(f * 5 + k) * 0.05, y0 + 0.15 + f * 0.6, sp.z, 0.6 + f * 1.6); }
    }
    if (!still) {
      for (const sp of this.spots.storm) {
        if (!near(sp)) continue;
        for (let k = 0; k < 70; k++) { const h = hash(k, sp.tile, 3), u = hash(k, sp.tile, 5); const f = (t * 1.8 + h) % 1; put('rain', sp.x + (u - 0.5) * 1.6, 0.25 + (1 - f) * 1.4, sp.z + (h - 0.5) * 1.6, 1, 0, 0, null); p.set(0, 0, 0); }
        // les rafales couchent la pluie
        for (let i = counts.rain - 70; i < counts.rain; i++) { F.rain.getMatrixAt(i, m); m.multiply(new THREE.Matrix4().makeRotationZ(0.35)); F.rain.setMatrixAt(i, m); }
      }
      const CONF = ['#ff6b4a', '#f5b700', '#14b8a6', '#8b5cf6', '#ec4899', '#5cb56b'];
      for (const sp of this.spots.fete) {
        if (!near(sp)) continue;
        for (let k = 0; k < 40; k++) { const h = hash(k, sp.tile, 7), u = hash(k, sp.tile, 11); const f = (t * 0.35 + h) % 1; put('confetti', sp.x + (u - 0.5) * 0.5 + Math.sin(t * 2 + k) * 0.04, this.ground(sp.x, sp.z) + 0.6 - f * 0.55, sp.z + (h - 0.5) * 0.5, 2.2, t * 3 + k, t * 2 + k, CONF[k % CONF.length]); }
      }
    }
    for (const [k, mesh] of Object.entries(F)) { mesh.count = counts[k]; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }

  dispose() { this.r.scene.remove(this.group); }
}

// Rendu Three.js : terrain en relief (cases rectangulaires), territoires, routes, bâtiments et unités 3D.
import * as THREE from 'three';
import { MapControls } from 'three/addons/MapControls.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { cityModel, buildingModel, unitModel, luxuryModel } from './models.js';

const FOG_COLOR = new THREE.Color('#e4dcd6');
const BG = '#efe8e4';

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 45, 90);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(0, 22, 18);

    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = 1.15;
    this.controls.minPolarAngle = 0.35;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 45;
    this.controls.zoomToCursor = true;

    this.scene.add(new THREE.HemisphereLight('#fff8f0', '#c9b8ad', 1.9));
    const sun = new THREE.DirectionalLight('#fff1dc', 2.0);
    sun.position.set(-14, 26, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 80 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    this.scene.add(sun);

    this.dynamic = new THREE.Group();   // territoires, routes, surlignages (reconstruits)
    this.entities = new THREE.Group();  // villes, bâtiments, unités
    this.scene.add(this.dynamic, this.entities);
    this.entityObjs = new Map();
    this.labels = new Map();
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'labels';
    container.appendChild(this.labelLayer);
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ coordonnées
  wx(x) { return x - this.W / 2 + 0.5; }
  wz(y) { return y - this.H / 2 + 0.5; }
  tileHeight(t, explored = true) {
    const ter = this.state.data.terrain[t.type];
    if (!explored) return 0.1;
    return ter.water ? ter.height : ter.height + (t.e - 0.4) * 0.35;
  }
  top(i) { return this.heights[i]; }

  // ----------------------------------------------------------------- terrain
  setState(state, viewer = 0) {
    this.state = state; this.viewer = viewer;
    this.W = state.map.width; this.H = state.map.height;
    if (this.tiles) { this.scene.remove(this.tiles, this.trees, this.trunks, this.peaks, this.base); }
    for (const o of this.entityObjs.values()) this.entities.remove(o);
    this.entityObjs.clear();
    for (const l of this.labels.values()) l.remove();
    this.labels.clear();

    const n = state.map.tiles.length;
    this.heights = new Float32Array(n);
    const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    this.tiles = new THREE.InstancedMesh(new RoundedBoxGeometry(0.97, 1, 0.97, 2, 0.07), tileMat, n);
    this.tiles.receiveShadow = true; this.tiles.castShadow = true;

    const forests = state.map.tiles.filter((t) => t.type === 'forest');
    this.treeSlots = [];
    for (const t of forests) for (let k = 0; k < 3; k++) {
      const r = ((t.x * 73856093) ^ (t.y * 19349663) ^ (k * 83492791)) >>> 0;
      this.treeSlots.push({ t, dx: ((r % 100) / 100 - 0.5) * 0.55, dz: (((r >> 8) % 100) / 100 - 0.5) * 0.55, s: 0.8 + ((r >> 16) % 40) / 100 });
    }
    this.trees = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 14, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), this.treeSlots.length);
    this.trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 8), new THREE.MeshStandardMaterial({ color: '#8a5634', roughness: 0.8 }), this.treeSlots.length);
    this.trees.castShadow = true; this.trunks.castShadow = true;
    const highs = state.map.tiles.filter((t) => t.type === 'mountain' || t.type === 'snow');
    this.peaks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.8 }), highs.length);
    this.peakTiles = highs;
    this.peaks.castShadow = true;
    this.base = new THREE.Mesh(new THREE.PlaneGeometry(this.W + 60, this.H + 60), new THREE.MeshStandardMaterial({ color: '#e4dcd6', roughness: 1 }));
    this.base.rotation.x = -Math.PI / 2; this.base.position.y = 0.02;
    this.base.receiveShadow = true;
    this.scene.add(this.base, this.tiles, this.trunks, this.trees, this.peaks);
    this.refresh();
  }

  refreshTerrain() {
    const s = this.state, p = s.players[this.viewer];
    const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    s.map.tiles.forEach((t, i) => {
      const ex = p.explored[i] === 1;
      const h = this.tileHeight(t, ex);
      this.heights[i] = h;
      m.compose(v.set(this.wx(t.x), h / 2, this.wz(t.y)), q, sc.set(ex ? 1 : 1.021, h, ex ? 1 : 1.021));
      this.tiles.setMatrixAt(i, m);
      c.set(ex ? s.data.terrain[t.type].color : FOG_COLOR);
      if (ex && !s.data.terrain[t.type].water) c.offsetHSL(0, 0, ((t.x * 7 + t.y * 13) % 5) * 0.006 - 0.012);
      this.tiles.setColorAt(i, c);
    });
    this.tiles.instanceMatrix.needsUpdate = true; this.tiles.instanceColor.needsUpdate = true;
    const occupied = new Set();
    for (const b of s.buildings) {
      const f = s.data.buildingsById[b.type].footprint || 1;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) occupied.add((b.y + dy) * this.W + b.x + dx);
    }
    this.treeSlots.forEach((sl, k) => {
      const i = sl.t.y * this.W + sl.t.x;
      const ex = p.explored[i] === 1 && sl.t.type === 'forest' && !occupied.has(i) && sl.t.road === -1;
      const k0 = ex ? sl.s : 0.0001;
      m.compose(v.set(this.wx(sl.t.x) + sl.dx, this.heights[i] + 0.11 * sl.s, this.wz(sl.t.y) + sl.dz), q, sc.setScalar(k0));
      this.trunks.setMatrixAt(k, m);
      m.compose(v.set(this.wx(sl.t.x) + sl.dx, this.heights[i] + 0.3 * sl.s, this.wz(sl.t.y) + sl.dz), q, sc.set(k0, k0 * 1.1, k0));
      this.trees.setMatrixAt(k, m);
      this.trees.setColorAt(k, c.set(k % 3 === 0 ? '#86c96a' : k % 3 === 1 ? '#5fae5a' : '#4f9e55'));
    });
    this.trees.instanceMatrix.needsUpdate = true; this.trunks.instanceMatrix.needsUpdate = true;
    if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
    this.peakTiles.forEach((t, k) => {
      const i = t.y * this.W + t.x;
      const ex = p.explored[i] === 1;
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
      m.compose(v.set(this.wx(t.x), this.heights[i] - 0.02, this.wz(t.y)), rot, sc.set(ex ? 1.0 : 0.0001, ex ? 1.1 : 0.0001, ex ? 1.0 : 0.0001));
      this.peaks.setMatrixAt(k, m);
      this.peaks.setColorAt(k, c.set(t.type === 'snow' ? '#ffffff' : '#c3bbb2'));
    });
    this.peaks.instanceMatrix.needsUpdate = true;
    if (this.peaks.instanceColor) this.peaks.instanceColor.needsUpdate = true;
  }

  // ----------------------------------------------------- couches dynamiques
  clearDynamic() {
    for (const o of [...this.dynamic.children]) { this.dynamic.remove(o); o.geometry?.dispose(); }
  }

  refreshOverlays() {
    this.clearDynamic();
    const s = this.state, p = s.players[this.viewer];
    const owned = s.map.tiles.filter((t, i) => t.owner !== -1 && p.explored[i]);
    // Territoire : voile coloré + liseré sur les frontières
    const veil = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.14, depthWrite: false }), Math.max(1, owned.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    const edges = [];
    owned.forEach((t, k) => {
      const i = t.y * this.W + t.x;
      m.compose(v.set(this.wx(t.x), this.heights[i] + 0.012, this.wz(t.y)), q, sc);
      veil.setMatrixAt(k, m); veil.setColorAt(k, c.set(s.players[t.owner].color));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = s.map.tiles[(t.y + dy) * this.W + (t.x + dx)];
        if (t.x + dx < 0 || t.x + dx >= this.W || !n || n.owner !== t.owner) edges.push({ t, dx, dy, h: this.heights[i] });
      }
    });
    veil.count = owned.length;
    this.dynamic.add(veil);
    if (edges.length) {
      const border = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.03, 0.06), new THREE.MeshBasicMaterial(), edges.length);
      edges.forEach((e, k) => {
        const horiz = e.dy !== 0;
        const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), horiz ? 0 : Math.PI / 2);
        m.compose(v.set(this.wx(e.t.x) + e.dx * 0.47, e.h + 0.02, this.wz(e.t.y) + e.dy * 0.47), rot, sc.set(1, 1, 1));
        border.setMatrixAt(k, m); border.setColorAt(k, c.set(s.players[e.t.owner].color));
      });
      this.dynamic.add(border);
    }
    // Routes : segments entre cases routières/villes voisines
    const segs = [];
    s.map.tiles.forEach((t, i) => {
      if (t.road === -1 || !p.explored[i]) return;
      segs.push({ a: t, b: t });
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]]) {
        const nx = t.x + dx, ny = t.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) continue;
        const n = s.map.tiles[ny * this.W + nx];
        const nIsCity = s.cities.some((ct) => ct.x === nx && ct.y === ny);
        if ((n.road !== -1 && (dx > 0 || (dx === 0 && dy > 0))) || nIsCity) segs.push({ a: t, b: n });
      }
    });
    if (segs.length) {
      const roads = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 0.03, 0.14, 1, 0.012), new THREE.MeshStandardMaterial({ color: '#f4ead8', roughness: 0.9 }), segs.length);
      roads.receiveShadow = true;
      segs.forEach((sg, k) => {
        const ia = sg.a.y * this.W + sg.a.x, ib = sg.b.y * this.W + sg.b.x;
        const ax = this.wx(sg.a.x), az = this.wz(sg.a.y), bx = this.wx(sg.b.x), bz = this.wz(sg.b.y);
        const len = Math.hypot(bx - ax, bz - az) || 0.2;
        const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(bz - az, bx - ax));
        m.compose(v.set((ax + bx) / 2, Math.max(this.heights[ia], this.heights[ib]) + 0.02, (az + bz) / 2), rot, sc.set(len, 1, 1));
        roads.setMatrixAt(k, m);
      });
      this.dynamic.add(roads);
    }
    this.drawHighlights();
  }

  // highlights : [{ i, color, opacity }]
  setHighlights(list) { this.highlightList = list || []; this.drawHighlights(); }
  drawHighlights() {
    if (this.hlMesh) { this.dynamic.remove(this.hlMesh); this.hlMesh.geometry.dispose(); this.hlMesh = null; }
    const list = this.highlightList || [];
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.82, 0.82), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    list.forEach((h, k) => {
      const x = h.i % this.W, y = Math.floor(h.i / this.W);
      m.compose(v.set(this.wx(x), this.heights[h.i] + 0.03, this.wz(y)), q, sc);
      mesh.setMatrixAt(k, m); mesh.setColorAt(k, c.set(h.color));
    });
    mesh.renderOrder = 2;
    this.hlMesh = mesh;
    this.dynamic.add(mesh);
  }

  setCursor(i, kind) {
    if (!this.cursors) {
      const mk = (color) => {
        const g = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.96, 0.06, 0.96)), new THREE.LineBasicMaterial({ color, depthTest: false }));
        g.renderOrder = 5; g.visible = false; this.scene.add(g); return g;
      };
      this.cursors = { hover: mk('#ffffff'), select: mk('#1d2733') };
    }
    const cur = this.cursors[kind];
    if (i === null || i === undefined || i < 0) { cur.visible = false; return; }
    const x = i % this.W, y = Math.floor(i / this.W);
    cur.position.set(this.wx(x), this.heights[i] + 0.04, this.wz(y));
    cur.visible = true;
  }

  // -------------------------------------------------------------- entités
  syncEntities() {
    const s = this.state, p = s.players[this.viewer];
    const seen = new Set();
    const visible = (x, y) => p.explored[y * this.W + x] === 1;
    const place = (key, make, x, y, yOff = 0, off = null) => {
      seen.add(key);
      let obj = this.entityObjs.get(key);
      const i = y * this.W + x;
      const target = new THREE.Vector3(this.wx(x), this.heights[i] + yOff, this.wz(y));
      if (off) target.add(off);
      if (!obj) {
        obj = make(); obj.position.copy(target); obj.userData.path = [];
        this.entityObjs.set(key, obj); this.entities.add(obj);
      } else if (obj.userData.isUnit) {
        const path = obj.userData.path;
        const last = path.length ? path[path.length - 1] : obj.position;
        if (last.distanceTo(target) > 1e-4) path.push(target);
      } else obj.position.copy(target);
      obj.visible = visible(x, y);
      return obj;
    };
    for (const c of s.cities) {
      const o = place(`c${c.id}:${Math.min(c.pop, 5)}:${c.capital}`, () => cityModel(s.players[c.owner].color, c.pop, c.capital), c.x, c.y);
      this.label(c, o);
    }
    for (const b of s.buildings) {
      const f = s.data.buildingsById[b.type].footprint || 1;
      if (f === 1) { place(`b${b.id}:${b.turnsLeft > 0}`, () => buildingModel(b.type, b.turnsLeft > 0, b.luxury), b.x, b.y); continue; }
      // Quartier 2×2 : centré sur son empreinte, posé sur la case la plus haute.
      let top = 0;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) top = Math.max(top, this.heights[(b.y + dy) * this.W + b.x + dx]);
      const o = place(`b${b.id}:${b.turnsLeft > 0}`, () => buildingModel(b.type, b.turnsLeft > 0), b.x, b.y);
      o.position.set(this.wx(b.x) + (f - 1) / 2, top, this.wz(b.y) + (f - 1) / 2);
    }
    s.map.tiles.forEach((t, i) => {
      if (!t.luxury || s.buildings.some((b) => b.x === t.x && b.y === t.y)) return;
      place(`lux${i}`, () => luxuryModel(t.luxury), t.x, t.y);
    });
    for (const u of s.units) {
      const stack = s.units.filter((o) => o.x === u.x && o.y === u.y);
      const k = stack.indexOf(u);
      const city = s.cities.some((c) => c.x === u.x && c.y === u.y);
      const off = new THREE.Vector3((k - (stack.length - 1) / 2) * 0.28 + (city ? 0.3 : 0), s.data.unitsById[u.type].flying ? 0.7 : 0, city ? 0.3 : 0);
      place(`u${u.id}`, () => { const g = unitModel(u.type, s.players[u.owner].color, u.owner); g.userData.isUnit = true; return g; }, u.x, u.y, city ? 0.05 : 0, off);
    }
    for (const [key, obj] of this.entityObjs) {
      if (!seen.has(key)) { this.entities.remove(obj); this.entityObjs.delete(key); }
    }
    for (const [id, el] of this.labels) if (!s.cities.some((c) => c.id === id)) { el.remove(); this.labels.delete(id); }
  }

  label(c, obj) {
    let el = this.labels.get(c.id);
    if (!el) { el = document.createElement('div'); el.className = 'city-label'; this.labelLayer.appendChild(el); this.labels.set(c.id, el); }
    const color = this.state.players[c.owner].color;
    el.innerHTML = `<span class="pop" style="background:${color}">${c.pop}</span>${c.name}`;
    el.dataset.obj = obj.uuid;
    el._obj = obj;
  }

  refresh() {
    if (!this.state) return;
    this.refreshTerrain();
    this.refreshOverlays();
    this.syncEntities();
  }

  // ------------------------------------------------------------------ entrées
  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.tiles, false)[0];
    return hit ? hit.instanceId : null;
  }

  // Empreinte de la caméra au sol, en coordonnées de cases (pour la mini-carte).
  viewFootprint() {
    if (!this.W) return null;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const out = [];
    for (const [nx, ny] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const hit = new THREE.Vector3();
      const maxR = this.camera.position.distanceTo(this.controls.target) * 0.6;
      if (!this.raycaster.ray.intersectPlane(plane, hit) || hit.distanceTo(this.controls.target) > maxR) {
        // Coin proche de l'horizon : on borne la distance au centre de la vue.
        const dir = this.raycaster.ray.direction.clone().setY(0).normalize().multiplyScalar(maxR);
        hit.copy(this.controls.target).add(dir);
      }
      out.push([hit.x + this.W / 2 - 0.5, hit.z + this.H / 2 - 0.5]);
    }
    return out;
  }

  focus(x, y, instant = false) {
    const t = new THREE.Vector3(this.wx(x), 0, this.wz(y));
    const delta = t.clone().sub(this.controls.target);
    if (instant) { this.controls.target.add(delta); this.camera.position.add(delta); return; }
    this.focusAnim = { delta, left: 1 };
  }

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.focusAnim) {
      const step = Math.min(this.focusAnim.left, dt * 3);
      const d = this.focusAnim.delta.clone().multiplyScalar(step);
      this.controls.target.add(d); this.camera.position.add(d);
      this.focusAnim.left -= step;
      if (this.focusAnim.left <= 0) this.focusAnim = null;
    }
    if (this.W) {
      const tg = this.controls.target;
      const cx = Math.max(-this.W / 2, Math.min(this.W / 2, tg.x)) - tg.x;
      const cz = Math.max(-this.H / 2, Math.min(this.H / 2, tg.z)) - tg.z;
      if (cx || cz) { tg.x += cx; tg.z += cz; this.camera.position.x += cx; this.camera.position.z += cz; }
    }
    this.controls.update();
    for (const obj of this.entityObjs.values()) {
      if (!obj.userData.isUnit) continue;
      const path = obj.userData.path;
      if (!path.length) continue;
      const d = path[0].clone().sub(obj.position);
      const step = dt * 5;
      if (d.length() <= step) { obj.position.copy(path[0]); path.shift(); } else obj.position.add(d.setLength(step));
    }
    if (this.cursors?.select.visible) this.cursors.select.position.y += Math.sin(performance.now() / 300) * 0.0008;
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }

  // Animation explicite d'un déplacement case par case.
  animateUnit(uid, steps) {
    const obj = this.entityObjs.get(`u${uid}`);
    if (!obj || !steps?.length) return;
    obj.userData.path = steps.map((i) => new THREE.Vector3(this.wx(i % this.W), this.heights[i], this.wz(Math.floor(i / this.W))));
  }

  // Tracé d'un déplacement prévu : points le long du chemin (couleur selon le tour d'arrivée) et drapeau final.
  setPath(steps, from) {
    if (this.pathGroup) { this.scene.remove(this.pathGroup); this.pathGroup.traverse((o) => o.geometry?.dispose()); this.pathGroup = null; }
    if (!steps || !steps.length) return;
    const g = new THREE.Group();
    const dotGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12);
    const mats = [new THREE.MeshBasicMaterial({ color: '#ff6b4a' }), new THREE.MeshBasicMaterial({ color: '#2f2a33', transparent: true, opacity: 0.55 })];
    const pts = [from, ...steps.map((st) => st.i)];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      const ax = this.wx(a % this.W), az = this.wz(Math.floor(a / this.W)), bx = this.wx(b % this.W), bz = this.wz(Math.floor(b / this.W));
      const ha = this.heights[a], hb = this.heights[b];
      const turn = steps[k - 1].turn;
      for (let t = 0.25; t <= 1.001; t += 0.25) {
        const d = new THREE.Mesh(dotGeo, mats[turn === 1 ? 0 : 1]);
        d.position.set(ax + (bx - ax) * t, Math.max(ha, hb) + 0.06, az + (bz - az) * t);
        if (t > 0.99) d.scale.setScalar(1.5);
        g.add(d);
      }
    }
    const last = pts[pts.length - 1];
    const fx = this.wx(last % this.W), fz = this.wz(Math.floor(last / this.W)), fy = this.heights[last];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), new THREE.MeshBasicMaterial({ color: '#2f2a33' }));
    pole.position.set(fx, fy + 0.25, fz);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.01), new THREE.MeshBasicMaterial({ color: '#ff6b4a' }));
    flag.position.set(fx + 0.1, fy + 0.43, fz);
    g.add(pole, flag);
    g.renderOrder = 6;
    this.pathGroup = g;
    this.scene.add(g);
  }

  // Pastilles posées sur des cases (bonus d'adjacence) : [{ i, html }]
  setBadges(list) {
    if (!this.badgeLayer) { this.badgeLayer = document.createElement('div'); this.badgeLayer.className = 'labels'; this.container.appendChild(this.badgeLayer); }
    this.badgeLayer.innerHTML = '';
    this.badges = (list || []).map((b) => {
      const el = document.createElement('div');
      el.className = 'tile-badge'; el.innerHTML = b.html;
      this.badgeLayer.appendChild(el);
      const x = b.i % this.W, y = Math.floor(b.i / this.W);
      return { el, pos: new THREE.Vector3(this.wx(x + (b.dx || 0)), this.heights[b.i] + (b.lift ?? 0.55), this.wz(y + (b.dy || 0))) };
    });
  }

  updateLabels() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    for (const b of this.badges || []) {
      v.copy(b.pos).project(this.camera);
      if (v.z > 1) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      b.el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
    for (const el of this.labels.values()) {
      const o = el._obj;
      if (!o || !o.visible) { el.style.display = 'none'; continue; }
      v.copy(o.position); v.y += 0.75; v.project(this.camera);
      if (v.z > 1) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  }
}

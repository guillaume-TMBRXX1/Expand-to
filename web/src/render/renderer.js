// Rendu Three.js : terrain en relief (cases rectangulaires), territoires, routes, bâtiments et unités 3D.
import * as THREE from 'three';
import { MapControls } from 'three/addons/MapControls.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { cityModel, buildingModel, unitModel, luxuryModel, naturalModel, ruinModel } from './models.js';

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

    this.hemi = new THREE.HemisphereLight('#fff8f0', '#c9b8ad', 1.9);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff1dc', 2.0);
    this.sun = sun;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    this.dayNight = true;
    try { this.dayNight = localStorage.getItem('expandto.daynight') !== '0'; } catch { /* ignore */ }
    this.time = 0;
    this.waterUniform = { value: 0 };
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
    const sc0 = this.sun.shadow.camera; // ombres et zoom adaptés à la taille de la carte
    Object.assign(sc0, { left: -(this.W / 2 + 4), right: this.W / 2 + 4, top: this.H / 2 + 4, bottom: -(this.H / 2 + 4) });
    sc0.updateProjectionMatrix();
    this.controls.maxDistance = Math.max(45, this.W * 1.25);
    this.scene.fog.far = Math.max(90, this.W * 2.2);
    if (this.tiles) { this.scene.remove(this.tiles, this.trees, this.trunks, this.peaks, this.base, this.water, ...(this.decor || [])); }
    for (const c of this.clouds || []) this.scene.remove(c);
    if (this.rivers) this.scene.remove(this.rivers);
    for (const o of this.entityObjs.values()) this.entities.remove(o);
    this.entityObjs.clear();
    this.ready = false;
    for (const e of this.effects || []) this.scene.remove(e.obj);
    this.effects = [];
    for (const l of this.labels.values()) l.remove();
    this.labels.clear();

    const n = state.map.tiles.length;
    this.heights = new Float32Array(n);
    const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    // Falaises : les flancs des cases s'assombrissent vers le bas (relief plus lisible).
    tileMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLocalY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalY = position.y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLocalY;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.62, 1.0, smoothstep(-0.5, 0.48, vLocalY));');
    };
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
    this.buildWater(state);
    this.buildDecor(state);
    this.refresh();
  }

  // Surface de l'eau animée : vaguelettes et reflets.
  buildWater(state) {
    const waters = state.map.tiles.filter((t) => state.data.terrain[t.type].water);
    this.waterTiles = waters;
    const mat = new THREE.MeshStandardMaterial({ color: '#9fd8f2', roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
    const u = this.waterUniform;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = u;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp0 = instanceMatrix * vec4(position, 1.0);\ntransformed.z += sin(wp0.x * 2.1 + uTime * 1.3) * 0.012 + cos(wp0.y * 1.7 + uTime) * 0.012;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat gl1 = sin(vWPos.x * 6.0 + uTime * 1.6) * sin(vWPos.z * 5.0 - uTime * 1.2);\ndiffuseColor.rgb += smoothstep(0.82, 1.0, gl1) * 0.35;');
    };
    this.water = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.95, 0.95, 3, 3), mat, Math.max(1, waters.length));
    this.water.receiveShadow = true;
    this.water.renderOrder = 1;
    this.scene.add(this.water);
  }

  // Décor de terrain : fleurs, touffes d'herbe, rochers, coquillages (déterministe par case).
  // Climat d'une case : sa région, ou pour les côtes celle de la terre la plus proche (palmiers au sud, pas au nord).
  computeClimate(state) {
    const W = this.W, H = this.H, out = new Array(W * H).fill('temperate');
    state.map.tiles.forEach((t, i) => {
      if (t.region && t.region !== 'coast') { out[i] = t.region; return; }
      for (let r = 1; r <= 4; r++) {
        let found = null;
        for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) {
          const x = t.x + dx, y = t.y + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const n = state.map.tiles[y * W + x];
          if (n.region && n.region !== 'coast') found = n.region;
        }
        if (found) { out[i] = found; break; }
      }
    });
    return out;
  }

  buildDecor(state) {
    this.climate = this.computeClimate(state);
    const cl = (t) => this.climate[t.y * this.W + t.x];
    const hash = (x, y, k) => (((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) / 4294967296;
    const slots = { flower: [], tuft: [], rock: [], shell: [], palm: [], pine: [], bush: [], snowpine: [], cactus: [] };
    const nearMountain = (t) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = state.map.tiles[(t.y + dy) * this.W + t.x + dx]; return n && t.x + dx >= 0 && t.x + dx < this.W && (n.type === 'mountain' || n.type === 'snow'); });
    for (const t of state.map.tiles) {
      const r = hash(t.x, t.y, 91), dx = (hash(t.x, t.y, 92) - 0.5) * 0.5, dz = (hash(t.x, t.y, 93) - 0.5) * 0.5, sc = 0.8 + hash(t.x, t.y, 94) * 0.5;
      const c = cl(t);
      if (c === 'north') { // nord froid : sapins enneigés à la place des arbres ronds
        if (t.type === 'forest') for (let k = 0; k < 3; k++) slots.snowpine.push({ t, dx: (hash(t.x, t.y, 120 + k) - 0.5) * 0.6, dz: (hash(t.x, t.y, 130 + k) - 0.5) * 0.6, sc: 0.8 + hash(t.x, t.y, 140 + k) * 0.4 });
        else if ((t.type === 'plains' || t.type === 'hills' || t.type === 'grass') && r < 0.35) slots.snowpine.push({ t, dx, dz, sc });
        continue;
      }
      if (c === 'arid') { // sud aride : cactus, palmiers sur le sable
        if ((t.type === 'plains' || t.type === 'hills' || t.type === 'grass') && r < 0.35) slots.cactus.push({ t, dx, dz, sc, rot: hash(t.x, t.y, 96) * 6.28 });
        if (t.type === 'sand' && r < 0.5) slots[r < 0.3 ? 'palm' : 'cactus'].push({ t, dx, dz, sc, rot: hash(t.x, t.y, 95) * 6.28 });
        continue;
      }
      if (t.type === 'sand' && r < 0.4) slots.palm.push({ t, dx, dz, sc, rot: hash(t.x, t.y, 95) * 6.28 });
      if ((t.type === 'hills' && r < 0.35) || (t.type === 'forest' && nearMountain(t) && r < 0.8)) slots.pine.push({ t, dx, dz, sc });
      if (t.type === 'plains' && r < (c === 'fertile' ? 0.4 : 0.25)) slots.bush.push({ t, dx, dz, sc: sc * 0.9 });
    }
    for (const t of state.map.tiles) {
      const n = 3;
      for (let k = 0; k < n; k++) {
        const r = hash(t.x, t.y, k + 11);
        const dx = (hash(t.x, t.y, k + 21) - 0.5) * 0.8, dz = (hash(t.x, t.y, k + 31) - 0.5) * 0.8;
        const sc = 0.7 + hash(t.x, t.y, k + 41) * 0.6;
        if ((t.type === 'grass' || t.type === 'plains') && cl(t) !== 'north' && r < (cl(t) === 'arid' ? 0.15 : 0.45)) slots[r < 0.18 ? 'flower' : 'tuft'].push({ t, dx, dz, sc, c: ['#ffffff', '#ffd23f', '#ff8fab', '#c4a7ff'][Math.floor(r * 40) % 4] });
        if (t.type === 'hills' && r < 0.6) slots.rock.push({ t, dx, dz, sc: sc * 1.2 });
        if (t.type === 'mountain' && r < 0.4) slots.rock.push({ t, dx: dx * 1.1, dz: dz * 1.1, sc: sc * 1.6 });
        if (t.type === 'sand' && r < 0.3) slots.shell.push({ t, dx, dz, sc });
      }
    }
    const make = (geo, mat, list) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.userData.slots = list; m.castShadow = false; m.receiveShadow = true; return m; };
    this.decor = [
      make(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), slots.flower),
      make(new THREE.ConeGeometry(0.025, 0.07, 5), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), slots.tuft),
      make(new THREE.DodecahedronGeometry(0.04, 0), new THREE.MeshStandardMaterial({ color: '#b3aba3', roughness: 0.9, flatShading: true }), slots.rock),
      make(new THREE.SphereGeometry(0.018, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fbe9d7', roughness: 0.5 }), slots.shell),
    ];
    this.decor[0].userData.kind = 'flower'; this.decor[1].userData.kind = 'tuft';
    const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    for (const [geo, list] of [[this.palmGeo(), slots.palm], [this.pineGeo(), slots.pine], [this.bushGeo(), slots.bush], [this.pineGeo(true), slots.snowpine], [this.cactusGeo(), slots.cactus]]) {
      const im = make(geo, vc, list); im.castShadow = true; this.decor.push(im);
    }
    this.scene.add(...this.decor);
    this.buildFoam(state);
    this.buildRivers(state);
    this.buildClouds();
  }

  // Petites géométries fusionnées à couleurs de sommets (un seul appel de dessin par type).
  mergedGeo(parts) {
    const geos = parts.map(([g, color, m]) => {
      let geo = g.index ? g.toNonIndexed() : g.clone();
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(k)) geo.deleteAttribute(k);
      if (m) geo.applyMatrix4(m);
      const c = new THREE.Color(color), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return geo;
    });
    return mergeGeometries(geos, false);
  }
  palmGeo() {
    const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const parts = [[new THREE.CylinderGeometry(0.016, 0.026, 0.34, 7), '#a8774a', M(0.02, 0.17, 0, 0, 0, -0.12)]];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      parts.push([new THREE.BoxGeometry(0.2, 0.012, 0.06), k % 2 ? '#5fae5a' : '#4f9e55', M(0.06 + Math.cos(a) * 0.08, 0.33, Math.sin(a) * 0.08, 0, -a, -0.35)]);
    }
    parts.push([new THREE.SphereGeometry(0.025, 8, 6), '#8a5634', M(0.05, 0.33, 0)]);
    return this.mergedGeo(parts);
  }
  pineGeo(snow = false) {
    const M = (y, s) => new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion(), new THREE.Vector3(s, 1, s));
    const parts = [
      [new THREE.CylinderGeometry(0.018, 0.024, 0.1, 6), '#7a4e2e', M(0.05, 1)],
      [new THREE.ConeGeometry(0.11, 0.18, 8), snow ? '#3d6f55' : '#3f7f4f', M(0.17, 1)],
      [new THREE.ConeGeometry(0.085, 0.15, 8), snow ? '#46785d' : '#4a8f58', M(0.27, 1)],
      [new THREE.ConeGeometry(0.055, 0.11, 8), snow ? '#ffffff' : '#5aa265', M(0.35, 1)],
    ];
    if (snow) parts.push([new THREE.ConeGeometry(0.1, 0.05, 8), '#f4f8fb', M(0.23, 1)], [new THREE.ConeGeometry(0.078, 0.045, 8), '#f4f8fb', M(0.32, 1)]);
    return this.mergedGeo(parts);
  }
  cactusGeo() {
    const M = (x, y, z, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(1, 1, 1));
    return this.mergedGeo([
      [new THREE.CapsuleGeometry(0.03, 0.16, 4, 8), '#5f9e5a', M(0, 0.11, 0)],
      [new THREE.CapsuleGeometry(0.018, 0.06, 4, 8), '#6aab62', M(0.045, 0.14, 0, -0.2)],
      [new THREE.CapsuleGeometry(0.016, 0.05, 4, 8), '#6aab62', M(-0.04, 0.1, 0, 0.25)],
      [new THREE.SphereGeometry(0.014, 6, 5), '#ff8fab', M(0, 0.23, 0)],
    ]);
  }
  bushGeo() {
    const M = (x, y, z, s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.8, s));
    return this.mergedGeo([
      [new THREE.SphereGeometry(0.05, 9, 7), '#6fb85a', M(0, 0.035, 0, 1)],
      [new THREE.SphereGeometry(0.04, 9, 7), '#86c96a', M(0.045, 0.03, 0.02, 1)],
      [new THREE.SphereGeometry(0.035, 9, 7), '#5fae5a', M(-0.035, 0.03, 0.03, 1)],
      [new THREE.SphereGeometry(0.012, 6, 5), '#ff8fab', M(0.02, 0.075, 0.01, 1)],
    ]);
  }

  // Rivières : un demi-segment d'eau de chaque case vers chacune de ses voisines reliées (amont et aval),
  // posé à la hauteur de la case ; on voit de petites cascades entre deux terrasses.
  buildRivers(state) {
    const segs = [];
    const W = this.W;
    state.map.tiles.forEach((t, i) => {
      if (!t.river) return;
      segs.push({ i, dx: 0, dy: 0, center: true });
      const to = state.map.tiles[t.riverTo];
      if (to) segs.push({ i, dx: Math.sign(to.x - t.x), dy: Math.sign(to.y - t.y), mouth: !!state.data.terrain[to.type].water });
      if (to) segs.push({ i, j: t.riverTo, dx: Math.sign(to.x - t.x), dy: Math.sign(to.y - t.y), fall: true }); // cascade entre deux terrasses
    });
    state.map.tiles.forEach((t, i) => { // côté aval : demi-segment depuis chaque affluent
      if (!t.river) return;
      const to = state.map.tiles[t.riverTo];
      if (to && to.river) segs.push({ i: t.riverTo, dx: Math.sign(t.x - to.x), dy: Math.sign(t.y - to.y) });
    });
    this.riverSegs = segs;
    const mat = new THREE.MeshStandardMaterial({ color: '#6cc4ee', roughness: 0.25, metalness: 0.05, emissive: '#1d6fa5', emissiveIntensity: 0.08 });
    this.rivers = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 0.03, 0.26, 1, 0.012), mat, Math.max(1, segs.length));
    this.rivers.receiveShadow = true;
    this.scene.add(this.rivers);
  }
  refreshRivers() {
    if (!this.rivers) return;
    const p = this.state.players[this.viewer];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    this.riverSegs.forEach((sg, k) => {
      const t = this.state.map.tiles[sg.i];
      const ex = p.explored[sg.i] === 1;
      const h = this.heights[sg.i] + 0.012;
      if (sg.fall) {
        const h2 = this.heights[sg.j] + (this.state.data.terrain[this.state.map.tiles[sg.j].type].water ? 0.008 : 0.012);
        const drop = h - h2;
        q.setFromAxisAngle(Y, sg.dx ? 0 : Math.PI / 2);
        const show = ex && drop > 0.02;
        m.compose(v.set(this.wx(t.x) + sg.dx * 0.5, h2 + drop / 2, this.wz(t.y) + sg.dy * 0.5), q, sc.set(show ? 0.06 : 0.0001, show ? drop / 0.03 : 0.0001, show ? 1 : 0.0001));
      } else if (sg.center) { q.identity(); m.compose(v.set(this.wx(t.x), h, this.wz(t.y)), q, sc.set(ex ? 0.24 : 0.0001, 1, ex ? 1 : 0.0001)); }
      else {
        q.setFromAxisAngle(Y, sg.dx ? 0 : Math.PI / 2);
        const len = sg.mouth ? 0.62 : 0.5;
        m.compose(v.set(this.wx(t.x) + sg.dx * len / 2, h, this.wz(t.y) + sg.dy * len / 2), q, sc.set(ex ? len : 0.0001, 1, ex ? 1 : 0.0001));
      }
      this.rivers.setMatrixAt(k, m);
    });
    this.rivers.instanceMatrix.needsUpdate = true;
  }

  // Écume blanche le long des rivages (côté eau).
  buildFoam(state) {
    const edges = [];
    state.map.tiles.forEach((t) => {
      if (!state.data.terrain[t.type].water) return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = t.x + dx, ny = t.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) continue;
        const n = state.map.tiles[ny * this.W + nx];
        if (!state.data.terrain[n.type].water) edges.push({ t, dx, dy });
      }
    });
    this.foamEdges = edges;
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, transparent: true, opacity: 0.75, depthWrite: false });
    this.foam = new THREE.InstancedMesh(new RoundedBoxGeometry(0.9, 0.02, 0.08, 1, 0.01), mat, Math.max(1, edges.length));
    this.foam.renderOrder = 2;
    this.decor.push(this.foam);
  }

  // Quelques nuages qui dérivent lentement et projettent une ombre douce.
  buildClouds() {
    if (this.clouds) for (const c of this.clouds) this.scene.remove(c);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.8, depthWrite: false });
    const geo = this.mergedGeo([
      [new THREE.SphereGeometry(0.6, 12, 9), '#ffffff', new THREE.Matrix4().makeScale(1.2, 0.55, 0.9)],
      [new THREE.SphereGeometry(0.45, 12, 9), '#ffffff', new THREE.Matrix4().compose(new THREE.Vector3(0.65, 0.05, 0.1), new THREE.Quaternion(), new THREE.Vector3(1, 0.6, 0.9))],
      [new THREE.SphereGeometry(0.42, 12, 9), '#f6f6f6', new THREE.Matrix4().compose(new THREE.Vector3(-0.6, 0, -0.1), new THREE.Quaternion(), new THREE.Vector3(1, 0.55, 0.85))],
    ]);
    mat.vertexColors = true;
    this.clouds = [];
    const n = Math.round((this.W * this.H) / 160);
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(geo, mat);
      c.castShadow = true;
      c.position.set((Math.random() - 0.5) * (this.W + 10), 5 + Math.random() * 1.5, (Math.random() - 0.5) * this.H);
      c.scale.setScalar(0.7 + Math.random() * 0.8);
      this.clouds.push(c); this.scene.add(c);
    }
  }
  driftClouds(dt) {
    const half = this.W / 2 + 8;
    // De près, les nuages s'effacent progressivement pour ne jamais gêner la lecture de la carte.
    const d = this.camera.position.distanceTo(this.controls.target);
    const k = Math.min(1, Math.max(0, (d - 18) / 14));
    this.clouds[0].material.opacity = 0.8 * k;
    for (const c of this.clouds) {
      if (!this.reducedMotion) c.position.x += dt * 0.25;
      if (c.position.x > half) c.position.x = -half;
      c.visible = k > 0.02;
    }
  }

  refreshDecor(occupied, visible) {
    const s = this.state, p = s.players[this.viewer];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    const Y = new THREE.Vector3(0, 1, 0);
    for (const mesh of this.decor) {
      if (!mesh.userData.slots) continue;
      mesh.userData.slots.forEach((sl, k) => {
        q.setFromAxisAngle(Y, sl.rot || 0);
        const i = sl.t.y * this.W + sl.t.x;
        const show = p.explored[i] === 1 && !occupied.has(i) && !s.cities.some((ct) => ct.x === sl.t.x && ct.y === sl.t.y);
        const h = this.heights[i];
        m.compose(v.set(this.wx(sl.t.x) + sl.dx, h + 0.012, this.wz(sl.t.y) + sl.dz), q, sc.setScalar(show ? sl.sc : 0.0001));
        mesh.setMatrixAt(k, m);
        if (mesh.userData.kind) {
          c.set(mesh.userData.kind === 'flower' ? sl.c : (k % 2 ? '#6fb85a' : '#89c766'));
          if (!visible[i]) c.lerp(new THREE.Color('#9a948f'), 0.35);
          mesh.setColorAt(k, c);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  // Cases actuellement vues (unités, villes, bâtiments) : le reste de l'exploré est « en mémoire ».
  computeVisible() {
    const s = this.state, vis = new Uint8Array(s.map.tiles.length);
    const mark = (x, y, r) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + r) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.W && ny < this.H) vis[ny * this.W + nx] = 1;
      }
    };
    for (const c of s.cities) if (c.owner === this.viewer) mark(c.x, c.y, c.radius + 2);
    for (const u of s.units) if (u.owner === this.viewer) mark(u.x, u.y, (s.data.unitsById[u.type].vision || 2) + 0);
    for (const b of s.buildings) if (b.owner === this.viewer) mark(b.x, b.y, 1);
    for (const e of s.embassies || []) if (e.from === this.viewer) { const c = s.cities.find((x) => x.id === e.cityId); if (c) mark(c.x, c.y, 2); }
    this.visible = vis;
    return vis;
  }

  refreshTerrain() {
    const s = this.state, p = s.players[this.viewer];
    const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const vis = this.computeVisible();
    const memo = new THREE.Color('#a59e98'), tint = new THREE.Color();
    s.map.tiles.forEach((t, i) => {
      const ex = p.explored[i] === 1;
      const h = this.tileHeight(t, ex);
      this.heights[i] = h;
      m.compose(v.set(this.wx(t.x), h / 2, this.wz(t.y)), q, sc.set(ex ? 1 : 1.021, h, ex ? 1 : 1.021));
      this.tiles.setMatrixAt(i, m);
      c.set(ex ? s.data.terrain[t.type].color : FOG_COLOR);
      const reg = s.rules.regions?.[this.climate?.[i]];
      if (ex && reg && !s.data.terrain[t.type].water && t.type !== 'snow') c.lerp(tint.set(reg.tint), reg.tintAmount * (t.type === 'mountain' ? 0.4 : 1));
      if (ex && !s.data.terrain[t.type].water) c.offsetHSL(0, 0, ((t.x * 7 + t.y * 13) % 5) * 0.006 - 0.012);
      if (ex && !vis[i]) c.lerp(memo, 0.38);
      this.tiles.setColorAt(i, c);
    });
    this.tiles.instanceMatrix.needsUpdate = true; this.tiles.instanceColor.needsUpdate = true;
    const occupied = new Set();
    s.map.tiles.forEach((t, i) => { if (t.natural) occupied.add(i); }); // le décor s'efface sous les merveilles naturelles
    for (const b of s.buildings) {
      const f = s.data.buildingsById[b.type].footprint || 1;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) occupied.add((b.y + dy) * this.W + b.x + dx);
    }
    this.refreshDecor(occupied, vis);
    this.refreshRivers();
    const wq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    this.waterTiles.forEach((t, k) => {
      const i = t.y * this.W + t.x;
      const ex = p.explored[i] === 1;
      m.compose(v.set(this.wx(t.x), this.heights[i] + 0.008, this.wz(t.y)), wq, sc.set(ex ? 1 : 0.0001, ex ? 1 : 0.0001, 1));
      this.water.setMatrixAt(k, m);
    });
    this.water.instanceMatrix.needsUpdate = true;
    const fq = new THREE.Quaternion(), fv = new THREE.Vector3(), fs = new THREE.Vector3();
    this.foamEdges.forEach((e, k) => {
      const i = e.t.y * this.W + e.t.x;
      const ex = p.explored[i] === 1;
      fq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.dx ? Math.PI / 2 : 0);
      m.compose(fv.set(this.wx(e.t.x) + e.dx * 0.43, this.heights[i] + 0.012, this.wz(e.t.y) + e.dy * 0.43), fq, fs.setScalar(ex ? 1 : 0.0001));
      this.foam.setMatrixAt(k, m);
    });
    this.foam.instanceMatrix.needsUpdate = true;
    this.treeSlots.forEach((sl, k) => {
      const i = sl.t.y * this.W + sl.t.x;
      const ex = p.explored[i] === 1 && sl.t.type === 'forest' && !occupied.has(i) && this.climate?.[i] !== 'north';
      const k0 = ex ? sl.s : 0.0001;
      m.compose(v.set(this.wx(sl.t.x) + sl.dx, this.heights[i] + 0.11 * sl.s, this.wz(sl.t.y) + sl.dz), q, sc.setScalar(k0));
      this.trunks.setMatrixAt(k, m);
      m.compose(v.set(this.wx(sl.t.x) + sl.dx, this.heights[i] + 0.3 * sl.s, this.wz(sl.t.y) + sl.dz), q, sc.set(k0, k0 * 1.1, k0));
      this.trees.setMatrixAt(k, m);
      this.trees.setColorAt(k, c.set(k % 3 === 0 ? '#86c96a' : k % 3 === 1 ? '#5fae5a' : '#4f9e55'));
      if (!vis[i]) this.trees.setColorAt(k, c.lerp(memo, 0.35));
    });
    this.trees.instanceMatrix.needsUpdate = true; this.trunks.instanceMatrix.needsUpdate = true;
    if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
    this.peakTiles.forEach((t, k) => {
      const i = t.y * this.W + t.x;
      const ex = p.explored[i] === 1;
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
      const show = ex && !t.natural; // le volcan remplace le pic
      m.compose(v.set(this.wx(t.x), this.heights[i] - 0.02, this.wz(t.y)), rot, sc.set(show ? 1.0 : 0.0001, show ? 1.1 : 0.0001, show ? 1.0 : 0.0001));
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
    this.drawRoads();
    this.drawHighlights();
  }

  // Routes : pointillés qui défilent du centre du réseau (capitale) vers l'extérieur.
  // Elles ne sont affichées qu'en mode « Route » (setRoadsVisible).
  setRoadsVisible(on) {
    this.roadsVisible = on;
    if (this.roadMesh) this.roadMesh.visible = on;
  }

  drawRoads() {
    this.roadMesh = null;
    const s = this.state, p = s.players[this.viewer], W = this.W;
    const cityAtXY = (x, y) => s.cities.find((c) => c.x === x && c.y === y);
    const ownerOf = (t) => (t.road !== -1 ? t.road : cityAtXY(t.x, t.y)?.owner ?? -1);
    const node = (x, y) => x >= 0 && y >= 0 && x < W && y < this.H && (s.map.tiles[y * W + x].road !== -1 || !!cityAtXY(x, y));
    const road = (x, y) => x >= 0 && y >= 0 && x < W && y < this.H && s.map.tiles[y * W + x].road !== -1;
    // Distance au centre (capitale) dans le réseau routier de chaque joueur : donne le sens du défilement.
    const dist = new Map();
    const queue = [];
    for (const c of s.cities) if (c.capital) { dist.set(c.y * W + c.x, 0); queue.push(c); }
    while (queue.length) {
      const t = queue.shift(), d = dist.get(t.y * W + t.x);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = t.x + dx, ny = t.y + dy, ni = ny * W + nx;
        if ((dx || dy) && node(nx, ny) && !dist.has(ni)) { dist.set(ni, d + 1); queue.push({ x: nx, y: ny }); }
      }
    }
    const edges = [];
    s.map.tiles.forEach((t, i) => {
      if (!p.explored[i] || !node(t.x, t.y)) return;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const nx = t.x + dx, ny = t.y + dy;
        if (!node(nx, ny) || (!road(t.x, t.y) && !road(nx, ny))) continue;
        if (dx && dy && (node(t.x + dx, t.y) || node(t.x, t.y + dy))) continue;
        const n = s.map.tiles[ny * W + nx];
        const da = dist.get(i) ?? 99, db = dist.get(ny * W + nx) ?? 99;
        edges.push(da <= db ? [t, n] : [n, t]);
      }
    });
    if (!edges.length) return;
    const geo = new THREE.PlaneGeometry(1, 0.09);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0.5, 0, 0);
    const lens = new Float32Array(edges.length);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, // toujours visibles au-dessus des bâtiments et des arbres
      uniforms: { uTime: this.waterUniform, uSpeed: { value: this.reducedMotion ? 0 : 0.6 } },
      vertexShader: `attribute float aLen; attribute vec3 aColor; varying vec2 vUv; varying float vLen; varying vec3 vColor;
        void main() { vUv = uv; vLen = aLen; vColor = aColor; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uSpeed; varying vec2 vUv; varying float vLen; varying vec3 vColor;
        void main() {
          float d = vUv.x * vLen - uTime * uSpeed;
          float dash = step(fract(d / 0.2), 0.55);
          float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
          if (dash * edge < 0.05) discard;
          gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.15), 0.95 * edge);
        }`,
    });
    const im = new THREE.InstancedMesh(geo, mat, edges.length);
    const colors = new Float32Array(edges.length * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), sc = new THREE.Vector3(), c = new THREE.Color();
    const top = (t) => this.heights[t.y * W + t.x];
    edges.forEach(([a, b], k) => {
      const A = new THREE.Vector3(this.wx(a.x), top(a) + 0.03, this.wz(a.y));
      const B = new THREE.Vector3(this.wx(b.x), top(b) + 0.03, this.wz(b.y));
      const dir = B.clone().sub(A); const len = dir.length(); dir.normalize();
      q.setFromUnitVectors(X, dir);
      m.compose(A, q, sc.set(len, 1, 1));
      im.setMatrixAt(k, m);
      lens[k] = len;
      const own = ownerOf(a) !== -1 ? ownerOf(a) : ownerOf(b);
      c.set(own >= 0 ? s.players[own].color : '#ffffff');
      colors.set([c.r, c.g, c.b], k * 3);
    });
    geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(lens, 1));
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    im.renderOrder = 10;
    im.visible = !!this.roadsVisible;
    this.roadMesh = im;
    this.dynamic.add(im);
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
        const prefix = key.split(':')[0] + ':';
        const prev = [...this.entityObjs.keys()].find((k) => k.startsWith(prefix));
        obj = make(); obj.position.copy(target); obj.userData.path = [];
        if (this.ready && obj.visible !== false && visible(x, y)) this.onAppear(key, prev, obj, target);
        const anims = [];
        obj.traverse((o) => { if (o.userData.anim) { o.userData.base = o.position.clone(); o.userData.phase0 = Math.random() * 6.28; anims.push(o); } });
        obj.userData.anims = anims;
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
      const o = place(`c${c.id}:${Math.min(c.pop, 5)}:${c.capital}:${c.tier || 0}`, () => cityModel(s.players[c.owner].color, c.pop, c.capital, c.tier || 0), c.x, c.y);
      this.label(c, o);
    }
    for (const b of s.buildings) {
      const f = s.data.buildingsById[b.type].footprint || 1;
      const def = s.data.buildingsById[b.type];
      const variant = (((b.x * 73856093) ^ (b.y * 19349663)) >>> 0) % 12;
      const bkey = `b${b.id}:${b.turnsLeft > 0 ? `w${b.turnsLeft}` : 'done'}`;
      const progress = b.turnsLeft > 0 ? 1 - b.turnsLeft / Math.max(1, def.turns) : 1;
      if (f === 1) { place(bkey, () => buildingModel(b.type, b.turnsLeft > 0, b.luxury, variant, progress), b.x, b.y); continue; }
      // Quartier 2×2 : centré sur son empreinte, posé sur la case la plus haute.
      let top = 0;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) top = Math.max(top, this.heights[(b.y + dy) * this.W + b.x + dx]);
      const o = place(bkey, () => buildingModel(b.type, b.turnsLeft > 0, undefined, variant, progress), b.x, b.y);
      o.position.set(this.wx(b.x) + (f - 1) / 2, top, this.wz(b.y) + (f - 1) / 2);
    }
    s.map.tiles.forEach((t, i) => {
      if (t.natural) place(`nat${i}`, () => naturalModel(t.natural), t.x, t.y, s.data.terrain[t.type].water ? 0.02 : 0);
      if (t.ruin) place(`ruin${i}`, () => ruinModel(), t.x, t.y);
      if (!t.luxury || s.buildings.some((b) => b.x === t.x && b.y === t.y)) return;
      place(`lux${i}`, () => luxuryModel(t.luxury), t.x, t.y);
    });
    for (const u of s.units) {
      const stack = s.units.filter((o) => o.x === u.x && o.y === u.y);
      const k = stack.indexOf(u);
      const city = s.cities.some((c) => c.x === u.x && c.y === u.y);
      const off = new THREE.Vector3((k - (stack.length - 1) / 2) * 0.28 + (city ? 0.3 : 0), s.data.unitsById[u.type].flying ? 0.7 : 0, city ? 0.3 : 0);
      const uo = place(`u${u.id}`, () => { const g = unitModel(u.type, s.players[u.owner].color, u.owner); g.userData.isUnit = true; return g; }, u.x, u.y, city ? 0.05 : 0, off);
      if (u.owner !== this.viewer && this.visible) uo.visible = uo.visible && this.visible[u.y * this.W + u.x] === 1; // unités étrangères : seulement si vues
    }
    for (const [key, obj] of this.entityObjs) {
      if (!seen.has(key)) { this.entities.remove(obj); this.entityObjs.delete(key); }
    }
    this.ready = true;
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

  // ------------------------------------------------------------- effets
  // Apparition d'un objet : achèvement d'un chantier, nouvelle ville, ville qui grandit, nouvelle unité.
  onAppear(key, prevKey, obj, at) {
    if (this.reducedMotion) return;
    const kind = key[0];
    if (kind === 'b' && key.endsWith(':done') && prevKey && prevKey.includes(':w')) {
      this.popIn(obj, 0.65, 0.7); this.dust(at, 10, 0.55); this.sparkles(at);
    } else if (kind === 'b' && !prevKey) {
      this.dust(at, 6, 0.4);
    } else if (kind === 'c') {
      this.popIn(obj, prevKey ? 0.85 : 0.5, prevKey ? 0.45 : 0.8);
      if (!prevKey) { this.dust(at, 12, 0.6); this.sparkles(at); }
    } else if (kind === 'u' && !prevKey) {
      this.popIn(obj, 0.4, 0.5);
    }
  }
  addEffect(obj, dur, update) {
    this.effects = this.effects || [];
    if (obj && !obj.parent) this.scene.add(obj);
    this.effects.push({ obj, t: 0, dur, update });
  }
  popIn(obj, from, dur) {
    const base = obj.scale.clone();
    obj.scale.copy(base).multiplyScalar(from);
    this.addEffect(null, dur, (k) => {
      const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // léger dépassement puis retour
      obj.scale.copy(base).multiplyScalar(from + (1 - from) * Math.min(1.08, e));
      if (k >= 1) obj.scale.copy(base);
    });
  }
  dust(at, n, dur) {
    if (!this.dustGeo) { this.dustGeo = new THREE.SphereGeometry(0.05, 8, 6); this.dustMat = new THREE.MeshStandardMaterial({ color: '#efe4d6', roughness: 1, transparent: true, opacity: 0.8, depthWrite: false }); }
    const g = new THREE.Group();
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.dustGeo, this.dustMat);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      m.userData.dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      g.add(m); puffs.push(m);
    }
    g.position.copy(at).add(new THREE.Vector3(0, 0.06, 0));
    this.addEffect(g, dur, (k) => {
      for (const m of puffs) { m.position.copy(m.userData.dir).multiplyScalar(0.12 + k * 0.45); m.position.y = k * 0.12; m.scale.setScalar((1 - k) * 1.4 + 0.2); }
      if (k >= 1) this.scene.remove(g);
    });
  }
  sparkles(at) {
    if (!this.sparkGeo) { this.sparkGeo = new THREE.OctahedronGeometry(0.03, 0); this.sparkMat = new THREE.MeshBasicMaterial({ color: '#ffd23f' }); }
    const g = new THREE.Group();
    const items = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      m.userData.a = (i / 8) * Math.PI * 2; m.userData.h = 0.4 + Math.random() * 0.35;
      g.add(m); items.push(m);
    }
    g.position.copy(at);
    this.addEffect(g, 1.1, (k) => {
      for (const m of items) {
        const r = 0.15 + k * 0.3;
        m.position.set(Math.cos(m.userData.a + k * 2) * r, 0.2 + m.userData.h * Math.sin(k * Math.PI), Math.sin(m.userData.a + k * 2) * r);
        m.rotation.y += 0.2; m.scale.setScalar(1 - k * 0.8);
      }
      if (k >= 1) this.scene.remove(g);
    });
  }
  updateEffects(dt) {
    if (!this.effects?.length) return;
    this.effects = this.effects.filter((e) => { e.t += dt; const k = Math.min(1, e.t / e.dur); e.update(k); return k < 1; });
  }

  // Animations légères : fumée, rotations, drapeaux, balancement.
  animate(dt) {
    const t = this.time;
    for (const obj of this.entityObjs.values()) {
      if (!obj.visible || !obj.userData.anims?.length) continue;
      for (const o of obj.userData.anims) {
        const a = o.userData.anim, ph = o.userData.phase0;
        if (a.type === 'spin') o[a.axis === 'z' ? 'rotateZ' : a.axis === 'x' ? 'rotateX' : 'rotateY'](a.speed * dt);
        else if (a.type === 'flag') o.rotation.y = Math.sin(t * 3 + ph) * 0.35;
        else if (a.type === 'bob') o.position.y = o.userData.base.y + Math.sin(t * a.speed + ph) * a.amp;
        else if (a.type === 'smoke') {
          o.children.forEach((c) => {
            const f = (t * 0.35 + c.userData.phase + ph) % 1;
            c.position.set(Math.sin((f + ph) * 6) * 0.02, f * 0.32, 0);
            c.scale.setScalar(0.6 + f * 1.4);
            c.visible = f < 0.92;
          });
        }
      }
    }
  }

  resetLight() {
    this.sun.position.set(-14, 26, 12); this.sun.intensity = 2.0; this.sun.color.set('#fff1dc'); this.hemi.intensity = 1.9;
  }

  // Cycle jour / nuit très doux : le soleil tourne lentement, la lumière se réchauffe puis se refroidit.
  updateLight() {
    const k = (Math.sin(this.time * (2 * Math.PI / 240)) + 1) / 2; // 0 = soir doré, 1 = plein jour
    const ang = -0.9 + k * 0.6;
    this.sun.position.set(Math.cos(ang) * 18, 20 + k * 8, Math.sin(ang) * 18 + 6);
    this.sun.intensity = 1.7 + k * 0.5;
    this.sun.color.setRGB(1, 0.86 + k * 0.1, 0.72 + k * 0.18);
    this.hemi.intensity = 1.75 + k * 0.25;
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
    this.time += dt;
    this.waterUniform.value = this.time;
    if (!this.reducedMotion) this.animate(dt);
    this.updateEffects(dt);
    if (this.clouds) this.driftClouds(dt);
    if (this.dayNight && !this.reducedMotion) this.updateLight();
    for (const obj of this.entityObjs.values()) {
      if (!obj.userData.isUnit) continue;
      const path = obj.userData.path;
      if (!path.length) continue;
      const d = path[0].clone().sub(obj.position);
      const step = dt * 5;
      obj.userData.dustT = (obj.userData.dustT || 0) + dt;
      if (!this.reducedMotion && obj.userData.dustT > 0.18 && obj.visible) { obj.userData.dustT = 0; this.dust(obj.position.clone(), 3, 0.45); }
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

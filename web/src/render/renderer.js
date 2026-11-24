// Rendu Three.js : terrain en relief (cases rectangulaires), territoires, routes, bâtiments et unités 3D.
import * as THREE from 'three';
import { MapControls } from 'three/addons/MapControls.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { cityModel, buildingModel, unitModel, luxuryModel, naturalModel, ruinModel, prepareAnims, animateParts } from './models.js';
import { seasonOf } from '../core/society.js';
import { Villagers } from './villagers.js';
import { Ambience } from './ambience.js';

const FOG_COLOR = new THREE.Color('#e4dcd6');
const BG = '#efe8e4';
const EVENING_SKY = new THREE.Color('#ffc9a0'), EVENING_BG = new THREE.Color('#f6d3bb');
const ANIM_MAX_DIST = 26; // distance caméra–cible au-delà de laquelle les bâtiments ne s'animent plus

// Fantôme d'un bâtiment prévu : matériaux clonés, translucides et teintés de bleu.
function ghostModel(g) {
  g.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material).map((m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.55; c.depthWrite = false; if (c.color) c.color.lerp(new THREE.Color('#8fc3ff'), 0.55); if (c.emissive) c.emissive.set('#1d4f8a'); return c; });
    o.material = Array.isArray(o.material) ? mats : mats[0];
    o.castShadow = false;
  });
  g.userData.ghost = true;
  return g;
}
// Drapeau de repère : mât fin et fanion coloré.
function markerPin(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 6), new THREE.MeshStandardMaterial({ color: '#5b4636', roughness: 0.8 }));
  pole.position.y = 0.31; g.add(pole);
  const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(0.3, 0.51, 0), new THREE.Vector3(0, 0.42, 0)]), new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide }));
  flag.geometry.computeVertexNormals(); g.add(flag);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  base.position.y = 0.015; g.add(base);
  return g;
}

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

    this.animMaxDist = ANIM_MAX_DIST;
    this.villagers = new Villagers(this);
    this.ambience = new Ambience(this);
    this.bgColor = new THREE.Color(BG); this.seasonSky = new THREE.Color(BG);
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
    if (!explored) return 0.01; // nettement sous la surface du plateau (y = 0,05) : l'inconnu est une étendue lisse, sans grille
    if (ter.water) return ter.height;
    // Relief quantifié par paliers de 0,06 : les cases voisines de même altitude forment de vrais plateaux.
    return ter.height + Math.round(((t.e - 0.4) * 0.35) / 0.06) * 0.06;
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
    if (this.tiles) { this.scene.remove(this.tiles, this.trees, this.trunks, ...this.peaks, this.base, this.board, this.water, ...(this.decor || [])); }
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
    this.tiles = new THREE.InstancedMesh(new RoundedBoxGeometry(0.985, 1, 0.985, 1, 0.05), tileMat, n);
    this.tiles.receiveShadow = true; this.tiles.castShadow = true;

    const forests = state.map.tiles.filter((t) => t.type === 'forest');
    this.treeSlots = [];
    for (const t of forests) for (let k = 0; k < 3; k++) {
      const r = ((t.x * 73856093) ^ (t.y * 19349663) ^ (k * 83492791)) >>> 0;
      this.treeSlots.push({ t, dx: ((r % 100) / 100 - 0.5) * 0.55, dz: (((r >> 8) % 100) / 100 - 0.5) * 0.55, s: 0.8 + ((r >> 16) % 40) / 100 });
    }
    this.trees = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 11, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), this.treeSlots.length);
    this.trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 8), new THREE.MeshStandardMaterial({ color: '#8a5634', roughness: 0.8 }), this.treeSlots.length);
    this.trees.castShadow = true; this.trunks.castShadow = true;
    // Montagnes : pics arrondis à couleurs de sommets, 2 silhouettes × (rocheuse | enneigée), rotation et taille variées.
    this.climate = this.computeClimate(state);
    const highs = state.map.tiles.filter((t) => t.type === 'mountain' || t.type === 'snow');
    const peakMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
    this.peakTiles = highs;
    this.peaks = [0, 1, 2, 3].map((k) => {
      const list = highs.filter((t) => this.peakKind(t) === k);
      const im = new THREE.InstancedMesh(this.mountainGeo(k >> 1, k & 1), peakMat, Math.max(1, list.length));
      im.userData.list = list; im.castShadow = true; im.receiveShadow = true;
      return im;
    });
    // Plateau de jeu : la carte repose sur un socle d'argile posé sur la table, au lieu d'une grille infinie.
    this.board = new THREE.Mesh(new RoundedBoxGeometry(this.W + 1.4, 0.7, this.H + 1.4, 3, 0.32), new THREE.MeshStandardMaterial({ color: '#e8ddd2', roughness: 0.9 }));
    this.board.position.y = -0.3; this.board.receiveShadow = true; this.board.castShadow = true;
    this.base = new THREE.Mesh(new THREE.PlaneGeometry(this.W + 80, this.H + 80), new THREE.MeshStandardMaterial({ color: BG, roughness: 1 }));
    this.base.rotation.x = -Math.PI / 2; this.base.position.y = -0.65;
    this.base.receiveShadow = true;
    this.scene.add(this.base, this.board, this.tiles, this.trunks, this.trees, ...this.peaks);
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
  }

  // 0-1 : silhouette (pic et contreforts | deux sommets) ; +2 : enneigée (neige éternelle, nord).
  peakKind(t) {
    const h = (((t.x * 73856093) ^ (t.y * 19349663)) >>> 0) % 2;
    const snowy = t.type === 'snow' || this.climate?.[t.y * this.W + t.x] === 'north';
    return h * 2 + (snowy ? 1 : 0);
  }
  mountainGeo(shape, snowy) {
    const M = (x, z, s, sy = s) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(s, sy, s));
    // Profil arrondi (tour) : base large, flancs bombés, sommet émoussé.
    const prof = [[0.4, 0], [0.37, 0.1], [0.3, 0.24], [0.21, 0.38], [0.12, 0.5], [0.05, 0.57], [0, 0.59]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(prof, 16);
    const capFrom = snowy ? 2 : 4;
    const capProf = prof.slice(capFrom).map((v, k) => new THREE.Vector2(v.x * 1.08 + (k === 0 ? 0.02 : 0.006), v.y + 0.006));
    const cap = new THREE.LatheGeometry(capProf, 16);
    const rock = ['#d2c8bd', '#c6bbaf', '#dbd2c8'], snow = '#ffffff';
    const peaks = shape === 0
      ? [[0, 0, 1, 1, 0], [0.22, 0.16, 0.55, 0.62, 1], [-0.2, 0.2, 0.42, 0.5, 2]]
      : [[-0.11, -0.05, 0.85, 0.95, 0], [0.15, 0.08, 0.7, 0.8, 1], [0.02, 0.26, 0.38, 0.42, 2]];
    const parts = [];
    for (const [x, z, s, sy, c] of peaks) {
      parts.push([body, rock[c], M(x, z, s, sy)]);
      if (s > 0.5 || snowy) parts.push([cap, snow, M(x, z, s, sy)]);
    }
    parts.push([new THREE.DodecahedronGeometry(0.06, 1), '#a39a90', M(0.3, -0.22, 1, 0.7)], [new THREE.DodecahedronGeometry(0.045, 1), '#b3aaa0', M(-0.3, -0.18, 1, 0.7)]);
    return this.mergedGeo(parts);
  }
  // Source d'une rivière : petit bassin cerclé de galets, adossé à des rochers moussus (orienté vers l'aval).
  springGeo() {
    const M = (x, y, z, s, sy = s, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, sy, s));
    const parts = [
      [new THREE.CylinderGeometry(0.17, 0.18, 0.02, 20), '#7cc36b', M(0, 0.008, 0, 1)],           // tapis d'herbe
      [new THREE.CylinderGeometry(0.13, 0.13, 0.012, 20), '#8ed3f2', M(0, 0.02, 0, 1)],          // bord clair
      [new THREE.CylinderGeometry(0.105, 0.105, 0.012, 20), '#4fa9df', M(0, 0.024, 0, 1)],       // eau profonde
      [new THREE.DodecahedronGeometry(0.075, 1), '#a59c92', M(-0.13, 0.04, 0, 1, 0.85)],          // rochers en amont
      [new THREE.DodecahedronGeometry(0.055, 1), '#b5aca2', M(-0.1, 0.035, -0.1, 1, 0.8)],
      [new THREE.DodecahedronGeometry(0.05, 1), '#9d948a', M(-0.09, 0.03, 0.11, 1, 0.8)],
      [new THREE.SphereGeometry(0.04, 8, 6), '#6fb85a', M(-0.15, 0.1, 0.01, 1, 0.6)],            // mousse
      [new THREE.SphereGeometry(0.025, 8, 6), '#86c96a', M(-0.08, 0.075, -0.12, 1, 0.6)],
    ];
    for (let k = 0; k < 7; k++) { // galets autour du bassin, côté aval ouvert
      const a = Math.PI * 0.62 + (k / 6) * Math.PI * 0.76;
      parts.push([new THREE.SphereGeometry(0.022, 7, 5), k % 2 ? '#d8d0c6' : '#c4bbb1', M(Math.cos(a) * 0.125, 0.026, Math.sin(a) * 0.125, 1, 0.6)]);
    }
    return this.mergedGeo(parts);
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

  // Rivières : un ruban d'eau fin et courbe qui suit le relief. On relie les centres des cases (avec un léger
  // méandre), on lisse par une spline, et la largeur grandit avec le débit (nombre de cases en amont).
  // L'eau s'écoule doucement le long du ruban ; une petite chute marque chaque changement de terrasse.
  buildRivers(state) {
    const tiles = state.map.tiles, W = this.W;
    const up = new Map();
    tiles.forEach((t, i) => { if (t.river) { if (!up.has(t.riverTo)) up.set(t.riverTo, []); up.get(t.riverTo).push(i); } });
    const flow = new Map();
    const flowOf = (i) => { if (flow.has(i)) return flow.get(i); let f = 1; for (const j of up.get(i) || []) f += flowOf(j); flow.set(i, f); return f; };
    // Chaînes : de chaque source jusqu'à la mer, ou jusqu'à la rivière qu'elle rejoint (la jonction est incluse).
    const chains = [];
    tiles.forEach((t, i) => {
      if (!t.river || (up.get(i) || []).length) return;
      const chain = [i];
      let cur = t;
      while (cur.river) {
        const nx = cur.riverTo;
        chain.push(nx);
        const n = tiles[nx];
        if (!n.river || chains.some((c) => c.includes(nx))) break;
        cur = n;
      }
      chains.push(chain);
    });
    // Les affluents qui rejoignent une chaîne déjà tracée s'arrêtent à la jonction ; la chaîne principale doit
    // donc être tracée avant eux : on trie par longueur décroissante puis on recoupe.
    chains.sort((a, b) => b.length - a.length);
    const seen = new Set();
    this.riverChains = chains.map((c) => {
      const out = [];
      for (const i of c) { out.push(i); if (seen.has(i) && out.length > 1) break; seen.add(i); }
      return out;
    }).filter((c) => c.length >= 2);
    this.riverFlow = flow; tiles.forEach((t, i) => { if (t.river) flowOf(i); });
    // Sources : cases de rivière sans amont.
    this.springs = this.riverChains.filter((c) => !(up.get(c[0]) || []).length).map((c) => ({ i: c[0], to: c[1] }));
    this.springSet = new Set(this.springs.map((sp) => sp.i));
    if (this.springMesh) this.scene.remove(this.springMesh);
    this.springMesh = new THREE.InstancedMesh(this.springGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), Math.max(1, this.springs.length));
    this.springMesh.receiveShadow = true; this.springMesh.castShadow = true;
    this.scene.add(this.springMesh);
    const u = this.waterUniform;
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.95, depthWrite: false });
    const speed = { value: this.reducedMotion ? 0 : 0.5 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = u; sh.uniforms.uSpeed = speed;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rv;\nvarying vec2 vRv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRv = rv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSpeed;\nvarying vec2 vRv;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float edge = abs(vRv.y * 2.0 - 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.95, 1.0), smoothstep(0.55, 1.0, edge) * 0.55);
          float ripple = sin(vRv.x * 9.0 - uTime * uSpeed * 6.0 + vRv.y * 3.0) * sin(vRv.x * 3.7 - uTime * uSpeed * 2.5);
          diffuseColor.rgb += smoothstep(0.6, 1.0, ripple) * 0.18 * (1.0 - edge);`);
    };
    this.rivers = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.rivers.renderOrder = 1;
    this.rivers.receiveShadow = true;
    this.scene.add(this.rivers);
  }
  refreshRivers() {
    if (!this.rivers) return;
    const s = this.state, p = s.players[this.viewer], tiles = s.map.tiles;
    const hash = (x, y, k) => (((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) / 4294967296;
    const pos = [], col = [], rv = [], idx = [];
    const deep = new THREE.Color('#58b4e6'), light = new THREE.Color('#8ed3f2');
    for (const chain of this.riverChains) {
      // Points de contrôle : centres des cases, décalés perpendiculairement au courant (méandre).
      const pts = chain.map((i, k) => {
        const t = tiles[i];
        const prev = tiles[chain[Math.max(0, k - 1)]], next = tiles[chain[Math.min(chain.length - 1, k + 1)]];
        let dx = next.x - prev.x, dz = next.y - prev.y;
        const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        const wob = k === 0 || k === chain.length - 1 ? 0 : (hash(t.x, t.y, 7) - 0.5) * 0.36;
        const water = s.data.terrain[t.type].water;
        const off = k === 0 && t.luxury && this.springSet.has(i) ? 0.27 : 0;
        return { x: this.wx(t.x) - dz * wob + (next.x - t.x) * off, z: this.wz(t.y) + dx * wob + (next.y - t.y) * off, h: this.heights[i] + (water ? 0.01 : 0.014), ex: p.explored[i] === 1, water, i };
      });
      // L'embouchure s'arrête au bord de l'eau, pas au centre de la case de mer.
      const last = pts[pts.length - 1], before = pts[pts.length - 2];
      if (last.water) { last.x = before.x + (last.x - before.x) * 0.6; last.z = before.z + (last.z - before.z) * 0.6; last.h = before.h; }
      const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      const steps = 8;
      let arc = 0, prevPt = null, base = -1;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[k], c = pts[k + 1], d = pts[Math.min(pts.length - 1, k + 2)];
        const fw = (j) => { const f = this.riverFlow.get(pts[j].i) || 1; return Math.min(0.15, (j === 0 && this.springSet.has(pts[j].i) ? 0.03 : 0.045) + 0.022 * Math.sqrt(f)); };
        for (let st = (k === 0 ? 0 : 1); st <= steps; st++) {
          const t = st / steps;
          const x = cr(a.x, b.x, c.x, d.x, t), z = cr(a.z, b.z, c.z, d.z, t);
          // Hauteur : plate sur chaque case, chute rapide juste après le bord de la terrasse.
          const drop = c.h < b.h ? THREE.MathUtils.smoothstep(t, 0.5, 0.56) : THREE.MathUtils.smoothstep(t, 0.44, 0.5); // la chute tombe devant la paroi de la terrasse
          const h = b.h + (c.h - b.h) * drop;
          const visible = b.ex && c.ex;
          if (!visible) { prevPt = null; base = -1; continue; }
          const w = fw(k) + (fw(k + 1) - fw(k)) * t;
          if (prevPt) arc += Math.hypot(x - prevPt.x, z - prevPt.z);
          // Direction locale pour la largeur
          const t2 = Math.min(1, t + 0.02), t1 = Math.max(0, t - 0.02);
          let tx = cr(a.x, b.x, c.x, d.x, t2) - cr(a.x, b.x, c.x, d.x, t1), tz = cr(a.z, b.z, c.z, d.z, t2) - cr(a.z, b.z, c.z, d.z, t1);
          const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
          const nx = -tz * w / 2, nz = tx * w / 2;
          const vi = pos.length / 3;
          pos.push(x + nx, h, z + nz, x - nx, h, z - nz);
          const cc = deep.clone().lerp(light, 0.5 - 0.5 * Math.cos(arc * 1.3));
          col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
          rv.push(arc, 0, arc, 1);
          if (base >= 0) idx.push(vi - 2, vi, vi - 1, vi - 1, vi, vi + 1);
          base = vi; prevPt = { x, z };
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('rv', new THREE.Float32BufferAttribute(rv, 2));
    g.setIndex(idx);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    this.rivers.geometry.dispose();
    this.rivers.geometry = g;
    // Bassins des sources, tournés vers la case aval.
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    this.springs.forEach((sp, k) => {
      const t = tiles[sp.i], n = tiles[sp.to];
      q.setFromAxisAngle(Y, Math.atan2(-(n.y - t.y), n.x - t.x));
      const off = t.luxury ? 0.27 : 0; // une ressource rare occupe le centre : le bassin glisse vers l'aval
      m.compose(v.set(this.wx(t.x) + (n.x - t.x) * off, this.heights[sp.i] + 0.004, this.wz(t.y) + (n.y - t.y) * off), q, sc.setScalar(p.explored[sp.i] === 1 ? (off ? 0.8 : 1) : 0.0001));
      this.springMesh.setMatrixAt(k, m);
    });
    this.springMesh.instanceMatrix.needsUpdate = true;
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
    this.foam = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.02, 0.08), mat, Math.max(1, edges.length));
    this.foam.renderOrder = 2;
    this.decor.push(this.foam);
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
    const season = seasonOf(s);
    this.seasonId = season?.id;
    this.seasonSky.set({ spring: '#f2ebe6', summer: '#f3eadf', autumn: '#f1e3d6', winter: '#e9ecef' }[season?.id] || BG);
    if (!this.dayNight || this.reducedMotion) { this.scene.background.copy(this.seasonSky); this.scene.fog.color.copy(this.seasonSky); }
    s.map.tiles.forEach((t, i) => {
      const ex = p.explored[i] === 1;
      const h = this.tileHeight(t, ex);
      this.heights[i] = h;
      m.compose(v.set(this.wx(t.x), h / 2, this.wz(t.y)), q, sc.set(1, h, 1));
      this.tiles.setMatrixAt(i, m);
      c.set(ex ? s.data.terrain[t.type].color : FOG_COLOR);
      const reg = s.rules.regions?.[this.climate?.[i]];
      if (ex && reg && !s.data.terrain[t.type].water && t.type !== 'snow') c.lerp(tint.set(reg.tint), reg.tintAmount * (t.type === 'mountain' ? 0.4 : 1));
      // Saisons : neige en hiver (plus marquée au nord), herbes dorées en automne, vert tendre au printemps.
      if (ex && season && !s.data.terrain[t.type].water && t.type !== 'snow' && t.type !== 'sand') {
        const north = this.climate?.[i] === 'north';
        if (season.id === 'winter' && this.climate?.[i] !== 'arid') c.lerp(tint.set('#f3f6f9'), north ? 0.62 : t.type === 'hills' || t.type === 'mountain' ? 0.5 : 0.34);
        else if (season.id === 'autumn' && ['grass', 'plains', 'forest', 'hills'].includes(t.type)) c.lerp(tint.set(t.type === 'forest' ? '#c9782f' : '#d9a050'), t.type === 'hills' ? 0.12 : 0.24);
        else if (season.id === 'spring' && ['grass', 'plains', 'forest'].includes(t.type)) c.lerp(tint.set('#a8e07a'), 0.16);
        else if (season.id === 'summer' && ['grass', 'plains'].includes(t.type)) c.lerp(tint.set('#e3d27a'), 0.08); // herbes blondes
      }
      if (ex && !s.data.terrain[t.type].water) c.offsetHSL(0, 0, ((t.x * 7 + t.y * 13) % 5) * 0.006 - 0.012);
      if (ex && !vis[i]) c.lerp(memo, 0.38);
      this.tiles.setColorAt(i, c);
    });
    this.tiles.instanceMatrix.needsUpdate = true; this.tiles.instanceColor.needsUpdate = true;
    const occupied = new Set();
    s.map.tiles.forEach((t, i) => { if (t.natural) occupied.add(i); }); // le décor s'efface sous les merveilles naturelles
    for (const i of this.springSet || []) occupied.add(i); // et autour des sources
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
      const pal = season?.id === 'autumn' ? ['#e0a43c', '#d9772f', '#c9a23a'] : season?.id === 'winter' ? ['#a9c7b2', '#8fb79c', '#c9dccf'] : season?.id === 'spring' ? ['#9bdc6e', '#6fbf5e', '#f0a8c8'] : ['#86c96a', '#5fae5a', '#4f9e55'];
      this.trees.setColorAt(k, c.set(pal[k % 3]));
      if (!vis[i]) this.trees.setColorAt(k, c.lerp(memo, 0.35));
    });
    this.trees.instanceMatrix.needsUpdate = true; this.trunks.instanceMatrix.needsUpdate = true;
    if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
    const Yax = new THREE.Vector3(0, 1, 0), rot = new THREE.Quaternion();
    for (const im of this.peaks) {
      im.userData.list.forEach((t, k) => {
        const i = t.y * this.W + t.x;
        const show = p.explored[i] === 1 && !t.natural; // le volcan remplace le pic
        const r = (((t.x * 2654435761) ^ (t.y * 40503)) >>> 0) / 4294967296;
        rot.setFromAxisAngle(Yax, Math.floor(r * 4) * (Math.PI / 2) + (r - 0.5) * 0.5);
        const s0 = (t.type === 'snow' ? 1.1 : 0.92) + r * 0.16;
        m.compose(v.set(this.wx(t.x), this.heights[i] - 0.01, this.wz(t.y)), rot, show ? sc.set(s0, s0 * (0.9 + r * 0.25), s0) : sc.setScalar(0.0001));
        im.setMatrixAt(k, m);
        im.setColorAt(k, c.set(vis[i] ? '#ffffff' : '#c9c3be'));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
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
    const veil = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.17, depthWrite: false }), Math.max(1, owned.length));
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
      const border = new THREE.InstancedMesh(new RoundedBoxGeometry(1.0, 0.04, 0.1, 1, 0.02), new THREE.MeshBasicMaterial(), edges.length);
      edges.forEach((e, k) => {
        const horiz = e.dy !== 0;
        const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), horiz ? 0 : Math.PI / 2);
        m.compose(v.set(this.wx(e.t.x) + e.dx * 0.45, e.h + 0.022, this.wz(e.t.y) + e.dy * 0.45), rot, sc.set(1, 1, 1));
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
        obj.userData.anims = prepareAnims(obj); this.smokeDirty = true;
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
      const o = place(`c${c.id}:${Math.min(c.pop, 8)}:${c.capital}:${c.tier || 0}`, () => cityModel(s.players[c.owner].color, c.pop, c.capital, c.tier || 0), c.x, c.y);
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
    // Repères du joueur : drapeaux de couleur et bâtiments prévus en fantôme translucide.
    const MK = { red: '#e5484d', blue: '#3e8ed0', yellow: '#f5b700', violet: '#8e4ec6' };
    for (const k of p.markers || []) {
      const x = k.i % this.W, y = Math.floor(k.i / this.W);
      if (s.buildings.some((b) => b.x === x && b.y === y) || s.cities.some((c) => c.x === x && c.y === y)) continue;
      if (!k.plan) { place(`mk${k.i}:${k.color}`, () => markerPin(MK[k.color] || MK.red), x, y); continue; }
      const f = s.data.buildingsById[k.plan]?.footprint || 1;
      const o = place(`mk${k.i}:${k.plan}`, () => ghostModel(buildingModel(k.plan, false, undefined, 0, 1)), x, y);
      if (f > 1) {
        let top = 0;
        for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) top = Math.max(top, this.heights[Math.min(this.H - 1, y + dy) * this.W + Math.min(this.W - 1, x + dx)]);
        o.position.set(this.wx(x) + (f - 1) / 2, top, this.wz(y) + (f - 1) / 2);
      }
    }
    for (const u of s.units) {
      const stack = s.units.filter((o) => o.x === u.x && o.y === u.y);
      const k = stack.indexOf(u);
      const city = s.cities.some((c) => c.x === u.x && c.y === u.y);
      const off = new THREE.Vector3((k - (stack.length - 1) / 2) * 0.28 + (city ? 0.3 : 0), s.data.unitsById[u.type].flying ? 0.7 : 0, city ? 0.3 : 0);
      const uo = place(`u${u.id}`, () => { const g = unitModel(u.type, s.players[u.owner].color, u.owner); g.userData.isUnit = true; return g; }, u.x, u.y, city ? 0.05 : 0, off);
      const ready = uo.getObjectByName('ready');
      if (ready) ready.visible = u.owner === this.viewer && u.movesLeft > 0 && !s.winner; // anneau : l'unité peut encore se déplacer ce tour
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
    this.villagers.rebuild();
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
  // La fumée (trois bouffées par cheminée, dessinées une à une) disparaît de loin, où elle serait illisible :
  // c'est l'essentiel des appels de dessin économisés en vue d'ensemble.
  setSmokeVisible(on) {
    if (this.smokeOn === on && !this.smokeDirty) return;
    this.smokeOn = on; this.smokeDirty = false;
    for (const obj of this.entityObjs.values()) for (const o of obj.userData.anims || []) if (o.userData.anim.type === 'smoke') o.visible = on;
  }

  // Les animations ne se jouent que de près : au-delà, elles seraient invisibles et coûteraient pour rien.
  animate(dt) {
    const t = this.time;
    const tg = this.controls.target, dist = this.camera.position.distanceTo(tg);
    if (dist > ANIM_MAX_DIST) return;
    const r2 = (dist * 1.1) ** 2; // rayon d'action autour du point visé, proportionnel au zoom
    for (const obj of this.entityObjs.values()) {
      if (!obj.visible || !obj.userData.anims?.length) continue;
      const dx = obj.position.x - tg.x, dz = obj.position.z - tg.z;
      if (dx * dx + dz * dz > r2) continue;
      animateParts(obj.userData.anims, t, dt);
    }
  }

  resetLight() {
    this.sun.position.set(-14, 26, 12); this.sun.intensity = 2.0; this.sun.color.set('#fff1dc'); this.hemi.intensity = 1.9; this.hemi.color.set('#fff8f0');
    this.scene.background.copy(this.seasonSky); this.scene.fog.color.copy(this.seasonSky);
  }

  // Cycle jour / nuit très doux : le soleil tourne lentement, la lumière se réchauffe puis se refroidit.
  updateLight() {
    const k = (Math.sin(this.time * (2 * Math.PI / 240)) + 1) / 2; // 0 = soir doré, 1 = plein jour
    const ang = -0.9 + k * 0.6;
    this.sun.position.set(Math.cos(ang) * 18, 20 + k * 8, Math.sin(ang) * 18 + 6);
    this.sun.intensity = 1.7 + k * 0.5;
    this.sun.color.setRGB(1, 0.74 + k * 0.22, 0.52 + k * 0.38);
    this.hemi.intensity = 1.65 + k * 0.35;
    // Le soir, le ciel et la brume prennent une teinte pêche dorée ; en plein jour, la couleur de la saison.
    const dusk = THREE.MathUtils.smoothstep(1 - k, 0.55, 1);
    this.hemi.color.set('#fff8f0').lerp(EVENING_SKY, dusk * 0.3);
    this.scene.background.copy(this.seasonSky).lerp(EVENING_BG, dusk * 0.55);
    this.scene.fog.color.copy(this.scene.background);
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
    this.setSmokeVisible(this.camera.position.distanceTo(this.controls.target) <= ANIM_MAX_DIST);
    if (!this.reducedMotion) this.animate(dt);
    this.updateEffects(dt);
    this.villagers.update(this.time);
    this.ambience.update(this.time, this.seasonId);
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

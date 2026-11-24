// Ambiance de saison : de petites particules flottent autour du point visé.
// Printemps : pétales roses ; été : aigrettes de pissenlit ; automne : feuilles mortes ; hiver : flocons.
// Un seul maillage instancié (1 appel de dessin), seulement de près, coupé si « Réduire les animations ».
import * as THREE from 'three';

const N = 140;
const KINDS = {
  spring: { colors: ['#f7b6cf', '#fbd3e2', '#ffffff'], size: 0.022, fall: 0.18, sway: 0.35, spin: 2.2, flat: true },
  summer: { colors: ['#fffbe8', '#fff3c4'], size: 0.012, fall: -0.02, sway: 0.25, spin: 0.6, flat: false },
  autumn: { colors: ['#e0892f', '#d9652b', '#e8b33c', '#b8572a'], size: 0.028, fall: 0.3, sway: 0.5, spin: 3.2, flat: true },
  winter: { colors: ['#ffffff', '#f2f7fb'], size: 0.016, fall: 0.26, sway: 0.18, spin: 0.8, flat: false },
};

export class Ambience {
  constructor(renderer) {
    this.r = renderer;
    const leaf = new THREE.CircleGeometry(1, 6).scale(1, 0.62, 1);
    const flake = new THREE.IcosahedronGeometry(1, 0);
    this.meshes = {};
    for (const [id, k] of Object.entries(KINDS)) {
      const m = new THREE.InstancedMesh(k.flat ? leaf : flake, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }), N);
      m.frustumCulled = false; m.visible = false; m.castShadow = false; m.receiveShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) m.setColorAt(i, c.set(k.colors[i % k.colors.length]));
      renderer.scene.add(m);
      this.meshes[id] = m;
    }
    // Graines fixes par particule : position de départ, vitesse, phase.
    this.seeds = Array.from({ length: N }, (_, i) => ({ x: Math.random(), z: Math.random(), y: Math.random(), ph: Math.random() * 6.28, sp: 0.7 + Math.random() * 0.6, i }));
    this.tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3() };
  }

  update(t, seasonId) {
    const R = this.r;
    for (const [id, m] of Object.entries(this.meshes)) m.visible = false;
    const k = KINDS[seasonId];
    if (!k || R.reducedMotion || !R.state) return;
    const tg = R.controls.target, dist = R.camera.position.distanceTo(tg);
    if (dist > R.animMaxDist) return;
    const m = this.meshes[seasonId];
    m.visible = true;
    const span = Math.max(4, dist * 0.9), H = 2.2; // boîte qui suit la caméra
    const { m: mat, q, e, p, s } = this.tmp;
    for (const sd of this.seeds) {
      const y = ((sd.y * H - t * k.fall * sd.sp) % H + H) % H; // retombe en boucle
      const x = tg.x + (sd.x - 0.5) * span + Math.sin(t * 0.8 * sd.sp + sd.ph) * k.sway;
      const z = tg.z + (sd.z - 0.5) * span + Math.cos(t * 0.6 * sd.sp + sd.ph) * k.sway * 0.6;
      e.set(t * k.spin * sd.sp + sd.ph, t * k.spin * 0.7 + sd.ph, sd.ph);
      q.setFromEuler(e);
      mat.compose(p.set(x, 0.25 + y, z), q, s.setScalar(k.size * (0.7 + sd.sp * 0.4)));
      m.setMatrixAt(sd.i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
  }
}

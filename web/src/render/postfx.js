// Finition de l'image : ce qui donne l'aspect « diorama premium ».
//  - Occlusion ambiante (GTAO) : ombres douces de contact dans les recoins, au pied des murs et entre les cases.
//  - Halo (bloom) : les lumières (flammes, braises, ampoules, phare) rayonnent légèrement.
//  - Flou de miniature (tilt-shift) : le haut et le bas de l'écran se floutent doucement, comme une photo de maquette.
//  - Étalonnage : un peu de contraste et de saturation, ombres légèrement chaudes, vignette discrète.
// Trois niveaux : « high » (tout), « balanced » (sans occlusion, l'effet le plus coûteux), « low » (rendu direct).
// Si l'image rame, le niveau baisse tout seul d'un cran.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export const QUALITY = ['low', 'balanced', 'high'];
export const QUALITY_NAMES = { low: 'Léger', balanced: 'Équilibré', high: 'Élevé' };

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    focus: { value: 0.52 },     // hauteur nette (0 = bas de l'écran)
    band: { value: 0.2 },       // demi-largeur de la bande nette
    blur: { value: 2.6 },       // rayon du flou aux bords, en pixels (à l'échelle 1)
    vignette: { value: 0.22 },
    contrast: { value: 1.06 },
    saturation: { value: 1.08 },
    warmth: { value: 0.025 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float focus, band, blur, vignette, contrast, saturation, warmth;
    varying vec2 vUv;
    void main() {
      float d = max(0.0, abs(vUv.y - focus) - band);
      float r = blur * smoothstep(0.0, 0.32, d);
      vec4 col = texture2D(tDiffuse, vUv);
      if (r > 0.05) {
        // flou en disque à 12 points, pondéré vers le centre
        vec2 px = r / resolution;
        vec3 acc = col.rgb * 2.0; float w = 2.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 0.5236 + 0.26;
          float rr = (mod(float(i), 2.0) == 0.0) ? 1.0 : 0.55;
          acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * px * rr).rgb; w += 1.0;
        }
        col.rgb = acc / w;
      }
      vec3 c = col.rgb;
      // étalonnage : contraste autour du gris moyen, saturation, ombres légèrement chaudes
      c = (c - 0.5) * contrast + 0.5;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation);
      c += vec3(warmth, warmth * 0.4, -warmth * 0.6) * (1.0 - l);
      // vignette ovale très douce
      vec2 q = vUv - 0.5; q.x *= resolution.x / resolution.y * 0.75;
      c *= 1.0 - vignette * smoothstep(0.35, 0.95, length(q));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), col.a);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.level = 'low';
    this.frames = []; this.lastTime = 0; this.autoChecked = false;
    this.onAutoDrop = null;
  }

  // Construit la chaîne d'effets du niveau demandé (rien pour « low »).
  setLevel(level) {
    if (!QUALITY.includes(level)) level = 'balanced';
    this.level = level;
    this.composer?.dispose?.();
    this.composer = null;
    this.gtao = null;
    if (level === 'low') return;
    const r = this.renderer, size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
    // Cible multi-échantillonnée : on garde l'anticrénelage malgré le passage par des textures.
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    const comp = new EffectComposer(r, target);
    comp.addPass(new RenderPass(this.scene, this.camera));
    if (level === 'high') {
      const g = new GTAOPass(this.scene, this.camera, size.x, size.y);
      g.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1.2, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
      g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6 });
      g.blendIntensity = 0.85;
      // L'occlusion est calculée à mi-résolution : quatre fois moins de pixels, presque invisible après le débruitage.
      const set = g.setSize.bind(g); g.setSize = (w, h) => set(Math.max(1, w >> 1), Math.max(1, h >> 1));
      comp.addPass(g);
      this.gtao = g;
    }
    // Halo : seuil haut, seules les sources vraiment lumineuses rayonnent.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.5, 0.92);
    comp.addPass(this.bloom);
    comp.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    comp.addPass(this.finish);
    comp.setPixelRatio(pr);
    comp.setSize(size.x, size.y);
    this.finish.uniforms.resolution.value.set(size.x * pr, size.y * pr);
    this.finish.uniforms.blur.value = 2.6 * pr;
    this.composer = comp;
    this.frames = []; this.autoChecked = false;
  }

  setSize(w, h) {
    if (!this.composer) return;
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.finish.uniforms.resolution.value.set(w * pr, h * pr);
  }

  // Flou de miniature plus marqué en vue d'ensemble, presque nul de très près.
  setZoom(dist, maxDist) {
    if (!this.finish) return;
    const k = THREE.MathUtils.clamp((dist - 6) / Math.max(1, maxDist - 6), 0, 1);
    this.finish.uniforms.band.value = 0.26 - k * 0.1;
    this.finish.uniforms.blur.value = (1.2 + k * 2.4) * this.renderer.getPixelRatio();
  }

  render(dt) {
    if (!this.composer) { this.renderer.render(this.scene, this.camera); return; }
    this.composer.render(dt);
    this.watch();
  }

  // Surveille la fluidité pendant les premières secondes : sous ~40 images par seconde, on baisse d'un cran.
  watch() {
    if (this.autoChecked) return;
    const now = performance.now();
    if (this.lastTime) this.frames.push(now - this.lastTime);
    this.lastTime = now;
    if (this.frames.length < 150) return;
    const sorted = [...this.frames.slice(30)].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.autoChecked = true;
    if (median > 25 && this.level !== 'low') {
      const lower = QUALITY[QUALITY.indexOf(this.level) - 1];
      this.setLevel(lower);
      this.onAutoDrop?.(lower);
    }
  }
}

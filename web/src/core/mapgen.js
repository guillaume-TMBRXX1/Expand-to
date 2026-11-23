// Génération de carte : bruit de valeur fractal (fBm) pour l'altitude et l'humidité,
// atténuation vers les bords pour obtenir un continent entouré d'eau.
import { makeRng } from './rng.js';

function valueNoise(rng, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const grid = Array.from({ length: gw * gh }, () => rng.next());
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / cell, gy = y / cell;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = smooth(gx - x0), ty = smooth(gy - y0);
    const v = (i, j) => grid[(j % gh) * gw + (i % gw)];
    const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
    const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

function fbm(rng, w, h, octaves, baseCell) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(valueNoise(rng, w, h, Math.max(1.5, baseCell / 2 ** o)));
  return (x, y) => {
    let sum = 0, amp = 1, norm = 0;
    for (const n of layers) { sum += n(x, y) * amp; norm += amp; amp *= 0.5; }
    return sum / norm;
  };
}

export function classify(e, m) {
  if (e < 0.3) return 'deep';
  if (e < 0.38) return 'water';
  if (e < 0.42) return 'sand';
  if (e < 0.64) return m > 0.56 ? 'forest' : m > 0.42 ? 'grass' : 'plains';
  if (e < 0.75) return m > 0.62 ? 'forest' : 'hills';
  if (e < 0.86) return 'mountain';
  return 'snow';
}

export function generateMap(seed, width, height) {
  const rng = makeRng(seed);
  const elev = fbm(rng, width, height, 4, 9);
  const moist = fbm(rng, width, height, 3, 7);
  const tiles = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x / (width - 1)) * 2 - 1, ny = (y / (height - 1)) * 2 - 1;
      const d = Math.max(Math.abs(nx), Math.abs(ny) * 1.05);
      const falloff = Math.min(1, Math.max(0, (d - 0.55) / 0.45));
      let e = elev(x, y) * 1.25 - 0.1;
      e = e * (1 - falloff * 0.9) - falloff * 0.15;
      e = Math.min(1, Math.max(0, e));
      const m = moist(x, y);
      tiles.push({ x, y, e, m, type: classify(e, m), owner: -1, cityId: null, road: -1 });
    }
  }
  return { width, height, tiles, seed };
}

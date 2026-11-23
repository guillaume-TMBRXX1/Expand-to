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

// Types de carte : continent (une grande terre), pangée (terre plus vaste), archipel (îles séparées
// par des lagunes peu profondes, franchissables avec la Navigation).
export const MAP_TYPES = {
  continent: { cell: 9, gain: 1.25, bias: -0.1, fall0: 0.55 },
  pangaea: { cell: 11, gain: 1.15, bias: 0.0, fall0: 0.7 },
  archipelago: { cell: 5, gain: 1.35, bias: -0.16, fall0: 0.62 },
};

export function generateMap(seed, width, height, type = 'continent') {
  const T = MAP_TYPES[type] || MAP_TYPES.continent;
  const rng = makeRng(seed);
  const elev = fbm(rng, width, height, 4, T.cell);
  const moist = fbm(rng, width, height, 3, 7);
  const tiles = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x / (width - 1)) * 2 - 1, ny = (y / (height - 1)) * 2 - 1;
      const d = Math.max(Math.abs(nx), Math.abs(ny) * 1.05);
      const falloff = Math.min(1, Math.max(0, (d - T.fall0) / (1 - T.fall0)));
      let e = elev(x, y) * T.gain + T.bias;
      e = e * (1 - falloff * 0.9) - falloff * 0.15;
      e = Math.min(1, Math.max(0, e));
      const m = moist(x, y);
      tiles.push({ x, y, e, m, type: classify(e, m), owner: -1, cityId: null, road: -1 });
    }
  }
  assignRegions(rng, tiles, width, height);
  carveRivers(rng, tiles, width, height);
  return { width, height, tiles, seed, type };
}

// Régions climatiques : la latitude (perturbée par un bruit) donne le nord froid et le sud aride ;
// entre les deux, l'humidité sépare les plaines fertiles des terres tempérées ; l'eau et les plages forment les côtes.
export const REGIONS = ['north', 'temperate', 'fertile', 'arid', 'coast'];
export function regionOf(type, lat, m) {
  if (type === 'deep' || type === 'water' || type === 'sand') return 'coast';
  if (lat < 0.24) return 'north';
  if (lat > 0.76) return 'arid';
  return m > 0.5 ? 'fertile' : 'temperate';
}
function assignRegions(rng, tiles, width, height) {
  const jitter = fbm(rng, width, height, 2, 6);
  // Latitude mesurée sur l'étendue des terres (et non de la carte) : chaque région existe même sur un continent entouré d'eau.
  let y0 = height, y1 = 0;
  for (const t of tiles) if (t.type !== 'deep' && t.type !== 'water') { y0 = Math.min(y0, t.y); y1 = Math.max(y1, t.y); }
  const span = Math.max(1, y1 - y0);
  for (const t of tiles) {
    const lat = (t.y - y0) / span + (jitter(t.x, t.y) - 0.5) * 0.3;
    t.region = regionOf(t.type, lat, t.m);
  }
}

// Rivières : elles naissent sur les hauteurs et descendent vers la case voisine la plus basse jusqu'à l'eau.
// riverTo : index de la case en aval (-1 à l'embouchure) ; la case aval est toujours de l'eau ou une autre case de rivière.
const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function carveRivers(rng, tiles, width, height) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? tiles[y * width + x] : null);
  const water = (t) => t.type === 'deep' || t.type === 'water';
  const count = Math.round((width * height) / 190);
  const sources = tiles.filter((t) => (t.type === 'hills' || t.type === 'mountain') && t.e > 0.66);
  for (let n = 0, tries = 0; n < count && tries < count * 8 && sources.length; tries++) {
    const src = sources[Math.floor(rng.next() * sources.length)];
    if (src.river || D4.some(([dx, dy]) => { const v = at(src.x + dx, src.y + dy); return v && v.river; })) continue;
    const path = [src];
    let cur = src, ok = false;
    for (let step = 0; step < 40; step++) {
      let best = null;
      for (const [dx, dy] of D4) {
        const v = at(cur.x + dx, cur.y + dy);
        if (!v || path.includes(v)) continue;
        if (!best || v.e < best.e) best = v;
      }
      if (!best) break;
      if (water(best) || best.river) { path.push(best); ok = true; break; }
      if (best.e > cur.e + 0.02) break; // cuvette : la rivière s'arrête
      path.push(best); cur = best;
    }
    if (!ok || path.length < 4) continue;
    for (let k = 0; k < path.length - 1; k++) {
      const t = path[k];
      if (water(t)) break;
      t.river = true;
      const nx = path[k + 1];
      t.riverTo = nx.y * width + nx.x;
    }
    n++;
  }
  for (const t of tiles) if (t.river && t.type === 'mountain') t.type = 'hills'; // une vallée creusée dans la montagne
}

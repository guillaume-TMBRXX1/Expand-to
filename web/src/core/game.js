// Moteur de règles d'Expand-to : état de partie, économie, construction, unités, diplomatie, fin de tour.
// Aucune dépendance au rendu : le même code tourne dans le navigateur et en simulation Node (tools/sim.mjs).
import { makeRng } from './rng.js';
import { generateMap } from './mapgen.js';

export const RES = ['gold', 'food', 'wood', 'stone'];
export const GOODS = ['planks', 'tools', 'goods'];
export const LUXURIES = ['spices', 'marble', 'crystal'];
export const STOCK = [...RES, ...GOODS, ...LUXURIES];
export const YIELDS = ['gold', 'food', 'wood', 'stone', 'science', 'culture'];
export const PLAYER_COLORS = ['#ff6b4a', '#8b5cf6', '#f5b700', '#14b8a6', '#ec4899'];
const AI_NAMES = ['Aurélia', 'Borvane', 'Cassilde', 'Dunmor'];
const CITY_NAMES = [
  ['Lumen', 'Valmer', 'Ostrel', 'Brisa', 'Coralie', 'Ferrand', 'Sélène', 'Talmont', 'Ivra', 'Noctis'],
  ['Aurel', 'Vespa', 'Orméa', 'Lysse', 'Calde', 'Ambre', 'Sirth', 'Mévane'],
  ['Borg', 'Halden', 'Kerst', 'Morvin', 'Ulme', 'Tarsk', 'Grane', 'Védric'],
  ['Cassis', 'Rivel', 'Amaro', 'Flora', 'Pélia', 'Salva', 'Tiber', 'Ondine'],
  ['Dunn', 'Esker', 'Falk', 'Gorse', 'Hagen', 'Ilse', 'Jorv', 'Kael'],
];

// ---------------------------------------------------------------- utilitaires

export const idx = (s, x, y) => y * s.map.width + x;
export const inBounds = (s, x, y) => x >= 0 && y >= 0 && x < s.map.width && y < s.map.height;
export const tileAt = (s, x, y) => (inBounds(s, x, y) ? s.map.tiles[idx(s, x, y)] : null);
export const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
export const terrainOf = (s, t) => s.data.terrain[t.type];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function neighbors(s, x, y, dirs = DIRS8) {
  const out = [];
  for (const [dx, dy] of dirs) { const t = tileAt(s, x + dx, y + dy); if (t) out.push(t); }
  return out;
}
export const isCoastal = (s, t) => neighbors(s, t.x, t.y, DIRS4).some((n) => terrainOf(s, n).water);

export const buildingDef = (s, id) => s.data.buildingsById[id];
export const unitDef = (s, id) => s.data.unitsById[id];
export const techDef = (s, id) => s.data.techsById[id];
export const hasTech = (s, pid, id) => s.players[pid].techs.includes(id);
export const citiesOf = (s, pid) => s.cities.filter((c) => c.owner === pid);
export const cityAt = (s, x, y) => s.cities.find((c) => c.x === x && c.y === y) || null;
export const unitsAt = (s, x, y) => s.units.filter((u) => u.x === x && u.y === y);
export const footprintOf = (s, type) => buildingDef(s, type).footprint || 1;
export const buildingAt = (s, x, y) => s.buildings.find((b) => {
  const f = footprintOf(s, b.type);
  return x >= b.x && x < b.x + f && y >= b.y && y < b.y + f;
}) || null;
export function footprintTiles(s, type, x, y) {
  const f = footprintOf(s, type), out = [];
  for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) out.push(tileAt(s, x + dx, y + dy));
  return out;
}

export function log(s, text, who = null, kind = 'info') {
  s.log.push({ turn: s.turn, text, who, kind });
  if (s.log.length > 300) s.log.shift();
}

export function indexData(raw) {
  const byId = (arr) => Object.fromEntries(arr.map((d) => [d.id, d]));
  return {
    ...raw,
    buildingsById: byId(raw.buildings),
    unitsById: byId(raw.units),
    techsById: byId(raw.techs),
    profilesById: byId(raw.profiles),
  };
}

// --------------------------------------------------------------- création

function startScore(s, t) {
  let score = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const n = tileAt(s, t.x + dx, t.y + dy);
    if (!n) continue;
    score += { plains: 2, grass: 2, forest: 1.6, hills: 1.6, sand: 1, water: 0.8 }[n.type] || 0;
  }
  return score;
}

function findStarts(s, count, rng) {
  const candidates = s.map.tiles
    .filter((t) => ['plains', 'grass'].includes(t.type))
    .map((t) => ({ t, score: startScore(s, t) + rng.next() }))
    .filter((c) => c.score > 26)
    .sort((a, b) => b.score - a.score);
  for (const minDist of [11, 10, 9, 8, 7]) {
    const picked = [];
    for (const c of candidates) {
      if (picked.every((p) => cheb(p.x, p.y, c.t.x, c.t.y) >= minDist)) picked.push(c.t);
      if (picked.length === count) return picked;
    }
  }
  return null;
}

export function createGame({ data, seed = Math.floor(Math.random() * 1e9), profile = 'merchant', name = 'Vous', aiCount = 3 }) {
  const rules = data.rules;
  const rng = makeRng(seed);
  const s = { data, rules, seed, turn: 1, nextId: 1, log: [], proposals: [], relations: {}, agreements: [], alliances: [], tradeRoutes: [], wonders: {}, winner: null };
  let starts = null;
  for (let attempt = 0; attempt < 40 && !starts; attempt++) {
    s.map = generateMap((seed + attempt * 7919) >>> 0, rules.map.width, rules.map.height);
    starts = findStarts(s, aiCount + 1, rng);
  }
  if (!starts) throw new Error('Impossible de générer une carte jouable');
  rng.shuffle(starts);

  placeLuxuries(s, rng, starts);
  const aiProfiles = rng.shuffle(data.profiles.map((p) => p.id)).slice(0, aiCount);
  s.players = [];
  s.cities = []; s.units = []; s.buildings = [];
  for (let i = 0; i <= aiCount; i++) {
    const prof = i === 0 ? profile : aiProfiles[i - 1];
    const mods = data.profilesById[prof].mods;
    const res = Object.fromEntries(STOCK.map((k) => [k, 0]));
    Object.assign(res, rules.startStock);
    for (const [k, v] of Object.entries(mods.startRes || {})) res[k] = (res[k] || 0) + v;
    s.players.push({
      id: i, isHuman: i === 0, name: i === 0 ? name : AI_NAMES[i - 1], color: PLAYER_COLORS[i], profile: prof,
      res, sciencePool: 0, cultureTotal: 0, techs: [...(mods.startTechs || [])], research: null,
      explored: new Array(rules.map.width * rules.map.height).fill(0),
      cityNameIdx: 0, prestige: 0, prestigeBreakdown: {}, lastYield: null, ai: {},
    });
    const st = starts[i];
    spawnUnit(s, i, 'settler', st.x, st.y);
    spawnUnit(s, i, 'explorer', st.x, st.y);
    for (const extra of mods.extraUnits || []) spawnUnit(s, i, extra, st.x, st.y);
    reveal(s, i, st.x, st.y, 3);
  }
  for (let a = 0; a <= aiCount; a++) for (let b = a + 1; b <= aiCount; b++) {
    const bonus = (data.profilesById[s.players[a].profile].mods.relationStart || 0) + (data.profilesById[s.players[b].profile].mods.relationStart || 0);
    s.relations[relKey(a, b)] = rng.int(21) - 10 + bonus;
  }
  s.rngState = rng.next(); // graine dérivée pour l'IA
  s.rng = makeRng(Math.floor(s.rngState * 1e9));
  log(s, `Bienvenue, ${name}. Fondez votre capitale avec votre Colon.`, [0], 'good');
  return s;
}

// Ressources rares : épices (prairies, forêts), marbre (collines), cristal (au pied des montagnes).
function placeLuxuries(s, rng, starts) {
  const L = s.rules.luxuries;
  const placed = [];
  const nearMountain = (t) => neighbors(s, t.x, t.y).some((n) => n.type === 'mountain' || n.type === 'snow');
  const rule = {
    spices: (t) => t.type === 'grass' || t.type === 'forest',
    marble: (t) => t.type === 'hills' && !nearMountain(t),
    crystal: (t) => ['hills', 'plains', 'grass', 'forest'].includes(t.type) && nearMountain(t),
  };
  for (const lux of LUXURIES) {
    const cands = rng.shuffle(s.map.tiles.filter(rule[lux]));
    let n = 0;
    for (const t of cands) {
      if (n >= L.perType) break;
      if (placed.some((o) => cheb(o.x, o.y, t.x, t.y) < L.minSpacing)) continue;
      if (starts.some((o) => cheb(o.x, o.y, t.x, t.y) < 2)) continue;
      t.luxury = lux; placed.push(t); n++;
    }
  }
}

// ------------------------------------------------------------ modificateurs

export function playerMods(s, pid) {
  const p = s.players[pid];
  const m = { yieldPct: {}, cityYield: {}, costPct: 0, wonderCostPct: 0, tradePrestige: 0, buildingPrestigePer: 0, discoveryPrestige: 0, techPrestige: 0, sellBonus: 0, embassyPrestige: 0, popCap: 0, relationPerTurn: 0, moveBonus: 0, visionBonus: 0 };
  const apply = (e) => {
    if (!e) return;
    for (const [k, v] of Object.entries(e.yieldPct || {})) m.yieldPct[k] = (m.yieldPct[k] || 0) + v;
    for (const [k, v] of Object.entries(e.cityYield || {})) m.cityYield[k] = (m.cityYield[k] || 0) + v;
    m.costPct += e.costPct || 0;
    m.wonderCostPct += e.wonderCostPct || 0;
    m.tradePrestige += e.tradePrestige || 0;
    if (e.buildingPrestigePer) m.buildingPrestigePer = e.buildingPrestigePer;
    m.discoveryPrestige += e.discoveryPrestige || 0;
    m.techPrestige += e.techPrestige || 0;
    m.sellBonus += e.sellBonus || 0;
    m.embassyPrestige += e.embassyPrestige || 0;
    m.popCap += e.popCap || 0;
    m.relationPerTurn += e.relationPerTurn || 0;
    m.moveBonus += e.moveBonus || 0;
    m.visionBonus += e.visionBonus || 0;
  };
  apply(s.data.profilesById[p.profile].mods);
  for (const t of p.techs) apply(techDef(s, t).effects);
  for (const lux of activeLuxuries(s, pid)) apply(LUXURY_EFFECTS[lux]);
  return m;
}

export const LUXURY_EFFECTS = {
  spices: { yieldPct: { food: 0.1 }, cityYield: { culture: 1 } },
  marble: { yieldPct: { culture: 0.15 }, wonderCostPct: -0.15 },
  crystal: { yieldPct: { science: 0.15 } },
};
export const activeLuxuries = (s, pid) => LUXURIES.filter((k) => (s.players[pid].res[k] || 0) >= 1);

export function costOf(s, pid, def, isBuilding = true) {
  const mods = playerMods(s, pid);
  const pct = !isBuilding ? 0 : def.wonder ? mods.costPct / 2 + mods.wonderCostPct : mods.costPct;
  const out = {};
  for (const [k, v] of Object.entries(def.cost || {})) out[k] = Math.max(1, Math.round(v * (1 + pct)));
  return out;
}
export const canAfford = (s, pid, cost) => Object.entries(cost).every(([k, v]) => (s.players[pid].res[k] || 0) >= v);
function pay(s, pid, cost) { for (const [k, v] of Object.entries(cost)) s.players[pid].res[k] -= v; }

// ------------------------------------------------------------ visibilité

export function reveal(s, pid, x, y, r) {
  const p = s.players[pid];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + r) continue;
    if (inBounds(s, x + dx, y + dy)) p.explored[idx(s, x + dx, y + dy)] = 1;
  }
}
export const isExplored = (s, pid, x, y) => s.players[pid].explored[idx(s, x, y)] === 1;

// --------------------------------------------------------------- villes

export function cityPopCap(s, city) {
  const extra = s.buildings.filter((b) => b.cityId === city.id && !b.turnsLeft).reduce((a, b) => a + (buildingDef(s, b.type).popCap || 0), 0);
  const tiers = s.rules.tiers.slice(1, (city.tier || 0) + 1).reduce((a, t) => a + (t.popCap || 0), 0);
  return s.rules.basePopCap + extra + tiers + playerMods(s, city.owner).popCap;
}

function claimTerritory(s, city) {
  const r = city.radius;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const t = tileAt(s, city.x + dx, city.y + dy);
    if (t && t.owner === -1) { t.owner = city.owner; t.cityId = city.id; }
  }
  reveal(s, city.owner, city.x, city.y, r + 2);
}

export function canFound(s, u) {
  if (!u || u.type !== 'settler') return { ok: false, reason: 'Seul un Colon peut fonder une ville.' };
  const t = tileAt(s, u.x, u.y);
  if (!terrainOf(s, t).passable) return { ok: false, reason: 'Terrain impraticable.' };
  if (t.owner !== -1 && t.owner !== u.owner) return { ok: false, reason: 'Territoire étranger.' };
  if (s.cities.some((c) => cheb(c.x, c.y, u.x, u.y) < s.rules.minCityDistance)) return { ok: false, reason: `Trop proche d'une ville (min. ${s.rules.minCityDistance} cases).` };
  if (buildingAt(s, u.x, u.y)) return { ok: false, reason: 'Case occupée par un bâtiment.' };
  return { ok: true };
}

export function foundCity(s, uid) {
  const u = s.units.find((x) => x.id === uid);
  const chk = canFound(s, u);
  if (!chk.ok) return chk;
  const p = s.players[u.owner];
  const names = CITY_NAMES[u.owner % CITY_NAMES.length];
  const city = { id: s.nextId++, owner: u.owner, name: names[p.cityNameIdx++ % names.length], x: u.x, y: u.y, pop: 1, radius: s.rules.cityRadius, trained: false, capital: citiesOf(s, u.owner).length === 0 };
  s.cities.push(city);
  const t = tileAt(s, u.x, u.y);
  if (t.road !== -1) t.road = -1;
  claimTerritory(s, city);
  s.units = s.units.filter((x) => x.id !== uid);
  log(s, `${p.name} fonde ${city.name}.`, null, u.owner === 0 ? 'good' : 'info');
  for (const other of s.cities) {
    if (other.owner !== u.owner && cheb(other.x, other.y, city.x, city.y) < s.rules.borderDistance - 1) {
      addRel(s, u.owner, other.owner, s.rules.settleNearPenalty);
      log(s, `${s.players[other.owner].name} n'apprécie pas l'implantation de ${city.name} si près de ${other.name} (${s.rules.settleNearPenalty}).`, [u.owner, other.owner], 'bad');
    }
  }
  return { ok: true, city };
}

// ----------------------------------------------------------- construction

export function canBuild(s, pid, type, x, y) {
  const def = buildingDef(s, type);
  const t = tileAt(s, x, y);
  if (!def || !t) return { ok: false, reason: 'Invalide.' };
  if (def.tech && !hasTech(s, pid, def.tech)) return { ok: false, reason: `Nécessite ${techDef(s, def.tech).name}.` };
  const tiles = footprintTiles(s, type, x, y);
  if (tiles.some((c) => !c)) return { ok: false, reason: 'Pas assez de place (2×2 cases).' };
  for (const c of tiles) {
    if (c.owner !== pid) return { ok: false, reason: tiles.length > 1 ? 'Les 4 cases doivent être dans votre territoire.' : 'Hors de votre territoire.' };
    if (cityAt(s, c.x, c.y) || buildingAt(s, c.x, c.y)) return { ok: false, reason: 'Case occupée.' };
    if (!def.terrain.includes(c.type)) return { ok: false, reason: `Terrain requis : ${def.terrain.map((k) => s.data.terrain[k].name).join(', ')}.` };
    if (def.luxuryOnly && !c.luxury) return { ok: false, reason: 'À placer sur une ressource rare.' };
    if (!def.luxuryOnly && c.luxury) return { ok: false, reason: 'Case réservée au Comptoir (ressource rare).' };
  }
  if (def.coastal && !isCoastal(s, t)) return { ok: false, reason: "Doit toucher l'eau." };
  if (def.wonder) {
    if (s.wonders[type] !== undefined) return { ok: false, reason: 'Merveille déjà construite.' };
    if (s.buildings.some((b) => b.type === type && b.owner === pid)) return { ok: false, reason: 'Déjà en construction.' };
  }
  if (def.perCity && s.buildings.filter((b) => b.cityId === t.cityId && b.type === type).length >= def.perCity) return { ok: false, reason: `Limité à ${def.perCity} par ville.` };
  if (!canAfford(s, pid, costOf(s, pid, def))) return { ok: false, reason: 'Ressources insuffisantes.' };
  return { ok: true };
}

// Bonus d'adjacence façon Anno : voisins (bâtiments, villes, terrains) autour de l'empreinte.
export function adjacencyBonus(s, pid, type, x, y) {
  const def = buildingDef(s, type);
  const out = {};
  if (!def.adjacency) return out;
  const f = footprintOf(s, type);
  const ring = [];
  for (let dy = -1; dy <= f; dy++) for (let dx = -1; dx <= f; dx++) {
    if (dx >= 0 && dx < f && dy >= 0 && dy < f) continue;
    const t = tileAt(s, x + dx, y + dy);
    if (t) ring.push(t);
  }
  for (const r of def.adjacency) {
    let count = 0;
    if (r.terrain) {
      const list = [].concat(r.terrain);
      count = ring.filter((t) => list.includes(t.type)).length;
    } else {
      const list = [].concat(r.near);
      const seen = new Set();
      for (const t of ring) {
        const c = cityAt(s, t.x, t.y);
        if (c && list.includes('city') && c.owner === pid) { count++; continue; }
        const b = buildingAt(s, t.x, t.y);
        if (!b || b.owner !== pid || seen.has(b.id) || (b.x === x && b.y === y && b.type === type)) continue;
        const bd = buildingDef(s, b.type);
        if (list.includes(b.type) || (bd.wonder && list.includes('wonder'))) { seen.add(b.id); count++; }
      }
    }
    count = Math.min(count, r.max ?? Infinity);
    for (const [k, v] of Object.entries(r.yields)) out[k] = (out[k] || 0) + v * count;
  }
  return out;
}

export function build(s, pid, type, x, y) {
  const chk = canBuild(s, pid, type, x, y);
  if (!chk.ok) return chk;
  const def = buildingDef(s, type);
  pay(s, pid, costOf(s, pid, def));
  const t = tileAt(s, x, y);
  const b = { id: s.nextId++, owner: pid, type, x, y, cityId: t.cityId, turnsLeft: def.turns };
  if (def.luxuryOnly) b.luxury = t.luxury;
  s.buildings.push(b);
  for (const c of footprintTiles(s, type, x, y)) if (c.road === pid) c.road = -1;
  if (def.wonder) log(s, `${s.players[pid].name} entame ${def.name}.`, null, 'info');
  return { ok: true, building: b };
}

export function canRoad(s, pid, x, y) {
  const t = tileAt(s, x, y);
  if (!t || !terrainOf(s, t).passable) return { ok: false, reason: 'Terrain impraticable.' };
  if (t.road !== -1) return { ok: false, reason: 'Route déjà présente.' };
  if (cityAt(s, x, y) || buildingAt(s, x, y)) return { ok: false, reason: 'Case occupée.' };
  if (t.owner !== -1 && t.owner !== pid) return { ok: false, reason: 'Territoire étranger.' };
  if (!isExplored(s, pid, x, y)) return { ok: false, reason: 'Case inexplorée.' };
  const linked = t.owner === pid || neighbors(s, x, y).some((n) => n.road === pid || (cityAt(s, n.x, n.y) || {}).owner === pid);
  if (!linked) return { ok: false, reason: 'Doit prolonger une route ou votre territoire.' };
  if (!canAfford(s, pid, s.rules.road.cost)) return { ok: false, reason: 'Ressources insuffisantes.' };
  return { ok: true };
}

export function buildRoad(s, pid, x, y) {
  const chk = canRoad(s, pid, x, y);
  if (!chk.ok) return chk;
  pay(s, pid, s.rules.road.cost);
  tileAt(s, x, y).road = pid;
  return { ok: true };
}

// --------------------------------------------------------------- unités

function spawnUnit(s, pid, type, x, y) {
  const u = { id: s.nextId++, owner: pid, type, x, y, movesLeft: 0, target: null };
  u.movesLeft = unitMaxMoves(s, u);
  s.units.push(u);
  return u;
}
export const unitMaxMoves = (s, u) => unitDef(s, u.type).moves + playerMods(s, u.owner).moveBonus;
export const unitVision = (s, u) => unitDef(s, u.type).vision + playerMods(s, u.owner).visionBonus;

export function canTrain(s, pid, cityId, type) {
  const city = s.cities.find((c) => c.id === cityId);
  const def = unitDef(s, type);
  if (!city || city.owner !== pid) return { ok: false, reason: 'Ville invalide.' };
  if (city.trained) return { ok: false, reason: 'Une unité par ville et par tour.' };
  if (def.tech && !hasTech(s, pid, def.tech)) return { ok: false, reason: `Nécessite ${techDef(s, def.tech).name}.` };
  if (def.popCost && city.pop <= def.popCost) return { ok: false, reason: 'Population insuffisante (min. 2).' };
  if (def.requiresBuilding && !s.buildings.some((b) => b.cityId === city.id && b.type === def.requiresBuilding && !b.turnsLeft)) {
    return { ok: false, reason: `Nécessite un ${buildingDef(s, def.requiresBuilding).name} terminé dans cette ville.` };
  }
  if (!canAfford(s, pid, costOf(s, pid, def, false))) return { ok: false, reason: 'Ressources insuffisantes.' };
  return { ok: true };
}

export function train(s, pid, cityId, type) {
  const chk = canTrain(s, pid, cityId, type);
  if (!chk.ok) return chk;
  const city = s.cities.find((c) => c.id === cityId);
  const def = unitDef(s, type);
  pay(s, pid, costOf(s, pid, def, false));
  if (def.popCost) city.pop -= def.popCost;
  city.trained = true;
  let at = { x: city.x, y: city.y };
  if (def.naval) { // le navire sort du port, sur une case d'eau voisine
    const harbor = s.buildings.find((b) => b.cityId === city.id && b.type === def.requiresBuilding && !b.turnsLeft);
    const water = harbor && neighbors(s, harbor.x, harbor.y).find((n) => terrainOf(s, n).water);
    if (water) at = { x: water.x, y: water.y };
  }
  const u = spawnUnit(s, pid, type, at.x, at.y);
  return { ok: true, unit: u };
}

const VISITORS = ['caravan', 'ship', 'emissary']; // unités autorisées à entrer dans une ville étrangère (destination)
export function enterCost(s, u, t, isTarget = false) {
  const ter = terrainOf(s, t);
  const def = unitDef(s, u.type);
  const c = cityAt(s, t.x, t.y);
  if (c && c.owner !== u.owner && !(VISITORS.includes(u.type) && isTarget)) return Infinity;
  if (def.flying) return 1;
  if (def.naval) {
    if (ter.water) return 1;
    return c && neighbors(s, t.x, t.y).some((n) => terrainOf(s, n).water) ? 1 : Infinity;
  }
  if (!ter.passable) return Infinity;
  if (t.road !== -1 || c) return s.rules.road.moveCost;
  return ter.move;
}

// Dijkstra : coûts depuis l'unité, limités par budget (Infinity = carte entière).
export function dijkstra(s, u, budget = Infinity, target = null) {
  const W = s.map.width;
  const dist = new Map([[idx(s, u.x, u.y), 0]]);
  const prev = new Map();
  const open = [[0, idx(s, u.x, u.y)]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, i] = open.shift();
    if (d > dist.get(i)) continue;
    if (target !== null && i === target) break;
    const x = i % W, y = Math.floor(i / W);
    for (const n of neighbors(s, x, y)) {
      const ni = idx(s, n.x, n.y);
      const nd = d + enterCost(s, u, n, ni === target);
      if (nd > budget || nd >= (dist.get(ni) ?? Infinity)) continue;
      dist.set(ni, nd); prev.set(ni, i); open.push([nd, ni]);
    }
  }
  return { dist, prev };
}

export function reachable(s, u) { return dijkstra(s, u, u.movesLeft).dist; }

export function findPath(s, u, tx, ty) {
  const target = idx(s, tx, ty);
  const { dist, prev } = dijkstra(s, u, Infinity, target);
  if (!dist.has(target)) return null;
  const path = [];
  for (let i = target; i !== idx(s, u.x, u.y); i = prev.get(i)) path.unshift(i);
  return path;
}

// Avance l'unité vers sa cible autant que ses mouvements le permettent. Retourne les cases parcourues.
export function advanceUnit(s, u) {
  if (!u.target) return [];
  const path = findPath(s, u, u.target.x, u.target.y);
  if (!path || !path.length) { u.target = null; return []; }
  const steps = [];
  for (const i of path) {
    const t = s.map.tiles[i];
    const c = enterCost(s, u, t, i === path[path.length - 1]);
    if (c > u.movesLeft + 1e-6) break;
    u.movesLeft -= c; u.x = t.x; u.y = t.y; steps.push(i);
    reveal(s, u.owner, u.x, u.y, unitVision(s, u));
  }
  if (u.x === u.target.x && u.y === u.target.y) {
    u.target = null;
    const c = cityAt(s, u.x, u.y);
    if ((u.type === 'caravan' || u.type === 'ship') && c && c.owner !== u.owner) establishTradeRoute(s, u, c);
    if (u.type === 'emissary' && c && c.owner !== u.owner) openEmbassy(s, u, c);
  }
  return steps;
}

export function orderMove(s, uid, x, y) {
  const u = s.units.find((v) => v.id === uid);
  if (!u) return { ok: false, reason: 'Unité introuvable.' };
  if (!findPath(s, u, x, y)) return { ok: false, reason: 'Destination inaccessible.' };
  u.target = { x, y };
  const steps = advanceUnit(s, u);
  return { ok: true, steps, unit: u };
}

export const tradeRouteCap = (s, pid) => citiesOf(s, pid).length + 1
  + s.buildings.filter((b) => b.owner === pid && !b.turnsLeft).reduce((a, b) => a + (buildingDef(s, b.type).tradeRoutes || 0), 0);

export const seaRouteCap = (s, pid) => s.buildings.filter((b) => b.owner === pid && b.type === 'harbor' && !b.turnsLeft).length;

function establishTradeRoute(s, u, city) {
  const isSea = u.type === 'ship';
  const max = isSea ? seaRouteCap(s, u.owner) : tradeRouteCap(s, u.owner);
  const mine = s.tradeRoutes.filter((r) => r.a === u.owner && !!r.sea === isSea).length;
  if (mine >= max) { log(s, `Limite de routes commerciales atteinte (${max}).`, [u.owner], 'bad'); return; }
  if (s.tradeRoutes.some((r) => r.a === u.owner && r.cityId === city.id)) { log(s, `Une route vers ${city.name} existe déjà.`, [u.owner], 'bad'); return; }
  const sea = u.type === 'ship';
  s.tradeRoutes.push({ a: u.owner, b: city.owner, cityId: city.id, sea });
  addRel(s, u.owner, city.owner, (sea ? s.rules.seaRoute : s.rules.tradeRoute).relation);
  s.units = s.units.filter((v) => v.id !== u.id);
  log(s, `Route ${sea ? 'maritime' : 'commerciale'} ouverte entre ${s.players[u.owner].name} et ${city.name} (${s.players[city.owner].name}).`, [u.owner, city.owner], 'good');
}

function openEmbassy(s, u, city) {
  s.embassies = s.embassies || [];
  if (s.embassies.some((e) => e.from === u.owner && e.to === city.owner)) {
    log(s, `Vous avez déjà une ambassade chez ${s.players[city.owner].name}.`, [u.owner], 'bad');
    return;
  }
  s.embassies.push({ from: u.owner, to: city.owner, cityId: city.id });
  addRel(s, u.owner, city.owner, s.rules.embassy.relation);
  for (const t of s.map.tiles) if (t.owner === city.owner) s.players[u.owner].explored[idx(s, t.x, t.y)] = 1;
  s.units = s.units.filter((v) => v.id !== u.id);
  log(s, `${s.players[u.owner].name} ouvre une ambassade à ${city.name} (${s.players[city.owner].name}, +${s.rules.embassy.relation} relation).`, [u.owner, city.owner], 'good');
}
export const hasEmbassy = (s, from, to) => (s.embassies || []).some((e) => e.from === from && e.to === to);

// Ingénieur : route n'importe où (hors territoire étranger) et défrichage.
export function canEngineerRoad(s, u) {
  if (!u || u.type !== 'engineer') return { ok: false, reason: 'Réservé à l\'Ingénieur.' };
  const t = tileAt(s, u.x, u.y);
  if (u.movesLeft < 1) return { ok: false, reason: 'Plus de mouvement ce tour.' };
  if (!terrainOf(s, t).passable || t.road !== -1 || cityAt(s, t.x, t.y) || buildingAt(s, t.x, t.y)) return { ok: false, reason: 'Impossible ici.' };
  if (t.owner !== -1 && t.owner !== u.owner) return { ok: false, reason: 'Territoire étranger.' };
  if (!canAfford(s, u.owner, s.rules.engineer.roadCost)) return { ok: false, reason: 'Bois insuffisant.' };
  return { ok: true };
}
export function engineerRoad(s, uid) {
  const u = s.units.find((v) => v.id === uid);
  const chk = canEngineerRoad(s, u);
  if (!chk.ok) return chk;
  pay(s, u.owner, s.rules.engineer.roadCost);
  tileAt(s, u.x, u.y).road = u.owner;
  u.movesLeft -= 1;
  return { ok: true };
}
export function canClearForest(s, u) {
  if (!u || u.type !== 'engineer') return { ok: false, reason: 'Réservé à l\'Ingénieur.' };
  const t = tileAt(s, u.x, u.y);
  if (t.type !== 'forest') return { ok: false, reason: 'Pas de forêt ici.' };
  if (t.owner !== -1 && t.owner !== u.owner) return { ok: false, reason: 'Territoire étranger.' };
  if (buildingAt(s, t.x, t.y)) return { ok: false, reason: 'Case occupée.' };
  if (u.movesLeft < 1) return { ok: false, reason: 'Plus de mouvement ce tour.' };
  return { ok: true };
}
export function clearForest(s, uid) {
  const u = s.units.find((v) => v.id === uid);
  const chk = canClearForest(s, u);
  if (!chk.ok) return chk;
  tileAt(s, u.x, u.y).type = 'plains';
  s.players[u.owner].res.wood += s.rules.engineer.clearWood;
  u.movesLeft = 0;
  return { ok: true };
}

// ---------------------------------------------------------------- marché
// Vente contre de l'Or dans une Halle marchande. Le prix baisse quand on vend beaucoup (saturation)
// et remonte doucement chaque tour.
export const hallCount = (s, pid) => s.buildings.filter((b) => b.owner === pid && b.type === 'markethall' && !b.turnsLeft).length;
export function marketFactor(s, pid, res) { return (s.players[pid].market || {})[res] ?? 1; }
export function sellRate(s, pid) {
  const M = s.rules.market;
  const halls = Math.min(hallCount(s, pid), M.maxHalls);
  if (!halls) return 0;
  const mq = s.buildings.some((b) => b.owner === pid && b.type === 'merchantquarter' && !b.turnsLeft) ? M.merchantQuarterBonus : 0;
  return M.baseRate + (halls - 1) * M.perHall + mq + playerMods(s, pid).sellBonus;
}
export function unitPrice(s, pid, res) {
  return (s.data.resources[res].tradeValue || 0) * sellRate(s, pid) * marketFactor(s, pid, res);
}
// Recette estimée pour qty unités (le prix baisse à chaque unité vendue).
export function quoteSale(s, pid, res, qty) {
  const M = s.rules.market;
  let f = marketFactor(s, pid, res), total = 0;
  const base = (s.data.resources[res].tradeValue || 0) * sellRate(s, pid);
  for (let i = 0; i < qty; i++) { total += base * f; f = Math.max(M.minPrice, f * M.saturation); }
  return { gold: Math.floor(total), factor: f };
}
export function sell(s, pid, res, qty) {
  const p = s.players[pid];
  if (!s.rules.market.sellable.includes(res)) return { ok: false, reason: 'Ressource non vendable.' };
  if (!hallCount(s, pid)) return { ok: false, reason: 'Construisez d\'abord une Halle marchande.' };
  qty = Math.min(Math.floor(qty), Math.floor(p.res[res] || 0));
  if (qty <= 0) return { ok: false, reason: 'Stock insuffisant.' };
  const q = quoteSale(s, pid, res, qty);
  p.res[res] -= qty;
  p.res.gold += q.gold;
  p.market = p.market || {};
  p.market[res] = q.factor;
  return { ok: true, qty, gold: q.gold };
}
function marketTick(s, pid) {
  const p = s.players[pid];
  const M = s.rules.market;
  for (const [res, keep] of Object.entries(p.autoSell || {})) {
    const extra = Math.floor((p.res[res] || 0) - keep);
    if (extra > 0 && hallCount(s, pid)) {
      const r = sell(s, pid, res, extra);
      if (r.ok && p.isHuman) log(s, `Vente automatique : ${r.qty} ${s.data.resources[res].name} → ${r.gold} Or.`, [pid], 'info');
    }
  }
  for (const res of Object.keys(p.market || {})) p.market[res] = Math.min(1, p.market[res] + M.recovery);
}
export function setAutoSell(s, pid, res, keep) {
  const p = s.players[pid];
  p.autoSell = p.autoSell || {};
  if (keep === null) delete p.autoSell[res]; else p.autoSell[res] = keep;
}

// ------------------------------------------------------------- recherche

export function availableTechs(s, pid) {
  return s.data.techs.filter((t) => !hasTech(s, pid, t.id) && t.requires.every((r) => hasTech(s, pid, r)));
}
export function setResearch(s, pid, techId) {
  const t = techDef(s, techId);
  if (!availableTechs(s, pid).includes(t)) return { ok: false, reason: 'Technologie indisponible.' };
  s.players[pid].research = techId;
  checkResearch(s, pid);
  return { ok: true };
}
function checkResearch(s, pid) {
  const p = s.players[pid];
  while (p.research && p.sciencePool >= techDef(s, p.research).cost) {
    const t = techDef(s, p.research);
    p.sciencePool -= t.cost;
    p.techs.push(t.id);
    p.research = null;
    log(s, `${p.name} découvre ${t.name}.`, p.isHuman ? null : [pid], p.isHuman ? 'good' : 'info');
  }
}

// ------------------------------------------------------------- diplomatie

export const relKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const getRel = (s, a, b) => s.relations[relKey(a, b)] ?? 0;
export function addRel(s, a, b, d) {
  if (a === b) return;
  s.relations[relKey(a, b)] = Math.max(-100, Math.min(100, getRel(s, a, b) + d));
}
export function relStatus(v) {
  if (v <= -30) return { label: 'Hostile', tone: 'bad' };
  if (v < 0) return { label: 'Méfiant', tone: 'warn' };
  if (v < 30) return { label: 'Neutre', tone: 'neutral' };
  if (v < 60) return { label: 'Cordial', tone: 'good' };
  return { label: 'Amical', tone: 'good' };
}
const pairMatch = (r, a, b) => (r.a === a && r.b === b) || (r.a === b && r.b === a);
export const hasAgreement = (s, a, b) => s.agreements.some((r) => pairMatch(r, a, b));
export const isAllied = (s, a, b) => s.alliances.some((r) => pairMatch(r, a, b));
export function areNeighbors(s, a, b) {
  const ca = citiesOf(s, a), cb = citiesOf(s, b);
  return ca.some((x) => cb.some((y) => cheb(x.x, x.y, y.x, y.y) <= s.rules.borderDistance));
}

// Bonus/malus de productivité liés aux relations : le cœur de la mécanique « une mauvaise entente coûte cher ».
export function diplomacyPct(s, pid) {
  const pct = { gold: 0, science: 0, culture: 0, wood: 0, stone: 0 };
  const reasons = [];
  const R = s.rules;
  for (const q of s.players) {
    if (q.id === pid) continue;
    const rel = getRel(s, pid, q.id);
    if (isAllied(s, pid, q.id)) {
      for (const k of ['gold', 'science', 'culture']) pct[k] += R.alliance.pct;
      reasons.push({ text: `Alliance avec ${q.name}`, value: R.alliance.pct, tone: 'good' });
    }
    if (hasAgreement(s, pid, q.id)) {
      pct.gold += R.tradeAgreement.goldPct;
      reasons.push({ text: `Accord commercial avec ${q.name}`, value: R.tradeAgreement.goldPct, tone: 'good', res: 'gold' });
    }
    if (areNeighbors(s, pid, q.id) && !isAllied(s, pid, q.id)) {
      const v = rel <= R.malus.hostileBelow ? R.malus.hostilePct : rel < R.malus.wary ? R.malus.waryPct : 0;
      if (v) {
        for (const k of Object.keys(pct)) pct[k] += v;
        reasons.push({ text: `Tensions avec ${q.name} (${relStatus(rel).label})`, value: v, tone: 'bad' });
      }
    }
  }
  return { pct, reasons };
}

export const tradeValue = (s, bundle, receiver = null) => Object.entries(bundle).reduce((a, [k, v]) => {
  const base = s.data.resources[k].tradeValue || 0;
  const scarce = receiver !== null && LUXURIES.includes(k) && (s.players[receiver].res[k] || 0) < 1 ? 1.5 : 1;
  return a + v * base * scarce;
}, 0);

// Évaluation d'une proposition par un joueur IA (utilisée pour les propositions humain→IA et IA→IA).
export function evaluateProposal(s, from, to, kind, payload = {}) {
  const rel = getRel(s, from, to);
  const R = s.rules;
  const target = s.players[to];
  switch (kind) {
    case 'agreement':
      if (hasAgreement(s, from, to)) return { accept: false, reason: 'Accord déjà en place.' };
      if (rel < R.tradeAgreement.minRelation) return { accept: false, reason: `Relation insuffisante (min. ${R.tradeAgreement.minRelation}).` };
      return { accept: true };
    case 'alliance':
      if (isAllied(s, from, to)) return { accept: false, reason: 'Déjà alliés.' };
      if (rel < R.alliance.minRelation) return { accept: false, reason: `Relation insuffisante (min. ${R.alliance.minRelation}).` };
      if (s.alliances.filter((a) => a.a === to || a.b === to).length >= 2) return { accept: false, reason: `${target.name} a déjà deux alliés.` };
      return { accept: true };
    case 'exchange': {
      const { give = {}, want = {} } = payload;
      if (!canAfford(s, to, want)) return { accept: false, reason: `${target.name} n'a pas ces ressources.` };
      if (rel <= R.malus.hostileBelow) return { accept: false, reason: 'Refus : relations hostiles.' };
      const factor = 1 + rel / 200;
      const ok = tradeValue(s, give, to) * factor >= tradeValue(s, want) * 1.05;
      return ok ? { accept: true } : { accept: false, reason: "L'offre n'est pas assez avantageuse." };
    }
    default: return { accept: false, reason: 'Inconnu.' };
  }
}

export function giveGift(s, from, to, amount) {
  if (s.players[from].res.gold < amount || amount <= 0) return { ok: false, reason: 'Or insuffisant.' };
  s.players[from].res.gold -= amount;
  s.players[to].res.gold += amount;
  const key = `${s.turn}:${relKey(from, to)}`;
  s.giftLedger = s.giftLedger || {};
  const already = s.giftLedger[key] || 0;
  const gain = Math.max(0, Math.min(15 - already, Math.round(amount / 3)));
  s.giftLedger[key] = already + gain;
  addRel(s, from, to, gain);
  log(s, `${s.players[from].name} offre ${amount} Or à ${s.players[to].name} (+${gain} relation).`, [from, to], 'good');
  return { ok: true, gain };
}

export function propose(s, from, to, kind, payload = {}) {
  if (kind === 'agreement' && !hasTech(s, from, 'protocol')) return { ok: false, reason: 'Nécessite la technologie Protocole.' };
  if (kind === 'alliance' && !hasTech(s, from, 'embassies')) return { ok: false, reason: 'Nécessite la technologie Ambassades.' };
  if (kind === 'exchange' && !canAfford(s, from, payload.give || {})) return { ok: false, reason: 'Vous n\'avez pas ces ressources.' };
  if (s.players[to].isHuman) {
    s.proposals.push({ id: s.nextId++, from, to, kind, payload, turn: s.turn });
    return { ok: true, pending: true };
  }
  const ev = evaluateProposal(s, from, to, kind, payload);
  if (!ev.accept) {
    if (s.players[from].isHuman) log(s, `${s.players[to].name} refuse : ${ev.reason}`, [from], 'bad');
    return { ok: false, reason: ev.reason };
  }
  applyDeal(s, from, to, kind, payload);
  return { ok: true };
}

export function applyDeal(s, from, to, kind, payload) {
  const A = s.players[from], B = s.players[to];
  if (kind === 'agreement') {
    s.agreements.push({ a: from, b: to });
    log(s, `Accord commercial signé entre ${A.name} et ${B.name}.`, [from, to], 'good');
  } else if (kind === 'alliance') {
    s.alliances.push({ a: from, b: to });
    log(s, `Alliance conclue entre ${A.name} et ${B.name}.`, null, 'good');
  } else if (kind === 'exchange') {
    pay(s, from, payload.give); pay(s, to, payload.want);
    for (const [k, v] of Object.entries(payload.give)) B.res[k] += v;
    for (const [k, v] of Object.entries(payload.want)) A.res[k] += v;
    addRel(s, from, to, 2);
    log(s, `Échange conclu entre ${A.name} et ${B.name} (${fmtBundle(s, payload.give)} contre ${fmtBundle(s, payload.want)}).`, [from, to], 'good');
  } else if (kind === 'request') {
    pay(s, to, payload.want);
    for (const [k, v] of Object.entries(payload.want)) A.res[k] += v;
    addRel(s, from, to, 12);
    log(s, `Vous aidez ${A.name} (${fmtBundle(s, payload.want)}). Relation +12.`, [from, to], 'good');
  }
}

export function respondProposal(s, propId, accept) {
  const pr = s.proposals.find((p) => p.id === propId);
  if (!pr) return { ok: false };
  s.proposals = s.proposals.filter((p) => p.id !== propId);
  if (accept) {
    const need = pr.kind === 'exchange' || pr.kind === 'request' ? pr.payload.want : {};
    if (!canAfford(s, pr.to, need)) return { ok: false, reason: 'Ressources insuffisantes.' };
    applyDeal(s, pr.from, pr.to, pr.kind, pr.payload);
  } else {
    const penalty = pr.kind === 'request' ? -8 : -3;
    addRel(s, pr.from, pr.to, penalty);
    log(s, `Vous déclinez la proposition de ${s.players[pr.from].name} (${penalty} relation).`, [pr.to], 'bad');
  }
  return { ok: true };
}

export function cancelAgreement(s, a, b) {
  s.agreements = s.agreements.filter((r) => !pairMatch(r, a, b));
  addRel(s, a, b, -15);
  log(s, `${s.players[a].name} rompt l'accord commercial avec ${s.players[b].name} (-15).`, [a, b], 'bad');
}

export const fmtBundle = (s, b) => Object.entries(b).map(([k, v]) => `${v} ${s.data.resources[k].name}`).join(', ');

// ------------------------------------------------------- économie & tours

function connectedToCapital(s, pid) {
  const cities = citiesOf(s, pid);
  const cap = cities.find((c) => c.capital) || cities[0];
  if (!cap) return [];
  const seen = new Set([idx(s, cap.x, cap.y)]);
  const queue = [cap];
  while (queue.length) {
    const t = queue.shift();
    for (const n of neighbors(s, t.x, t.y)) {
      const ni = idx(s, n.x, n.y);
      if (seen.has(ni)) continue;
      const c = cityAt(s, n.x, n.y);
      if (n.road === pid || (c && c.owner === pid)) { seen.add(ni); queue.push(n); }
    }
  }
  return cities.filter((c) => c !== cap && seen.has(idx(s, c.x, c.y)));
}

export function computeYields(s, pid) {
  const R = s.rules;
  const mods = playerMods(s, pid);
  const gross = Object.fromEntries(YIELDS.map((k) => [k, 0]));
  const add = (bundle, mul = 1) => { for (const [k, v] of Object.entries(bundle || {})) if (k in gross) gross[k] += v * mul; };
  let pop = 0;
  const needs = {};
  for (const c of citiesOf(s, pid)) {
    add(R.cityBaseYield); add(mods.cityYield); add(R.perPop, c.pop); pop += c.pop;
    for (const tier of R.tiers.slice(1, (c.tier || 0) + 1)) add(tier.yields);
    const tier = R.tiers[c.tier || 0];
    for (const [k, v] of Object.entries(tier.needs || {})) needs[k] = (needs[k] || 0) + v;
  }
  let upkeep = 0;
  const processes = [];
  const extra = {}; // biens et luxes produits directement (comptoirs)
  for (const b of s.buildings) {
    if (b.owner !== pid || b.turnsLeft > 0) continue;
    const def = buildingDef(s, b.type);
    const adj = adjacencyBonus(s, pid, b.type, b.x, b.y);
    upkeep += def.upkeep || 0;
    if (def.process) {
      const out = { ...def.process.out };
      for (const [k, v] of Object.entries(adj)) out[k] = (out[k] || 0) + v;
      processes.push({ id: b.id, type: b.type, in: def.process.in, out });
      continue;
    }
    add(def.yields); add(adj);
    if (b.luxury) extra[b.luxury] = (extra[b.luxury] || 0) + 1;
  }
  const connected = connectedToCapital(s, pid).length;
  gross.gold += connected * R.road.connectedCityGold;
  const myRoutes = s.tradeRoutes.filter((r) => r.a === pid || r.b === pid);
  const routes = myRoutes.length;
  gross.gold += myRoutes.reduce((a, r) => a + (r.sea ? R.seaRoute.gold : R.tradeRoute.gold), 0);
  const agreements = s.agreements.filter((r) => r.a === pid || r.b === pid).length;
  gross.gold += agreements * R.tradeAgreement.gold;
  const dip = diplomacyPct(s, pid);
  const mult = {}, yields = {};
  for (const k of YIELDS) {
    mult[k] = Math.max(0.5, Math.min(1.6, 1 + (mods.yieldPct[k] || 0) + (dip.pct[k] || 0)));
    yields[k] = gross[k] * mult[k];
  }
  const consumption = pop * R.foodPerPop;
  // « base » : ce qui est versé avant les transformations et les besoins de la population.
  const base = { ...yields, gold: yields.gold - upkeep, food: yields.food - consumption };
  for (const k of [...GOODS, ...LUXURIES]) base[k] = extra[k] || 0;
  const luxUse = R.luxuries.consumptionPerCity * citiesOf(s, pid).length;
  for (const k of activeLuxuries(s, pid)) base[k] -= luxUse;
  const net = { ...base };
  for (const pr of processes) {
    for (const [k, v] of Object.entries(pr.in)) net[k] -= v;
    for (const [k, v] of Object.entries(pr.out)) net[k] = (net[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(needs)) net[k] -= v;
  return { gross, mult, yields, base, net, needs, processes, upkeep, consumption, connected, routes, agreements, reasons: dip.reasons };
}

// Paliers de population : une ville monte de palier si elle est assez peuplée ET si ses besoins sont couverts.
function updateTiers(s, pid) {
  const p = s.players[pid];
  const tiers = s.rules.tiers;
  for (const c of citiesOf(s, pid).sort((a, b) => b.pop - a.pop)) {
    let target = 0;
    for (let t = 1; t < tiers.length; t++) if (c.pop >= tiers[t].minPop) target = t;
    target = Math.min(target, (c.tier || 0) + 1); // un palier à la fois
    let tier = target;
    while (tier > 0 && !canAfford(s, pid, tiers[tier].needs)) tier--;
    if (tier > 0) pay(s, pid, tiers[tier].needs);
    if (tier !== (c.tier || 0) && p.isHuman) {
      log(s, tier > (c.tier || 0) ? `${c.name} passe au palier ${tiers[tier].name}.` : `${c.name} redescend au palier ${tiers[tier].name} : besoins non couverts.`, [pid], tier > (c.tier || 0) ? 'good' : 'bad');
    }
    c.tier = tier;
  }
}

export function computePrestige(s, pid) {
  const R = s.rules.prestige;
  const p = s.players[pid];
  const b = {
    villes: citiesOf(s, pid).length * R.perCity,
    technologies: Math.floor(p.techs.reduce((a, t) => a + techDef(s, t).tier * (R.perTechTier + playerMods(s, pid).techPrestige), 0)),
    culture: Math.floor(p.cultureTotal / R.culturePerPoint),
    monuments: 0, merveilles: 0,
    diplomatie: s.alliances.filter((r) => r.a === pid || r.b === pid).length * s.rules.alliance.prestige
      + s.agreements.filter((r) => r.a === pid || r.b === pid).length * s.rules.tradeAgreement.prestige,
    commerce: s.tradeRoutes.filter((r) => r.a === pid || r.b === pid).length * (s.rules.tradeRoute.prestige + playerMods(s, pid).tradePrestige)
      + s.agreements.filter((r) => r.a === pid || r.b === pid).length * playerMods(s, pid).tradePrestige,
  };
  for (const bd of s.buildings) {
    if (bd.owner !== pid || bd.turnsLeft > 0) continue;
    const def = buildingDef(s, bd.type);
    if (def.prestige) b[def.wonder ? 'merveilles' : 'monuments'] += def.prestige;
  }
  const embP = playerMods(s, pid).embassyPrestige;
  if (embP) b.diplomatie += (s.embassies || []).filter((e) => e.from === pid).length * embP;
  const lux = activeLuxuries(s, pid).length;
  if (lux) b.luxe = lux * s.rules.luxuries.diversityPrestige;
  const disc = playerMods(s, pid).discoveryPrestige;
  if (disc) b.decouvertes = Math.floor((p.explored.reduce((a, v) => a + v, 0) / p.explored.length) * disc);
  const per = playerMods(s, pid).buildingPrestigePer;
  if (per) b.monuments += Math.floor(s.buildings.filter((x) => x.owner === pid && !x.turnsLeft && !buildingDef(s, x.type).wonder).length / per);
  const total = Object.values(b).reduce((a, v) => a + v, 0);
  return { total, breakdown: b };
}

function grow(s, pid) {
  const p = s.players[pid];
  if (p.res.food < 0) {
    const big = citiesOf(s, pid).sort((a, b) => b.pop - a.pop)[0];
    if (big && big.pop > 1) { big.pop--; log(s, `Famine à ${big.name} : la population diminue.`, [pid], 'bad'); }
    p.res.food = 0;
    return;
  }
  const cities = citiesOf(s, pid).sort((a, b) => a.pop - b.pop);
  for (const c of cities) {
    if (c.pop >= cityPopCap(s, c)) continue;
    const need = s.rules.growthBase + s.rules.growthPerPop * c.pop;
    if (p.res.food < need) break;
    p.res.food -= need;
    c.pop++;
    if (c.pop >= s.rules.bigCityPop && c.radius < s.rules.cityRadiusBig) {
      c.radius = s.rules.cityRadiusBig; claimTerritory(s, c);
      log(s, `${c.name} étend son territoire.`, [pid], 'good');
    }
  }
}

// Fin de tour (après que tous les joueurs ont agi).
export function endRound(s) {
  if (s.winner) return;
  const R = s.rules;
  for (const p of s.players) {
    const y = computeYields(s, p.id);
    p.lastYield = y;
    for (const k of STOCK) p.res[k] = Math.max(k === 'food' ? -Infinity : 0, (p.res[k] || 0) + (y.base[k] || 0));
    for (const pr of y.processes) {
      if (!canAfford(s, p.id, pr.in)) { if (p.isHuman) log(s, `${buildingDef(s, pr.type).name} à l'arrêt : matières premières insuffisantes.`, [p.id], 'warn'); continue; }
      pay(s, p.id, pr.in);
      for (const [k, v] of Object.entries(pr.out)) p.res[k] = (p.res[k] || 0) + v;
    }
    updateTiers(s, p.id);
    marketTick(s, p.id);
    p.sciencePool += y.net.science;
    p.cultureTotal += y.net.culture;
    checkResearch(s, p.id);
    grow(s, p.id);
  }
  // Construction : course aux merveilles, le premier à finir l'emporte.
  for (const b of [...s.buildings]) {
    if (!b.turnsLeft) continue;
    b.turnsLeft--;
    if (b.turnsLeft > 0) continue;
    const def = buildingDef(s, b.type);
    if (def.wonder) {
      if (s.wonders[b.type] !== undefined) {
        s.buildings = s.buildings.filter((x) => x !== b);
        const refund = costOf(s, b.owner, def);
        for (const [k, v] of Object.entries(refund)) s.players[b.owner].res[k] += Math.floor(v / 2);
        log(s, `${def.name} a déjà été achevée ailleurs : chantier abandonné, 50% remboursés.`, [b.owner], 'bad');
        continue;
      }
      s.wonders[b.type] = b.owner;
      log(s, `${s.players[b.owner].name} achève la merveille ${def.name} !`, null, b.owner === 0 ? 'good' : 'warn');
    } else if (b.owner === 0) {
      log(s, `${def.name} terminé.`, [0], 'good');
    }
  }
  // Relations
  for (let a = 0; a < s.players.length; a++) for (let b = a + 1; b < s.players.length; b++) {
    let d = 0;
    if (areNeighbors(s, a, b) && !isAllied(s, a, b)) d += R.borderTension;
    if (hasAgreement(s, a, b)) d += R.tradeAgreement.relationPerTurn;
    if (isAllied(s, a, b)) d += R.alliance.relationPerTurn;
    d += s.tradeRoutes.filter((r) => pairMatch(r, a, b)).length * 0.5;
    d += (s.embassies || []).filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)).length * R.embassy.relationPerTurn;
    d += (playerMods(s, a).relationPerTurn + playerMods(s, b).relationPerTurn) / 2;
    for (const [w, owner] of Object.entries(s.wonders)) {
      if (owner === a || owner === b) d += (buildingDef(s, w).relationPerTurn || 0);
    }
    addRel(s, a, b, d);
    if (isAllied(s, a, b) && getRel(s, a, b) < R.alliance.breakBelow) {
      s.alliances = s.alliances.filter((r) => !pairMatch(r, a, b));
      log(s, `L'alliance entre ${s.players[a].name} et ${s.players[b].name} est rompue.`, null, 'bad');
    }
  }
  s.proposals = s.proposals.filter((p) => p.turn >= s.turn);
  // Nouveau tour
  s.turn++;
  for (const c of s.cities) c.trained = false;
  for (const u of s.units) u.movesLeft = unitMaxMoves(s, u);
  for (const u of s.units.filter((v) => v.owner === 0 && v.target)) advanceUnit(s, u);
  for (const p of s.players) {
    const pr = computePrestige(s, p.id);
    p.prestige = pr.total; p.prestigeBreakdown = pr.breakdown;
  }
  const ranking = [...s.players].sort((a, b) => b.prestige - a.prestige);
  if (ranking[0].prestige >= R.prestigeTarget) {
    s.winner = { pid: ranking[0].id, reason: `${ranking[0].name} atteint ${R.prestigeTarget} points de prestige.` };
  } else if (s.turn > R.turnLimit) {
    s.winner = { pid: ranking[0].id, reason: `Fin des ${R.turnLimit} tours : ${ranking[0].name} a le plus grand prestige.` };
  }
  if (s.winner) log(s, s.winner.reason, null, s.winner.pid === 0 ? 'good' : 'bad');
}

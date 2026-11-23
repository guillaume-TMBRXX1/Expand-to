// Moteur de règles d'Expand-to : état de partie, économie, construction, unités, diplomatie, fin de tour.
// Aucune dépendance au rendu : le même code tourne dans le navigateur et en simulation Node (tools/sim.mjs).
import { makeRng } from './rng.js';
import { generateMap } from './mapgen.js';

export const RES = ['gold', 'food', 'wood', 'stone'];
export const GOODS = ['planks', 'tools', 'goods'];
export const LUXURIES = ['spices', 'marble', 'crystal'];
export const STOCK = [...RES, ...GOODS, ...LUXURIES];
export const YIELDS = ['gold', 'food', 'wood', 'stone', 'science', 'culture'];
// Ordre validé pour la lisibilité daltonienne des voisins (graphiques de fin de partie).
export const PLAYER_COLORS = ['#ff6b4a', '#8b5cf6', '#f5b700', '#14b8a6', '#2f6fde', '#9a5b2e', '#ec4899', '#65a30d'];
const AI_NAMES = ['Aurélia', 'Borvane', 'Cassilde', 'Dunmor', 'Elvire', 'Faramond', 'Ysolde'];
const CITY_NAMES = [
  ['Lumen', 'Valmer', 'Ostrel', 'Brisa', 'Coralie', 'Ferrand', 'Sélène', 'Talmont', 'Ivra', 'Noctis'],
  ['Aurel', 'Vespa', 'Orméa', 'Lysse', 'Calde', 'Ambre', 'Sirth', 'Mévane'],
  ['Borg', 'Halden', 'Kerst', 'Morvin', 'Ulme', 'Tarsk', 'Grane', 'Védric'],
  ['Cassis', 'Rivel', 'Amaro', 'Flora', 'Pélia', 'Salva', 'Tiber', 'Ondine'],
  ['Dunn', 'Esker', 'Falk', 'Gorse', 'Hagen', 'Ilse', 'Jorv', 'Kael'],
  ['Elbe', 'Lumière', 'Mira', 'Nacre', 'Opale', 'Prisme', 'Quartz', 'Rosée'],
  ['Fanal', 'Gué', 'Hune', 'Isard', 'Jonc', 'Kermès', 'Loire', 'Meuse'],
  ['Ysa', 'Zélie', 'Azur', 'Brume', 'Cyprès', 'Dune', 'Écume', 'Fougère'],
];

// Règles d'une partie : les règles de base ajustées par les réglages (taille, durée).
export function gameRules(data, settings = {}) {
  const base = data.rules;
  const size = base.mapSizes?.[settings.size || 'medium'] || { width: base.map.width, height: base.map.height };
  const len = base.gameLengths?.[settings.length || 'normal'] || { turnLimit: base.turnLimit, scale: 1 };
  const k = len.scale;
  return {
    ...base,
    map: { width: size.width, height: size.height },
    turnLimit: len.turnLimit,
    prestigeTarget: Math.round((base.prestigeTarget * (len.prestigeScale ?? k) * (size.prestigeScale ?? 1)) / 5) * 5,
    victory: { ...base.victory, cultureTotal: Math.round(base.victory.cultureTotal * (len.prestigeScale ?? k)), economyGold: Math.round(base.victory.economyGold * (len.prestigeScale ?? k) * 1.15), scienceTechs: Math.min(16, Math.round(base.victory.scienceTechs * (k < 1 ? 0.86 : 1))), secretaryWins: len.secretaryWins ?? base.victory.secretaryWins },
    luxuries: { ...base.luxuries, perType: Math.round(base.luxuries.perType * (size.width * size.height) / (36 * 26)) },
  };
}

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
  const area = s.map.width * s.map.height;
  const ideal = Math.round(Math.sqrt(area / count) * 0.75);
  for (const minDist of [ideal + 2, ideal + 1, ideal, ideal - 1, ideal - 2, 7, 6].filter((d) => d >= 6)) {
    const picked = [];
    for (const c of candidates) {
      if (picked.every((p) => cheb(p.x, p.y, c.t.x, c.t.y) >= minDist)) picked.push(c.t);
      if (picked.length === count) return picked;
    }
  }
  return null;
}

export function createGame({ data, seed = Math.floor(Math.random() * 1e9), profile = 'merchant', name = 'Vous', aiCount = 3, difficulty = 'normal', size = 'medium', mapType = 'continent', length = 'normal' }) {
  const settings = { size, mapType, length };
  const rules = gameRules(data, settings);
  const rng = makeRng(seed);
  const s = { data, rules, settings, history: [], seed, turn: 1, nextId: 1, log: [], proposals: [], relations: {}, agreements: [], alliances: [], tradeRoutes: [], wonders: {}, winner: null,
    difficulty, embassies: [], memory: {}, promises: [], projects: [], resolutions: [], congress: null, secretary: null };
  let starts = null;
  for (let attempt = 0; attempt < 40 && !starts; attempt++) {
    s.map = generateMap((seed + attempt * 7919) >>> 0, rules.map.width, rules.map.height, mapType);
    starts = findStarts(s, aiCount + 1, rng);
  }
  if (!starts) throw new Error('Impossible de générer une carte jouable');
  rng.shuffle(starts);

  placeLuxuries(s, rng, starts);
  const pool = [];
  while (pool.length < aiCount) pool.push(...rng.shuffle(data.profiles.map((p) => p.id)));
  const aiProfiles = pool.slice(0, aiCount);
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
      personality: i === 0 ? null : rng.pick(Object.keys(data.ai?.personalities || { loyal: 1 })), secretaryWins: 0,
    });
    const st = starts[i];
    spawnUnit(s, i, 'settler', st.x, st.y);
    spawnUnit(s, i, 'explorer', st.x, st.y);
    for (const extra of mods.extraUnits || []) spawnUnit(s, i, extra, st.x, st.y);
    reveal(s, i, st.x, st.y, 3);
  }
  for (let a = 0; a <= aiCount; a++) for (let b = a + 1; b <= aiCount; b++) {
    const bonus = (data.profilesById[s.players[a].profile].mods.relationStart || 0) + (data.profilesById[s.players[b].profile].mods.relationStart || 0);
    const diff = a === 0 ? (data.ai?.difficulty?.[difficulty]?.aiRelation || 0) : 0;
    s.relations[relKey(a, b)] = rng.int(21) - 10 + bonus + diff;
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
  const m = { yieldPct: {}, cityYield: {}, costPct: 0, wonderCostPct: 0, tradePrestige: 0, buildingPrestigePer: 0, discoveryPrestige: 0, techPrestige: 0, sellBonus: 0, embassyPrestige: 0, routeCap: 0, popCap: 0, relationPerTurn: 0, moveBonus: 0, visionBonus: 0 };
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
    m.routeCap += e.routeCap || 0;
    m.popCap += e.popCap || 0;
    m.relationPerTurn += e.relationPerTurn || 0;
    m.moveBonus += e.moveBonus || 0;
    m.visionBonus += e.visionBonus || 0;
  };
  apply(s.data.profilesById[p.profile].mods);
  for (const t of p.techs) apply(techDef(s, t).effects);
  for (const lux of activeLuxuries(s, pid)) apply(LUXURY_EFFECTS[lux]);
  if (!p.isHuman && s.data.ai) { // niveau de difficulté : bonus / malus des IA
    const d = s.data.ai.difficulty[s.difficulty || 'normal'];
    if (d?.aiYieldPct) apply({ yieldPct: Object.fromEntries(['gold', 'science', 'culture', 'wood', 'stone', 'food'].map((k) => [k, d.aiYieldPct])) });
    if (d?.aiCostPct) apply({ costPct: d.aiCostPct });
  }
  for (const r of activeResolutions(s)) {
    const def = s.rules.congress.resolutions[r.id];
    if (def.yieldPct) apply({ yieldPct: def.yieldPct });
    if (r.id === 'embargo' && r.target === pid) apply({ yieldPct: { gold: -0.1 } });
  }
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
  const upset = new Set();
  for (const other of s.cities) {
    if (other.owner !== u.owner && cheb(other.x, other.y, city.x, city.y) < s.rules.borderDistance - 1 && !upset.has(other.owner)) {
      upset.add(other.owner);
      const promise = s.promises.find((pr) => pr.from === u.owner && pr.to === other.owner && pr.type === 'noSettle');
      if (promise) { // promesse rompue
        s.promises = s.promises.filter((x) => x !== promise);
        remember(s, u.owner, other.owner, 'Promesse rompue : nouvelle ville à nos portes', s.rules.promise.breakPenalty);
        for (const q of s.players) if (q.id !== u.owner && q.id !== other.owner) remember(s, u.owner, q.id, `A trahi une promesse faite à ${s.players[other.owner].name}`, s.rules.promise.reputationPenalty);
        log(s, `${p.name} rompt sa promesse envers ${s.players[other.owner].name} !`, null, 'bad');
        continue;
      }
      remember(s, u.owner, other.owner, `Ville ${city.name} fondée trop près de ${other.name}`, s.rules.settleNearPenalty);
      log(s, `${s.players[other.owner].name} n'apprécie pas l'implantation de ${city.name} si près de ${other.name} (${s.rules.settleNearPenalty}).`, [u.owner, other.owner], 'bad');
      if (s.players[u.owner].isHuman && !s.players[other.owner].isHuman) {
        s.proposals.push({ id: s.nextId++, from: other.owner, to: u.owner, kind: 'promise', payload: { type: 'noSettle' }, turn: s.turn });
      }
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
  // Les routes restent sous les bâtiments : elles n'occupent pas la case.
  if (def.wonder) log(s, `${s.players[pid].name} entame ${def.name}.`, null, 'info');
  return { ok: true, building: b };
}

export function canRoad(s, pid, x, y) {
  const t = tileAt(s, x, y);
  if (!t || !terrainOf(s, t).passable) return { ok: false, reason: 'Terrain impraticable.' };
  if (t.road !== -1) return { ok: false, reason: 'Route déjà présente.' };
  if (cityAt(s, x, y)) return { ok: false, reason: 'Une ville fait déjà office de route.' };
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
  if (!ter.passable) {
    // Embarquement : avec la Navigation, les unités terrestres traversent les lagunes peu profondes.
    if (t.type === 'water' && s.rules.embark && hasTech(s, u.owner, s.rules.embark.tech)) return s.rules.embark.moveCost;
    return Infinity;
  }
  if (t.road !== -1 || c) return s.rules.road.moveCost;
  return ter.move;
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = [k[0], v[0]];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return top;
  }
}

// Dijkstra : coûts depuis l'unité, limités par budget (Infinity = carte entière).
export function dijkstra(s, u, budget = Infinity, target = null) {
  const W = s.map.width;
  const dist = new Map([[idx(s, u.x, u.y), 0]]);
  const prev = new Map();
  const open = new MinHeap();
  open.push(0, idx(s, u.x, u.y));
  while (open.size) {
    const [d, i] = open.pop();
    if (d > dist.get(i)) continue;
    if (target !== null && i === target) break;
    const x = i % W, y = Math.floor(i / W);
    for (const n of neighbors(s, x, y)) {
      const ni = idx(s, n.x, n.y);
      const nd = d + enterCost(s, u, n, ni === target);
      if (nd > budget || nd >= (dist.get(ni) ?? Infinity)) continue;
      dist.set(ni, nd); prev.set(ni, i); open.push(nd, ni);
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

// Prévisualisation d'un déplacement : chemin et tour d'arrivée de chaque case (1 = ce tour-ci).
export function planMove(s, u, x, y) {
  const path = findPath(s, u, x, y);
  if (!path) return null;
  const max = unitMaxMoves(s, u);
  let moves = u.movesLeft, turn = 1;
  const steps = path.map((i, k) => {
    const c = enterCost(s, u, s.map.tiles[i], k === path.length - 1);
    if (c > moves + 1e-6) { turn++; moves = max; }
    moves -= c;
    return { i, turn };
  });
  return { path, steps, turns: steps.length ? steps[steps.length - 1].turn : 1 };
}

export function orderMove(s, uid, x, y) {
  const u = s.units.find((v) => v.id === uid);
  if (!u) return { ok: false, reason: 'Unité introuvable.' };
  if (!findPath(s, u, x, y)) return { ok: false, reason: 'Destination inaccessible.' };
  u.target = { x, y };
  const steps = advanceUnit(s, u);
  return { ok: true, steps, unit: u };
}

export const tradeRouteCap = (s, pid) => citiesOf(s, pid).length + 1 + playerMods(s, pid).routeCap
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
  remember(s, u.owner, city.owner, `Route ${sea ? 'maritime' : 'commerciale'} vers ${city.name}`, (sea ? s.rules.seaRoute : s.rules.tradeRoute).relation);
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
  remember(s, u.owner, city.owner, `Ambassade ouverte à ${city.name}`, s.rules.embassy.relation);
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
  if (!terrainOf(s, t).passable || t.road !== -1 || cityAt(s, t.x, t.y)) return { ok: false, reason: 'Impossible ici.' };
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
// Partage de technologies : -25% si un allié connaît déjà la technologie.
export function techCost(s, pid, techId) {
  const t = techDef(s, techId);
  const allyKnows = s.players.some((q) => q.id !== pid && isAllied(s, pid, q.id) && q.techs.includes(techId));
  return Math.round(t.cost * (allyKnows ? 1 - s.rules.allyTechDiscount : 1));
}
function checkResearch(s, pid) {
  const p = s.players[pid];
  while (p.research && p.sciencePool >= techCost(s, pid, p.research)) {
    const t = techDef(s, p.research);
    p.sciencePool -= techCost(s, pid, p.research);
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
// Mémoire diplomatique : « target » se souvient de ce que « actor » lui a fait. La personnalité amplifie ou atténue.
export const personalityOf = (s, pid) => (s.players[pid].personality && s.data.ai?.personalities?.[s.players[pid].personality]) || null;
export function remember(s, actor, target, text, value) {
  if (actor === target) return 0;
  const pers = personalityOf(s, target);
  const v = Math.round(value * (pers ? (value < 0 ? pers.grudge : pers.favor) : 1));
  addRel(s, actor, target, v);
  const key = `${target}<${actor}`;
  s.memory = s.memory || {};
  (s.memory[key] = s.memory[key] || []).push({ turn: s.turn, text, value: v });
  if (s.memory[key].length > 12) s.memory[key].shift();
  return v;
}
export const memoriesOf = (s, target, actor) => (s.memory?.[`${target}<${actor}`] || []);

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
    case 'alliance': {
      if (isAllied(s, from, to)) return { accept: false, reason: 'Déjà alliés.' };
      const min = personalityOf(s, to)?.allianceMin ?? R.alliance.minRelation;
      if (rel < min) return { accept: false, reason: `Relation insuffisante (min. ${min} pour une IA ${personalityOf(s, to)?.name.toLowerCase() || ''}).` };
      if (s.alliances.filter((a) => a.a === to || a.b === to).length >= 2) return { accept: false, reason: `${target.name} a déjà deux alliés.` };
      return { accept: true };
    }
    case 'project': {
      if (!isAllied(s, from, to)) return { accept: false, reason: 'Réservé aux alliés.' };
      if (projectsBetween(s, from, to) >= R.jointProject.maxPerPair) return { accept: false, reason: 'Nombre maximal de projets communs atteint.' };
      if (!canAfford(s, to, R.jointProject.cost)) return { accept: false, reason: `${target.name} n'a pas les ressources pour participer.` };
      return rel >= R.jointProject.minRelation ? { accept: true } : { accept: false, reason: `Relation insuffisante (min. ${R.jointProject.minRelation}).` };
    }
    case 'exchange': {
      const { give = {}, want = {} } = payload;
      if (!canAfford(s, to, want)) return { accept: false, reason: `${target.name} n'a pas ces ressources.` };
      if (rel <= R.malus.hostileBelow) return { accept: false, reason: 'Refus : relations hostiles.' };
      const factor = 1 + rel / 200;
      const greed = personalityOf(s, to)?.tradeGreed ?? 1.05;
      const ok = tradeValue(s, give, to) * factor >= tradeValue(s, want) * greed;
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
  remember(s, from, to, `Cadeau de ${amount} Or`, gain);
  log(s, `${s.players[from].name} offre ${amount} Or à ${s.players[to].name} (+${gain} relation).`, [from, to], 'good');
  return { ok: true, gain };
}

export function propose(s, from, to, kind, payload = {}) {
  if (kind === 'agreement' && !hasTech(s, from, 'protocol')) return { ok: false, reason: 'Nécessite la technologie Protocole.' };
  if (kind === 'alliance' && !hasTech(s, from, 'embassies')) return { ok: false, reason: 'Nécessite la technologie Ambassades.' };
  if (kind === 'exchange' && !canAfford(s, from, payload.give || {})) return { ok: false, reason: 'Vous n\'avez pas ces ressources.' };
  if (kind === 'project') {
    if (!isAllied(s, from, to)) return { ok: false, reason: 'Les projets communs sont réservés aux alliés.' };
    if (!canAfford(s, from, s.rules.jointProject.cost)) return { ok: false, reason: `Il faut ${fmtBundle(s, s.rules.jointProject.cost)}.` };
  }
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
    remember(s, from, to, 'Échange de ressources', 2);
    log(s, `Échange conclu entre ${A.name} et ${B.name} (${fmtBundle(s, payload.give)} contre ${fmtBundle(s, payload.want)}).`, [from, to], 'good');
  } else if (kind === 'request') {
    pay(s, to, payload.want);
    for (const [k, v] of Object.entries(payload.want)) A.res[k] += v;
    const v = remember(s, to, from, `Aide reçue (${fmtBundle(s, payload.want)})`, isAllied(s, from, to) ? 18 : 12);
    log(s, `Vous aidez ${A.name} (${fmtBundle(s, payload.want)}). Relation +${v}.`, [from, to], 'good');
  } else if (kind === 'promise') {
    s.promises.push({ from: to, to: from, type: payload.type, turn: s.turn });
    remember(s, to, from, 'Promesse de ne pas s\'installer près de nous', s.rules.promise.keepBonus);
    log(s, `Vous promettez à ${A.name} de ne plus fonder de ville près de ses frontières.`, [from, to], 'good');
  } else if (kind === 'project') {
    pay(s, from, s.rules.jointProject.cost); pay(s, to, s.rules.jointProject.cost);
    s.projects.push({ a: from, b: to, turn: s.turn });
    remember(s, from, to, 'Projet commun', 5); remember(s, to, from, 'Projet commun', 5);
    log(s, `Projet commun lancé entre ${A.name} et ${B.name} (+${s.rules.jointProject.prestige} prestige chacun).`, null, 'good');
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
    const base = pr.kind === 'request' ? (isAllied(s, pr.from, pr.to) ? -12 : -8) : pr.kind === 'promise' ? s.rules.promise.declinePenalty : -3;
    const label = { request: 'Demande d\'aide refusée', promise: 'Promesse refusée', alliance: 'Alliance refusée', agreement: 'Accord refusé', exchange: 'Échange refusé', project: 'Projet commun refusé' }[pr.kind] || 'Proposition refusée';
    const v = remember(s, pr.to, pr.from, label, base);
    log(s, `Vous déclinez la proposition de ${s.players[pr.from].name} (${v} relation).`, [pr.to], 'bad');
  }
  return { ok: true };
}

export function cancelAgreement(s, a, b) {
  s.agreements = s.agreements.filter((r) => !pairMatch(r, a, b));
  remember(s, a, b, 'Accord commercial rompu', -15);
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
  const embargoed = activeResolutions(s).some((r) => r.id === 'embargo' && r.target === pid);
  const freeTrade = activeResolutions(s).some((r) => r.id === 'trade') ? R.congress.resolutions.trade.routeGold : 0;
  if (!embargoed) gross.gold += myRoutes.reduce((a, r) => a + (r.sea ? R.seaRoute.gold : R.tradeRoute.gold) + freeTrade, 0);
  for (const pj of s.projects || []) if (pj.a === pid || pj.b === pid) add(R.jointProject.yields);
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
    // Routes ouvertes par le joueur : prestige plein ; routes reçues d'autres joueurs : 1 point chacune.
    commerce: s.tradeRoutes.filter((r) => r.a === pid).length * (s.rules.tradeRoute.prestige + playerMods(s, pid).tradePrestige)
      + s.tradeRoutes.filter((r) => r.b === pid).length
      + s.agreements.filter((r) => r.a === pid || r.b === pid).length * playerMods(s, pid).tradePrestige,
  };
  for (const bd of s.buildings) {
    if (bd.owner !== pid || bd.turnsLeft > 0) continue;
    const def = buildingDef(s, bd.type);
    if (def.prestige) b[def.wonder ? 'merveilles' : 'monuments'] += def.prestige;
  }
  b.diplomatie += (s.projects || []).filter((pj) => pj.a === pid || pj.b === pid).length * s.rules.jointProject.prestige;
  if (s.secretary === pid) b.diplomatie += s.rules.congress.secretaryPrestige;
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
    if (areNeighbors(s, a, b) && !isAllied(s, a, b)) d += R.borderTension * Math.max(personalityOf(s, a)?.borderTension || 1, personalityOf(s, b)?.borderTension || 1);
    if (hasAgreement(s, a, b)) d += R.tradeAgreement.relationPerTurn;
    if (isAllied(s, a, b)) d += R.alliance.relationPerTurn;
    d += s.tradeRoutes.filter((r) => pairMatch(r, a, b)).length * 0.5;
    d += (s.embassies || []).filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)).length * R.embassy.relationPerTurn;
    d += (playerMods(s, a).relationPerTurn + playerMods(s, b).relationPerTurn) / 2;
    for (const [w, owner] of Object.entries(s.wonders)) {
      if (owner === a || owner === b) d += (buildingDef(s, w).relationPerTurn || 0);
    }
    addRel(s, a, b, d);
    const breakBelow = Math.max(R.alliance.breakBelow, personalityOf(s, a)?.breakBelow ?? 0, personalityOf(s, b)?.breakBelow ?? 0);
    if (isAllied(s, a, b) && getRel(s, a, b) < breakBelow) {
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
  if (s.congress && s.congress.status === 'open') resolveCongress(s); // vote humain non exprimé : abstention
  for (const p of s.players) {
    const pr = computePrestige(s, p.id);
    p.prestige = pr.total; p.prestigeBreakdown = pr.breakdown;
  }
  recordHistory(s);
  if (s.turn % R.congress.every === 0 && s.turn <= R.turnLimit) openCongress(s);
  const ranking = [...s.players].sort((a, b) => b.prestige - a.prestige);
  const path = checkVictoryPaths(s);
  if (path) {
    s.winner = path;
  } else if (ranking[0].prestige >= R.prestigeTarget) {
    s.winner = { pid: ranking[0].id, reason: `${ranking[0].name} atteint ${R.prestigeTarget} points de prestige.` };
  } else if (s.turn > R.turnLimit) {
    s.winner = { pid: ranking[0].id, reason: `Fin des ${R.turnLimit} tours : ${ranking[0].name} a le plus grand prestige.` };
  }
  if (s.winner) log(s, s.winner.reason, null, s.winner.pid === 0 ? 'good' : 'bad');
}

// ------------------------------------------------------------ alliances actives
export const projectsBetween = (s, a, b) => (s.projects || []).filter((pj) => pairMatch(pj, a, b)).length;

// ------------------------------------------------------------ Congrès mondial
// Tous les 10 tours : une résolution est soumise au vote et un Secrétaire est élu.
// Poids d'un vote : 1 + alliances + 0,5 par accord commercial + 0,5 par ambassade reçue.
export const activeResolutions = (s) => (s.resolutions || []).filter((r) => r.until >= s.turn);
export function voteWeight(s, pid) {
  return 1 + s.alliances.filter((r) => r.a === pid || r.b === pid).length
    + 0.5 * s.agreements.filter((r) => r.a === pid || r.b === pid).length
    + 0.5 * (s.embassies || []).filter((e) => e.to === pid).length;
}

function openCongress(s) {
  const R = s.rules.congress;
  const ids = Object.keys(R.resolutions);
  const id = ids[s.rng.int(ids.length)];
  const leader = [...s.players].sort((a, b) => b.prestige - a.prestige)[0];
  s.congress = { turn: s.turn, id, target: R.resolutions[id].targeted ? leader.id : null, votes: {}, secretaryVotes: {}, status: 'open' };
  for (const p of s.players) if (!p.isHuman) aiCongressVote(s, p.id);
  log(s, `Le Congrès mondial se réunit : « ${R.resolutions[id].name} »${s.congress.target !== null ? ` (cible : ${s.players[s.congress.target].name})` : ''} et élection du Secrétaire.`, null, 'warn');
  if (!s.players.some((p) => p.isHuman)) resolveCongress(s);
}

function aiCongressVote(s, pid) {
  const c = s.congress;
  const pers = s.players[pid].personality;
  let yes;
  if (c.id === 'embargo') yes = c.target !== pid && !isAllied(s, pid, c.target) && getRel(s, pid, c.target) < 40;
  else if (c.id === 'trade') yes = pers !== 'isolationist' || s.tradeRoutes.some((r) => r.a === pid || r.b === pid);
  else yes = pers !== 'isolationist' || s.rng.next() < 0.5;
  c.votes[pid] = yes;
  // Secrétaire : l'IA soutient le joueur qu'elle apprécie le plus (≥ 40), sinon elle-même.
  let best = pid, bestRel = 60;
  for (const q of s.players) if (q.id !== pid && getRel(s, pid, q.id) >= bestRel) { best = q.id; bestRel = getRel(s, pid, q.id); }
  // Coalition : face à un joueur à une élection de la victoire diplomatique, on soutient son rival le plus fort.
  const need = s.rules.victory.secretaryWins - 1;
  const threat = s.players.find((q) => q.id !== pid && (q.secretaryWins || 0) >= need && !isAllied(s, pid, q.id));
  if (threat && best === threat.id) best = pid;
  if (threat) {
    const rival = s.players.filter((q) => q.id !== threat.id).sort((a, b) => voteWeight(s, b.id) - voteWeight(s, a.id))[0];
    if (rival) best = rival.id;
  }
  c.secretaryVotes[pid] = best;
}

export function castCongressVote(s, pid, yes, candidate) {
  if (!s.congress || s.congress.status !== 'open') return { ok: false };
  s.congress.votes[pid] = yes;
  if (candidate !== undefined && candidate !== null) s.congress.secretaryVotes[pid] = candidate;
  resolveCongress(s);
  return { ok: true };
}

function resolveCongress(s) {
  const c = s.congress, R = s.rules.congress;
  let yesW = 0, noW = 0;
  for (const p of s.players) {
    if (c.votes[p.id] === undefined) continue;
    if (c.votes[p.id]) yesW += voteWeight(s, p.id); else noW += voteWeight(s, p.id);
  }
  c.passed = yesW > noW;
  c.tally = { yes: yesW, no: noW };
  const def = R.resolutions[c.id];
  if (c.passed) s.resolutions.push({ id: c.id, target: c.target, until: s.turn + R.duration - 1 });
  log(s, `Congrès : « ${def.name} » ${c.passed ? 'adoptée' : 'rejetée'} (${yesW.toFixed(1).replace('.0', '')} pour, ${noW.toFixed(1).replace('.0', '')} contre).`, null, c.passed ? 'good' : 'info');
  const score = {};
  for (const [voter, cand] of Object.entries(c.secretaryVotes)) score[cand] = (score[cand] || 0) + voteWeight(s, Number(voter));
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
    s.secretary = Number(ranked[0][0]);
    s.players[s.secretary].secretaryWins = (s.players[s.secretary].secretaryWins || 0) + 1;
    log(s, `${s.players[s.secretary].name} est élu Secrétaire du Congrès (+${R.secretaryPrestige} prestige jusqu'au prochain congrès).`, null, s.secretary === 0 ? 'good' : 'warn');
  } else {
    s.secretary = null;
    log(s, 'Aucun Secrétaire élu : égalité des voix.', null, 'info');
  }
  c.status = 'closed';
  c.secretary = s.secretary;
}

// ------------------------------------------------------------ voies de victoire
export function victoryProgress(s, pid) {
  const V = s.rules.victory, p = s.players[pid];
  const others = s.players.filter((q) => q.id !== pid);
  return {
    science: { label: 'Science', done: s.wonders.observatory === pid && p.techs.length >= V.scienceTechs, text: `Observatoire Céleste ${s.wonders.observatory === pid ? '✓' : '✗'} · ${p.techs.length}/${V.scienceTechs} technologies`, pct: Math.min(1, (p.techs.length / V.scienceTechs) * 0.6 + (s.wonders.observatory === pid ? 0.4 : 0)) },
    culture: { label: 'Culture', done: s.wonders.amphitheatre === pid && p.cultureTotal >= V.cultureTotal, text: `Amphithéâtre ${s.wonders.amphitheatre === pid ? '✓' : '✗'} · ${Math.floor(p.cultureTotal)}/${V.cultureTotal} culture`, pct: Math.min(1, (p.cultureTotal / V.cultureTotal) * 0.6 + (s.wonders.amphitheatre === pid ? 0.4 : 0)) },
    economy: { label: 'Économie', done: s.wonders.exchange === pid && p.res.gold >= V.economyGold, text: `Grande Bourse ${s.wonders.exchange === pid ? '✓' : '✗'} · ${Math.floor(p.res.gold)}/${V.economyGold} Or en caisse`, pct: Math.min(1, Math.min(1, p.res.gold / V.economyGold) * 0.6 + (s.wonders.exchange === pid ? 0.4 : 0)) },
    diplomacy: { label: 'Diplomatie', done: ((p.secretaryWins || 0) >= V.secretaryWins && others.filter((q) => isAllied(s, pid, q.id)).length >= Math.max(1, Math.floor(others.length / 2))) || (others.length >= 2 && others.every((q) => isAllied(s, pid, q.id))), text: `Élu Secrétaire ${p.secretaryWins || 0}/${V.secretaryWins} fois (et allié de la moitié des rivaux) · allié de ${others.filter((q) => isAllied(s, pid, q.id)).length}/${others.length}`, pct: Math.min(1, Math.max((p.secretaryWins || 0) / V.secretaryWins, others.filter((q) => isAllied(s, pid, q.id)).length / Math.max(1, others.length))) },
    prestige: { label: 'Prestige', done: p.prestige >= s.rules.prestigeTarget, text: `${p.prestige}/${s.rules.prestigeTarget} prestige`, pct: Math.min(1, p.prestige / s.rules.prestigeTarget) },
  };
}

function checkVictoryPaths(s) {
  const names = { science: 'scientifique', culture: 'culturelle', economy: 'économique', diplomacy: 'diplomatique' };
  for (const p of s.players) {
    const vp = victoryProgress(s, p.id);
    for (const k of ['science', 'culture', 'economy', 'diplomacy']) {
      if (vp[k].done) return { pid: p.id, type: k, reason: `Victoire ${names[k]} de ${p.name} : ${vp[k].text}.` };
    }
  }
  return null;
}

// ------------------------------------------------------------ statistiques
// Un instantané par tour et par joueur pour les graphiques de fin de partie.
function recordHistory(s) {
  s.history = s.history || [];
  s.history.push({
    turn: s.turn - 1,
    players: s.players.map((p) => ({
      prestige: p.prestige,
      cities: citiesOf(s, p.id).length,
      pop: citiesOf(s, p.id).reduce((a, c) => a + c.pop, 0),
      culture: Math.floor(p.cultureTotal),
      techs: p.techs.length,
      gold: Math.round(p.lastYield?.net.gold || 0),
      science: Math.round(p.lastYield?.net.science || 0),
    })),
  });
}

export function finalStats(s) {
  return s.players.map((p) => ({
    id: p.id, name: p.name, color: p.color, profile: p.profile, prestige: p.prestige,
    cities: citiesOf(s, p.id).length,
    pop: citiesOf(s, p.id).reduce((a, c) => a + c.pop, 0),
    techs: p.techs.length,
    culture: Math.floor(p.cultureTotal),
    buildings: s.buildings.filter((b) => b.owner === p.id && !b.turnsLeft).length,
    wonders: Object.values(s.wonders).filter((o) => o === p.id).length,
    routes: s.tradeRoutes.filter((r) => r.a === p.id || r.b === p.id).length,
    alliances: s.alliances.filter((r) => r.a === p.id || r.b === p.id).length,
    secretary: p.secretaryWins || 0,
  }));
}

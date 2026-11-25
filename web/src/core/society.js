// Phase 12 — climat et société : saisons, pollution, migrations, santé.
// Importé par game.js : les fonctions du moteur ne sont utilisées qu'à l'exécution.
import * as G from './game.js';
import { vocationPollution } from './land.js';
import { movementPollution } from './movements.js';

// ------------------------------------------------------------ saisons
// Un cycle de quatre saisons de quelques tours chacune : récoltes en automne, disette et chemins enneigés au nord en hiver.

export function seasonOf(s, turn = s.turn) {
  const S = s.rules.seasons;
  if (!S) return null;
  return S.list[Math.floor((turn - 1) / S.turns) % S.list.length];
}
export const seasonTurnsLeft = (s) => s.rules.seasons.turns - ((s.turn - 1) % s.rules.seasons.turns);

// ------------------------------------------------------------ pollution
// Les ateliers polluent leur ville ; les parcs et les forêts du territoire l'absorbent. Chaque point restant
// coûte de la Nourriture et de la Culture à la ville (cadre de vie).

export function cityPollution(s, city) {
  const P = s.rules.pollution;
  if (!P) return { emitted: 0, absorbed: 0, net: 0 };
  let emitted = 0, parks = 0;
  for (const b of s.buildings) {
    if (b.cityId !== city.id || b.turnsLeft > 0) continue;
    emitted += P.emitters[b.type] || 0;
    if (b.type === 'park') parks++;
  }
  emitted += vocationPollution(s, city);
  const forests = s.map.tiles.filter((t) => t.cityId === city.id && t.owner === city.owner && t.type === 'forest' && !G.buildingAt(s, t.x, t.y)).length;
  const absorbed = parks * P.park + Math.min(P.forestMax, forests * P.forestAbsorb) + movementPollution(s, city);
  return { emitted, absorbed, net: Math.max(0, Math.round((emitted - absorbed) * 10) / 10) };
}
export function pollutionYields(s, pid) {
  const P = s.rules.pollution;
  let food = 0, culture = 0;
  if (!P) return { food, culture };
  for (const c of G.citiesOf(s, pid)) { const n = cityPollution(s, c).net; food += n * P.food; culture += n * P.culture; }
  return { food, culture };
}

// ------------------------------------------------------------ santé
// Les grandes villes ont besoin d'eau courante (Aqueduc) puis de soins (Hôpital) pour continuer à grandir.

export function healthCap(s, city) {
  for (const h of s.rules.health || []) {
    const has = s.buildings.some((b) => b.cityId === city.id && b.type === h.building && !b.turnsLeft);
    if (!has) return { cap: h.pop, needs: h.building };
  }
  return { cap: Infinity, needs: null };
}

// ------------------------------------------------------------ migrations
// Tous les quelques tours, des habitants quittent la ville la moins attrayante pour la plus attrayante,
// y compris chez un voisin : l'attractivité devient une concurrence pacifique.

export function attractiveness(s, city) {
  const p = s.players[city.owner];
  const pol = cityPollution(s, city).net;
  const health = city.pop >= healthCap(s, city).cap ? -2 : 0;
  const cities = Math.max(1, G.citiesOf(s, city.owner).length);
  const culture = (p.lastYield?.net.culture || 0) / cities;
  const tourism = (p.lastYield?.tourism || 0) / cities;
  const river = G.cityOnRiver(s, city) ? 1 : 0;
  return Math.round(((city.tier || 0) * 2 + culture * 0.4 + tourism * 0.3 + river - pol * 1.5 + health + (city.capital ? 1 : 0)) * 10) / 10;
}

export function migrationTick(s) {
  const M = s.rules.migration;
  if (!M || s.turn % M.every !== 0 || s.cities.length < 2) return;
  const rated = s.cities.map((c) => ({ c, a: attractiveness(s, c) }));
  const dest = rated.filter((r) => r.c.pop < G.cityPopCap(s, r.c)).sort((x, y) => y.a - x.a)[0];
  if (!dest) return;
  const src = rated.filter((r) => r.c !== dest.c && r.c.pop >= M.minPop).sort((x, y) => x.a - y.a)[0];
  if (!src || dest.a - src.a < M.threshold) return;
  src.c.pop--; dest.c.pop++;
  const foreign = src.c.owner !== dest.c.owner;
  G.log(s, `Migration : des habitants quittent ${src.c.name}${foreign ? ` (${s.players[src.c.owner].name})` : ''} pour ${dest.c.name}${foreign ? ` (${s.players[dest.c.owner].name})` : ''}, plus attrayante.`,
    foreign ? [src.c.owner, dest.c.owner] : [src.c.owner], dest.c.owner === 0 ? 'good' : src.c.owner === 0 ? 'bad' : 'info');
}

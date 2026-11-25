// Phase 15 — mouvements culturels.
// Un mouvement (Humanisme, Lumières, Romantisme…) naît dans la capitale du pays le plus cultivé de l'ère,
// puis se propage de ville en ville : par la proximité, les routes commerciales et les alliances, porté par la culture.
// Chaque pays choisit d'y adhérer (bonus par ville touchée), de rester neutre ou de l'interdire (il se propage
// beaucoup moins chez lui). Le pays fondateur gagne du prestige quand son mouvement rayonne à l'étranger.
// Importé par game.js : les fonctions du moteur ne sont utilisées qu'à l'exécution.
import * as G from './game.js';
import { addBonusPrestige } from './diversity.js';
import { eraOf } from './ages.js';

const human = (s, pid) => s.players[pid].isHuman;
const nm = (s, pid) => s.players[pid].name;

export const movementDef = (s, id) => s.rules.movements?.list.find((m) => m.id === id) || null;
export const movementsBorn = (s) => s.movements || [];
export const touched = (c, id) => (c.movements || []).includes(id);
export const stanceOf = (s, pid, id) => s.players[pid].mvStance?.[id] || 'neutral';
export const adoptedOf = (s, pid) => Object.entries(s.players[pid].mvStance || {}).filter(([, v]) => v === 'adopt').map(([k]) => k);
export const citiesTouched = (s, pid, id) => G.citiesOf(s, pid).filter((c) => touched(c, id));

// ------------------------------------------------------------ naissance
function birth(s) {
  const M = s.rules.movements;
  s.movements = s.movements || [];
  if (s.turn < M.firstTurn) return;
  const last = s.movements.length ? s.movements[s.movements.length - 1].turn : -Infinity;
  if (s.turn - last < M.gap) return;
  const born = new Set(s.movements.map((m) => m.id));
  for (const def of M.list) {
    if (born.has(def.id)) continue;
    const eligible = s.players.filter((p) => eraOf(s, p.id) >= def.era && G.citiesOf(s, p.id).length);
    if (!eligible.length) continue;
    const founder = eligible.sort((a, b) => (b.lastYield?.net.culture || 0) - (a.lastYield?.net.culture || 0) + (b.cultureTotal - a.cultureTotal) * 0.01)[0];
    const city = G.citiesOf(s, founder.id).find((c) => c.capital) || G.citiesOf(s, founder.id)[0];
    s.movements.push({ id: def.id, founder: founder.id, cityId: city.id, turn: s.turn, foreign: 0 });
    touch(s, city, def.id, true);
    addBonusPrestige(s, founder.id, 'mouvements', M.foundPrestige);
    G.log(s, `Un mouvement culturel naît à ${city.name} (${nm(s, founder.id)}) : ${def.icon} ${def.name}. ${def.desc}`, null, founder.id === 0 ? 'good' : 'warn');
    return; // un seul mouvement à la fois
  }
}

function touch(s, city, id, quiet = false) {
  city.movements = city.movements || [];
  if (city.movements.includes(id)) return;
  city.movements.push(id);
  if (city.mv) delete city.mv[id];
  const mv = s.movements.find((m) => m.id === id), M = s.rules.movements, def = movementDef(s, id);
  if (mv && city.owner !== mv.founder && mv.foreign < M.foreignCap) { mv.foreign++; addBonusPrestige(s, mv.founder, 'mouvements', M.foreignPrestige); }
  if (quiet || !human(s, city.owner)) return;
  const first = citiesTouched(s, city.owner, id).length === 1;
  if (first) G.log(s, `${def.icon} ${def.name} gagne ${city.name}. Choisissez d'y adhérer, de rester neutre ou de l'interdire (fenêtre Culture, touche C).`, [city.owner], 'warn');
}

// ------------------------------------------------------------ propagation
// Pression reçue par une ville : villes touchées proches (plus fortes si leur pays est cultivé), routes commerciales,
// alliances. Adhérer accélère la propagation chez soi, interdire la freine fortement.
export function pressureOn(s, city, id) {
  const M = s.rules.movements;
  let p = 0;
  for (const src of s.cities) {
    if (src === city || !touched(src, id)) continue;
    const d = G.cheb(src.x, src.y, city.x, city.y);
    if (d > M.range) continue;
    const culture = Math.max(0, s.players[src.owner].lastYield?.net.culture || 0) / Math.max(1, G.citiesOf(s, src.owner).length);
    p += ((M.range - d + 1) / M.range) * (1 + culture * M.cultureShare * 10);
  }
  for (const r of s.tradeRoutes) {
    const other = r.cityId === city.id ? G.citiesOf(s, r.a)[0] : null; // route entrante : la ville d'origine porte le mouvement
    if (other && touched(other, id)) p += M.routeBoost;
    if (r.a === city.owner && s.cities.find((c) => c.id === r.cityId && touched(c, id))) p += M.routeBoost / 2;
  }
  if (s.players.some((q) => q.id !== city.owner && G.isAllied(s, q.id, city.owner) && G.citiesOf(s, q.id).some((c) => touched(c, id)))) p += M.allyBoost;
  const st = stanceOf(s, city.owner, id);
  return p * (st === 'adopt' ? M.adoptBoost : st === 'ban' ? M.banFactor : 1);
}

export function movementsTick(s) {
  const M = s.rules.movements;
  if (!M) return;
  birth(s);
  for (const mv of s.movements || []) {
    const gains = [];
    for (const c of s.cities) {
      if (touched(c, mv.id)) continue;
      const p = pressureOn(s, c, mv.id);
      if (p > 0) gains.push([c, p]);
    }
    for (const [c, p] of gains) {
      c.mv = c.mv || {};
      c.mv[mv.id] = (c.mv[mv.id] || 0) + p;
      if (c.mv[mv.id] >= M.threshold) touch(s, c, mv.id);
    }
  }
}

// ------------------------------------------------------------ choix et effets
export function canAdopt(s, pid, id) {
  const M = s.rules.movements;
  if (!movementsBorn(s).some((m) => m.id === id)) return { ok: false, reason: 'Mouvement inconnu.' };
  if (stanceOf(s, pid, id) === 'adopt') return { ok: false, reason: 'Déjà adopté.' };
  if (!citiesTouched(s, pid, id).length) return { ok: false, reason: 'Il n\'a encore gagné aucune de vos villes.' };
  if (adoptedOf(s, pid).length >= M.maxAdopted) return { ok: false, reason: `Au plus ${M.maxAdopted} mouvements adoptés : revenez à la neutralité pour l'un d'eux.` };
  return { ok: true };
}
export function setStance(s, pid, id, stance) {
  if (stance === 'adopt') { const chk = canAdopt(s, pid, id); if (!chk.ok) return chk; }
  const p = s.players[pid];
  p.mvStance = p.mvStance || {};
  if (stance === 'neutral') delete p.mvStance[id]; else p.mvStance[id] = stance;
  return { ok: true };
}

export function movementYields(s, pid) {
  const out = {};
  for (const id of adoptedOf(s, pid)) {
    const def = movementDef(s, id), n = citiesTouched(s, pid, id).length;
    for (const [k, v] of Object.entries(def?.perCity || {})) out[k] = (out[k] || 0) + v * n;
  }
  return out;
}
export const movementTourism = (s, pid) => adoptedOf(s, pid).reduce((a, id) => a + (movementDef(s, id)?.tourism || 0) * citiesTouched(s, pid, id).length, 0);
export const movementPollution = (s, city) => adoptedOf(s, city.owner).filter((id) => touched(city, id)).reduce((a, id) => a + (movementDef(s, id)?.pollution || 0), 0);
// Deux pays qui adhèrent tous deux à un mouvement « relation » (Lumières) se rapprochent.
export function movementRelation(s, a, b) {
  if (!s.rules.movements) return 0;
  const both = adoptedOf(s, a).filter((id) => movementDef(s, id)?.relation && adoptedOf(s, b).includes(id));
  return both.length * s.rules.movements.relationAdherents;
}

// IA : adhère aux mouvements qui servent sa voie, l'isolationniste interdit ceux des autres.
const BR = { gold: 'economy', science: 'science', culture: 'culture', food: 'economy' };
export function aiMovements(s, pid, w) {
  const M = s.rules.movements;
  if (!M) return;
  const pers = s.players[pid].personality;
  const val = (id) => { const def = movementDef(s, id); return Object.entries(def.perCity).reduce((a, [k, v]) => a + v * (w[BR[k]] || 1), 0) * citiesTouched(s, pid, id).length + (def.relation ? 2 * (w.diplomacy || 1) : 0); };
  for (const mv of movementsBorn(s)) {
    if (stanceOf(s, pid, mv.id) !== 'neutral') continue;
    if (pers === 'isolationist' && mv.founder !== pid && !citiesTouched(s, pid, mv.id).length && s.rng.next() < 0.5) setStance(s, pid, mv.id, 'ban');
  }
  const cands = movementsBorn(s).map((m) => m.id).filter((id) => stanceOf(s, pid, id) !== 'ban' && citiesTouched(s, pid, id).length).sort((a, b) => val(b) - val(a));
  const want = cands.slice(0, M.maxAdopted);
  for (const id of adoptedOf(s, pid)) if (!want.includes(id)) setStance(s, pid, id, 'neutral');
  for (const id of want) if (stanceOf(s, pid, id) !== 'adopt') setStance(s, pid, id, 'adopt');
}

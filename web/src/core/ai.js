// IA des joueurs ordinateurs : heuristiques simples pondérées par leur profil.
import * as G from './game.js';
import { aiPolicies } from './diversity.js';
import { aiAbility } from './world.js';

// Paramètres de l'IA : web/data/ai.json, éventuellement surchargés par joueur (s.aiOverrides[pid]) pour l'entraînement.
function merge(a, b) {
  if (!b) return a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v;
  return out;
}
export function aiParams(s, pid) { return merge(s.data.ai, s.aiOverrides?.[pid]); }
const PATH_WONDER = { science: 'observatory', culture: 'amphitheatre', economy: 'exchange', diplomacy: 'nations' };
const YIELD_BRANCH = { gold: 'economy', science: 'science', culture: 'culture', food: 'economy', wood: 'economy', stone: 'economy' };

export function playAITurns(s) {
  for (const p of s.players) if (!p.isHuman && !s.winner) aiTurn(s, p.id);
}

function aiTurn(s, pid) {
  const p = s.players[pid];
  const P = aiParams(s, pid);
  const w = P.branchWeights[p.profile];
  chooseResearch(s, pid, w);
  aiPolicies(s, pid);
  aiAbility(s, pid);
  for (const u of s.units.filter((x) => x.owner === pid)) moveUnit(s, pid, u);
  trainUnits(s, pid, P);
  for (let i = 0; i < 2; i++) if (!buildSomething(s, pid, w, P.build)) break;
  buildRoads(s, pid);
  sellSurplus(s, pid);
  diplomacy(s, pid);
}

function chooseResearch(s, pid, w) {
  const p = s.players[pid];
  if (p.research) return;
  const options = G.availableTechs(s, pid);
  if (!options.length) return;
  // Concentration sur la branche principale (poids élevé à une puissance) : l'IA atteint ses technologies de palier 4.
  const focus = aiParams(s, pid).researchFocus ?? 1;
  const val = (t) => Math.pow(w[t.branch], focus) / G.techCost(s, pid, t.id);
  options.sort((a, b) => val(b) - val(a) + (s.rng.next() - 0.5) * 0.02);
  G.setResearch(s, pid, options[0].id);
}

// ------------------------------------------------------------------ unités

function siteScore(s, pid, t, home) {
  if (!G.terrainOf(s, t).passable || t.type === 'sand' || t.natural) return -Infinity;
  if (t.owner !== -1 && t.owner !== pid) return -Infinity;
  if (s.cities.some((c) => G.cheb(c.x, c.y, t.x, t.y) < s.rules.minCityDistance)) return -Infinity;
  let score = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const n = G.tileAt(s, t.x + dx, t.y + dy);
    if (n && n.owner === -1) score += { plains: 2, grass: 2, forest: 1.6, hills: 1.8, sand: 1, water: 0.8 }[n.type] || 0;
  }
  if (G.isCoastal(s, t)) score += 2;
  // Une merveille naturelle dans le futur territoire : rendement et prestige.
  if ((s.naturals || []).some((n) => G.cheb(n.x, n.y, t.x, t.y) <= s.rules.cityRadius && G.tileAt(s, n.x, n.y).owner === -1)) score += 5;
  const d = home ? G.cheb(home.x, home.y, t.x, t.y) : 0;
  if (d > 11) return -Infinity;
  const foreignNear = s.cities.some((c) => c.owner !== pid && G.cheb(c.x, c.y, t.x, t.y) < s.rules.borderDistance - 1);
  return score - d * 0.9 - (foreignNear ? 12 : 0);
}

function bestSite(s, pid, u) {
  const home = G.citiesOf(s, pid)[0] || u;
  const { dist } = G.dijkstra(s, u); // un seul calcul de chemins pour toutes les cases candidates
  let best = null, bestScore = -Infinity;
  for (const t of s.map.tiles) {
    if (!dist.has(G.idx(s, t.x, t.y))) continue;
    const sc = siteScore(s, pid, t, home);
    if (sc > bestScore) { bestScore = sc; best = t; }
  }
  return best;
}

function moveUnit(s, pid, u) {
  if (u.type === 'settler') {
    if (!G.citiesOf(s, pid).length && G.canFound(s, u).ok) { G.foundCity(s, u.id); return; }
    if (!u.target || !G.canFound(s, { ...u, x: u.target.x, y: u.target.y }).ok) {
      const site = bestSite(s, pid, u);
      if (!site) return;
      u.target = { x: site.x, y: site.y };
    }
    G.advanceUnit(s, u);
    if (!u.target && G.canFound(s, u).ok) G.foundCity(s, u.id);
    return;
  }
  if (u.type === 'explorer') {
    if (!u.target) {
      const p = s.players[pid];
      // Des ruines connues à portée : on va les fouiller.
      const ruins = s.map.tiles.filter((t) => t.ruin && p.explored[G.idx(s, t.x, t.y)] && G.cheb(t.x, t.y, u.x, u.y) <= 8)
        .sort((a, b) => G.cheb(a.x, a.y, u.x, u.y) - G.cheb(b.x, b.y, u.x, u.y));
      for (const t of ruins.slice(0, 3)) if (G.findPath(s, u, t.x, t.y)) { u.target = { x: t.x, y: t.y }; break; }
    }
    if (!u.target) {
      const p = s.players[pid];
      const unexplored = s.map.tiles.filter((t) => !p.explored[G.idx(s, t.x, t.y)] && G.terrainOf(s, t).passable);
      unexplored.sort((a, b) => G.cheb(a.x, a.y, u.x, u.y) - G.cheb(b.x, b.y, u.x, u.y) + (s.rng.next() - 0.5) * 6);
      for (const t of unexplored.slice(0, 8)) if (G.findPath(s, u, t.x, t.y)) { u.target = { x: t.x, y: t.y }; break; }
    }
    G.advanceUnit(s, u);
    return;
  }
  if (u.type === 'emissary') {
    if (!u.target) {
      const targets = s.cities.filter((c) => c.owner !== pid && !G.hasEmbassy(s, pid, c.owner))
        .sort((a, b) => G.cheb(a.x, a.y, u.x, u.y) - G.cheb(b.x, b.y, u.x, u.y));
      for (const c of targets) if (G.findPath(s, u, c.x, c.y)) { u.target = { x: c.x, y: c.y }; break; }
    }
    G.advanceUnit(s, u);
    return;
  }
  if (u.type === 'caravan' || u.type === 'ship') {
    if (!u.target) {
      const routed = new Set(s.tradeRoutes.filter((r) => r.a === pid).map((r) => r.cityId));
      const targets = s.cities.filter((c) => c.owner !== pid && !routed.has(c.id))
        .sort((a, b) => G.getRel(s, pid, b.owner) - G.getRel(s, pid, a.owner) + (G.cheb(a.x, a.y, u.x, u.y) - G.cheb(b.x, b.y, u.x, u.y)) * 0.5);
      for (const c of targets) if (G.findPath(s, u, c.x, c.y)) { u.target = { x: c.x, y: c.y }; break; }
    }
    G.advanceUnit(s, u);
  }
}

function trainUnits(s, pid, P) {
  const p = s.players[pid];
  const cities = G.citiesOf(s, pid).sort((a, b) => b.pop - a.pop);
  if (!cities.length) return;
  if (s.wonders.exchange === pid) return; // thésaurisation (voie économique)
  const settlers = s.units.filter((u) => u.owner === pid && u.type === 'settler').length;
  const wanted = p.profile === 'explorer' ? P.expansion.explorerTargetCities : P.expansion.targetCities;
  if (cities.length + settlers < wanted && settlers === 0 && s.turn > 2) G.train(s, pid, cities[0].id, 'settler');
  const caravans = s.units.filter((u) => u.owner === pid && u.type === 'caravan').length;
  const routes = s.tradeRoutes.filter((r) => r.a === pid && !r.sea).length;
  if (caravans === 0 && routes < G.tradeRouteCap(s, pid) && p.res.gold > 70) {
    const c = cities.find((x) => !x.trained);
    if (c) G.train(s, pid, c.id, 'caravan');
  }
  const has = (type) => s.units.some((u) => u.owner === pid && u.type === type);
  if (!has('emissary') && p.res.gold > 80 && s.players.some((q) => q.id !== pid && !G.hasEmbassy(s, pid, q.id) && G.citiesOf(s, q.id).length)) {
    const c = cities.find((x) => !x.trained);
    if (c) G.train(s, pid, c.id, 'emissary');
  }
  if (!has('ship') && p.res.gold > 90 && s.tradeRoutes.filter((r) => r.a === pid && r.sea).length < G.seaRouteCap(s, pid)) {
    const c = cities.find((x) => !x.trained && G.canTrain(s, pid, x.id, 'ship').ok);
    if (c) G.train(s, pid, c.id, 'ship');
  }
}

// ------------------------------------------------------------ constructions

function buildSomething(s, pid, w, B) {
  const p = s.players[pid];
  if (!G.citiesOf(s, pid).length) return false;
  const y = p.lastYield ? p.lastYield.net : { food: 1, wood: 1, stone: 1, gold: 2 };
  // Voie économique : avec la Grande Bourse, l'IA thésaurise pour atteindre l'Or demandé.
  const hoard = s.wonders.exchange === pid ? s.rules.victory.economyGold : 0;
  const reserve = Math.max(hoard, s.units.some((u) => u.owner === pid && u.type === 'settler') ? 0 : B.goldReserve);
  const topBranch = Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
  // Matériaux transformés qui manquent pour la merveille de sa voie : on construit l'atelier qui les produit.
  const PRODUCER = { planks: 'sawmill', tools: 'forge', goods: 'manufactory' };
  const pwDef = PATH_WONDER[topBranch] && s.wonders[PATH_WONDER[topBranch]] === undefined ? G.buildingDef(s, PATH_WONDER[topBranch]) : null;
  const missingFor = new Set();
  if (pwDef) for (const [k, v] of Object.entries(G.costOf(s, pid, pwDef))) if (PRODUCER[k] && (p.res[k] || 0) < v) missingFor.add(PRODUCER[k]);
  const scored = s.data.buildings.filter((def) => !def.profile || def.profile === p.profile).map((def) => {
    let score = 0;
    if (def.profile) score += B.unique ?? 8; // bâtiment propre au profil
    for (const [k, v] of Object.entries(def.yields)) score += v * (w[YIELD_BRANCH[k]] || 1);
    if (def.yields.food && y.food < 2) score += B.foodNeed;
    if (def.yields.wood && (y.wood < 3 || p.res.wood < 20)) score += B.woodNeed;
    if (def.yields.stone && (y.stone < 3 || p.res.stone < 20)) score += B.stoneNeed;
    if (def.wonder) score += def.prestige * B.wonderPrestige;
    if (def.wonder && PATH_WONDER[topBranch] === def.id) score += B.pathWonder ?? 0; // merveille de sa voie de victoire
    if (def.prestige && !def.wonder) score += def.prestige * B.monumentPrestige;
    if (def.popCap) score += B.popCap;
    const count = s.buildings.filter((b) => b.owner === pid && b.type === def.id).length;
    const nCities = G.citiesOf(s, pid).length;
    if (def.id === 'sawmill' && count < Math.max(1, Math.ceil(nCities / 2)) && (p.res.planks || 0) < 30) score += B.sawmill;
    if (def.id === 'forge' && count < 1 + Math.floor(nCities / 3) && (p.res.tools || 0) < 25) score += B.forge;
    if (def.id === 'manufactory' && count < 1 + Math.floor(nCities / 2) && y.food >= 3 && (p.res.goods || 0) < 25) score += B.manufactory;
    if (def.id === 'outpost') score += B.outpost;
    if (def.id === 'markethall' && count === 0) score += B.markethall;
    if (def.id === 'lab') score += B.lab;
    if (def.footprint) score += B.quarter;
    if (missingFor.has(def.id) && count < 2) score += B.pathMaterials ?? 15;
    if (!def.wonder) score -= count * B.diversity; // diversité : on évite d'empiler toujours le même bâtiment
    return { def, score: score + s.rng.next() * 2 };
  }).sort((a, b) => b.score - a.score);
  const tiles = s.map.tiles.filter((t) => t.owner === pid);
  // Épargne pour une merveille : tant qu'une merveille est accessible, l'IA ne construit plus que l'essentiel.
  const target = B.saveForWonders && scored.find(({ def }) => def.wonder && s.wonders[def.id] === undefined && (!def.tech || G.hasTech(s, pid, def.tech))
    && !s.buildings.some((b) => b.owner === pid && b.type === def.id) && tiles.some((t) => def.terrain.includes(t.type) && !G.cityAt(s, t.x, t.y) && !G.buildingAt(s, t.x, t.y) && (!def.coastal || G.isCoastal(s, t))));
  const essential = (def) => (def.yields.food && y.food < 2) || def.id === 'quarry' || (def.id === 'lumber' && y.wood < 4) || missingFor.has(def.id);
  for (const { def } of scored) {
    if (target && !def.wonder && !essential(def)) continue;
    const cost = G.costOf(s, pid, def);
    if ((cost.gold || 0) + reserve > p.res.gold && cost.gold) continue;
    let best = null, bestVal = -1;
    for (const t of tiles) {
      if (!G.canBuild(s, pid, def.id, t.x, t.y).ok) continue;
      const val = Object.values(G.adjacencyBonus(s, pid, def.id, t.x, t.y)).reduce((a, v) => a + v, 0);
      if (val > bestVal) { bestVal = val; best = t; }
    }
    if (best) { G.build(s, pid, def.id, best.x, best.y); return true; }
  }
  return false;
}

// Vend les surplus (au-delà de 40) quand une Halle marchande existe ; garde toujours de quoi activer les luxes.
function sellSurplus(s, pid) {
  if (!G.hallCount(s, pid)) return;
  const p = s.players[pid];
  for (const res of ['goods', 'planks', 'tools', 'spices', 'marble', 'crystal', 'wood', 'stone']) {
    const extra = Math.floor((p.res[res] || 0) - 40);
    if (extra > 5) G.sell(s, pid, res, extra);
  }
}

function buildRoads(s, pid) {
  const p = s.players[pid];
  if (p.res.gold < 45 || p.res.wood < 12) return;
  const cities = G.citiesOf(s, pid);
  const cap = cities.find((c) => c.capital);
  if (!cap) return;
  for (const c of cities) {
    if (c === cap) continue;
    const walker = { owner: pid, x: cap.x, y: cap.y, type: 'explorer' };
    const path = G.findPath(s, walker, c.x, c.y);
    if (!path) continue;
    for (const i of path) {
      const t = s.map.tiles[i];
      if (t.road === pid || G.cityAt(s, t.x, t.y)) continue;
      if (G.buildRoad(s, pid, t.x, t.y).ok) return;
      break;
    }
  }
}

// ---------------------------------------------------------------- diplomatie

function lowestResource(p) {
  return ['wood', 'stone', 'food'].sort((a, b) => p.res[a] - p.res[b])[0];
}

function diplomacy(s, pid) {
  const p = s.players[pid];
  const pers = G.personalityOf(s, pid) || { proposeRate: 1, allianceMin: 55 };
  const rate = pers.proposeRate;
  const proj = s.rules.jointProject;
  let toHuman = s.proposals.filter((x) => x.to === 0).length;
  for (const q of s.players) {
    if (q.id === pid) continue;
    const rel = G.getRel(s, pid, q.id);
    const r = s.rng.next();
    const canPropose = !q.isHuman || toHuman < 2;
    if (canPropose && G.hasTech(s, pid, 'protocol') && !G.hasAgreement(s, pid, q.id) && rel >= 15 && r < 0.3 * rate) {
      if (G.propose(s, pid, q.id, 'agreement').pending) toHuman++;
      continue;
    }
    if (canPropose && G.hasTech(s, pid, 'embassies') && !G.isAllied(s, pid, q.id) && rel >= Math.max(55, pers.allianceMin) && r < 0.25 * rate) {
      if (G.propose(s, pid, q.id, 'alliance').pending) toHuman++;
      continue;
    }
    if (canPropose && G.isAllied(s, pid, q.id) && rel >= proj.minRelation && G.projectsBetween(s, pid, q.id) < proj.maxPerPair
      && G.canAfford(s, pid, proj.cost) && p.res.gold > 120 && r < 0.12 * rate) {
      if (G.propose(s, pid, q.id, 'project').pending) toHuman++;
      continue;
    }
    if (rel < 5 && p.res.gold > 140 && r < 0.2 && s.wonders.exchange !== pid) { G.giveGift(s, pid, q.id, 30); continue; }
    if (q.isHuman && toHuman < 2 && rel > -30) {
      if (r > 0.94) {
        const res = lowestResource(p);
        G.propose(s, pid, 0, 'request', { want: { [res]: 15 + s.rng.int(11) } });
        toHuman++;
      } else if (r > 0.88) {
        const surplus = ['wood', 'stone'].sort((a, b) => p.res[b] - p.res[a])[0];
        if (p.res[surplus] > 50) {
          const amt = 20;
          const want = Math.round(amt * s.data.resources[surplus].tradeValue * (1.1 - rel / 400));
          G.propose(s, pid, 0, 'exchange', { give: { [surplus]: amt }, want: { gold: want } });
          toHuman++;
        }
      }
    }
  }
}

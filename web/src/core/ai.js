// IA des joueurs ordinateurs : heuristiques simples pondérées par leur profil.
import * as G from './game.js';

const BRANCH_WEIGHTS = {
  merchant: { economy: 3, science: 1.2, culture: 1, diplomacy: 1.8 },
  scholar: { economy: 1, science: 3, culture: 1.2, diplomacy: 1.3 },
  builder: { economy: 1.8, science: 1.2, culture: 2.5, diplomacy: 1 },
  diplomat: { economy: 1.5, science: 1, culture: 1.2, diplomacy: 3 },
  explorer: { economy: 1.5, science: 1.3, culture: 2.2, diplomacy: 1.2 },
};
const YIELD_BRANCH = { gold: 'economy', science: 'science', culture: 'culture', food: 'economy', wood: 'economy', stone: 'economy' };

export function playAITurns(s) {
  for (const p of s.players) if (!p.isHuman && !s.winner) aiTurn(s, p.id);
}

function aiTurn(s, pid) {
  const p = s.players[pid];
  const w = BRANCH_WEIGHTS[p.profile];
  chooseResearch(s, pid, w);
  for (const u of s.units.filter((x) => x.owner === pid)) moveUnit(s, pid, u);
  trainUnits(s, pid);
  for (let i = 0; i < 2; i++) if (!buildSomething(s, pid, w)) break;
  buildRoads(s, pid);
  diplomacy(s, pid);
}

function chooseResearch(s, pid, w) {
  const p = s.players[pid];
  if (p.research) return;
  const options = G.availableTechs(s, pid);
  if (!options.length) return;
  options.sort((a, b) => (w[b.branch] / b.cost) - (w[a.branch] / a.cost) + (s.rng.next() - 0.5) * 0.02);
  G.setResearch(s, pid, options[0].id);
}

// ------------------------------------------------------------------ unités

function siteScore(s, pid, t, home) {
  if (!G.terrainOf(s, t).passable || t.type === 'sand') return -Infinity;
  if (t.owner !== -1 && t.owner !== pid) return -Infinity;
  if (s.cities.some((c) => G.cheb(c.x, c.y, t.x, t.y) < s.rules.minCityDistance)) return -Infinity;
  let score = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const n = G.tileAt(s, t.x + dx, t.y + dy);
    if (n && n.owner === -1) score += { plains: 2, grass: 2, forest: 1.6, hills: 1.8, sand: 1, water: 0.8 }[n.type] || 0;
  }
  if (G.isCoastal(s, t)) score += 2;
  const d = home ? G.cheb(home.x, home.y, t.x, t.y) : 0;
  if (d > 11) return -Infinity;
  const foreignNear = s.cities.some((c) => c.owner !== pid && G.cheb(c.x, c.y, t.x, t.y) < s.rules.borderDistance - 1);
  return score - d * 0.9 - (foreignNear ? 12 : 0);
}

function bestSite(s, pid, u) {
  const home = G.citiesOf(s, pid)[0] || u;
  let best = null, bestScore = -Infinity;
  for (const t of s.map.tiles) {
    const sc = siteScore(s, pid, t, home);
    if (sc > bestScore && G.findPath(s, u, t.x, t.y) !== null) { bestScore = sc; best = t; }
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
      const unexplored = s.map.tiles.filter((t) => !p.explored[G.idx(s, t.x, t.y)] && G.terrainOf(s, t).passable);
      unexplored.sort((a, b) => G.cheb(a.x, a.y, u.x, u.y) - G.cheb(b.x, b.y, u.x, u.y) + (s.rng.next() - 0.5) * 6);
      for (const t of unexplored.slice(0, 8)) if (G.findPath(s, u, t.x, t.y)) { u.target = { x: t.x, y: t.y }; break; }
    }
    G.advanceUnit(s, u);
    return;
  }
  if (u.type === 'caravan') {
    if (!u.target) {
      const routed = new Set(s.tradeRoutes.filter((r) => r.a === pid).map((r) => r.cityId));
      const targets = s.cities.filter((c) => c.owner !== pid && !routed.has(c.id))
        .sort((a, b) => G.getRel(s, pid, b.owner) - G.getRel(s, pid, a.owner) + (G.cheb(a.x, a.y, u.x, u.y) - G.cheb(b.x, b.y, u.x, u.y)) * 0.5);
      for (const c of targets) if (G.findPath(s, u, c.x, c.y)) { u.target = { x: c.x, y: c.y }; break; }
    }
    G.advanceUnit(s, u);
  }
}

function trainUnits(s, pid) {
  const p = s.players[pid];
  const cities = G.citiesOf(s, pid).sort((a, b) => b.pop - a.pop);
  if (!cities.length) return;
  const settlers = s.units.filter((u) => u.owner === pid && u.type === 'settler').length;
  const wanted = p.profile === 'explorer' ? 5 : 4;
  if (cities.length + settlers < wanted && settlers === 0 && s.turn > 2) G.train(s, pid, cities[0].id, 'settler');
  const caravans = s.units.filter((u) => u.owner === pid && u.type === 'caravan').length;
  const routes = s.tradeRoutes.filter((r) => r.a === pid).length;
  if (caravans === 0 && routes < cities.length + 1 && p.res.gold > 70) {
    const c = cities.find((x) => !x.trained);
    if (c) G.train(s, pid, c.id, 'caravan');
  }
}

// ------------------------------------------------------------ constructions

function buildSomething(s, pid, w) {
  const p = s.players[pid];
  if (!G.citiesOf(s, pid).length) return false;
  const y = p.lastYield ? p.lastYield.net : { food: 1, wood: 1, stone: 1, gold: 2 };
  const reserve = s.units.some((u) => u.owner === pid && u.type === 'settler') ? 0 : 35;
  const scored = s.data.buildings.map((def) => {
    let score = 0;
    for (const [k, v] of Object.entries(def.yields)) score += v * (w[YIELD_BRANCH[k]] || 1);
    if (def.yields.food && y.food < 2) score += 12;
    if (def.yields.wood && (y.wood < 3 || p.res.wood < 20)) score += 10;
    if (def.yields.stone && (y.stone < 3 || p.res.stone < 20)) score += 9;
    if (def.wonder) score += def.prestige;
    if (def.prestige && !def.wonder) score += def.prestige * 1.5;
    if (def.popCap) score += 6;
    return { def, score: score + s.rng.next() * 2 };
  }).sort((a, b) => b.score - a.score);
  const tiles = s.map.tiles.filter((t) => t.owner === pid);
  // Épargne pour une merveille : tant qu'une merveille est accessible, l'IA ne construit plus que l'essentiel.
  const target = scored.find(({ def }) => def.wonder && s.wonders[def.id] === undefined && (!def.tech || G.hasTech(s, pid, def.tech))
    && !s.buildings.some((b) => b.owner === pid && b.type === def.id) && tiles.some((t) => def.terrain.includes(t.type) && !G.cityAt(s, t.x, t.y) && !G.buildingAt(s, t.x, t.y) && (!def.coastal || G.isCoastal(s, t))));
  const essential = (def) => (def.yields.food && y.food < 2) || def.id === 'quarry' || (def.id === 'lumber' && y.wood < 4);
  for (const { def } of scored) {
    if (target && !def.wonder && !essential(def)) continue;
    const cost = G.costOf(s, pid, def);
    if ((cost.gold || 0) + reserve > p.res.gold && cost.gold) continue;
    for (const t of tiles) {
      if (G.canBuild(s, pid, def.id, t.x, t.y).ok) { G.build(s, pid, def.id, t.x, t.y); return true; }
    }
  }
  return false;
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
      if (G.buildingAt(s, t.x, t.y)) break;
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
  let toHuman = s.proposals.filter((x) => x.to === 0).length;
  for (const q of s.players) {
    if (q.id === pid) continue;
    const rel = G.getRel(s, pid, q.id);
    const r = s.rng.next();
    const canPropose = !q.isHuman || toHuman < 2;
    if (canPropose && G.hasTech(s, pid, 'protocol') && !G.hasAgreement(s, pid, q.id) && rel >= 15 && r < 0.3) {
      if (G.propose(s, pid, q.id, 'agreement').pending) toHuman++;
      continue;
    }
    if (canPropose && G.hasTech(s, pid, 'embassies') && !G.isAllied(s, pid, q.id) && rel >= 55 && r < 0.25) {
      if (G.propose(s, pid, q.id, 'alliance').pending) toHuman++;
      continue;
    }
    if (rel < 5 && p.res.gold > 140 && r < 0.2) { G.giveGift(s, pid, q.id, 30); continue; }
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

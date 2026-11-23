// Deuxième lot de diversité : capacités de profil, contrats commerciaux, influence culturelle, crise mondiale.
// Importé par game.js : les fonctions du moteur ne sont utilisées qu'à l'exécution.
import * as G from './game.js';
import { addBonusPrestige } from './diversity.js';

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const name = (s, pid) => s.players[pid].name;

// ------------------------------------------------------------ capacités de profil

export const abilityOf = (s, pid) => s.data.profilesById[s.players[pid].profile]?.ability || null;
export function abilityReadyIn(s, pid) {
  const a = abilityOf(s, pid);
  if (!a) return Infinity;
  const last = s.players[pid].abilityTurn;
  return last === undefined ? 0 : Math.max(0, last + a.cooldown - s.turn);
}
export function canUseAbility(s, pid) {
  const a = abilityOf(s, pid);
  if (!a) return { ok: false, reason: 'Aucune capacité.' };
  const wait = abilityReadyIn(s, pid);
  if (wait > 0) return { ok: false, reason: `${a.name} : encore ${wait} tour(s) de recharge.` };
  const p = s.players[pid];
  if (a.researchPct && !p.research) return { ok: false, reason: 'Choisissez d\'abord une recherche.' };
  if (a.rush && !s.buildings.some((b) => b.owner === pid && b.turnsLeft > 1)) return { ok: false, reason: 'Aucun chantier à accélérer.' };
  return { ok: true };
}
export function useAbility(s, pid) {
  const chk = canUseAbility(s, pid);
  if (!chk.ok) return chk;
  const a = abilityOf(s, pid), p = s.players[pid];
  p.abilityTurn = s.turn;
  if (a.buff) {
    p.buffs = (p.buffs || []).filter((b) => b.until >= s.turn);
    p.buffs.push({ yieldPct: a.buff.yieldPct, until: s.turn + a.buff.turns - 1, label: a.name });
  }
  if (a.researchPct) {
    const gain = Math.round(G.techCost(s, pid, p.research) * a.researchPct);
    p.sciencePool += gain;
    G.checkResearch(s, pid);
  }
  if (a.rush) for (const b of s.buildings) {
    if (b.owner !== pid || b.turnsLeft <= 1) continue;
    b.turnsLeft = Math.max(1, b.turnsLeft - (G.buildingDef(s, b.type).wonder ? 1 : a.rush));
  }
  if (a.relAll) for (const q of s.players) if (q.id !== pid) G.remember(s, pid, q.id, `${a.name} organisé par ${p.name}`, a.relAll);
  if (a.revealUnits) for (const u of s.units.filter((x) => x.owner === pid)) G.reveal(s, pid, u.x, u.y, a.revealUnits);
  if (a.moves) for (const u of s.units.filter((x) => x.owner === pid)) u.movesLeft += a.moves;
  G.log(s, `${p.isHuman ? 'Vous utilisez' : `${p.name} utilise`} ${a.name}.`, p.isHuman ? [pid] : null, p.isHuman ? 'good' : 'info');
  return { ok: true };
}

// IA : utilise sa capacité quand elle est utile.
export function aiAbility(s, pid) {
  if (!canUseAbility(s, pid).ok) return;
  const a = abilityOf(s, pid), p = s.players[pid];
  const y = p.lastYield?.net || {};
  let use = false;
  if (a.buff) use = (y.gold || 0) >= 8;
  else if (a.researchPct) use = true;
  else if (a.rush) use = s.buildings.some((b) => b.owner === pid && b.turnsLeft >= 2);
  else if (a.relAll) use = s.players.some((q) => q.id !== pid && G.getRel(s, pid, q.id) < 45);
  else if (a.revealUnits) use = p.explored.reduce((t, v) => t + v, 0) / p.explored.length < 0.7;
  if (use) useAbility(s, pid);
}

// ------------------------------------------------------------ contrats commerciaux
// Une IA demande une livraison (« 20 planches d'ici 6 tours ») contre de l'Or, de la relation et du prestige.

export function contractsTick(s) {
  const C = s.rules.contracts;
  if (!C) return;
  s.contracts = s.contracts || [];
  // Offres non acceptées : elles expirent au tour suivant. Contrats échus : pénalité.
  for (const c of [...s.contracts]) {
    if (c.status === 'offered' && s.turn > c.turn + 1) s.contracts = s.contracts.filter((x) => x !== c);
    if (c.status === 'active' && s.turn > c.deadline) {
      s.contracts = s.contracts.filter((x) => x !== c);
      G.remember(s, c.to, c.from, `Contrat non honoré (${c.qty} ${s.data.resources[c.res].name})`, C.failRelation);
      G.log(s, `Contrat non honoré : ${name(s, c.from)} est déçu (${C.failRelation} relation).`, [c.to], 'bad');
    }
  }
  if (s.turn < C.firstTurn) return;
  if (s.nextContract === undefined) s.nextContract = s.turn + s.rng.int(C.every[1] - C.every[0] + 1);
  if (s.turn < s.nextContract) return;
  s.nextContract = s.turn + C.every[0] + s.rng.int(C.every[1] - C.every[0] + 1);
  // Un client et un fournisseur au hasard, en bons termes ; le joueur humain est un fournisseur comme les autres.
  const pairs = [];
  for (const a of s.players) for (const b of s.players) {
    if (a.id === b.id || a.isHuman) continue;
    if (G.getRel(s, a.id, b.id) < C.minRelation) continue;
    if (s.contracts.some((c) => c.to === b.id && c.from === a.id)) continue;
    pairs.push([a.id, b.id]);
  }
  if (!pairs.length) return;
  const humanPairs = pairs.filter(([, b]) => s.players[b].isHuman);
  const [from, to] = humanPairs.length && s.rng.next() < 0.5 ? humanPairs[s.rng.int(humanPairs.length)] : pairs[s.rng.int(pairs.length)];
  offerContract(s, from, to);
}

export function offerContract(s, from, to) {
  const C = s.rules.contracts;
  const res = C.goods[s.rng.int(C.goods.length)];
  const base = s.data.resources[res].tradeValue || 1;
  const qty = Math.round((C.qtyBase + C.qtyPerTurn * s.turn) / Math.max(0.6, base) / 5) * 5;
  const c = { id: s.nextId++, from, to, res, qty, gold: Math.round(qty * base * C.rewardPerValue), relation: C.relation, prestige: C.prestige, turn: s.turn, deadline: s.turn + C.duration, status: 'offered' };
  s.contracts.push(c);
  if (s.players[to].isHuman) {
    G.log(s, `${name(s, from)} propose un contrat : ${qty} ${s.data.resources[res].name} contre ${c.gold} Or.`, [to], 'warn');
  } else {
    // IA fournisseur : accepte si elle peut livrer sans se mettre en danger, et livre aussitôt.
    const p = s.players[to];
    if ((p.res[res] || 0) >= qty * 1.3) { acceptContract(s, c.id); deliverContract(s, c.id); } else s.contracts = s.contracts.filter((x) => x !== c);
  }
  return c;
}

export function acceptContract(s, id) {
  const c = (s.contracts || []).find((x) => x.id === id && x.status === 'offered');
  if (!c) return { ok: false, reason: 'Contrat introuvable.' };
  c.status = 'active'; c.deadline = s.turn + s.rules.contracts.duration;
  if (s.players[c.to].isHuman) G.log(s, `Contrat accepté : livrer ${c.qty} ${s.data.resources[c.res].name} à ${name(s, c.from)} avant le tour ${c.deadline}.`, [c.to], 'info');
  return { ok: true };
}
export function declineContract(s, id) {
  s.contracts = (s.contracts || []).filter((x) => x.id !== id);
  return { ok: true };
}
export function deliverContract(s, id) {
  const c = (s.contracts || []).find((x) => x.id === id && x.status === 'active');
  if (!c) return { ok: false, reason: 'Contrat introuvable.' };
  const p = s.players[c.to];
  if ((p.res[c.res] || 0) < c.qty) return { ok: false, reason: `Il vous manque ${Math.ceil(c.qty - (p.res[c.res] || 0))} ${s.data.resources[c.res].name}.` };
  p.res[c.res] -= c.qty;
  s.players[c.from].res[c.res] = (s.players[c.from].res[c.res] || 0) + c.qty;
  p.res.gold += c.gold;
  G.remember(s, c.to, c.from, `Contrat honoré (${c.qty} ${s.data.resources[c.res].name})`, c.relation);
  addBonusPrestige(s, c.to, 'commerce', c.prestige);
  s.contracts = s.contracts.filter((x) => x !== c);
  G.log(s, `Contrat honoré : ${c.qty} ${s.data.resources[c.res].name} livrés à ${name(s, c.from)} (+${c.gold} Or, +${c.relation} relation, +${c.prestige} prestige).`, [c.to, c.from], 'good');
  return { ok: true };
}

// ------------------------------------------------------------ influence culturelle
// La culture produite s'accumule en influence ; elle annexe les cases neutres voisines du territoire,
// et peut faire basculer une case frontalière d'un voisin dont la culture est bien plus faible.

export function influenceCost(s, pid) {
  const I = s.rules.influence;
  return I.baseCost + I.costPerClaim * (s.players[pid].claims || 0);
}

function nearestCity(s, pid, t) {
  let best = null, bd = Infinity;
  for (const c of G.citiesOf(s, pid)) { const d = G.cheb(c.x, c.y, t.x, t.y); if (d < bd) { bd = d; best = c; } }
  return { city: best, d: bd };
}

function candidates(s, pid) {
  const I = s.rules.influence;
  const out = [];
  for (const t of s.map.tiles) {
    if (t.owner === pid) continue;
    if (!G.neighbors(s, t.x, t.y, D4).some((n) => n.owner === pid)) continue;
    if (G.terrainOf(s, t).water && !t.natural) continue;
    const { city, d } = nearestCity(s, pid, t);
    if (!city || d > I.maxDist) continue;
    let score = 10 - d + (t.natural ? 6 : 0) + (t.luxury ? 4 : 0) + (G.terrainOf(s, t).passable ? 1 : 0);
    let flip = false;
    if (t.owner !== -1) {
      if (G.cityAt(s, t.x, t.y) || G.buildingAt(s, t.x, t.y)) continue;
      if (G.citiesOf(s, t.owner).some((c) => G.cheb(c.x, c.y, t.x, t.y) <= 1)) continue;
      const mine = s.players[pid].lastYield?.net.culture || 0, theirs = s.players[t.owner].lastYield?.net.culture || 0;
      if (mine < Math.max(2, theirs * I.flipFactor)) continue;
      flip = true; score -= 5;
    }
    out.push({ t, city, score, flip });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function influenceTick(s, pid, culture) {
  const I = s.rules.influence;
  if (!I) return;
  const p = s.players[pid];
  p.influence = (p.influence || 0) + Math.max(0, culture);
  for (let guard = 0; guard < 3; guard++) {
    const cost = influenceCost(s, pid);
    if (p.influence < cost) return;
    const list = candidates(s, pid);
    const pick = list.find((c) => !c.flip) || list[0];
    if (!pick) { p.influence = Math.min(p.influence, cost); return; }
    const price = pick.flip ? cost * I.flipCostMult : cost;
    if (p.influence < price) return;
    p.influence -= price;
    p.claims = (p.claims || 0) + 1;
    const t = pick.t, prev = t.owner;
    t.owner = pid; t.cityId = pick.city.id;
    if (prev !== -1) {
      G.remember(s, pid, prev, 'Une case de notre frontière est passée sous son influence', I.flipRelation);
      G.log(s, `Influence culturelle : ${p.isHuman ? 'une case de' : `${p.name} attire une case de`} ${p.isHuman ? `${name(s, prev)} rejoint votre territoire` : name(s, prev)} (${I.flipRelation} relation).`, [pid, prev], p.isHuman ? 'good' : 'bad');
    } else if (p.isHuman) {
      G.log(s, `Influence culturelle : ${pick.city.name} s'étend d'une case${t.natural ? ' et englobe une merveille naturelle' : t.luxury ? ' et englobe une ressource rare' : ''}.`, [pid], 'good');
    }
  }
}

// ------------------------------------------------------------ crise mondiale
// En milieu de partie, une crise frappe tout le monde. Un Congrès extraordinaire réunit les contributions :
// si l'objectif est atteint, la crise prend fin et les contributeurs gagnent du prestige (les promesses ne sont versées
// qu'en cas de succès) ; sinon, le malus dure plusieurs tours.

export const crisisDef = (s) => (s.crisis ? s.rules.crisis.list.find((c) => c.id === s.crisis.id) : null);
export const crisisGoal = (s) => s.rules.crisis.goalPerPlayer * s.players.length;
export function crisisActive(s) {
  const c = s.crisis;
  if (!c) return false;
  return c.status === 'open' || (c.status === 'failed' && s.turn <= c.until);
}

export function crisisTick(s) {
  const K = s.rules.crisis;
  if (!K) return;
  if (s.crisisTurn === undefined) s.crisisTurn = Math.round(s.rules.turnLimit * K.turnPct) + s.rng.int(K.jitter * 2 + 1) - K.jitter;
  if (s.crisis?.status === 'open' && s.turn > s.crisis.turn) resolveCrisis(s); // le joueur n'a pas répondu : il ne verse rien
  if (s.crisis || s.turn !== s.crisisTurn) return;
  if (s.congress?.status === 'open') { s.crisisTurn++; return; } // pas le même tour qu'un congrès ordinaire
  const def = K.list[s.rng.int(K.list.length)];
  s.crisis = { id: def.id, turn: s.turn, status: 'open', pledges: {} };
  for (const p of s.players) if (!p.isHuman) s.crisis.pledges[p.id] = aiPledge(s, p.id);
  G.log(s, `Crise mondiale : ${def.name}. Un Congrès extraordinaire réunit les contributions (objectif ${crisisGoal(s)} Or).`, null, 'bad');
  if (!s.players.some((p) => p.isHuman)) resolveCrisis(s);
}

function aiPledge(s, pid) {
  const p = s.players[pid], K = s.rules.crisis;
  const pers = p.personality;
  const generous = K.levels[2], modest = K.levels[1];
  if (pers === 'isolationist' && s.rng.next() < 0.6) return 'none';
  if (p.res.gold >= generous.gold * 1.6 && (p.profile === 'diplomat' || pers === 'loyal' || s.rng.next() < 0.4)) return 'generous';
  if (p.res.gold >= modest.gold * 1.5) return 'modest';
  return 'none';
}

export function pledgeCrisis(s, pid, level) {
  if (!s.crisis || s.crisis.status !== 'open') return { ok: false, reason: 'Aucune crise en cours.' };
  const lv = s.rules.crisis.levels.find((l) => l.id === level);
  if (!lv) return { ok: false };
  if (s.players[pid].res.gold < lv.gold) return { ok: false, reason: `Il faut ${lv.gold} Or.` };
  s.crisis.pledges[pid] = level;
  if (s.players.filter((p) => p.isHuman).every((p) => s.crisis.pledges[p.id] !== undefined)) resolveCrisis(s);
  return { ok: true };
}

function resolveCrisis(s) {
  const c = s.crisis, K = s.rules.crisis, def = crisisDef(s);
  const lv = (pid) => K.levels.find((l) => l.id === (c.pledges[pid] || 'none'));
  // Promesses plafonnées par l'Or réellement disponible au moment du vote.
  const total = s.players.reduce((a, p) => a + (p.res.gold >= lv(p.id).gold ? lv(p.id).gold : 0), 0);
  c.total = total;
  if (total >= crisisGoal(s)) {
    c.status = 'resolved';
    for (const p of s.players) {
      const l = lv(p.id);
      if (!l.gold || p.res.gold < l.gold) continue;
      p.res.gold -= l.gold;
      addBonusPrestige(s, p.id, 'crise', l.prestige);
    }
    const givers = s.players.filter((p) => lv(p.id).gold).map((p) => p.name).join(', ');
    G.log(s, `${def.name} : la crise est surmontée grâce à ${givers} (${total}/${crisisGoal(s)} Or). Les contributeurs gagnent du prestige.`, null, 'good');
  } else {
    c.status = 'failed'; c.until = s.turn + K.failTurns - 1;
    G.log(s, `${def.name} : contributions insuffisantes (${total}/${crisisGoal(s)} Or). La crise durera jusqu'au tour ${c.until}. Personne n'a payé.`, null, 'bad');
  }
}

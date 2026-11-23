// Phase 9 — économie mondiale : prix communs à tous les joueurs, bulles spéculatives, monopoles, ligue marchande.
// Importé par game.js : les fonctions du moteur ne sont utilisées qu'à l'exécution.
import * as G from './game.js';
import { addBonusPrestige } from './diversity.js';

const E = (s) => s.rules.economy;

// ------------------------------------------------------------ marché mondial
// Chaque ressource a un facteur de prix (1 = valeur de référence). Toute vente, d'où qu'elle vienne,
// fait baisser le prix pour tout le monde ; tout achat le fait monter. Chaque tour, le prix revient
// doucement vers une cible qui dépend de la rareté (nombre de producteurs) et de la mode (bulles).

export function ensureWorld(s) {
  if (!s.world) s.world = { price: {}, history: {}, bubble: null, nextBubble: null, monopoly: {} };
  return s.world;
}
export const worldFactor = (s, res) => ensureWorld(s).price[res] ?? 1;

// Producteurs d'une ressource : joueurs qui l'exploitent (Comptoir terminé) ou la fabriquent (atelier).
export function producers(s, res) {
  const out = new Set();
  for (const b of s.buildings) {
    if (b.turnsLeft > 0) continue;
    if (b.luxury === res) out.add(b.owner);
    const def = G.buildingDef(s, b.type);
    if (def.process?.out?.[res] || def.yields?.[res]) out.add(b.owner);
  }
  if (['wood', 'stone', 'food'].includes(res)) for (const c of s.cities) out.add(c.owner); // matières premières : tout le monde
  return [...out];
}

function targetFactor(s, res) {
  const K = E(s);
  const n = producers(s, res).length;
  let t = n === 0 ? K.scarceTarget : n === 1 && G.LUXURIES.includes(res) ? K.monopolyTarget : Math.max(K.minTarget, 1 - K.perProducer * (n - 2));
  const b = s.world.bubble;
  if (b && b.res === res) t = b.phase === 'rise' ? b.peak : K.crashFactor;
  return t;
}

export const monopolist = (s, res) => (G.LUXURIES.includes(res) ? ensureWorld(s).monopoly[res] ?? null : null);

// Prix de vente unitaire pour un joueur : valeur × taux de sa Halle × prix mondial (× bonus de monopole et de ligue).
export function sellPrice(s, pid, res, factor = worldFactor(s, res)) {
  const K = E(s);
  let p = (s.data.resources[res].tradeValue || 0) * G.sellRate(s, pid) * factor;
  if (monopolist(s, res) === pid) p *= 1 + K.monopolyBonus;
  if (inLeague(s, pid)) p *= 1 + s.rules.league.sellBonus;
  return p;
}
// Prix d'achat unitaire : valeur × prix mondial × marge des marchands (plus cher si un autre joueur a le monopole).
export function buyPrice(s, pid, res, factor = worldFactor(s, res)) {
  const K = E(s);
  let p = (s.data.resources[res].tradeValue || 0) * factor * K.buySpread;
  const m = monopolist(s, res);
  if (m !== null && m !== pid) p *= 1 + K.monopolyBonus;
  return p;
}

export function quoteSale(s, pid, res, qty) {
  const K = E(s);
  let f = worldFactor(s, res), total = 0;
  for (let i = 0; i < qty; i++) { total += sellPrice(s, pid, res, f); f = Math.max(K.minFactor, f * K.saturation); }
  return { gold: Math.floor(total), factor: f };
}
export function quoteBuy(s, pid, res, qty) {
  const K = E(s);
  let f = worldFactor(s, res), total = 0;
  for (let i = 0; i < qty; i++) { total += buyPrice(s, pid, res, f); f = Math.min(K.maxFactor, f / K.saturation); }
  return { gold: Math.ceil(total), factor: f };
}

export function canBuy(s, pid, res) {
  if (!s.rules.market.sellable.includes(res)) return { ok: false, reason: 'Ressource indisponible au marché.' };
  if (!G.hallCount(s, pid)) return { ok: false, reason: 'Construisez d\'abord une Halle marchande.' };
  if (!producers(s, res).some((q) => q !== pid)) return { ok: false, reason: 'Personne d\'autre ne produit cette ressource pour l\'instant.' };
  return { ok: true };
}
export function buy(s, pid, res, qty) {
  const chk = canBuy(s, pid, res);
  if (!chk.ok) return chk;
  const q = quoteBuy(s, pid, res, qty);
  const p = s.players[pid];
  if (p.res.gold < q.gold) return { ok: false, reason: `Il faut ${q.gold} Or.` };
  p.res.gold -= q.gold;
  p.res[res] = (p.res[res] || 0) + qty;
  s.world.price[res] = q.factor;
  const m = monopolist(s, res);
  if (m !== null && m !== pid) s.players[m].res.gold += Math.floor(q.gold * E(s).monopolyShare); // le monopole touche sa part
  return { ok: true, qty, gold: q.gold };
}

// Fin de tour : retour vers la cible, bulles, monopoles, historique des cours.
export function economyTick(s) {
  const K = E(s);
  if (!K) return;
  const w = ensureWorld(s);
  bubbleTick(s);
  for (const res of s.rules.market.sellable) {
    const f = w.price[res] ?? 1;
    const t = targetFactor(s, res);
    const speed = w.bubble && w.bubble.res === res ? K.bubbleSpeed : K.recovery;
    w.price[res] = Math.min(K.maxFactor, Math.max(K.minFactor, f + (t - f) * speed));
    (w.history[res] ||= []).push(Math.round(w.price[res] * 100) / 100);
    if (w.history[res].length > 20) w.history[res].shift();
  }
  monopolyTick(s);
}

function bubbleTick(s) {
  const K = E(s), w = s.world;
  if (w.nextBubble === null || w.nextBubble === undefined) w.nextBubble = K.bubbleFirst + s.rng.int(K.bubbleEvery);
  const b = w.bubble;
  if (b) {
    if (b.phase === 'rise' && s.turn >= b.until) {
      b.phase = 'crash'; b.until = s.turn + K.crashTurns;
      G.log(s, `La bulle éclate : le cours ${de(s, b.res)} s'effondre !`, null, 'bad');
    } else if (b.phase === 'crash' && s.turn >= b.until) {
      w.bubble = null; w.nextBubble = s.turn + K.bubbleEvery + s.rng.int(K.bubbleEvery);
    }
    return;
  }
  if (s.turn < w.nextBubble) return;
  const pool = s.rules.market.sellable.filter((r) => !['wood', 'stone', 'food'].includes(r) && producers(s, r).length > 0);
  if (!pool.length) { w.nextBubble = s.turn + 3; return; }
  const res = pool[s.rng.int(pool.length)];
  const rise = K.bubbleRise[0] + s.rng.int(K.bubbleRise[1] - K.bubbleRise[0] + 1);
  w.bubble = { res, phase: 'rise', until: s.turn + rise, peak: K.bubblePeak, start: s.turn };
  G.log(s, `Engouement mondial pour ${laName(s, res)} : son cours s'envole. Vendez au bon moment, la bulle éclatera !`, null, 'warn');
}

function monopolyTick(s) {
  const w = s.world;
  for (const res of G.LUXURIES) {
    const prod = producers(s, res);
    const now = prod.length === 1 ? prod[0] : null;
    const before = w.monopoly[res] ?? null;
    if (now === before) continue;
    w.monopoly[res] = now;
    // Seuls les joueurs concernés sont prévenus ; l'Entrepôt affiche les monopoles à tout le monde.
    if (now !== null) G.log(s, `Vous détenez le monopole ${de(s, res)} : prix de vente +${Math.round(E(s).monopolyBonus * 100)} %.`, [now], 'good');
    if (before !== null) G.log(s, `Fin de votre monopole ${de(s, res)} : un concurrent en produit aussi.`, [before], 'info');
  }
}

// Article défini et partitif de chaque ressource (« pour la soie », « le cours du sel »).
const ART = {
  wood: ['le bois', 'du bois'], stone: ['la pierre', 'de la pierre'], food: ['la nourriture', 'de la nourriture'],
  planks: ['les planches', 'des planches'], tools: ['les outils', 'des outils'], goods: ['les biens', 'des biens'],
  furs: ['les fourrures', 'des fourrures'], crystal: ['le cristal', 'du cristal'], marble: ['le marbre', 'du marbre'],
  wine: ['le vin', 'du vin'], silk: ['la soie', 'de la soie'], pearls: ['les perles', 'des perles'],
  salt: ['le sel', 'du sel'], spices: ['les épices', 'des épices'], incense: ["l'encens", "de l'encens"],
};
const laName = (s, res) => ART[res]?.[0] || s.data.resources[res].name;
const de = (s, res) => ART[res]?.[1] || `de ${s.data.resources[res].name}`;

// IA : vend dans les bulles, achète la ressource rare qui lui manque quand elle est riche.
export function aiMarket(s, pid) {
  if (!G.hallCount(s, pid)) return;
  const p = s.players[pid], K = E(s);
  for (const res of s.rules.market.sellable) {
    const f = worldFactor(s, res);
    const keep = G.LUXURIES.includes(res) ? 2 : 10;
    const extra = Math.floor((p.res[res] || 0) - keep);
    if (f >= K.aiSellAbove && extra >= 3) G.sell(s, pid, res, extra);
  }
  if (p.res.gold > K.aiBuyGold) {
    const missing = G.LUXURIES.filter((r) => (p.res[r] || 0) < 1 && canBuy(s, pid, r).ok && worldFactor(s, r) < 1.4);
    if (missing.length) { const r = missing[s.rng.int(missing.length)]; if (quoteBuy(s, pid, r, 3).gold < p.res.gold * 0.3) buy(s, pid, r, 3); }
  }
}

// ------------------------------------------------------------ ligue marchande (Hanse)
// Une seule ligue par partie. Ses membres paient une cotisation ; les routes entre membres rapportent davantage
// et leurs ventes à la Halle sont mieux payées. Un membre en conflit ouvert ou qui n'honore pas un contrat est exclu.

export const inLeague = (s, pid) => !!s.league && s.league.members.includes(pid);
export function canFoundLeague(s, pid) {
  const L = s.rules.league;
  if (s.league) return { ok: false, reason: 'Une ligue marchande existe déjà.' };
  if (!G.hasTech(s, pid, L.tech)) return { ok: false, reason: `Nécessite ${G.techDef(s, L.tech).name}.` };
  if (!G.canAfford(s, pid, L.foundCost)) return { ok: false, reason: `Il faut ${G.fmtBundle(s, L.foundCost)}.` };
  return { ok: true };
}
export function foundLeague(s, pid) {
  const chk = canFoundLeague(s, pid);
  if (!chk.ok) return chk;
  for (const [k, v] of Object.entries(s.rules.league.foundCost)) s.players[pid].res[k] -= v;
  s.league = { founder: pid, members: [pid], turn: s.turn };
  addBonusPrestige(s, pid, 'commerce', s.rules.league.foundPrestige);
  G.log(s, `${s.players[pid].isHuman ? 'Vous fondez' : `${s.players[pid].name} fonde`} la Ligue marchande (+${s.rules.league.foundPrestige} prestige).`, null, 'good');
  return { ok: true };
}
export function leagueAccepts(s, from, to) {
  const L = s.rules.league;
  if (!s.league || !inLeague(s, from)) return { accept: false, reason: 'Pas de ligue.' };
  if (inLeague(s, to)) return { accept: false, reason: 'Déjà membre.' };
  if (!G.hasTech(s, to, L.tech)) return { accept: false, reason: `${s.players[to].name} ne connaît pas encore le ${G.techDef(s, L.tech).name}.` };
  if ((s.league.excluded || []).includes(to)) return { accept: false, reason: `${s.players[to].name} a été exclu de la ligue.` };
  const rel = G.getRel(s, from, to);
  if (rel < L.minRelation) return { accept: false, reason: `Relation insuffisante (min. ${L.minRelation}).` };
  if (G.personalityOf(s, to)?.name === 'Isolationniste' && rel < L.minRelation + 25) return { accept: false, reason: `${s.players[to].name} préfère rester à l'écart.` };
  return { accept: true };
}
export function joinLeague(s, pid) {
  if (!s.league || inLeague(s, pid)) return { ok: false };
  s.league.members.push(pid);
  G.log(s, `${s.players[pid].isHuman ? 'Vous rejoignez' : `${s.players[pid].name} rejoint`} la Ligue marchande.`, null, 'good');
  return { ok: true };
}
export function leaveLeague(s, pid, reason = null) {
  if (!inLeague(s, pid)) return { ok: false };
  s.league.members = s.league.members.filter((m) => m !== pid);
  if (reason) { s.league.excluded = [...(s.league.excluded || []), pid]; G.log(s, `${s.players[pid].isHuman ? 'Vous êtes exclu' : `${s.players[pid].name} est exclu`} de la Ligue marchande : ${reason}.`, null, 'bad'); }
  else G.log(s, `${s.players[pid].isHuman ? 'Vous quittez' : `${s.players[pid].name} quitte`} la Ligue marchande.`, null, 'info');
  if (s.league.members.length === 0) s.league = null;
  else if (s.league.founder === pid) s.league.founder = s.league.members[0];
  return { ok: true };
}
// Invitation : un membre invite un joueur (proposition pour l'humain, décision immédiate pour une IA).
export function inviteToLeague(s, from, to) {
  if (!inLeague(s, from)) return { ok: false, reason: 'Vous n\'êtes pas membre de la ligue.' };
  if (s.players[to].isHuman) {
    if (s.proposals.some((p) => p.to === to && p.kind === 'league')) return { ok: false };
    s.proposals.push({ id: s.nextId++, from, to, kind: 'league', payload: {}, turn: s.turn });
    return { ok: true, pending: true };
  }
  const ev = leagueAccepts(s, from, to);
  if (!ev.accept) return { ok: false, reason: ev.reason };
  return joinLeague(s, to);
}

// Bonus de route : les routes commerciales entre deux membres rapportent davantage (Or et prestige).
export const leagueRoute = (s, a, b) => inLeague(s, a) && inLeague(s, b);

// Fin de tour : cotisation, exclusions.
export function leagueTick(s) {
  if (!s.league) return;
  const L = s.rules.league;
  for (const pid of [...s.league.members]) {
    const p = s.players[pid];
    if (p.res.gold < L.dues) { leaveLeague(s, pid, 'cotisation impayée'); continue; }
    p.res.gold -= L.dues;
    const enemy = s.league.members.find((q) => q !== pid && G.getRel(s, pid, q) < L.excludeBelow);
    if (enemy !== undefined) { leaveLeague(s, pid, `conflit ouvert avec ${s.players[enemy].name}`); continue; }
  }
}
// Contrat non honoré par un membre : exclusion.
export function leagueBrokenContract(s, pid) { if (inLeague(s, pid)) leaveLeague(s, pid, 'contrat non honoré'); }

// IA : fonde la ligue (Négociant ou commerçant actif), invite ses partenaires, propose à l'humain d'entrer.
export function aiLeague(s, pid) {
  const L = s.rules.league, p = s.players[pid];
  if (!s.league) {
    const traders = s.tradeRoutes.filter((r) => r.a === pid || r.b === pid).length;
    if ((p.profile === 'merchant' || traders >= 2) && canFoundLeague(s, pid).ok && p.res.gold > L.foundCost.gold * 2) foundLeague(s, pid);
    return;
  }
  if (!inLeague(s, pid)) return;
  if (s.rng.next() > 0.25) return;
  const cands = s.players.filter((q) => q.id !== pid && !inLeague(s, q.id) && !(s.league.excluded || []).includes(q.id) && G.getRel(s, pid, q.id) >= L.minRelation);
  if (cands.length) inviteToLeague(s, pid, cands[s.rng.int(cands.length)].id);
}

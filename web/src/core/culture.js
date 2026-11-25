// Phase 11 — science, culture et tourisme : défis scientifiques, œuvres d'art, patrimoine mondial, tourisme.
// Importé par game.js : les fonctions du moteur ne sont utilisées qu'à l'exécution.
import * as G from './game.js';
import { addBonusPrestige, naturalDef } from './diversity.js';
import { vocationTourism } from './land.js';
import { movementTourism } from './movements.js';

const nm = (s, pid) => s.players[pid].name;
const done = (b) => !b.turnsLeft;

// ------------------------------------------------------------ défis scientifiques
// Objectifs ouverts à tous : le premier qui les remplit gagne du prestige et de la Science (course, comme les merveilles).

function challengeMet(s, pid, ch) {
  const p = s.players[pid];
  if (ch.techs && !ch.techs.every((t) => p.techs.includes(t))) return false;
  if (ch.techCount && p.techs.length < ch.techCount) return false;
  if (ch.buildings) for (const [type, n] of Object.entries(ch.buildings)) if (s.buildings.filter((b) => b.owner === pid && b.type === type && done(b)).length < n) return false;
  if (ch.explored && p.explored.reduce((a, v) => a + v, 0) / p.explored.length < ch.explored) return false;
  return true;
}
export function challengeProgress(s, pid, ch) {
  const p = s.players[pid], parts = [];
  if (ch.techs) parts.push(...ch.techs.map((t) => `${G.techDef(s, t).name} ${p.techs.includes(t) ? '✓' : '✗'}`));
  if (ch.techCount) parts.push(`${p.techs.length}/${ch.techCount} technologies`);
  if (ch.buildings) for (const [type, n] of Object.entries(ch.buildings)) parts.push(`${Math.min(n, s.buildings.filter((b) => b.owner === pid && b.type === type && done(b)).length)}/${n} ${G.buildingDef(s, type).name.toLowerCase()}`);
  if (ch.explored) parts.push(`${Math.round((p.explored.reduce((a, v) => a + v, 0) / p.explored.length) * 100)}/${Math.round(ch.explored * 100)} % exploré`);
  return parts.join(' · ');
}
export function challengesTick(s) {
  s.challenges = s.challenges || {};
  for (const ch of s.rules.challenges || []) {
    if (s.challenges[ch.id] !== undefined) continue;
    const winner = s.players.find((p) => challengeMet(s, p.id, ch));
    if (!winner) continue;
    s.challenges[ch.id] = winner.id;
    addBonusPrestige(s, winner.id, 'defis', ch.prestige);
    winner.sciencePool += ch.science || 0;
    G.log(s, `Défi scientifique « ${ch.name} » remporté par ${nm(s, winner.id)} (+${ch.prestige} prestige, +${ch.science} Science).`, null, winner.id === 0 ? 'good' : 'info');
  }
}

// ------------------------------------------------------------ œuvres d'art
// Une œuvre est commandée dans un lieu d'exposition (théâtre, monument, quartier des arts, amphithéâtre) qui a une place libre.
// Elle rapporte Culture et tourisme à celui qui l'expose. On peut la prêter à un voisin : il en profite, le prêteur
// touche un loyer et gagne de la relation ; l'œuvre revient à la fin du prêt.

export function artSlots(s, pid) {
  const S = s.rules.artworks.slots;
  return s.buildings.filter((b) => b.owner === pid && done(b) && S[b.type]).reduce((a, b) => a + S[b.type], 0);
}
export const artworksHeld = (s, pid) => (s.artworks || []).filter((a) => a.holder === pid);
export const artworksOwned = (s, pid) => (s.artworks || []).filter((a) => a.owner === pid);
export const freeArtSlots = (s, pid) => artSlots(s, pid) - artworksHeld(s, pid).length;

export function canCommission(s, pid, kind) {
  const K = s.rules.artworks.kinds[kind];
  if (!K) return { ok: false, reason: 'Inconnu.' };
  if (K.tech && !G.hasTech(s, pid, K.tech)) return { ok: false, reason: `Nécessite ${G.techDef(s, K.tech).name}.` };
  if (freeArtSlots(s, pid) <= 0) return { ok: false, reason: 'Aucune place pour exposer : construisez un Théâtre, un Monument ou un Quartier des arts.' };
  if (!G.canAfford(s, pid, K.cost)) return { ok: false, reason: `Il faut ${G.fmtBundle(s, K.cost)}.` };
  return { ok: true };
}
export function commission(s, pid, kind) {
  const chk = canCommission(s, pid, kind);
  if (!chk.ok) return chk;
  const A = s.rules.artworks, K = A.kinds[kind];
  for (const [k, v] of Object.entries(K.cost)) s.players[pid].res[k] -= v;
  s.artworks = s.artworks || [];
  const used = new Set(s.artworks.map((a) => a.name));
  const pool = A.names[kind].filter((n) => !used.has(n));
  const name = pool.length ? pool[s.rng.int(pool.length)] : `${K.name} n°${s.artworks.length + 1}`;
  const art = { id: s.nextId++, owner: pid, holder: pid, kind, name, turn: s.turn };
  s.artworks.push(art);
  G.log(s, `${s.players[pid].isHuman ? 'Vous commandez' : `${nm(s, pid)} commande`} une œuvre : « ${name} » (${K.name.toLowerCase()}).`, s.players[pid].isHuman ? [pid] : null, 'good');
  return { ok: true, art };
}

export function canLend(s, artId, to) {
  const a = (s.artworks || []).find((x) => x.id === artId);
  if (!a || a.holder !== a.owner) return { ok: false, reason: 'Œuvre indisponible.' };
  if (to === a.owner) return { ok: false };
  if (freeArtSlots(s, to) <= 0) return { ok: false, reason: `${nm(s, to)} n'a pas de place pour l'exposer.` };
  if (G.getRel(s, a.owner, to) < -10) return { ok: false, reason: 'Relations trop mauvaises.' };
  return { ok: true, a };
}
export function lend(s, artId, to) {
  const chk = canLend(s, artId, to);
  if (!chk.ok) return chk;
  const A = s.rules.artworks, a = chk.a;
  a.holder = to; a.until = s.turn + A.loanTurns;
  G.remember(s, a.owner, to, `Prêt de « ${a.name} »`, A.loanRelation);
  G.log(s, `« ${a.name} » est prêtée à ${nm(s, to)} pour ${A.loanTurns} tours (+${A.loanRelation} relation, loyer ${A.loanRent} Or par tour).`, [a.owner, to], 'good');
  return { ok: true };
}

export function artTick(s) {
  const A = s.rules.artworks;
  for (const a of s.artworks || []) {
    if (a.holder === a.owner) continue;
    const borrower = s.players[a.holder];
    const rent = Math.min(A.loanRent, Math.floor(borrower.res.gold));
    borrower.res.gold -= rent; s.players[a.owner].res.gold += rent;
    if (s.turn >= a.until) { G.log(s, `« ${a.name} » revient chez ${nm(s, a.owner)} à la fin du prêt.`, [a.owner, a.holder], 'info'); a.holder = a.owner; a.until = null; }
  }
  // Une œuvre sans place (lieu détruit ou prêt chez quelqu'un qui manque de place) est mise en réserve : pas d'effet.
}

export function artYields(s, pid) {
  const A = s.rules.artworks;
  let culture = 0, tourism = 0;
  for (const a of artworksHeld(s, pid)) { culture += A.kinds[a.kind].culture; tourism += A.kinds[a.kind].tourism; }
  return { culture, tourism };
}

// IA : commande une œuvre quand elle a une place et de quoi payer, prête à un ami qui a de la place.
export function aiArt(s, pid) {
  const p = s.players[pid];
  if (freeArtSlots(s, pid) > 0 && p.res.gold > 160) {
    const kind = canCommission(s, pid, 'opera').ok ? 'opera' : canCommission(s, pid, 'sculpture').ok ? 'sculpture' : 'painting';
    if (canCommission(s, pid, kind).ok) commission(s, pid, kind);
  }
  if (s.rng.next() < 0.1) {
    const art = artworksOwned(s, pid).find((a) => a.holder === pid);
    const friend = s.players.find((q) => q.id !== pid && G.getRel(s, pid, q.id) >= 30 && freeArtSlots(s, q.id) > 0 && !q.isHuman);
    if (art && friend) lend(s, art.id, friend.id);
  }
}

// ------------------------------------------------------------ patrimoine mondial
// On fait classer une merveille naturelle, une merveille ou un monument de son territoire : la case est protégée
// (l'influence culturelle d'un voisin ne peut pas la prendre) et elle attire des visiteurs.

export const isHeritage = (s, x, y) => (s.heritage || []).some((h) => h.x === x && h.y === y);
export const heritageOf = (s, pid) => (s.heritage || []).filter((h) => h.owner === pid);

export function heritageCandidates(s, pid) {
  const H = s.rules.heritage, out = [];
  for (const n of s.naturals || []) if (G.tileAt(s, n.x, n.y).owner === pid && !isHeritage(s, n.x, n.y)) out.push({ x: n.x, y: n.y, name: naturalDef(s, n.id).name });
  for (const b of s.buildings) {
    if (b.owner !== pid || !done(b) || isHeritage(s, b.x, b.y)) continue;
    const def = G.buildingDef(s, b.type);
    if (def.wonder || H.types.includes(b.type)) out.push({ x: b.x, y: b.y, name: def.name });
  }
  return out;
}
export function canClassify(s, pid, x, y) {
  const H = s.rules.heritage, p = s.players[pid];
  if (!G.hasTech(s, pid, H.tech)) return { ok: false, reason: `Nécessite ${G.techDef(s, H.tech).name}.` };
  if (p.lastHeritage !== undefined && s.turn - p.lastHeritage < H.cooldown) return { ok: false, reason: `Prochain classement possible dans ${H.cooldown - (s.turn - p.lastHeritage)} tour(s).` };
  if (!heritageCandidates(s, pid).some((c) => c.x === x && c.y === y)) return { ok: false, reason: 'Site non éligible.' };
  if (!G.canAfford(s, pid, H.cost)) return { ok: false, reason: `Il faut ${G.fmtBundle(s, H.cost)}.` };
  return { ok: true };
}
export function classify(s, pid, x, y) {
  const chk = canClassify(s, pid, x, y);
  if (!chk.ok) return chk;
  const H = s.rules.heritage;
  const c = heritageCandidates(s, pid).find((v) => v.x === x && v.y === y);
  for (const [k, v] of Object.entries(H.cost)) s.players[pid].res[k] -= v;
  s.heritage = s.heritage || [];
  s.heritage.push({ x, y, owner: pid, name: c.name, turn: s.turn });
  s.players[pid].lastHeritage = s.turn;
  G.log(s, `${c.name} est inscrit au patrimoine mondial (${nm(s, pid)}).`, null, pid === 0 ? 'good' : 'info');
  return { ok: true };
}
export function aiHeritage(s, pid) {
  if (s.players[pid].res.gold < 170) return;
  const c = heritageCandidates(s, pid)[0];
  if (c && canClassify(s, pid, c.x, c.y).ok) classify(s, pid, c.x, c.y);
}

// ------------------------------------------------------------ tourisme
// Les visiteurs viennent pour les merveilles naturelles, les merveilles, le patrimoine, les œuvres et les théâtres,
// et un peu pour la culture du pays. Chaque point de tourisme rapporte de l'Or chaque tour ; le cumul donne du prestige.

export function tourismOf(s, pid) {
  const T = s.rules.tourism;
  if (!T) return { total: 0, parts: [] };
  const parts = [];
  const nat = (s.naturals || []).filter((n) => G.tileAt(s, n.x, n.y).owner === pid).length;
  if (nat) parts.push(['Merveilles naturelles', nat * T.natural]);
  const wonders = Object.values(s.wonders).filter((o) => o === pid).length;
  if (wonders) parts.push(['Merveilles', wonders * T.wonder]);
  const theatres = s.buildings.filter((b) => b.owner === pid && b.type === 'theatre' && done(b)).length;
  if (theatres) parts.push(['Théâtres', theatres * T.theatre]);
  const art = artYields(s, pid).tourism;
  if (art) parts.push(["Œuvres d'art", art]);
  const her = heritageOf(s, pid).length * s.rules.heritage.tourism;
  if (her) parts.push(['Patrimoine mondial', her]);
  const voc = vocationTourism(s, pid);
  if (voc) parts.push(["Villes d'art", voc]);
  const mov = movementTourism(s, pid);
  if (mov) parts.push(['Mouvements culturels', mov]);
  const cult = Math.floor((s.players[pid].lastYield?.net.culture || 0) * T.cultureShare);
  if (cult) parts.push(['Rayonnement culturel', cult]);
  return { total: parts.reduce((a, [, v]) => a + v, 0), parts };
}

export function cultureTick(s) {
  const T = s.rules.tourism;
  challengesTick(s);
  if (s.rules.artworks) artTick(s);
  if (!T) return;
  for (const p of s.players) {
    const t = tourismOf(s, p.id).total;
    p.tourismTotal = (p.tourismTotal || 0) + t;
  }
}

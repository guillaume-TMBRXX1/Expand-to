// Phase 14 — ères, gouvernements et archéologie.
// Importé par game.js : les fonctions du moteur ne sont utilisées qu'à l'exécution.
import * as G from './game.js';
import { addBonusPrestige } from './diversity.js';
import { freeArtSlots } from './culture.js';

const human = (s, pid) => s.players[pid].isHuman;
const nm = (s, pid) => s.players[pid].name;

// ------------------------------------------------------------ ères
// L'ère d'un joueur dépend du nombre de technologies découvertes. Elle change l'apparence de ses bâtiments,
// ouvre de nouveaux gouvernements, une merveille, le musée, l'archéologue puis l'agent.

export function eraOf(s, pid) {
  const E = s.rules.eras;
  if (!E) return 0;
  const n = s.players[pid].techs.length;
  let era = 0;
  E.list.forEach((e, i) => { if (n >= e.techs) era = i; });
  return era;
}
export const eraDef = (s, i) => s.rules.eras?.list[i] || null;
export const eraName = (s, pid) => eraDef(s, eraOf(s, pid))?.name || '';

export function erasTick(s) {
  const E = s.rules.eras;
  if (!E) return;
  for (const p of s.players) {
    const era = eraOf(s, p.id);
    if ((p.era ?? 0) >= era) { p.era = Math.max(p.era ?? 0, era); continue; }
    p.era = era;
    addBonusPrestige(s, p.id, 'eres', E.prestige);
    const d = E.list[era];
    G.log(s, human(s, p.id) ? `Vous entrez dans une nouvelle ère : ${d.name} ! Vos bâtiments changent d'allure (+${E.prestige} prestige).` : `${nm(s, p.id)} entre dans l'ère ${d.name.toLowerCase().replace(/^ère /, '')}.`,
      null, human(s, p.id) ? 'good' : 'info');
  }
}

// ------------------------------------------------------------ gouvernements
export const governmentDef = (s, id) => s.rules.governments?.list.find((g) => g.id === id) || null;
export const governmentOf = (s, pid) => governmentDef(s, s.players[pid].government || 'council') || s.rules.governments?.list[0] || null;

export function canSetGovernment(s, pid, id) {
  const Gv = s.rules.governments, def = governmentDef(s, id), p = s.players[pid];
  if (!def) return { ok: false, reason: 'Gouvernement inconnu.' };
  if ((p.government || 'council') === id) return { ok: false, reason: 'Déjà en place.' };
  if (eraOf(s, pid) < def.era) return { ok: false, reason: `Disponible à l'ère ${eraDef(s, def.era).name}.` };
  const wait = (p.governmentTurn ?? -Infinity) + Gv.cooldown - s.turn;
  if (wait > 0) return { ok: false, reason: `Changement possible dans ${wait} tour(s).` };
  if (!G.canAfford(s, pid, Gv.changeCost)) return { ok: false, reason: `Changer de gouvernement coûte ${G.fmtBundle(s, Gv.changeCost)}.` };
  return { ok: true };
}
export function setGovernment(s, pid, id) {
  const chk = canSetGovernment(s, pid, id);
  if (!chk.ok) return chk;
  const p = s.players[pid];
  for (const [k, v] of Object.entries(s.rules.governments.changeCost)) p.res[k] -= v;
  p.government = id; p.governmentTurn = s.turn;
  const def = governmentDef(s, id);
  G.log(s, human(s, pid) ? `Nouveau gouvernement : ${def.name} (doctrine : ${def.doctrine}).` : `${nm(s, pid)} adopte un nouveau régime : ${def.name}.`, null, human(s, pid) ? 'good' : 'info');
  return { ok: true };
}
export const governmentSlots = (s, pid) => governmentOf(s, pid)?.slots || 0;

// IA : le régime le plus utile à sa voie principale, quand il en a les moyens.
export function aiGovernment(s, pid, w) {
  const Gv = s.rules.governments;
  if (!Gv || s.players[pid].res.gold < 140) return;
  const score = (g) => {
    let v = (g.slots || 0) * 6;
    const BR = { gold: 'economy', science: 'science', culture: 'culture', wood: 'economy', stone: 'economy' };
    for (const [k, x] of Object.entries(g.effects.yieldPct || {})) v += x * 60 * (w[BR[k]] || 1);
    v += (g.effects.relationPerTurn || 0) * 20 * (w.diplomacy || 1) + (g.effects.routeCap || 0) * 4 * (w.economy || 1) - (g.effects.wonderCostPct || 0) * 30;
    return v;
  };
  const cur = governmentOf(s, pid);
  const best = Gv.list.filter((g) => canSetGovernment(s, pid, g.id).ok).sort((a, b) => score(b) - score(a))[0];
  if (best && score(best) > score(cur) + 2) setGovernment(s, pid, best.id);
}

// ------------------------------------------------------------ archéologie
// Des sites antiques sont dispersés sur la carte. Un archéologue qui en atteint un exhume un artefact,
// exposé comme une œuvre d'art (Culture et tourisme). Fouiller chez un voisin le froisse.

export function placeSites(s, rng, starts) {
  const A = s.rules.archaeology;
  if (!A) return;
  const area = s.map.width * s.map.height;
  const count = Math.round((A.per936Tiles * area) / 936);
  const placed = [];
  for (const t of rng.shuffle(s.map.tiles.filter((x) => G.terrainOf(s, x).passable && !x.luxury && !x.natural && !x.ruin))) {
    if (placed.length >= count) break;
    if (starts.some((o) => G.cheb(o.x, o.y, t.x, t.y) < A.startGap)) continue;
    if (placed.some((o) => G.cheb(o.x, o.y, t.x, t.y) < A.minSpacing)) continue;
    t.site = true; placed.push(t);
  }
}

export function canExcavate(s, u) {
  if (!u || u.type !== 'archaeologist') return { ok: false, reason: 'Seul un archéologue peut fouiller.' };
  const t = G.tileAt(s, u.x, u.y);
  if (!t.site) return { ok: false, reason: 'Aucun site antique ici.' };
  if (G.buildingAt(s, t.x, t.y) || G.cityAt(s, t.x, t.y)) return { ok: false, reason: 'Le site est recouvert.' };
  if (freeArtSlots(s, u.owner) <= 0) return { ok: false, reason: 'Aucune place pour exposer un artefact : construisez un Musée (ou un Théâtre, un Monument).' };
  return { ok: true };
}
export function excavate(s, uid) {
  const u = s.units.find((x) => x.id === uid);
  const chk = canExcavate(s, u);
  if (!chk.ok) return chk;
  const A = s.rules.archaeology, ART = s.rules.artworks, t = G.tileAt(s, u.x, u.y), pid = u.owner;
  t.site = false;
  s.artworks = s.artworks || [];
  const used = new Set(s.artworks.map((a) => a.name));
  const pool = ART.names.artifact.filter((n) => !used.has(n));
  const name = pool.length ? pool[s.rng.int(pool.length)] : `Artefact n°${s.artworks.length + 1}`;
  const art = { id: s.nextId++, owner: pid, holder: pid, kind: 'artifact', name, turn: s.turn };
  s.artworks.push(art);
  addBonusPrestige(s, pid, 'archeologie', A.prestige);
  s.units = s.units.filter((x) => x !== u);
  let foreign = '';
  if (t.owner !== -1 && t.owner !== pid && !G.isAllied(s, pid, t.owner)) {
    G.remember(s, pid, t.owner, 'a fouillé un site sur nos terres', A.foreignRelation);
    foreign = ` ${nm(s, t.owner)} n'apprécie pas qu'on fouille sur ses terres.`;
  }
  G.log(s, `${human(s, pid) ? 'Vos archéologues exhument' : `${nm(s, pid)} exhume`} « ${name} » (+${A.prestige} prestige).${foreign}`, human(s, pid) ? null : [pid, t.owner].filter((x) => x >= 0), human(s, pid) ? 'good' : 'info');
  return { ok: true, art };
}

// IA : un archéologue quand un site est connu et qu'une place d'exposition est libre ; il fouille à l'arrivée.
export function aiArchaeologist(s, pid, u) {
  const p = s.players[pid];
  if (canExcavate(s, u).ok) { excavate(s, u.id); return true; }
  if (!u.target) {
    const sites = s.map.tiles.filter((t) => t.site && p.explored[G.idx(s, t.x, t.y)] && !G.buildingAt(s, t.x, t.y) && (t.owner === -1 || t.owner === pid || G.isAllied(s, pid, t.owner)))
      .sort((a, b) => G.cheb(a.x, a.y, u.x, u.y) - G.cheb(b.x, b.y, u.x, u.y));
    for (const t of sites.slice(0, 4)) if (G.findPath(s, u, t.x, t.y)) { u.target = { x: t.x, y: t.y }; break; }
  }
  G.advanceUnit(s, u);
  if (canExcavate(s, u).ok) excavate(s, u.id);
  return true;
}
export function aiWantsArchaeologist(s, pid) {
  const p = s.players[pid];
  return freeArtSlots(s, pid) > 0 && s.map.tiles.some((t) => t.site && p.explored[G.idx(s, t.x, t.y)] && (t.owner === -1 || t.owner === pid));
}

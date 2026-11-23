// Phase 10 — diplomatie et grands rendez-vous : traités à clauses, Expositions universelles et Jeux, normes communes.
// Importé par game.js : les fonctions du moteur ne sont utilisées qu'à l'exécution.
import * as G from './game.js';
import { addBonusPrestige } from './diversity.js';

const pair = (t, a, b) => (t.a === a && t.b === b) || (t.a === b && t.b === a);
const nm = (s, pid) => s.players[pid].name;

// ------------------------------------------------------------ traités à clauses
// Un traité lie deux joueurs pour une durée limitée, avec les clauses choisies. On le renégocie à l'échéance.
// Le rompre avant la fin (ou violer « Frontières respectées ») coûte cher en relation.

export const treatiesOf = (s, pid) => (s.treaties || []).filter((t) => t.a === pid || t.b === pid);
export const treatyBetween = (s, a, b) => (s.treaties || []).find((t) => pair(t, a, b)) || null;
export const hasClause = (s, a, b, clause) => !!treatyBetween(s, a, b)?.clauses.includes(clause);

export function evaluateTreaty(s, from, to, clauses) {
  const T = s.rules.treaties;
  if (!clauses.length) return { accept: false, reason: 'Choisissez au moins une clause.' };
  if (treatyBetween(s, from, to)) return { accept: false, reason: 'Un traité est déjà en vigueur.' };
  const min = T.baseRelation + T.perClause * clauses.length + (G.personalityOf(s, to)?.name === 'Isolationniste' ? 10 : 0);
  const rel = G.getRel(s, from, to);
  if (rel < min) return { accept: false, reason: `Relation insuffisante (min. ${min} pour ${clauses.length} clause${clauses.length > 1 ? 's' : ''}).` };
  // Une IA qui manque de place refuse de s'interdire de fonder des villes près de vous.
  if (clauses.includes('noSettle') && !s.players[to].isHuman && G.citiesOf(s, to).length < 3) return { accept: false, reason: `${nm(s, to)} veut encore s'étendre : pas de clause « Frontières respectées ».` };
  return { accept: true };
}

export function proposeTreaty(s, from, to, clauses, duration) {
  const T = s.rules.treaties;
  duration = T.durations.includes(duration) ? duration : T.durations[0];
  if (s.players[to].isHuman) {
    if (s.proposals.some((p) => p.to === to && p.kind === 'treaty')) return { ok: false };
    s.proposals.push({ id: s.nextId++, from, to, kind: 'treaty', payload: { clauses, duration }, turn: s.turn });
    return { ok: true, pending: true };
  }
  const ev = evaluateTreaty(s, from, to, clauses);
  if (!ev.accept) return { ok: false, reason: ev.reason };
  signTreaty(s, from, to, clauses, duration);
  return { ok: true };
}

export function signTreaty(s, a, b, clauses, duration) {
  s.treaties = s.treaties || [];
  s.treaties.push({ id: s.nextId++, a, b, clauses: [...clauses], start: s.turn, until: s.turn + duration });
  const names = clauses.map((c) => s.rules.treaties.clauses[c].name).join(', ');
  G.log(s, `Traité signé entre ${nm(s, a)} et ${nm(s, b)} pour ${duration} tours (${names}).`, [a, b], 'good');
}

export function breakTreaty(s, pid, other, reason = 'Traité rompu') {
  const t = treatyBetween(s, pid, other);
  if (!t) return { ok: false };
  s.treaties = s.treaties.filter((x) => x !== t);
  G.remember(s, pid, other, reason, s.rules.treaties.breakPenalty);
  G.log(s, `${s.players[pid].isHuman ? 'Vous rompez' : `${nm(s, pid)} rompt`} le traité avec ${nm(s, other)} (${s.rules.treaties.breakPenalty} relation).`, null, 'bad');
  return { ok: true };
}

// Appelée par foundCity : une ville fondée près d'un signataire de « Frontières respectées » rompt le traité.
export function onCityFounded(s, city) {
  for (const t of treatiesOf(s, city.owner)) {
    if (!t.clauses.includes('noSettle')) continue;
    const other = t.a === city.owner ? t.b : t.a;
    if (G.citiesOf(s, other).some((c) => G.cheb(c.x, c.y, city.x, city.y) < s.rules.borderDistance - 1)) breakTreaty(s, city.owner, other, 'Ville fondée malgré « Frontières respectées »');
  }
}

export const techShareDiscount = (s, pid, techId) => {
  const D = s.rules.treaties?.clauses.techShare.discount || 0;
  return treatiesOf(s, pid).some((t) => t.clauses.includes('techShare') && s.players[t.a === pid ? t.b : t.a].techs.includes(techId)) ? D : 0;
};
export const treatyRouteGold = (s, a, b) => (hasClause(s, a, b, 'tariffs') ? s.rules.treaties.clauses.tariffs.routeGold : 0);
export const treatyCulture = (s, pid) => treatiesOf(s, pid).filter((t) => t.clauses.includes('cultural')).length * s.rules.treaties.clauses.cultural.culture;

export function treatiesTick(s) {
  for (const t of [...(s.treaties || [])]) {
    if (s.turn < t.until) continue;
    s.treaties = s.treaties.filter((x) => x !== t);
    G.log(s, `Le traité entre ${nm(s, t.a)} et ${nm(s, t.b)} arrive à échéance. Il peut être renégocié.`, [t.a, t.b], 'info');
    // Deux IA en bons termes le renouvellent ; une IA propose au joueur de le renouveler.
    const [a, b] = s.players[t.a].isHuman ? [t.b, t.a] : [t.a, t.b];
    if (!s.players[a].isHuman && evaluateTreaty(s, a, b, t.clauses).accept) proposeTreaty(s, a, b, t.clauses, s.rules.treaties.durations[0]);
  }
}

// IA : propose de temps en temps un traité à un voisin avec qui elle s'entend.
export function aiTreaties(s, pid) {
  if (s.rng.next() > 0.18) return;
  const T = s.rules.treaties;
  const cands = s.players.filter((q) => q.id !== pid && !treatyBetween(s, pid, q.id) && G.getRel(s, pid, q.id) >= T.baseRelation + T.perClause * 2);
  if (!cands.length) return;
  const q = cands[s.rng.int(cands.length)];
  const prof = s.players[pid].profile;
  const pool = ['techShare', 'tariffs', 'cultural', 'noSettle'];
  const clauses = [prof === 'scholar' ? 'techShare' : prof === 'merchant' ? 'tariffs' : prof === 'builder' || prof === 'explorer' ? 'cultural' : 'noSettle'];
  const extra = pool.filter((c) => !clauses.includes(c))[s.rng.int(3)];
  if (G.getRel(s, pid, q.id) >= T.baseRelation + T.perClause * 3) clauses.push(extra);
  const ok = q.isHuman ? true : evaluateTreaty(s, pid, q.id, clauses).accept;
  if (ok) proposeTreaty(s, pid, q.id, clauses, T.durations[s.rng.int(T.durations.length)]);
}

// ------------------------------------------------------------ Expositions universelles et Jeux
// Tous les 15 tours environ. Deux tours avant, les candidatures s'ouvrent (caution remboursée aux perdants)
// et chacun choisit sa participation. Le jour J, un vote désigne l'hôte, puis le concours est jugé.

export const expoDef = (s) => (s.expo ? s.rules.expos.list.find((e) => e.id === s.expo.id) : null);

export function exposTick(s) {
  const X = s.rules.expos;
  if (!X) return;
  if (s.expoNext === undefined) s.expoNext = X.first;
  if (s.expo && s.turn >= s.expo.turn) resolveExpo(s);
  if (!s.expo && s.turn === s.expoNext - X.bidLead && s.expoNext <= s.rules.turnLimit) {
    const def = X.list[(s.expoCount || 0) % X.list.length];
    s.expo = { id: def.id, turn: s.expoNext, bids: [], entries: {}, status: 'open' };
    for (const p of s.players) if (!p.isHuman) aiExpo(s, p.id);
    G.log(s, `${def.name} au tour ${s.expoNext} : candidatures ouvertes pour l'accueillir (caution ${G.fmtBundle(s, X.bidCost)}) et inscriptions au concours.`, null, 'warn');
  }
}

export function bidExpo(s, pid) {
  const X = s.rules.expos, e = s.expo;
  if (!e || e.status !== 'open') return { ok: false, reason: 'Aucune candidature ouverte.' };
  if (e.bids.includes(pid)) return { ok: false, reason: 'Déjà candidat.' };
  if (!G.canAfford(s, pid, X.bidCost)) return { ok: false, reason: `Il faut ${G.fmtBundle(s, X.bidCost)}.` };
  for (const [k, v] of Object.entries(X.bidCost)) s.players[pid].res[k] -= v;
  e.bids.push(pid);
  return { ok: true };
}
export function enterExpo(s, pid, level) {
  const e = s.expo, lv = s.rules.expos.levels.find((l) => l.id === level);
  if (!e || e.status !== 'open' || !lv) return { ok: false };
  if (s.players[pid].res.gold < lv.gold) return { ok: false, reason: `Il faut ${lv.gold} Or.` };
  e.entries[pid] = level;
  return { ok: true };
}

function aiExpo(s, pid) {
  const p = s.players[pid], X = s.rules.expos;
  if (p.res.gold > 160 && (['builder', 'explorer', 'merchant'].includes(p.profile) || s.rng.next() < 0.35)) bidExpo(s, pid);
  enterExpo(s, pid, p.res.gold > 220 ? 'pavilion' : p.res.gold > 90 ? 'stand' : 'none');
}

export function expoScore(s, pid) {
  const e = s.expo, p = s.players[pid];
  const y = p.lastYield?.net || {};
  const pop = G.citiesOf(s, pid).reduce((a, c) => a + c.pop, 0);
  const base = e.id === 'games'
    ? pop * 2 + (y.culture || 0)
    : (y.planks || 0) * 2 + (y.tools || 0) * 3 + (y.goods || 0) * 3 + G.activeLuxuries(s, pid).length * 5 + (y.science || 0) * 0.5;
  const lv = s.rules.expos.levels.find((l) => l.id === (e.entries[pid] || 'none'));
  return Math.round(base + (p.res.gold >= lv.gold ? lv.score : 0));
}

function resolveExpo(s) {
  const X = s.rules.expos, e = s.expo, def = expoDef(s);
  // Vote pour l'hôte : chacun soutient le candidat qu'il apprécie le plus (lui-même s'il est candidat).
  let host = null;
  if (e.bids.length) {
    const score = {};
    for (const p of s.players) {
      const choice = e.bids.includes(p.id) ? p.id : [...e.bids].sort((a, b) => G.getRel(s, p.id, b) - G.getRel(s, p.id, a))[0];
      score[choice] = (score[choice] || 0) + G.voteWeight(s, p.id);
    }
    host = Number(Object.entries(score).sort((a, b) => b[1] - a[1])[0][0]);
    for (const pid of e.bids) if (pid !== host) for (const [k, v] of Object.entries(X.bidCost)) s.players[pid].res[k] += v; // cautions remboursées
    addBonusPrestige(s, host, 'evenements', X.hostPrestige);
    s.players[host].cultureTotal += X.hostCulture;
  }
  // Concours : on paie sa participation, puis on classe.
  const entrants = s.players.filter((p) => G.citiesOf(s, p.id).length);
  for (const p of entrants) { const lv = X.levels.find((l) => l.id === (e.entries[p.id] || 'none')); if (lv.gold && p.res.gold >= lv.gold) p.res.gold -= lv.gold; }
  const ranking = entrants.map((p) => ({ pid: p.id, score: expoScore(s, p.id) })).sort((a, b) => b.score - a.score);
  ranking.slice(0, X.winPrestige.length).forEach((r, k) => addBonusPrestige(s, r.pid, 'evenements', X.winPrestige[k]));
  if (host !== null) for (const r of ranking) if (r.pid !== host && e.entries[r.pid] && e.entries[r.pid] !== 'none') G.addRel(s, r.pid, host, X.hostRelation);
  e.status = 'closed'; e.host = host; e.ranking = ranking;
  s.expoLast = e; s.expo = null;
  s.expoCount = (s.expoCount || 0) + 1;
  s.expoNext = s.turn + X.every;
  G.log(s, `${def.name} : ${host !== null ? `organisée par ${nm(s, host)} (+${X.hostPrestige} prestige)` : 'aucun pays candidat'}. Concours : 1er ${nm(s, ranking[0].pid)} (+${X.winPrestige[0]} prestige), 2e ${nm(s, ranking[1]?.pid ?? ranking[0].pid)} (+${X.winPrestige[1]}).`, null, host === 0 || ranking[0].pid === 0 ? 'good' : 'info');
}

// ------------------------------------------------------------ normes communes
// À chaque Congrès, une norme internationale est proposée en plus de la résolution. Chaque pays décide d'y adhérer ;
// avec au moins deux signataires, elle entre en vigueur pour eux. Les absents pourront adhérer à un prochain Congrès.

export const standardsOf = (s, pid) => (s.standards || []).filter((st) => st.members.includes(pid)).map((st) => s.rules.standards.find((d) => d.id === st.id));
export const sharedStandard = (s, a, b, key) => (s.standards || []).filter((st) => st.members.includes(a) && st.members.includes(b))
  .reduce((acc, st) => acc + (s.rules.standards.find((d) => d.id === st.id)[key] || 0), 0);

// Norme mise au vote : la première qui n'est pas encore en vigueur, sinon une norme existante (adhésions tardives).
export function nextStandard(s) {
  const all = s.rules.standards || [];
  const adopted = new Set((s.standards || []).map((st) => st.id));
  return all.find((d) => !adopted.has(d.id)) || all[(s.congressCount || 0) % Math.max(1, all.length)] || null;
}
export function aiJoinsStandard(s, pid) {
  const pers = s.players[pid].personality;
  if (pers === 'isolationist') return s.rng.next() < 0.3;
  return true;
}
export function resolveStandard(s, c) {
  if (!c.standard) return;
  const def = s.rules.standards.find((d) => d.id === c.standard);
  const joiners = s.players.filter((p) => c.standardVotes?.[p.id]).map((p) => p.id);
  s.standards = s.standards || [];
  let st = s.standards.find((x) => x.id === def.id);
  if (!st && joiners.length >= 2) { st = { id: def.id, members: [], turn: s.turn }; s.standards.push(st); }
  if (st) {
    const fresh = joiners.filter((pid) => !st.members.includes(pid));
    st.members.push(...fresh);
    if (fresh.length) G.log(s, `Norme « ${def.name} » : ${fresh.map((pid) => nm(s, pid)).join(', ')} ${fresh.length > 1 ? 'adhèrent' : 'adhère'} (${def.desc})`, null, fresh.includes(0) ? 'good' : 'info');
  } else {
    G.log(s, `Norme « ${def.name} » : pas assez de signataires (il en faut 2).`, null, 'info');
  }
}

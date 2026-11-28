// Appel d'offres groupé : le joueur annonce « je donne X contre Y » à tous les autres pays en une fois.
// Chaque IA répond tout de suite : elle accepte telle quelle, fait une contre-offre (négociation), ou refuse
// en disant pourquoi. Le joueur conclut avec celle qu'il préfère.
//
// Garde-fous, pour ne pas court-circuiter les chaînes de production :
//  - une IA ne cède que son surplus (elle garde de quoi construire et activer ses ressources rares) ;
//  - le prix dépend de la relation (les bons voisins font de meilleurs prix) et de la personnalité ;
//  - les pays hostiles ne répondent pas, et on n'aide pas un favori proche de la victoire sans être bons amis ;
//  - un seul appel d'offres conclu par tour (les échanges directs restent possibles à côté).
import * as G from './game.js';
import { aiParams } from './ai.js';

const unit = (s, k, receiver = null) => G.tradeValue(s, { [k]: 1 }, receiver);

// Quantité qu'une IA peut céder sans se priver.
export function spare(s, pid, k) {
  const have = Math.floor(s.players[pid].res[k] || 0);
  const keep = k === 'gold' ? Math.max(30, aiParams(s, pid).build?.goldReserve || 0)
    : G.LUXURIES.includes(k) ? 2
      : G.GOODS.includes(k) ? 10
        : 25;
  return Math.max(0, have - keep);
}

export const tenderUsed = (s, pid) => s.players[pid].tenderTurn === s.turn;

export function canTender(s, pid, give, want) {
  const [gk, gv] = Object.entries(give)[0] || [];
  const [wk, wv] = Object.entries(want)[0] || [];
  if (!gk || !wk || !(gv > 0) || !(wv > 0)) return { ok: false, reason: 'Indiquez une quantité à donner et une quantité demandée.' };
  if (gk === wk) return { ok: false, reason: 'Choisissez deux ressources différentes.' };
  if (tenderUsed(s, pid)) return { ok: false, reason: 'Un seul appel d\'offres conclu par tour : revenez au tour suivant (les échanges directs restent possibles).' };
  if (!G.canAfford(s, pid, give)) return { ok: false, reason: `Vous n'avez pas ${G.fmtBundle(s, give)}.` };
  return { ok: true };
}

// Réponses de tous les autres pays. Lecture seule : ne modifie pas la partie.
export function tenderQuotes(s, pid, give, want) {
  const [gk, gv] = Object.entries(give)[0];
  const [wk, wv] = Object.entries(want)[0];
  const leader = Object.values(G.victoryProgress(s, pid)).filter((v) => v.label !== 'Diplomatie').some((v) => v.pct >= 0.8);
  const quotes = [];
  for (const q of s.players) {
    if (q.id === pid || !G.citiesOf(s, q.id).length) continue;
    const rel = G.getRel(s, pid, q.id);
    const base = { to: q.id, rel: Math.round(rel) };
    if (rel <= s.rules.malus.hostileBelow) { quotes.push({ ...base, status: 'refuse', reason: 'Relations hostiles : aucune réponse.' }); continue; }
    if (leader && rel < 30 && !G.isAllied(s, pid, q.id)) { quotes.push({ ...base, status: 'refuse', reason: 'Ne veut pas aider le favori de la course à la victoire.' }); continue; }
    const avail = spare(s, q.id, wk);
    if (avail < 1) { quotes.push({ ...base, status: 'refuse', reason: `Pas de ${s.data.resources[wk].name} à céder (il garde son stock pour lui).` }); continue; }
    const factor = 1 + rel / 200;
    const greed = G.personalityOf(s, q.id)?.tradeGreed ?? 1.05;
    const offered = G.tradeValue(s, give, q.id) * factor;
    const asked = (n) => n * unit(s, wk) * greed;
    // Telle quelle : il a le stock et l'offre lui convient.
    if (avail >= wv && offered >= asked(wv)) { quotes.push({ ...base, status: 'accept', payload: { give: { ...give }, want: { ...want } } }); continue; }
    // Contre-offre 1 : il vous donne tout ce que vous voulez si vous mettez un peu plus (si vous en avez les moyens).
    if (avail >= wv) {
      const need = Math.ceil((asked(wv) / factor) / unit(s, gk, q.id));
      if (need > gv && need <= gv * 2.5 && G.canAfford(s, pid, { [gk]: need })) {
        quotes.push({ ...base, status: 'counter', payload: { give: { [gk]: need }, want: { ...want } }, reason: `Il demande ${need} ${s.data.resources[gk].name} au lieu de ${gv}.` });
        continue;
      }
    }
    // Stock limité : il cède tout son surplus et ne vous demande que le juste prix de cette quantité.
    if (avail < wv) {
      const need = Math.max(1, Math.ceil((asked(avail) / factor) / unit(s, gk, q.id)));
      if (need <= gv && avail >= Math.max(1, Math.ceil(wv * 0.4))) {
        quotes.push({ ...base, status: 'counter', payload: { give: { [gk]: need }, want: { [wk]: avail } }, reason: `Il n'a que ${avail} ${s.data.resources[wk].name} à céder : il vous les laisse pour ${need} ${s.data.resources[gk].name}.` });
        continue;
      }
    }
    // Contre-offre 2 : pour ce que vous proposez, il donne moins (prix ou stock limité).
    const n = Math.min(avail, Math.floor(offered / (unit(s, wk) * greed)));
    if (n >= Math.max(1, Math.ceil(wv * 0.4))) {
      quotes.push({ ...base, status: 'counter', payload: { give: { ...give }, want: { [wk]: n } }, reason: avail < wv && n === avail ? `Il n'a que ${avail} ${s.data.resources[wk].name} à céder.` : `Pour ${gv} ${s.data.resources[gk].name}, il ne donne que ${n} ${s.data.resources[wk].name}.` });
      continue;
    }
    quotes.push({ ...base, status: 'refuse', reason: 'L\'offre est trop éloignée de ce qu\'il en attend.' });
  }
  const rank = { accept: 0, counter: 1, refuse: 2 };
  // Meilleure offre d'abord : à quantité égale, celle qui vous coûte le moins.
  const ratio = (x) => (x.payload ? Object.values(x.payload.want)[0] / Object.values(x.payload.give)[0] : 0);
  return quotes.sort((a, b) => rank[a.status] - rank[b.status] || ratio(b) - ratio(a));
}

// Conclut avec une réponse (acceptée ou contre-offre). Revérifie tout au moment de signer.
export function concludeTender(s, pid, quote) {
  if (!quote?.payload || quote.status === 'refuse') return { ok: false, reason: 'Cette offre n\'est pas disponible.' };
  if (tenderUsed(s, pid)) return { ok: false, reason: 'Un seul appel d\'offres conclu par tour.' };
  const { give, want } = quote.payload;
  const [wk, wv] = Object.entries(want)[0];
  if (!G.canAfford(s, pid, give)) return { ok: false, reason: `Vous n'avez plus ${G.fmtBundle(s, give)}.` };
  if (spare(s, quote.to, wk) < wv) return { ok: false, reason: `${s.players[quote.to].name} n'a plus assez de ${s.data.resources[wk].name}.` };
  G.applyDeal(s, pid, quote.to, 'exchange', { give, want });
  s.players[pid].tenderTurn = s.turn;
  return { ok: true };
}

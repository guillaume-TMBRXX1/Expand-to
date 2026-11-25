// Phase 14 — comptoirs indépendants et espionnage industriel.
// Importé par game.js : les fonctions du moteur ne sont utilisées qu'à l'exécution.
import * as G from './game.js';

const human = (s, pid) => s.players[pid].isHuman;
const nm = (s, pid) => s.players[pid].name;

// ------------------------------------------------------------ comptoirs indépendants
// Des comptoirs et campements neutres, qu'on ne conquiert pas : on les courtise par le commerce (caravanes),
// les émissaires, les cadeaux et le rayonnement culturel. Le joueur qui a le plus de faveur (au-delà d'un seuil)
// devient leur protecteur et reçoit leur bonus, et du prestige.

export const postAt = (s, x, y) => (s.posts || []).find((p) => p.x === x && p.y === y) || null;
export const postKind = (s, post) => s.rules.independents.kinds[post.kind];

export function placePosts(s, rng, starts) {
  const I = s.rules.independents;
  s.posts = [];
  if (!I) return;
  const count = Math.max(2, Math.round(I.perPlayer * starts.length));
  const kinds = Object.keys(I.kinds);
  const usedNames = new Set();
  const cands = rng.shuffle(s.map.tiles.filter((t) => G.terrainOf(s, t).passable && !t.luxury && !t.natural && !t.ruin && !t.site && t.type !== 'forest'));
  for (const t of cands) {
    if (s.posts.length >= count) break;
    if (starts.some((o) => G.cheb(o.x, o.y, t.x, t.y) < I.startGap)) continue;
    if (s.posts.some((o) => G.cheb(o.x, o.y, t.x, t.y) < I.minSpacing)) continue;
    const kind = kinds[s.posts.length % kinds.length];
    const names = I.names[kind].filter((n) => !usedNames.has(n));
    const name = names.length ? names[rng.int(names.length)] : `${I.kinds[kind].name} ${s.posts.length + 1}`;
    usedNames.add(name);
    t.post = true;
    s.posts.push({ id: s.posts.length + 1, kind, name, x: t.x, y: t.y, favor: {}, patron: null });
  }
}

export const patronOf = (s, post) => post.patron;
export const postsOf = (s, pid) => (s.posts || []).filter((p) => p.patron === pid);
export const favorOf = (post, pid) => post.favor[pid] || 0;

export function addFavor(s, post, pid, v) {
  post.favor[pid] = Math.max(0, (post.favor[pid] || 0) + v);
}

export function canGift(s, pid, postId) {
  const post = (s.posts || []).find((p) => p.id === postId);
  if (!post) return { ok: false, reason: 'Comptoir introuvable.' };
  if (!s.players[pid].explored[G.idx(s, post.x, post.y)]) return { ok: false, reason: 'Comptoir inconnu.' };
  if (!G.canAfford(s, pid, s.rules.independents.gift.cost)) return { ok: false, reason: `Il faut ${G.fmtBundle(s, s.rules.independents.gift.cost)}.` };
  return { ok: true };
}
export function giftPost(s, pid, postId) {
  const chk = canGift(s, pid, postId);
  if (!chk.ok) return chk;
  const I = s.rules.independents, post = s.posts.find((p) => p.id === postId);
  for (const [k, v] of Object.entries(I.gift.cost)) s.players[pid].res[k] -= v;
  addFavor(s, post, pid, I.gift.favor);
  updatePatron(s, post);
  return { ok: true };
}

// Caravane ou émissaire arrivé au comptoir.
export function visitPost(s, u, post) {
  const I = s.rules.independents;
  if (u.type === 'caravan') {
    addFavor(s, post, u.owner, I.caravanFavor);
    s.players[u.owner].res.gold += I.caravanGold;
  } else if (u.type === 'emissary') addFavor(s, post, u.owner, I.emissaryFavor);
  else return false;
  s.units = s.units.filter((x) => x !== u);
  G.log(s, `${human(s, u.owner) ? 'Votre' : `${nm(s, u.owner)} :`} ${G.unitDef(s, u.type).name.toLowerCase()} est reçu${u.type === 'caravan' ? 'e' : ''} à ${post.name} (+${u.type === 'caravan' ? I.caravanFavor : I.emissaryFavor} faveur).`, [u.owner], 'good');
  updatePatron(s, post);
  return true;
}

function updatePatron(s, post) {
  const I = s.rules.independents;
  const ranked = s.players.map((p) => [p.id, favorOf(post, p.id)]).sort((a, b) => b[1] - a[1]);
  const [top, val] = ranked[0];
  const cur = post.patron;
  let next = cur;
  if (cur !== null && favorOf(post, cur) < I.patronMin) next = null;
  if (val >= I.patronMin && (next === null || val > favorOf(post, next))) next = top;
  if (next === cur) return;
  post.patron = next;
  if (next !== null) G.log(s, `${post.name} (${postKind(s, post).name.toLowerCase()}) se place sous la protection de ${human(s, next) ? 'votre pays' : nm(s, next)}.`, null, next === 0 ? 'good' : cur === 0 ? 'bad' : 'info');
  else if (cur !== null) G.log(s, `${post.name} reprend son indépendance.`, [cur], cur === 0 ? 'bad' : 'info');
}

export function postsTick(s) {
  const I = s.rules.independents;
  if (!I || !s.posts) return;
  for (const post of s.posts) {
    for (const p of s.players) {
      let v = -I.decay;
      // Rayonnement culturel : une ville assez proche fait connaître sa culture.
      if (G.citiesOf(s, p.id).some((c) => G.cheb(c.x, c.y, post.x, post.y) <= I.cultureRange)) v += Math.max(0, p.lastYield?.net.culture || 0) * I.cultureShare;
      if (favorOf(post, p.id) > 0 || v > 0) addFavor(s, post, p.id, v);
    }
    updatePatron(s, post);
  }
}

export function postYields(s, pid) {
  const out = {};
  for (const post of postsOf(s, pid)) for (const [k, v] of Object.entries(postKind(s, post).yields || {})) out[k] = (out[k] || 0) + v;
  return out;
}
export const postMoveBonus = (s, pid) => postsOf(s, pid).reduce((a, post) => a + (postKind(s, post).moveBonus || 0), 0);

// IA : un cadeau au comptoir le plus proche de basculer (ou à garder), quand l'Or abonde.
export function aiPosts(s, pid) {
  const I = s.rules.independents;
  if (!I || !s.posts) return;
  const p = s.players[pid];
  if (p.res.gold < 150) return;
  const known = s.posts.filter((post) => p.explored[G.idx(s, post.x, post.y)]);
  const best = known.map((post) => {
    const rival = Math.max(0, ...s.players.filter((q) => q.id !== pid).map((q) => favorOf(post, q.id)));
    const mine = favorOf(post, pid), need = Math.max(I.patronMin, rival + 1) - mine;
    return { post, need, keep: post.patron === pid && mine - rival < 8 };
  }).filter((x) => x.keep || (x.need > 0 && x.need <= 3 * I.gift.favor)).sort((a, b) => a.need - b.need)[0];
  if (best) giftPost(s, pid, best.post.id);
}
// IA : la caravane sans route possible va porter ses marchandises à un comptoir.
export function aiCaravanPost(s, pid, u) {
  if (!s.posts?.length) return false;
  const p = s.players[pid];
  const post = s.posts.filter((x) => p.explored[G.idx(s, x.x, x.y)]).sort((a, b) => G.cheb(a.x, a.y, u.x, u.y) - G.cheb(b.x, b.y, u.x, u.y))[0];
  if (!post || !G.findPath(s, u, post.x, post.y)) return false;
  u.target = { x: post.x, y: post.y };
  return true;
}

// ------------------------------------------------------------ espionnage industriel
// Un agent entré dans une ville étrangère copie une technologie ou retarde un chantier. Chaque mission risque
// d'être découverte : incident diplomatique (relation) et, une fois sur deux, échec de la mission.

export function spyTargets(s, u) {
  const c = G.cityAt(s, u.x, u.y);
  if (!u || u.type !== 'agent' || !c || c.owner === u.owner) return null;
  const me = s.players[u.owner], them = s.players[c.owner];
  const avail = new Set(G.availableTechs(s, u.owner).map((t) => t.id));
  const techs = them.techs.filter((t) => !me.techs.includes(t) && avail.has(t));
  const sites = s.buildings.filter((b) => b.owner === c.owner && b.turnsLeft > 0);
  return { city: c, techs, sites };
}
export function detectChance(s, u, city) {
  const E = s.rules.espionage;
  const chancery = s.buildings.some((b) => b.owner === city.owner && b.type === 'chancery' && !b.turnsLeft);
  return Math.min(0.9, E.detect + (chancery ? E.chanceryDetect : 0));
}
export function spyMission(s, uid, mission) {
  const u = s.units.find((x) => x.id === uid);
  const tg = u && spyTargets(s, u);
  if (!tg) return { ok: false, reason: 'L\'agent doit être dans une ville étrangère.' };
  if (mission === 'tech' && !tg.techs.length) return { ok: false, reason: 'Rien à copier : cette ville ne connaît aucune technologie qui vous soit accessible.' };
  if (mission === 'delay' && !tg.sites.length) return { ok: false, reason: 'Aucun chantier en cours chez ce joueur.' };
  const E = s.rules.espionage, pid = u.owner, victim = tg.city.owner;
  s.units = s.units.filter((x) => x !== u);
  const detected = s.rng.next() < detectChance(s, u, tg.city);
  const caught = detected && s.rng.next() < E.caughtShare;
  let what = '';
  if (!caught) {
    if (mission === 'tech') {
      const id = tg.techs.sort((a, b) => G.techDef(s, a).tier - G.techDef(s, b).tier)[0];
      s.players[pid].techs.push(id);
      if (s.players[pid].research === id) s.players[pid].research = null;
      what = `technologie copiée : ${G.techDef(s, id).name}`;
    } else {
      const b = tg.sites.sort((a, b2) => (G.buildingDef(s, b2.type).wonder ? 1 : 0) - (G.buildingDef(s, a.type).wonder ? 1 : 0))[0];
      b.turnsLeft += E.delayTurns;
      what = `chantier retardé : ${G.buildingDef(s, b.type).name} (+${E.delayTurns} tours)`;
    }
  }
  if (detected) G.remember(s, pid, victim, mission === 'tech' ? 'a volé nos secrets industriels' : 'a saboté un de nos chantiers', E.incident);
  const tellMe = caught ? `Votre agent a été arrêté à ${tg.city.name} : mission échouée, incident diplomatique avec ${nm(s, victim)}.`
    : `Mission réussie à ${tg.city.name} : ${what}.${detected ? ` Mais l'agent a été repéré : incident diplomatique avec ${nm(s, victim)}.` : ''}`;
  if (human(s, pid)) G.log(s, tellMe, [pid], caught ? 'bad' : detected ? 'warn' : 'good');
  if (human(s, victim) && detected) G.log(s, `Un agent de ${nm(s, pid)} a été ${caught ? 'arrêté' : 'repéré'} à ${tg.city.name}${caught ? '' : ` (${what})`}.`, [victim], 'bad');
  return { ok: true, caught, detected, what, text: tellMe };
}

// IA : un agent de temps en temps (opportunistes surtout), vers le voisin le plus avancé et pas trop ami.
export function aiWantsAgent(s, pid) {
  const pers = s.players[pid].personality, me = s.players[pid];
  if (s.units.some((u) => u.owner === pid && u.type === 'agent')) return false;
  if (pers === 'loyal' || (pers !== 'opportunist' && s.rng.next() > 0.3)) return false;
  return s.players.some((q) => q.id !== pid && G.getRel(s, pid, q.id) < 45 && !G.isAllied(s, pid, q.id) && q.techs.some((t) => !me.techs.includes(t)));
}
export function aiAgent(s, pid, u) {
  const tg = spyTargets(s, u);
  if (tg) { const r = spyMission(s, u.id, tg.techs.length ? 'tech' : 'delay'); if (!r.ok) u.target = null; return; }
  if (!u.target) {
    const me = s.players[pid];
    const targets = s.cities.filter((c) => c.owner !== pid && !G.isAllied(s, pid, c.owner) && G.getRel(s, pid, c.owner) < 45 && s.players[c.owner].techs.some((t) => !me.techs.includes(t)))
      .sort((a, b) => G.cheb(a.x, a.y, u.x, u.y) - G.cheb(b.x, b.y, u.x, u.y));
    for (const c of targets.slice(0, 4)) if (G.findPath(s, u, c.x, c.y)) { u.target = { x: c.x, y: c.y }; break; }
  }
  G.advanceUnit(s, u);
  const t2 = s.units.includes(u) && spyTargets(s, u);
  if (t2) spyMission(s, u.id, t2.techs.length ? 'tech' : 'delay');
}

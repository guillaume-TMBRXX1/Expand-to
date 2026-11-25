// Phase 13 — grands personnages et ambitions secrètes.
// Importé par game.js : les fonctions du moteur ne sont utilisées qu'à l'exécution.
import * as G from './game.js';
import { addBonusPrestige } from './diversity.js';
import { freeArtSlots } from './culture.js';
import { vocationsOf } from './land.js';
import { cityPollution } from './society.js';

const nm = (s, pid) => s.players[pid].name;
const human = (s, pid) => s.players[pid].isHuman;

// ------------------------------------------------------------ grands personnages
// Chaque tour, les rendements alimentent quatre jauges (Savant, Artiste, Marchand, Ingénieur).
// Une jauge pleine fait venir un grand personnage, que l'on emploie quand on veut : effet unique et immédiat.

export function gpThreshold(s, pid, kind) {
  const GP = s.rules.greatPeople;
  const n = (s.players[pid].gpCount || {})[kind] || 0;
  return Math.round(GP.base * (1 + GP.growth * n) * Math.sqrt(s.rules.techCostScale || 1));
}
export const gpRecruited = (s, pid) => Object.values(s.players[pid].gpCount || {}).reduce((a, v) => a + v, 0);
export const greatPeopleOf = (s, pid) => s.players[pid].greats || [];

export function gpGain(s, pid, y) {
  const GP = s.rules.greatPeople, out = {};
  const routes = s.tradeRoutes.filter((r) => r.a === pid).length;
  for (const [kind, K] of Object.entries(GP.kinds)) {
    let v = 0;
    for (const [k, rate] of Object.entries(K.source)) v += k === 'routes' ? routes * rate : Math.max(0, y.yields[k] || 0) * rate;
    v *= 1 + (s.data.profilesById[s.players[pid].profile].mods.gpBonus?.[kind] || 0); // affinité du profil
    out[kind] = Math.round(v * 10) / 10;
  }
  return out;
}

export function greatPeopleTick(s, pid, y) {
  const GP = s.rules.greatPeople;
  if (!GP) return;
  const p = s.players[pid];
  p.gp = p.gp || {}; p.gpCount = p.gpCount || {}; p.greats = p.greats || [];
  const gain = gpGain(s, pid, y);
  for (const kind of Object.keys(GP.kinds)) {
    p.gp[kind] = (p.gp[kind] || 0) + gain[kind];
    const need = gpThreshold(s, pid, kind);
    if (p.gp[kind] < need) continue;
    p.gp[kind] -= need;
    p.gpCount[kind] = (p.gpCount[kind] || 0) + 1;
    s.gpUsedNames = s.gpUsedNames || [];
    const pool = GP.names[kind].filter((n) => !s.gpUsedNames.includes(n));
    const name = pool.length ? pool[s.rng.int(pool.length)] : `${GP.kinds[kind].name} n°${p.gpCount[kind]}`;
    s.gpUsedNames.push(name);
    p.greats.push({ id: s.nextId++, kind, name, turn: s.turn });
    addBonusPrestige(s, pid, 'personnages', GP.prestige);
    G.log(s, human(s, pid) ? `Un grand personnage vous rejoint : ${name} (${GP.kinds[kind].name.toLowerCase()}). Employez-le depuis le panneau Personnages.` : `${nm(s, pid)} accueille ${name}, ${GP.kinds[kind].name.toLowerCase()}.`,
      human(s, pid) ? [pid] : null, human(s, pid) ? 'good' : 'info');
  }
}

// Chantier qu'un ingénieur ferait avancer : celui que l'on désigne, sinon la merveille ou le chantier le plus long.
export function engineerTarget(s, pid, buildingId = null) {
  const wip = s.buildings.filter((b) => b.owner === pid && b.turnsLeft > 0);
  if (buildingId !== null) return wip.find((b) => b.id === buildingId) || null;
  return wip.sort((a, b) => (G.buildingDef(s, b.type).wonder ? 10 : 0) + b.turnsLeft - (G.buildingDef(s, a.type).wonder ? 10 : 0) - a.turnsLeft)[0] || null;
}

export function describeUse(s, pid, g) {
  const K = s.rules.greatPeople.kinds[g.kind], p = s.players[pid];
  if (g.kind === 'scientist') return p.research ? `+${Math.max(K.science, Math.round(G.techCost(s, pid, p.research) * K.share))} Science pour ${G.techDef(s, p.research).name}` : `+${K.science} Science`;
  if (g.kind === 'artist') return freeArtSlots(s, pid) > 0 ? 'Offre une œuvre d\'art' : `+${K.culture} Culture`;
  if (g.kind === 'merchant') return `+${K.gold} Or, +${K.prestige || 0} prestige, +${K.relation} relation avec chacun`;
  const t = engineerTarget(s, pid);
  return t ? `${G.buildingDef(s, t.type).name} : −${Math.min(K.turns, t.turnsLeft)} tour(s)` : `+${K.stone} Pierre`;
}

export function useGreatPerson(s, pid, gid, opts = {}) {
  const p = s.players[pid];
  const g = (p.greats || []).find((x) => x.id === gid);
  if (!g) return { ok: false, reason: 'Personnage introuvable.' };
  const K = s.rules.greatPeople.kinds[g.kind];
  let what = '';
  if (g.kind === 'scientist') {
    const pts = p.research ? Math.max(K.science, Math.round(G.techCost(s, pid, p.research) * K.share)) : K.science;
    const tech = p.research && G.techDef(s, p.research);
    p.sciencePool += pts;
    G.checkResearch(s, pid);
    what = `+${pts} Science${tech ? ` pour ${tech.name}` : ''}`;
  } else if (g.kind === 'artist') {
    if (freeArtSlots(s, pid) > 0) {
      const kinds = Object.entries(s.rules.artworks.kinds).filter(([, a]) => !a.tech || G.hasTech(s, pid, a.tech)).map(([k]) => k);
      const kind = kinds[kinds.length - 1] || Object.keys(s.rules.artworks.kinds)[0];
      const A = s.rules.artworks;
      s.artworks = s.artworks || [];
      const used = new Set(s.artworks.map((a) => a.name));
      const pool = A.names[kind].filter((n) => !used.has(n));
      const name = pool.length ? pool[s.rng.int(pool.length)] : `Chef-d'œuvre de ${g.name}`;
      s.artworks.push({ id: s.nextId++, owner: pid, holder: pid, kind, name, turn: s.turn, by: g.name });
      what = `œuvre « ${name} »`;
    } else { p.cultureTotal += K.culture; what = `+${K.culture} Culture`; }
  } else if (g.kind === 'merchant') {
    p.res.gold += K.gold;
    addBonusPrestige(s, pid, 'commerce', K.prestige || 0);
    for (const o of s.players) if (o.id !== pid && G.isExplored(s, pid, ...cityXY(s, o.id))) G.addRel(s, pid, o.id, K.relation);
    what = `+${K.gold} Or et relations améliorées`;
  } else {
    const t = engineerTarget(s, pid, opts.buildingId ?? null);
    if (t) { const n = Math.min(K.turns, t.turnsLeft - 1); t.turnsLeft -= n; what = `${G.buildingDef(s, t.type).name} avancé de ${n} tour(s)${t.turnsLeft === 1 ? ', achevé à la fin du tour' : ''}`; if (n <= 0) what = `${G.buildingDef(s, t.type).name} : déjà presque fini`; } else { p.res.stone += K.stone; what = `+${K.stone} Pierre`; }
  }
  p.greats = p.greats.filter((x) => x !== g);
  p.gpUsed = (p.gpUsed || 0) + 1;
  G.log(s, `${human(s, pid) ? 'Vous employez' : `${nm(s, pid)} emploie`} ${g.name} : ${what}.`, human(s, pid) ? [pid] : null, human(s, pid) ? 'good' : 'info');
  return { ok: true, what };
}
// Coordonnées de la première ville d'un joueur (pour savoir s'il est « connu »).
function cityXY(s, pid) { const c = G.citiesOf(s, pid)[0]; return c ? [c.x, c.y] : [-1, -1]; }

export function aiGreatPeople(s, pid) {
  const p = s.players[pid];
  for (const g of [...(p.greats || [])]) {
    if (g.kind === 'scientist' && !p.research) continue;
    if (g.kind === 'engineer' && !engineerTarget(s, pid) && s.turn - g.turn < 4) continue;
    useGreatPerson(s, pid, g.id);
  }
}

// ------------------------------------------------------------ ambitions secrètes
// Facultatives (option de partie). Chacun reçoit une main de cartes cachées ; on en joue au plus deux à la fois,
// et seule une carte jouée rapporte son prestige quand elle est remplie. Aucune n'est obligatoire : une carte
// gardée en main ne coûte rien, on peut retirer une carte jouée ou en défausser une pour piocher.

export const ambitionsOn = (s) => !!s.rules.ambitions && s.settings?.ambitions !== false;
export const ambitionDef = (s, id) => s.rules.ambitions.cards.find((c) => c.id === id);
const prestigeScale = (s) => s.rules.prestigeTarget / ((s.data.rules.prestigeTarget || s.rules.prestigeTarget) + (s.rules.ambitions.targetBonus || 0));
export const ambitionPrestige = (s, card) => Math.round(card.prestige * prestigeScale(s));

function draw(s, pid) {
  const p = s.players[pid];
  const taken = new Set([...(p.ambitions || []).map((a) => a.id), ...(p.ambitionsDone || []), ...(p.ambitionsDiscarded || [])]);
  const pool = s.rules.ambitions.cards.filter((c) => !taken.has(c.id));
  if (!pool.length) return null;
  const c = pool[s.rng.int(pool.length)];
  p.ambitions.push({ id: c.id, active: false });
  return c;
}
export function dealAmbitions(s) {
  if (!ambitionsOn(s)) return;
  for (const p of s.players) {
    if (p.ambitions) continue;
    p.ambitions = []; p.ambitionsDone = []; p.ambitionsDiscarded = [];
    for (let i = 0; i < s.rules.ambitions.hand; i++) draw(s, p.id);
  }
}

// Avancement d'une carte : [valeur, objectif].
export function ambitionProgress(s, pid, card) {
  const c = card.cond, p = s.players[pid], cities = G.citiesOf(s, pid);
  const done = (b) => !b.turnsLeft;
  if (c.riverCities) return [cities.filter((x) => G.cityOnRiver(s, x)).length, c.riverCities];
  if (c.luxuries) return [G.activeLuxuries(s, pid).length, c.luxuries];
  if (c.buildings) {
    let have = 0, need = 0;
    for (const [t, n] of Object.entries(c.buildings)) { need += n; have += Math.min(n, s.buildings.filter((b) => b.owner === pid && b.type === t && done(b)).length); }
    return [have, need];
  }
  if (c.greatPeople) return [gpRecruited(s, pid), c.greatPeople];
  if (c.wonders) return [Object.values(s.wonders).filter((o) => o === pid).length, c.wonders];
  if (c.routes) return [s.tradeRoutes.filter((r) => r.a === pid).length, c.routes];
  if (c.alliances) return [s.alliances.filter((r) => r.a === pid || r.b === pid).length, c.alliances];
  if (c.explored) return [Math.round((p.explored.reduce((a, v) => a + v, 0) / p.explored.length) * 100), Math.round(c.explored * 100)];
  if (c.artworks) return [(s.artworks || []).filter((a) => a.owner === pid).length, c.artworks];
  if (c.cityPop) return [Math.max(0, ...cities.map((x) => x.pop)), c.cityPop];
  if (c.vocations) return [vocationsOf(s, pid).length, c.vocations];
  if (c.cities) return [cities.length, c.cities];
  if (c.techTier) return [Math.max(0, ...p.techs.map((t) => G.techDef(s, t).tier)), c.techTier];
  if (c.cleanCities) {
    const polluted = s.rules.pollution && cities.some((x) => cityPollution(s, x).net > 0);
    return [polluted ? Math.min(cities.length, c.cleanCities - 1) : cities.length, c.cleanCities];
  }
  if (c.terraform) return [p.terraformed || 0, c.terraform];
  return [0, 1];
}

export function canPlayAmbition(s, pid, id) {
  const p = s.players[pid], a = (p.ambitions || []).find((x) => x.id === id);
  if (!a) return { ok: false, reason: 'Carte introuvable.' };
  if (a.active) return { ok: false, reason: 'Déjà jouée.' };
  if (p.ambitions.filter((x) => x.active).length >= s.rules.ambitions.maxActive) return { ok: false, reason: `Au plus ${s.rules.ambitions.maxActive} ambitions jouées à la fois : retirez-en une d'abord.` };
  return { ok: true };
}
export function playAmbition(s, pid, id) {
  const chk = canPlayAmbition(s, pid, id);
  if (!chk.ok) return chk;
  s.players[pid].ambitions.find((x) => x.id === id).active = true;
  checkAmbitions(s, pid);
  return { ok: true };
}
export function withdrawAmbition(s, pid, id) {
  const a = (s.players[pid].ambitions || []).find((x) => x.id === id);
  if (!a || !a.active) return { ok: false, reason: 'Carte non jouée.' };
  a.active = false;
  return { ok: true };
}
export const discardReadyIn = (s, pid) => Math.max(0, (s.players[pid].ambitionDiscardTurn ?? -Infinity) + s.rules.ambitions.discardCooldown - s.turn);
export function discardAmbition(s, pid, id) {
  const p = s.players[pid], a = (p.ambitions || []).find((x) => x.id === id);
  if (!a) return { ok: false, reason: 'Carte introuvable.' };
  if (discardReadyIn(s, pid) > 0) return { ok: false, reason: `Prochaine défausse dans ${discardReadyIn(s, pid)} tour(s).` };
  p.ambitions = p.ambitions.filter((x) => x !== a);
  p.ambitionsDiscarded.push(a.id);
  p.ambitionDiscardTurn = s.turn;
  const c = draw(s, pid);
  return { ok: true, drawn: c };
}

export function checkAmbitions(s, pid) {
  const p = s.players[pid];
  for (const a of [...(p.ambitions || [])]) {
    if (!a.active) continue;
    const card = ambitionDef(s, a.id);
    const [have, need] = ambitionProgress(s, pid, card);
    if (have < need) continue;
    const pts = ambitionPrestige(s, card);
    addBonusPrestige(s, pid, 'ambitions', pts);
    p.ambitions = p.ambitions.filter((x) => x !== a);
    p.ambitionsDone.push(a.id);
    draw(s, pid);
    G.log(s, human(s, pid) ? `Ambition accomplie : « ${card.name} » (+${pts} prestige). Une nouvelle carte rejoint votre main.` : `${nm(s, pid)} accomplit une ambition secrète : « ${card.name} » (+${pts} prestige).`,
      null, human(s, pid) ? 'good' : 'warn');
  }
}
export function ambitionsTick(s) {
  if (!ambitionsOn(s)) return;
  dealAmbitions(s);
  for (const p of s.players) checkAmbitions(s, p.id);
}

// IA : joue les cartes les plus avancées, en garde une si elle avance mieux qu'une carte jouée.
export function aiAmbitions(s, pid) {
  if (!ambitionsOn(s)) return;
  const p = s.players[pid];
  if (!p.ambitions) return;
  const ratio = (a) => { const [h, n] = ambitionProgress(s, pid, ambitionDef(s, a.id)); return h / Math.max(1, n); };
  const sorted = [...p.ambitions].sort((x, y) => ratio(y) - ratio(x));
  const want = new Set(sorted.slice(0, s.rules.ambitions.maxActive).map((a) => a.id));
  for (const a of p.ambitions) if (a.active && !want.has(a.id)) a.active = false;
  for (const a of p.ambitions) if (!a.active && want.has(a.id)) playAmbition(s, pid, a.id);
  const worst = sorted[sorted.length - 1];
  if (worst && !worst.active && ratio(worst) === 0 && s.turn > 12 && discardReadyIn(s, pid) === 0) discardAmbition(s, pid, worst.id);
}

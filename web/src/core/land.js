// Phase 13 — vocations des villes, catastrophes locales et aménagement du territoire.
// Importé par game.js : les fonctions du moteur ne sont utilisées qu'à l'exécution.
import * as G from './game.js';
import { seasonOf } from './society.js';

const human = (s, pid) => s.players[pid].isHuman;
const done = (b) => !b.turnsLeft;
const hasBuilding = (s, city, type) => s.buildings.some((b) => b.cityId === city.id && b.type === type && done(b));

// ------------------------------------------------------------ vocations
// Une ville assez peuplée choisit une vocation : un bonus marqué, une petite contrepartie.

export const vocationDef = (s, id) => s.rules.vocations?.list[id] || null;
export const vocationsOf = (s, pid) => G.citiesOf(s, pid).filter((c) => c.vocation);

export function canSetVocation(s, city, id) {
  const V = s.rules.vocations, def = V?.list[id];
  if (!def) return { ok: false, reason: 'Vocation inconnue.' };
  if (city.vocation === id) return { ok: false, reason: 'Vocation déjà choisie.' };
  if (city.pop < V.minPop) return { ok: false, reason: `La ville doit compter ${V.minPop} habitants.` };
  if (def.coastal && !G.isCoastal(s, G.tileAt(s, city.x, city.y)) && !G.cityOnRiver(s, city) && !G.neighbors(s, city.x, city.y).some((t) => G.terrainOf(s, t).water)) return { ok: false, reason: 'Ville côtière ou fluviale uniquement.' };
  if (city.vocation) {
    const wait = (city.vocationTurn ?? -Infinity) + V.cooldown - s.turn;
    if (wait > 0) return { ok: false, reason: `Changement possible dans ${wait} tour(s).` };
    if (!G.canAfford(s, city.owner, V.changeCost)) return { ok: false, reason: `Changer coûte ${G.fmtBundle(s, V.changeCost)}.` };
  }
  return { ok: true };
}
export function setVocation(s, city, id) {
  const chk = canSetVocation(s, city, id);
  if (!chk.ok) return chk;
  const V = s.rules.vocations;
  if (city.vocation) for (const [k, v] of Object.entries(V.changeCost)) s.players[city.owner].res[k] -= v;
  city.vocation = id; city.vocationTurn = s.turn;
  G.log(s, `${city.name} devient ${V.list[id].name.toLowerCase()}.`, human(s, city.owner) ? [city.owner] : null, human(s, city.owner) ? 'good' : 'info');
  return { ok: true };
}
// Rendement des vocations d'un joueur (bonus et contreparties), ajouté au brut de computeYields.
export function vocationYields(s, pid) {
  const out = {};
  for (const c of vocationsOf(s, pid)) {
    const d = vocationDef(s, c.vocation);
    if (!d) continue;
    for (const b of [d.yields, d.malus]) for (const [k, v] of Object.entries(b || {})) out[k] = (out[k] || 0) + v;
  }
  return out;
}
export const vocationTourism = (s, pid) => vocationsOf(s, pid).reduce((a, c) => a + (vocationDef(s, c.vocation)?.tourism || 0), 0);
export const vocationPopCap = (s, city) => (city.vocation && vocationDef(s, city.vocation)?.popCap) || 0;
export const vocationPollution = (s, city) => (city.vocation && vocationDef(s, city.vocation)?.pollution) || 0;
export const vocationRelation = (s, pid) => vocationsOf(s, pid).reduce((a, c) => a + (vocationDef(s, c.vocation)?.relation || 0), 0);

// IA : la vocation qui sert sa voie principale, en évitant les doublons.
export function aiVocations(s, pid, w) {
  const V = s.rules.vocations;
  if (!V) return;
  for (const c of G.citiesOf(s, pid)) {
    if (c.vocation || c.pop < V.minPop) continue;
    const taken = vocationsOf(s, pid).map((x) => x.vocation);
    const opts = Object.entries(V.list).filter(([id]) => canSetVocation(s, c, id).ok)
      .map(([id, d]) => ({ id, v: (w[d.branch] || 1) * 10 - taken.filter((t) => t === id).length * 4 + Object.values(d.yields).reduce((a, x) => a + x, 0) }))
      .sort((a, b) => b.v - a.v);
    if (opts.length) setVocation(s, c, opts[0].id);
  }
}

// ------------------------------------------------------------ catastrophes
// Crues au printemps, sécheresses et incendies en été. Chacune se prévient par un bâtiment.
// Les bâtiments touchés sont endommagés quelques tours (sans rendement) ; on peut les réparer contre de l'Or.

export const isDamaged = (b) => (b.damaged || 0) > 0;
export const damagedOf = (s, pid) => s.buildings.filter((b) => b.owner === pid && isDamaged(b));

export function disasterRisks(s, city) {
  const D = s.rules.disasters;
  if (!D) return [];
  const out = [];
  for (const [id, d] of Object.entries(D.list)) {
    if (!exposed(s, city, id, d)) continue;
    out.push({ id, def: d, protectedBy: hasBuilding(s, city, d.protect) ? d.protect : null });
  }
  return out;
}
function exposed(s, city, id, d) {
  const t = G.tileAt(s, city.x, city.y);
  if (id === 'flood') return G.cityOnRiver(s, city) || s.map.tiles.some((x) => x.cityId === city.id && x.river && G.buildingAt(s, x.x, x.y));
  if (id === 'drought') return (d.regions || []).includes(t.region);
  if (id === 'wildfire') return forestsOf(s, city).length >= d.minForests;
  return false;
}
const forestsOf = (s, city) => s.map.tiles.filter((x) => x.cityId === city.id && x.owner === city.owner && x.type === 'forest' && !G.cityAt(s, x.x, x.y));

function damage(s, list, turns, max) {
  const hit = list.slice(0, max);
  for (const b of hit) b.damaged = Math.max(b.damaged || 0, turns);
  return hit;
}

export function disastersTick(s) {
  const D = s.rules.disasters;
  if (!D || s.settings?.disasters === false) return;
  for (const b of s.buildings) if (b.damaged > 0) b.damaged--;
  const season = seasonOf(s);
  if (!season) return;
  // Annonce de la saison à risque pour le joueur humain (premier tour de la saison).
  if ((s.turn - 1) % s.rules.seasons.turns === 0) {
    for (const p of s.players.filter((q) => q.isHuman)) {
      const risky = G.citiesOf(s, p.id).flatMap((c) => disasterRisks(s, c).filter((r) => r.def.season === season.id && !r.protectedBy).map((r) => `${c.name} (${r.def.name.toLowerCase()})`));
      if (risky.length) G.log(s, `${season.name} : risque de catastrophe à ${risky.join(', ')}. Les bâtiments de prévention protègent la ville.`, [p.id], 'warn');
    }
  }
  if (s.turn <= D.grace) return;
  for (const city of [...s.cities]) {
    for (const r of disasterRisks(s, city)) {
      const d = r.def;
      if (d.season !== season.id || s.rng.next() >= d.chance) continue;
      const pid = city.owner, p = s.players[pid];
      const tell = (text, kind) => G.log(s, text, human(s, pid) ? [pid] : null, human(s, pid) ? kind : 'info');
      if (r.id === 'flood') {
        p.res.food += d.food;
        if (r.protectedBy) { tell(`Crue à ${city.name} : la digue tient bon, et le limon fertilise les champs (+${d.food} Nourriture).`, 'good'); continue; }
        const onRiver = s.buildings.filter((b) => b.cityId === city.id && !isDamaged(b) && done(b) && !G.buildingDef(s, b.type).wonder && G.footprintTiles(s, b.type, b.x, b.y).some((t) => t && t.river));
        const hit = damage(s, onRiver, d.damageTurns, D.maxDamaged);
        tell(`Crue à ${city.name} !${hit.length ? ` ${hit.map((b) => G.buildingDef(s, b.type).name).join(', ')} endommagé(s) ${d.damageTurns} tours.` : ''} Le limon apporte +${d.food} Nourriture. Une Digue protégerait la ville.`, 'bad');
      } else if (r.id === 'drought') {
        if (r.protectedBy) { tell(`Sécheresse autour de ${city.name} : le grenier évite la disette.`, 'good'); continue; }
        const lost = Math.floor(Math.max(0, p.res.food) * d.foodLoss);
        p.res.food -= lost;
        const farms = s.buildings.filter((b) => b.cityId === city.id && b.type === 'farm' && done(b) && !isDamaged(b));
        const hit = damage(s, farms, d.damageTurns, D.maxDamaged);
        tell(`Sécheresse à ${city.name} : −${lost} Nourriture${hit.length ? `, ${hit.length} ferme(s) à l'arrêt ${d.damageTurns} tours` : ''}. Un Grenier protégerait la ville.`, 'bad');
      } else if (r.id === 'wildfire') {
        if (r.protectedBy) { tell(`Départ de feu autour de ${city.name} : l'eau courante de l'aqueduc permet de l'éteindre.`, 'good'); continue; }
        const burnt = s.rng.shuffle(forestsOf(s, city)).slice(0, d.burn);
        const hit = [];
        for (const t of burnt) {
          t.type = 'plains';
          const b = G.buildingAt(s, t.x, t.y);
          if (b && done(b) && !G.buildingDef(s, b.type).wonder) hit.push(...damage(s, [b], d.damageTurns, 1));
        }
        s.terrainDirty = true;
        tell(`Incendie de forêt autour de ${city.name} : ${burnt.length} forêt(s) brûlée(s)${hit.length ? `, ${hit.map((b) => G.buildingDef(s, b.type).name).join(', ')} endommagé(s)` : ''}. Reboisez plus tard ; un Aqueduc protégerait la ville.`, 'bad');
      }
      break; // une catastrophe par ville et par tour au plus
    }
  }
}

export function canRepair(s, pid, b) {
  if (!b || b.owner !== pid || !isDamaged(b)) return { ok: false, reason: 'Rien à réparer.' };
  if (!G.canAfford(s, pid, s.rules.disasters.repairCost)) return { ok: false, reason: `Réparer coûte ${G.fmtBundle(s, s.rules.disasters.repairCost)}.` };
  return { ok: true };
}
export function repair(s, pid, bid) {
  const b = s.buildings.find((x) => x.id === bid);
  const chk = canRepair(s, pid, b);
  if (!chk.ok) return chk;
  for (const [k, v] of Object.entries(s.rules.disasters.repairCost)) s.players[pid].res[k] -= v;
  b.damaged = 0;
  return { ok: true };
}

// IA : répare quand elle a de l'Or en trop.
export function aiRepair(s, pid) {
  if (!s.rules.disasters) return;
  for (const b of damagedOf(s, pid)) if (b.damaged > 1 && s.players[pid].res.gold > 120) repair(s, pid, b.id);
}
// IA : une ville exposée et non protégée réclame son bâtiment de prévention (bonus de score pour buildSomething).
export function aiPreventionNeed(s, pid, type) {
  if (!s.rules.disasters || s.settings?.disasters === false) return 0;
  return G.citiesOf(s, pid).filter((c) => disasterRisks(s, c).some((r) => r.def.protect === type && !r.protectedBy)).length;
}

// ------------------------------------------------------------ aménagement du territoire
// Défricher une forêt, reboiser une plaine, aplanir une colline, dans son territoire et sur une case libre.

export function canTerraform(s, pid, action, x, y) {
  const A = s.rules.terraform?.actions[action];
  const t = G.tileAt(s, x, y);
  if (!A || !t) return { ok: false, reason: 'Action inconnue.' };
  if (t.owner !== pid) return { ok: false, reason: 'Hors de votre territoire.' };
  if (!A.from.includes(t.type)) return { ok: false, reason: `Seulement sur : ${A.from.map((k) => s.data.terrain[k].name.toLowerCase()).join(', ')}.` };
  if (G.cityAt(s, x, y) || G.buildingAt(s, x, y)) return { ok: false, reason: 'Case occupée.' };
  if (t.luxury || t.natural || t.ruin) return { ok: false, reason: 'Case remarquable : on ne la transforme pas.' };
  if (A.tech && !G.hasTech(s, pid, A.tech)) return { ok: false, reason: `Nécessite ${G.techDef(s, A.tech).name}.` };
  if (!G.canAfford(s, pid, A.cost)) return { ok: false, reason: `Il faut ${G.fmtBundle(s, A.cost)}.` };
  return { ok: true };
}
export function terraform(s, pid, action, x, y) {
  const chk = canTerraform(s, pid, action, x, y);
  if (!chk.ok) return chk;
  const A = s.rules.terraform.actions[action], p = s.players[pid], t = G.tileAt(s, x, y);
  for (const [k, v] of Object.entries(A.cost)) p.res[k] -= v;
  for (const [k, v] of Object.entries(A.gain || {})) p.res[k] = (p.res[k] || 0) + v;
  t.type = A.to;
  p.terraformed = (p.terraformed || 0) + 1;
  s.terrainDirty = true;
  return { ok: true };
}

// Diversité des parties : merveilles naturelles, ruines, événements à choix et politiques.
// Tout est piloté par les données (web/data/rules.json, events.json, policies.json).
// Ce module est importé par game.js : il n'utilise les fonctions du moteur qu'à l'exécution.
import * as G from './game.js';

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ------------------------------------------------------------ placement sur la carte

// Merveilles naturelles et ruines, placées à la création de la partie (loin des points de départ).
export function placeFeatures(s, rng, starts) {
  const NW = s.rules.naturalWonders, RU = s.rules.ruins;
  const area = s.map.width * s.map.height;
  s.naturals = [];
  if (NW) {
    const count = Math.max(2, Math.round((NW.per936Tiles * area) / 936));
    const defs = rng.shuffle([...NW.list]);
    for (let k = 0; k < count; k++) {
      const def = defs[k % defs.length];
      if (k >= defs.length) break; // chaque merveille naturelle est unique
      const ok = (t) => def.terrain.includes(t.type) && !t.luxury && !t.natural
        && (def.needs !== 'water' || G.neighbors(s, t.x, t.y, D4).some((n) => G.terrainOf(s, n).water))
        && (t.type !== 'water' || G.neighbors(s, t.x, t.y, D4).some((n) => !G.terrainOf(s, n).water)) // récif : près d'une côte
        && !starts.some((o) => G.cheb(o.x, o.y, t.x, t.y) < NW.startGap)
        && !s.naturals.some((o) => G.cheb(o.x, o.y, t.x, t.y) < NW.minSpacing);
      const cands = s.map.tiles.filter(ok);
      if (!cands.length) continue;
      const t = cands[rng.int(cands.length)];
      t.natural = def.id;
      s.naturals.push({ id: def.id, x: t.x, y: t.y, found: [] });
    }
  }
  if (RU) {
    const count = Math.round((RU.per936Tiles * area) / 936);
    const cands = rng.shuffle(s.map.tiles.filter((t) => G.terrainOf(s, t).passable && !t.luxury && !t.natural));
    const placed = [];
    for (const t of cands) {
      if (placed.length >= count) break;
      if (starts.some((o) => G.cheb(o.x, o.y, t.x, t.y) < RU.startGap)) continue;
      if (placed.some((o) => G.cheb(o.x, o.y, t.x, t.y) < RU.minSpacing)) continue;
      t.ruin = true; placed.push(t);
    }
  }
}

export const naturalDef = (s, id) => (s.rules.naturalWonders?.list || []).find((d) => d.id === id);

// Appelée par reveal() quand une case devient explorée pour la première fois par un joueur.
export function onDiscover(s, pid, t) {
  if (!t.natural) return;
  const site = (s.naturals || []).find((n) => n.x === t.x && n.y === t.y);
  if (!site || site.found.includes(pid)) return;
  const NW = s.rules.naturalWonders;
  const first = site.found.length === 0;
  site.found.push(pid);
  const pts = first ? NW.firstPrestige : NW.laterPrestige;
  addBonusPrestige(s, pid, 'decouvertes', pts);
  const def = naturalDef(s, site.id);
  log(s, pid, first ? `Vous découvrez ${def.name}, une merveille naturelle (+${pts} prestige, premier à la voir).` : `Vous découvrez ${def.name} (+${pts} prestige).`, 'good');
}

// Une unité qui entre dans des ruines les fouille.
export function exploreRuin(s, u, t) {
  if (!t.ruin) return;
  const RU = s.rules.ruins;
  if (G.unitDef(s, u.type).naval) return;
  t.ruin = false;
  const rw = RU.rewards[s.rng.int(RU.rewards.length)];
  const p = s.players[u.owner];
  grant(s, u.owner, rw);
  if (rw.reveal) G.reveal(s, u.owner, t.x, t.y, rw.reveal);
  addBonusPrestige(s, u.owner, 'decouvertes', RU.prestige);
  log(s, u.owner, `Ruines fouillées : ${rw.text} (${describeEffects(s, rw)}${RU.prestige ? `, +${RU.prestige} prestige` : ''}).`, 'good');
  if (!p.isHuman) p.ai.ruins = (p.ai.ruins || 0) + 1;
}

// Rendement des merveilles naturelles situées dans le territoire d'un joueur.
export function naturalYields(s, pid) {
  const out = {};
  let owned = 0;
  for (const n of s.naturals || []) {
    if (G.tileAt(s, n.x, n.y).owner !== pid) continue;
    owned++;
    for (const [k, v] of Object.entries(naturalDef(s, n.id).yields)) out[k] = (out[k] || 0) + v;
  }
  return { yields: out, owned };
}

// --------------------------------------------------------------- prestige bonus

export function addBonusPrestige(s, pid, key, pts) {
  if (!pts) return;
  const p = s.players[pid];
  p.bonusPrestige = p.bonusPrestige || {};
  p.bonusPrestige[key] = (p.bonusPrestige[key] || 0) + pts;
}

function log(s, pid, text, kind) { G.log(s, text, [pid], kind); }

// -------------------------------------------------------------- effets communs

// Effets d'un choix d'événement ou d'une récompense : res, science, culture, prestige, pop, relAll, buff.
export function canPay(s, pid, eff) {
  return Object.entries(eff.res || {}).every(([k, v]) => v >= 0 || (s.players[pid].res[k] || 0) >= -v);
}
export function grant(s, pid, eff, city = null) {
  const p = s.players[pid];
  for (const [k, v] of Object.entries(eff.res || {})) p.res[k] = Math.max(0, (p.res[k] || 0) + v);
  if (eff.science) p.sciencePool += eff.science;
  if (eff.culture) p.cultureTotal += eff.culture;
  if (eff.prestige) addBonusPrestige(s, pid, 'evenements', eff.prestige);
  if (eff.relAll) for (const q of s.players) if (q.id !== pid) G.addRel(s, pid, q.id, eff.relAll);
  if (eff.pop) {
    const c = city || G.citiesOf(s, pid).sort((a, b) => a.pop - b.pop)[0];
    if (c) {
      if (eff.pop > 0 && c.pop >= G.cityPopCap(s, c)) p.res.food += 20 * eff.pop; // ville pleine : la nourriture remplace l'habitant
      else c.pop = Math.max(1, c.pop + eff.pop);
    }
  }
  if (eff.buff) {
    p.buffs = (p.buffs || []).filter((b) => b.until >= s.turn);
    p.buffs.push({ yieldPct: eff.buff.yieldPct, until: s.turn + eff.buff.turns - 1, label: eff.label || '' });
  }
}

export function describeEffects(s, eff) {
  const name = (k) => s.data.resources[k]?.name || k;
  const parts = [];
  for (const [k, v] of Object.entries(eff.res || {})) parts.push(`${v > 0 ? '+' : ''}${v} ${name(k)}`);
  if (eff.science) parts.push(`+${eff.science} Science`);
  if (eff.culture) parts.push(`+${eff.culture} Culture`);
  if (eff.prestige) parts.push(`+${eff.prestige} prestige`);
  if (eff.pop) parts.push(`${eff.pop > 0 ? '+' : ''}${eff.pop} habitant`);
  if (eff.relAll) parts.push(`${eff.relAll > 0 ? '+' : ''}${eff.relAll} relation avec tous`);
  if (eff.reveal) parts.push('carte révélée alentour');
  if (eff.buff) parts.push(`${Object.entries(eff.buff.yieldPct).map(([k, v]) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} % ${name(k)}`).join(', ')} pendant ${eff.buff.turns} tours`);
  return parts.join(', ') || 'aucun effet';
}

// Bonus temporaires actifs (événements) : utilisés par playerMods.
export const activeBuffs = (s, pid) => (s.players[pid].buffs || []).filter((b) => b.until >= s.turn);

// -------------------------------------------------------------- événements

function eligible(s, pid, ev) {
  const c = ev.if || {};
  const p = s.players[pid];
  const cities = G.citiesOf(s, pid);
  if (!cities.length) return false;
  if (c.minTurn && s.turn < c.minTurn) return false;
  if (c.minCities && cities.length < c.minCities) return false;
  if (c.tech && !p.techs.includes(c.tech)) return false;
  if (c.coastal && !cities.some((ct) => G.isCoastal(s, G.tileAt(s, ct.x, ct.y)) || G.neighbors(s, ct.x, ct.y).some((n) => G.terrainOf(s, n).water))) return false;
  if (c.wonder && !Object.values(s.wonders).includes(pid)) return false;
  if ((p.seenEvents || []).includes(ev.id)) return false;
  return true;
}

// Valeur d'un choix pour l'IA (et pour le choix par défaut quand le joueur ne répond pas).
export function choiceValue(s, pid, ch) {
  if (!canPay(s, pid, ch)) return -Infinity;
  const p = s.players[pid];
  const w = s.data.ai?.branchWeights?.[p.profile] || { economy: 2, science: 2, culture: 2, diplomacy: 2 };
  let v = 0;
  for (const [k, n] of Object.entries(ch.res || {})) v += n * (s.data.resources[k]?.tradeValue || 1);
  v += (ch.science || 0) * 0.45 * w.science;
  v += (ch.culture || 0) * 0.45 * w.culture;
  v += (ch.prestige || 0) * 9;
  v += (ch.pop || 0) * 30;
  v += (ch.relAll || 0) * (s.players.length - 1) * 0.2 * w.diplomacy;
  if (ch.buff) {
    const y = p.lastYield?.yields || {};
    for (const [k, pct] of Object.entries(ch.buff.yieldPct)) v += pct * (y[k] || 5) * ch.buff.turns * (k === 'science' ? 0.45 * w.science : k === 'culture' ? 0.45 * w.culture : 1);
  }
  return v;
}
const bestChoice = (s, pid, ev) => ev.choices.map((ch, i) => ({ i, v: choiceValue(s, pid, ch) })).sort((a, b) => b.v - a.v)[0].i;

export const eventDef = (s, id) => s.data.events.list.find((e) => e.id === id);

// Début de tour : chaque joueur reçoit de temps en temps un événement.
export function eventsTick(s) {
  const E = s.data.events;
  if (!E) return;
  s.pendingEvents = s.pendingEvents || [];
  // Événements laissés sans réponse : choix par défaut.
  for (const pe of [...s.pendingEvents]) {
    if (s.turn - pe.turn < E.expireAfter) continue;
    const ev = eventDef(s, pe.ev);
    resolveEvent(s, pe.id, bestChoice(s, pe.pid, ev), true);
  }
  for (const p of s.players) {
    if (p.nextEvent === undefined) p.nextEvent = E.firstTurn + s.rng.int(E.every[1] - E.every[0] + 1);
    if (s.turn < p.nextEvent || s.pendingEvents.some((pe) => pe.pid === p.id)) continue;
    const pool = E.list.filter((ev) => eligible(s, p.id, ev));
    p.nextEvent = s.turn + E.every[0] + s.rng.int(E.every[1] - E.every[0] + 1);
    if (!pool.length) continue;
    const ev = pool[s.rng.int(pool.length)];
    p.seenEvents = [...(p.seenEvents || []), ev.id].slice(-8); // pas deux fois le même événement de suite
    const cities = G.citiesOf(s, p.id);
    const city = cities[s.rng.int(cities.length)];
    const pe = { id: s.nextId++, pid: p.id, ev: ev.id, cityId: city.id, city: city.name, turn: s.turn };
    if (p.isHuman) { s.pendingEvents.push(pe); G.log(s, `Événement : ${ev.title}.`, [p.id], 'warn'); } else {
      s.pendingEvents.push(pe);
      resolveEvent(s, pe.id, bestChoice(s, p.id, ev), false);
    }
  }
}

export function eventText(s, pe) { return eventDef(s, pe.ev).text.replace('{city}', pe.city); }

export function resolveEvent(s, peId, choiceIdx, auto = false) {
  const pe = (s.pendingEvents || []).find((x) => x.id === peId);
  if (!pe) return { ok: false, reason: 'Événement introuvable.' };
  const ev = eventDef(s, pe.ev);
  const ch = ev.choices[choiceIdx];
  if (!ch || !canPay(s, pe.pid, ch)) return { ok: false, reason: 'Ressources insuffisantes pour ce choix.' };
  s.pendingEvents = s.pendingEvents.filter((x) => x !== pe);
  grant(s, pe.pid, { ...ch, label: ev.title }, s.cities.find((c) => c.id === pe.cityId));
  if (s.players[pe.pid].isHuman) G.log(s, `${ev.title} : ${auto ? 'faute de décision, ' : ''}« ${ch.label} » (${describeEffects(s, ch)}).`, [pe.pid], auto ? 'warn' : 'info');
  return { ok: true };
}

// -------------------------------------------------------------- politiques

export const policyDef = (s, id) => s.data.policies?.list.find((d) => d.id === id);
export function policySlots(s, pid) {
  const n = s.players[pid].techs.length;
  let slots = 0;
  for (const t of s.data.policies?.slots || []) if (n >= t.techs) slots = Math.max(slots, t.slots);
  return slots;
}
export const policyUnlocked = (s, pid, def) => !def.tech || s.players[pid].techs.includes(def.tech);
export const activePolicies = (s, pid) => (s.players[pid].policies || []).filter(Boolean).map((id) => policyDef(s, id)).filter(Boolean);

export function setPolicy(s, pid, slot, id) {
  const p = s.players[pid];
  p.policies = p.policies || [];
  if (slot < 0 || slot >= policySlots(s, pid)) return { ok: false, reason: 'Emplacement indisponible.' };
  const current = p.policies[slot] || null;
  if (current === id) return { ok: true };
  if (id) {
    const def = policyDef(s, id);
    if (!def || !policyUnlocked(s, pid, def)) return { ok: false, reason: 'Politique indisponible.' };
    if (p.policies.includes(id)) return { ok: false, reason: 'Politique déjà adoptée.' };
  }
  // Remplacer une politique coûte de l'Or ; remplir un emplacement vide ou le vider est gratuit.
  const cost = current && id ? s.data.policies.swapCost : {};
  if (!G.canAfford(s, pid, cost)) return { ok: false, reason: `Changer de politique coûte ${G.fmtBundle(s, cost)}.` };
  for (const [k, v] of Object.entries(cost)) p.res[k] -= v;
  p.policies[slot] = id || null;
  if (p.isHuman && id) G.log(s, `Nouvelle politique : ${policyDef(s, id).name}.`, [pid], 'good');
  return { ok: true };
}

// IA : remplit ses emplacements libres avec la politique la mieux notée selon son profil.
export function aiPolicies(s, pid) {
  const p = s.players[pid];
  const slots = policySlots(s, pid);
  p.policies = p.policies || [];
  const w = s.data.ai?.branchWeights?.[p.profile] || {};
  for (let i = 0; i < slots; i++) {
    if (p.policies[i]) continue;
    const opts = (s.data.policies?.list || []).filter((d) => policyUnlocked(s, pid, d) && !p.policies.includes(d.id))
      .map((d) => ({ d, v: (w[d.branch] || 1) + (d.tech ? 0.4 : 0) + s.rng.next() * 0.3 })).sort((a, b) => b.v - a.v);
    if (opts.length) setPolicy(s, pid, i, opts[0].d.id);
  }
}

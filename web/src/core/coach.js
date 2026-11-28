// Coach : analyse le tour en cours du joueur et propose les meilleures actions, chacune avec son « pourquoi »,
// pour apprendre les mécaniques en jouant. Lecture seule : ne modifie jamais la partie et ne consomme pas
// le hasard (les classements de l'IA sont appelés sans tirage aléatoire).
//
// Chaque conseil : { id, prio, kind: 'urgent' | 'next' | 'tip', title, text, action? }
//   action : { type: 'build', id, x, y } | { type: 'unit', id } | { type: 'city', id } | { type: 'panel', name }
import * as G from './game.js';
import * as SOC from './society.js';
import * as PEO from './people.js';
import { aiParams, buildPlan, bestTileFor, bestSite } from './ai.js';

const BRANCH = { economy: 'Économie', science: 'Science', culture: 'Culture', diplomacy: 'Diplomatie' };
const YIELD_NAME = { gold: 'Or', food: 'Nourriture', wood: 'Bois', stone: 'Pierre', science: 'Science', culture: 'Culture', planks: 'Planches', tools: 'Outils', goods: 'Biens' };
const PATH_WONDER = { science: 'observatory', culture: 'amphitheatre', economy: 'exchange', diplomacy: 'nations' };

const num = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const fmtYields = (y) => Object.entries(y || {}).filter(([, v]) => v).map(([k, v]) => `${v > 0 ? '+' : ''}${num(v)} ${YIELD_NAME[k] || k}`).join(', ');
// Effet d'une ressource rare, sans la phrase sur sa région d'origine.
const luxEffect = (r) => r.desc.replace(/^[^.]*\.\s*/, '').replace(/\s*tant que vous en avez\.?$/, '').replace(/\.$/, '');
const PATH_ADJ = { science: 'scientifique', culture: 'culturelle', economy: 'économique', diplomacy: 'diplomatique' };
const sum = (o) => Object.values(o || {}).reduce((a, v) => a + v, 0);
const turnsFor = (need, perTurn) => (perTurn > 0 ? Math.max(1, Math.ceil(need / perTurn)) : null);

export function coachAdvice(s, pid = 0, opts = {}) {
  const p = s.players[pid];
  const out = [];
  const add = (a) => out.push(a);
  const cities = G.citiesOf(s, pid);
  const y = p.lastYield?.net || {};
  const P = aiParams(s, pid);
  const w = P.branchWeights[p.profile] || { economy: 1, science: 1, culture: 1, diplomacy: 1 };
  const topBranch = Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
  const profileName = s.data.profilesById?.[p.profile]?.name || p.profile;
  const myUnits = s.units.filter((u) => u.owner === pid);
  const idle = (u) => !u.target && !u.sleep && u.skipTurn !== s.turn && u.movesLeft > 0;

  // ------------------------------------------------------------ première ville
  const settlers = myUnits.filter((u) => u.type === 'settler');
  if (!cities.length) {
    const u = settlers[0];
    if (u) add({ id: 'found-first', prio: 200, kind: 'urgent', title: 'Fondez votre capitale', text: 'Sans ville, rien ne se construit. Fondez-la tout de suite (touche F) : chaque tour perdu retarde toute la partie. Une case près d\'une rivière ou de la côte rapporte plus.', action: { type: 'unit', id: u.id } });
    return out;
  }

  // ------------------------------------------------------------ famine
  if ((y.food || 0) < 0) {
    const farm = bestTileFor(s, pid, 'farm');
    add({ id: 'famine', prio: 150, kind: 'urgent', title: `Nourriture en baisse (${num(y.food)}/tour)`,
      text: `Quand la réserve tombe à 0, votre plus grande ville perd un habitant à chaque tour. Construisez une Ferme${farm ? ' (la case proposée profite des bonus d\'adjacence)' : ''}, ou retirez un bâtiment qui consomme de la Nourriture.`,
      action: farm ? { type: 'build', id: 'farm', x: farm.tile.x, y: farm.tile.y } : null });
  }

  // ------------------------------------------------------------ recherche
  if (!p.research) {
    const opts = G.availableTechs(s, pid);
    if (opts.length) {
      const focus = P.researchFocus ?? 1;
      const best = opts.map((t) => ({ t, v: Math.pow(w[t.branch] || 1, focus) / G.techCost(s, pid, t.id) })).sort((a, b) => b.v - a.v)[0].t;
      const unlocks = s.data.buildings.filter((b) => b.tech === best.id).map((b) => b.name);
      const n = turnsFor(G.techCost(s, pid, best.id) - (p.sciencePool || 0), y.science || 0);
      add({ id: 'research', prio: 120, kind: 'urgent', title: `Choisissez une recherche : ${best.name}`,
        text: `Aucune recherche en cours : votre Science est perdue. ${best.name} (${BRANCH[best.branch]}${n ? `, environ ${n} tour${n > 1 ? 's' : ''}` : ''}) ${best.branch === topBranch ? `suit la voie de votre profil ${profileName}` : 'offre le meilleur rapport intérêt/coût pour votre profil en ce moment'}${unlocks.length ? ` et débloque ${unlocks.join(', ')}.` : `. ${best.desc || ''}`}`,
        action: { type: 'panel', name: 'tech' } });
    }
  }

  // ------------------------------------------------------------ colons et unités en attente
  for (const u of settlers.filter(idle)) {
    const site = bestSite(s, pid, u);
    const near = site && (site.river || G.neighbors(s, site.x, site.y).some((n) => n.river)) ? 'au bord d\'une rivière (Nourriture, Or, Moulin à eau)' : site && G.isCoastal(s, site) ? 'sur la côte (pêche, navires marchands)' : 'avec beaucoup de plaines et de prairies libres';
    add({ id: `settler-${u.id}`, prio: 110, kind: 'urgent', title: 'Un colon attend vos ordres',
      text: site ? `Bon emplacement repéré en (${site.x}, ${site.y}), ${near}. Une nouvelle ville agrandit votre territoire et multiplie vos rendements : c'est l'investissement le plus rentable du début de partie.` : 'Choisissez un emplacement libre, à distance des autres villes, de préférence près d\'une rivière ou de la côte.',
      action: { type: 'unit', id: u.id, x: site?.x, y: site?.y } });
  }
  const others = myUnits.filter((u) => u.type !== 'settler' && idle(u));
  if (others.length) {
    const u = others[0], def = G.unitDef(s, u.type);
    const why = { explorer: 'Explorer révèle les ruines (trésors), les merveilles naturelles et les bons emplacements de ville.', caravan: 'Envoyée vers une ville voisine, elle crée une route commerciale : Or chaque tour et meilleures relations.', ship: 'Un navire marchand ouvre une route maritime vers une ville côtière étrangère.', emissary: 'Dans une ville étrangère, il fonde une ambassade : relations en hausse et accès à la diplomatie avancée.', archaeologist: 'Il fouille les sites antiques pour en tirer des artefacts (Culture, tourisme).', agent: 'Un agent espionne ou protège vos villes.' }[u.type] || '';
    add({ id: 'idle-units', prio: 70, kind: 'next', title: others.length > 1 ? `${others.length} unités attendent des ordres` : `${def.name} sans ordre`,
      text: `${why} Mettez en veille les unités qui n'ont rien à faire, pour qu'elles ne vous soient plus signalées.`, action: { type: 'unit', id: u.id } });
  }

  // ------------------------------------------------------------ villes bloquées
  for (const c of cities) {
    const cap = G.cityPopCap(s, c);
    if (c.pop < cap) continue;
    const hc = SOC.healthCap(s, c);
    if (c.pop >= hc.cap && hc.needs) {
      const def = G.buildingDef(s, hc.needs);
      const ok = !def.tech || G.hasTech(s, pid, def.tech);
      const spot = ok && bestTileFor(s, pid, hc.needs);
      add({ id: `cap-${c.id}`, prio: 95, kind: 'next', title: `${c.name} plafonne à ${c.pop} habitants`,
        text: `Au-delà de ${hc.cap} habitants, une ville a besoin d'un ${def.name}${ok ? '' : ` (technologie ${G.techDef(s, def.tech).name})`}. Sans lui, elle ne grandit plus et perd en attractivité.`,
        action: spot ? { type: 'build', id: hc.needs, x: spot.tile.x, y: spot.tile.y } : (ok ? { type: 'city', id: c.id } : { type: 'panel', name: 'tech' }) });
      continue;
    }
    const next = s.rules.tiers[(c.tier || 0) + 1];
    if (next && c.pop >= next.minPop && !G.canAfford(s, pid, next.needs)) {
      const miss = Object.keys(next.needs).filter((k) => (p.res[k] || 0) < next.needs[k]);
      const prod = { goods: 'une Manufacture', tools: 'une Forge', planks: 'une Menuiserie' };
      add({ id: `tier-${c.id}`, prio: 90, kind: 'next', title: `${c.name} pourrait passer au palier ${next.name}`,
        text: `Il lui manque ${miss.map((k) => YIELD_NAME[k]).join(' et ')} (${G.fmtBundle(s, next.needs)} par tour). Produisez-les avec ${miss.map((k) => prod[k] || k).join(' et ')} : le palier rapporte ${fmtYields(next.yields)} et +${next.popCap} places de population.`,
        action: { type: 'city', id: c.id } });
      continue;
    }
    const spot = bestTileFor(s, pid, 'district');
    add({ id: `cap-${c.id}`, prio: 85, kind: 'next', title: `${c.name} est pleine (${c.pop}/${cap})`,
      text: 'Un Quartier résidentiel ajoute 3 places de population. Monter de palier (biens, outils) en ajoute aussi : une ville pleine gaspille sa Nourriture.',
      action: spot ? { type: 'build', id: 'district', x: spot.tile.x, y: spot.tile.y } : { type: 'city', id: c.id } });
  }

  // ------------------------------------------------------------ croissance lente
  if ((y.food || 0) >= 0 && (y.food || 0) < 2 && cities.some((c) => c.pop < G.cityPopCap(s, c))) {
    const farm = bestTileFor(s, pid, 'farm');
    if (farm) add({ id: 'grow', prio: 65, kind: 'next', title: 'Vos villes grandissent lentement',
      text: `Seulement ${num(y.food || 0)} Nourriture par tour : chaque habitant coûte ${s.rules.growthBase + s.rules.growthPerPop * Math.min(...cities.map((c) => c.pop))} Nourriture ou plus. Une Ferme de plus accélère la croissance, et plus d'habitants veut dire plus de rendements.`,
      action: { type: 'build', id: 'farm', x: farm.tile.x, y: farm.tile.y } });
  }

  // ------------------------------------------------------------ que construire
  const plan = buildPlan(s, pid, w, P.build, () => 0);
  const already = new Set(out.filter((a) => a.action?.type === 'build').map((a) => a.action.id));
  let shown = 0;
  for (const { def } of plan.scored) {
    if (shown >= 2) break;
    if (already.has(def.id)) continue;
    const cost = G.costOf(s, pid, def);
    if (!G.canAfford(s, pid, cost)) continue;
    const spot = bestTileFor(s, pid, def.id);
    if (!spot) continue;
    const reasons = [];
    if (def.yields?.food && (y.food || 0) < 2) reasons.push('la Nourriture manque');
    if (def.yields?.wood && ((y.wood || 0) < 3 || (p.res.wood || 0) < 20)) reasons.push('le Bois manque');
    if (def.yields?.stone && ((y.stone || 0) < 3 || (p.res.stone || 0) < 20)) reasons.push('la Pierre manque');
    if (plan.missingFor.has(def.id)) reasons.push(`il produit les matériaux de la merveille de votre voie (${G.buildingDef(s, PATH_WONDER[topBranch])?.name})`);
    if (def.profile) reasons.push(`bâtiment propre à votre profil ${profileName}`);
    if (def.wonder) reasons.push(`merveille : +${def.prestige} prestige, unique au monde`);
    else if (def.prestige) reasons.push(`+${def.prestige} prestige`);
    if (def.popCap) reasons.push(`+${def.popCap} places de population`);
    if (def.id === 'levee') reasons.push('protège vos villes riveraines des crues');
    if (def.id === 'granary') reasons.push('protège des sécheresses et des famines');
    if (def.id === 'aqueduct' || def.id === 'hospital') reasons.push('une de vos villes approche de son plafond de santé');
    if (def.id === 'markethall') reasons.push('permet de vendre vos surplus contre de l\'Or');
    if (def.id === 'museum') reasons.push('expose les artefacts de vos fouilles (Culture, tourisme)');
    if (def.id === 'lab' || def.id === 'campus') reasons.push('pôle savant : la Science accélère toute la suite');
    if (def.id === 'outpost' && spot.tile.luxury) reasons.push(`exploite ${s.data.resources[spot.tile.luxury].name} (${luxEffect(s.data.resources[spot.tile.luxury])})`);
    const adj = sum(spot.bonus) > 0 ? ` Sur la case proposée, ses voisins lui ajoutent ${fmtYields(spot.bonus)} (adjacence).` : '';
    const yields = def.process ? `transforme ${G.fmtBundle(s, def.process.in)} en ${G.fmtBundle(s, def.process.out)}` : fmtYields(def.yields);
    add({ id: `build-${def.id}`, prio: 60 - shown * 5, kind: 'next', title: `Construire : ${def.name}`,
      text: `${yields ? `${yields[0].toUpperCase()}${yields.slice(1)}. ` : ''}${reasons.length ? `Pourquoi : ${reasons.join(' ; ')}.` : `C'est le meilleur rendement accessible maintenant pour un ${profileName}.`}${adj} Coût : ${G.fmtBundle(s, cost)}.`,
      action: { type: 'build', id: def.id, x: spot.tile.x, y: spot.tile.y } });
    already.add(def.id); shown++;
  }

  // ------------------------------------------------------------ pollution
  for (const c of cities) {
    const pol = SOC.cityPollution(s, c).net;
    if (pol <= 0) continue;
    const park = bestTileFor(s, pid, 'park');
    add({ id: `pollution-${c.id}`, prio: 55, kind: 'next', title: `${c.name} est polluée (${num(pol)})`,
      text: 'Forges, manufactures et menuiseries polluent : la ville perd de la Nourriture, de la Culture et de l\'attractivité, et ses habitants partent vers des villes plus agréables. Un Parc ou des forêts proches absorbent la pollution.',
      action: park ? { type: 'build', id: 'park', x: park.tile.x, y: park.tile.y } : { type: 'city', id: c.id } });
    break;
  }

  // ------------------------------------------------------------ ressources rares non exploitées
  const lux = s.map.tiles.find((t) => t.owner === pid && t.luxury && !G.buildingAt(s, t.x, t.y));
  if (lux && !already.has('outpost')) {
    const r = s.data.resources[lux.luxury];
    const ok = G.canBuild(s, pid, 'outpost', lux.x, lux.y).ok && G.canAfford(s, pid, G.costOf(s, pid, G.buildingDef(s, 'outpost')));
    add({ id: 'luxury', prio: 50, kind: 'tip', title: `Ressource rare inexploitée : ${r.name}`,
      text: `Un Comptoir sur cette case produit ${r.name} chaque tour. Tant que vous en avez au moins une en stock : ${luxEffect(r)}. Chaque type différent rapporte aussi du prestige, et le surplus se vend cher.${ok ? '' : ' Il vous manque encore de quoi payer le Comptoir.'}`,
      action: ok ? { type: 'build', id: 'outpost', x: lux.x, y: lux.y } : { type: 'tile', x: lux.x, y: lux.y } });
  }

  // ------------------------------------------------------------ décisions en attente
  if (opts.freePolicies) add({ id: 'policies', prio: 78, kind: 'next', title: `${opts.freePolicies} emplacement${opts.freePolicies > 1 ? 's' : ''} de politique libre${opts.freePolicies > 1 ? 's' : ''}`, text: 'Une politique est un bonus permanent et gratuit : un emplacement vide est un bonus perdu à chaque tour. Choisissez celle qui sert votre voie de victoire.', action: { type: 'panel', name: 'policies' } });
  const greats = PEO.greatPeopleOf(s, pid);
  if (greats.length) add({ id: 'greats', prio: 75, kind: 'next', title: greats.length > 1 ? `${greats.length} grands personnages à employer` : 'Un grand personnage attend', text: 'Un grand personnage inutilisé ne rapporte rien : employez-le (fenêtre Personnages) pour un bonus immédiat ou durable.', action: { type: 'panel', name: 'people' } });
  const hand = (p.ambitions || []).filter((a) => !a.active);
  const active = (p.ambitions || []).filter((a) => a.active).length;
  if (hand.length && s.rules.ambitions?.cards && active < (s.rules.ambitions?.maxActive || 0)) {
    const best = hand.map((h) => s.rules.ambitions.cards.find((c) => c.id === h.id)).filter(Boolean).map((a) => { const [v, n] = PEO.ambitionProgress(s, pid, a); return { a, r: Math.min(1, v / Math.max(1, n)) }; }).sort((x, z) => z.r - x.r)[0];
    add({ id: 'ambition', prio: 35, kind: 'tip', title: 'Ambition à jouer (facultatif)', text: `Jouer une carte ne coûte rien et rapporte du prestige si vous remplissez l'objectif. La plus avancée : « ${best.a.name} » (${Math.round(best.r * 100)} %). Vous n'êtes jamais obligé de les jouer.`, action: { type: 'panel', name: 'people' } });
  }
  const pending = s.proposals.filter((q) => q.to === pid).length + (s.pendingEvents || []).filter((e) => e.pid === pid).length + (s.congress?.status === 'open' && s.congress.votes[pid] === undefined ? 1 : 0);
  if (pending) add({ id: 'pending', prio: 80, kind: 'next', title: `${pending} décision${pending > 1 ? 's' : ''} en attente`, text: 'Propositions de vos voisins, événements ou vote du Congrès : y répondre (panneau Infos) évite de froisser vos partenaires et peut rapporter gros.', action: { type: 'panel', name: 'side' } });

  // ------------------------------------------------------------ commerce et diplomatie
  const free = cities.find((c) => !c.trained);
  const routes = s.tradeRoutes.filter((r) => r.a === pid && !r.sea).length;
  if (free && routes < G.tradeRouteCap(s, pid) && !myUnits.some((u) => u.type === 'caravan') && G.canTrain(s, pid, free.id, 'caravan').ok && s.cities.some((c) => c.owner !== pid && p.explored[G.idx(s, c.x, c.y)])) {
    add({ id: 'caravan', prio: 45, kind: 'tip', title: `Route commerciale libre (${routes}/${G.tradeRouteCap(s, pid)})`, text: 'Formez une Caravane et envoyez-la vers une ville étrangère : chaque route rapporte de l\'Or à chaque tour, améliore les relations et compte pour le prestige.', action: { type: 'city', id: free.id } });
  }
  const noEmbassy = s.players.filter((q) => q.id !== pid && G.citiesOf(s, q.id).some((c) => p.explored[G.idx(s, c.x, c.y)]) && !G.hasEmbassy(s, pid, q.id));
  if (free && noEmbassy.length && !myUnits.some((u) => u.type === 'emissary') && G.canTrain(s, pid, free.id, 'emissary').ok) {
    add({ id: 'embassy', prio: 30, kind: 'tip', title: `Pas d'ambassade chez ${noEmbassy[0].name}`, text: 'Un Émissaire envoyé dans une de ses villes fonde une ambassade : meilleures relations, accords plus faciles, et c\'est le premier pas vers une alliance. Un seul suffit par voisin.', action: { type: 'city', id: free.id } });
  }

  // ------------------------------------------------------------ marché
  const halls = G.hallCount(s, pid);
  const surplus = ['wood', 'stone', 'planks', 'tools', 'goods', ...G.LUXURIES].filter((k) => (p.res[k] || 0) > (G.LUXURIES.includes(k) ? 6 : 80));
  if (surplus.length) {
    if (halls) add({ id: 'sell', prio: 40, kind: 'tip', title: 'Surplus à vendre', text: `Vous stockez beaucoup de ${surplus.slice(0, 3).map((k) => s.data.resources[k]?.name || k).join(', ')}. Vendez l'excédent à la Halle marchande (fenêtre Entrepôt) : l'Or finance colons, merveilles et achats.`, action: null });
    else if (G.hasTech(s, pid, 'commerce')) {
      const spot = bestTileFor(s, pid, 'markethall');
      if (spot && !already.has('markethall')) add({ id: 'markethall', prio: 40, kind: 'tip', title: 'Un surplus dort dans vos entrepôts', text: `Vous stockez beaucoup de ${surplus.slice(0, 3).map((k) => s.data.resources[k]?.name || k).join(', ')}. Une Halle marchande permet de les vendre contre de l'Or (et donne +1 Or par tour).`, action: { type: 'build', id: 'markethall', x: spot.tile.x, y: spot.tile.y } });
    }
  }

  // ------------------------------------------------------------ cap stratégique
  const vp = G.victoryProgress(s, pid);
  const path = ['science', 'culture', 'economy', 'diplomacy'].sort((a, b) => vp[b].pct - vp[a].pct)[0];
  const wonder = PATH_WONDER[path] && G.buildingDef(s, PATH_WONDER[path]);
  const owner = wonder ? s.wonders[wonder.id] : undefined;
  add({ id: 'strategy', prio: 20, kind: 'tip', title: `Cap : victoire ${PATH_ADJ[path]} ou prestige`,
    text: `Votre voie la plus avancée : ${vp[path].label} (${Math.round(vp[path].pct * 100)} %, ${vp[path].text}).${wonder ? (owner === pid ? '' : owner !== undefined ? ` Attention : ${wonder.name} appartient déjà à ${s.players[owner].name}, cette voie vous est fermée.` : ` Sa merveille clé : ${wonder.name}${wonder.tech && !G.hasTech(s, pid, wonder.tech) ? ` (technologie ${G.techDef(s, wonder.tech).name})` : ''}.`) : ''} Le prestige (${p.prestige}/${s.rules.prestigeTarget}) reste toujours une voie de secours.` });
  for (const q of s.players) {
    if (q.id === pid) continue;
    const qv = G.victoryProgress(s, q.id);
    // La jauge diplomatique monte vite avec les alliances alors que les élections comptent aussi : on la juge à part.
    const V = s.rules.victory, wins = q.secretaryWins || 0;
    const diploClose = wins >= V.secretaryWins - 1 || wins >= (V.allyAllElections ?? 1) - 1 && qv.diplomacy.pct >= 0.99;
    const k = ['science', 'culture', 'economy', 'prestige'].sort((a, b) => qv[b].pct - qv[a].pct)[0];
    if (diploClose && qv.diplomacy.pct >= 0.5) {
      add({ id: `threat-${q.id}`, prio: 100, kind: 'urgent', title: `${q.name} approche d'une victoire diplomatique`, text: `${qv.diplomacy.text}. Votez pour un autre candidat au Congrès et ne le laissez pas s'allier à tout le monde.`, action: { type: 'panel', name: 'diplo' } });
      break;
    }
    if (qv[k].pct >= 0.8) {
      add({ id: `threat-${q.id}`, prio: 100, kind: 'urgent', title: `${q.name} approche de la victoire`, text: `Voie ${qv[k].label} : ${Math.round(qv[k].pct * 100)} % (${qv[k].text}). Freinez-le : refusez-lui commerce et alliances, votez contre lui au Congrès, ou accélérez votre propre voie.`, action: { type: 'panel', name: 'diplo' } });
      break;
    }
  }
  if ((p.res.gold || 0) > 250 && !out.some((a) => a.kind === 'urgent')) add({ id: 'gold', prio: 25, kind: 'tip', title: `${Math.floor(p.res.gold)} Or en caisse`, text: 'L\'Or qui dort ne rapporte rien (sauf pour la victoire économique) : investissez-le dans un colon, une merveille ou des bâtiments qui rapportent chaque tour.' });

  return out.sort((a, b) => b.prio - a.prio);
}

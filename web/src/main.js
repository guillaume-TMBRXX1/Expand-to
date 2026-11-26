// Point d'entrée : chargement des données, écran de départ, boucle de jeu et interface.
import * as G from './core/game.js';
import * as D from './core/diversity.js';
import * as W from './core/world.js';
import * as ECO from './core/economy.js';
import * as SUM from './core/summits.js';
import * as CUL from './core/culture.js';
import * as SOC from './core/society.js';
import * as PEO from './core/people.js';
import * as LAND from './core/land.js';
import * as AGE from './core/ages.js';
import * as IND from './core/independents.js';
import * as MOV from './core/movements.js';
import { playAITurns } from './core/ai.js';
import { Renderer } from './render/renderer.js';
import { QUALITY, QUALITY_NAMES } from './render/postfx.js';
import { avatarSVG } from './ui/avatar.js';
import * as Saves from './ui/saves.js';
import * as Tuto from './ui/tutorial.js';
import * as Sound from './ui/sound.js';
import { lineChart } from './ui/charts.js';

const $ = (sel) => document.querySelector(sel);
const BRANCHES = { economy: 'Économie', science: 'Science', culture: 'Culture', diplomacy: 'Diplomatie' };
const BUILD_TABS = {
  prod: { label: 'Production', ids: ['farm', 'lumber', 'quarry', 'market', 'watermill', 'harbor', 'district', 'road'] },
  industry: { label: 'Industrie', ids: ['sawmill', 'manufactory', 'forge', 'outpost', 'markethall'] },
  know: { label: 'Savoir & culture', ids: ['library', 'lab', 'theatre', 'monument', 'museum'] },
  quarter: { label: 'Quartiers 2×2', ids: ['campus', 'artsquarter', 'merchantquarter'] },
  life: { label: 'Cadre de vie', ids: ['park', 'aqueduct', 'hospital', 'granary', 'levee'] },
  wonder: { label: 'Merveilles', ids: ['lighthouse', 'grandlibrary', 'observatory', 'amphitheatre', 'exchange', 'nations', 'granddome', 'crystalpalace', 'radiotower'] },
};

// Repères de carte : drapeaux de couleur et bâtiments prévus (fantômes), pour planifier quartiers et adjacences.
const MARKER_COLORS = { red: ['Rouge', '#e5484d'], blue: ['Bleu', '#3e8ed0'], yellow: ['Jaune', '#f5b700'], violet: ['Violet', '#8e4ec6'] };

let data, s, renderer;
let sel = null;          // { kind: 'unit'|'city'|'tile', id|i }
let mode = null;         // null | { type: 'build', id } | { type: 'road' } | { type: 'marker', color } | { type: 'marker', plan: id }
let buildTab = 'prod';
let hoverIdx = null;
let pendingMove = null; // { uid, x, y, plan } : déplacement en attente de confirmation
let confirmMoves = true;
try { confirmMoves = localStorage.getItem('expandto.confirmMoves') !== '0'; } catch { /* ignore */ }
let blockEnd = true; // la fin du tour attend que chaque unité ait reçu un ordre
try { blockEnd = localStorage.getItem('expandto.blockEnd') !== '0'; } catch { /* ignore */ }
// Unité en attente : à vous, pas encore déplacée ce tour, sans ordre en cours, ni en veille, ni « passée » pour ce tour.
const waitingUnits = () => (s?.units || []).filter((u) => u.owner === 0 && !u.target && !u.sleep && u.skipTurn !== s.turn && u.movesLeft >= G.unitMaxMoves(s, u) - 1e-6);
let showAdjacency = false; // touche A : bonus d'adjacence actifs sur la carte
// Barre de construction repliable (touche B) : repliée par défaut sur tablette pour laisser la carte visible.
let buildPref = null;
try { const v = localStorage.getItem('expandto.buildbar'); buildPref = v === null ? null : v === '1'; } catch { /* ignore */ }
const buildOpen = () => !!mode || (buildPref ?? !document.documentElement.classList.contains('compact'));
function toggleBuild(open = !buildOpen()) {
  buildPref = open;
  try { localStorage.setItem('expandto.buildbar', open ? '1' : '0'); } catch { /* ignore */ }
  if (!open && mode) setMode(null);
  renderBuildbar();
  if (open) $('#buildbar .tab[aria-selected="true"]')?.focus({ preventScroll: true });
  else $('#buildbar .build-fab')?.focus({ preventScroll: true });
}
const HAMMER = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M13.5 3.5l3 3-2 2 1.2 1.2 1.6-1.6 2.7 2.7-3 3-2.7-2.7 1-1-1.2-1.2L6 17.9a1.9 1.9 0 0 1-2.7-2.7l9.2-9.2z" fill="currentColor"/></svg>';

// ------------------------------------------------------------------ données
async function loadData() {
  const files = ['terrain', 'resources', 'buildings', 'units', 'techs', 'profiles', 'rules', 'ai', 'events', 'policies'];
  const raw = {};
  await Promise.all(files.map(async (f) => { raw[f] = await (await fetch(`data/${f}.json`)).json(); }));
  return G.indexData(raw);
}

// --------------------------------------------------------------- utilitaires
const fmt = (n) => Math.floor(n).toLocaleString('fr-FR');
const sign = (n) => (n >= 0 ? '+' : '') + (Math.abs(n) < 10 ? n.toFixed(1).replace('.0', '') : Math.round(n));
const resColor = (k) => data.resources[k].color;
const chips = (bundle, cls = '') => Object.entries(bundle || {}).map(([k, v]) => `<span class="chip ${cls}"><i style="background:${resColor(k)}"></i>${cls ? '+' : ''}${v} ${data.resources[k].name}</span>`).join('');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const me = () => s.players[0];
const tap = () => (window.matchMedia('(pointer: coarse)').matches ? 'touchez' : 'cliquez');
const Tap = () => (window.matchMedia('(pointer: coarse)').matches ? 'Touchez' : 'Cliquez');
const avatar = (p, size = 28) => avatarSVG({ color: p.color, profile: p.profile, skin: p.id, size, title: p.name });

function toast(text, tone = '') {
  if (tone === 'bad') Sound.sfx.bad();
  const el = document.createElement('div');
  el.className = tone; el.textContent = text;
  $('#toast').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, 2600);
}

function save() { Saves.saveTo('auto', s); }
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
function saveMeta(m) {
  if (!m) return '';
  const prof = data.profilesById[m.profile]?.name || '';
  const st = m.settings ? [data.rules.mapSizes[m.settings.size]?.name, data.rules.mapTypes[m.settings.mapType]?.name].filter(Boolean).join(' · ') : '';
  return [m.turn ? `Tour ${m.turn}` : '', prof, st, m.prestige !== undefined ? `${m.prestige} prestige` : '', m.savedAt ? fmtDate(m.savedAt) : ''].filter(Boolean).join(' · ');
}
async function importGame() {
  try { startGame(Saves.deserialize(await Saves.pickFile(), data)); closeModal(); toast('Partie importée.', 'good'); }
  catch (e) { toast(e.message || 'Fichier illisible.', 'bad'); }
}

// ------------------------------------------------------------ écran de départ
function showStart() {
  let profile = 'merchant';
  const el = $('#start');
  el.hidden = false;
  const saves = Saves.listSaves().filter((x) => !x.empty);
  const auto = saves.find((x) => x.key === 'auto' && !x.broken);
  const others = saves.filter((x) => x !== auto);
  const finished = renderFinishedGames();
  const touch = window.matchMedia('(pointer: coarse)').matches;
  el.innerHTML = `
    <div class="card start" role="main">
      <div class="start-left">
        <h1>Expand<span>-to</span></h1>
        <p class="lead">Explorez, bâtissez, commercez et négociez. Aucune armée : on gagne au <b>prestige</b>, ou en complétant une voie de victoire (science, culture, économie, diplomatie).</p>
        <div class="section-title" id="profiles-title">Profil de départ</div>
        <div class="profiles" role="radiogroup" aria-labelledby="profiles-title">
          ${data.profiles.map((p) => `<button class="profile" role="radio" aria-checked="${p.id === profile}" data-profile="${p.id}">${avatarSVG({ color: G.PLAYER_COLORS[0], profile: p.id, skin: 0, size: 48, title: p.name })}<div><b>${p.name}</b><span>${p.desc}</span><span class="prof-extra">${p.unique ? `Bâtiment : ${data.buildingsById[p.unique].name}` : ''}${p.ability ? ` · Capacité : ${p.ability.name}` : ''}</span></div></button>`).join('')}
        </div>
      </div>
      <div class="start-right">
        ${auto ? `<div class="resume"><div><b>Partie en cours</b><div class="muted">${esc(saveMeta(auto.meta))}</div></div><button class="btn" data-action="load-slot" data-slot="auto">Reprendre</button></div>` : ''}
        <div class="section-title">Nouvelle partie</div>
        <div class="start-row">
          <label class="field">Nom du dirigeant<input id="f-name" value="Vous" maxlength="18"></label>
          <label class="field">Difficulté<select id="f-diff" title="${esc(Object.values(data.ai.difficulty).map((d) => `${d.name} : ${d.desc || ''}`).join('\n'))}">${Object.entries(data.ai.difficulty).map(([k, d]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''} title="${esc(d.desc || '')}">${d.name}</option>`).join('')}</select></label>
          <label class="field">Taille de carte<select id="f-size">${Object.entries(data.rules.mapSizes).map(([k, v]) => `<option value="${k}" ${k === 'medium' ? 'selected' : ''}>${v.name} (${v.width}×${v.height})</option>`).join('')}</select></label>
          <label class="field">Adversaires IA<select id="f-ai"></select></label>
          <label class="field">Type de carte<select id="f-type">${Object.entries(data.rules.mapTypes).map(([k, v]) => `<option value="${k}" title="${esc(v.desc)}">${v.name}</option>`).join('')}</select></label>
          <label class="field">Durée<select id="f-length">${Object.entries(data.rules.gameLengths).map(([k, v]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
        </div>
        <div class="start-options">
          <label class="check" title="Chaque joueur reçoit des cartes d'objectif secrètes. Elles sont facultatives : jouez celles qui vous plaisent, ignorez les autres sans pénalité."><input type="checkbox" id="f-amb" checked> Ambitions secrètes (cartes facultatives)</label>
          <label class="check" title="Crues au printemps, sécheresses et incendies en été. Digue, Grenier et Aqueduc protègent vos villes."><input type="checkbox" id="f-dis" checked> Catastrophes naturelles</label>
        </div>
        <details class="start-more"><summary>Options avancées</summary>
          <label class="field">Graine de carte (même graine, même carte)<input id="f-seed" inputmode="numeric" placeholder="ex. 4242"></label>
        </details>
        <div class="start-actions">
          <label class="check"><input type="checkbox" id="f-tuto" checked> Tutoriel guidé</label>
          <button class="btn primary big" id="start-go">Lancer la partie</button>
        </div>
        <details class="start-more"><summary>Parties sauvegardées${others.length ? ` (${others.length})` : ''}</summary>${renderSaveList(others)}</details>
        ${finished ? `<details class="start-more"><summary>Dernières parties</summary>${finished}</details>` : ''}
        ${touch ? '' : `<details class="start-more"><summary>Commandes</summary><div class="help">
          Clic gauche : sélectionner / déplacer · glisser : déplacer la caméra · clic droit glissé : pivoter · molette : zoom ·
          <kbd>Entrée</kbd> finir le tour · <kbd>Échap</kbd> annuler · <kbd>Espace</kbd> unité suivante · <kbd>F</kbd> fonder · <kbd>R</kbd> route · <kbd>B</kbd> construire · <kbd>T</kbd> technologies · <kbd>D</kbd> diplomatie · <kbd>M</kbd> menu · <kbd>E</kbd> encyclopédie · <kbd>A</kbd> bonus d'adjacence · <kbd>K</kbd> repères · <kbd>G</kbd> personnages et ambitions</div></details>`}
      </div>
    </div>`;
  const fillAI = () => {
    const sz = data.rules.mapSizes[$('#f-size').value];
    const cur = Number($('#f-ai').value) || sz.defaultAI;
    $('#f-ai').innerHTML = Array.from({ length: sz.maxAI - 1 }, (_, k) => k + 2).map((n) => `<option ${n === Math.min(cur, sz.maxAI) ? 'selected' : ''}>${n}</option>`).join('');
  };
  $('#f-size').addEventListener('change', () => { $('#f-ai').value = ''; fillAI(); });
  fillAI();
  el.querySelectorAll('.profile').forEach((b) => b.addEventListener('click', () => {
    profile = b.dataset.profile;
    el.querySelectorAll('.profile').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  $('#start-go').addEventListener('click', () => {
    const seedTxt = $('#f-seed').value.trim();
    const seed = seedTxt ? (Number(seedTxt) || [...seedTxt].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) >>> 0 : undefined;
    const game = G.createGame({ data, seed, profile, name: $('#f-name').value.trim() || 'Vous', aiCount: Number($('#f-ai').value), difficulty: $('#f-diff').value,
      size: $('#f-size').value, mapType: $('#f-type').value, length: $('#f-length').value, ambitions: $('#f-amb').checked, disasters: $('#f-dis').checked });
    Tuto.initTutorial(game, $('#f-tuto').checked);
    startGame(game);
  });
}

function renderFinishedGames() {
  const list = Saves.finishedGames();
  if (!list.length) return '';
  return `<div class="saves">${list.map((g) => `<div class="save-row"><div><b>${g.won ? 'Victoire' : 'Défaite'}</b> <span class="muted">· ${esc(g.reason || '')}</span>
    <div class="muted">${esc([data.profilesById[g.profile]?.name, g.size && data.rules.mapSizes[g.size]?.name, g.mapType && data.rules.mapTypes[g.mapType]?.name, `${g.turns} tours`, `${g.prestige} prestige`, `${g.rank}${g.rank === 1 ? 'er' : 'e'} sur ${g.players}`, fmtDate(g.date)].filter(Boolean).join(' · '))}</div></div></div>`).join('')}</div>`;
}

function renderSaveList(saves = Saves.listSaves().filter((x) => !x.empty)) {
  return `<div class="saves"><div class="section-title"><span>Emplacements</span><button class="btn small ghost" data-action="import">Importer un fichier</button></div>
    ${saves.length ? saves.map((x) => `<div class="save-row"><div><b>${x.label}</b><div class="muted">${x.broken ? 'Sauvegarde illisible' : esc(saveMeta(x.meta))}</div></div>
      <div class="row"><button class="btn small" data-action="load-slot" data-slot="${x.key}" ${x.broken ? 'disabled' : ''}>Reprendre</button>
      <button class="btn small ghost" data-action="delete-slot" data-slot="${x.key}" aria-label="Supprimer ${x.label}">Supprimer</button></div></div>`).join('')
      : '<div class="muted" style="font-size:13px">Aucune partie sauvegardée pour le moment.</div>'}</div>`;
}

function startGame(state) {
  s = state;
  $('#start').hidden = true;
  for (const id of ['#topbar', '#side', '#buildbar']) $(id).hidden = false;
  $('#summary').hidden = true;
  applyLayout();
  renderer.setState(s, 0);
  tradeKey = ''; setTimeout(() => updateTradeLines(true), 0);
  sel = null; mode = null;
  const u = s.units.find((x) => x.owner === 0 && x.type === 'settler') || s.units.find((x) => x.owner === 0);
  const c = G.citiesOf(s, 0)[0];
  const focus = c || u;
  if (focus) renderer.focus(focus.x, focus.y, true);
  if (u && !c) select({ kind: 'unit', id: u.id });
  save();
  renderAll();
  if (s.winner) showEnd();
}

// ------------------------------------------------------------------ rendu UI
function renderAll() {
  renderTop(); renderStock(); renderSide(); renderSelection(); renderBuildbar(); renderHighlights(); renderTutorial(); drawMinimap(); updateTradeLines();
}

// ---------------------------------------------------------------- tutoriel
function renderTutorial() {
  const el = $('#tutorial');
  const passed = Tuto.advance(s);
  if (passed) toast(`Étape réussie : ${passed}`, 'good');
  const t = s.tutorial;
  if (!t?.active) { el.hidden = true; return; }
  const step = Tuto.STEPS[t.step];
  el.hidden = false;
  el.innerHTML = `<div class="section-title"><span>Tutoriel · ${t.step + 1} / ${Tuto.STEPS.length}</span><button class="btn small ghost" data-action="tuto-skip">Passer</button></div>
    <h3>${step.title}</h3><p>${step.text}</p>
    <div class="tuto-bar"><div style="width:${(t.step / Tuto.STEPS.length) * 100}%"></div></div>
    ${step.final ? '<button class="btn small primary" data-action="tuto-finish">Terminer le tutoriel</button>' : ''}`;
}

// ---------------------------------------------------------------- mini-carte
function drawMinimap() {
  const cv = $('#minimap canvas');
  if (!cv || !s) return;
  const W = s.map.width, H = s.map.height;
  const scale = Math.floor(cv.clientWidth / W) || 7;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== W * scale * dpr) { cv.width = W * scale * dpr; cv.height = H * scale * dpr; cv.style.height = `${H * scale}px`; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const p = me();
  ctx.fillStyle = '#e4dcd6'; ctx.fillRect(0, 0, W * scale, H * scale);
  s.map.tiles.forEach((t, i) => {
    if (!p.explored[i]) return;
    ctx.fillStyle = data.terrain[t.type].color;
    ctx.fillRect(t.x * scale, t.y * scale, scale, scale);
    if (t.owner !== -1) { ctx.globalAlpha = 0.45; ctx.fillStyle = s.players[t.owner].color; ctx.fillRect(t.x * scale, t.y * scale, scale, scale); ctx.globalAlpha = 1; }
  });
  for (const c of s.cities) {
    if (!p.explored[c.y * W + c.x]) continue;
    ctx.fillStyle = '#fff'; ctx.fillRect(c.x * scale - 1, c.y * scale - 1, scale + 2, scale + 2);
    ctx.fillStyle = s.players[c.owner].color; ctx.fillRect(c.x * scale + 1, c.y * scale + 1, scale - 2, scale - 2);
  }
  for (const u of s.units) if (u.owner === 0) { ctx.fillStyle = '#2f2a33'; ctx.beginPath(); ctx.arc((u.x + 0.5) * scale, (u.y + 0.5) * scale, scale / 3, 0, Math.PI * 2); ctx.fill(); }
  const fp = renderer.viewFootprint();
  if (fp) {
    ctx.strokeStyle = '#2f2a33'; ctx.lineWidth = 1.5; ctx.beginPath();
    fp.forEach(([x, y], k) => (k ? ctx.lineTo((x + 0.5) * scale, (y + 0.5) * scale) : ctx.moveTo((x + 0.5) * scale, (y + 0.5) * scale)));
    ctx.closePath(); ctx.stroke();
  }
}

// ---------------------------------------------------------- résumé du tour
function snapshot() {
  const p = me();
  return { res: { ...p.res }, science: p.sciencePool, culture: p.cultureTotal, prestige: p.prestige, techs: p.techs.length, logLen: s.log.length, turn: s.turn };
}
function showSummary(before) {
  const p = me();
  const el = $('#summary');
  const delta = (a, b) => b - a;
  const gains = [...G.STOCK.map((k) => [data.resources[k].name, resColor(k), delta(before.res[k], p.res[k])]),
    ['Culture', resColor('culture'), delta(before.culture, p.cultureTotal)], ['Prestige', 'var(--accent)', delta(before.prestige, p.prestige)]];
  const events = s.log.filter((l) => l.turn === before.turn && (!l.who || l.who.includes(0))).slice(-5).reverse();
  el.innerHTML = `<div class="section-title"><span>Tour ${before.turn} terminé</span><button class="btn small ghost" data-action="summary-close" aria-label="Fermer le résumé">Fermer</button></div>
    <div class="chips summary-gains">${gains.filter(([, , v]) => Math.round(v) !== 0).map(([n, c, v]) => `<span class="chip yield"><i style="background:${c}"></i>${v > 0 ? '+' : ''}${Math.round(v)} ${n}</span>`).join('') || '<span class="muted">Aucun changement.</span>'}</div>
    ${events.length ? `<ul>${events.map((l) => `<li class="${l.kind}">${esc(l.text)}</li>`).join('')}</ul>` : ''}`;
  el.hidden = false;
  clearTimeout(showSummary.timer);
  showSummary.timer = setTimeout(() => { el.hidden = true; }, 9000);
}

function renderWaitBadge() {
  const b = $('#wait-badge');
  if (!b) return;
  const n = blockEnd ? waitingUnits().length : 0;
  b.hidden = n === 0; b.textContent = n;
  b.closest('button').title = n ? `${n} unité(s) attendent vos ordres avant la fin du tour` : 'Fin du tour (Entrée)';
}
function renderTop() {
  renderWaitBadge();
  const p = me();
  const y = G.computeYields(s, 0);
  const items = ['gold', 'food', 'wood', 'stone'].map((k) => {
    const tip = `${data.resources[k].name} : production ${y.gross[k].toFixed(1)} × ${Math.round(y.mult[k] * 100)}%${k === 'gold' && y.upkeep ? ` − entretien ${y.upkeep}` : ''}${k === 'food' ? ` − consommation ${y.consumption}` : ''}`;
    return `<span class="res" title="${tip}"><i style="background:${resColor(k)}"></i><b>${fmt(p.res[k])}</b><small class="${y.net[k] < 0 ? 'neg' : ''}">${sign(y.net[k])}</small></span>`;
  });
  const research = p.research ? G.techDef(s, p.research) : null;
  const rCost = research ? G.techCost(s, 0, research.id) : 0;
  items.push(`<span class="res res-sci" title="${research ? `Recherche : ${esc(research.name)} — ${fmt(p.sciencePool)} / ${rCost} science` : 'Aucune recherche : choisissez-en une (T)'}"><i style="background:${resColor('science')}"></i><b>${research ? `<span class="res-research">${research.name}</span> ${fmt(p.sciencePool)}/${rCost}` : `${fmt(p.sciencePool)} · à choisir`}</b><small>${sign(y.net.science)}</small>${research ? `<span class="res-prog" aria-hidden="true"><span style="width:${Math.min(100, Math.round((p.sciencePool / rCost) * 100))}%"></span></span>` : ''}</span>`);
  items.push(`<span class="res" title="Culture totale (1 prestige / ${s.rules.prestige.culturePerPoint}). Tourisme : ${y.tourism || 0} par tour. Influence culturelle : ${Math.floor(p.influence || 0)} / ${W.influenceCost(s, 0)} pour annexer la prochaine case."><i style="background:${resColor('culture')}"></i><b>${fmt(p.cultureTotal)}</b><small>${sign(y.net.culture)}</small></span>`);
  const stockTotal = [...G.GOODS, ...G.LUXURIES].reduce((a, k) => a + Math.floor(p.res[k] || 0), 0);
  items.push(`<button class="res res-btn" data-action="stock" title="Entrepôt : biens transformés et ressources rares" aria-expanded="${!$('#stock').hidden}"><i style="background:${resColor('goods')}"></i><b><span class="lbl-long">Entrepôt</span><span class="lbl-short">Stock</span></b><small>${stockTotal}</small></button>`);
  items.push(`<span class="res" title="Prestige — objectif de victoire"><i style="background:var(--accent)"></i><b>${p.prestige}<span class="pt-target"> / ${s.rules.prestigeTarget}</span></b><small class="lbl-long">prestige</small><small class="lbl-short">★</small></span>`);
  $('#resources').innerHTML = items.join('');
  const season = SOC.seasonOf(s);
  Sound.music.setMood(season?.id, s.rules.eras ? AGE.eraOf(s, 0) : 0); // l'humeur suit la saison, les instruments l'ère
  $('#turn').textContent = `Tour ${s.turn} / ${s.rules.turnLimit}${season ? ` · ${season.icon} ${season.name}` : ''}${s.rules.eras ? ` · ${AGE.eraName(s, 0)}` : ''}`;
  $('#turn').title = season ? `${season.name} : ${Object.entries(season.yieldPct).map(([k, v]) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} % ${data.resources[k].name}`).join(', ')}${season.northMove ? ', déplacements plus lents au nord' : ''}. Encore ${SOC.seasonTurnsLeft(s)} tour(s).${eraTip()}` : '';
  const short = document.querySelector('[data-action="end-turn"] .lbl-short');
  if (short) short.textContent = `Fin du tour ${s.turn}/${s.rules.turnLimit}`;
}

function eraTip() {
  if (!s.rules.eras) return '';
  const e = AGE.eraOf(s, 0), next = AGE.eraDef(s, e + 1);
  return `\nÈre : ${AGE.eraDef(s, e).name} (${me().techs.length} technologies).${next ? ` ${next.name} à ${next.techs} technologies.` : ''}`;
}

// Seuil de vente automatique choisi par ressource (gardé même quand la vente auto est coupée).
// Les ressources rares gardent au moins 1 unité, sinon leur bonus s'arrête.
const sellMin = (k) => (G.LUXURIES.includes(k) ? 1 : 0);
function sellKeep(k) {
  const p = me();
  return p.autoSell?.[k] ?? p.autoSellPref?.[k] ?? s.rules.market.autoSellKeep;
}
function setSellKeep(k, v) {
  const p = me();
  v = Math.max(sellMin(k), Math.min(995, v));
  p.autoSellPref = { ...(p.autoSellPref || {}), [k]: v };
  if (p.autoSell?.[k] !== undefined) G.setAutoSell(s, 0, k, v);
}

function renderStock() {
  const el = $('#stock');
  if (el.hidden) return;
  const p = me();
  const y = G.computeYields(s, 0);
  const active = new Set(G.activeLuxuries(s, 0));
  const canSell = G.hallCount(s, 0) > 0;
  const auto = p.autoSell || {};
  const spark = (k) => {
    const h = s.world?.history?.[k] || [];
    if (h.length < 2) return '';
    const max = Math.max(1.6, ...h), min = Math.min(0.4, ...h);
    const pts = h.map((v, i) => `${(i / (h.length - 1)) * 54},${16 - ((v - min) / (max - min)) * 14}`).join(' ');
    const up = h[h.length - 1] >= h[0];
    return `<svg class="spark" viewBox="-1 0 56 18" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? 'var(--good)' : 'var(--bad)'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  };
  const marketTags = (k) => {
    const f = ECO.worldFactor(s, k), h = s.world?.history?.[k] || [];
    const prev = h.length > 3 ? h[h.length - 4] : f;
    const trend = f > prev * 1.05 ? '▲' : f < prev * 0.95 ? '▼' : '';
    const b = s.world?.bubble;
    const m = ECO.monopolist(s, k);
    return `<span class="mk-tags"><span class="muted" title="Cours mondial (1 = prix de référence)">cours ${f.toFixed(2).replace('.', ',')}${trend ? ` ${trend}` : ''}</span>${spark(k)}`
      + (b && b.res === k ? `<span class="tag ${b.phase === 'rise' ? 'warn' : 'bad'}">${b.phase === 'rise' ? 'Bulle !' : 'Krach'}</span>` : '')
      + (m !== null ? `<span class="tag ${m === 0 ? 'good' : 'neutral'}" title="Seul producteur : prix de vente +${Math.round(s.rules.economy.monopolyBonus * 100)} %">Monopole : ${m === 0 ? 'vous' : esc(s.players[m].name)}</span>` : '') + '</span>';
  };
  const sellBar = (k) => {
    if (!canSell) return '';
    const stock = Math.floor(p.res[k] || 0);
    const q5 = G.quoteSale(s, 0, k, Math.min(5, stock)).gold, q10 = G.quoteSale(s, 0, k, Math.min(10, stock)).gold;
    const price = G.unitPrice(s, 0, k);
    const cb = ECO.canBuy(s, 0, k), qb = ECO.quoteBuy(s, 0, k, 5).gold;
    const buyWhy = !cb.ok ? cb.reason : p.res.gold < qb ? `Il faut ${qb} Or pour acheter 5 ${data.resources[k].name}.` : '';
    return `<div class="mk-row">${marketTags(k)}<span class="muted">${price.toFixed(1).replace('.', ',')} Or/u</span></div>
      <div class="trade-row">
      <button class="btn small buy" data-action="buy" data-res="${k}" data-qty="5" ${buyWhy ? `aria-disabled="true" data-why="${esc(buyWhy)}"` : ''} title="${buyWhy ? esc(buyWhy) : `Acheter 5 au marché mondial : ${qb} Or`}">${cb.ok ? `Acheter 5 · ${qb} Or` : 'Pas en vente'}</button>
      <button class="btn small" data-action="sell" data-res="${k}" data-qty="5" ${stock >= 1 ? '' : `disabled data-why="Rien à vendre : votre stock est vide."`} title="Vendre 5 : +${q5} Or">Vendre 5 · +${q5}</button>
      <button class="btn small" data-action="sell" data-res="${k}" data-qty="10" ${stock >= 1 ? '' : `disabled data-why="Rien à vendre : votre stock est vide."`} title="Vendre 10 : +${q10} Or">10 · +${q10}</button></div>
      <div class="sell-row">
      <span class="auto-sell"><label class="check small" title="Chaque fin de tour, vendre tout ce qui dépasse le seuil"><input type="checkbox" data-action="autosell" data-res="${k}" ${auto[k] !== undefined ? 'checked' : ''}> auto au-delà de</label>
      <span class="stepper" role="group" aria-label="Seuil de vente automatique de ${data.resources[k].name}">
        <button class="btn small" data-action="autosell-step" data-res="${k}" data-step="-5" aria-label="Baisser le seuil">−</button>
        <b class="stepper-val">${sellKeep(k)}</b>
        <button class="btn small" data-action="autosell-step" data-res="${k}" data-step="5" aria-label="Monter le seuil">+</button></span></span></div>`;
  };
  const row = (k) => `<div class="stock-row"><span><i style="background:${resColor(k)}"></i>${data.resources[k].name}</span><b>${fmt(p.res[k] || 0)}</b><small class="${(y.net[k] || 0) < 0 ? 'neg' : ''}">${sign(y.net[k] || 0)}</small></div>${sellBar(k)}`;
  el.innerHTML = `<div class="section-title stock-head"><span>Entrepôt</span><button class="btn small" data-action="stock">Fermer</button></div>
    ${canSell ? `<p class="muted" style="font-size:12px;margin:0 0 4px">Marché mondial : les cours sont communs à tous les joueurs. Chaque vente fait baisser le cours, chaque achat le fait monter, et il revient peu à peu selon la rareté. Votre Halle vend à ${Math.round(G.sellRate(s, 0) * 100)} % du cours${ECO.inLeague(s, 0) ? ` (+${Math.round(s.rules.league.sellBonus * 100)} % grâce à la Ligue)` : ''}.</p>` : '<p class="muted" style="font-size:12px;margin:0 0 4px">Construisez une <b>Halle marchande</b> (onglet Industrie, technologie Commerce) pour vendre vos surplus contre de l\'Or.</p>'}
    <div class="stock-group">Biens transformés</div>${G.GOODS.map(row).join('')}
    ${canSell ? `<div class="stock-group">Matériaux</div>${['wood', 'stone', 'food'].map(row).join('')}` : ''}
    <div class="stock-group">Ressources rares</div>${G.LUXURIES.map((k) => row(k) + `<div class="stock-desc ${active.has(k) ? 'good' : ''}">${active.has(k) ? 'Actif : ' : ''}${data.resources[k].desc}</div>`).join('')}
    <p class="muted" style="font-size:12px;margin:8px 0 0">Chaque ressource rare active rapporte aussi ${s.rules.luxuries.diversityPrestige} prestige. Échangez-les en Diplomatie.</p>`;
  softDisable(el);
}

// ---------------------------------------------------------- mise en page tablette
// Écrans ≤ 1366 px ou tactiles : panneau de droite en tiroir (bouton « Infos »), cibles plus grandes.
const compactQuery = window.matchMedia('(max-width: 1366px), (pointer: coarse)');
const portraitQuery = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
let rotateDismissed = false;
function applyLayout() {
  const root = document.documentElement;
  root.classList.toggle('compact', compactQuery.matches);
  root.classList.toggle('touch', window.matchMedia('(pointer: coarse)').matches);
  if (!compactQuery.matches) root.classList.remove('side-open');
  $('#rotate').hidden = !(portraitQuery.matches && s && !rotateDismissed);
  const t = $('.side-toggle'); if (t) t.setAttribute('aria-expanded', String(root.classList.contains('side-open')));
  setTimeout(() => renderer?.resize(), 50);
}
function setSide(open) {
  document.documentElement.classList.toggle('side-open', open);
  $('.side-toggle')?.setAttribute('aria-expanded', String(open));
  if (open) drawMinimap();
}
function updateSideBadge() {
  const n = s.proposals.filter((p) => p.to === 0).length + myEvents().length + myContracts().filter((c) => c.status === 'offered').length
    + (s.congress?.status === 'open' && s.congress.votes[0] === undefined ? 1 : 0) + (crisisPending() ? 1 : 0) + (expoPending() ? 1 : 0);
  const b = $('#side-badge');
  b.hidden = n === 0; b.textContent = n;
  const free = freePolicySlots();
  const pb = $('#policy-badge');
  if (pb) { pb.hidden = free === 0; pb.textContent = free; }
  const gb = $('#people-badge');
  if (gb) { const n = PEO.greatPeopleOf(s, 0).length; gb.hidden = n === 0; gb.textContent = n; }
}

const myEvents = () => (s.pendingEvents || []).filter((pe) => pe.pid === 0);
const myContracts = () => (s.contracts || []).filter((c) => c.to === 0);
const crisisPending = () => s.crisis?.status === 'open' && s.crisis.pledges[0] === undefined;
function contractCards() {
  return myContracts().map((c) => {
    const from = s.players[c.from], r = data.resources[c.res];
    const have = Math.floor(me().res[c.res] || 0);
    const reward = `+${c.gold} Or, +${c.relation} relation, +${c.prestige} prestige`;
    if (c.status === 'offered') {
      return `<div class="card proposal contract" style="border-left-color:${from.color}"><div class="proposal-head">${avatar(from, 34)}<p><b>${esc(from.name)}</b> propose un <b>contrat</b> : livrer <b>${c.qty} ${r.name}</b> en ${s.rules.contracts.duration} tours. Récompense : ${reward}. Ne pas livrer coûte ${s.rules.contracts.failRelation} relation. <span class="muted">(stock : ${have})</span></p></div>
        <div class="row"><button class="btn small primary" data-action="contract-accept" data-id="${c.id}">Accepter</button><button class="btn small" data-action="contract-decline" data-id="${c.id}">Refuser</button></div></div>`;
    }
    const left = c.deadline - s.turn;
    return `<div class="card proposal contract active" style="border-left-color:${from.color}"><div class="event-head"><b>Contrat pour ${esc(from.name)}</b><span class="muted">${left > 0 ? `${left} tour(s) restant(s)` : 'Dernier tour'}</span></div>
      <p>Livrer <b>${c.qty} ${r.name}</b> (stock : ${have}). ${reward}.</p>
      <div class="row"><button class="btn small ${have >= c.qty ? 'primary' : ''}" data-action="contract-deliver" data-id="${c.id}" ${have >= c.qty ? '' : 'aria-disabled="true"'}>Livrer</button></div></div>`;
  }).join('');
}
const expoPending = () => s.expo && s.expo.status === 'open' && s.expo.entries[0] === undefined;
function expoCard() {
  if (!s.expo) return '';
  const def = SUM.expoDef(s);
  return `<div class="card proposal expo-card"><div class="event-head"><b>${esc(def.name)}</b><span class="muted">tour ${s.expo.turn}</span></div><p>${s.expo.entries[0] === undefined ? 'Candidatures et inscriptions ouvertes.' : 'Votre participation est enregistrée.'}</p><div class="row"><button class="btn small ${expoPending() ? 'primary' : ''}" data-action="expo">Voir</button></div></div>`;
}
function crisisCard() {
  if (!s.crisis) return '';
  const def = W.crisisDef(s);
  if (crisisPending()) return `<div class="card proposal crisis"><div class="event-head"><b>Crise mondiale : ${esc(def.name)}</b></div><p>${esc(def.text)}</p><div class="row"><button class="btn small primary" data-action="crisis">Congrès extraordinaire</button></div></div>`;
  if (W.crisisActive(s)) return `<div class="resolution crisis-line">Crise : <b>${esc(def.name)}</b> <span class="muted">${s.crisis.status === 'open' ? 'en attente des contributions' : `jusqu'au tour ${s.crisis.until}`}</span></div>`;
  return '';
}
const freePolicySlots = () => {
  const slots = D.policySlots(s, 0), pol = me().policies || [];
  const unlocked = (data.policies?.list || []).filter((d) => D.policyUnlocked(s, 0, d) && !pol.includes(d.id)).length;
  return Math.min(unlocked, Math.max(0, slots - pol.filter(Boolean).length));
};
function eventCards() {
  return myEvents().map((pe) => {
    const ev = D.eventDef(s, pe.ev);
    const left = data.events.expireAfter - (s.turn - pe.turn);
    return `<div class="card proposal event"><div class="event-head"><b>${esc(ev.title)}</b><span class="muted">${left > 1 ? `${left} tours pour décider` : 'Dernier tour pour décider'}</span></div>
      <p>${esc(D.eventText(s, pe))}</p><div class="event-choices">${ev.choices.map((ch, k) => {
        const ok = D.canPay(s, 0, ch);
        return `<button class="btn small ${k === 0 ? 'primary' : ''}" data-action="event-choice" data-id="${pe.id}" data-choice="${k}" ${ok ? '' : 'aria-disabled="true"'} title="${ok ? '' : 'Ressources insuffisantes'}"><b>${esc(ch.label)}</b><span>${esc(D.describeEffects(s, ch))}</span></button>`;
      }).join('')}</div></div>`;
  }).join('');
}

function renderSide() {
  updateSideBadge();
  const ranked = [...s.players].sort((a, b) => b.prestige - a.prestige);
  const resol = G.activeResolutions(s).map((r) => `<div class="resolution">${esc(s.rules.congress.resolutions[r.id].name)}${r.target !== null && r.target !== undefined ? ` · ${esc(s.players[r.target].name)}` : ''} <span class="muted">jusqu'au tour ${r.until}</span></div>`).join('');
  const congressOpen = s.congress?.status === 'open' && s.congress.votes[0] === undefined;
  $('#scoreboard').innerHTML = `<div class="section-title"><span>Prestige</span><span>${s.rules.prestigeTarget}</span></div>
    <div class="score-actions"><button class="btn small" data-action="victory">Voies de victoire</button><button class="btn small" data-action="culture" title="Œuvres d'art, patrimoine mondial, tourisme et défis scientifiques (C)">Culture</button>
    <button class="btn small ${congressOpen ? 'primary' : ''}" data-action="congress" title="Congrès mondial tous les ${s.rules.congress.every} tours">${congressOpen ? 'Voter au Congrès' : `Congrès · tour ${Math.ceil((s.turn + (s.turn % s.rules.congress.every === 0 ? 1 : 0)) / s.rules.congress.every) * s.rules.congress.every}`}</button></div>
    ${(s.standards || []).map((st) => `<div class="resolution" title="${esc(s.rules.standards.find((d) => d.id === st.id).desc)}">Norme : ${esc(s.rules.standards.find((d) => d.id === st.id).name)} <span class="muted">${st.members.includes(0) ? '(signataire)' : `(${st.members.length} pays)`}</span></div>`).join('')}
    ${s.secretary !== null && s.secretary !== undefined ? `<div class="resolution">Secrétaire du Congrès : <b>${esc(s.players[s.secretary].name)}</b></div>` : ''}${resol}` + ranked.map((p) => `
    <div class="score-row" title="${Object.entries(p.prestigeBreakdown).map(([k, v]) => `${k} : ${v}`).join(' · ')}">
      ${avatar(p, 28)}<span>${esc(p.name)} <span class="muted">· ${data.profilesById[p.profile].name}</span></span><b>${p.prestige}</b>
      <div class="bar"><div style="width:${Math.min(100, (p.prestige / s.rules.prestigeTarget) * 100)}%;background:${p.color}"></div></div>
    </div>`).join('');
  const props = s.proposals.filter((p) => p.to === 0);
  $('#proposals').innerHTML = crisisCard() + expoCard() + eventCards() + contractCards() + props.map((pr) => {
    const from = s.players[pr.from];
    const text = {
      treaty: `<b>${esc(from.name)}</b> propose un <b>traité</b> de ${pr.payload.duration} tours : ${(pr.payload.clauses || []).map((c) => `<b>${s.rules.treaties.clauses[c].name}</b> (${s.rules.treaties.clauses[c].desc})`).join(' ; ')}. +${s.rules.treaties.relationPerTurn} relation par tour, +${s.rules.treaties.prestige} prestige.`,
      league: `<b>${esc(from.name)}</b> vous invite dans la <b>Ligue marchande</b> : cotisation de ${s.rules.league.dues} Or par tour, +${s.rules.league.routeGold} Or et +${s.rules.league.routePrestige} prestige par route entre membres, ventes à la Halle +${Math.round(s.rules.league.sellBonus * 100)} %. Un conflit ouvert avec un membre ou un contrat non honoré vaut l'exclusion.`,
      promise: `<b>${esc(from.name)}</b> vous demande de <b>promettre</b> de ne plus fonder de ville près de ses frontières. Rompre une promesse coûte très cher (${s.rules.promise.breakPenalty} relation, et les autres l'apprennent).`,
      project: `<b>${esc(from.name)}</b>, votre allié, propose un <b>projet commun</b> : ${G.fmtBundle(s, s.rules.jointProject.cost)} chacun, puis +${s.rules.jointProject.prestige} prestige et ${chipsText(s.rules.jointProject.yields)} par tour pour les deux.`,
      agreement: `<b>${esc(from.name)}</b> propose un accord commercial (+${s.rules.tradeAgreement.gold} Or/tour chacun, relation +${s.rules.tradeAgreement.relationPerTurn}/tour).`,
      alliance: `<b>${esc(from.name)}</b> propose une alliance (+${Math.round(s.rules.alliance.pct * 100)}% Or, Science et Culture).`,
      exchange: `<b>${esc(from.name)}</b> offre ${G.fmtBundle(s, pr.payload.give || {})} contre ${G.fmtBundle(s, pr.payload.want || {})}.`,
      request: `<b>${esc(from.name)}</b> vous demande ${G.fmtBundle(s, pr.payload.want || {})}. Refuser dégradera vos relations.`,
    }[pr.kind];
    return `<div class="card proposal" style="border-left-color:${from.color}"><div class="proposal-head">${avatar(from, 34)}<p>${text}</p></div><div class="row">
      <button class="btn small primary" data-action="accept" data-id="${pr.id}">${pr.kind === 'request' ? 'Donner' : 'Accepter'}</button>
      <button class="btn small" data-action="decline" data-id="${pr.id}">Refuser</button></div></div>`;
  }).join('');
  const entries = s.log.filter((l) => !l.who || l.who.includes(0)).slice(-30).reverse();
  $('#journal').innerHTML = `<div class="section-title"><span>Journal</span></div>` + entries.map((l) => `<div class="log ${l.kind}"><span class="t">T${l.turn}</span>${esc(l.text)}</div>`).join('');
}

function costChips(def, isBuilding = true) { return chips(G.costOf(s, 0, def, isBuilding)); }

function renderSelection() {
  renderSelectionBody();
  softDisable($('#selection'));
}
function renderSelectionBody() {
  const el = $('#selection');
  if (!sel) { el.hidden = true; return; }
  el.hidden = false;
  if (sel.kind === 'unit') {
    const u = s.units.find((x) => x.id === sel.id);
    if (!u) { sel = null; el.hidden = true; return; }
    const def = G.unitDef(s, u.type);
    const owner = s.players[u.owner];
    const found = u.type === 'settler' ? G.canFound(s, u) : null;
    el.innerHTML = `<button class="btn small ghost close-sel" data-action="deselect" aria-label="Fermer la sélection">✕</button><h3><span class="dot" style="background:${owner.color}"></span>${def.name}${u.owner !== 0 ? ` <span class="muted">· ${esc(owner.name)}</span>` : ''}</h3>
      <p class="muted" style="font-size:13px;margin:6px 0 0">${def.desc}</p>
      <dl class="kv"><dt>Mouvements</dt><dd>${u.movesLeft.toFixed(1).replace('.0', '')} / ${G.unitMaxMoves(s, u)}</dd><dt>Vision</dt><dd>${G.unitVision(s, u)}</dd>
      ${u.target ? (() => { const pl = u.owner === 0 ? orderPlan(u) : null; return `<dt>Destination</dt><dd>${esc(placeName(u.target.x, u.target.y))}${pl ? ` · ${arrivalText(pl.turns, 'arrivée')}` : ''}</dd>`; })() : ''}
      ${u.owner === 0 && (u.sleep || u.skipTurn === s.turn) ? `<dt>État</dt><dd>${u.sleep ? 'En veille' : 'Tour passé'}</dd>` : ''}</dl>
      ${u.owner === 0 ? `<div class="actions">
        ${u.type === 'settler' ? `<button class="btn primary small" data-action="found" ${found.ok ? '' : 'disabled'}>Fonder une ville${tap() === 'cliquez' ? ' (F)' : ''}</button>` : ''}
        ${u.type === 'engineer' ? (() => { const a = G.canEngineerRoad(s, u), b2 = G.canClearForest(s, u);
          return `<button class="btn small" data-action="eng-road" ${a.ok ? '' : 'disabled'} title="${esc(a.reason || '')}">Route ici (1 Bois)</button><button class="btn small" data-action="eng-clear" ${b2.ok ? '' : 'disabled'} title="${esc(b2.reason || '')}">Défricher (+${s.rules.engineer.clearWood} Bois)</button>`; })() : ''}
        ${u.type === 'archaeologist' ? (() => { const x = AGE.canExcavate(s, u); return `<button class="btn primary small" data-action="excavate" ${x.ok ? '' : 'disabled'} title="${esc(x.reason || 'Exhumer un artefact')}">Fouiller le site</button>`; })() : ''}
        ${u.type === 'agent' ? (() => { const tg = IND.spyTargets(s, u); if (!tg) return ''; const risk = Math.round(IND.detectChance(s, u, tg.city) * 100);
          return `<button class="btn small" data-action="spy" data-mission="tech" ${tg.techs.length ? '' : 'disabled'} title="Copie la technologie la plus simple que ${esc(s.players[tg.city.owner].name)} connaît et que vous pouvez apprendre. Risque d'être repéré : ${risk} %.">Copier une technologie</button><button class="btn small" data-action="spy" data-mission="delay" ${tg.sites.length ? '' : 'disabled'} title="Retarde de ${s.rules.espionage.delayTurns} tours un chantier (merveille en priorité). Risque d'être repéré : ${risk} %.">Retarder un chantier</button>`; })() : ''}
        ${pendingMove && pendingMove.uid === u.id ? '<button class="btn primary small" data-action="confirm-move">Confirmer le déplacement</button><button class="btn small" data-action="cancel-move">Annuler</button>' : ''}
        ${u.target ? '<button class="btn small" data-action="cancel-order">Annuler l\'ordre</button>' : ''}
        ${!u.target && !u.sleep && u.skipTurn !== s.turn ? '<button class="btn small" data-action="unit-skip" title="Ne rien faire ce tour-ci">Passer ce tour</button>' : ''}
        ${u.sleep ? '<button class="btn small" data-action="unit-wake">Réveiller</button>' : !u.target ? '<button class="btn small" data-action="unit-sleep" title="L\'unité ne vous sera plus signalée jusqu\'à ce que vous la réveilliez ou lui donniez un ordre">Mettre en veille</button>' : ''}
        <button class="btn small ghost" data-action="next-unit">Unité suivante${tap() === 'cliquez' ? ' (Espace)' : ''}</button>
      </div>
      ${found && !found.ok ? `<div class="reason">${found.reason}</div>` : ''}
      <div class="reason">${Tap()} une case pour vous y rendre${{ caravan: ' — visez une ville étrangère pour ouvrir une route commerciale', ship: ' — naviguez jusqu\'à une ville étrangère au bord de l\'eau pour une route maritime', emissary: ' — entrez dans une ville étrangère pour y ouvrir une ambassade', airship: ' — il survole montagnes et océans', engineer: ' — puis tracez une route ou défrichez', archaeologist: ' — rejoignez un site antique pour le fouiller', agent: ' — entrez dans une ville étrangère pour y mener une mission (risque d\'incident diplomatique)' }[u.type] || ''}.</div>` : ''}`;
    return;
  }
  if (sel.kind === 'city') {
    const c = s.cities.find((x) => x.id === sel.id);
    if (!c) { sel = null; el.hidden = true; return; }
    const owner = s.players[c.owner];
    const cap = G.cityPopCap(s, c);
    const need = s.rules.growthBase + s.rules.growthPerPop * c.pop;
    const blds = s.buildings.filter((b) => b.cityId === c.id);
    const mine = c.owner === 0;
    el.innerHTML = `<button class="btn small ghost close-sel" data-action="deselect" aria-label="Fermer la sélection">✕</button><h3><span class="dot" style="background:${owner.color}"></span>${esc(c.name)}${c.capital ? ' <span class="tag">Capitale</span>' : ''}${!mine ? ` <span class="muted">· ${esc(owner.name)}</span>` : ''}</h3>
      <dl class="kv"><dt>Population</dt><dd title="${esc(popCapText(c))}">${c.pop} / ${cap}</dd>
      ${mine ? `<dt>Croissance</dt><dd>${fmt(me().res.food)} / ${need} Nourriture</dd>` : `<dt>Relation</dt><dd>${Math.round(G.getRel(s, 0, c.owner))} · ${G.relStatus(G.getRel(s, 0, c.owner)).label}</dd>`}
      <dt>Palier</dt><dd>${s.rules.tiers[c.tier || 0].name}</dd>
      <dt>Rayon du territoire</dt><dd>${c.radius}</dd><dt>Bâtiments</dt><dd>${blds.length}</dd>
      ${(() => { const pol = SOC.cityPollution(s, c), hc = SOC.healthCap(s, c);
        return `<dt>Pollution</dt><dd class="${pol.net > 0 ? 'bad' : ''}" title="Émise ${pol.emitted} par les ateliers, absorbée ${pol.absorbed} par les parcs et les forêts. Chaque point coûte ${s.rules.pollution.food} Nourriture et ${s.rules.pollution.culture} Culture.">${pol.net > 0 ? `${String(pol.net).replace('.', ',')} (−${String(pol.net * s.rules.pollution.food).replace('.', ',')} Nourriture)` : 'aucune'}</dd>
        <dt>Santé</dt><dd class="${c.pop >= hc.cap ? 'bad' : ''}">${hc.needs ? `${G.buildingDef(s, hc.needs).name} requis au-delà de ${hc.cap} hab.` : 'Eau courante et soins'}</dd>
        <dt>Attractivité</dt><dd title="Palier, culture, tourisme, rivière, pollution et santé. Les habitants migrent vers les villes les plus attrayantes.">${String(SOC.attractiveness(s, c)).replace('.', ',')}</dd>`; })()}</dl>
      ${mine ? tierHint(c) : ''}
      ${cityLandHtml(c, mine)}
      ${(c.movements || []).length ? `<div class="reason">Mouvements : ${c.movements.map((id) => { const d = MOV.movementDef(s, id); return `${d.icon} ${d.name}${MOV.stanceOf(s, c.owner, id) === 'adopt' ? ' (adopté)' : ''}`; }).join(' · ')}</div>` : ''}
      ${mine ? `<div class="section-title" style="margin-top:12px"><span>Former une unité</span><span>${c.trained ? '1 / tour — fait' : '1 / tour'}</span></div>
      <div class="actions">${data.units.map((d) => {
        const chk = G.canTrain(s, 0, c.id, d.id);
        return `<button class="btn small unit-btn" data-action="train" data-unit="${d.id}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.reason || d.desc)}">${d.name}<span class="cost">${Object.entries(G.costOf(s, 0, d, false)).map(([k, v]) => `${v} ${data.resources[k].name}`).join(' · ')}</span></button>`;
      }).join('')}</div>
      <div class="reason">Construisez dans le territoire de la ville avec la barre du bas.</div>
      ${blds.length ? `<div class="section-title" style="margin-top:12px"><span>Bâtiments de la ville</span><span>${blds.length}</span></div>
      <div class="city-blds">${blds.map((bb) => { const d = G.buildingDef(s, bb.type); const adj = G.adjacencyBonus(s, 0, bb.type, bb.x, bb.y);
        return `<div class="mem"><span>${d.name}${bb.turnsLeft > 0 ? ` <span class="muted">· ${bb.turnsLeft} t.</span>` : ''}</span><span class="muted">${d.process ? `→ ${chipsText(d.process.out)}` : chipsText(d.yields)}${bonusSum(adj) > 0 ? ` <b class="good">${chipsText(Object.fromEntries(Object.entries(adj).filter(([, v]) => v)))}</b>` : ''}</span></div>`; }).join('')}</div>` : ''}` : ''}`;
    return;
  }
  const t = s.map.tiles[sel.i];
  const ter = data.terrain[t.type];
  const b = G.buildingAt(s, t.x, t.y);
  const explored = G.isExplored(s, 0, t.x, t.y);
  if (!explored) { el.innerHTML = '<h3>Terre inconnue</h3><p class="muted" style="font-size:13px">Envoyez un explorateur pour révéler cette zone.</p>'; return; }
  const bdef = b && G.buildingDef(s, b.type);
  el.innerHTML = `<button class="btn small ghost close-sel" data-action="deselect" aria-label="Fermer la sélection">✕</button><h3>${ter.name}</h3>
    <dl class="kv"><dt>Coordonnées</dt><dd>${t.x}, ${t.y}</dd><dt>Propriétaire</dt><dd>${t.owner === -1 ? '—' : esc(s.players[t.owner].name)}</dd>
    <dt>Déplacement</dt><dd>${ter.passable ? (t.road !== -1 ? `${s.rules.road.moveCost} (route)` : ter.move) : 'impraticable'}</dd>
    ${t.luxury ? `<dt>Ressource rare</dt><dd>${data.resources[t.luxury].name}</dd>` : ''}</dl>
    ${t.luxury && !bdef ? `<div class="reason">${data.resources[t.luxury].desc} Construisez un <b>Comptoir</b> ici (onglet Industrie) pour l'exploiter.</div>` : ''}
    ${bdef ? `<div class="section-title" style="margin-top:10px"><span>${bdef.name}</span><span>${b.turnsLeft > 0 ? `${b.turnsLeft} tour(s)` : 'actif'}</span></div>
      <div class="chips">${chips(bdef.yields, 'yield')}${bdef.process ? `<span class="chip">${G.fmtBundle(s, bdef.process.in)} → ${G.fmtBundle(s, bdef.process.out)}</span>` : ''}${b.luxury ? chips({ [b.luxury]: 1 }, 'yield') : ''}${bdef.prestige ? `<span class="chip yield">+${bdef.prestige} prestige</span>` : ''}</div>
      ${(() => { const adj = G.adjacencyBonus(s, b.owner, b.type, b.x, b.y); return Object.keys(adj).length && Object.values(adj).some((v) => v) ? `<div class="chips" style="margin-top:4px"><span class="chip">Adjacence :</span>${chips(Object.fromEntries(Object.entries(adj).filter(([, v]) => v)), 'yield')}</div>` : ''; })()}
      ${b.owner === 0 && !bdef.wonder && !bdef.luxuryOnly ? `<div class="actions" style="margin-top:6px"><button class="btn small" data-action="relocate-start" data-id="${b.id}" title="Déplacer ce bâtiment ailleurs dans votre territoire (${G.fmtBundle(s, s.rules.relocate.cost)}) : utile pour spécialiser vos villes et optimiser les adjacences">Déplacer (${G.fmtBundle(s, s.rules.relocate.cost)})</button></div>` : ''}
      ${LAND.isDamaged(b) ? `<div class="reason bad">Endommagé par une catastrophe : ${b.damaged} tour(s) sans rendement.${b.owner === 0 ? ` <button class="btn small" data-action="repair" data-id="${b.id}">Réparer (${G.fmtBundle(s, s.rules.disasters.repairCost)})</button>` : ''}</div>` : ''}
      <p class="muted" style="font-size:12.5px;margin:6px 0 0">${bdef.desc}</p>` : ''}
    ${t.site ? `<div class="reason">Site antique : un archéologue (Renaissance) peut y exhumer un artefact.</div>` : ''}
    ${postHtml(IND.postAt(s, t.x, t.y))}
    ${terraformHtml(t)}`;
}

// Comptoir indépendant : nature, protecteur, faveur de chacun, cadeau.
function postHtml(post) {
  if (!post) return '';
  const K = IND.postKind(s, post), I = s.rules.independents;
  const known = s.players.filter((p) => p.id === 0 || IND.favorOf(post, p.id) > 0).sort((a, b) => IND.favorOf(post, b.id) - IND.favorOf(post, a.id));
  const gift = IND.canGift(s, 0, post.id);
  return `<div class="section-title" style="margin-top:10px"><span>${K.icon} ${esc(post.name)}</span><span>${K.name}</span></div>
    <div class="reason">${K.desc} Protecteur : <b>${post.patron === null ? 'aucun' : esc(s.players[post.patron].name)}</b> (il faut ${I.patronMin} de faveur et la plus haute). +${I.prestige} prestige pour le protecteur.</div>
    <div class="city-blds">${known.map((p) => `<div class="mem"><span>${esc(p.name)}</span><span class="muted">${Math.floor(IND.favorOf(post, p.id))} faveur</span></div>`).join('')}</div>
    <div class="actions"><button class="btn small" data-action="post-gift" data-id="${post.id}" ${gift.ok ? '' : 'disabled'} title="${esc(gift.reason || '')}">Offrir ${G.fmtBundle(s, I.gift.cost)} (+${I.gift.favor} faveur)</button></div>
    <div class="reason">Gagnez aussi de la faveur en y envoyant une caravane (+${I.caravanFavor}) ou un émissaire (+${I.emissaryFavor}), et par la culture de vos villes proches.</div>`;
}

// Aménagement d'une case de votre territoire : défricher, reboiser, aplanir.
function terraformHtml(t) {
  const A = s.rules.terraform?.actions;
  if (!A || t.owner !== 0 || G.buildingAt(s, t.x, t.y) || G.cityAt(s, t.x, t.y)) return '';
  const opts = Object.entries(A).filter(([, a]) => a.from.includes(t.type));
  if (!opts.length) return '';
  return `<div class="section-title" style="margin-top:10px"><span>Aménager</span></div><div class="actions">${opts.map(([k, a]) => {
    const chk = LAND.canTerraform(s, 0, k, t.x, t.y);
    return `<button class="btn small unit-btn" data-action="terraform" data-act="${k}" data-x="${t.x}" data-y="${t.y}" ${chk.ok ? '' : 'disabled'} title="${esc(`${a.desc}${chk.ok ? '' : `\n${chk.reason}`}`)}">${a.name}<span class="cost">${G.fmtBundle(s, a.cost)}${a.gain ? ` → ${G.fmtBundle(s, a.gain)}` : ''}</span></button>`;
  }).join('')}</div>`;
}

// Panneau de ville : vocation, risques de catastrophe, bâtiments endommagés.
function cityLandHtml(c, mine) {
  const V = s.rules.vocations, out = [];
  if (V) {
    const cur = c.vocation && LAND.vocationDef(s, c.vocation);
    if (!mine) { if (cur) out.push(`<div class="reason">Vocation : <b>${cur.icon} ${cur.name}</b></div>`); }
    else if (c.pop < V.minPop && !cur) out.push(`<div class="reason">Vocation : possible à ${V.minPop} habitants (ville universitaire, d'art, portuaire…).</div>`);
    else {
      out.push(`<div class="section-title" style="margin-top:12px"><span>Vocation</span><span>${cur ? `${cur.icon} ${cur.name}` : 'à choisir'}</span></div>
        <div class="voc-grid">${Object.entries(V.list).map(([id, d]) => { const chk = LAND.canSetVocation(s, c, id);
          return `<button class="voc ${c.vocation === id ? 'on' : ''}" data-action="vocation" data-id="${c.id}" data-voc="${id}" ${chk.ok ? '' : 'aria-disabled="true"'} aria-pressed="${c.vocation === id}" title="${esc(`${d.desc}${chk.ok ? '' : `\n${chk.reason}`}`)}"><b>${d.icon} ${d.name}</b><span>${esc(d.desc)}</span></button>`; }).join('')}</div>
        ${cur ? `<div class="reason">Changer de vocation coûte ${G.fmtBundle(s, V.changeCost)}, au plus tous les ${V.cooldown} tours.</div>` : ''}`);
    }
  }
  if (mine && s.rules.disasters && s.settings?.disasters !== false) {
    const risks = LAND.disasterRisks(s, c);
    if (risks.length) out.push(`<div class="reason">Risques : ${risks.map((r) => `${r.def.icon} ${r.def.name} (${s.rules.seasons.list.find((x) => x.id === r.def.season).name.toLowerCase()}) — ${r.protectedBy ? `<span class="good">protégée par ${G.buildingDef(s, r.protectedBy).name.toLowerCase()}</span>` : `<span class="bad">${G.buildingDef(s, r.def.protect).name} conseillé(e)</span>`}`).join(' · ')}</div>`);
    const dmg = s.buildings.filter((b) => b.cityId === c.id && LAND.isDamaged(b));
    if (dmg.length) out.push(`<div class="reason bad">Endommagé : ${dmg.map((b) => `${G.buildingDef(s, b.type).name} (${b.damaged} t.) <button class="btn small" data-action="repair" data-id="${b.id}">Réparer</button>`).join(' ')}</div>`);
  }
  return out.join('');
}

// Panneau Personnages et ambitions (touche G).
let peopleTab = 'people';
function showPeople(tab = peopleTab) {
  peopleTab = tab;
  const GP = s.rules.greatPeople, p = me();
  const tabs = `<div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="${tab === 'people'}" data-action="people-tab" data-tab="people">Grands personnages${PEO.greatPeopleOf(s, 0).length ? ` (${PEO.greatPeopleOf(s, 0).length})` : ''}</button>${PEO.ambitionsOn(s) ? `<button class="tab" role="tab" aria-selected="${tab === 'ambitions'}" data-action="people-tab" data-tab="ambitions">Ambitions secrètes</button>` : ''}</div>`;
  let body = '';
  if (tab === 'people' || !PEO.ambitionsOn(s)) {
    const gain = PEO.gpGain(s, 0, p.lastYield || G.computeYields(s, 0));
    const gauges = Object.entries(GP.kinds).map(([k, K]) => { const need = PEO.gpThreshold(s, 0, k), have = Math.floor((p.gp || {})[k] || 0);
      return `<div class="gp-gauge" title="${esc(K.desc)}"><div class="row"><b>${K.icon} ${K.name}</b><span class="muted">${have} / ${need} · +${String(gain[k]).replace('.', ',')}/tour</span></div><div class="bar"><span style="width:${Math.min(100, Math.round((have / need) * 100))}%"></span></div><div class="muted small">${esc(K.desc)}</div></div>`; }).join('');
    const wip = s.buildings.filter((b) => b.owner === 0 && b.turnsLeft > 0);
    const list = PEO.greatPeopleOf(s, 0).map((g) => { const K = GP.kinds[g.kind];
      const pick = g.kind === 'engineer' && wip.length > 1 ? `<select id="gp-target-${g.id}" aria-label="Chantier à faire avancer">${wip.map((b) => `<option value="${b.id}" ${b === PEO.engineerTarget(s, 0) ? 'selected' : ''}>${G.buildingDef(s, b.type).name} (${b.turnsLeft} t.)</option>`).join('')}</select>` : '';
      return `<div class="gp-card"><div><b>${K.icon} ${esc(g.name)}</b><div class="muted">${K.name} · arrivé au tour ${g.turn}</div><div>${esc(PEO.describeUse(s, 0, g))}</div></div><div class="row">${pick}<button class="btn primary small" data-action="gp-use" data-id="${g.id}">Employer</button></div></div>`; }).join('');
    body = `<p class="muted">Vos rendements remplissent quatre jauges. Une jauge pleine fait venir un grand personnage (+${GP.prestige} prestige) ; employez-le quand vous voulez. Chaque nouveau personnage du même type demande davantage de points.</p>
      <div class="gp-gauges">${gauges}</div>
      <div class="section-title" style="margin-top:14px"><span>À votre service</span><span>${PEO.greatPeopleOf(s, 0).length}</span></div>
      ${list || '<div class="muted">Personne pour le moment.</div>'}
      ${Object.values(p.gpCount || {}).some(Boolean) ? `<div class="muted small" style="margin-top:8px">Déjà accueillis : ${Object.entries(p.gpCount).filter(([, v]) => v).map(([k, v]) => `${v} ${GP.kinds[k].name.toLowerCase()}${v > 1 ? 's' : ''}`).join(', ')}.</div>` : ''}`;
  } else {
    const A = s.rules.ambitions;
    const hand = (p.ambitions || []).map((a) => { const c = PEO.ambitionDef(s, a.id), [have, need] = PEO.ambitionProgress(s, 0, c);
      const play = PEO.canPlayAmbition(s, 0, a.id);
      return `<div class="amb-card ${a.active ? 'active' : ''}"><div class="row"><b>${esc(c.name)}</b><span class="chip yield">+${PEO.ambitionPrestige(s, c)} prestige</span></div><div>${esc(c.desc)}</div>
        <div class="bar"><span style="width:${Math.min(100, Math.round((have / need) * 100))}%"></span></div><div class="muted small">${Math.min(have, need)} / ${need}${a.active ? ' · jouée : elle rapporte dès qu\'elle est remplie' : ' · en main : ne rapporte rien tant qu\'elle n\'est pas jouée'}</div>
        <div class="row">${a.active ? `<button class="btn small" data-action="amb-withdraw" data-amb="${a.id}">Retirer</button>` : `<button class="btn primary small" data-action="amb-play" data-amb="${a.id}" ${play.ok ? '' : 'disabled'} title="${esc(play.reason || '')}">Jouer</button>`}
        <button class="btn small ghost" data-action="amb-discard" data-amb="${a.id}" ${PEO.discardReadyIn(s, 0) > 0 ? `disabled title="Prochaine défausse dans ${PEO.discardReadyIn(s, 0)} tour(s)"` : 'title="Défausser et piocher une autre carte"'}>Défausser</button></div></div>`; }).join('');
    const doneList = (p.ambitionsDone || []).map((id) => PEO.ambitionDef(s, id).name);
    body = `<p class="muted">Vos ambitions sont secrètes et <b>facultatives</b> : gardez en main celles qui ne vous intéressent pas, sans pénalité. Jouez-en jusqu'à ${A.maxActive} à la fois ; une carte jouée rapporte son prestige dès qu'elle est remplie, puis vous en piochez une nouvelle. Une défausse tous les ${A.discardCooldown} tours.</p>
      <div class="amb-grid">${hand || '<div class="muted">Plus aucune carte à piocher.</div>'}</div>
      ${doneList.length ? `<div class="muted small" style="margin-top:8px">Accomplies : ${doneList.map(esc).join(', ')}.</div>` : ''}`;
  }
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Personnages et ambitions"><header><div><h2>Personnages et ambitions</h2></div><button class="btn" data-action="close">Fermer</button></header>${tabs}<div class="people-body">${body}</div></div>`);
}

// Ce qui fixe la population maximale d'une ville, et ce qui la ferait monter.
function popCapText(c) {
  const R = s.rules, parts = [`${R.basePopCap} de base`];
  R.tiers.slice(1, (c.tier || 0) + 1).forEach((t) => { if (t.popCap) parts.push(`+${t.popCap} ${t.name}`); });
  const dist = s.buildings.filter((b) => b.cityId === c.id && !b.turnsLeft && G.buildingDef(s, b.type).popCap).reduce((a, b) => a + G.buildingDef(s, b.type).popCap, 0);
  if (dist) parts.push(`+${dist} quartiers résidentiels`);
  const mods = G.playerMods(s, c.owner).popCap;
  if (mods) parts.push(`+${mods} technologies et politiques`);
  const hc = SOC.healthCap(s, c);
  const tips = [];
  if (hc.needs) tips.push(`${G.buildingDef(s, hc.needs).name} requis au-delà de ${hc.cap} habitants`);
  const nextTier = R.tiers[(c.tier || 0) + 1];
  if (nextTier) tips.push(`palier ${nextTier.name} (${nextTier.minPop} hab. et ${G.fmtBundle(s, nextTier.needs)} par tour) : +${nextTier.popCap}`);
  tips.push('Quartier résidentiel : +3 (2 par ville)');
  return `Plafond : ${parts.join(', ')}. Pour monter : ${tips.join(' ; ')}.`;
}

function tierHint(c) {
  const tiers = s.rules.tiers;
  const cur = tiers[c.tier || 0], next = tiers[(c.tier || 0) + 1];
  const needs = Object.keys(cur.needs || {}).length ? `Consomme ${G.fmtBundle(s, cur.needs)} par tour.` : '';
  const up = next ? `Palier suivant, <b>${next.name}</b> : ${next.minPop} habitants et ${G.fmtBundle(s, next.needs)} par tour → ${chipsText(next.yields)}${next.popCap ? `, +${next.popCap} pop. max` : ''}.` : 'Palier maximal atteint.';
  return `<div class="reason">${needs} ${up}</div>`;
}
const markers = () => (me().markers ||= []);
// Cases couvertes par un repère (2×2 pour un quartier prévu).
function markerTiles(k) {
  const x = k.i % s.map.width, y = Math.floor(k.i / s.map.width), f = k.plan ? G.footprintOf(s, k.plan) : 1, out = [];
  for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) out.push((y + dy) * s.map.width + x + dx);
  return out;
}
const markerAt = (i) => markers().find((k) => markerTiles(k).includes(i));
// Bâtiments prévus, comptés comme voisins dans les aperçus d'adjacence.
function plannedMap() {
  const m = new Map();
  for (const k of markers()) if (k.plan) for (const j of markerTiles(k)) m.set(j, { type: k.plan, x: k.i % s.map.width, y: Math.floor(k.i / s.map.width) });
  return m;
}
const markerName = (k) => (k.plan ? `${G.buildingDef(s, k.plan).name} prévu` : `Drapeau ${MARKER_COLORS[k.color]?.[0].toLowerCase() || ''}`);
function placeMarker(i) {
  const t = s.map.tiles[i];
  if (!G.isExplored(s, 0, t.x, t.y)) { toast('Case inexplorée.', 'bad'); return; }
  const here = markers().find((k) => k.i === i);
  const same = here && (mode.plan ? here.plan === mode.plan : here.color === mode.color && !here.plan);
  if (mode.plan) {
    const r = G.canBuild(s, 0, mode.plan, t.x, t.y, { plan: true });
    if (!r.ok && !same) { toast(r.reason, 'bad'); return; }
  }
  const covered = new Set(mode.plan ? markerTiles({ i, plan: mode.plan }) : [i]);
  me().markers = markers().filter((k) => !markerTiles(k).some((j) => covered.has(j)));
  if (!same) markers().push(mode.plan ? { i, plan: mode.plan } : { i, color: mode.color });
  renderer.syncEntities(); renderHighlights(); save();
}
// Un bâtiment construit remplace les repères posés sous son empreinte.
function clearMarkersUnder(type, x, y) {
  const f = G.footprintOf(s, type), under = new Set();
  for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) under.add((y + dy) * s.map.width + x + dx);
  if (me().markers) me().markers = markers().filter((k) => !markerTiles(k).some((j) => under.has(j)));
}

const chipsText = (b) => Object.entries(b || {}).map(([k, v]) => `+${v} ${data.resources[k].name}`).join(', ');

function renderBuildbar() {
  const el = $('#buildbar');
  const collapsed = !buildOpen() && G.citiesOf(s, 0).length > 0;
  el.classList.toggle('collapsed', collapsed);
  if (collapsed) {
    const abReady = !!data.profilesById[me().profile].ability && W.canUseAbility(s, 0).ok;
    el.innerHTML = `<button class="build-fab" data-action="toggle-build" aria-expanded="false" aria-controls="buildbar" title="Ouvrir la barre de construction (B)">${HAMMER}<span>Construire</span>${abReady ? '<span class="badge" title="Capacité prête">★</span>' : ''}</button>`;
    return;
  }
  if (!G.citiesOf(s, 0).length) { el.innerHTML = '<div class="muted" style="font-size:13px;padding:4px 2px">Fondez une ville pour débloquer la construction.</div>'; return; }
  const prof = data.profilesById[me().profile];
  const tabs = { ...BUILD_TABS, ...(prof.unique ? { profile: { label: prof.name, ids: [prof.unique] } } : {}), marker: { label: 'Repères', ids: [] } };
  const tab = tabs[buildTab] || BUILD_TABS.prod;
  const items = buildTab === 'marker' ? markerItems(tabs) : tab.ids.map((id) => {
    if (id === 'road') {
      const pressed = mode?.type === 'road';
      return `<button class="build-item" data-action="mode-road" aria-pressed="${pressed}" title="Prolonge votre réseau ; relier vos villes à la capitale rapporte +${s.rules.road.connectedCityGold} Or par ville."><b>Route (R)</b><div class="chips">${chips(s.rules.road.cost)}</div><div class="line"><span class="chip yield">Déplacement ${s.rules.road.moveCost}</span></div></button>`;
    }
    const def = G.buildingDef(s, id);
    const eraLock = def.era && s.rules.eras && AGE.eraOf(s, 0) < def.era ? AGE.eraDef(s, def.era).name : null;
    const locked = (def.tech && !G.hasTech(s, 0, def.tech)) || !!eraLock;
    const taken = def.wonder && s.wonders[id] !== undefined;
    const adjTxt = describeAdjacency(def);
    const sites = def.wonder && !taken ? G.wonderSites(s, id) : [];
    const mine = sites.find((r) => r.pid === 0), rivals = sites.filter((r) => r.pid !== 0);
    const raceTxt = rivals.length ? `\nEn chantier chez ${rivals.map((r) => `${s.players[r.pid].name} (fin dans ${r.turnsLeft} tour${r.turnsLeft > 1 ? 's' : ''})`).join(', ')}. Seul le premier à la terminer la garde ; les autres récupèrent 50 % du coût.` : '';
    const raceChip = rivals.length ? `<div class="chip race" style="margin-top:3px">${esc(s.players[rivals[0].pid].name)} · ${rivals[0].turnsLeft} t.${rivals.length > 1 ? ` +${rivals.length - 1}` : ''}${mine ? ` · vous ${mine.turnsLeft} t.` : ''}</div>` : '';
    const lockTxt = eraLock && !(def.tech && !G.hasTech(s, 0, def.tech)) ? `Ère ${eraLock}` : def.tech ? G.techDef(s, def.tech).name : '';
    const reason = (locked ? `Nécessite ${def.tech && !G.hasTech(s, 0, def.tech) ? G.techDef(s, def.tech).name : `l'ère ${eraLock}`}` : taken ? `Construite par ${s.players[s.wonders[id]].name}` : def.desc) + raceTxt + (adjTxt ? `\nAdjacence : ${adjTxt}` : '');
    const pressed = mode?.type === 'build' && mode.id === id;
    return `<button class="build-item" data-action="mode-build" data-id="${id}" aria-pressed="${pressed}" aria-disabled="${locked || taken}" title="${esc(reason)}">
      <b>${def.name}${def.wonder ? '' : ''}</b><div class="chips">${costChips(def)}</div>
      <div class="line"><span class="chips">${def.process ? `<span class="chip yield">${Object.values(def.process.in).reduce((a, v) => a + v, 0)}→${chips(def.process.out, 'yield')}</span>` : chips(def.yields, 'yield')}${def.luxuryOnly ? '<span class="chip yield">+1 ressource rare</span>' : ''}${def.prestige ? `<span class="chip yield">+${def.prestige} prest.</span>` : ''}</span></div>
      ${locked ? `<div class="chip" style="margin-top:3px">${lockTxt}</div>` : taken ? '<div class="chip" style="margin-top:3px">Indisponible</div>' : raceChip}
    </button>`;
  }).join('');
  const ab = prof.ability, wait = W.abilityReadyIn(s, 0), abOk = W.canUseAbility(s, 0);
  const abBtn = ab ? `<button class="tab ability ${abOk.ok ? 'ready' : ''}" data-action="ability" ${abOk.ok ? '' : 'aria-disabled="true"'} title="${esc(`${ab.name} : ${ab.desc} Recharge : ${ab.cooldown} tours.${abOk.ok ? '' : ` ${abOk.reason}`}`)}">★ ${esc(ab.name)}${wait > 0 ? ` · ${wait} t.` : ''}</button>` : '';
  el.innerHTML = `<div class="tabs" role="tablist">${Object.entries(tabs).map(([k, v]) => `<button class="tab" role="tab" aria-selected="${k === buildTab}" data-action="tab" data-tab="${k}">${v.label}</button>`).join('')}
    ${abBtn}<button class="tab adj-toggle" aria-pressed="${showAdjacency}" data-action="toggle-adj" title="Afficher les bonus d'adjacence de vos bâtiments sur la carte (A)">Adjacences${showAdjacency ? ' ✓' : ''}</button></div><button class="build-close" data-action="toggle-build" aria-expanded="true" aria-controls="buildbar" aria-label="Replier la barre de construction" title="Replier (B)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="build-list">${items}</div>`;
}

// Onglet Repères : drapeaux de couleur, bâtiments à prévoir, effacement.
function markerItems(tabs) {
  const flags = Object.entries(MARKER_COLORS).map(([k, [name, col]]) => `<button class="build-item marker-item" data-action="mode-marker" data-color="${k}" aria-pressed="${mode?.type === 'marker' && mode.color === k}" title="Pose un drapeau ${name.toLowerCase()} pour noter un emplacement (touchez-le à nouveau pour le retirer).">
      <b><i class="pin" style="background:${col}"></i>Drapeau ${name.toLowerCase()}</b><div class="line"><span class="muted">Repère libre</span></div></button>`).join('');
  const ids = [...new Set(Object.entries(tabs).filter(([k]) => k !== 'marker').flatMap(([, v]) => v.ids))].filter((id) => id !== 'road' && G.buildingDef(s, id) && !(G.buildingDef(s, id).wonder && s.wonders[id] !== undefined));
  const plans = ids.map((id) => { const def = G.buildingDef(s, id); const n = markers().filter((k) => k.plan === id).length;
    return `<button class="build-item marker-item" data-action="mode-marker" data-plan="${id}" aria-pressed="${mode?.type === 'marker' && mode.plan === id}" title="${esc(`Prévoir ${def.name} : un fantôme est posé sur la carte et compte comme voisin dans les aperçus d'adjacence. Il disparaît quand vous construisez à cet endroit.${describeAdjacency(def) ? `\nAdjacence : ${describeAdjacency(def)}` : ''}`)}">
      <b>${def.name}</b><div class="line"><span class="muted">Prévoir${def.footprint > 1 ? ' · 2×2' : ''}</span>${n ? `<span class="chip">${n}</span>` : ''}</div></button>`; }).join('');
  const n = markers().length;
  return `${flags}<button class="build-item marker-item" data-action="markers-clear" aria-disabled="${!n}" title="Retire tous vos repères de la carte"><b>Tout effacer</b><div class="line"><span class="muted">${n} repère${n > 1 ? 's' : ''}</span></div></button>${plans}`;
}

const bonusHtml = (bundle) => Object.entries(bundle).filter(([, v]) => v).map(([k, v]) => `<span><i style="background:${resColor(k)}"></i>+${v}</span>`).join('');
const bonusSum = (bundle) => Object.values(bundle).reduce((a, v) => a + v, 0);
function describeAdjacency(def) {
  const name = (id) => (id === 'city' ? 'ville' : id === 'wonder' ? 'merveille' : (G.buildingDef(s, id)?.name || id).toLowerCase());
  return (def.adjacency || []).map((r) => {
    const what = r.terrain ? [].concat(r.terrain).map((k) => data.terrain[k].name.toLowerCase()).join('/') : [].concat(r.near).map(name).join('/');
    return Object.entries(r.yields).map(([k, v]) => `+${v} ${data.resources[k].name} par ${what} voisin${r.max ? ` (max ${r.max})` : ''}`).join(', ');
  }).join(' · ');
}

function renderHighlights() {
  renderer.setRoadsVisible(mode?.type === 'road');
  const list = [];
  const badges = [];
  const W = s.map.width;
  let orderPath = null;
  const planned = markers().some((k) => k.plan) ? plannedMap() : null;
  if (mode?.type === 'build') {
    s.map.tiles.forEach((t, i) => {
      if (t.owner !== 0 || !G.canBuild(s, 0, mode.id, t.x, t.y).ok) return;
      const adj = G.adjacencyBonus(s, 0, mode.id, t.x, t.y, planned);
      const f = G.footprintOf(s, mode.id);
      const isPlan = markers().some((k) => k.i === i && k.plan === mode.id);
      list.push({ i, color: isPlan ? '#3e8ed0' : bonusSum(adj) > 0 ? '#16c172' : '#a8e6c4' });
      if (bonusSum(adj) > 0) badges.push({ i, html: bonusHtml(adj), dx: (f - 1) / 2, dy: (f - 1) / 2, lift: 0.25 });
    });
  } else if (mode?.type === 'road') {
    s.map.tiles.forEach((t, i) => { if (G.canRoad(s, 0, t.x, t.y).ok) list.push({ i, color: '#f5b700' }); });
  } else if (mode?.type === 'relocate') {
    // Déplacement : cases possibles en vert (plus vif si l'adjacence y est meilleure), place actuelle en orange.
    const b = s.buildings.find((x) => x.id === mode.bid);
    if (b) {
      const f = G.footprintOf(s, b.type);
      const now = bonusSum(G.adjacencyBonus(s, 0, b.type, b.x, b.y, planned));
      list.push({ i: b.y * W + b.x, color: '#ff6b4a' });
      s.map.tiles.forEach((t, i) => {
        if (t.owner !== 0 || !G.canRelocate(s, 0, b.id, t.x, t.y).ok) return;
        const adj = G.adjacencyIfMoved(s, 0, b.id, t.x, t.y, planned), sum = bonusSum(adj);
        list.push({ i, color: sum > now ? '#16c172' : '#a8e6c4' });
        if (sum > 0) badges.push({ i, html: bonusHtml(adj), dx: (f - 1) / 2, dy: (f - 1) / 2, lift: 0.25 });
      });
    }
  } else if (mode?.type === 'marker' && mode.plan) {
    const f = G.footprintOf(s, mode.plan);
    s.map.tiles.forEach((t, i) => {
      if (!G.isExplored(s, 0, t.x, t.y) || !G.canBuild(s, 0, mode.plan, t.x, t.y, { plan: true }).ok) return;
      const adj = G.adjacencyBonus(s, 0, mode.plan, t.x, t.y, planned);
      list.push({ i, color: bonusSum(adj) > 0 ? '#16c172' : '#a8e6c4' });
      if (bonusSum(adj) > 0 && t.owner === 0) badges.push({ i, html: bonusHtml(adj), dx: (f - 1) / 2, dy: (f - 1) / 2, lift: 0.25 });
    });
  } else if (sel?.kind === 'unit') {
    const u = s.units.find((x) => x.id === sel.id);
    if (u && u.owner === 0 && u.movesLeft > 0 && !pendingMove) {
      for (const [i, d] of G.reachable(s, u)) if (d > 0) list.push({ i, color: '#ffffff' });
    }
    if (u && u.owner === 0 && u.target && !pendingMove) {
      // Ordre en cours sur plusieurs tours : chemin restant en pointillés, fin de chaque tour repérée, arrivée.
      orderPath = orderPlan(u);
      if (orderPath) pathBadges(orderPath, badges, 'Arrivée');
      else list.push({ i: u.target.y * W + u.target.x, color: '#ff6b4a' });
    }
    if (u && pendingMove && pendingMove.uid === u.id) pathBadges(pendingMove.plan, badges, 'Arrivée', ` · ${tap()} pour confirmer`);
  }
  // Bâtiments prévus : adjacence attendue, en mode Repères ou avec l'affichage des adjacences.
  if ((showAdjacency || mode?.type === 'marker') && mode?.type !== 'build') {
    for (const k of markers()) {
      if (!k.plan) continue;
      const x = k.i % W, y = Math.floor(k.i / W), adj = G.adjacencyBonus(s, 0, k.plan, x, y, planned);
      if (bonusSum(adj) <= 0) continue;
      const f = G.footprintOf(s, k.plan);
      badges.push({ i: k.i, html: `<span class="plan">prévu</span>${bonusHtml(adj)}`, dx: (f - 1) / 2, dy: (f - 1) / 2, lift: f > 1 ? 0.9 : 0.6 });
    }
  }
  if (showAdjacency && mode?.type !== 'build') {
    for (const b of s.buildings) {
      if (b.owner !== 0) continue;
      const adj = G.adjacencyBonus(s, 0, b.type, b.x, b.y, planned);
      if (bonusSum(adj) <= 0) continue;
      const f = G.footprintOf(s, b.type);
      badges.push({ i: b.y * W + b.x, html: bonusHtml(adj), dx: (f - 1) / 2, dy: (f - 1) / 2, lift: f > 1 ? 0.9 : 0.6 });
    }
  }
  renderer.setBadges(badges);
  const pu = pendingMove && s.units.find((x) => x.id === pendingMove.uid);
  const ou = !pu && orderPath && sel?.kind === 'unit' && s.units.find((x) => x.id === sel.id);
  renderer.setPath(pu ? pendingMove.plan.steps : ou ? orderPath.steps : null, pu ? pu.y * W + pu.x : ou ? ou.y * W + ou.x : null);
  renderer.setHighlights(list);
  let selIdx = null;
  if (sel?.kind === 'unit') { const u = s.units.find((x) => x.id === sel.id); if (u) selIdx = u.y * W + u.x; }
  if (sel?.kind === 'city') { const c = s.cities.find((x) => x.id === sel.id); if (c) selIdx = c.y * W + c.x; }
  if (sel?.kind === 'tile') selIdx = sel.i;
  renderer.setCursor(selIdx, 'select');
  const hint = $('#hint');
  const setHint = (text, btn) => { hint.hidden = false; hint.innerHTML = `<span id="hint-text"></span><button class="btn small hint-btn" data-action="cancel-current">${btn}</button>`; $('#hint-text').textContent = text; };
  if (mode?.type === 'build') setHint(`${G.buildingDef(s, mode.id).name} : choisissez une case verte${G.footprintOf(s, mode.id) > 1 ? ' (coin nord-ouest du quartier 2×2)' : ''}`, 'Annuler');
  else if (mode?.type === 'road') setHint('Route : touchez les cases jaunes pour prolonger le réseau', 'Terminer');
  else if (mode?.type === 'relocate') { const b = s.buildings.find((x) => x.id === mode.bid); setHint(`Déplacer ${b ? G.buildingDef(s, b.type).name : 'le bâtiment'} (${G.fmtBundle(s, s.rules.relocate.cost)}) : choisissez une case verte, plus vive si l'adjacence y est meilleure`, 'Annuler'); }
  else if (mode?.type === 'marker') setHint(mode.plan ? `Prévoir ${G.buildingDef(s, mode.plan).name} : touchez une case (à nouveau pour retirer le repère)` : `Drapeau ${MARKER_COLORS[mode.color][0].toLowerCase()} : touchez une case (à nouveau pour le retirer)`, 'Terminer');
  else if (pendingMove) setHint(`Déplacement prévu (${arrivalText(pendingMove.plan.turns, 'arrivée')}) : touchez à nouveau la destination pour confirmer`, 'Annuler');
  else hint.hidden = true;
}

// ------------------------------------------------------------- interactions
// Chemin restant d'une unité qui a reçu un ordre (null si la destination est devenue inaccessible).
function orderPlan(u) {
  if (!u?.target) return null;
  const plan = G.planMove(s, u, u.target.x, u.target.y);
  return plan?.steps.length ? plan : null;
}
// Pastilles du chemin : la fin de chaque tour intermédiaire (« Fin du tour 14 ») et l'arrivée.
function pathBadges(plan, badges, label, suffix = '') {
  const steps = plan.steps;
  if (plan.turns > 1 && plan.turns <= 8) {
    for (let k = 0; k < steps.length - 1; k++) {
      if (steps[k + 1].turn !== steps[k].turn) badges.push({ i: steps[k].i, html: `<span class="turn-end">Fin du tour ${s.turn + steps[k].turn - 1}</span>`, lift: 0.5 });
    }
  }
  const last = steps[steps.length - 1];
  badges.push({ i: last.i, html: `<span>${arrivalText(plan.turns, label)}${suffix}</span>`, lift: 0.75 });
}
// « Arrivée ce tour » / « Arrivée au tour 14 (dans 3 tours) » : plan.turns compte le tour en cours comme le 1er.
function arrivalText(turns, label = 'Arrivée') {
  if (turns <= 1) return `${label} ce tour`;
  const n = turns - 1;
  return `${label} au tour ${s.turn + n} (dans ${n} tour${n > 1 ? 's' : ''})`;
}
// Nom lisible d'une destination : ville, comptoir, merveille naturelle, sinon le terrain.
function placeName(x, y) {
  const c = G.cityAt(s, x, y);
  if (c) return c.name;
  const post = IND.postAt(s, x, y);
  if (post) return post.name;
  const t = G.tileAt(s, x, y);
  if (t.natural) return D.naturalDef(s, t.natural).name;
  if (t.site) return 'Site antique';
  if (t.ruin) return 'Ruines antiques';
  return data.terrain[t.type].name;
}

function select(next) { sel = next; mode = null; pendingMove = null; renderAll(); }

function setMode(next) {
  mode = next;
  renderer.setRoadsVisible(mode?.type === 'road'); // les routes ne s'affichent qu'en mode Route
  renderBuildbar(); renderHighlights();
}

// Terrain modifié (aménagement, incendie) : on reconstruit la scène pour replacer arbres et décor.
function refreshWorld() { if (s.terrainDirty) { delete s.terrainDirty; renderer.setState(s, 0); } else renderer.refresh(); renderAll(); }

// Routes commerciales qui vous concernent, tracées sur la carte : les vôtres (doré) et celles des voisins vers vos villes (bleu).
const TRADE_COLORS = { mine: '#e8a317', theirs: '#3e8ed0' };
let tradeKey = '';
function updateTradeLines(force = false) {
  const routes = s.tradeRoutes.filter((r) => r.a === 0 || r.b === 0);
  const key = `${s.turn}|${routes.map((r) => `${r.a}-${r.cityId}-${r.fromCityId}-${r.sea ? 1 : 0}`).join(',')}`;
  if (!force && key === tradeKey) return;
  tradeKey = key;
  const lines = [];
  for (const r of routes) {
    const to = s.cities.find((c) => c.id === r.cityId);
    const from = s.cities.find((c) => c.id === r.fromCityId && c.owner === r.a) || G.citiesOf(s, r.a).sort((p, q) => G.cheb(p.x, p.y, to.x, to.y) - G.cheb(q.x, q.y, to.x, to.y))[0];
    if (!to || !from) continue;
    const path = G.findPath(s, { id: -1, type: r.sea ? 'ship' : 'caravan', owner: r.a, x: from.x, y: from.y, movesLeft: 99 }, to.x, to.y);
    const start = from.y * s.map.width + from.x;
    lines.push({ pts: path?.length ? [start, ...path] : [start, to.y * s.map.width + to.x], color: r.a === 0 ? TRADE_COLORS.mine : TRADE_COLORS.theirs });
  }
  renderer.setTradeRoutes(lines);
}

function handleTileClick(i, shift) {
  if (s.winner) return;
  const t = s.map.tiles[i];
  if (mode?.type === 'build') {
    const r = G.build(s, 0, mode.id, t.x, t.y);
    if (!r.ok) { toast(r.reason, 'bad'); return; }
    toast(`${G.buildingDef(s, mode.id).name} en construction.`, 'good');
    clearMarkersUnder(mode.id, t.x, t.y);
    Sound.sfx.build();
    if (!shift || !G.canAfford(s, 0, G.costOf(s, 0, G.buildingDef(s, mode.id)))) mode = null;
    sel = { kind: 'tile', i };
    refreshWorld(); save(); return;
  }
  if (mode?.type === 'marker') { placeMarker(i); renderBuildbar(); return; }
  if (mode?.type === 'relocate') {
    const r = G.relocate(s, 0, mode.bid, t.x, t.y);
    if (!r.ok) { toast(r.reason, 'bad'); return; }
    toast(`${G.buildingDef(s, r.building.type).name} déplacé.`, 'good');
    Sound.sfx.build();
    clearMarkersUnder(r.building.type, t.x, t.y);
    mode = null; sel = { kind: 'tile', i };
    refreshWorld(); save(); return;
  }
  if (mode?.type === 'road') {
    const r = G.buildRoad(s, 0, t.x, t.y);
    if (!r.ok) toast(r.reason, 'bad');
    refreshWorld(); save(); return;
  }
  const u = sel?.kind === 'unit' ? s.units.find((x) => x.id === sel.id) : null;
  // Toucher une de vos unités ou une de vos villes la sélectionne (au lieu d'y envoyer l'unité choisie),
  // sauf si c'est la destination déjà prévue : le second toucher confirme alors le trajet.
  const ownThere = s.units.some((x) => x.owner === 0 && x.x === t.x && x.y === t.y) || G.cityAt(s, t.x, t.y)?.owner === 0;
  const isPlanned = pendingMove && u && pendingMove.uid === u.id && pendingMove.x === t.x && pendingMove.y === t.y;
  if (u && u.owner === 0 && (u.x !== t.x || u.y !== t.y) && (!ownThere || isPlanned)) {
    if (!G.isExplored(s, 0, t.x, t.y)) { toast('Destination inexplorée.', 'bad'); return; }
    const confirmed = pendingMove && pendingMove.uid === u.id && pendingMove.x === t.x && pendingMove.y === t.y;
    if (confirmMoves && !confirmed) {
      const plan = G.planMove(s, u, t.x, t.y);
      if (!plan) { toast('Destination inaccessible.', 'bad'); return; }
      pendingMove = { uid: u.id, x: t.x, y: t.y, plan };
      renderSelection(); renderHighlights(); return;
    }
    executeMove(u, t.x, t.y);
    return;
  }
  pendingMove = null;
  const mineHere = s.units.filter((x) => x.x === t.x && x.y === t.y && G.isExplored(s, 0, t.x, t.y));
  if (mineHere.length) {
    const cur = u ? mineHere.findIndex((x) => x.id === u.id) : -1;
    const city = G.cityAt(s, t.x, t.y);
    if (cur === mineHere.length - 1 && city) { select({ kind: 'city', id: city.id }); return; }
    select({ kind: 'unit', id: mineHere[(cur + 1) % mineHere.length].id });
    return;
  }
  const city = G.cityAt(s, t.x, t.y);
  if (city && G.isExplored(s, 0, t.x, t.y)) { select({ kind: 'city', id: city.id }); return; }
  select({ kind: 'tile', i });
}

function executeMove(u, x, y) {
  pendingMove = null;
  u.sleep = false; // un ordre réveille l'unité
  const r = G.orderMove(s, u.id, x, y);
  if (!r.ok) { toast(r.reason, 'bad'); return; }
  Tuto.flag(s, 'moved');
  renderer.animateUnit(u.id, r.steps);
  Sound.sfx.move();
  if (!s.units.includes(u)) { sel = null; toast('Arrivée à destination : mission accomplie !', 'good'); }
  else if (u.movesLeft < 0.5) sel = null; // plus de mouvement : on libère la sélection
  refreshWorld(); save();
}

// Infobulle de case au survol : terrain, propriétaire, ressource rare, bâtiment et rendement, unités.
function showTileTip(i, x, y) {
  const tip = $('#tiptile');
  if (i === null || i === undefined || !G.isExplored(s, 0, i % s.map.width, Math.floor(i / s.map.width))) { tip.hidden = true; return; }
  const t = s.map.tiles[i];
  const ter = data.terrain[t.type];
  const b = G.buildingAt(s, t.x, t.y);
  const c = G.cityAt(s, t.x, t.y);
  const units = s.units.filter((u) => u.x === t.x && u.y === t.y && (u.owner === 0 || renderer.visible?.[i]));
  const lines = [`<b>${c ? esc(c.name) : ter.name}</b>${t.owner !== -1 ? ` <span class="muted">· ${esc(s.players[t.owner].name)}</span>` : ''}`];
  if (c) {
    const inc = s.tradeRoutes.filter((r) => r.cityId === c.id && (r.a === 0 || r.b === 0));
    const out = c.owner === 0 ? s.tradeRoutes.filter((r) => r.a === 0 && (r.fromCityId === c.id)) : [];
    for (const r of inc) lines.push(`<span class="chip" style="color:${r.a === 0 ? TRADE_COLORS.mine : TRADE_COLORS.theirs}">Route ${r.sea ? 'maritime' : 'commerciale'} : ${r.a === 0 ? 'la vôtre' : `de ${esc(s.players[r.a].name)}`}</span>`);
    for (const r of out) lines.push(`<span class="chip" style="color:${TRADE_COLORS.mine}">Route vers ${esc(s.cities.find((x) => x.id === r.cityId)?.name || '?')}</span>`);
  }
  if (c) lines.push(`<span class="muted">Ville · ${c.pop} hab. · ${s.rules.tiers[c.tier || 0].name}${SOC.cityPollution(s, c).net > 0 ? ' · polluée' : ''}</span>`);
  if (!c) lines.push(`<span class="muted">${ter.passable ? `Déplacement ${G.enterCost(s, { owner: 0, type: 'explorer' }, t)}` : 'Impraticable'}${t.road !== -1 ? ' · route' : ''}</span>`);
  const reg = s.rules.regions?.[t.region];
  if (reg) lines.push(`<span class="muted">${reg.name}${t.river ? ' · rivière' : ''}</span>`);
  if (t.river && !b && !c) lines.push(`<span class="muted">Rivière : +${s.rules.river.buildingYield.gold} Or au bâtiment construit ici, Moulin à eau possible</span>`);
  if (t.natural) { const nd = D.naturalDef(s, t.natural); lines.push(`<span class="chip yield">Merveille naturelle : ${nd.name}</span>`, `<span class="muted">${chipsText(nd.yields)} pour le territoire qui l'englobe · +${s.rules.naturalWonders.ownedPrestige} prestige · ${chipsText(s.rules.naturalWonders.adjacency)} aux bâtiments voisins</span>`); }
  if (t.ruin) lines.push('<span class="chip yield">Ruines antiques : envoyez une unité les fouiller</span>');
  if (t.site && !b) lines.push('<span class="chip yield">Site antique : à fouiller par un archéologue</span>');
  const post = IND.postAt(s, t.x, t.y);
  if (post) lines.push(`<span class="chip yield">${IND.postKind(s, post).icon} ${esc(post.name)}</span>`, `<span class="muted">${IND.postKind(s, post).name} · protecteur : ${post.patron === null ? 'aucun' : esc(s.players[post.patron].name)}</span>`);
  const mk = markerAt(i);
  if (mk && !b) {
    const adj = mk.plan ? Object.fromEntries(Object.entries(G.adjacencyBonus(s, 0, mk.plan, mk.i % s.map.width, Math.floor(mk.i / s.map.width), plannedMap())).filter(([, v]) => v)) : {};
    lines.push(`<span class="chip">${esc(markerName(mk))}</span>${Object.keys(adj).length ? ` <span class="muted">adjacence prévue ${chipsText(adj)}</span>` : ''}`);
  }
  if (CUL.isHeritage(s, t.x, t.y)) lines.push('<span class="chip yield">Patrimoine mondial</span>');
  if (t.luxury && !b) lines.push(`<span class="chip yield"><i style="background:${resColor(t.luxury)}"></i>${data.resources[t.luxury].name} (ressource rare)</span>`);
  if (b) {
    const def = G.buildingDef(s, b.type);
    const adj = G.adjacencyBonus(s, b.owner, b.type, b.x, b.y);
    const prod = def.process ? `${G.fmtBundle(s, def.process.in)} → ${G.fmtBundle(s, def.process.out)}` : chipsText(def.yields);
    lines.push(`${def.name}${b.turnsLeft > 0 ? ` <span class="muted">(${b.turnsLeft} tour(s))</span>` : ''}`);
    if (prod) lines.push(`<span class="muted">${prod}${bonusSum(adj) > 0 ? ` · adjacence ${chipsText(Object.fromEntries(Object.entries(adj).filter(([, v]) => v)))}` : ''}</span>`);
  }
  for (const u of units.slice(0, 3)) lines.push(`<span class="muted">${G.unitDef(s, u.type).name} · ${esc(s.players[u.owner].name)}</span>`);
  tip.innerHTML = lines.join('<br>');
  tip.style.left = `${x + 16}px`; tip.style.top = `${y + 16}px`;
  tip.hidden = false;
}

function nextUnit() {
  const waiting = waitingUnits();
  const mine = waiting.length ? waiting : s.units.filter((u) => u.owner === 0 && u.movesLeft > 0 && !u.target && !u.sleep);
  if (!mine.length) { toast('Toutes vos unités ont agi.'); return; }
  const cur = sel?.kind === 'unit' ? mine.findIndex((u) => u.id === sel.id) : -1;
  const u = mine[(cur + 1) % mine.length];
  select({ kind: 'unit', id: u.id });
  renderer.focus(u.x, u.y);
}

function foundSelected() {
  if (sel?.kind !== 'unit') return;
  const r = G.foundCity(s, sel.id);
  if (!r.ok) { toast(r.reason, 'bad'); return; }
  toast(`${r.city.name} est fondée !`, 'good');
  sel = { kind: 'city', id: r.city.id };
  refreshWorld(); save();
}

function endTurn() {
  if (s.winner) { showEnd(); return; }
  const waiting = waitingUnits();
  if (blockEnd && waiting.length) {
    const u = sel?.kind === 'unit' && waiting.find((x) => x.id === sel.id) ? waiting.find((x) => x.id === sel.id) : waiting[0];
    select({ kind: 'unit', id: u.id });
    renderer.focus(u.x, u.y);
    toast(`${waiting.length > 1 ? `${waiting.length} unités attendent` : 'Une unité attend'} vos ordres : déplacez-la, passez son tour ou mettez-la en veille.`, 'bad');
    return;
  }
  closeModal();
  mode = null;
  const before = snapshot();
  Sound.sfx.endTurn();
  playAITurns(s);
  G.endRound(s);
  save();
  refreshWorld();
  if (s.winner) { showEnd(); return; }
  showSummary(before);
  if (!me().research && G.availableTechs(s, 0).length) toast('Choisissez une recherche (T).');
  const props = s.proposals.filter((p) => p.to === 0).length;
  const evs = myEvents().filter((pe) => pe.turn === s.turn).length;
  if (props) toast(`${props} proposition(s) diplomatique(s) en attente.`);
  if (evs) toast(`Événement : ${D.eventDef(s, myEvents().find((pe) => pe.turn === s.turn).ev).title}. Votre décision est attendue.`);
  if ((props || evs) && document.documentElement.classList.contains('compact')) setSide(true); // le tiroir s'ouvre quand une IA ou un événement vous sollicite
  if (s.congress?.status === 'open' && s.congress.votes[0] === undefined) { Sound.sfx.congress(); showCongress(); }
  else if (crisisPending()) { Sound.sfx.congress(); showCrisis(); }
  else if (expoPending() && s.expo.turn - s.turn === s.rules.expos.bidLead) showExpo();
  const offers = myContracts().filter((c) => c.status === 'offered' && c.turn === s.turn).length;
  if (offers) toast(`${s.players[myContracts().find((c) => c.status === 'offered').from].name} vous propose un contrat.`);
}

// ---------------------------------------------------------------- modales
let lastFocus = null;
// Les boutons « disabled » n'émettent aucun événement : on les remplace par aria-disabled, qui garde le même
// aspect grisé mais reste touchable (et focalisable au clavier), pour pouvoir expliquer pourquoi l'action est impossible.
function softDisable(root) {
  root.querySelectorAll('button[disabled]').forEach((b) => { b.disabled = false; b.setAttribute('aria-disabled', 'true'); });
}
function openModal(html) {
  const m = $('#modal');
  if (m.hidden) lastFocus = document.activeElement;
  m.innerHTML = html; m.hidden = false; softDisable(m); m.querySelector('button, select, input')?.focus();
}
function closeModal() {
  const m = $('#modal'); m.hidden = true; m.innerHTML = '';
  if (s) renderTutorial();
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  lastFocus = null;
}
// Piège à focus : Tab reste dans la fenêtre ouverte.
document.addEventListener('keydown', (e) => {
  const m = $('#modal');
  if (e.key !== 'Tab' || m.hidden) return;
  const items = [...m.querySelectorAll('button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])')];
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// ------------------------------------------------------------ encyclopédie
function showEncyclopedia(tab = 'buildings') {
  const tabs = { buildings: 'Bâtiments', units: 'Unités', techs: 'Technologies', policies: 'Politiques', profiles: 'Profils', nature: 'Nature et événements', resources: 'Ressources', rules: 'Règles' };
  const cost = (c) => Object.entries(c || {}).map(([k, v]) => `${v} ${data.resources[k].name}`).join(', ');
  let body = '';
  if (tab === 'buildings') {
    body = '<div class="enc-item"><div class="muted">Planifiez vos quartiers avec l\'onglet <b>Repères</b> de la barre de construction (touche K) : un bâtiment prévu s\'affiche en fantôme et compte comme voisin dans les aperçus d\'adjacence, avant même d\'avoir la technologie ou les ressources.</div></div>' + data.buildings.map((d) => `<div class="enc-item"><div class="vhead"><b>${d.name}${d.wonder ? ' <span class="tag warn">Merveille</span>' : ''}${d.footprint ? ' <span class="tag">2×2</span>' : ''}</b><span class="muted">${d.tech ? G.techDef(s, d.tech).name : 'Disponible'}</span></div>
      <div class="muted">${d.desc}</div><div class="enc-line">Coût : ${cost(d.cost)} · ${d.turns} tour(s)${d.upkeep ? ` · entretien ${d.upkeep} Or` : ''}</div>
      <div class="enc-line">${d.process ? `Transforme ${G.fmtBundle(s, d.process.in)} en ${G.fmtBundle(s, d.process.out)}` : chipsText(d.yields) || '—'}${d.prestige ? ` · +${d.prestige} prestige` : ''}</div>
      <div class="enc-line">Terrain : ${d.terrain.map((k) => data.terrain[k].name).join(', ')}${d.coastal ? ' (côtier)' : ''}${d.perCity ? ` · max ${d.perCity} par ville` : ''}</div>
      ${d.adjacency ? `<div class="enc-line good">Adjacence : ${describeAdjacency(d)}</div>` : ''}</div>`).join('');
  } else if (tab === 'units') {
    body = data.units.map((d) => `<div class="enc-item"><div class="vhead"><b>${d.name}</b><span class="muted">${d.tech ? G.techDef(s, d.tech).name : 'Disponible'}</span></div>
      <div class="muted">${d.desc}</div><div class="enc-line">Coût : ${cost(d.cost)} · ${d.moves} mouvements · vision ${d.vision}${d.naval ? ' · naval' : ''}${d.flying ? ' · aérien' : ''}</div></div>`).join('');
  } else if (tab === 'techs') {
    body = Object.entries(BRANCHES).map(([k, v]) => `<div class="stock-group">${v}</div>` + data.techs.filter((t) => t.branch === k).map((t) => `<div class="enc-item"><div class="vhead"><b>${t.name}</b><span class="muted">${Math.round(t.cost * (s.rules.techCostScale ?? 1))} science · palier ${t.tier}</span></div><div class="muted">${t.desc}${t.requires.length ? ` · requiert ${t.requires.map((r) => G.techDef(s, r).name).join(', ')}` : ''}</div></div>`).join('')).join('');
  } else if (tab === 'policies') {
    body = `<div class="enc-item"><div class="muted">Emplacements : ${data.policies.slots.map((t) => `${t.slots} à ${t.techs} technologies`).join(', ')}. Remplacer une politique coûte ${G.fmtBundle(s, data.policies.swapCost)}.</div></div>`
      + Object.entries(BRANCHES).map(([k, v]) => `<div class="stock-group">${v}</div>` + data.policies.list.filter((d) => d.branch === k).map((d) => `<div class="enc-item"><div class="vhead"><b>${d.name}</b><span class="muted">${d.tech ? G.techDef(s, d.tech).name : 'Disponible'}</span></div><div class="muted">${d.desc}</div></div>`).join('')).join('');
  } else if (tab === 'profiles') {
    body = data.profiles.map((p) => `<div class="enc-item"><div class="vhead"><b>${p.name}</b><span class="muted">${data.buildingsById[p.unique]?.name || ''}</span></div><div class="muted">${p.desc}</div>
      <div class="enc-line">Bâtiment : ${data.buildingsById[p.unique]?.desc || '—'}</div><div class="enc-line good">Capacité « ${p.ability.name} » : ${p.ability.desc} Recharge ${p.ability.cooldown} tours.</div></div>`).join('');
  } else if (tab === 'nature') {
    const NW = s.rules.naturalWonders, RU = s.rules.ruins;
    body = `<div class="stock-group">Merveilles naturelles</div><div class="enc-item"><div class="muted">Uniques et réparties sur la carte. Les découvrir rapporte ${NW.firstPrestige} prestige au premier, ${NW.laterPrestige} aux suivants. Dans votre territoire : leur rendement et +${NW.ownedPrestige} prestige. Tout bâtiment voisin gagne ${chipsText(NW.adjacency)}. On ne construit pas dessus.</div></div>`
      + NW.list.map((d) => `<div class="enc-item"><div class="vhead"><b>${d.name}</b><span class="muted">${d.terrain.map((k) => data.terrain[k].name).join(', ')}</span></div><div class="muted">${d.desc}</div><div class="enc-line">${chipsText(d.yields)}</div></div>`).join('')
      + `<div class="stock-group">Régions</div><div class="enc-item"><div class="muted">La carte est divisée en grandes régions climatiques. Chaque ressource rare ne se trouve que dans une ou deux régions : il faut commercer pour toutes les avoir.</div></div>`
      + Object.entries(s.rules.regions).map(([k, r]) => `<div class="enc-item"><div class="vhead"><b>${r.name}</b></div><div class="muted">${G.LUXURIES.filter((l) => s.rules.luxuries.types[l].regions.includes(k)).map((l) => data.resources[l].name).join(', ') || '—'}</div></div>`).join('')
      + `<div class="stock-group">Rivières</div><div class="enc-item"><div class="muted">Elles descendent des collines vers la mer. Une ville au bord d'une rivière gagne ${chipsText(s.rules.river.cityYield)}. Un bâtiment construit sur une rivière gagne ${chipsText(s.rules.river.buildingYield)} (et +${s.rules.river.farmFood} Nourriture pour une ferme). Le Moulin à eau et le port fluvial s'y construisent. On s'y déplace plus vite (coût ${s.rules.river.moveCost}).</div></div>`
      + `<div class="stock-group">Ruines antiques</div><div class="enc-item"><div class="muted">Une unité qui entre dans des ruines les fouille et trouve au hasard : ${RU.rewards.map((r) => r.text).join(', ')}.</div></div>`
      + `<div class="stock-group">Événements</div><div class="enc-item"><div class="muted">Tous les ${data.events.every[0]} à ${data.events.every[1]} tours environ, un événement vous propose un choix (sécheresse, comète, savant exilé…). Sans réponse au bout de ${data.events.expireAfter} tours, le choix le plus raisonnable est fait pour vous.</div></div>`;
  } else if (tab === 'resources') {
    body = Object.entries(data.resources).map(([k, r]) => `<div class="enc-item"><div class="vhead"><b><i class="dot" style="display:inline-block;background:${r.color}"></i> ${r.name}</b><span class="muted">valeur d'échange ${r.tradeValue}</span></div>${r.desc ? `<div class="muted">${r.desc}</div>` : ''}</div>`).join('')
      + `<div class="stock-group">Terrains</div>` + Object.values(data.terrain).map((t) => `<div class="enc-item"><b>${t.name}</b> <span class="muted">· ${t.passable ? `déplacement ${t.move}` : 'impraticable'}</span></div>`).join('');
  } else {
    const R = s.rules;
    body = `<div class="enc-item"><b>Victoire</b><div class="muted">Premier à ${R.prestigeTarget} prestige, ou une voie complète : Science (Observatoire Céleste + ${R.victory.scienceTechs} technologies), Culture (Amphithéâtre + ${R.victory.cultureTotal} culture), Économie (Grande Bourse + ${R.victory.economyGold} Or), Diplomatie (élu ${R.victory.secretaryWins} fois Secrétaire et allié de la moitié des rivaux, ou allié de tous et élu ${R.victory.allyAllElections ?? 1} fois). Sinon, meilleur prestige au tour ${R.turnLimit}.</div></div>
      <div class="enc-item"><b>Paliers de population</b><div class="muted">${R.tiers.map((t) => `${t.name}${t.minPop ? ` (${t.minPop} hab., ${G.fmtBundle(s, t.needs)} / tour)` : ''}`).join(' → ')}</div></div>
      <div class="enc-item"><b>Diplomatie</b><div class="muted">Voisins méfiants : ${Math.round(R.malus.waryPct * 100)} % de productivité, hostiles : ${Math.round(R.malus.hostilePct * 100)} %. Alliance : +${Math.round(R.alliance.pct * 100)} % Or, Science, Culture. Accord commercial : +${R.tradeAgreement.gold} Or/tour.</div></div>
      <div class="enc-item"><b>Congrès mondial</b><div class="muted">Tous les ${R.congress.every} tours : une résolution (durée ${R.congress.duration} tours) et l'élection du Secrétaire (+${R.congress.secretaryPrestige} prestige).</div></div>
      <div class="enc-item"><b>Contrats commerciaux</b><div class="muted">Une IA demande une livraison (${s.rules.contracts.duration} tours pour livrer) contre de l'Or, +${s.rules.contracts.relation} relation et +${s.rules.contracts.prestige} prestige. Un contrat accepté puis non honoré coûte ${s.rules.contracts.failRelation} relation.</div></div>
      <div class="enc-item"><b>Influence culturelle</b><div class="muted">Votre culture s'accumule en influence. À ${s.rules.influence.baseCost} points (+${s.rules.influence.costPerClaim} par case déjà annexée), votre territoire s'étend d'une case neutre voisine. Si votre culture dépasse ${s.rules.influence.flipFactor} fois celle d'un voisin, vous pouvez attirer une case de sa frontière (sans bâtiment, coût doublé, ${s.rules.influence.flipRelation} relation).</div></div>
      <div class="enc-item"><b>Crise mondiale</b><div class="muted">Vers le milieu de la partie, une crise frappe tous les pays. Un Congrès extraordinaire réunit les contributions (objectif ${s.rules.crisis.goalPerPlayer} Or par pays). Atteint : la crise s'arrête et les contributeurs gagnent du prestige. Manqué : elle dure ${s.rules.crisis.failTurns} tours, et personne ne paie.</div></div>
      <div class="enc-item"><b>Saisons</b><div class="muted">Chaque saison dure ${R.seasons.turns} tours : ${R.seasons.list.map((x) => `${x.name} (${Object.entries(x.yieldPct).map(([k, v]) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} % ${data.resources[k].name}`).join(', ')}${x.northMove ? ', chemins enneigés au nord' : ''})`).join(', ')}.</div></div>
      <div class="enc-item"><b>Pollution</b><div class="muted">Les ateliers polluent leur ville (${Object.entries(R.pollution.emitters).map(([k, v]) => `${G.buildingDef(s, k).name} ${v}`).join(', ')}). Un Parc absorbe ${R.pollution.park} points, chaque forêt du territoire ${R.pollution.forestAbsorb} (au plus ${R.pollution.forestMax}). Chaque point restant coûte ${R.pollution.food} Nourriture et ${R.pollution.culture} Culture.</div></div>
      <div class="enc-item"><b>Santé et migrations</b><div class="muted">${R.health.map((h) => `Au-delà de ${h.pop} habitants, une ville a besoin d'un ${G.buildingDef(s, h.building).name}`).join(' ; ')}. Tous les ${R.migration.every} tours, des habitants quittent la ville la moins attrayante pour la plus attrayante, y compris chez un voisin. L'attractivité dépend du palier, de la culture, du tourisme, d'une rivière, de la pollution et de la santé.</div></div>
      <div class="enc-item"><b>Défis scientifiques</b><div class="muted">Objectifs ouverts à tous : le premier qui en remplit un gagne du prestige et de la Science. ${R.challenges.map((c) => `${c.name} (${c.desc.toLowerCase().replace(/\.$/, '')})`).join(' ; ')}.</div></div>
      <div class="enc-item"><b>Œuvres d'art</b><div class="muted">Elles se commandent dans la fenêtre Culture (touche C) et s'exposent dans un Théâtre, un Monument, un Quartier des arts ou l'Amphithéâtre. Chacune rapporte de la Culture et du tourisme, et peut être prêtée à un voisin (${R.artworks.loanTurns} tours, +${R.artworks.loanRelation} relation, loyer de ${R.artworks.loanRent} Or par tour).</div></div>
      <div class="enc-item"><b>Patrimoine mondial et tourisme</b><div class="muted">Un site classé est protégé contre l'influence des voisins et attire des visiteurs. Le tourisme vient des merveilles naturelles, des merveilles, des théâtres, des œuvres, du patrimoine et du rayonnement culturel. Il rapporte ${R.tourism.goldPerPoint} Or par point et par tour, et 1 prestige tous les ${R.tourism.prestigePer} points cumulés.</div></div>
      <div class="enc-item"><b>Traités</b><div class="muted">Deux pays signent pour ${R.treaties.durations.join(' ou ')} tours un traité avec les clauses de leur choix : ${Object.values(R.treaties.clauses).map((c) => `${c.name} (${c.desc.toLowerCase()})`).join(' ; ')}. Chaque traité donne +${R.treaties.relationPerTurn} relation par tour et +${R.treaties.prestige} prestige. Le rompre avant l'échéance coûte ${R.treaties.breakPenalty} relation. À l'échéance, on le renégocie.</div></div>
      <div class="enc-item"><b>Expositions universelles et Jeux</b><div class="muted">Tous les ${R.expos.every} tours environ. Deux tours avant, on peut se porter candidat pour accueillir l'événement (hôte : +${R.expos.hostPrestige} prestige, +${R.expos.hostCulture} Culture) et choisir sa participation au concours (1er +${R.expos.winPrestige[0]} prestige, 2e +${R.expos.winPrestige[1]}). L'Exposition récompense l'industrie, les ressources rares et la science ; les Jeux, la population et la culture.</div></div>
      <div class="enc-item"><b>Normes communes</b><div class="muted">À chaque Congrès, une norme est proposée. Elle entre en vigueur dès 2 signataires, et l'on peut y adhérer à un Congrès suivant : ${R.standards.map((d) => `${d.name} (${d.desc.toLowerCase()})`).join(' ; ')}</div></div>
      <div class="enc-item"><b>Marché mondial</b><div class="muted">Les cours sont communs à tous les joueurs : chaque vente fait baisser le cours, chaque achat le fait monter, et il revient peu à peu vers un niveau qui dépend de la rareté (nombre de producteurs). Avec une Halle marchande, on vend à ${Math.round(R.market.baseRate * 100)} % du cours et on achète avec une marge de ${Math.round((R.economy.buySpread - 1) * 100)} %, si un autre joueur produit la ressource.</div></div>
      <div class="enc-item"><b>Bulles et monopoles</b><div class="muted">De temps en temps, une ressource devient à la mode : son cours s'envole pendant quelques tours, puis la bulle éclate. Le seul producteur d'une ressource rare détient un monopole : il la vend ${Math.round(R.economy.monopolyBonus * 100)} % plus cher, les autres la paient plus cher, et il touche une part de leurs achats.</div></div>
      <div class="enc-item"><b>Ligue marchande</b><div class="muted">Une seule par partie (${G.techDef(s, R.league.tech).name}, ${G.fmtBundle(s, R.league.foundCost)}). Cotisation de ${R.league.dues} Or par tour. Les routes entre membres rapportent +${R.league.routeGold} Or et +${R.league.routePrestige} prestige, et les ventes à la Halle sont payées ${Math.round(R.league.sellBonus * 100)} % de plus. Un conflit ouvert entre membres (relation sous ${R.league.excludeBelow}), une cotisation impayée ou un contrat non honoré vaut l'exclusion.</div></div>
      <div class="enc-item"><b>Grands personnages</b><div class="muted">Vos rendements remplissent quatre jauges (touche G). Une jauge pleine fait venir un grand personnage, que l'on emploie quand on veut : ${Object.values(R.greatPeople.kinds).map((k) => `${k.name} — ${k.desc}`).join(' ')}</div></div>
      <div class="enc-item"><b>Ambitions secrètes</b><div class="muted">Option de partie. Chacun reçoit ${R.ambitions.hand} cartes d'objectif cachées, toutes facultatives. On en joue au plus ${R.ambitions.maxActive} à la fois ; seule une carte jouée rapporte son prestige, puis on en pioche une autre. Une défausse tous les ${R.ambitions.discardCooldown} tours. Avec les ambitions, l'objectif de prestige est un peu plus haut. Cartes : ${R.ambitions.cards.map((c) => c.name).join(', ')}.</div></div>
      <div class="enc-item"><b>Vocations des villes</b><div class="muted">À ${R.vocations.minPop} habitants, une ville choisit une vocation (changement : ${G.fmtBundle(s, R.vocations.changeCost)}, au plus tous les ${R.vocations.cooldown} tours) : ${Object.values(R.vocations.list).map((v) => `${v.name} (${v.desc})`).join(' · ')}</div></div>
      <div class="enc-item"><b>Catastrophes</b><div class="muted">Option de partie, à partir du tour ${R.disasters.grace}. ${Object.values(R.disasters.list).map((d) => `${d.name} : ${d.desc}`).join(' ')} Un bâtiment endommagé se répare pour ${G.fmtBundle(s, R.disasters.repairCost)}.</div></div>
      <div class="enc-item"><b>Aménagement du territoire</b><div class="muted">Sélectionnez une case libre de votre territoire : ${Object.values(R.terraform.actions).map((a) => `${a.name} (${G.fmtBundle(s, a.cost)}) — ${a.desc}`).join(' · ')}</div></div>
      <div class="enc-item"><b>Ères</b><div class="muted">${R.eras.list.map((e) => `${e.name} (${e.techs} technologies) : ${e.desc}`).join(' ')} Chaque nouvelle ère rapporte ${R.eras.prestige} prestige et ouvre gouvernements, merveille d'ère, Musée (Renaissance), Archéologue (Renaissance) et Agent (ère industrielle).</div></div>
      <div class="enc-item"><b>Gouvernements</b><div class="muted">Dans la fenêtre Politiques. Changement : ${G.fmtBundle(s, R.governments.changeCost)}, au plus tous les ${R.governments.cooldown} tours. ${R.governments.list.map((g) => `${g.name} (${R.eras.list[g.era].name}, doctrine ${g.doctrine}) : ${g.desc}`).join(' · ')}</div></div>
      <div class="enc-item"><b>Archéologie</b><div class="muted">Des sites antiques parsèment la carte. Un Archéologue qui en atteint un exhume un artefact (+${R.artworks.kinds.artifact.culture} Culture et +${R.artworks.kinds.artifact.tourism} tourisme par tour, +${R.archaeology.prestige} prestige), à condition d'avoir une place d'exposition libre (le Musée en offre ${R.artworks.slots.museum}). Fouiller chez un voisin non allié le froisse (${R.archaeology.foreignRelation} relation).</div></div>
      <div class="enc-item"><b>Comptoirs indépendants</b><div class="muted">${Object.values(R.independents.kinds).map((k) => `${k.name} : ${k.desc}`).join(' ')} Faveur : cadeau (${G.fmtBundle(s, R.independents.gift.cost)} → +${R.independents.gift.favor}), caravane (+${R.independents.caravanFavor}), émissaire (+${R.independents.emissaryFavor}), culture des villes proches ; elle s'érode de ${R.independents.decay} par tour. Le protecteur doit avoir au moins ${R.independents.patronMin} de faveur et la plus haute ; il gagne +${R.independents.prestige} prestige. On ne fonde pas de ville à ${R.independents.noCityRadius} cases ou moins.</div></div>
      <div class="enc-item"><b>Espionnage industriel</b><div class="muted">Un Agent entré dans une ville étrangère copie une technologie (la plus simple que vous puissiez apprendre) ou retarde un chantier de ${R.espionage.delayTurns} tours. Risque d'être repéré : ${Math.round(R.espionage.detect * 100)} % (+${Math.round(R.espionage.chanceryDetect * 100)} % chez un joueur qui a une Chancellerie) ; repéré, c'est un incident diplomatique (${R.espionage.incident} relation) et, une fois sur deux, l'échec de la mission.</div></div>
      <div class="enc-item"><b>Mouvements culturels</b><div class="muted">À partir du tour ${R.movements.firstTurn}, un mouvement naît au plus tous les ${R.movements.gap} tours dans la capitale du pays le plus cultivé de son ère, puis se propage de ville en ville (proximité, culture, routes commerciales, alliances). Chaque pays y adhère (au plus ${R.movements.maxAdopted} à la fois ; propagation ×${R.movements.adoptBoost} chez lui), reste neutre ou l'interdit (propagation ×${R.movements.banFactor}). Le fondateur gagne ${R.movements.foundPrestige} prestige, puis ${R.movements.foreignPrestige} par ville étrangère gagnée (au plus ${R.movements.foreignCap}). ${R.movements.list.map((m) => `${m.name} (${R.eras.list[m.era].name}) : ${m.desc}`).join(' · ')}</div></div>`;
  }
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Encyclopédie"><header><h2>Encyclopédie</h2><button class="btn" data-action="close">Fermer</button></header>
    <div class="tabs" role="tablist">${Object.entries(tabs).map(([k, v]) => `<button class="tab" role="tab" aria-selected="${k === tab}" data-action="enc-tab" data-tab="${k}">${v}</button>`).join('')}</div>
    <div class="enc-body">${body}</div></div>`);
}

function showTech() {
  const p = me();
  const y = G.computeYields(s, 0).net.science;
  const avail = new Set(G.availableTechs(s, 0).map((t) => t.id));
  const col = (branch) => data.techs.filter((t) => t.branch === branch).sort((a, b) => a.tier - b.tier).map((t) => {
    const done = p.techs.includes(t.id);
    const cur = p.research === t.id;
    const cls = done ? 'done' : cur ? 'current' : avail.has(t.id) ? 'available' : 'locked';
    const cost = G.techCost(s, 0, t.id);
    const eta = !done ? Math.max(0, Math.ceil((cost - p.sciencePool) / Math.max(0.1, y))) : 0;
    const req = t.requires.map((r) => G.techDef(s, r).name).join(', ');
    return `<button class="tech ${cls}" data-action="research" data-id="${t.id}" ${cls === 'locked' || done ? 'aria-disabled="true"' : ''}>
      <b>${t.name}</b><span class="muted">${t.desc}</span>
      <div class="meta"><span>${done ? 'Acquise' : cur ? `En cours · ${eta} tour(s)` : `${cost} science${cost < Math.round(t.cost * (s.rules.techCostScale ?? 1)) ? ' (allié −25 %)' : ''}`}</span><span>${!done && req ? `Requiert ${req}` : `Palier ${t.tier}`}</span></div></button>`;
  }).join('');
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Technologies"><header><div><h2>Technologies</h2>
    <div class="muted" style="font-size:13px;margin-top:2px">Science disponible : ${fmt(p.sciencePool)} · ${sign(y)} / tour · chaque technologie rapporte ${s.rules.prestige.perTechTier} prestige par palier</div></div>
    <button class="btn" data-action="close">Fermer</button></header>
    <div class="tech-grid">${Object.entries(BRANCHES).map(([k, v]) => `<div class="branch"><h4>${v}</h4>${col(k)}</div>`).join('')}</div></div>`);
}

let policyPick = null; // emplacement en cours de choix
function showPolicies() {
  const p = me();
  const slots = D.policySlots(s, 0);
  const pol = p.policies || [];
  const next = (data.policies.slots || []).find((t) => t.slots > slots);
  const swap = G.fmtBundle(s, data.policies.swapCost);
  if (policyPick === null || policyPick >= slots) policyPick = pol.slice(0, slots).findIndex((x) => !x);
  if (policyPick < 0) policyPick = 0;
  const slotHtml = Array.from({ length: Math.max(3, slots) }, (_, i) => {
    if (i >= slots) {
      const t = (data.policies.slots || []).find((x) => x.slots > i);
      return `<div class="policy-slot locked"><span class="muted">Emplacement ${i + 1}</span><b>Verrouillé</b><span class="muted">${t ? `à ${t.techs} technologies` : ''}</span></div>`;
    }
    const def = pol[i] ? D.policyDef(s, pol[i]) : null;
    return `<button class="policy-slot ${def ? `b-${def.branch}` : 'empty'}" data-action="policy-pick" data-slot="${i}" aria-pressed="${policyPick === i}"><span class="muted">Emplacement ${i + 1}</span><b>${def ? esc(def.name) : 'Libre'}</b><span class="muted">${def ? esc(def.desc) : 'Choisissez une politique ci-dessous'}</span></button>`;
  }).join('');
  const current = pol[policyPick] || null;
  const list = Object.entries(BRANCHES).map(([k, v]) => `<div class="branch"><h4>${v}</h4>` + data.policies.list.filter((d) => d.branch === k).map((d) => {
    const unlocked = D.policyUnlocked(s, 0, d);
    const adopted = pol.includes(d.id);
    const cost = current && !adopted ? ` · changement : ${swap}` : '';
    return `<button class="tech policy ${adopted ? 'done' : unlocked ? 'available' : 'locked'}" data-action="policy-set" data-slot="${policyPick}" data-policy="${d.id}" ${!unlocked || adopted ? 'aria-disabled="true"' : ''}>
      <b>${esc(d.name)}</b><span class="muted">${esc(d.desc)}</span><div class="meta"><span>${adopted ? 'Adoptée' : unlocked ? `Adopter${cost}` : `Nécessite ${G.techDef(s, d.tech).name}`}</span></div></button>`;
  }).join('') + '</div>').join('');
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Politiques"><header><div><h2>Politiques</h2>
    <div class="muted" style="font-size:13px;margin-top:2px">${slots} emplacement(s)${next ? ` · le suivant s'ouvre à ${next.techs} technologies` : ''}. Remplir un emplacement libre est gratuit ; remplacer une politique coûte ${swap}.</div></div>
    <button class="btn" data-action="close">Fermer</button></header>
    ${governmentHtml()}
    <div class="policy-slots">${slotHtml}</div>
    ${current ? `<div class="row" style="margin:6px 0 10px"><button class="btn small" data-action="policy-set" data-slot="${policyPick}" data-policy="">Libérer l'emplacement ${policyPick + 1}</button></div>` : ''}
    <div class="tech-grid">${list}</div></div>`);
}

// Gouvernement : un régime par ère, chacun avec sa doctrine (bonus, contrepartie, parfois un emplacement de plus).
function governmentHtml() {
  const Gv = s.rules.governments;
  if (!Gv) return '';
  const cur = AGE.governmentOf(s, 0);
  return `<div class="section-title" style="margin-top:4px"><span>Gouvernement</span><span>${esc(cur.name)} · doctrine ${esc(cur.doctrine)}</span></div>
    <div class="voc-grid gov-grid">${Gv.list.map((g) => { const chk = AGE.canSetGovernment(s, 0, g.id), on = cur.id === g.id;
      return `<button class="voc ${on ? 'on' : ''}" data-action="government" data-gov="${g.id}" aria-pressed="${on}" ${chk.ok || on ? '' : 'aria-disabled="true"'} title="${esc(`${g.desc}${chk.ok || on ? '' : `\n${chk.reason}`}`)}"><b>${esc(g.name)}</b><span>${esc(AGE.eraDef(s, g.era).name)} · ${esc(g.doctrine)}</span><span>${esc(g.desc)}</span></button>`; }).join('')}</div>
    <div class="reason">Changer de gouvernement coûte ${G.fmtBundle(s, Gv.changeCost)}, au plus tous les ${Gv.cooldown} tours.</div>`;
}

function treatyForm(q) {
  const T = s.rules.treaties;
  if (!T) return '';
  if (SUM.treatyBetween(s, 0, q.id)) return `<div class="treaty-row"><button class="btn small" data-action="treaty-break" data-id="${q.id}" title="Rompre avant l'échéance : ${T.breakPenalty} relation">Rompre le traité</button></div>`;
  return `<details class="treaty-row"><summary>Proposer un traité</summary>
    <div class="treaty-clauses">${Object.entries(T.clauses).map(([k, c]) => `<label class="check small" title="${esc(c.desc)}"><input type="checkbox" name="clause-${q.id}" value="${k}" ${k === 'tariffs' ? 'checked' : ''}> ${c.name}</label>`).join('')}</div>
    <div class="row"><label class="field small">Durée <select id="treaty-dur-${q.id}">${T.durations.map((d) => `<option value="${d}">${d} tours</option>`).join('')}</select></label>
    <button class="btn small" data-action="treaty-propose" data-id="${q.id}" title="Relation requise : ${T.baseRelation} + ${T.perClause} par clause">Proposer</button></div></details>`;
}

function postsBox() {
  const list = (s.posts || []).filter((post) => G.isExplored(s, 0, post.x, post.y));
  if (!list.length) return '';
  const I = s.rules.independents;
  return `<div class="card civ"><h3>Comptoirs indépendants</h3><div class="muted" style="font-size:13px">On ne les conquiert pas : on les courtise (caravanes, émissaires, cadeaux, culture). Le plus apprécié, au-delà de ${I.patronMin} de faveur, devient leur protecteur.</div>
    <div class="city-blds">${list.map((post) => { const K = IND.postKind(s, post);
      return `<div class="mem"><span>${K.icon} <b>${esc(post.name)}</b> <span class="muted">· ${K.name} · protecteur : ${post.patron === null ? 'aucun' : esc(s.players[post.patron].name)} · votre faveur ${Math.floor(IND.favorOf(post, 0))}</span></span><button class="btn small" data-action="post-gift" data-id="${post.id}" ${IND.canGift(s, 0, post.id).ok ? '' : 'disabled'}>Offrir ${G.fmtBundle(s, I.gift.cost)}</button></div>`; }).join('')}</div></div>`;
}

function leagueBox() {
  const L = s.rules.league, lg = s.league;
  const perks = `cotisation ${L.dues} Or/tour · +${L.routeGold} Or et +${L.routePrestige} prestige par route entre membres · ventes +${Math.round(L.sellBonus * 100)} %`;
  if (!lg) {
    const can = ECO.canFoundLeague(s, 0);
    return `<div class="league card"><b>Ligue marchande</b> <span class="muted">— aucune pour l'instant. ${perks}.</span>
      <button class="btn small ${can.ok ? 'primary' : ''}" data-action="league-found" ${can.ok ? '' : 'aria-disabled="true"'} title="${esc(can.ok ? `Fonder la ligue : ${G.fmtBundle(s, L.foundCost)}, +${L.foundPrestige} prestige` : can.reason)}">Fonder (${G.fmtBundle(s, L.foundCost)})</button></div>`;
  }
  return `<div class="league card"><b>Ligue marchande</b> <span class="muted">fondée au tour ${lg.turn} · ${perks}.</span>
    <div class="league-members">${lg.members.map((m) => `${avatar(s.players[m], 22)} ${esc(s.players[m].name)}${m === lg.founder ? ' <span class="muted">(fondateur)</span>' : ''}`).join(' · ')}</div>
    ${ECO.inLeague(s, 0) ? '<button class="btn small" data-action="league-leave">Quitter la Ligue</button>' : '<span class="muted">Un membre peut vous inviter.</span>'}</div>`;
}

function showDiplo() {
  Tuto.flag(s, 'diplo');
  const resOpts = (sel0) => G.STOCK.map((k) => `<option value="${k}" ${k === sel0 ? 'selected' : ''}>${data.resources[k].name}</option>`).join('');
  const dip = G.diplomacyPct(s, 0);
  const cards = s.players.filter((p) => p.id !== 0).map((q) => {
    const rel = Math.round(G.getRel(s, 0, q.id));
    const st = G.relStatus(rel);
    const agr = G.hasAgreement(s, 0, q.id), all = G.isAllied(s, 0, q.id), nb = G.areNeighbors(s, 0, q.id);
    const routes = s.tradeRoutes.filter((r) => (r.a === 0 && r.b === q.id) || (r.a === q.id && r.b === 0)).length;
    const pers = G.personalityOf(s, q.id);
    const mem = G.memoriesOf(s, q.id, 0).slice(-4).reverse();
    const promised = s.promises.some((pr) => pr.from === 0 && pr.to === q.id);
    const nProj = G.projectsBetween(s, 0, q.id);
    return `<div class="card civ"><h3>${avatar(q, 44)}${esc(q.name)} <span class="muted" style="font-weight:400;font-size:13px">· ${data.profilesById[q.profile].name} · ${q.prestige} prestige</span></h3>
      ${pers ? `<div class="pers" title="${esc(pers.desc)}">Personnalité <b>${pers.name}</b> — ${esc(pers.desc)}</div>` : ''}
      <div class="rel" aria-label="Relation ${rel}"><span style="left:${(rel + 100) / 2}%"></span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:12px"><span class="tag ${st.tone}">${st.label} (${rel})</span>
        ${all ? '<span class="tag good">Alliance</span>' : ''}${agr ? '<span class="tag good">Accord commercial</span>' : ''}
        ${routes ? `<span class="tag good">${routes} route(s)</span>` : ''}${nb ? '<span class="tag warn">Voisin</span>' : ''}
        ${G.hasEmbassy(s, 0, q.id) ? '<span class="tag good">Votre ambassade</span>' : ''}${G.hasEmbassy(s, q.id, 0) ? '<span class="tag neutral">Son ambassade</span>' : ''}
        ${promised ? '<span class="tag warn">Promesse : pas de ville près de chez lui</span>' : ''}${ECO.inLeague(s, q.id) ? '<span class="tag good">Ligue marchande</span>' : ''}
        ${(() => { const t = SUM.treatyBetween(s, 0, q.id); return t ? `<span class="tag good" title="${esc(t.clauses.map((c) => `${s.rules.treaties.clauses[c].name} : ${s.rules.treaties.clauses[c].desc}`).join('\n'))}">Traité jusqu'au tour ${t.until} : ${t.clauses.map((c) => s.rules.treaties.clauses[c].name).join(', ')}</span>` : ''; })()}${nProj ? `<span class="tag good">${nProj} projet(s) commun(s)</span>` : ''}</div>
      ${mem.length ? `<div class="memories"><div class="stock-group" style="margin-top:8px">Ce qu'il retient de vous</div>${mem.map((m) => `<div class="mem ${m.value < 0 ? 'bad' : 'good'}"><span>${esc(m.text)}</span><b>${m.value > 0 ? '+' : ''}${m.value}</b></div>`).join('')}</div>` : ''}
      <div class="actions">
        <button class="btn small" data-action="gift" data-id="${q.id}" ${me().res.gold < 25 ? 'disabled' : ''}>Offrir 25 Or</button>
        ${ECO.inLeague(s, 0) && !ECO.inLeague(s, q.id) ? `<button class="btn small" data-action="league-invite" data-id="${q.id}" title="Relation minimale ${s.rules.league.minRelation}">Inviter dans la Ligue</button>` : ''}
        ${agr ? `<button class="btn small" data-action="cancel-agr" data-id="${q.id}">Rompre l'accord</button>` : `<button class="btn small" data-action="agreement" data-id="${q.id}" title="Requiert Protocole et relation ≥ ${s.rules.tradeAgreement.minRelation}">Accord commercial</button>`}
        ${all ? `<button class="btn small" data-action="project" data-id="${q.id}" ${nProj >= s.rules.jointProject.maxPerPair ? 'disabled' : ''} title="Coûte ${G.fmtBundle(s, s.rules.jointProject.cost)} à chacun : +${s.rules.jointProject.prestige} prestige et ${chipsText(s.rules.jointProject.yields)} par tour pour les deux">Projet commun</button>`
          : `<button class="btn small" data-action="alliance" data-id="${q.id}" title="Requiert Ambassades et relation ≥ ${pers?.allianceMin ?? s.rules.alliance.minRelation}">Alliance</button>`}
      </div>
      ${treatyForm(q)}
      <details class="treaty-row"><summary>Proposer un échange</summary><div class="form-row">
        <label class="field">Je donne<span style="display:flex;gap:4px"><input type="number" min="1" value="20" id="give-amt-${q.id}" aria-label="Quantité donnée"><select id="give-res-${q.id}">${resOpts('wood')}</select></span></label>
        <label class="field">Contre<span style="display:flex;gap:4px"><input type="number" min="1" value="20" id="want-amt-${q.id}" aria-label="Quantité demandée"><select id="want-res-${q.id}">${resOpts('gold')}</select></span></label>
        <button class="btn small" data-action="exchange" data-id="${q.id}">Proposer l'échange</button>
      </div></details></div>`;
  }).join('');
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Diplomatie"><header><div><h2>Diplomatie</h2>
    <div class="muted" style="font-size:13px;margin-top:2px">Les voisins méfiants ou hostiles réduisent votre productivité. Les accords et alliances la renforcent. Vos alliés partagent leurs technologies (−25 % de coût).</div></div>
    <button class="btn" data-action="close">Fermer</button></header>
    ${leagueBox()}
    ${postsBox()}
    <div class="diplo-grid">${cards}</div>
    <div class="effects"><b>Effets actuels sur votre productivité</b>${dip.reasons.length ? `<ul>${dip.reasons.map((r) => `<li class="${r.tone}">${esc(r.text)} : ${r.value > 0 ? '+' : ''}${Math.round(r.value * 100)}%${r.res ? ' Or' : ''}</li>`).join('')}</ul>` : '<div class="muted" style="margin-top:4px">Aucun effet pour le moment.</div>'}</div></div>`);
}

function showCongress() {
  const c = s.congress;
  const R = s.rules.congress;
  if (!c) { openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Congrès" style="width:min(520px,100%)"><header><h2>Congrès mondial</h2><button class="btn" data-action="close">Fermer</button></header><p>Le premier Congrès se réunira au tour ${R.every}. Une résolution y est votée et un Secrétaire élu (+${R.secretaryPrestige} prestige). Être élu ${s.rules.victory.secretaryWins} fois, avec au moins un allié, donne la victoire diplomatique.</p></div>`); return; }
  const def = R.resolutions[c.id];
  const open = c.status === 'open' && c.votes[0] === undefined;
  const w = (pid) => G.voteWeight(s, pid).toFixed(1).replace('.0', '');
  const rows = s.players.filter((p) => !p.isHuman).map((p) => `<div class="mem"><span>${esc(p.name)} <span class="muted">(poids ${w(p.id)})</span></span><b class="${c.votes[p.id] ? 'good' : 'bad'}">${c.votes[p.id] ? 'Pour' : 'Contre'}</b></div>`).join('');
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Congrès mondial" style="width:min(620px,100%)">
    <header><div><h2>Congrès mondial · tour ${c.turn}</h2><div class="muted" style="font-size:13px">Poids d'un vote : 1 + alliances + 0,5 par accord + 0,5 par ambassade reçue. Le vôtre : ${w(0)}.</div></div><button class="btn" data-action="close">Fermer</button></header>
    <div class="section-title"><span>Résolution</span></div>
    <p style="margin:0 0 6px"><b>${def.name}</b>${c.target !== null ? ` — cible : <b>${esc(s.players[c.target].name)}</b>` : ''}</p><p class="muted" style="margin:0 0 10px;font-size:13.5px">${def.desc}</p>
    <div class="memories">${rows}</div>
    ${c.standard ? (() => { const d = s.rules.standards.find((x) => x.id === c.standard); const st = (s.standards || []).find((x) => x.id === d.id); const member = st?.members.includes(0);
      return `<div class="section-title" style="margin-top:14px"><span>Norme internationale</span></div><p style="margin:0 0 6px"><b>${esc(d.name)}</b> — ${esc(d.desc)}${st ? ` <span class="muted">(déjà en vigueur : ${st.members.map((m) => esc(s.players[m].name)).join(', ')})</span>` : ' <span class="muted">(il faut au moins 2 signataires)</span>'}</p>
        ${open && !member ? '<label class="check"><input type="checkbox" id="join-standard" checked> Adhérer à cette norme</label>' : member ? '<p class="muted" style="margin:0">Vous en êtes déjà signataire.</p>' : ''}`; })() : ''}
    ${open ? `<div class="section-title" style="margin-top:14px"><span>Élection du Secrétaire (+${R.secretaryPrestige} prestige)</span></div>
      <div class="cands">${s.players.map((p) => `<label class="check"><input type="radio" name="secretary" value="${p.id}" ${p.id === 0 ? 'checked' : ''}> ${esc(p.name)} <span class="muted">· élu ${p.secretaryWins || 0} fois</span></label>`).join('')}</div>
      <div class="actions" style="margin-top:14px"><button class="btn primary" data-action="vote" data-yes="1">Voter pour la résolution</button><button class="btn" data-action="vote" data-yes="0">Voter contre</button></div>`
      : `<p style="margin-top:12px">Résultat : <b>${c.passed ? 'adoptée' : 'rejetée'}</b>${c.tally ? ` (${c.tally.yes.toFixed(1).replace('.0', '')} pour, ${c.tally.no.toFixed(1).replace('.0', '')} contre)` : ''}. Secrétaire : <b>${c.secretary !== null && c.secretary !== undefined ? esc(s.players[c.secretary].name) : 'aucun'}</b>. Prochain congrès au tour ${c.turn + R.every}.</p>`}
  </div>`);
}

function showCrisis() {
  const c = s.crisis;
  if (!c) return;
  const K = s.rules.crisis, def = W.crisisDef(s);
  const open = c.status === 'open' && c.pledges[0] === undefined;
  const lvName = (id) => K.levels.find((l) => l.id === (id || 'none')).name;
  const rows = s.players.filter((p) => !p.isHuman).map((p) => `<div class="mem"><span>${esc(p.name)}</span><b>${lvName(c.pledges[p.id])}</b></div>`).join('');
  const malus = Object.entries(def.yieldPct).map(([k, v]) => `${Math.round(v * 100)} % ${data.resources[k].name}`).join(', ');
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Crise mondiale" style="width:min(620px,100%)">
    <header><div><h2>Crise mondiale : ${esc(def.name)}</h2><div class="muted" style="font-size:13px">${esc(def.text)} Effet pour tous : ${malus}.</div></div><button class="btn" data-action="close">Fermer</button></header>
    <p style="margin:4px 0 10px;font-size:13.5px">Un Congrès extraordinaire réunit les contributions. Objectif : <b>${W.crisisGoal(s)} Or</b> au total. S'il est atteint, la crise prend fin et chaque contributeur gagne du prestige. Sinon, elle dure ${K.failTurns} tours et <b>personne ne paie</b>.</p>
    <div class="section-title"><span>Promesses des autres pays</span></div><div class="memories">${rows}</div>
    ${open ? `<div class="actions crisis-levels" style="margin-top:14px">${K.levels.map((l) => `<button class="btn ${l.id === 'modest' ? 'primary' : ''}" data-action="pledge" data-level="${l.id}" ${me().res.gold < l.gold ? 'aria-disabled="true"' : ''}><b>${l.name}</b>${l.gold ? ` · ${l.gold} Or · +${l.prestige} prestige` : ''}</button>`).join('')}</div>`
      : `<p style="margin-top:12px">${c.status === 'open' ? 'Votre promesse est enregistrée.' : c.status === 'resolved' ? `Crise surmontée (${c.total} Or réunis).` : `Contributions insuffisantes (${c.total} Or) : la crise dure jusqu'au tour ${c.until}.`}</p>`}
  </div>`);
}

function showExpo() {
  const e = s.expo, X = s.rules.expos;
  if (!e) return;
  const def = SUM.expoDef(s);
  const bidders = e.bids.map((pid) => esc(s.players[pid].name)).join(', ') || 'aucun pour l\'instant';
  const myEntry = e.entries[0];
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="${esc(def.name)}" style="width:min(620px,100%)">
    <header><div><h2>${esc(def.name)} · tour ${e.turn}</h2><div class="muted" style="font-size:13px">${esc(def.desc)}</div></div><button class="btn" data-action="close">Fermer</button></header>
    <div class="section-title"><span>Accueillir l'événement</span></div>
    <p style="margin:0 0 8px;font-size:13.5px">L'hôte gagne +${X.hostPrestige} prestige et +${X.hostCulture} Culture. Caution : ${G.fmtBundle(s, X.bidCost)}, remboursée si un autre pays est choisi. Le vote se fait au tour ${e.turn}, chacun soutenant le candidat qu'il apprécie le plus. Candidats : ${bidders}.</p>
    ${e.bids.includes(0) ? '<p class="good" style="margin:0 0 8px">Vous êtes candidat.</p>' : `<button class="btn" data-action="expo-bid" ${G.canAfford(s, 0, X.bidCost) ? '' : 'aria-disabled="true"'}>Se porter candidat (${G.fmtBundle(s, X.bidCost)})</button>`}
    <div class="section-title" style="margin-top:14px"><span>Concours</span></div>
    <p style="margin:0 0 8px;font-size:13.5px">Votre score actuel : <b>${SUM.expoScore(s, 0)}</b>. Premier : +${X.winPrestige[0]} prestige, deuxième : +${X.winPrestige[1]}. Participer rapproche aussi de l'hôte (+${X.hostRelation} relation). La participation est payée au tour ${e.turn}.</p>
    <div class="actions crisis-levels">${X.levels.map((l) => `<button class="btn ${myEntry === l.id ? 'primary' : ''}" data-action="expo-enter" data-level="${l.id}" aria-pressed="${myEntry === l.id}" ${me().res.gold < l.gold ? 'aria-disabled="true"' : ''}><b>${l.name}</b>${l.gold ? ` · ${l.gold} Or · +${l.score} points` : ''}</button>`).join('')}</div>
  </div>`);
}

function showCulture() {
  const p = me(), A = s.rules.artworks, H = s.rules.heritage, T = s.rules.tourism;
  const tour = CUL.tourismOf(s, 0);
  const nextP = T.prestigePer - ((p.tourismTotal || 0) % T.prestigePer);
  const slots = CUL.artSlots(s, 0), held = CUL.artworksHeld(s, 0);
  const others = s.players.filter((q) => q.id !== 0);
  const artRow = (a) => {
    const K = A.kinds[a.kind];
    const where = a.holder === a.owner ? (a.owner === 0 ? 'chez vous' : `chez ${esc(s.players[a.owner].name)}`) : a.owner === 0 ? `prêtée à ${esc(s.players[a.holder].name)} jusqu'au tour ${a.until}` : `prêtée par ${esc(s.players[a.owner].name)} jusqu'au tour ${a.until}`;
    const lendable = a.owner === 0 && a.holder === 0;
    return `<div class="mem"><span><b>« ${esc(a.name)} »</b> <span class="muted">${K.name.toLowerCase()} · +${K.culture} Culture · +${K.tourism} tourisme · ${where}</span></span>
      ${lendable ? `<span class="lend"><select id="lend-to-${a.id}" aria-label="Prêter à">${others.map((q) => `<option value="${q.id}">${esc(q.name)}</option>`).join('')}</select><button class="btn small" data-action="art-lend" data-id="${a.id}" title="Prêt de ${A.loanTurns} tours : +${A.loanRelation} relation, loyer ${A.loanRent} Or par tour">Prêter</button></span>` : ''}</div>`;
  };
  const arts = (s.artworks || []).filter((a) => a.owner === 0 || a.holder === 0);
  const cands = CUL.heritageCandidates(s, 0);
  const chal = (s.rules.challenges || []).map((ch) => {
    const w = s.challenges?.[ch.id];
    return `<div class="mem"><span><b>${esc(ch.name)}</b> <span class="muted">${esc(ch.desc.replace(/\.$/, ''))} · +${ch.prestige} prestige, +${ch.science} Science</span><br><span class="muted">${w === undefined ? esc(CUL.challengeProgress(s, 0, ch)) : ''}</span></span><b class="${w === 0 ? 'good' : w !== undefined ? 'bad' : ''}">${w === undefined ? 'Ouvert' : w === 0 ? 'Remporté' : esc(s.players[w].name)}</b></div>`;
  }).join('');
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Culture et tourisme" style="width:min(760px,100%)">
    <header><div><h2>Culture et tourisme</h2><div class="muted" style="font-size:13px">Tourisme : <b>${tour.total}</b> par tour (+${(tour.total * T.goldPerPoint).toFixed(1).replace('.0', '').replace('.', ',')} Or). Cumul ${Math.floor(p.tourismTotal || 0)} : 1 prestige tous les ${T.prestigePer}, prochain dans ${nextP}.</div></div><button class="btn" data-action="close">Fermer</button></header>
    ${tour.parts.length ? `<div class="memories">${tour.parts.map(([k, v]) => `<div class="mem"><span>${k}</span><b>+${v}</b></div>`).join('')}</div>` : '<p class="muted">Aucun visiteur pour l\'instant : merveilles, théâtres, œuvres et patrimoine en attirent.</p>'}
    <div class="section-title" style="margin-top:14px"><span>Œuvres d'art · ${held.length}/${slots} places</span></div>
    <p class="muted" style="font-size:12.5px;margin:0 0 6px">Une œuvre s'expose dans un Théâtre (1 place), un Monument (1), un Quartier des arts (2) ou l'Amphithéâtre (2). Chaque œuvre possédée vaut +${A.prestige} prestige.</p>
    <div class="actions crisis-levels">${Object.entries(A.kinds).map(([k, K]) => { const c = CUL.canCommission(s, 0, k); return `<button class="btn small" data-action="art-commission" data-kind="${k}" ${c.ok ? '' : 'aria-disabled="true"'} title="${esc(c.ok ? `+${K.culture} Culture, +${K.tourism} tourisme` : c.reason)}">Commander : ${K.name} · ${G.fmtBundle(s, K.cost)}</button>`; }).join('')}</div>
    ${arts.length ? `<div class="memories" style="margin-top:8px">${arts.map(artRow).join('')}</div>` : ''}
    <div class="section-title" style="margin-top:14px"><span>Patrimoine mondial</span></div>
    <p class="muted" style="font-size:12.5px;margin:0 0 6px">Faire classer une merveille naturelle, une merveille, un monument ou un théâtre de votre territoire (${G.techDef(s, H.tech).name}, ${G.fmtBundle(s, H.cost)}, un classement tous les ${H.cooldown} tours) : la case est protégée contre l'influence des voisins, +${H.tourism} tourisme et +${H.prestige} prestige.</p>
    ${CUL.heritageOf(s, 0).length ? `<div class="memories">${CUL.heritageOf(s, 0).map((h) => `<div class="mem"><span>${esc(h.name)}</span><b class="good">Classé</b></div>`).join('')}</div>` : ''}
    <div class="actions crisis-levels">${cands.length ? cands.map((c) => { const ok = CUL.canClassify(s, 0, c.x, c.y); return `<button class="btn small" data-action="heritage" data-x="${c.x}" data-y="${c.y}" ${ok.ok ? '' : 'aria-disabled="true"'} title="${esc(ok.ok ? 'Faire classer' : ok.reason)}">Classer : ${esc(c.name)}</button>`; }).join('') : '<span class="muted">Aucun site éligible pour l\'instant.</span>'}</div>
    ${movementsHtml()}
    <div class="section-title" style="margin-top:14px"><span>Défis scientifiques</span></div>
    <div class="memories">${chal}</div>
  </div>`);
}

// Mouvements culturels : naissance, propagation, choix d'adhérer, de rester neutre ou d'interdire.
function movementsHtml() {
  const M = s.rules.movements;
  if (!M) return '';
  const born = MOV.movementsBorn(s);
  const head = `<div class="section-title" style="margin-top:14px"><span>Mouvements culturels</span><span>${MOV.adoptedOf(s, 0).length} / ${M.maxAdopted} adoptés</span></div>
    <p class="muted" style="font-size:12.5px;margin:0 0 6px">Un mouvement naît dans la capitale du pays le plus cultivé de son ère, puis gagne les villes voisines, portée par la culture, les routes commerciales et les alliances. Adhérez-y pour son bonus dans chaque ville touchée (il s'y propage aussi plus vite), restez neutre, ou interdisez-le pour le freiner chez vous. Son fondateur gagne du prestige à chaque ville étrangère gagnée.</p>`;
  if (!born.length) return `${head}<p class="muted">Aucun mouvement pour l'instant : le premier naîtra vers le tour ${M.firstTurn}.</p>`;
  return head + `<div class="memories">${born.map((mv) => {
    const def = MOV.movementDef(s, mv.id), st = MOV.stanceOf(s, 0, mv.id), mine = MOV.citiesTouched(s, 0, mv.id).length, total = G.citiesOf(s, 0).length;
    const world = s.cities.filter((c) => MOV.touched(c, mv.id)).length;
    const btn = (k, label) => { const chk = k === 'adopt' ? MOV.canAdopt(s, 0, mv.id) : { ok: true }; return `<button class="btn small ${st === k ? 'primary' : ''}" data-action="mv-stance" data-mv="${mv.id}" data-stance="${k}" aria-pressed="${st === k}" ${st === k || chk.ok ? '' : 'aria-disabled="true"'} title="${esc(chk.reason || '')}">${label}</button>`; };
    const pending = G.citiesOf(s, 0).filter((c) => !MOV.touched(c, mv.id) && (c.mv?.[mv.id] || 0) > 0).length;
    return `<div class="mem mv-row"><span><b>${def.icon} ${esc(def.name)}</b> <span class="muted">né à ${esc(s.cities.find((c) => c.id === mv.cityId)?.name || '?')} (${esc(s.players[mv.founder].name)}) au tour ${mv.turn} · ${esc(def.desc)}</span><br>
      <span class="muted">Vos villes touchées : <b>${mine}</b> / ${total}${pending ? ` (${pending} en passe de l'être)` : ''} · dans le monde : ${world} / ${s.cities.length}${st === 'adopt' && mine ? ` · vous rapporte ${chipsText(Object.fromEntries(Object.entries(def.perCity).map(([k, v]) => [k, v * mine])))}` : ''}</span></span>
      <span class="row">${btn('adopt', 'Adhérer')}${btn('neutral', 'Neutre')}${btn('ban', 'Interdire')}</span></div>`;
  }).join('')}</div>`;
}

function showVictory() {
  const rivals = s.players.filter((p) => p.id !== 0);
  const mine = G.victoryProgress(s, 0);
  const paths = ['prestige', 'science', 'culture', 'economy', 'diplomacy'];
  const bestRival = (k) => rivals.map((q) => ({ q, v: G.victoryProgress(s, q.id)[k] })).sort((a, b) => b.v.pct - a.v.pct)[0];
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Voies de victoire" style="width:min(680px,100%)">
    <header><div><h2>Voies de victoire</h2><div class="muted" style="font-size:13px">La première voie complétée l'emporte ; sinon, le meilleur prestige au tour ${s.rules.turnLimit}.</div></div><button class="btn" data-action="close">Fermer</button></header>
    ${paths.map((k) => { const v = mine[k], r = bestRival(k); return `<div class="vpath"><div class="vhead"><b>${v.label}</b><span class="muted">${esc(v.text)}</span></div>
      <div class="bar big"><div style="width:${Math.round(v.pct * 100)}%;background:var(--accent)"></div></div>
      ${r ? `<div class="muted vrival">Meilleur rival : ${esc(r.q.name)} — ${esc(r.v.text)}</div><div class="bar"><div style="width:${Math.round(r.v.pct * 100)}%;background:${r.q.color}"></div></div>` : ''}</div>`; }).join('')}
  </div>`);
}

function showMenu() {
  const slots = Saves.listSaves().filter((x) => x.key !== 'auto');
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Menu" style="width:min(560px,100%)">
    <header><h2>Menu</h2><button class="btn" data-action="close">Fermer</button></header>
    <div class="section-title"><span>Sauvegarder dans</span></div>
    ${slots.map((x) => `<div class="save-row"><div><b>${x.label}</b><div class="muted">${x.empty ? 'Vide' : esc(saveMeta(x.meta))}</div></div>
      <button class="btn small" data-action="save-slot" data-slot="${x.key}">${x.empty ? 'Sauvegarder' : 'Écraser'}</button></div>`).join('')}
    <div class="section-title" style="margin-top:16px"><span>Fichier</span></div>
    <div class="actions"><button class="btn small" data-action="export">Exporter la partie (.json)</button><button class="btn small" data-action="import">Importer une partie</button></div>
    <div class="section-title" style="margin-top:16px"><span>Options</span></div>
    <div class="actions"><button class="btn small" data-action="toggle-confirm" aria-pressed="${confirmMoves}">Confirmation des déplacements : ${confirmMoves ? 'activée' : 'désactivée'}</button>
      <button class="btn small" data-action="toggle-blockend" aria-pressed="${blockEnd}" title="Empêche de finir le tour tant qu'une unité n'a pas reçu d'ordre">Attendre les unités avant la fin du tour : ${blockEnd ? 'activé' : 'désactivé'}</button>
      <button class="btn small" data-action="toggle-sound" aria-pressed="${Sound.soundEnabled()}">Sons : ${Sound.soundEnabled() ? 'activés' : 'coupés'}</button>
      <button class="btn small" data-action="toggle-music" aria-pressed="${Sound.musicEnabled()}" title="Musique d'ambiance générée en continu : son humeur suit la saison, ses instruments suivent l'ère">Musique : ${Sound.musicEnabled() ? 'activée' : 'coupée'}</button>
      <button class="btn small" data-action="toggle-daynight" aria-pressed="${renderer.dayNight}">Cycle jour / nuit : ${renderer.dayNight ? 'activé' : 'désactivé'}</button>
      <button class="btn small" data-action="cycle-quality" title="Léger : rendu direct, le plus fluide. Équilibré : halo, flou de miniature et étalonnage. Élevé : ajoute les ombres douces de contact.">Qualité visuelle : ${QUALITY_NAMES[renderer.quality]}</button></div>
    <div class="start-row" style="margin-top:10px"><label class="field" style="max-width:260px">Volume des sons<input type="range" min="0" max="1" step="0.05" value="${Sound.soundVolume()}" id="f-volume"></label>
      <label class="field" style="max-width:260px">Volume de la musique<input type="range" min="0" max="1" step="0.05" value="${Sound.musicLevel()}" id="f-music"></label></div>
    <div class="actions"><button class="btn small" data-action="encyclopedia">Encyclopédie (E)</button></div>
    <div class="section-title" style="margin-top:16px"><span>Partie</span></div>
    <div class="actions"><button class="btn small" data-action="tuto-restart">${s.tutorial?.active ? 'Recommencer le tutoriel' : 'Relancer le tutoriel'}</button><button class="btn small" data-action="new-game">Retour à l'accueil</button></div>
    <p class="muted" style="font-size:12.5px;margin:14px 0 0">La partie est aussi sauvegardée automatiquement à chaque tour dans ce navigateur.</p></div>`);
}

const METRICS = { prestige: 'Prestige', culture: 'Culture', pop: 'Population', techs: 'Technologies', cities: 'Villes' };
function showEnd(metric = 'prestige') {
  if (s.winner?.pid === 0 && metric === 'prestige' && !showEnd.played) { Sound.sfx.victory(); showEnd.played = true; }
  const won = s.winner.pid === 0;
  const stats = G.finalStats(s).sort((a, b) => b.prestige - a.prestige);
  recordResult();
  const legend = s.players.map((p) => `<span class="legend-item"><i style="background:${p.color}"></i>${esc(p.name)}</span>`).join('');
  const cols = [['prestige', 'Prestige'], ['cities', 'Villes'], ['pop', 'Pop.'], ['techs', 'Techno.'], ['culture', 'Culture'], ['buildings', 'Bâtiments'], ['wonders', 'Merveilles'], ['routes', 'Routes'], ['alliances', 'Alliances'], ['secretary', 'Secrétaire']];
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Fin de partie" style="width:min(820px,100%)">
    <header><div><h2>${won ? 'Victoire !' : 'Partie terminée'}</h2><div class="muted" style="font-size:13.5px;margin-top:2px">${esc(s.winner.reason)} · ${s.turn - 1} tours</div></div></header>
    <div class="tabs" role="tablist">${Object.entries(METRICS).map(([k, v]) => `<button class="tab" role="tab" aria-selected="${k === metric}" data-action="end-metric" data-metric="${k}">${v}</button>`).join('')}</div>
    <div class="legend">${legend}</div>
    <div id="end-chart" class="chart-wrap"></div>
    <div class="table-wrap"><table class="stats"><caption class="muted">Bilan final</caption><thead><tr><th scope="col">Joueur</th>${cols.map(([, l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
      <tbody>${stats.map((r, k) => `<tr class="${r.id === 0 ? 'me' : ''}"><th scope="row"><i class="dot" style="display:inline-block;background:${r.color}"></i> ${k + 1}. ${esc(r.name)}</th>${cols.map(([c]) => `<td>${r[c]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="actions" style="margin-top:16px"><button class="btn primary" data-action="new-game">Nouvelle partie</button><button class="btn" data-action="close">Voir la carte</button></div></div>`);
  const hist = s.history || [];
  if (hist.length) {
    lineChart($('#end-chart'), {
      label: METRICS[metric],
      turns: hist.map((h) => h.turn),
      series: s.players.map((p) => ({ name: p.name, color: p.color, strong: p.id === 0, values: hist.map((h) => h.players[p.id]?.[metric] ?? 0) })),
    });
  } else {
    $('#end-chart').innerHTML = '<p class="muted">Pas d\'historique pour cette partie (sauvegarde antérieure à la phase 5).</p>';
  }
}

function recordResult() {
  if (s.resultRecorded) return;
  s.resultRecorded = true;
  const ranked = [...s.players].sort((a, b) => b.prestige - a.prestige);
  Saves.recordFinishedGame({
    date: new Date().toISOString(), won: s.winner.pid === 0, reason: s.winner.reason, profile: me().profile,
    size: s.settings?.size, mapType: s.settings?.mapType, turns: s.turn - 1, prestige: me().prestige,
    rank: ranked.findIndex((p) => p.id === 0) + 1, players: s.players.length,
  });
  save();
}

// ---------------------------------------------------------------- événements
function onAction(e) {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') {
    // Sur iPad, l'infobulle n'existe pas : un toucher sur un bouton grisé affiche la raison.
    const why = b?.dataset.why || b?.title;
    if (why) toast(why.split('\n')[0], 'bad');
    return;
  }
  const id = Number(b.dataset.id);
  const a = b.dataset.action;
  if (!['end-turn', 'train', 'sell'].includes(a)) Sound.sfx.click();
  switch (a) {
    case 'end-turn': endTurn(); break;
    case 'tech': showTech(); break;
    case 'diplo': showDiplo(); break;
    case 'close': closeModal(); break;
    case 'tab': buildTab = b.dataset.tab; renderBuildbar(); break;
    case 'mode-build': setMode(mode?.type === 'build' && mode.id === b.dataset.id ? null : { type: 'build', id: b.dataset.id }); break;
    case 'mode-road': setMode(mode?.type === 'road' ? null : { type: 'road' }); break;
    case 'mode-marker': {
      const next = b.dataset.plan ? { type: 'marker', plan: b.dataset.plan } : { type: 'marker', color: b.dataset.color };
      setMode(mode?.type === 'marker' && mode.plan === next.plan && mode.color === next.color ? null : next); break;
    }
    case 'markers-clear': if (markers().length) { me().markers = []; renderer.syncEntities(); setMode(mode?.type === 'marker' ? mode : null); save(); toast('Repères effacés.'); } break;
    case 'found': foundSelected(); break;
    case 'cancel-current': if (pendingMove) { pendingMove = null; renderSelection(); renderHighlights(); } else setMode(null); break;
    case 'deselect': select(null); break;
    case 'confirm-move': { const u = s.units.find((x) => x.id === pendingMove?.uid); if (u) executeMove(u, pendingMove.x, pendingMove.y); break; }
    case 'cancel-move': pendingMove = null; renderSelection(); renderHighlights(); break;
    case 'toggle-sound': Sound.setSound(!Sound.soundEnabled()); showMenu(); break;
    case 'toggle-music': Sound.setMusic(!Sound.musicEnabled()); showMenu(); break;
    case 'cycle-quality': { const i = QUALITY.indexOf(renderer.quality); renderer.setQuality(QUALITY[(i + 1) % QUALITY.length]); showMenu(); break; }
    case 'toggle-daynight': renderer.dayNight = !renderer.dayNight; try { localStorage.setItem('expandto.daynight', renderer.dayNight ? '1' : '0'); } catch { /* ignore */ } if (!renderer.dayNight) renderer.resetLight(); showMenu(); break;
    case 'encyclopedia': showEncyclopedia(); break;
    case 'enc-tab': showEncyclopedia(b.dataset.tab); break;
    case 'toggle-confirm': confirmMoves = !confirmMoves; try { localStorage.setItem('expandto.confirmMoves', confirmMoves ? '1' : '0'); } catch { /* ignore */ } showMenu(); break;
    case 'cancel-order': { const u = s.units.find((x) => x.id === sel.id); if (u) u.target = null; renderAll(); break; }
    case 'next-unit': nextUnit(); break;
    case 'unit-skip': case 'unit-sleep': case 'unit-wake': {
      const u = s.units.find((x) => x.id === sel?.id);
      if (!u) break;
      if (a === 'unit-skip') u.skipTurn = s.turn;
      if (a === 'unit-sleep') u.sleep = true;
      if (a === 'unit-wake') u.sleep = false;
      save();
      if (a !== 'unit-wake' && waitingUnits().length) nextUnit(); else renderAll();
      break;
    }
    case 'toggle-blockend': blockEnd = !blockEnd; try { localStorage.setItem('expandto.blockEnd', blockEnd ? '1' : '0'); } catch { /* ignore */ } showMenu(); renderTop(); break;
    case 'train': {
      const r = G.train(s, 0, sel.id, b.dataset.unit);
      if (!r.ok) toast(r.reason, 'bad'); else { toast(`${G.unitDef(s, r.unit.type).name} formé.`, 'good'); Sound.sfx.train(); sel = { kind: 'unit', id: r.unit.id }; }
      refreshWorld(); save(); break;
    }
    case 'research': { const r = G.setResearch(s, 0, b.dataset.id); if (!r.ok) toast(r.reason, 'bad'); showTech(); renderAll(); save(); break; }
    case 'accept': case 'decline': {
      const r = G.respondProposal(s, id, a === 'accept');
      if (!r.ok && r.reason) toast(r.reason, 'bad');
      refreshWorld(); save(); break;
    }
    case 'gift': G.giveGift(s, 0, id, 25); showDiplo(); renderAll(); save(); break;
    case 'project': {
      const r = G.propose(s, 0, id, 'project');
      toast(r.ok ? 'Projet commun lancé !' : r.reason, r.ok ? 'good' : 'bad');
      showDiplo(); renderAll(); save(); break;
    }
    case 'victory': showVictory(); break;
    case 'culture': showCulture(); break;
    case 'art-commission': { const r = CUL.commission(s, 0, b.dataset.kind); toast(r.ok ? `Œuvre commandée : « ${r.art.name} ».` : r.reason, r.ok ? 'good' : 'bad'); showCulture(); renderAll(); save(); break; }
    case 'art-lend': { const r = CUL.lend(s, id, Number($(`#lend-to-${id}`).value)); if (!r.ok) toast(r.reason, 'bad'); showCulture(); renderAll(); save(); break; }
    case 'heritage': { const r = CUL.classify(s, 0, Number(b.dataset.x), Number(b.dataset.y)); toast(r.ok ? 'Site inscrit au patrimoine mondial !' : r.reason, r.ok ? 'good' : 'bad'); showCulture(); refreshWorld(); save(); break; }
    case 'event-choice': {
      const r = D.resolveEvent(s, id, Number(b.dataset.choice));
      if (!r.ok) { toast(r.reason, 'bad'); break; }
      refreshWorld(); save(); break;
    }
    case 'policies': showPolicies(); break;
    case 'people': showPeople(); break;
    case 'relocate-start': setMode({ type: 'relocate', bid: id }); break;
    case 'mv-stance': { const r = MOV.setStance(s, 0, b.dataset.mv, b.dataset.stance); if (!r.ok) toast(r.reason, 'bad'); showCulture(); renderAll(); save(); break; }
    case 'government': { const r = AGE.setGovernment(s, 0, b.dataset.gov); if (!r.ok) toast(r.reason, 'bad'); showPolicies(); renderAll(); save(); break; }
    case 'excavate': { const u = s.units.find((x) => x.id === sel?.id); const r = AGE.excavate(s, u?.id); toast(r.ok ? `Artefact exhumé : « ${r.art.name} ».` : r.reason, r.ok ? 'good' : 'bad'); if (r.ok) sel = null; refreshWorld(); save(); break; }
    case 'spy': { const u = s.units.find((x) => x.id === sel?.id); const r = IND.spyMission(s, u?.id, b.dataset.mission); toast(r.ok ? r.text : r.reason, !r.ok || r.caught ? 'bad' : r.detected ? '' : 'good'); if (r.ok) sel = null; refreshWorld(); save(); break; }
    case 'post-gift': { const r = IND.giftPost(s, 0, id); toast(r.ok ? 'Cadeau offert.' : r.reason, r.ok ? 'good' : 'bad'); if (!$('#modal').hidden) showDiplo(); renderAll(); save(); break; }
    case 'people-tab': showPeople(b.dataset.tab); break;
    case 'gp-use': { const sel2 = $(`#gp-target-${id}`); const r = PEO.useGreatPerson(s, 0, id, { buildingId: sel2 ? Number(sel2.value) : null }); toast(r.ok ? r.what : r.reason, r.ok ? 'good' : 'bad'); showPeople(); refreshWorld(); save(); break; }
    case 'amb-play': { const r = PEO.playAmbition(s, 0, b.dataset.amb); if (!r.ok) toast(r.reason, 'bad'); showPeople(); renderAll(); save(); break; }
    case 'amb-withdraw': PEO.withdrawAmbition(s, 0, b.dataset.amb); showPeople(); save(); break;
    case 'amb-discard': { const r = PEO.discardAmbition(s, 0, b.dataset.amb); toast(r.ok ? (r.drawn ? `Nouvelle carte : « ${r.drawn.name} ».` : 'Carte défaussée.') : r.reason, r.ok ? 'good' : 'bad'); showPeople(); save(); break; }
    case 'vocation': { const c = s.cities.find((x) => x.id === id); const r = LAND.setVocation(s, c, b.dataset.voc); if (!r.ok) toast(r.reason, 'bad'); renderAll(); save(); break; }
    case 'repair': { const r = LAND.repair(s, 0, id); toast(r.ok ? 'Bâtiment réparé.' : r.reason, r.ok ? 'good' : 'bad'); refreshWorld(); save(); break; }
    case 'terraform': { const r = LAND.terraform(s, 0, b.dataset.act, Number(b.dataset.x), Number(b.dataset.y)); toast(r.ok ? `${s.rules.terraform.actions[b.dataset.act].name} : c'est fait.` : r.reason, r.ok ? 'good' : 'bad'); refreshWorld(); save(); break; }
    case 'ability': { const r = W.useAbility(s, 0); toast(r.ok ? `${data.profilesById[me().profile].ability.name} !` : r.reason, r.ok ? 'good' : 'bad'); refreshWorld(); save(); break; }
    case 'contract-accept': W.acceptContract(s, id); renderAll(); save(); break;
    case 'contract-decline': W.declineContract(s, id); renderAll(); save(); break;
    case 'contract-deliver': { const r = W.deliverContract(s, id); if (!r.ok) toast(r.reason, 'bad'); else toast('Contrat honoré !', 'good'); renderAll(); save(); break; }
    case 'crisis': showCrisis(); break;
    case 'pledge': { const r = W.pledgeCrisis(s, 0, b.dataset.level); if (!r.ok) { toast(r.reason || 'Impossible.', 'bad'); break; } showCrisis(); renderAll(); save(); break; }
    case 'policy-set': {
      const r = D.setPolicy(s, 0, Number(b.dataset.slot), b.dataset.policy || null);
      if (!r.ok) toast(r.reason, 'bad');
      policyPick = null; showPolicies(); renderAll(); save(); break;
    }
    case 'policy-pick': policyPick = Number(b.dataset.slot); showPolicies(); break;
    case 'end-metric': showEnd(b.dataset.metric); break;
    case 'congress': showCongress(); break;
    case 'vote': {
      const cand = $('input[name="secretary"]:checked');
      G.castCongressVote(s, 0, b.dataset.yes === '1', cand ? Number(cand.value) : null, !!$('#join-standard')?.checked);
      closeModal(); renderAll(); save();
      const c = s.congress;
      toast(`Résolution ${c.passed ? 'adoptée' : 'rejetée'}. ${c.secretary !== null ? `Secrétaire : ${s.players[c.secretary].name}.` : 'Pas de Secrétaire élu.'}`, c.passed ? 'good' : '');
      if (s.winner) showEnd();
      break;
    }
    case 'agreement': case 'alliance': {
      const r = G.propose(s, 0, id, a);
      toast(r.ok ? (a === 'agreement' ? 'Accord commercial signé !' : 'Alliance conclue !') : r.reason, r.ok ? 'good' : 'bad');
      showDiplo(); renderAll(); save(); break;
    }
    case 'cancel-agr': G.cancelAgreement(s, 0, id); showDiplo(); renderAll(); save(); break;
    case 'exchange': {
      const give = { [$(`#give-res-${id}`).value]: Math.max(1, Math.floor(Number($(`#give-amt-${id}`).value) || 0)) };
      const want = { [$(`#want-res-${id}`).value]: Math.max(1, Math.floor(Number($(`#want-amt-${id}`).value) || 0)) };
      if (Object.keys(give)[0] === Object.keys(want)[0]) { toast('Choisissez deux ressources différentes.', 'bad'); break; }
      const r = G.propose(s, 0, id, 'exchange', { give, want });
      toast(r.ok ? 'Échange accepté.' : r.reason, r.ok ? 'good' : 'bad');
      showDiplo(); renderAll(); save(); break;
    }
    case 'new-game': Sound.music.setMood('menu', 0); closeModal(); save(); for (const x of ['#topbar', '#side', '#buildbar', '#selection', '#hint', '#tutorial', '#summary']) $(x).hidden = true; s = null; showStart(); break;
    case 'menu': showMenu(); break;
    case 'toggle-build': toggleBuild(); break;
    case 'toggle-side': setSide(!document.documentElement.classList.contains('side-open')); break;
    case 'dismiss-rotate': rotateDismissed = true; applyLayout(); break;
    case 'toggle-adj': showAdjacency = !showAdjacency; renderBuildbar(); renderHighlights(); break;
    case 'buy': {
      const r = ECO.buy(s, 0, b.dataset.res, Number(b.dataset.qty));
      if (!r.ok) toast(r.reason, 'bad'); else toast(`${r.qty} ${data.resources[b.dataset.res].name} achetés : −${r.gold} Or.`, 'good');
      renderTop(); renderStock(); save(); break;
    }
    case 'treaty-propose': {
      const clauses = [...document.querySelectorAll(`input[name="clause-${id}"]:checked`)].map((x) => x.value);
      const r = SUM.proposeTreaty(s, 0, id, clauses, Number($(`#treaty-dur-${id}`).value));
      toast(r.ok ? `Traité signé avec ${s.players[id].name}.` : r.reason || 'Refus.', r.ok ? 'good' : 'bad');
      showDiplo(); renderAll(); save(); break;
    }
    case 'treaty-break': SUM.breakTreaty(s, 0, id); showDiplo(); renderAll(); save(); break;
    case 'expo': showExpo(); break;
    case 'expo-bid': { const r = SUM.bidExpo(s, 0); toast(r.ok ? 'Candidature déposée.' : r.reason, r.ok ? 'good' : 'bad'); showExpo(); renderAll(); save(); break; }
    case 'expo-enter': { const r = SUM.enterExpo(s, 0, b.dataset.level); if (!r.ok && r.reason) toast(r.reason, 'bad'); showExpo(); renderAll(); save(); break; }
    case 'league-found': { const r = ECO.foundLeague(s, 0); toast(r.ok ? 'Ligue marchande fondée !' : r.reason, r.ok ? 'good' : 'bad'); showDiplo(); renderAll(); save(); break; }
    case 'league-invite': { const r = ECO.inviteToLeague(s, 0, id); toast(r.ok ? `${s.players[id].name} rejoint la Ligue.` : r.reason || 'Refus.', r.ok ? 'good' : 'bad'); showDiplo(); renderAll(); save(); break; }
    case 'league-leave': ECO.leaveLeague(s, 0); showDiplo(); renderAll(); save(); break;
    case 'sell': {
      const r = G.sell(s, 0, b.dataset.res, Number(b.dataset.qty));
      if (!r.ok) toast(r.reason, 'bad'); else toast(`${r.qty} ${data.resources[b.dataset.res].name} vendus : +${r.gold} Or.`, 'good');
      renderTop(); renderStock(); save(); break;
    }
    case 'autosell': {
      G.setAutoSell(s, 0, b.dataset.res, b.checked ? sellKeep(b.dataset.res) : null);
      renderStock(); save(); break;
    }
    case 'autosell-step': {
      const k = b.dataset.res;
      setSellKeep(k, sellKeep(k) + Number(b.dataset.step));
      renderStock(); save(); break;
    }
    case 'stock': $('#stock').hidden = !$('#stock').hidden; renderTop(); renderStock(); break;
    case 'eng-road': case 'eng-clear': {
      const r = a === 'eng-road' ? G.engineerRoad(s, sel.id) : G.clearForest(s, sel.id);
      if (!r.ok) toast(r.reason, 'bad');
      refreshWorld(); save(); break;
    }
    case 'save-slot': if (Saves.saveTo(b.dataset.slot, s)) toast('Partie sauvegardée.', 'good'); else toast('Stockage du navigateur indisponible.', 'bad'); showMenu(); break;
    case 'load-slot': { try { const st = Saves.loadFrom(b.dataset.slot, data); if (st) startGame(st); } catch { toast('Sauvegarde illisible.', 'bad'); } break; }
    case 'delete-slot': {
      const label = Saves.SLOTS.find((x) => x.key === b.dataset.slot)?.label;
      if (window.confirm(`Supprimer définitivement « ${label} » ?`)) { Saves.remove(b.dataset.slot); showStart(); }
      break;
    }
    case 'export': Saves.exportFile(s); break;
    case 'import': importGame(); break;
    case 'tuto-skip': s.tutorial.active = false; renderAll(); save(); break;
    case 'tuto-finish': Tuto.flag(s, 'finished'); renderAll(); save(); break;
    case 'tuto-restart': Tuto.initTutorial(s, true); closeModal(); renderAll(); save(); break;
    case 'summary-close': $('#summary').hidden = true; break;
    default: break;
  }
}

function bindInput() {
  document.addEventListener('click', onAction);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  const canvas = renderer.renderer.domElement;
  let down = null;
  // Toucher : un tap = un seul doigt, peu de mouvement ; un pincement ou un glissé n'est jamais un tap.
  const pointers = new Set();
  let multi = false;
  canvas.addEventListener('pointerdown', (e) => {
    pointers.add(e.pointerId);
    if (pointers.size > 1) multi = true;
    if (pointers.size === 1) { multi = false; down = { x: e.clientX, y: e.clientY, b: e.button, t: e.pointerType }; }
  });
  const release = (e) => { pointers.delete(e.pointerId); };
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerup', (e) => {
    release(e);
    if (!s || !down || down.b !== 0 || multi) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > (down.t === 'touch' ? 14 : 6)) return;
    const i = renderer.pick(e.clientX, e.clientY);
    if (i !== null) handleTileClick(i, e.shiftKey);
  });
  canvas.addEventListener('pointerleave', () => { $('#tiptile').hidden = true; });
  canvas.addEventListener('pointerdown', () => { $('#tiptile').hidden = true; });
  document.addEventListener('input', (e) => { if (e.target.id === 'f-volume') Sound.setVolume(Number(e.target.value)); if (e.target.id === 'f-music') Sound.setMusicVolume(Number(e.target.value)); });
  // Musique : les navigateurs n'autorisent le son qu'après un geste de l'utilisateur.
  const startMusic = () => Sound.music.start();
  document.addEventListener('pointerdown', startMusic, { once: true });
  document.addEventListener('keydown', startMusic, { once: true });
  canvas.addEventListener('pointermove', (e) => {
    if (!s) return;
    const tip = $('#tiptile');
    if (!tip.hidden) { tip.style.left = `${e.clientX + 16}px`; tip.style.top = `${e.clientY + 16}px`; }
    const i = renderer.pick(e.clientX, e.clientY);
    if (i === hoverIdx) return;
    hoverIdx = i;
    renderer.setCursor(i, 'hover');
    showTileTip(i, e.clientX, e.clientY);
    if (mode && mode.type !== 'marker' && i !== null) {
      const t = s.map.tiles[i];
      const mb = mode.type === 'relocate' && s.buildings.find((x) => x.id === mode.bid);
      const r = mode.type === 'build' ? G.canBuild(s, 0, mode.id, t.x, t.y) : mb ? G.canRelocate(s, 0, mb.id, t.x, t.y) : G.canRoad(s, 0, t.x, t.y);
      const base = mode.type === 'build' ? `${G.buildingDef(s, mode.id).name} : ` : mb ? `Déplacer ${G.buildingDef(s, mb.type).name} : ` : 'Route : ';
      let extra = '';
      if (r.ok && (mode.type === 'build' || mb)) {
        const adj = Object.entries(mb ? G.adjacencyIfMoved(s, 0, mb.id, t.x, t.y, plannedMap()) : G.adjacencyBonus(s, 0, mode.id, t.x, t.y, plannedMap())).filter(([, v]) => v);
        if (adj.length) extra = ` · adjacence ${adj.map(([k, v]) => `+${v} ${data.resources[k].name}`).join(', ')}`;
      }
      const ht = $('#hint-text'); if (ht) ht.textContent = base + (r.ok ? `${tap()} pour ${mb ? 'déplacer' : 'construire'}${extra}` : r.reason);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (!s || e.target.matches('input, select, textarea')) return;
    const modalOpen = !$('#modal').hidden;
    if (e.key === 'Escape') { if (modalOpen) closeModal(); else if (pendingMove) { pendingMove = null; renderSelection(); renderHighlights(); } else if (mode) setMode(null); else select(null); return; }
    if (modalOpen) return;
    if (e.key === 'Enter') { e.preventDefault(); endTurn(); }
    else if (e.key === ' ') { e.preventDefault(); nextUnit(); }
    else if (e.key === 'f' || e.key === 'F') foundSelected();
    else if (e.key === 'r' || e.key === 'R') setMode(mode?.type === 'road' ? null : { type: 'road' });
    else if (e.key === 'k' || e.key === 'K') { if (mode?.type === 'marker') setMode(null); else { buildTab = 'marker'; setMode({ type: 'marker', color: 'red' }); } }
    else if (e.key === 't' || e.key === 'T') showTech();
    else if (e.key === 'p' || e.key === 'P') showPolicies();
    else if (e.key === 'c' || e.key === 'C') showCulture();
    else if (e.key === 'g' || e.key === 'G') showPeople();
    else if (e.key === 'd' || e.key === 'D') showDiplo();
    else if (e.key === 'm' || e.key === 'M') showMenu();
    else if (e.key === 'e' || e.key === 'E') showEncyclopedia();
    else if (e.key === 'b' || e.key === 'B') toggleBuild();
    else if (e.key === 'a' || e.key === 'A') { showAdjacency = !showAdjacency; renderBuildbar(); renderHighlights(); }
  });
}

// --------------------------------------------------------------------- boot
(async function boot() {
  data = await loadData();
  renderer = new Renderer($('#viewport'));
  renderer.onQualityDrop = (lvl) => { if (s) toast(`Qualité visuelle réduite à « ${QUALITY_NAMES[lvl]} » pour garder le jeu fluide (Menu pour la changer).`); };
  renderer.setState(G.createGame({ data, seed: 7, aiCount: 3 }), 0);
  renderer.state.players[0].explored.fill(1);
  renderer.refresh();
  bindInput();
  setInterval(() => { if (s && !$('#side').hidden) drawMinimap(); }, 300);
  compactQuery.addEventListener('change', applyLayout);
  portraitQuery.addEventListener('change', applyLayout);
  window.addEventListener('orientationchange', applyLayout);
  applyLayout();
  $('#minimap canvas').addEventListener('click', (e) => {
    if (!s) return;
    const r = e.currentTarget.getBoundingClientRect();
    const scale = r.width / s.map.width;
    renderer.focus(Math.floor((e.clientX - r.left) / scale), Math.floor((e.clientY - r.top) / scale));
  });
  showStart();
  window.__expandto = { get state() { return s; }, G, renderer };
})();

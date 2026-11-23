// Point d'entrée : chargement des données, écran de départ, boucle de jeu et interface.
import * as G from './core/game.js';
import { playAITurns } from './core/ai.js';
import { Renderer } from './render/renderer.js';
import { avatarSVG } from './ui/avatar.js';
import * as Saves from './ui/saves.js';
import * as Tuto from './ui/tutorial.js';

const $ = (sel) => document.querySelector(sel);
const BRANCHES = { economy: 'Économie', science: 'Science', culture: 'Culture', diplomacy: 'Diplomatie' };
const BUILD_TABS = {
  prod: { label: 'Production', ids: ['farm', 'lumber', 'quarry', 'market', 'harbor', 'district', 'road'] },
  industry: { label: 'Industrie', ids: ['sawmill', 'manufactory', 'forge', 'outpost', 'markethall'] },
  know: { label: 'Savoir & culture', ids: ['library', 'lab', 'theatre', 'monument'] },
  quarter: { label: 'Quartiers 2×2', ids: ['campus', 'artsquarter', 'merchantquarter'] },
  wonder: { label: 'Merveilles', ids: ['lighthouse', 'grandlibrary', 'observatory', 'amphitheatre', 'exchange', 'nations'] },
};

let data, s, renderer;
let sel = null;          // { kind: 'unit'|'city'|'tile', id|i }
let mode = null;         // null | { type: 'build', id } | { type: 'road' }
let buildTab = 'prod';
let hoverIdx = null;
let pendingMove = null; // { uid, x, y, plan } : déplacement en attente de confirmation
let confirmMoves = true;
try { confirmMoves = localStorage.getItem('expandto.confirmMoves') !== '0'; } catch { /* ignore */ }
let showAdjacency = false; // touche A : bonus d'adjacence actifs sur la carte

// ------------------------------------------------------------------ données
async function loadData() {
  const files = ['terrain', 'resources', 'buildings', 'units', 'techs', 'profiles', 'rules', 'ai'];
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
const avatar = (p, size = 28) => avatarSVG({ color: p.color, profile: p.profile, skin: p.id, size, title: p.name });

function toast(text, tone = '') {
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
  return [m.turn ? `Tour ${m.turn}` : '', prof, m.prestige !== undefined ? `${m.prestige} prestige` : '', m.savedAt ? fmtDate(m.savedAt) : ''].filter(Boolean).join(' · ');
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
  el.innerHTML = `
    <div class="card start">
      <h1>Expand<span>-to</span></h1>
      <p class="lead">Explorez, bâtissez, commercez et négociez. Aucune armée : la victoire se gagne par le <b>prestige</b> — culture, science, commerce et alliances. Premier à ${data.rules.prestigeTarget} points, ou meilleur score après ${data.rules.turnLimit} tours.</p>
      <div class="section-title">Profil de départ</div>
      <div class="profiles" role="radiogroup" aria-label="Profil de départ">
        ${data.profiles.map((p) => `<button class="profile" role="radio" aria-checked="${p.id === profile}" data-profile="${p.id}">${avatarSVG({ color: G.PLAYER_COLORS[0], profile: p.id, skin: 0, size: 48, title: p.name })}<div><b>${p.name}</b><span>${p.desc}</span></div></button>`).join('')}
      </div>
      <div class="start-row">
        <label class="field">Nom du dirigeant<input id="f-name" value="Vous" maxlength="18"></label>
        <label class="field">Adversaires IA<select id="f-ai"><option>2</option><option selected>3</option><option>4</option></select></label>
        <label class="field">Difficulté<select id="f-diff">${Object.entries(data.ai.difficulty).map(([k, d]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${d.name}</option>`).join('')}</select></label>
        <label class="field">Graine de carte (optionnel)<input id="f-seed" inputmode="numeric" placeholder="ex. 4242"></label>
      </div>
      <div class="start-actions">
        <button class="btn primary" id="start-go">Lancer la partie</button>
        <label class="check"><input type="checkbox" id="f-tuto" checked> Tutoriel guidé</label>
      </div>
      ${renderSaveList()}
      <div class="help">
        <b>Commandes</b> — clic gauche : sélectionner / déplacer · glisser : déplacer la caméra · clic droit glissé : pivoter · molette : zoom ·
        <kbd>Entrée</kbd> finir le tour · <kbd>Échap</kbd> annuler · <kbd>Espace</kbd> unité suivante · <kbd>F</kbd> fonder · <kbd>R</kbd> route · <kbd>T</kbd> technologies · <kbd>D</kbd> diplomatie · <kbd>M</kbd> menu · <kbd>A</kbd> bonus d'adjacence
      </div>
    </div>`;
  el.querySelectorAll('.profile').forEach((b) => b.addEventListener('click', () => {
    profile = b.dataset.profile;
    el.querySelectorAll('.profile').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  $('#start-go').addEventListener('click', () => {
    const seedTxt = $('#f-seed').value.trim();
    const seed = seedTxt ? (Number(seedTxt) || [...seedTxt].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) >>> 0 : undefined;
    const game = G.createGame({ data, seed, profile, name: $('#f-name').value.trim() || 'Vous', aiCount: Number($('#f-ai').value), difficulty: $('#f-diff').value });
    Tuto.initTutorial(game, $('#f-tuto').checked);
    startGame(game);
  });
}

function renderSaveList() {
  const saves = Saves.listSaves().filter((x) => !x.empty);
  return `<div class="saves"><div class="section-title"><span>Parties sauvegardées</span><button class="btn small ghost" data-action="import">Importer un fichier</button></div>
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
  renderer.setState(s, 0);
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
  renderTop(); renderStock(); renderSide(); renderSelection(); renderBuildbar(); renderHighlights(); renderTutorial(); drawMinimap();
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

function renderTop() {
  const p = me();
  const y = G.computeYields(s, 0);
  const items = ['gold', 'food', 'wood', 'stone'].map((k) => {
    const tip = `${data.resources[k].name} : production ${y.gross[k].toFixed(1)} × ${Math.round(y.mult[k] * 100)}%${k === 'gold' && y.upkeep ? ` − entretien ${y.upkeep}` : ''}${k === 'food' ? ` − consommation ${y.consumption}` : ''}`;
    return `<span class="res" title="${tip}"><i style="background:${resColor(k)}"></i><b>${fmt(p.res[k])}</b><small class="${y.net[k] < 0 ? 'neg' : ''}">${sign(y.net[k])}</small></span>`;
  });
  const research = p.research ? G.techDef(s, p.research) : null;
  items.push(`<span class="res" title="Science accumulée / coût de la recherche en cours"><i style="background:${resColor('science')}"></i><b>${research ? `${research.name} ${fmt(p.sciencePool)}/${research.cost}` : `${fmt(p.sciencePool)} · à choisir`}</b><small>${sign(y.net.science)}</small></span>`);
  items.push(`<span class="res" title="Culture totale (1 prestige / ${data.rules.prestige.culturePerPoint})"><i style="background:${resColor('culture')}"></i><b>${fmt(p.cultureTotal)}</b><small>${sign(y.net.culture)}</small></span>`);
  const stockTotal = [...G.GOODS, ...G.LUXURIES].reduce((a, k) => a + Math.floor(p.res[k] || 0), 0);
  items.push(`<button class="res res-btn" data-action="stock" title="Entrepôt : biens transformés et ressources rares" aria-expanded="${!$('#stock').hidden}"><i style="background:${resColor('goods')}"></i><b>Entrepôt</b><small>${stockTotal}</small></button>`);
  items.push(`<span class="res" title="Prestige — objectif de victoire"><i style="background:var(--accent)"></i><b>${p.prestige} / ${data.rules.prestigeTarget}</b><small>prestige</small></span>`);
  $('#resources').innerHTML = items.join('');
  $('#turn').textContent = `Tour ${s.turn} / ${data.rules.turnLimit}`;
}

function renderStock() {
  const el = $('#stock');
  if (el.hidden) return;
  const p = me();
  const y = G.computeYields(s, 0);
  const active = new Set(G.activeLuxuries(s, 0));
  const canSell = G.hallCount(s, 0) > 0;
  const auto = p.autoSell || {};
  const keep = data.rules.market.autoSellKeep;
  const sellBar = (k) => {
    if (!canSell) return '';
    const stock = Math.floor(p.res[k] || 0);
    const q5 = G.quoteSale(s, 0, k, Math.min(5, stock)).gold, q10 = G.quoteSale(s, 0, k, Math.min(10, stock)).gold;
    const price = G.unitPrice(s, 0, k);
    return `<div class="sell-row"><span class="muted">${price.toFixed(1).replace('.', ',')} Or/u</span>
      <button class="btn small" data-action="sell" data-res="${k}" data-qty="5" ${stock >= 1 ? '' : 'disabled'} title="Vendre 5 : +${q5} Or">−5 · +${q5}</button>
      <button class="btn small" data-action="sell" data-res="${k}" data-qty="10" ${stock >= 1 ? '' : 'disabled'} title="Vendre 10 : +${q10} Or">−10 · +${q10}</button>
      <label class="check small" title="Chaque fin de tour, vendre tout ce qui dépasse ${keep}"><input type="checkbox" data-action="autosell" data-res="${k}" ${auto[k] !== undefined ? 'checked' : ''}> auto &gt; ${keep}</label></div>`;
  };
  const row = (k) => `<div class="stock-row"><span><i style="background:${resColor(k)}"></i>${data.resources[k].name}</span><b>${fmt(p.res[k] || 0)}</b><small class="${(y.net[k] || 0) < 0 ? 'neg' : ''}">${sign(y.net[k] || 0)}</small></div>${sellBar(k)}`;
  el.innerHTML = `<div class="section-title"><span>Entrepôt</span><button class="btn small ghost" data-action="stock">Fermer</button></div>
    ${canSell ? `<p class="muted" style="font-size:12px;margin:0 0 4px">Halle marchande : vente à ${Math.round(G.sellRate(s, 0) * 100)}% de la valeur. Le prix baisse si vous vendez beaucoup, puis remonte chaque tour.</p>` : '<p class="muted" style="font-size:12px;margin:0 0 4px">Construisez une <b>Halle marchande</b> (onglet Industrie, technologie Commerce) pour vendre vos surplus contre de l\'Or.</p>'}
    <div class="stock-group">Biens transformés</div>${G.GOODS.map(row).join('')}
    ${canSell ? `<div class="stock-group">Matériaux</div>${['wood', 'stone', 'food'].map(row).join('')}` : ''}
    <div class="stock-group">Ressources rares</div>${G.LUXURIES.map((k) => row(k) + `<div class="stock-desc ${active.has(k) ? 'good' : ''}">${active.has(k) ? 'Actif : ' : ''}${data.resources[k].desc}</div>`).join('')}
    <p class="muted" style="font-size:12px;margin:8px 0 0">Chaque ressource rare active rapporte aussi ${data.rules.luxuries.diversityPrestige} prestige. Échangez-les en Diplomatie.</p>`;
}

function renderSide() {
  const ranked = [...s.players].sort((a, b) => b.prestige - a.prestige);
  const resol = G.activeResolutions(s).map((r) => `<div class="resolution">${esc(data.rules.congress.resolutions[r.id].name)}${r.target !== null && r.target !== undefined ? ` · ${esc(s.players[r.target].name)}` : ''} <span class="muted">jusqu'au tour ${r.until}</span></div>`).join('');
  const congressOpen = s.congress?.status === 'open' && s.congress.votes[0] === undefined;
  $('#scoreboard').innerHTML = `<div class="section-title"><span>Prestige</span><span>${data.rules.prestigeTarget}</span></div>
    <div class="score-actions"><button class="btn small" data-action="victory">Voies de victoire</button>
    <button class="btn small ${congressOpen ? 'primary' : ''}" data-action="congress" title="Congrès mondial tous les ${data.rules.congress.every} tours">${congressOpen ? 'Voter au Congrès' : `Congrès · tour ${Math.ceil((s.turn + (s.turn % data.rules.congress.every === 0 ? 1 : 0)) / data.rules.congress.every) * data.rules.congress.every}`}</button></div>
    ${s.secretary !== null && s.secretary !== undefined ? `<div class="resolution">Secrétaire du Congrès : <b>${esc(s.players[s.secretary].name)}</b></div>` : ''}${resol}` + ranked.map((p) => `
    <div class="score-row" title="${Object.entries(p.prestigeBreakdown).map(([k, v]) => `${k} : ${v}`).join(' · ')}">
      ${avatar(p, 28)}<span>${esc(p.name)} <span class="muted">· ${data.profilesById[p.profile].name}</span></span><b>${p.prestige}</b>
      <div class="bar"><div style="width:${Math.min(100, (p.prestige / data.rules.prestigeTarget) * 100)}%;background:${p.color}"></div></div>
    </div>`).join('');
  const props = s.proposals.filter((p) => p.to === 0);
  $('#proposals').innerHTML = props.map((pr) => {
    const from = s.players[pr.from];
    const text = {
      promise: `<b>${esc(from.name)}</b> vous demande de <b>promettre</b> de ne plus fonder de ville près de ses frontières. Rompre une promesse coûte très cher (${data.rules.promise.breakPenalty} relation, et les autres l'apprennent).`,
      project: `<b>${esc(from.name)}</b>, votre allié, propose un <b>projet commun</b> : ${G.fmtBundle(s, data.rules.jointProject.cost)} chacun, puis +${data.rules.jointProject.prestige} prestige et ${chipsText(data.rules.jointProject.yields)} par tour pour les deux.`,
      agreement: `<b>${esc(from.name)}</b> propose un accord commercial (+${data.rules.tradeAgreement.gold} Or/tour chacun, relation +${data.rules.tradeAgreement.relationPerTurn}/tour).`,
      alliance: `<b>${esc(from.name)}</b> propose une alliance (+${Math.round(data.rules.alliance.pct * 100)}% Or, Science et Culture).`,
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
  const el = $('#selection');
  if (!sel) { el.hidden = true; return; }
  el.hidden = false;
  if (sel.kind === 'unit') {
    const u = s.units.find((x) => x.id === sel.id);
    if (!u) { sel = null; el.hidden = true; return; }
    const def = G.unitDef(s, u.type);
    const owner = s.players[u.owner];
    const found = u.type === 'settler' ? G.canFound(s, u) : null;
    el.innerHTML = `<h3><span class="dot" style="background:${owner.color}"></span>${def.name}${u.owner !== 0 ? ` <span class="muted">· ${esc(owner.name)}</span>` : ''}</h3>
      <p class="muted" style="font-size:13px;margin:6px 0 0">${def.desc}</p>
      <dl class="kv"><dt>Mouvements</dt><dd>${u.movesLeft.toFixed(1).replace('.0', '')} / ${G.unitMaxMoves(s, u)}</dd><dt>Vision</dt><dd>${G.unitVision(s, u)}</dd>
      ${u.target ? `<dt>Destination</dt><dd>(${u.target.x}, ${u.target.y})</dd>` : ''}</dl>
      ${u.owner === 0 ? `<div class="actions">
        ${u.type === 'settler' ? `<button class="btn primary small" data-action="found" ${found.ok ? '' : 'disabled'}>Fonder une ville (F)</button>` : ''}
        ${u.type === 'engineer' ? (() => { const a = G.canEngineerRoad(s, u), b2 = G.canClearForest(s, u);
          return `<button class="btn small" data-action="eng-road" ${a.ok ? '' : 'disabled'} title="${esc(a.reason || '')}">Route ici (1 Bois)</button><button class="btn small" data-action="eng-clear" ${b2.ok ? '' : 'disabled'} title="${esc(b2.reason || '')}">Défricher (+${data.rules.engineer.clearWood} Bois)</button>`; })() : ''}
        ${pendingMove && pendingMove.uid === u.id ? '<button class="btn primary small" data-action="confirm-move">Confirmer le déplacement</button><button class="btn small" data-action="cancel-move">Annuler</button>' : ''}
        ${u.target ? '<button class="btn small" data-action="cancel-order">Annuler l\'ordre</button>' : ''}
        <button class="btn small ghost" data-action="next-unit">Unité suivante (Espace)</button>
      </div>
      ${found && !found.ok ? `<div class="reason">${found.reason}</div>` : ''}
      <div class="reason">Cliquez une case pour vous y rendre${{ caravan: ' — visez une ville étrangère pour ouvrir une route commerciale', ship: ' — naviguez jusqu\'à une ville étrangère au bord de l\'eau pour une route maritime', emissary: ' — entrez dans une ville étrangère pour y ouvrir une ambassade', airship: ' — il survole montagnes et océans', engineer: ' — puis tracez une route ou défrichez' }[u.type] || ''}.</div>` : ''}`;
    return;
  }
  if (sel.kind === 'city') {
    const c = s.cities.find((x) => x.id === sel.id);
    if (!c) { sel = null; el.hidden = true; return; }
    const owner = s.players[c.owner];
    const cap = G.cityPopCap(s, c);
    const need = data.rules.growthBase + data.rules.growthPerPop * c.pop;
    const blds = s.buildings.filter((b) => b.cityId === c.id);
    const mine = c.owner === 0;
    el.innerHTML = `<h3><span class="dot" style="background:${owner.color}"></span>${esc(c.name)}${c.capital ? ' <span class="tag">Capitale</span>' : ''}${!mine ? ` <span class="muted">· ${esc(owner.name)}</span>` : ''}</h3>
      <dl class="kv"><dt>Population</dt><dd>${c.pop} / ${cap}</dd>
      ${mine ? `<dt>Croissance</dt><dd>${fmt(me().res.food)} / ${need} Nourriture</dd>` : `<dt>Relation</dt><dd>${Math.round(G.getRel(s, 0, c.owner))} · ${G.relStatus(G.getRel(s, 0, c.owner)).label}</dd>`}
      <dt>Palier</dt><dd>${data.rules.tiers[c.tier || 0].name}</dd>
      <dt>Rayon du territoire</dt><dd>${c.radius}</dd><dt>Bâtiments</dt><dd>${blds.length}</dd></dl>
      ${mine ? tierHint(c) : ''}
      ${mine ? `<div class="section-title" style="margin-top:12px"><span>Former une unité</span><span>${c.trained ? '1 / tour — fait' : '1 / tour'}</span></div>
      <div class="actions">${data.units.map((d) => {
        const chk = G.canTrain(s, 0, c.id, d.id);
        return `<button class="btn small unit-btn" data-action="train" data-unit="${d.id}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.reason || d.desc)}">${d.name}<span class="cost">${Object.entries(G.costOf(s, 0, d, false)).map(([k, v]) => `${v} ${data.resources[k].name}`).join(' · ')}</span></button>`;
      }).join('')}</div>
      <div class="reason">Construisez dans le territoire de la ville avec la barre du bas.</div>` : ''}`;
    return;
  }
  const t = s.map.tiles[sel.i];
  const ter = data.terrain[t.type];
  const b = G.buildingAt(s, t.x, t.y);
  const explored = G.isExplored(s, 0, t.x, t.y);
  if (!explored) { el.innerHTML = '<h3>Terre inconnue</h3><p class="muted" style="font-size:13px">Envoyez un explorateur pour révéler cette zone.</p>'; return; }
  const bdef = b && G.buildingDef(s, b.type);
  el.innerHTML = `<h3>${ter.name}</h3>
    <dl class="kv"><dt>Coordonnées</dt><dd>${t.x}, ${t.y}</dd><dt>Propriétaire</dt><dd>${t.owner === -1 ? '—' : esc(s.players[t.owner].name)}</dd>
    <dt>Déplacement</dt><dd>${ter.passable ? (t.road !== -1 ? `${data.rules.road.moveCost} (route)` : ter.move) : 'impraticable'}</dd>
    ${t.luxury ? `<dt>Ressource rare</dt><dd>${data.resources[t.luxury].name}</dd>` : ''}</dl>
    ${t.luxury && !bdef ? `<div class="reason">${data.resources[t.luxury].desc} Construisez un <b>Comptoir</b> ici (onglet Industrie) pour l'exploiter.</div>` : ''}
    ${bdef ? `<div class="section-title" style="margin-top:10px"><span>${bdef.name}</span><span>${b.turnsLeft > 0 ? `${b.turnsLeft} tour(s)` : 'actif'}</span></div>
      <div class="chips">${chips(bdef.yields, 'yield')}${bdef.process ? `<span class="chip">${G.fmtBundle(s, bdef.process.in)} → ${G.fmtBundle(s, bdef.process.out)}</span>` : ''}${b.luxury ? chips({ [b.luxury]: 1 }, 'yield') : ''}${bdef.prestige ? `<span class="chip yield">+${bdef.prestige} prestige</span>` : ''}</div>
      ${(() => { const adj = G.adjacencyBonus(s, b.owner, b.type, b.x, b.y); return Object.keys(adj).length && Object.values(adj).some((v) => v) ? `<div class="chips" style="margin-top:4px"><span class="chip">Adjacence :</span>${chips(Object.fromEntries(Object.entries(adj).filter(([, v]) => v)), 'yield')}</div>` : ''; })()}
      <p class="muted" style="font-size:12.5px;margin:6px 0 0">${bdef.desc}</p>` : ''}`;
}

function tierHint(c) {
  const tiers = data.rules.tiers;
  const cur = tiers[c.tier || 0], next = tiers[(c.tier || 0) + 1];
  const needs = Object.keys(cur.needs || {}).length ? `Consomme ${G.fmtBundle(s, cur.needs)} par tour.` : '';
  const up = next ? `Palier suivant, <b>${next.name}</b> : ${next.minPop} habitants et ${G.fmtBundle(s, next.needs)} par tour → ${chipsText(next.yields)}${next.popCap ? `, +${next.popCap} pop. max` : ''}.` : 'Palier maximal atteint.';
  return `<div class="reason">${needs} ${up}</div>`;
}
const chipsText = (b) => Object.entries(b || {}).map(([k, v]) => `+${v} ${data.resources[k].name}`).join(', ');

function renderBuildbar() {
  const el = $('#buildbar');
  if (!G.citiesOf(s, 0).length) { el.innerHTML = '<div class="muted" style="font-size:13px;padding:4px 2px">Fondez une ville pour débloquer la construction.</div>'; return; }
  const tab = BUILD_TABS[buildTab];
  const items = tab.ids.map((id) => {
    if (id === 'road') {
      const pressed = mode?.type === 'road';
      return `<button class="build-item" data-action="mode-road" aria-pressed="${pressed}" title="Prolonge votre réseau ; relier vos villes à la capitale rapporte +${data.rules.road.connectedCityGold} Or par ville."><b>Route (R)</b><div class="chips">${chips(data.rules.road.cost)}</div><div class="line"><span class="chip yield">Déplacement ${data.rules.road.moveCost}</span></div></button>`;
    }
    const def = G.buildingDef(s, id);
    const locked = def.tech && !G.hasTech(s, 0, def.tech);
    const taken = def.wonder && s.wonders[id] !== undefined;
    const adjTxt = describeAdjacency(def);
    const reason = (locked ? `Nécessite ${G.techDef(s, def.tech).name}` : taken ? `Construite par ${s.players[s.wonders[id]].name}` : def.desc) + (adjTxt ? `\nAdjacence : ${adjTxt}` : '');
    const pressed = mode?.type === 'build' && mode.id === id;
    return `<button class="build-item" data-action="mode-build" data-id="${id}" aria-pressed="${pressed}" aria-disabled="${locked || taken}" title="${esc(reason)}">
      <b>${def.name}${def.wonder ? '' : ''}</b><div class="chips">${costChips(def)}</div>
      <div class="line"><span class="chips">${def.process ? `<span class="chip yield">${Object.values(def.process.in).reduce((a, v) => a + v, 0)}→${chips(def.process.out, 'yield')}</span>` : chips(def.yields, 'yield')}${def.luxuryOnly ? '<span class="chip yield">+1 ressource rare</span>' : ''}${def.prestige ? `<span class="chip yield">+${def.prestige} prest.</span>` : ''}</span></div>
      ${locked ? `<div class="chip" style="margin-top:3px">${G.techDef(s, def.tech).name}</div>` : taken ? '<div class="chip" style="margin-top:3px">Indisponible</div>' : ''}
    </button>`;
  }).join('');
  el.innerHTML = `<div class="tabs" role="tablist">${Object.entries(BUILD_TABS).map(([k, v]) => `<button class="tab" role="tab" aria-selected="${k === buildTab}" data-action="tab" data-tab="${k}">${v.label}</button>`).join('')}
    <button class="tab adj-toggle" aria-pressed="${showAdjacency}" data-action="toggle-adj" title="Afficher les bonus d'adjacence de vos bâtiments sur la carte (A)">Bonus d'adjacence${showAdjacency ? ' : affichés' : ''}</button></div><div class="build-list">${items}</div>`;
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
  const list = [];
  const badges = [];
  const W = s.map.width;
  if (mode?.type === 'build') {
    s.map.tiles.forEach((t, i) => {
      if (t.owner !== 0 || !G.canBuild(s, 0, mode.id, t.x, t.y).ok) return;
      const adj = G.adjacencyBonus(s, 0, mode.id, t.x, t.y);
      const f = G.footprintOf(s, mode.id);
      list.push({ i, color: bonusSum(adj) > 0 ? '#16c172' : '#a8e6c4' });
      if (bonusSum(adj) > 0) badges.push({ i, html: bonusHtml(adj), dx: (f - 1) / 2, dy: (f - 1) / 2, lift: 0.25 });
    });
  } else if (mode?.type === 'road') {
    s.map.tiles.forEach((t, i) => { if (G.canRoad(s, 0, t.x, t.y).ok) list.push({ i, color: '#f5b700' }); });
  } else if (sel?.kind === 'unit') {
    const u = s.units.find((x) => x.id === sel.id);
    if (u && u.owner === 0 && u.movesLeft > 0 && !pendingMove) {
      for (const [i, d] of G.reachable(s, u)) if (d > 0) list.push({ i, color: '#ffffff' });
    }
    if (u && u.owner === 0 && u.target && !pendingMove) list.push({ i: u.target.y * W + u.target.x, color: '#ff6b4a' });
    if (u && pendingMove && pendingMove.uid === u.id) {
      const last = pendingMove.plan.steps[pendingMove.plan.steps.length - 1];
      const turns = pendingMove.plan.turns;
      badges.push({ i: last.i, html: `<span>${turns === 1 ? 'Arrivée ce tour' : `Arrivée dans ${turns} tours`} · cliquez pour confirmer</span>`, lift: 0.75 });
    }
  }
  if (showAdjacency && mode?.type !== 'build') {
    for (const b of s.buildings) {
      if (b.owner !== 0) continue;
      const adj = G.adjacencyBonus(s, 0, b.type, b.x, b.y);
      if (bonusSum(adj) <= 0) continue;
      const f = G.footprintOf(s, b.type);
      badges.push({ i: b.y * W + b.x, html: bonusHtml(adj), dx: (f - 1) / 2, dy: (f - 1) / 2, lift: f > 1 ? 0.9 : 0.6 });
    }
  }
  renderer.setBadges(badges);
  const pu = pendingMove && s.units.find((x) => x.id === pendingMove.uid);
  renderer.setPath(pu ? pendingMove.plan.steps : null, pu ? pu.y * W + pu.x : null);
  renderer.setHighlights(list);
  let selIdx = null;
  if (sel?.kind === 'unit') { const u = s.units.find((x) => x.id === sel.id); if (u) selIdx = u.y * W + u.x; }
  if (sel?.kind === 'city') { const c = s.cities.find((x) => x.id === sel.id); if (c) selIdx = c.y * W + c.x; }
  if (sel?.kind === 'tile') selIdx = sel.i;
  renderer.setCursor(selIdx, 'select');
  const hint = $('#hint');
  if (mode?.type === 'build') { hint.hidden = false; hint.textContent = `${G.buildingDef(s, mode.id).name} : choisissez une case verte${G.footprintOf(s, mode.id) > 1 ? ' (coin nord-ouest du quartier 2×2)' : ''} — survolez pour voir les bonus d'adjacence — Échap pour annuler`; }
  else if (mode?.type === 'road') { hint.hidden = false; hint.textContent = 'Route : cliquez les cases jaunes pour prolonger le réseau — Échap pour terminer'; }
  else if (pendingMove) { hint.hidden = false; hint.textContent = `Déplacement prévu (${pendingMove.plan.turns === 1 ? 'arrivée ce tour' : `${pendingMove.plan.turns} tours`}) : cliquez à nouveau la destination pour confirmer — Échap pour annuler`; }
  else hint.hidden = true;
}

// ------------------------------------------------------------- interactions
function select(next) { sel = next; mode = null; pendingMove = null; renderAll(); }

function setMode(next) {
  mode = next;
  renderBuildbar(); renderHighlights();
}

function refreshWorld() { renderer.refresh(); renderAll(); }

function handleTileClick(i, shift) {
  if (s.winner) return;
  const t = s.map.tiles[i];
  if (mode?.type === 'build') {
    const r = G.build(s, 0, mode.id, t.x, t.y);
    if (!r.ok) { toast(r.reason, 'bad'); return; }
    toast(`${G.buildingDef(s, mode.id).name} en construction.`, 'good');
    if (!shift || !G.canAfford(s, 0, G.costOf(s, 0, G.buildingDef(s, mode.id)))) mode = null;
    sel = { kind: 'tile', i };
    refreshWorld(); save(); return;
  }
  if (mode?.type === 'road') {
    const r = G.buildRoad(s, 0, t.x, t.y);
    if (!r.ok) toast(r.reason, 'bad');
    refreshWorld(); save(); return;
  }
  const u = sel?.kind === 'unit' ? s.units.find((x) => x.id === sel.id) : null;
  if (u && u.owner === 0 && (u.x !== t.x || u.y !== t.y)) {
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
  const r = G.orderMove(s, u.id, x, y);
  if (!r.ok) { toast(r.reason, 'bad'); return; }
  Tuto.flag(s, 'moved');
  renderer.animateUnit(u.id, r.steps);
  if (!s.units.includes(u)) { sel = null; toast('Arrivée à destination : mission accomplie !', 'good'); }
  refreshWorld(); save();
}

function nextUnit() {
  const mine = s.units.filter((u) => u.owner === 0 && u.movesLeft > 0 && !u.target);
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
  closeModal();
  mode = null;
  const before = snapshot();
  playAITurns(s);
  G.endRound(s);
  save();
  refreshWorld();
  if (s.winner) { showEnd(); return; }
  showSummary(before);
  if (!me().research && G.availableTechs(s, 0).length) toast('Choisissez une recherche (T).');
  const props = s.proposals.filter((p) => p.to === 0).length;
  if (props) toast(`${props} proposition(s) diplomatique(s) en attente.`);
  if (s.congress?.status === 'open' && s.congress.votes[0] === undefined) showCongress();
}

// ---------------------------------------------------------------- modales
function openModal(html) { const m = $('#modal'); m.innerHTML = html; m.hidden = false; m.querySelector('button, select, input')?.focus(); }
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; if (s) renderTutorial(); }

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
      <div class="meta"><span>${done ? 'Acquise' : cur ? `En cours · ${eta} tour(s)` : `${cost} science${cost < t.cost ? ' (allié −25 %)' : ''}`}</span><span>${!done && req ? `Requiert ${req}` : `Palier ${t.tier}`}</span></div></button>`;
  }).join('');
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Technologies"><header><div><h2>Technologies</h2>
    <div class="muted" style="font-size:13px;margin-top:2px">Science disponible : ${fmt(p.sciencePool)} · ${sign(y)} / tour · chaque technologie rapporte ${data.rules.prestige.perTechTier} prestige par palier</div></div>
    <button class="btn" data-action="close">Fermer</button></header>
    <div class="tech-grid">${Object.entries(BRANCHES).map(([k, v]) => `<div class="branch"><h4>${v}</h4>${col(k)}</div>`).join('')}</div></div>`);
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
        ${promised ? '<span class="tag warn">Promesse : pas de ville près de chez lui</span>' : ''}${nProj ? `<span class="tag good">${nProj} projet(s) commun(s)</span>` : ''}</div>
      ${mem.length ? `<div class="memories"><div class="stock-group" style="margin-top:8px">Ce qu'il retient de vous</div>${mem.map((m) => `<div class="mem ${m.value < 0 ? 'bad' : 'good'}"><span>${esc(m.text)}</span><b>${m.value > 0 ? '+' : ''}${m.value}</b></div>`).join('')}</div>` : ''}
      <div class="actions">
        <button class="btn small" data-action="gift" data-id="${q.id}" ${me().res.gold < 25 ? 'disabled' : ''}>Offrir 25 Or</button>
        ${agr ? `<button class="btn small" data-action="cancel-agr" data-id="${q.id}">Rompre l'accord</button>` : `<button class="btn small" data-action="agreement" data-id="${q.id}" title="Requiert Protocole et relation ≥ ${data.rules.tradeAgreement.minRelation}">Accord commercial</button>`}
        ${all ? `<button class="btn small" data-action="project" data-id="${q.id}" ${nProj >= data.rules.jointProject.maxPerPair ? 'disabled' : ''} title="Coûte ${G.fmtBundle(s, data.rules.jointProject.cost)} à chacun : +${data.rules.jointProject.prestige} prestige et ${chipsText(data.rules.jointProject.yields)} par tour pour les deux">Projet commun</button>`
          : `<button class="btn small" data-action="alliance" data-id="${q.id}" title="Requiert Ambassades et relation ≥ ${pers?.allianceMin ?? data.rules.alliance.minRelation}">Alliance</button>`}
      </div>
      <div class="form-row">
        <label class="field">Je donne<span style="display:flex;gap:4px"><input type="number" min="1" value="20" id="give-amt-${q.id}" aria-label="Quantité donnée"><select id="give-res-${q.id}">${resOpts('wood')}</select></span></label>
        <label class="field">Contre<span style="display:flex;gap:4px"><input type="number" min="1" value="20" id="want-amt-${q.id}" aria-label="Quantité demandée"><select id="want-res-${q.id}">${resOpts('gold')}</select></span></label>
        <button class="btn small" data-action="exchange" data-id="${q.id}">Proposer l'échange</button>
      </div></div>`;
  }).join('');
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Diplomatie"><header><div><h2>Diplomatie</h2>
    <div class="muted" style="font-size:13px;margin-top:2px">Les voisins méfiants ou hostiles réduisent votre productivité. Les accords et alliances la renforcent. Vos alliés partagent leurs technologies (−25 % de coût).</div></div>
    <button class="btn" data-action="close">Fermer</button></header>
    <div class="diplo-grid">${cards}</div>
    <div class="effects"><b>Effets actuels sur votre productivité</b>${dip.reasons.length ? `<ul>${dip.reasons.map((r) => `<li class="${r.tone}">${esc(r.text)} : ${r.value > 0 ? '+' : ''}${Math.round(r.value * 100)}%${r.res ? ' Or' : ''}</li>`).join('')}</ul>` : '<div class="muted" style="margin-top:4px">Aucun effet pour le moment.</div>'}</div></div>`);
}

function showCongress() {
  const c = s.congress;
  const R = data.rules.congress;
  if (!c) { openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Congrès" style="width:min(520px,100%)"><header><h2>Congrès mondial</h2><button class="btn" data-action="close">Fermer</button></header><p>Le premier Congrès se réunira au tour ${R.every}. Une résolution y est votée et un Secrétaire élu (+${R.secretaryPrestige} prestige). Être élu ${data.rules.victory.secretaryWins} fois, avec au moins un allié, donne la victoire diplomatique.</p></div>`); return; }
  const def = R.resolutions[c.id];
  const open = c.status === 'open' && c.votes[0] === undefined;
  const w = (pid) => G.voteWeight(s, pid).toFixed(1).replace('.0', '');
  const rows = s.players.filter((p) => !p.isHuman).map((p) => `<div class="mem"><span>${esc(p.name)} <span class="muted">(poids ${w(p.id)})</span></span><b class="${c.votes[p.id] ? 'good' : 'bad'}">${c.votes[p.id] ? 'Pour' : 'Contre'}</b></div>`).join('');
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Congrès mondial" style="width:min(620px,100%)">
    <header><div><h2>Congrès mondial · tour ${c.turn}</h2><div class="muted" style="font-size:13px">Poids d'un vote : 1 + alliances + 0,5 par accord + 0,5 par ambassade reçue. Le vôtre : ${w(0)}.</div></div><button class="btn" data-action="close">Fermer</button></header>
    <div class="section-title"><span>Résolution</span></div>
    <p style="margin:0 0 6px"><b>${def.name}</b>${c.target !== null ? ` — cible : <b>${esc(s.players[c.target].name)}</b>` : ''}</p><p class="muted" style="margin:0 0 10px;font-size:13.5px">${def.desc}</p>
    <div class="memories">${rows}</div>
    ${open ? `<div class="section-title" style="margin-top:14px"><span>Élection du Secrétaire (+${R.secretaryPrestige} prestige)</span></div>
      <div class="cands">${s.players.map((p) => `<label class="check"><input type="radio" name="secretary" value="${p.id}" ${p.id === 0 ? 'checked' : ''}> ${esc(p.name)} <span class="muted">· élu ${p.secretaryWins || 0} fois</span></label>`).join('')}</div>
      <div class="actions" style="margin-top:14px"><button class="btn primary" data-action="vote" data-yes="1">Voter pour la résolution</button><button class="btn" data-action="vote" data-yes="0">Voter contre</button></div>`
      : `<p style="margin-top:12px">Résultat : <b>${c.passed ? 'adoptée' : 'rejetée'}</b>${c.tally ? ` (${c.tally.yes.toFixed(1).replace('.0', '')} pour, ${c.tally.no.toFixed(1).replace('.0', '')} contre)` : ''}. Secrétaire : <b>${c.secretary !== null && c.secretary !== undefined ? esc(s.players[c.secretary].name) : 'aucun'}</b>. Prochain congrès au tour ${c.turn + R.every}.</p>`}
  </div>`);
}

function showVictory() {
  const rivals = s.players.filter((p) => p.id !== 0);
  const mine = G.victoryProgress(s, 0);
  const paths = ['prestige', 'science', 'culture', 'economy', 'diplomacy'];
  const bestRival = (k) => rivals.map((q) => ({ q, v: G.victoryProgress(s, q.id)[k] })).sort((a, b) => b.v.pct - a.v.pct)[0];
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Voies de victoire" style="width:min(680px,100%)">
    <header><div><h2>Voies de victoire</h2><div class="muted" style="font-size:13px">La première voie complétée l'emporte ; sinon, le meilleur prestige au tour ${data.rules.turnLimit}.</div></div><button class="btn" data-action="close">Fermer</button></header>
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
    <div class="actions"><button class="btn small" data-action="toggle-confirm" aria-pressed="${confirmMoves}">Confirmation des déplacements : ${confirmMoves ? 'activée' : 'désactivée'}</button></div>
    <div class="section-title" style="margin-top:16px"><span>Partie</span></div>
    <div class="actions"><button class="btn small" data-action="tuto-restart">${s.tutorial?.active ? 'Recommencer le tutoriel' : 'Relancer le tutoriel'}</button><button class="btn small" data-action="new-game">Retour à l'accueil</button></div>
    <p class="muted" style="font-size:12.5px;margin:14px 0 0">La partie est aussi sauvegardée automatiquement à chaque tour dans ce navigateur.</p></div>`);
}

function showEnd() {
  const ranked = [...s.players].sort((a, b) => b.prestige - a.prestige);
  const won = s.winner.pid === 0;
  openModal(`<div class="card dialog" role="dialog" aria-modal="true" aria-label="Fin de partie" style="width:min(520px,100%)">
    <header><h2>${won ? 'Victoire !' : 'Partie terminée'}</h2></header>
    <p>${esc(s.winner.reason)}</p>
    ${ranked.map((p, k) => `<div class="score-row"><span class="dot" style="background:${p.color}"></span><span>${k + 1}. ${esc(p.name)} <span class="muted">· ${data.profilesById[p.profile].name}</span></span><b>${p.prestige}</b></div>`).join('')}
    <div class="actions" style="margin-top:16px"><button class="btn primary" data-action="new-game">Nouvelle partie</button><button class="btn" data-action="close">Voir la carte</button></div></div>`);
}

// ---------------------------------------------------------------- événements
function onAction(e) {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') {
    if (b?.dataset.action === 'mode-build') toast(b.title, 'bad');
    return;
  }
  const id = Number(b.dataset.id);
  const a = b.dataset.action;
  switch (a) {
    case 'end-turn': endTurn(); break;
    case 'tech': showTech(); break;
    case 'diplo': showDiplo(); break;
    case 'close': closeModal(); break;
    case 'tab': buildTab = b.dataset.tab; renderBuildbar(); break;
    case 'mode-build': setMode(mode?.type === 'build' && mode.id === b.dataset.id ? null : { type: 'build', id: b.dataset.id }); break;
    case 'mode-road': setMode(mode?.type === 'road' ? null : { type: 'road' }); break;
    case 'found': foundSelected(); break;
    case 'confirm-move': { const u = s.units.find((x) => x.id === pendingMove?.uid); if (u) executeMove(u, pendingMove.x, pendingMove.y); break; }
    case 'cancel-move': pendingMove = null; renderSelection(); renderHighlights(); break;
    case 'toggle-confirm': confirmMoves = !confirmMoves; try { localStorage.setItem('expandto.confirmMoves', confirmMoves ? '1' : '0'); } catch { /* ignore */ } showMenu(); break;
    case 'cancel-order': { const u = s.units.find((x) => x.id === sel.id); if (u) u.target = null; renderAll(); break; }
    case 'next-unit': nextUnit(); break;
    case 'train': {
      const r = G.train(s, 0, sel.id, b.dataset.unit);
      if (!r.ok) toast(r.reason, 'bad'); else { toast(`${G.unitDef(s, r.unit.type).name} formé.`, 'good'); sel = { kind: 'unit', id: r.unit.id }; }
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
    case 'congress': showCongress(); break;
    case 'vote': {
      const cand = $('input[name="secretary"]:checked');
      G.castCongressVote(s, 0, b.dataset.yes === '1', cand ? Number(cand.value) : null);
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
    case 'new-game': closeModal(); save(); for (const x of ['#topbar', '#side', '#buildbar', '#selection', '#hint', '#tutorial', '#summary']) $(x).hidden = true; s = null; showStart(); break;
    case 'menu': showMenu(); break;
    case 'toggle-adj': showAdjacency = !showAdjacency; renderBuildbar(); renderHighlights(); break;
    case 'sell': {
      const r = G.sell(s, 0, b.dataset.res, Number(b.dataset.qty));
      if (!r.ok) toast(r.reason, 'bad'); else toast(`${r.qty} ${data.resources[b.dataset.res].name} vendus : +${r.gold} Or.`, 'good');
      renderTop(); renderStock(); save(); break;
    }
    case 'autosell': {
      G.setAutoSell(s, 0, b.dataset.res, b.checked ? data.rules.market.autoSellKeep : null);
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
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!s || !down || down.b !== 0) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const i = renderer.pick(e.clientX, e.clientY);
    if (i !== null) handleTileClick(i, e.shiftKey);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!s) return;
    const i = renderer.pick(e.clientX, e.clientY);
    if (i === hoverIdx) return;
    hoverIdx = i;
    renderer.setCursor(i, 'hover');
    if (mode && i !== null) {
      const t = s.map.tiles[i];
      const r = mode.type === 'build' ? G.canBuild(s, 0, mode.id, t.x, t.y) : G.canRoad(s, 0, t.x, t.y);
      const base = mode.type === 'build' ? `${G.buildingDef(s, mode.id).name} : ` : 'Route : ';
      let extra = '';
      if (r.ok && mode.type === 'build') {
        const adj = Object.entries(G.adjacencyBonus(s, 0, mode.id, t.x, t.y)).filter(([, v]) => v);
        if (adj.length) extra = ` · adjacence ${adj.map(([k, v]) => `+${v} ${data.resources[k].name}`).join(', ')}`;
      }
      $('#hint').textContent = base + (r.ok ? `cliquez pour construire${extra} (Maj : en placer plusieurs)` : r.reason);
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
    else if (e.key === 't' || e.key === 'T') showTech();
    else if (e.key === 'd' || e.key === 'D') showDiplo();
    else if (e.key === 'm' || e.key === 'M') showMenu();
    else if (e.key === 'a' || e.key === 'A') { showAdjacency = !showAdjacency; renderBuildbar(); renderHighlights(); }
  });
}

// --------------------------------------------------------------------- boot
(async function boot() {
  data = await loadData();
  renderer = new Renderer($('#viewport'));
  renderer.setState(G.createGame({ data, seed: 7, aiCount: 3 }), 0);
  renderer.state.players[0].explored.fill(1);
  renderer.refresh();
  bindInput();
  setInterval(() => { if (s && !$('#side').hidden) drawMinimap(); }, 300);
  $('#minimap canvas').addEventListener('click', (e) => {
    if (!s) return;
    const r = e.currentTarget.getBoundingClientRect();
    const scale = r.width / s.map.width;
    renderer.focus(Math.floor((e.clientX - r.left) / scale), Math.floor((e.clientY - r.top) / scale));
  });
  showStart();
  window.__expandto = { get state() { return s; }, G, renderer };
})();

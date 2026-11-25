// Fiche des bonus d'adjacence, générée depuis les données du jeu (toujours à jour).
// Usage : node tools/adjacency-sheet.mjs sortie.html   (puis l'imprimer en PDF, paysage A4)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const B = load('buildings.json'), R = load('rules.json'), T = load('terrain.json'), RES = load('resources.json'), TECH = load('techs.json'), PROF = load('profiles.json');
const byId = Object.fromEntries(B.map((b) => [b.id, b]));
const techName = (id) => TECH.find((t) => t.id === id)?.name || id;
const ERAS = R.eras?.list.map((e) => e.name) || [];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const resName = (k) => RES[k]?.name || k;
const bundle = (b) => Object.entries(b || {}).map(([k, v]) => `+${v} ${resName(k)}`).join(', ');
const nearName = (id) => (id === 'city' ? 'ville' : id === 'wonder' ? 'merveille' : (byId[id]?.name || id).toLowerCase());
const terrName = (k) => (T[k]?.name || k).toLowerCase();

function ruleText(r) {
  const who = r.terrain ? [].concat(r.terrain).map(terrName).join(' / ') : [].concat(r.near).map(nearName).join(' / ');
  return `<b>${bundle(r.yields)}</b> par voisin : ${esc(who)}`;
}
const unlock = (b) => [b.tech ? techName(b.tech) : null, b.era ? ERAS[b.era] : null, b.profile ? `profil ${PROF.find((p) => p.id === b.profile)?.name}` : null].filter(Boolean).join(' · ') || 'dès le départ';
const base = (b) => (b.process ? `${Object.entries(b.process.in).map(([k, v]) => `${v} ${resName(k)}`).join(' + ')} → ${Object.entries(b.process.out).map(([k, v]) => `${v} ${resName(k)}`).join(' + ')}` : bundle(b.yields) || '—');

const GROUPS = [
  ['Production', ['farm', 'lumber', 'quarry', 'market', 'watermill', 'harbor', 'district']],
  ['Industrie', ['sawmill', 'manufactory', 'forge', 'markethall', 'outpost']],
  ['Savoir et culture', ['library', 'lab', 'theatre', 'monument', 'museum']],
  ['Quartiers 2×2', ['campus', 'artsquarter', 'merchantquarter']],
  ['Cadre de vie', ['park', 'aqueduct', 'hospital', 'granary', 'levee']],
  ['Bâtiments de profil', ['guildhall', 'academy', 'workshop', 'chancery', 'lodge']],
];

// Tableau 1 : ce que chaque bâtiment gagne de ses voisins.
const rows1 = GROUPS.map(([g, ids]) => `<tr class="grp"><td colspan="5">${g}</td></tr>` + ids.filter((id) => byId[id]).map((id) => {
  const b = byId[id];
  const adj = (b.adjacency || []).map((r) => `${ruleText(r)}${r.max ? ` <span class="max">max ${r.max}</span>` : ' <span class="max">sans plafond</span>'}`).join('<br>') || '<span class="muted">aucun</span>';
  return `<tr><td><b>${esc(b.name)}</b>${b.footprint ? ' <span class="tag">2×2</span>' : ''}</td><td>${base(b)}</td><td>${adj}</td><td>${b.terrain.map(terrName).join(', ')}${b.coastal ? ' (côte)' : ''}${b.river ? ' (rivière)' : ''}${b.luxuryOnly ? ' (ressource rare)' : ''}</td><td>${esc(unlock(b))}</td></tr>`;
}).join('')).join('');

// Tableau 2 : ce que chaque voisin apporte (lecture inverse, pour composer un quartier).
const giver = new Map();
const add = (key, label, text) => { if (!giver.has(key)) giver.set(key, { label, items: [] }); giver.get(key).items.push(text); };
for (const b of B) for (const r of b.adjacency || []) {
  const gain = `${esc(b.name)} ${bundle(r.yields)}${r.max ? ` (max ${r.max})` : ''}`;
  if (r.terrain) for (const t of [].concat(r.terrain)) add(`t:${t}`, `${T[t]?.name || t} <span class="muted">(terrain)</span>`, gain);
  else for (const n of [].concat(r.near)) add(`b:${n}`, n === 'city' ? 'Ville <span class="muted">(centre)</span>' : n === 'wonder' ? 'Toute merveille' : esc(byId[n]?.name || n), gain);
}
const order = (k) => (k.startsWith('t:') ? 2 : k === 'b:city' || k === 'b:wonder' ? 1 : 0);
const rows2 = [...giver.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[1].label.localeCompare(b[1].label, 'fr'))
  .map(([, v]) => `<tr><td><b>${v.label}</b></td><td>${v.items.join(' · ')}</td></tr>`).join('');

const NW = R.naturalWonders?.adjacency, RV = R.river;
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Expand-to — Bonus d'adjacence</title>
<style>
@page { size: A4 landscape; margin: 12mm 12mm 14mm; }
body { font-family: 'Nunito', 'Segoe UI', system-ui, sans-serif; color: #2f2a33; font-size: 10.5pt; line-height: 1.35; }
h1 { font-size: 20pt; margin: 0 0 2px; } h1 span { color: #ff6b4a; }
h2 { font-size: 13pt; margin: 18px 0 6px; border-bottom: 2px solid #ff6b4a; padding-bottom: 3px; break-after: avoid; }
.lead { color: #6e6267; margin: 0 0 10px; }
ul { margin: 4px 0 8px 18px; padding: 0; } li { margin: 2px 0; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; }
th { text-align: left; background: #2f2a33; color: #fff; font-weight: 700; padding: 5px 7px; font-size: 9.5pt; }
td { padding: 4px 7px; border-bottom: 1px solid #ece2da; vertical-align: top; font-size: 9.5pt; }
tr { break-inside: avoid; }
tr.grp td { background: #f7f0ea; font-weight: 800; color: #b9503b; font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; padding-top: 7px; }
.max { display: inline-block; font-size: 8pt; color: #6e6267; background: #f0efec; border-radius: 6px; padding: 0 5px; margin-left: 3px; }
.tag { font-size: 8pt; background: #e7f1fb; color: #2f5fa8; border-radius: 6px; padding: 0 5px; }
.muted { color: #8a7f84; }
.recipes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
.recipe { border: 1px solid #ece2da; border-radius: 10px; padding: 7px 10px; break-inside: avoid; }
.recipe b.t { color: #b9503b; }
.foot { color: #8a7f84; font-size: 8.5pt; margin-top: 10px; }
</style></head><body>
<h1>Expand-<span>to</span> · Bonus d'adjacence</h1>
<p class="lead">Tous les bonus que les bâtiments tirent de leurs voisins, pour composer des quartiers optimisés. Valeurs tirées directement des données du jeu.</p>

<h2>Comment ça marche</h2>
<ul>
<li><b>Voisins</b> : les 8 cases autour du bâtiment (12 cases autour d'un quartier 2×2). Un quartier 2×2 voisin ne compte qu'une fois.</li>
<li><b>Plafond</b> : « max 2 » signifie que le bonus s'arrête après 2 voisins de ce type ; « sans plafond » : chaque voisin compte.</li>
<li><b>Rivière</b> : un bâtiment construit sur une case de rivière gagne ${bundle(RV.buildingYield)} (une ferme, aussi +${RV.farmFood} Nourriture). Une ville au bord d'une rivière gagne ${bundle(RV.cityYield)}.</li>
<li><b>Merveille naturelle</b> voisine : ${bundle(NW)} pour tout bâtiment (une seule fois).</li>
<li><b>Les merveilles</b> n'ont pas de bonus d'adjacence propre, mais comptent comme « merveille » pour le Théâtre, le Monument et le Quartier des arts.</li>
<li><b>En jeu</b> : touche A pour voir les bonus actifs, touche K pour poser des bâtiments prévus (comptés dans les aperçus), et « Déplacer » sur un bâtiment pour le réinstaller ailleurs (${bundle(R.relocate?.cost || {}).replace('+', '')}).</li>
</ul>

<h2>Ce que chaque bâtiment gagne de ses voisins</h2>
<table><thead><tr><th style="width:17%">Bâtiment</th><th style="width:17%">Production de base</th><th style="width:33%">Bonus d'adjacence</th><th style="width:17%">Terrain</th><th style="width:16%">Débloqué par</th></tr></thead><tbody>${rows1}</tbody></table>

<h2>Ce que chaque voisin apporte (lecture inverse)</h2>
<table><thead><tr><th style="width:20%">Voisin</th><th>Bâtiments qui en profitent</th></tr></thead><tbody>${rows2}</tbody></table>

<h2>Quartiers conseillés</h2>
<div class="recipes">
<div class="recipe"><b class="t">Pôle savant</b> — un Campus 2×2 entouré de Laboratoires et de Bibliothèques. Le Campus gagne +1 Science par laboratoire ou bibliothèque (max 4) ; chaque Laboratoire +2 par bibliothèque ou campus (max 2) ; chaque Bibliothèque +1 par laboratoire, bibliothèque ou campus (max 2). L'Académie royale (Érudit) s'y glisse aussi.</div>
<div class="recipe"><b class="t">Pôle culturel</b> — un Quartier des arts 2×2 avec Théâtre, Monument et une merveille autour. Quartier des arts +1 Culture par théâtre, monument ou merveille (max 4) ; Théâtre +1 par monument, quartier des arts ou merveille (max 3) ; Monument +1 par théâtre ou merveille (max 2).</div>
<div class="recipe"><b class="t">Pôle marchand</b> — Marchés collés à la ville (+2 Or chacun, sans plafond), un Quartier marchand 2×2 au milieu des marchés et du Port (+1 Or par voisin, max 4), la Halle marchande et la Maison des Guildes (Négociant) à côté. Le Port gagne +1 Or par marché ou quartier marchand, sans plafond.</div>
<div class="recipe"><b class="t">Pôle bois</b> — une Scierie au milieu des forêts (+1 Bois par forêt, max 3), la Menuiserie contre la Scierie (+1 Planche), un Moulin à eau sur la rivière contre la Menuiserie (+1 Nourriture).</div>
<div class="recipe"><b class="t">Pôle pierre</b> — une Carrière sur une colline entourée de collines et de montagnes (+1 Pierre par case, max 3), la Forge contre la Carrière (+1 Outil), l'Atelier des maîtres (Bâtisseur) contre la carrière et la forge (+1 Pierre par voisin, max 2).</div>
<div class="recipe"><b class="t">Grenier</b> — des Fermes en grappe (+1 Nourriture par ferme voisine, max 2), un Moulin à eau sur la rivière au milieu (+1 Nourriture par ferme, max 2), la Manufacture contre une ferme (+1 Bien). Une ferme sur la rivière gagne en plus +1 Or et +1 Nourriture.</div>
<div class="recipe"><b class="t">Ville résidentielle</b> — les Quartiers résidentiels groupés et contre un Marché (+1 Or par quartier résidentiel ou marché voisin, max 2), chacun +3 population maximale (2 par ville). Un Parc contre la ville : +1 Culture et −2 pollution.</div>
<div class="recipe"><b class="t">Repères</b> — avant de bâtir, posez le quartier entier en bâtiments prévus (touche K) : leurs bonus apparaissent dans les aperçus. Pour réorganiser une ville déjà construite, déplacez ses bâtiments un à un.</div>
</div>
<p class="foot">Fiche générée depuis les données du jeu (tools/adjacency-sheet.mjs).</p>
</body></html>`;

fs.writeFileSync(process.argv[2] || 'adjacences.html', html);
console.log('écrit', process.argv[2] || 'adjacences.html');

// Graphique en lignes (SVG) pour les statistiques de fin de partie.
// Couleurs = identité des joueurs ; chaque courbe porte aussi son nom (étiquette directe) et un tableau
// reprend les valeurs : la couleur n'est jamais la seule information.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent = null) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// series : [{ name, color, values: [number per turn], strong }] ; turns : [numéros de tour]
export function lineChart(container, { series, turns, label }) {
  container.innerHTML = '';
  const W = 640, H = 260, m = { l: 40, r: 96, t: 12, b: 26 };
  const maxV = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i) => m.l + (turns.length <= 1 ? 0 : (i / (turns.length - 1)) * (W - m.l - m.r));
  const y = (v) => m.t + (1 - v / maxV) * (H - m.t - m.b);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${label} par tour`, class: 'chart' }, container);
  // Grille et axes, discrets
  for (let k = 0; k <= 4; k++) {
    const v = (maxV * k) / 4;
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: k === 0 ? 'axis' : 'grid' }, svg);
    el('text', { x: m.l - 6, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' }, svg).textContent = Math.round(v);
  }
  const step = Math.max(1, Math.ceil(turns.length / 8));
  turns.forEach((t, i) => { if (i % step === 0 || i === turns.length - 1) el('text', { x: x(i), y: H - 8, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = t; });
  // Courbes
  for (const s of [...series].sort((a, b) => (a.strong ? 1 : 0) - (b.strong ? 1 : 0))) {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.strong ? 3 : 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  }
  // Étiquettes directes en bout de courbe, écartées pour éviter les chevauchements
  const ends = series.map((s) => ({ s, y: y(s.values[s.values.length - 1] ?? 0) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
  const xe = x(turns.length - 1);
  for (const e of ends) {
    el('circle', { cx: xe, cy: y(e.s.values[e.s.values.length - 1] ?? 0), r: 4, fill: e.s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
    const t = el('text', { x: xe + 8, y: e.y + 4, class: e.s.strong ? 'end-label strong' : 'end-label' }, svg);
    t.textContent = e.s.name;
  }
  // Survol : ligne verticale + infobulle avec toutes les séries
  const cross = el('line', { y1: m.t, y2: H - m.b, class: 'cross', visibility: 'hidden' }, svg);
  const tip = document.createElement('div');
  tip.className = 'chart-tip'; tip.hidden = true;
  container.appendChild(tip);
  const hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent', tabindex: 0 }, svg);
  const show = (i) => {
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    tip.replaceChildren();
    const h = document.createElement('div'); h.className = 'chart-tip-head'; h.textContent = `Tour ${turns[i]}`; tip.appendChild(h);
    for (const s of [...series].sort((a, b) => b.values[i] - a.values[i])) {
      const row = document.createElement('div'); row.className = 'chart-tip-row';
      const key = document.createElement('i'); key.style.background = s.color;
      const v = document.createElement('b'); v.textContent = s.values[i];
      const n = document.createElement('span'); n.textContent = s.name;
      row.append(key, v, n); tip.appendChild(row);
    }
    tip.hidden = false;
    const px = (x(i) / W) * container.clientWidth;
    tip.style.left = `${Math.min(px + 12, container.clientWidth - 170)}px`;
  };
  const idxAt = (clientX) => {
    const r = svg.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(turns.length - 1, Math.round(((vx - m.l) / (W - m.l - m.r)) * (turns.length - 1))));
  };
  let cur = turns.length - 1;
  hit.addEventListener('pointermove', (e) => { cur = idxAt(e.clientX); show(cur); });
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  hit.addEventListener('focus', () => show(cur));
  hit.addEventListener('blur', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { cur = Math.max(0, cur - 1); show(cur); e.preventDefault(); }
    if (e.key === 'ArrowRight') { cur = Math.min(turns.length - 1, cur + 1); show(cur); e.preventDefault(); }
  });
}

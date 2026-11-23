// Sauvegardes : une sauvegarde automatique + 3 emplacements, export / import de fichier JSON.
import { makeRng } from '../core/rng.js';

const PREFIX = 'expandto.';
export const SLOTS = [
  { key: 'auto', label: 'Sauvegarde automatique' },
  { key: 'slot1', label: 'Emplacement 1' },
  { key: 'slot2', label: 'Emplacement 2' },
  { key: 'slot3', label: 'Emplacement 3' },
];
const FORMAT = 1;

const store = {
  get: (k) => { try { return localStorage.getItem(PREFIX + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(PREFIX + k, v); return true; } catch { return false; } },
  del: (k) => { try { localStorage.removeItem(PREFIX + k); } catch { /* ignore */ } },
};

// Reprend l'ancienne sauvegarde unique du prototype v0.1.
try {
  const legacy = localStorage.getItem('expandto.save.v1');
  if (legacy && !store.get('auto')) store.set('auto', JSON.stringify({ format: FORMAT, meta: null, state: JSON.parse(legacy) }));
  if (legacy) localStorage.removeItem('expandto.save.v1');
} catch { /* ignore */ }

export function serialize(s) {
  const { data: _d, rules: _r, rng: _g, ...state } = s;
  const p = s.players[0];
  return JSON.stringify({
    format: FORMAT,
    meta: { savedAt: new Date().toISOString(), turn: s.turn, name: p.name, profile: p.profile, prestige: p.prestige, seed: s.seed, winner: !!s.winner },
    state,
  });
}

export function deserialize(text, data) {
  const parsed = JSON.parse(text);
  const st = parsed.state || parsed; // accepte aussi un état brut
  if (!st || !st.map || !Array.isArray(st.players)) throw new Error('Fichier de sauvegarde invalide.');
  st.data = data; st.rules = data.rules;
  st.rng = makeRng((st.seed * 31 + st.turn) >>> 0);
  return st;
}

export const saveTo = (key, s) => store.set(key, serialize(s));
export const loadFrom = (key, data) => { const raw = store.get(key); return raw ? deserialize(raw, data) : null; };
export const remove = (key) => store.del(key);

export function listSaves() {
  return SLOTS.map((slot) => {
    const raw = store.get(slot.key);
    if (!raw) return { ...slot, meta: null, empty: true };
    try { return { ...slot, meta: JSON.parse(raw).meta || {}, empty: false }; } catch { return { ...slot, meta: {}, empty: false, broken: true }; }
  });
}

export function exportFile(s) {
  const blob = new Blob([serialize(s)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `expand-to-tour-${s.turn}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function pickFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) { reject(new Error('Aucun fichier choisi.')); return; }
      f.text().then(resolve, reject);
    });
    input.click();
  });
}

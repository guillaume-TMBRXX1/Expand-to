// Sons procéduraux (WebAudio) : aucun fichier audio, des petites notes douces et « jouet ».
// La musique de fond est elle aussi générée : une progression d'accords, une basse, un tapis et une mélodie
// qui ne se répète jamais à l'identique. Son humeur suit la saison, ses instruments suivent l'ère.
let ctx = null, master = null, musicBus = null, reverb = null, offline = false;
let enabled = true, volume = 0.5, musicOn = true, musicVolume = 0.45;
try {
  enabled = localStorage.getItem('expandto.sound') !== '0';
  volume = Number(localStorage.getItem('expandto.volume') ?? 0.5);
  musicOn = localStorage.getItem('expandto.music') !== '0';
  musicVolume = Number(localStorage.getItem('expandto.musicVolume') ?? 0.45);
} catch { /* ignore */ }

function context() {
  if (offline) return ctx; // rendu hors ligne en cours
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume * 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function ensure() { return enabled ? context() : null; }

function tone(freq, start, dur, type = 'sine', gain = 0.6) {
  const c = ensure(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export const sfx = {
  click: () => tone(660, 0, 0.06, 'triangle', 0.25),
  build: () => { tone(392, 0, 0.12, 'triangle'); tone(523, 0.08, 0.18, 'triangle'); },
  train: () => { tone(523, 0, 0.1, 'square', 0.15); tone(659, 0.07, 0.14, 'square', 0.15); },
  move: () => tone(440, 0, 0.08, 'sine', 0.3),
  endTurn: () => { tone(523, 0, 0.18); tone(659, 0.1, 0.18); tone(784, 0.2, 0.3); },
  congress: () => { tone(196, 0, 0.9, 'sine', 0.5); tone(294, 0, 0.9, 'sine', 0.3); },
  good: () => { tone(784, 0, 0.12, 'triangle', 0.35); tone(1046, 0.09, 0.2, 'triangle', 0.35); },
  bad: () => tone(196, 0, 0.18, 'sawtooth', 0.12),
  victory: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.14, 0.4, 'triangle', 0.4)),
};

export const soundEnabled = () => enabled;
export const soundVolume = () => volume;
export function setSound(on) { enabled = on; try { localStorage.setItem('expandto.sound', on ? '1' : '0'); } catch { /* ignore */ } if (on) sfx.click(); }
export function setVolume(v) { volume = v; if (master) master.gain.value = v * 0.35; try { localStorage.setItem('expandto.volume', String(v)); } catch { /* ignore */ } }

// ------------------------------------------------------------ musique de fond

// Humeurs par saison : mode (degrés en demi-tons), progressions (degrés de la gamme), tempo, tonique.
const MOODS = {
  spring: { root: 62, scale: [0, 2, 4, 7, 9, 11], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [9, 12, 16]], prog: [[0, 1, 3, 2], [0, 3, 1, 2]], bpm: 78, density: 0.6 },
  summer: { root: 65, scale: [0, 2, 4, 6, 7, 9, 11], chords: [[0, 4, 7], [2, 6, 9], [7, 11, 14], [4, 7, 11]], prog: [[0, 1, 0, 2], [0, 3, 1, 2]], bpm: 84, density: 0.68 },
  autumn: { root: 60, scale: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 3, 7], [5, 9, 12], [10, 14, 17], [3, 7, 10]], prog: [[0, 1, 0, 2], [3, 2, 1, 0]], bpm: 72, density: 0.52 },
  winter: { root: 57, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], prog: [[0, 1, 2, 3], [0, 2, 1, 3]], bpm: 62, density: 0.38 },
  menu: { root: 62, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], prog: [[0, 1, 2, 3]], bpm: 70, density: 0.45 },
};
// Instruments par ère : lyre et bourdon, luth et flûte, boîte à musique, piano électrique et nappes.
const ERAS = [
  { pluck: 'triangle', pluckDecay: 1.4, lead: 'sine', leadVib: 0, pad: 'sine', padCut: 900, bell: false },
  { pluck: 'triangle', pluckDecay: 1.0, lead: 'sine', leadVib: 5, pad: 'triangle', padCut: 1100, bell: false },
  { pluck: 'square', pluckDecay: 0.7, lead: 'triangle', leadVib: 0, pad: 'triangle', padCut: 1300, bell: true },
  { pluck: 'sine', pluckDecay: 1.6, lead: 'triangle', leadVib: 3, pad: 'sawtooth', padCut: 1000, bell: true },
];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

let mood = 'menu', era = 0, playing = false, timer = null, nextBar = 0, bar = 0, prog = MOODS.menu.prog[0], lastNote = 0, resting = 0;

function bus() {
  const c = context();
  if (!c) return null;
  if (!musicBus) {
    musicBus = c.createGain();
    musicBus.gain.value = 0;
    // Réverbération légère : réponse impulsionnelle de bruit qui décroît (aucun fichier).
    reverb = c.createConvolver();
    const len = c.sampleRate * 2.6, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    reverb.buffer = ir;
    const wet = c.createGain(); wet.gain.value = 0.32;
    // Aigus adoucis : étagère −6 dB au-dessus de 2,5 kHz, puis coupure douce vers 7 kHz.
    const shelf = c.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 2500; shelf.gain.value = -6;
    const soft = c.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 7000; soft.Q.value = 0.5;
    shelf.connect(soft); soft.connect(c.destination);
    musicBus.connect(shelf);
    musicBus.connect(reverb); reverb.connect(wet); wet.connect(shelf);
  }
  return c;
}

function voice(c, { freq, t, dur, type, gain, attack = 0.01, release, cutoff, vibrato = 0 }) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  let out = o;
  if (cutoff) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.3; o.connect(f); out = f; }
  if (vibrato) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vibrato; lg.gain.value = freq * 0.006; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + (release || 0) + 0.1); }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  if (release) { g.gain.setValueAtTime(gain, t + Math.max(attack, dur)); g.gain.linearRampToValueAtTime(0.0001, t + dur + release); }
  else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(g); g.connect(musicBus);
  o.start(t); o.stop(t + dur + (release || 0) + 0.05);
}

// Une mesure de 4 temps : tapis sur l'accord, basse, arpège pincé, mélodie qui se promène dans la gamme.
function scheduleBar(c, t0) {
  const M = MOODS[mood] || MOODS.menu, I = ERAS[era] || ERAS[0];
  const beat = 60 / M.bpm, barDur = beat * 4;
  if (bar % 8 === 0) prog = M.prog[Math.floor(Math.random() * M.prog.length)];
  const chord = M.chords[prog[bar % prog.length]];
  const root = M.root;
  // Respirations : de temps en temps, deux mesures avec le tapis seul.
  if (resting > 0) resting--; else if (bar % 16 === 15 && Math.random() < 0.5) resting = 2;
  // Tapis continu : chaque accord se fond dans le suivant (pas de trou entre les mesures).
  for (const n of chord) voice(c, { freq: midi(root - 12 + n), t: t0, dur: barDur, type: I.pad, gain: 0.03, attack: barDur * 0.3, release: barDur * 0.7, cutoff: I.padCut });
  voice(c, { freq: midi(root - 24 + chord[0]), t: t0, dur: beat * 3, type: 'sine', gain: 0.07, attack: 0.06, release: beat * 1.5, cutoff: 400 });
  if (resting) return;
  const arp = [chord[0], chord[1], chord[2], chord[1] + 12];
  for (let k = 0; k < 4; k++) if (Math.random() < 0.55 + M.density * 0.4) {
    voice(c, { freq: midi(root + arp[k]), t: t0 + k * beat + (k % 2 ? beat * 0.5 : 0), dur: I.pluckDecay, type: I.pluck, gain: 0.055, cutoff: 2000 });
  }
  // Mélodie : pas conjoints dans la gamme, plus de notes de l'accord sur les temps forts.
  const sc = M.scale.flatMap((d) => [d, d + 12]);
  for (let k = 0; k < 8; k++) {
    if (Math.random() > M.density * (k % 2 ? 0.45 : 0.75)) continue;
    const strong = k % 4 === 0;
    let idx;
    if (strong) { const cn = chord[Math.floor(Math.random() * chord.length)] % 12; idx = sc.findIndex((d) => d % 12 === cn); if (idx < 0) idx = lastNote; }
    else idx = Math.max(0, Math.min(sc.length - 1, lastNote + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
    lastNote = idx;
    const len = (Math.random() < 0.3 ? 2 : 1) * beat * 0.5;
    voice(c, { freq: midi(root + 12 + sc[idx]), t: t0 + k * beat * 0.5, dur: len * 1.4, type: I.lead, gain: 0.065, attack: 0.03, release: len, vibrato: I.leadVib });
    if (I.bell && strong && Math.random() < 0.35) voice(c, { freq: midi(root + 24 + sc[idx]), t: t0 + k * beat * 0.5, dur: 1.8, type: 'sine', gain: 0.018 });
  }
}

function tick() {
  const c = ctx;
  if (!c || !playing) return;
  while (nextBar < c.currentTime + 1.2) {
    scheduleBar(c, nextBar);
    nextBar += (60 / (MOODS[mood] || MOODS.menu).bpm) * 4;
    bar++;
  }
}

function fade(target, secs) {
  if (!musicBus) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(musicBus.gain.value, t);
  musicBus.gain.linearRampToValueAtTime(target, t + secs);
}

export const music = {
  // À appeler après un geste de l'utilisateur (les navigateurs bloquent le son avant).
  start() {
    if (!musicOn || playing) return;
    const c = bus();
    if (!c) return;
    playing = true;
    nextBar = c.currentTime + 0.1;
    fade(musicVolume * 0.9, 3);
    timer = setInterval(tick, 250);
    tick();
  },
  stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer); timer = null;
    fade(0, 1.2);
  },
  // Humeur (saison) et instruments (ère) ; changent en douceur à la mesure suivante.
  setMood(season, eraIdx = 0) {
    if (season && MOODS[season]) mood = season;
    era = Math.max(0, Math.min(ERAS.length - 1, eraIdx | 0));
  },
};
// Rendu hors ligne d'un extrait (aperçu, tests) : même composition, dans un OfflineAudioContext.
export async function renderMusic(seconds = 30, season = 'spring', eraIdx = 0, sampleRate = 44100) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
  const saved = { ctx, musicBus, reverb, mood, era, bar, lastNote, resting };
  ctx = off; musicBus = null; reverb = null; bar = 0; resting = 0; offline = true;
  try {
    bus();
    musicBus.gain.value = 0.9;
    music.setMood(season, eraIdx);
    for (let t = 0.05; t < seconds; t += (60 / MOODS[mood].bpm) * 4) { scheduleBar(off, t); bar++; }
  } finally { ({ ctx, musicBus, reverb, mood, era, bar, lastNote, resting } = saved); offline = false; }
  return off.startRendering();
}

export const musicEnabled = () => musicOn;
export const musicLevel = () => musicVolume;
export function setMusic(on) {
  musicOn = on;
  try { localStorage.setItem('expandto.music', on ? '1' : '0'); } catch { /* ignore */ }
  if (on) music.start(); else music.stop();
}
export function setMusicVolume(v) {
  musicVolume = v;
  if (playing) fade(v * 0.9, 0.3);
  try { localStorage.setItem('expandto.musicVolume', String(v)); } catch { /* ignore */ }
}
// Onglet caché : la musique se tait (et ne consomme rien), elle reprend au retour.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (playing || enabled) ctx.resume();
  });
}

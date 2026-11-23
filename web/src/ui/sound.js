// Sons procéduraux (WebAudio) : aucun fichier audio, des petites notes douces et « jouet ».
let ctx = null, master = null;
let enabled = true, volume = 0.5;
try {
  enabled = localStorage.getItem('expandto.sound') !== '0';
  volume = Number(localStorage.getItem('expandto.volume') ?? 0.5);
} catch { /* ignore */ }

function ensure() {
  if (!enabled) return null;
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

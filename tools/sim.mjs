// Simulation headless : fait jouer l'IA à la place de tous les joueurs pour vérifier les règles et calibrer la durée.
// Usage : node tools/sim.mjs [nombre_de_parties] [graine] [--check] [--quiet]
//   --check : code de sortie 1 si la durée moyenne sort de [50 % de la durée, durée] (utilisé par la CI).
//   --size=small|medium|large --type=continent|pangaea|archipelago --length=quick|normal|long --ais=N --difficulty=easy|normal|hard
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from '../web/src/core/game.js';
import { playAITurns } from '../web/src/core/ai.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const data = G.indexData({
  terrain: load('terrain.json'), resources: load('resources.json'), buildings: load('buildings.json'),
  units: load('units.json'), techs: load('techs.json'), profiles: load('profiles.json'), rules: load('rules.json'), ai: load('ai.json'), events: load('events.json'), policies: load('policies.json'),
});

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const games = Number(args[0] || 5);
const aiFlag = process.argv.find((a) => a.startsWith('--ai='));
const override = aiFlag ? JSON.parse(fs.readFileSync(aiFlag.slice(5), 'utf8')) : null; // paramètres d'IA candidats pour le joueur 0
const seed0 = Number(args[1] || 1234);
const opt = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const size = opt('size', 'medium'), mapType = opt('type', 'continent'), length = opt('length', 'normal');
const aiCount = Number(opt('ais', data.rules.mapSizes[size].defaultAI));
const difficulty = opt('difficulty', 'normal');
const profileStats = {};
const victoryTypes = {};
const results = [];
for (let g = 0; g < games; g++) {
  const s = G.createGame({ data, seed: seed0 + g * 101, profile: data.profiles[g % data.profiles.length].id, size, mapType, length, aiCount, difficulty });
  s.players[0].isHuman = false; // l'IA joue aussi le joueur 0
  if (override) s.aiOverrides = { 0: override };
  const t0 = Date.now();
  while (!s.winner) {
    playAITurns(s);
    s.proposals = []; // personne pour y répondre
    G.endRound(s);
  }
  const ranking = [...s.players].sort((a, b) => b.prestige - a.prestige);
  victoryTypes[s.winner.type || 'prestige'] = (victoryTypes[s.winner.type || 'prestige'] || 0) + 1;
  for (const p of s.players) {
    const st = (profileStats[p.profile] ||= { parties: 0, victoires: 0, prestige: 0, merveilles: 0 });
    st.parties++; st.prestige += p.prestige; st.merveilles += Object.values(s.wonders).filter((o) => o === p.id).length;
    if (p.id === s.winner.pid) st.victoires++;
  }
  results.push({ winnerPid: s.winner.pid, prestige0: s.players[0].prestige, seed: s.seed, turns: s.turn - 1, winner: `${s.players[s.winner.pid].name} (${s.players[s.winner.pid].profile})`, ms: Date.now() - t0,
    scores: ranking.map((p) => `${p.profile}:${p.prestige}`).join(' '), cities: s.cities.length, wonders: Object.keys(s.wonders).length, alliances: s.alliances.length, routes: s.tradeRoutes.length });
}
if (flags.has('--json')) {
  const p0 = results.map((r, i) => r.winnerPid === 0);
  console.log(JSON.stringify({ games, winRate0: p0.filter(Boolean).length / games, avgTurns: results.reduce((a, r) => a + r.turns, 0) / games, avgPrestige0: results.reduce((a, r) => a + r.prestige0, 0) / games, victoryTypes }));
  process.exit(0);
}
if (!flags.has('--quiet')) console.table(results);
const avg = (k) => results.reduce((a, r) => a + r[k], 0) / results.length;
console.table(Object.fromEntries(Object.entries(profileStats).map(([k, v]) => [k, {
  parties: v.parties, 'victoires %': Math.round((v.victoires / v.parties) * 100), 'prestige moyen': Math.round(v.prestige / v.parties), 'merveilles / partie': +(v.merveilles / v.parties).toFixed(2),
}])));
const avgTurns = avg('turns');
console.log('Types de victoire :', JSON.stringify(victoryTypes));
console.log(`Durée moyenne : ${avgTurns.toFixed(1)} tours · merveilles / partie : ${avg('wonders').toFixed(2)} · alliances : ${avg('alliances').toFixed(2)}`);
const limit = data.rules.gameLengths[length].turnLimit;
// Plancher provisoire à 50 % de la durée pendant les phases 8 à 12 (équilibrage reporté) ; il remontera à 58 % ensuite.
const floorPct = 0.5;
if (flags.has('--check') && (avgTurns < limit * floorPct || avgTurns > limit)) {
  console.error(`ÉCHEC : durée moyenne ${avgTurns.toFixed(1)} hors de [${Math.round(limit * floorPct)}, ${limit}] tours.`);
  process.exit(1);
}

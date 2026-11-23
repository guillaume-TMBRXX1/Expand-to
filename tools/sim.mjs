// Simulation headless : fait jouer l'IA à la place de tous les joueurs pour vérifier les règles et calibrer la durée.
// Usage : node tools/sim.mjs [nombre_de_parties] [graine]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from '../web/src/core/game.js';
import { playAITurns } from '../web/src/core/ai.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const data = G.indexData({
  terrain: load('terrain.json'), resources: load('resources.json'), buildings: load('buildings.json'),
  units: load('units.json'), techs: load('techs.json'), profiles: load('profiles.json'), rules: load('rules.json'),
});

const games = Number(process.argv[2] || 5);
const seed0 = Number(process.argv[3] || 1234);
const results = [];
for (let g = 0; g < games; g++) {
  const s = G.createGame({ data, seed: seed0 + g * 101, profile: data.profiles[g % data.profiles.length].id });
  s.players[0].isHuman = false; // l'IA joue aussi le joueur 0
  const t0 = Date.now();
  while (!s.winner) {
    playAITurns(s);
    s.proposals = []; // personne pour y répondre
    G.endRound(s);
  }
  const ranking = [...s.players].sort((a, b) => b.prestige - a.prestige);
  results.push({ seed: s.seed, turns: s.turn - 1, winner: `${s.players[s.winner.pid].name} (${s.players[s.winner.pid].profile})`, ms: Date.now() - t0,
    scores: ranking.map((p) => `${p.profile}:${p.prestige}`).join(' '), cities: s.cities.length, wonders: Object.keys(s.wonders).length, alliances: s.alliances.length, routes: s.tradeRoutes.length });
}
console.table(results);

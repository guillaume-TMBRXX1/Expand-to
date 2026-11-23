// Tutoriel guidé des premiers tours. L'état vit dans la partie (s.tutorial) pour survivre aux sauvegardes.
import * as G from '../core/game.js';

export const STEPS = [
  { title: 'Fondez votre capitale', text: 'Votre Colon est sélectionné. Appuyez sur <kbd>F</kbd> ou sur « Fonder une ville » dans le panneau en bas à gauche.',
    done: (s) => G.citiesOf(s, 0).length > 0 },
  { title: 'Nourrissez votre ville', text: 'Dans la barre du bas, choisissez <b>Ferme</b>, puis cliquez une case verte de votre territoire.',
    done: (s) => s.buildings.some((b) => b.owner === 0 && b.type === 'farm') },
  { title: 'Lancez une recherche', text: 'Ouvrez <b>Technologies</b> (<kbd>T</kbd>) et choisissez une technologie disponible. Chaque branche mène à une merveille.',
    done: (s) => !!s.players[0].research || s.players[0].techs.length > (s.tutorial.startTechs || 0) },
  { title: 'Explorez les environs', text: 'Sélectionnez l\'Explorateur (<kbd>Espace</kbd>) puis cliquez une case éloignée : il s\'y rend, même en plusieurs tours.',
    done: (s) => s.tutorial.flags.moved },
  { title: 'Finissez le tour', text: 'Cliquez <b>Finir le tour</b> (<kbd>Entrée</kbd>). Les IA jouent, vos ressources sont collectées et vos chantiers avancent.',
    done: (s) => s.turn > s.tutorial.startTurn },
  { title: 'Tracez une route', text: 'Appuyez sur <kbd>R</kbd> et cliquez les cases jaunes. Les routes accélèrent les unités, et chaque ville reliée à la capitale rapporte de l\'Or.',
    done: (s) => s.map.tiles.some((t) => t.road === 0) },
  { title: 'Soignez vos voisins', text: 'Ouvrez <b>Diplomatie</b> (<kbd>D</kbd>). Des voisins méfiants réduisent votre productivité ; cadeaux, accords et alliances l\'améliorent.',
    done: (s) => s.tutorial.flags.diplo },
  { title: 'Visez le prestige', text: 'Votre score est en haut à droite. Villes, technologies, culture, merveilles, commerce et alliances en rapportent. Formez un <b>Colon</b> dans votre ville pour vous étendre. Bonne partie !',
    done: (s) => s.tutorial.flags.finished, final: true },
];

export function initTutorial(s, enabled) {
  s.tutorial = { active: enabled, step: 0, startTurn: s.turn, startTechs: s.players[0].techs.length, flags: {} };
}

// Fait avancer le tutoriel ; retourne le titre de l'étape validée, le cas échéant.
export function advance(s) {
  const t = s.tutorial;
  if (!t?.active) return null;
  let passed = null;
  while (t.step < STEPS.length && STEPS[t.step].done(s)) { passed = STEPS[t.step].title; t.step++; }
  if (t.step >= STEPS.length) t.active = false;
  return passed;
}

export function flag(s, name) { if (s.tutorial) s.tutorial.flags[name] = true; }

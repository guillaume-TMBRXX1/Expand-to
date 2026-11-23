# Expand-to — Feuille de route

## Vision

Un jeu de stratégie et de gestion au tour par tour, au style minimaliste et coloré, pensé pour des parties de **30 à 60 minutes** (60 tours maximum).
Le jeu emprunte à Civilization l'expansion, l'exploration et l'arbre technologique, et à Anno la construction sur la carte et la gestion des ressources.
**Il n'y a pas d'armée.** On gagne par le **prestige**, qu'on accumule par la culture, la science, le commerce et la diplomatie.

> **Note sur les sources :** Civilization et Anno sont des jeux propriétaires dont le code n'est pas publié. Expand-to ne réutilise donc aucun de leurs codes ni de leurs assets : on reprend seulement des **mécaniques de genre**. Freeciv (GPL) et Unciv (MPL-2.0) sont des projets libres du même genre. Ils servent de références de conception, mais aucune ligne de leur code n'a été copiée, pour garder une licence libre de choix.

## Architecture retenue

| Brique | Rôle |
|---|---|
| `web/` (HTML, JS, Three.js) | Le jeu. C'est un site statique sans étape de build, servi en local ou par **Vercel**. |
| `web/data/*.json` | **La seule source des règles** : terrains, bâtiments, unités, technologies, profils et constantes. Le jeu et Python lisent les mêmes fichiers. |
| `web/src/core/` | Le moteur de règles, sans aucun rendu. Il tourne dans le navigateur **et** sous Node (simulation). |
| `python/` + `notebooks/` (Colab) | Le labo : génération de cartes (portage exact du JS, vérifié par un test), analyses d'équilibrage, simulations IA contre IA, et plus tard l'entraînement des paramètres de l'IA. |
| GitHub | Une PR par fonctionnalité. Plus tard, une CI qui lance `pytest` et la simulation. |

Pourquoi Python reste hors du navigateur : le jeu doit rester instantané et jouable hors ligne. Python sert à **concevoir et équilibrer**. Il produit des JSON que le jeu consomme.

---

## Phase 0 — Prototype v0.1 ✅ (ce livrable)

- Carte de 36 × 26 cases rectangulaires en relief : océan, lagune, plage, plaine, prairie, forêt, collines, montagnes, sommets. Générée par bruit fractal à partir d'une graine.
- Rendu 3D Three.js : terrain en terrasses, arbres, pics, territoires colorés avec frontières, routes, bâtiments et unités en 3D low-poly, villes avec étiquettes, brouillard sur les zones inexplorées.
- 5 profils de départ : Négociant, Érudit, Bâtisseur, Diplomate, Explorateur.
- Économie Or / Nourriture / Bois / Pierre, plus Science et Culture. Croissance de la population et entretien.
- 10 bâtiments (ferme, scierie, carrière, marché, bibliothèque, théâtre, laboratoire, port, quartier, monument), avec contraintes de terrain et de côte.
- 6 merveilles uniques, avec une course entre joueurs : le premier qui termine l'emporte, les autres sont remboursés de 50 %.
- Routes : déplacement plus rapide, et +Or pour chaque ville reliée à la capitale.
- 3 unités : Explorateur, Colon et Caravane (véhicule qui ouvre une route commerciale). Déplacement avec ordres sur plusieurs tours.
- Arbre technologique de 16 technologies en 4 branches (Économie, Science, Culture, Diplomatie), avec des dépendances croisées.
- Diplomatie : relations de −100 à +100, cadeaux, accords commerciaux, alliances, échanges de ressources, demandes et propositions des IA.
- **Malus de productivité** avec les voisins méfiants (−5 %) ou hostiles (−12 %). **Bonus** d'alliance (+8 %) et d'accord commercial.
- 2 à 4 IA pilotées par heuristiques selon leur profil.
- Victoire au premier à 150 points de prestige, ou au meilleur score après 60 tours.
- Sauvegarde automatique dans le navigateur.
- Simulation headless (`tools/sim.mjs`) : les parties IA contre IA durent **41 à 60 tours**.

## Phase 1 — Fondations (v0.2) · ~1 à 2 semaines

- [ ] Connecter le dépôt à Vercel : une URL de prévisualisation par PR.
- [x] CI GitHub Actions : `pytest`, une simulation de 20 parties, et un échec si la durée moyenne sort de [35, 60] tours.
- [x] Tutoriel guidé en 8 étapes : fonder, construire, rechercher, explorer, finir le tour, route, diplomatie, prestige.
- [x] Équilibrage : sur 80 parties simulées, chaque profil gagne entre 20 et 32 % des parties (contre 8 à 43 % avant), et l'IA construit 1,5 merveille par partie (contre 1).
- [x] Sauvegarde automatique, 3 emplacements, export et import de fichier.
- [x] Mini-carte cliquable avec le cadre de la caméra, et résumé de fin de tour (gains et événements).

## Phase 2 — Profondeur de gestion (v0.3) · ~3 semaines

- [x] **Adjacences façon Anno** : chaque bâtiment gagne des bonus selon ses voisins (bibliothèque à côté d'un laboratoire, scierie entourée de forêts, marché collé à une ville…). L'aperçu s'affiche au survol pendant la construction.
- [x] **Chaînes de production** : Menuiserie (bois → planches), Forge (pierre + bois → outils), Manufacture (nourriture → biens). Ces biens servent aux bâtiments avancés et aux merveilles.
- [x] **Paliers de population** : Citoyens → Artisans (4 habitants, 1 bien par tour) → Savants (6 habitants, 1 bien et 1 outil par tour). Chaque palier donne des bonus et de la population maximale.
- [x] Ressources rares (épices, marbre, cristal) exploitées par un Comptoir : bonus actifs tant qu'il en reste, +3 prestige par ressource active, échangeables avec les IA (qui les valorisent davantage quand elles en manquent).
- [x] Véhicules : navire marchand (routes maritimes à +4 Or, une par port) et dirigeable (survole montagnes et océans).
- [x] Unités civiles : Ingénieur (routes partout, défrichage) et Émissaire (ambassade : +15 relation, +1 par tour).
- [x] Quartiers 2×2 : Campus, Quartier des arts, Quartier marchand.
- [ ] Notes pour plus tard : l'IA construit encore peu de quartiers 2×2 et de laboratoires, et le moteur pourrait être optimisé (une simulation prend environ 0,5 s par partie).

## Phase 3 — Diplomatie et IA (v0.4) · ~3 semaines

- [ ] **Congrès mondial** tous les 10 tours : vote de résolutions (embargo, projet commun, sanctions de productivité).
- [ ] Mémoire diplomatique : promesses, griefs, rancunes, et personnalités d'IA (loyale, opportuniste, isolationniste).
- [ ] Alliances actives : projets communs, partage de technologies, demandes d'aide.
- [ ] Voies de victoire explicites, en plus du prestige : Science (Observatoire + projet spatial), Culture (3 merveilles culturelles), Économie (trésor + Bourse), Diplomatie (élu au Congrès).
- [ ] **Entraînement de l'IA dans Colab** : optimiser les poids des heuristiques (algorithme génétique ou CMA-ES) sur des milliers de simulations, puis exporter le résultat dans `web/data/ai.json`.
- [ ] Niveaux de difficulté (bonus et malus de l'IA, agressivité diplomatique).

## Phase 4 — Présentation (v0.5) · ~2 à 3 semaines

- [x] Direction artistique « jouet en argile » : modèles arrondis sur socles-dioramas, personnages toy, portraits SVG, palette chaude (voir DESIGN.md).
- [ ] **Affiner le design du prototype**, jugé trop sobre : davantage de détails sur les bâtiments, les unités et le terrain (retour de revue v0.1).
- [ ] Animations légères (fumée, drapeaux, roues) et modèles glTF faits main dans le même style.
- [ ] Brouillard en deux niveaux (exploré / visible), eau animée, cycle jour/nuit subtil.
- [ ] Ambiance sonore et effets.
- [ ] Interface : info-bulles de rendement par case, panneau de ville complet, encyclopédie.
- [ ] Accessibilité (contraste, navigation au clavier complète) et prise en charge des tablettes.

## Phase 5 — Version 1.0

- [ ] Tailles de carte (petite / moyenne / grande) et types de carte (continent, archipel, pangée).
- [ ] Choix du nombre de tours (30 / 45 / 60) pour moduler la durée.
- [ ] Statistiques de fin de partie et historique des parties.
- [ ] Optionnel : multijoueur asynchrone (sauvegarde partagée), ce qui demanderait un petit backend.

---

## Méthode de travail proposée

1. Une **issue** par fonctionnalité, une **branche** et une **PR** en brouillon, avec une prévisualisation Vercel.
2. Toute modification de règles passe par `web/data/*.json`. On la vérifie avec le notebook Colab et la simulation **avant** la PR.
3. Rien n'est poussé sans validation.

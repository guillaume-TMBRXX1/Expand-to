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

## Phase 1 — Fondations (v0.2) · ~1 à 2 semaines ✅

- [x] Mise en ligne : Railway à la place de Vercel (`railway.json` et mini-serveur `tools/serve.mjs`), avec redéploiement automatique à chaque fusion dans `main`. Pas d'adresse de prévisualisation par PR.
- [x] CI GitHub Actions : `pytest`, une simulation de 20 parties, et un échec si la durée moyenne sort de [35, 60] tours.
- [x] Tutoriel guidé en 8 étapes : fonder, construire, rechercher, explorer, finir le tour, route, diplomatie, prestige.
- [x] Équilibrage : sur 80 parties simulées, chaque profil gagne entre 20 et 32 % des parties (contre 8 à 43 % avant), et l'IA construit 1,5 merveille par partie (contre 1).
- [x] Sauvegarde automatique, 3 emplacements, export et import de fichier.
- [x] Mini-carte cliquable avec le cadre de la caméra, et résumé de fin de tour (gains et événements).

## Phase 2 — Profondeur de gestion (v0.3) · ~3 semaines ✅

- [x] **Adjacences façon Anno** : chaque bâtiment gagne des bonus selon ses voisins (bibliothèque à côté d'un laboratoire, scierie entourée de forêts, marché collé à une ville…). L'aperçu s'affiche au survol pendant la construction.
- [x] **Chaînes de production** : Menuiserie (bois → planches), Forge (pierre + bois → outils), Manufacture (nourriture → biens). Ces biens servent aux bâtiments avancés et aux merveilles.
- [x] **Paliers de population** : Citoyens → Artisans (4 habitants, 1 bien par tour) → Savants (6 habitants, 1 bien et 1 outil par tour). Chaque palier donne des bonus et de la population maximale.
- [x] Ressources rares (épices, marbre, cristal) exploitées par un Comptoir : bonus actifs tant qu'il en reste, +3 prestige par ressource active, échangeables avec les IA (qui les valorisent davantage quand elles en manquent).
- [x] Véhicules : navire marchand (routes maritimes à +4 Or, une par port) et dirigeable (survole montagnes et océans).
- [x] Unités civiles : Ingénieur (routes partout, défrichage) et Émissaire (ambassade : +15 relation, +1 par tour).
- [x] Quartiers 2×2 : Campus, Quartier des arts, Quartier marchand.
- [x] Halle marchande : vente des surplus (biens, matériaux, ressources rares) avec un prix qui baisse quand on vend beaucoup, et une vente automatique au-delà d'un seuil réglable par ressource (30 par défaut).
- [ ] À suivre : l'IA construit encore peu de quartiers 2×2 et de laboratoires. (Moteur optimisé depuis : file de priorité et un seul calcul de chemins par décision.)

## Phase 3 — Diplomatie et IA (v0.4) · ~3 semaines ✅

- [x] **Congrès mondial** tous les 10 tours : vote d'une résolution (science, culture, libre-échange, embargo contre le meneur) pondéré par les alliances, accords et ambassades, et élection d'un Secrétaire (+8 prestige).
- [x] Mémoire diplomatique (« ce qu'il retient de vous »), promesses (ne plus fonder de ville près d'un voisin ; la rompre coûte très cher) et personnalités d'IA (loyale, opportuniste, isolationniste).
- [x] Alliances actives : projets communs (+6 prestige et +2 Science +2 Culture par tour), partage de technologies (−25 %), demandes d'aide qui pèsent davantage entre alliés.
- [x] Voies de victoire (valeurs en partie normale) : Science (Observatoire + 14 technologies), Culture (Amphithéâtre + 900 culture), Économie (Grande Bourse + 1 380 Or en caisse), Diplomatie (élu 4 fois Secrétaire et allié de la moitié des rivaux, ou allié de tous), en plus du prestige. Un panneau suit la progression de chaque voie.
- [x] **Entraînement de l'IA** : paramètres dans `web/data/ai.json`, recherche évolutive `python -m expandto.train` (et une cellule dans le notebook Colab) qui fait jouer les candidats dans le vrai moteur.
- [x] Niveaux de difficulté (Facile / Normal / Difficile : rendement, coûts et relations de départ des IA).
- [x] Moteur plus rapide (file de priorité pour les chemins) : environ 0,35 s par partie simulée.
- [ ] À suivre : les IA atteignent rarement les victoires Science, Culture et Économie, et les parties longues finissent vers le tour 47 sur 80 (seuils à ajuster selon vos parties) ; lancer un vrai entraînement de l'IA, plus long, dans Colab (l'outil n'a tourné que sur quelques parties de test).

## Phase 4 — Présentation (v0.5) · ~2 à 3 semaines ✅

- [x] Direction artistique « jouet en argile » : modèles arrondis sur socles-dioramas, personnages toy, portraits SVG, palette chaude (voir DESIGN.md).
- [x] **Design enrichi** (premier passage) : décor de terrain (fleurs, touffes, rochers, coquillages), flancs de falaise ombrés, eau animée avec reflets, moulin sur les fermes, petits animaux, faisceau du phare, bateau au port, antenne du laboratoire.
- [x] Animations légères : fumée des cheminées, de la manufacture et de la forge, scies et moulins qui tournent, drapeaux qui flottent, unités qui se balancent. Elles se coupent si le système demande moins d'animations.
- [x] Brouillard en deux niveaux : les zones explorées mais hors de vue sont grisées, et les unités étrangères y sont masquées. Cycle jour/nuit doux, désactivable.
- [x] Sons procéduraux (WebAudio, sans fichier) : clic, construction, formation, déplacement, fin de tour, congrès, victoire. Réglages dans le menu (activé/coupé, volume).
- [x] Interface : infobulle au survol des cases, liste des bâtiments dans le panneau de ville (avec leurs adjacences), encyclopédie (touche E) générée depuis les données.
- [x] Déplacements : tracé du chemin, nombre de tours et confirmation par un second clic (désactivable dans le menu).
- [x] Accessibilité : focus piégé dans les fenêtres et rendu à la fermeture, respect du réglage « moins d'animations », boutons plus grands sur tablette.
- [x] **Deuxième passage design** : variantes de bâtiments (couleurs et orientation), villes qui changent d'allure avec leur palier, chantiers qui montent avec grue et échafaudages, effets d'achèvement (rebond, poussière, étincelles), palmiers, sapins, buissons, écume sur les côtes et nuages qui dérivent.

## Phase 5 — Version 1.0 ✅

- [x] Tailles de carte : petite (28×20, jusqu'à 3 IA), moyenne (36×26, jusqu'à 5 IA), grande (46×32, jusqu'à 7 IA). Types : continent, pangée, archipel. Les cartes Python et JS restent identiques (test pour chaque type).
- [x] Embarquement : avec la Navigation, les unités terrestres traversent les lagunes peu profondes (indispensable en archipel).
- [x] Durée au choix : rapide (40 tours), normale (60), longue (80). Les objectifs de prestige et de victoire s'adaptent (fins moyennes simulées : environ 32, 40 et 47 tours).
- [x] Statistiques de fin de partie : courbes par tour (prestige, culture, population, technologies, villes) avec étiquettes directes et infobulle, tableau du bilan final, historique des 10 dernières parties sur l'écran d'accueil.
- [x] Performances : modèles fusionnés en un seul maillage à couleurs de sommets (grande carte à 8 joueurs : 3 800 → 1 000 appels de dessin, −45 % de triangles).
- [ ] Plus tard (pas prévu pour l'instant) : multijoueur asynchrone (sauvegarde partagée), ce qui demanderait un petit backend.

## Après la version 1.0 (retours de test)

- [x] Routes : elles n'occupent plus les cases (on construit dessus), affichées en pointillés animés uniquement avec l'outil Route.
- [x] Version iPad en paysage : mise en page tablette, tiroir « Infos » avec pastille, tactile fiable, ajout à l'écran d'accueil en plein écran.
- [x] Correctifs tactiles : sélection d'une autre unité au toucher, boutons « Annuler » / « Terminer » et ✕ à la place de la touche Échap.
- [x] Entrepôt : seuil de vente automatique réglable par ressource.

## Phase 6 — Diversité (v1.1) ✅

Objectif : que deux parties ne se ressemblent plus, et que les choix soient plus marqués. Ces systèmes passent avant l'équilibrage, pour ne pas devoir le refaire ensuite.

**Premier lot**
- [x] **Événements à choix** (`web/data/events.json`, 18 événements) : un tous les 4 à 6 tours environ, avec des conditions (tour, technologie, côte, merveille…). Choix par défaut au bout de 3 tours ; l'IA choisit selon son profil.
- [x] **Merveilles naturelles** (6, uniques) : prestige à la découverte (3 au premier, 1 aux suivants), rendement et +2 prestige dans votre territoire, +1 Culture aux bâtiments voisins.
- [x] **Ruines antiques** (environ 7 par carte moyenne) : fouillées par la première unité qui y entre. L'IA y envoie ses explorateurs.
- [x] **Politiques** (`web/data/policies.json`, 13 cartes en 4 branches) : 1 à 3 emplacements selon le nombre de technologies, 30 Or pour remplacer une politique.

**Deuxième lot**
- [x] **Profils vraiment asymétriques** : un bâtiment propre (Maison des Guildes, Académie royale, Atelier des maîtres, Chancellerie, Relais des cartographes) et une capacité active à recharge (Grande foire, Percée, Chantier éclair, Sommet, Grande expédition). L'IA les utilise.
- [x] **Contrats commerciaux** : une IA demande une livraison (6 tours pour livrer) contre de l'Or, +8 relation et +3 prestige ; −10 relation si le contrat n'est pas honoré. Les IA se passent aussi des contrats entre elles.
- [x] **Influence culturelle** : la culture annexe les cases neutres voisines (environ 7 cases par joueur et par partie), et peut attirer une case frontalière d'un voisin à la culture bien plus faible (coût doublé, −6 relation).
- [x] **Crise mondiale** vers le milieu de la partie (épidémie, krach, tempêtes) : un Congrès extraordinaire réunit les contributions (60 Or par pays). Atteint : la crise s'arrête et les contributeurs gagnent 3 ou 7 prestige. Manqué : malus pendant 8 tours, et personne ne paie (environ une crise sur deux surmontée en simulation).

**Réglages provisoires** : objectif de prestige porté à 210. La voie « allié de tous » demande aussi d'avoir été élu 2 fois Secrétaire. En simulation (partie normale), les victoires se répartissent ainsi : 12 au prestige, 6 en diplomatie, 1 en économie, 1 en culture sur 20 parties, contre 18 au prestige et 2 en diplomatie avant cette phase.

**Écartés ou à repenser**
- Cités-États : écartées sous cette forme, une autre façon de faire reste à trouver.
- Épuisement des ressources rares : écarté. Le nombre de villes est limité (environ 4 en pratique) et on ne peut pas aller chercher de nouveaux gisements. À revoir seulement si le système d'expansion change.

## Phase 7 — Équilibrage ✅

Mesuré sur 100 parties simulées par réglage (`tools/sim.mjs` et scripts de mesure), en partie normale sur carte moyenne.

- [x] **Place pour les villes** : la carte était pleine en fin de partie (97 % des terres possédées, 3,2 villes par joueur). La distance minimale entre villes passe de 4 à 3 cases : on peut combler les trous de son territoire. L'IA vise 5 villes (6 pour l'Explorateur). Résultat : environ 4 villes par joueur, avec un rayon de territoire inchangé ; l'influence culturelle ajoute encore quelques cases.
- [x] **Voies de victoire** : l'IA restait bloquée.
  - Cause 1 : elle épargnait pour une merveille impossible à payer (Outils manquants) et ne construisait plus l'atelier qui les produit.
  - Cause 2 : sa recherche était trop dispersée pour atteindre le palier 4.
  - Corrections : recherche concentrée sur la branche du profil, priorité à la merveille de sa voie et aux ateliers des matériaux manquants, thésaurisation avec la Grande Bourse.
  - Côté règles : seuils abaissés (12 technologies, 750 culture, 1 000 Or de base), technologies de palier 4 à 125, merveilles de voie en 4 tours, Observatoire (10 Outils, aussi en plaine) et Grande Bourse (Planches au lieu de Biens) plus accessibles.
- [x] **Diplomatie** : la voie « allié de tous » demande 3 élections (4 en partie longue). Le prestige d'alliance passe à 8 et celui d'accord à 3.
- [x] **Profils** (taux de victoire, 25 % étant l'équilibre avec 4 joueurs et 5 profils) :

  | Profil | Avant | Après |
  |---|---|---|
  | Négociant | 9 % | 23 % |
  | Bâtisseur | 14 % | 21 % |
  | Diplomate | 33 % | 29 % |
  | Explorateur | 41 % | 24 % |
  | Érudit | 28 % | 28 % |

  Chaque profil gagne surtout par sa voie : l'Érudit par la science, l'Explorateur par la culture, le Négociant par l'économie, le Diplomate par la diplomatie.
- [x] **Répartition des victoires** (100 parties) :
  - avant : 67 prestige, 25 diplomatie, 5 culture, 3 économie, 0 science ;
  - après : 39 prestige, 20 science, 19 culture, 15 diplomatie, 7 économie.
- [x] **Durées** : partie normale environ 39 tours (objectif de prestige 230). Partie longue environ 50 tours (contre 42) : seuils des voies ×3 et technologies 60 % plus chères. Partie rapide environ 31 tours.
- [x] **Entraînement de l'IA** : nouveaux paramètres entraînables (concentration de la recherche, merveille de voie, matériaux), et comparaison équitable des candidats (mêmes cartes à chaque génération).
- [ ] À suivre : en partie rapide, presque tout se gagne au prestige ; en partie longue, le Bâtisseur est faible (aucune merveille de voie propre) ; l'IA construit encore peu de laboratoires.

---

## Méthode de travail proposée

1. Une **issue** par fonctionnalité, une **branche** et une **PR** en brouillon ; le jeu se teste sur Railway une fois la PR fusionnée.
2. Toute modification de règles passe par `web/data/*.json`. On la vérifie avec le notebook Colab et la simulation **avant** la PR.
3. Rien n'est poussé sans validation.

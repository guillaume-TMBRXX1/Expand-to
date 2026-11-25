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
  - Essai : 8 générations de 5 candidats sur 40 parties. Sur 200 cartes jamais vues, l'IA entraînée gagne 32,5 % des parties contre 24 % pour les réglages actuels.
  - Pas retenue : elle déséquilibre les profils (Érudit 40 %, Négociant 13 %, et 0 % en partie longue), car l'objectif ne récompense que la force brute.
  - En ne gardant que ses choix de construction : 30,5 %, mais le Négociant tombe encore à 16 %.
- [x] **Niveau Difficile** : les IA y jouent avec les paramètres entraînés (`trained` dans `web/data/ai.json`), et leurs bonus chiffrés sont réduits (rendement +8 % au lieu de +15 %, coûts −5 % au lieu de −10 %). Un joueur jouant comme l'IA standard y gagne 8 % des parties (contre 8,7 % avant), mais la difficulté vient davantage du jeu des IA. Repères : Facile 38 %, Normal 27 %.
- [ ] À suivre : un objectif d'entraînement qui récompense la force **et** l'équilibre entre profils.
- [ ] À suivre : en partie rapide, presque tout se gagne au prestige ; en partie longue, le Bâtisseur est faible (aucune merveille de voie propre) ; l'IA construit encore peu de laboratoires.

## Phase 8 — Cartes, régions et ressources (fondations) ✅

- [x] **Tailles de carte revues** : petite 32 × 24 (contre 28 × 20), moyenne 40 × 28 (contre 36 × 26), grande 50 × 34 (contre 46 × 32). Les quantités (ressources rares, merveilles naturelles, ruines, rivières) suivent la surface.
- [x] **Régions climatiques** : nord froid, terres tempérées, plaines fertiles, sud aride, côtes et lagunes.
  - Elles dépendent de la latitude, mesurée sur l'étendue des terres pour que chaque région existe même sur un continent entouré d'eau, d'un bruit de génération et de l'humidité.
  - Chaque région a sa teinte de terrain et son décor : sapins enneigés au nord, cactus et palmiers au sud, buissons plus nombreux dans les plaines fertiles.
  - Le nom de la région s'affiche au survol d'une case et dans l'encyclopédie.
- [x] **Neuf ressources rares régionales** (contre 3) : fourrures, cristal, marbre, vin, soie, perles, sel, épices, encens. Leurs régions, terrains et effets sont décrits dans `rules.json` (`luxuries.types`). Chacune a son modèle 3D, avec un repli sur une autre région si la sienne manque de place.
- [x] **Rivières** : elles naissent sur les hauteurs et descendent vers la case voisine la plus basse jusqu'à la mer.
  - Une ville riveraine gagne +2 Nourriture et +1 Or. Un bâtiment sur une rivière gagne +1 Or (+1 Nourriture pour une ferme).
  - Les déplacements le long d'une rivière coûtent 1.
  - Nouveau Moulin à eau (avec sa roue qui tourne) et port fluvial. Les navires exigent toutefois un port au bord de la mer.
  - Rendu 3D : un ruban fin et courbe qui s'élargit avec le débit, avec des reflets qui s'écoulent et de petites chutes entre les terrasses.
- [x] Nuages retirés.
- [x] **Génération identique en JavaScript et en Python** (terrain, régions et rivières), testée sur 4 cartes.
- Équilibrage reporté après les phases 8 à 12, comme convenu. La CI passe toujours (36 tours en moyenne en partie normale).

## Phase 9 — Commerce et économie mondiale ✅

- [x] **Marché mondial** (`web/src/core/economy.js`, réglages `economy` dans `rules.json`)
  - Un cours par ressource, commun à tous les joueurs : chaque vente le fait baisser, chaque achat le fait monter.
  - Chaque tour, il revient vers une cible qui dépend du nombre de producteurs : rare = cher, très produit = bon marché.
  - Achat possible avec une marge de 35 %, dès qu'un autre joueur produit la ressource.
  - L'Entrepôt affiche le cours, la tendance et une mini-courbe des 20 derniers tours.
- [x] **Bulles spéculatives** : environ tous les 10 tours, une ressource devient à la mode et son cours monte vers ×2,6 pendant 3 à 5 tours. Puis la bulle éclate et le cours chute à ×0,45. C'est annoncé dans le journal et signalé dans l'Entrepôt.
- [x] **Monopoles** : le seul producteur d'une ressource rare la vend 25 % plus cher, les autres la paient 25 % plus cher, et il touche 20 % de leurs achats. Seuls les joueurs concernés sont prévenus.
- [x] **Ligue marchande**
  - Une seule par partie : Commerce et 60 Or, +4 prestige au fondateur.
  - Cotisation de 2 Or par tour. Routes entre membres : +2 Or et +1 prestige. Ventes : +10 %.
  - Invitations dans les deux sens (proposition pour le joueur, décision immédiate pour une IA). Exclusion en cas de conflit (relation sous −25), de cotisation impayée ou de contrat non honoré.
- [x] **IA** : elle vend pendant les bulles, achète la ressource rare qui lui manque quand elle est riche, fonde la ligue (Négociant ou commerçant actif) et invite ses partenaires.
- Réglage provisoire pour la CI : objectif de prestige porté à 250 (35 à 36 tours en partie normale). À revoir lors de l'équilibrage final, notamment la voie économique : l'IA qui possède la Grande Bourse a déjà des milliers d'Or.

## Phase 10 — Diplomatie et grands rendez-vous ✅

Module `web/src/core/summits.js`, réglages `treaties`, `expos` et `standards` dans `rules.json`.

- [x] **Traités à clauses** : 10 ou 20 tours, clauses au choix.
  - Les clauses : Frontières respectées, Partage de technologie (−30 %), Tarifs préférentiels (+2 Or par route), Échanges culturels (+2 Culture).
  - Effets : +0,4 relation par tour et +2 prestige par traité.
  - Rupture anticipée : −20 relation. Fonder une ville près d'un signataire de « Frontières respectées » rompt aussi le traité.
  - À l'échéance, deux IA en bons termes le renouvellent, et une IA propose au joueur de le renouveler.
  - Une IA qui manque de place refuse la clause « Frontières respectées ».
- [x] **Expositions universelles et Jeux mondiaux**, en alternance, tous les 15 tours environ.
  - Candidature deux tours avant, avec une caution remboursée aux perdants. L'hôte est élu par un vote pondéré.
  - L'hôte gagne +12 prestige et +40 Culture. Concours : +8 et +4 prestige.
  - L'Exposition récompense l'industrie, les ressources rares et la science ; les Jeux, la population et la culture. La participation (stand ou grand pavillon) ajoute des points.
- [x] **Normes communes** (Système métrique, Union postale, Brevets internationaux, Heure universelle) : une norme est proposée à chaque Congrès. Elle entre en vigueur dès 2 signataires, et l'on peut y adhérer à un Congrès suivant.
- [x] Interface : traités dans Diplomatie, carte et fenêtre de l'événement, norme dans la fenêtre du Congrès, normes en vigueur dans le panneau Prestige, encyclopédie.
- Correction au passage : le prestige est toujours arrondi à l'entier.

## Phase 11 — Science, culture et tourisme ✅

Module `web/src/core/culture.js`, réglages `challenges`, `artworks`, `heritage` et `tourism` dans `rules.json`. Nouvelle fenêtre « Culture et tourisme » (bouton du panneau Prestige, touche C).

- [x] **Défis scientifiques** : 6 objectifs ouverts à tous (Atlas du monde, Grande Encyclopédie, Académie des sciences, Grand laboratoire, Révolution industrielle, Carte du ciel). Le premier qui en remplit un gagne du prestige et de la Science. La fenêtre affiche votre progression.
- [x] **Œuvres d'art** : tableau, sculpture ou opéra (Philosophie), avec un nom unique.
  - Elles s'exposent dans les lieux qui ont de la place : Théâtre 1, Monument 1, Quartier des arts 2, Amphithéâtre 2.
  - Chacune rapporte Culture et tourisme, et vaut +1 prestige.
  - Prêt à un voisin pour 10 tours : +12 relation et 4 Or de loyer par tour. L'œuvre revient ensuite.
- [x] **Patrimoine mondial** : on peut faire classer une merveille naturelle, une merveille, un monument ou un théâtre (Philosophie, 80 Or, un classement tous les 8 tours). La case est protégée contre l'influence culturelle des voisins, et rapporte +3 tourisme et +3 prestige.
- [x] **Tourisme** : il vient des merveilles naturelles, des merveilles, des théâtres, des œuvres, du patrimoine et de 10 % de la culture. Il rapporte 0,5 Or par point et par tour, et 1 prestige tous les 40 points cumulés.
- [x] IA : elle commande des œuvres, prête à ses amis et fait classer ses sites.
- Provisoire, jusqu'à l'équilibrage final : le plancher de durée de la CI passe à 50 % de la partie (30 tours en partie normale, contre 35 avant). Les nouvelles sources de prestige et de Science raccourcissent les parties (environ 33 tours aujourd'hui), et l'objectif de prestige seul ne suffit plus à compenser, puisque les voies de victoire accélèrent aussi.

## Phase 12 — Climat et société ✅

Module `web/src/core/society.js`, réglages `seasons`, `pollution`, `migration` et `health` dans `rules.json`.

- [x] **Saisons** : 3 tours chacune, affichées à côté du numéro de tour.
  - Printemps +5 % Nourriture et Culture ; été +8 % Or ; automne +20 % Nourriture ; hiver −15 % Nourriture et chemins enneigés au nord (+1 de coût de déplacement).
  - Rendu : herbes et feuillages dorés en automne, neige et arbres givrés en hiver (plus marqués au nord), vert tendre et arbres en fleurs au printemps.
- [x] **Pollution**
  - Ce qui pollue : forge 2, manufacture 2, menuiserie 1, dans leur ville.
  - Ce qui l'absorbe : le nouveau Parc (2 points, +1 Culture) et les forêts du territoire (0,25 chacune, au plus 2).
  - Chaque point restant coûte 1 Nourriture et 0,5 Culture.
- [x] **Santé** : nouvel Aqueduc (Architecture), nécessaire au-delà de 5 habitants ; nouvel Hôpital (Chimie), nécessaire au-delà de 8.
- [x] **Migrations** : tous les 5 tours, un habitant quitte la ville la moins attrayante pour la plus attrayante, y compris chez un voisin (écart minimal de 4). L'attractivité dépend du palier, de la culture, du tourisme, d'une rivière, de la capitale, de la pollution et de la santé.
- [x] Interface : onglet « Cadre de vie » (Parc, Aqueduc, Hôpital), pollution, santé et attractivité dans le panneau de ville, encyclopédie. Modèles 3D du parc, de l'aqueduc et de l'hôpital.
- [x] IA : parcs dans les villes polluées, aqueduc et hôpital avant que ses villes ne plafonnent.

## Phase 13 — Personnages, ambitions et territoire ✅

Modules `web/src/core/people.js` (grands personnages, ambitions) et `web/src/core/land.js` (vocations, catastrophes, aménagement). Réglages `greatPeople`, `ambitions`, `vocations`, `disasters` et `terraform` dans `rules.json`.

- [x] **Grands personnages** : quatre jauges alimentées par les rendements.
  - Savant (Science), Artiste (Culture), Marchand (Or et routes ouvertes), Ingénieur (Bois et Pierre).
  - Seuil : 150 points, +100 % par personnage déjà accueilli du même type.
  - On les emploie quand on veut : avance de 25 % sur la recherche, œuvre d'art offerte, +110 Or et +4 prestige, chantier avancé de 2 tours.
  - Le Diplomate attire plus souvent marchands (+60 %) et artistes (+40 %).
- [x] **Ambitions secrètes** : option de partie, cochée par défaut, et **facultatives**.
  - 16 cartes, 3 en main, 2 jouées au plus ; seule une carte jouée rapporte son prestige (8 à 14).
  - Retrait libre, une défausse tous les 8 tours, une nouvelle carte à chaque réussite.
  - Avec l'option, l'objectif de prestige passe de 290 à 335.
- [x] **Vocations des villes** : à 5 habitants, sept vocations, chacune avec un bonus et une contrepartie (changement : 60 Or, tous les 10 tours au plus).
- [x] **Catastrophes** : option de partie, à partir du tour 8, une au plus par ville et par tour.
  - Crue (printemps, rivières) : nouvelle Digue.
  - Sécheresse (été, sud aride et plaines fertiles) : nouveau Grenier.
  - Incendie (été, villes boisées) : l'Aqueduc protège ; les forêts brûlées deviennent des plaines.
  - Bâtiments endommagés 2 à 3 tours, réparables contre 15 Or. Alerte au début de la saison à risque.
- [x] **Aménagement** : défricher (+20 Bois), reboiser, aplanir une colline (+20 Pierre, Urbanisme), sur une case libre de son territoire.
- [x] IA : emploie ses personnages, joue ses ambitions les plus avancées, choisit des vocations selon sa voie, construit digues et greniers où il faut, répare.
- [x] Interface : bouton Personnages (touche G) avec jauges, personnages et cartes ; vocations, risques et réparations dans le panneau de ville ; aménagement dans le panneau de case ; options de départ ; encyclopédie. Modèles 3D de la digue et du grenier ; les bâtiments endommagés s'affichent en chantier.
- Équilibrage mesuré sur 60 parties : durée moyenne de 36,1 tours contre 36,9 sans ces systèmes, victoires plus variées. Un réglage plus fin reste à faire avec l'équilibrage global.

## Tailles de carte revues ✅

Mesuré : l'IA fonde environ 4 villes par partie quelle que soit la taille. C'est la place restante en fin de partie qui change, donc la marge du joueur.

| Taille | Dimensions | Joueurs (défaut / max) | Cases praticables par joueur | Terres prises en fin de partie |
|---|---|---|---|---|
| Petite | 40 × 30 (contre 32 × 24) | 3 / 4 | ~120 (90 à 4) | ~78 % (91 % à 4) |
| Moyenne | 50 × 36 (contre 40 × 28) | 4 / 6 | ~158 (105 à 6) | ~68 % (87 % à 6) |
| Grande | 62 × 42 (contre 50 × 34) | 6 / 8 | ~134 (100 à 8) | ~74 % (88 % à 8) |
| Immense (expérimentale) | 72 × 48 | 8 / 8 | ~128 | ~71 % |

- Serveur Railway : aucun effet. Il ne sert que des fichiers statiques, et la carte est générée dans le navigateur.
- Sauvegardes : 200 à 600 Ko chacune, soit au plus 2,4 Mo pour les 4 emplacements (limite du navigateur d'environ 5 Mo).
- Calcul d'un tour d'IA : 45 à 115 ms en simulation.
- Rendu : la taille Immense est environ 1,3 à 1,5 fois plus lourde que l'ancienne grande carte (de 1 100 à 1 200 objets dessinés et environ 2,3 millions de triangles). D'où la mention « expérimentale ».

## Équilibrage complet ✅

Mesuré sur 60 à 100 parties simulées par réglage, toutes les nouveautés des phases 8 à 12 comprises, sur les nouvelles tailles de carte.

- **Partie normale** (carte moyenne, 4 joueurs)

  | Mesure | Avant | Après |
  |---|---|---|
  | Durée moyenne | 35,6 tours | 38,2 tours |
  | Profils | 18 à 36 % | 22 à 28 % sur 150 parties de contrôle (25 % = équilibre) |
  | Victoires au prestige | 63 % | 50 % |
  | Autres voies | science 16, économie 10, diplomatie 7, culture 4 | diplomatie 15 %, science 15 %, économie 13 %, culture 7 % |

  - Objectif de prestige : 290.
  - Science : 13 technologies et l'Observatoire. Culture : 650 et l'Amphithéâtre.
  - Économie : 3 000 Or de base (3 450 en partie normale) avec la Grande Bourse. Le seuil était trivial pour une IA qui thésaurise.
  - Érudit : 0,9 prestige par palier de technologie. Diplomate : +6 relation initiale, +0,2 par tour, +1 prestige par ambassade. Négociant : +7 prestige par route ouverte et par accord. Explorateur : jusqu'à +22 prestige d'exploration.
- **Partie rapide** : environ 30 tours (contre 28), avec des technologies moins chères (×0,6) et des seuils de voies plus bas. Le prestige reste la voie principale (environ 68 %), mais toutes les voies apparaissent. « Allié de tous » demande 3 élections.
- **Partie longue** : environ 47 tours (contre 44), avec des technologies plus chères (×2) et des seuils de voies ×4. Victoires variées (prestige, science, diplomatie, culture, économie). L'Érudit reste un peu au-dessus (environ 33 %), mais ce n'est pas le mode principal.
- **CI** : le plancher de durée remonte à 58 % de la partie (35 tours en partie normale).
- **Essai d'entraînement « balance »** (6 générations, 4 candidats, 60 parties) : non retenu. Sur 150 parties de contrôle, l'écart entre profils passe de 17 à 23 points et les victoires scientifiques disparaissent. Il faudra au moins 150 parties par candidat pour mesurer l'équilibre de façon fiable, de préférence dans Colab.
- **Entraînement de l'IA** : nouvel objectif `--objective balance` (`python -m expandto.train`). Les paramètres candidats s'appliquent à tous les joueurs, et le score récompense un petit écart entre profils et une durée de 37 à 41 tours. `tools/sim.mjs --ai-all=fichier` et la sortie `--json` donnent le taux de victoire par profil.

> Ordre proposé : la phase 8 d'abord (cartes, régions, ressources), puis la phase 9, qui en dépend. Les phases 10 à 12 peuvent ensuite se faire dans l'ordre que l'on préfère. Chaque phase se termine par un passage d'équilibrage en simulation.

---

## Méthode de travail proposée

1. Une **issue** par fonctionnalité, une **branche** et une **PR** en brouillon ; le jeu se teste sur Railway une fois la PR fusionnée.
2. Toute modification de règles passe par `web/data/*.json`. On la vérifie avec le notebook Colab et la simulation **avant** la PR.
3. Rien n'est poussé sans validation.

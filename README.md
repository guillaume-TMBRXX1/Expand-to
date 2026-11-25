# Expand-to

Jeu de stratégie et de gestion au tour par tour, minimaliste et coloré, en 3D dans le navigateur.
Vous explorez, bâtissez, commercez et négociez avec des IA. **Il n'y a pas d'armée** : la victoire se joue au **prestige**.
Une partie dure de 30 à 60 minutes.

## Lancer le jeu en local

Le jeu est un site statique, sans dépendance à installer : Three.js est inclus dans `web/vendor/`.

```bash
node tools/serve.mjs
```

Ouvrez ensuite <http://localhost:8000>.

## Déployer en ligne

- **Railway** : importez le dépôt GitHub dans un nouveau projet. `railway.json` lance `node tools/serve.mjs`, un mini-serveur statique sans dépendance qui écoute sur la variable d'environnement `PORT`. Générez ensuite un domaine public dans *Settings → Networking*.
- **Vercel** : importez le dépôt. `vercel.json` sert directement le dossier `web/`, sans étape de build.

## Jouer sur iPad

- Ouvrez l'adresse du jeu dans Safari, en tenant l'iPad **à l'horizontale**.
- Pour jouer en plein écran comme une application : bouton **Partager**, puis **Sur l'écran d'accueil**.
- Commandes au doigt :
  - toucher une case : sélectionner, construire ou déplacer ;
  - glisser un doigt : déplacer la carte ;
  - deux doigts : zoomer et pivoter.
- Le bouton **Infos** ouvre le classement, la mini-carte, les propositions et le journal. Une pastille signale une proposition ou un congrès en attente.

## Labo Python (Google Colab)

Ouvrez `notebooks/Expand_to_Lab.ipynb` dans Colab. Le notebook clone le dépôt, prévisualise les cartes, analyse l'équilibrage et lance des simulations IA contre IA.

En local :

```bash
cd python && python3 -m pytest -q
```

```bash
node tools/sim.mjs 10 --size=large --type=archipelago --length=long --ais=7
```

## Paramètres de partie

Sur l'écran d'accueil, vous choisissez :
- la **taille de carte** : petite (40 × 30, jusqu'à 3 IA), moyenne (50 × 36, jusqu'à 5 IA), grande (62 × 42, jusqu'à 7 IA) ou Immense (72 × 48, 7 IA, expérimentale : elle peut être lente sur un iPad ancien) ;
- le **type de carte** : continent (une grande terre, bordée de 2 à 3 cases de mer), pangée ou archipel. En archipel, la Navigation permet de traverser les lagunes ;
- la **durée** : 40, 60 ou 80 tours ;
- la **difficulté** : en Difficile, les IA jouent avec les paramètres entraînés (meilleurs choix de recherche et de construction), avec de petits bonus ;
- le **profil**.
- deux options, cochées par défaut : les **ambitions secrètes** (cartes d'objectif facultatives) et les **catastrophes naturelles**.

À la fin d'une partie, des graphiques et un tableau résument la partie. Les 10 dernières parties s'affichent sur l'accueil.

## Comment jouer

| Action | Commande |
|---|---|
| Sélectionner, déplacer une unité | clic gauche |
| Déplacer la caméra | clic gauche glissé |
| Pivoter la caméra | clic droit glissé |
| Zoomer | molette |
| Finir le tour | `Entrée` |
| Unité suivante | `Espace` |
| Fonder une ville (Colon) | `F` |
| Construire une route | `R` |
| Technologies | `T` |
| Politiques | `P` |
| Diplomatie | `D` |
| Menu (sauvegardes, options, sons) | `M` |
| Encyclopédie | `E` |
| Bonus d'adjacence sur la carte | `A` |
| Repères (drapeaux, bâtiments prévus) | `K` |
| Personnages et ambitions | `G` |
| Annuler | `Échap` |

- **Fin du tour** : elle attend que chaque unité ait reçu un ordre. Une pastille sur le bouton compte les unités en attente, et le jeu sélectionne la première. Pour une unité qui n'a rien à faire, utilisez **Passer ce tour**, ou **Mettre en veille** : elle ne sera plus signalée jusqu'à ce que vous la réveilliez ou lui donniez un ordre. Ce blocage se désactive dans le menu.
- **Déplacer** : cliquez une destination pour voir le chemin et le nombre de tours, puis cliquez à nouveau pour confirmer (Échap annule).
- **Fonder** : une ville doit être à au moins 3 cases de toute autre. On peut combler les trous de son propre territoire.
- **Construire** : choisissez un bâtiment dans la barre du bas, puis une case verte de votre territoire. Maintenez `Maj` pour en placer plusieurs.
- **Déplacer un bâtiment** (comme dans Anno) : sélectionnez-le puis « Déplacer » (10 Or). Les cases possibles s'allument en vert, plus vif là où l'adjacence serait meilleure, avec le bonus attendu. Les merveilles et les comptoirs restent en place. Pratique pour spécialiser une ville une fois les premières fermes et scieries devenues inutiles.
- **Fiche des adjacences** : `node tools/adjacency-sheet.mjs adjacences.html` génère, depuis les données du jeu, le tableau de tous les bonus d'adjacence (à imprimer en PDF). Les planches des quartiers conseillés se voient sur `/quartiers.html` (vrais modèles 3D, bonus calculés par le moteur) ; enregistrées en `quartier-<id>.png`, elles s'ajoutent à la fiche avec `--images=dossier`.
- **Repères** : l'onglet **Repères** de la barre de construction (touche `K`) pose des drapeaux de couleur ou des **bâtiments prévus**, affichés en fantôme bleu. Un bâtiment prévu compte comme voisin dans les aperçus d'adjacence : vous pouvez dessiner un quartier entier, voir ce qu'il rapportera, puis le construire pièce par pièce. Toucher un repère avec le même outil le retire ; construire à cet endroit le remplace. Les repères sont sauvegardés avec la partie.
- **Caravane** : envoyez-la dans une ville étrangère pour ouvrir une route commerciale. Elle rapporte de l'Or, de la relation et du prestige.
- **Industrie** : les Menuiseries, Forges et Manufactures transforment vos matières premières en planches, outils et biens. Ces biens font monter vos villes de palier (Artisans, puis Savants).
- **Adjacences** : placez vos bâtiments les uns à côté des autres pour obtenir des bonus. Le gain s'affiche au survol pendant la construction.
- **Halle marchande et marché mondial** (onglet Industrie, puis Entrepôt) : les cours sont communs à tous les joueurs.
  - Chaque vente fait baisser le cours, chaque achat le fait monter, puis il revient peu à peu selon la rareté.
  - On peut acheter une ressource, avec une marge, dès qu'un autre joueur la produit.
  - Une option vend automatiquement tout ce qui dépasse un seuil réglable pour chaque ressource.
- **Bulles spéculatives** : de temps en temps, une ressource devient à la mode, son cours s'envole quelques tours, puis la bulle éclate.
- **Monopoles** : le seul producteur d'une ressource rare la vend 25 % plus cher et touche une part des achats des autres.
- **Ligue marchande** (Diplomatie) : une seule par partie, fondée pour 60 Or.
  - Les membres paient 2 Or par tour.
  - Leurs routes communes rapportent +2 Or et +1 prestige, et leurs ventes sont payées 10 % de plus.
  - Un conflit ouvert, une cotisation impayée ou un contrat non honoré vaut l'exclusion.
- **Merveilles** : chacune est unique dans la partie. Le premier qui l'achève la garde, et les autres chantiers sont remboursés à 50 %. Si un rival en construit une, sa carte dans l'onglet Merveilles affiche son nom et le nombre de tours restants (et les vôtres si vous êtes en course). Le journal vous prévient dès qu'une course commence.
- **Régions** : la carte est divisée en cinq régions climatiques (nord froid, terres tempérées, plaines fertiles, sud aride, côtes et lagunes), chacune avec sa teinte et son décor. Le nom de la région s'affiche au survol d'une case.
- **Ressources rares** : neuf ressources, chacune présente dans une ou deux régions seulement. Il faut donc commercer pour toutes les avoir :
  - au nord : fourrures et cristal ;
  - dans les terres tempérées : marbre et vin ;
  - dans les plaines fertiles : soie ;
  - sur les côtes : perles et sel ;
  - dans le sud aride : encens et épices.

  Elles s'exploitent avec un Comptoir. Le bouton **Entrepôt** affiche vos stocks et vos bonus actifs.
- **Rivières** : elles descendent des collines vers la mer.
  - Une ville au bord d'une rivière gagne +2 Nourriture et +1 Or.
  - Un bâtiment construit sur une rivière gagne +1 Or (une ferme, aussi +1 Nourriture).
  - On s'y déplace plus vite.
  - Le Moulin à eau et le port fluvial s'y construisent.
- **Diplomatie** : les voisins méfiants ou hostiles réduisent votre productivité. Accords et alliances la renforcent.
- **Victoire** : la première voie complétée l'emporte. Sinon, la victoire va au premier à 310 points de prestige (355 avec les ambitions, en partie normale sur carte moyenne), ou au meilleur score après 60 tours. Les voies (valeurs en partie normale) :
  - Science : Observatoire Céleste et 15 technologies ;
  - Culture : Amphithéâtre et 680 de culture ;
  - Économie : Grande Bourse et 2 645 Or en caisse ;
  - Diplomatie : élu 4 fois Secrétaire et allié de la moitié des rivaux, ou allié de tous et élu 3 fois.

  En partie rapide, les seuils sont plus bas et les technologies moins chères ; en partie longue, c'est l'inverse. Le bouton « Voies de victoire » (panneau Prestige) suit votre progression.
- **Politiques** (touche `P`) : vous adoptez jusqu'à 3 politiques (1 au départ, 2 à 4 technologies, 3 à 9). Remplir un emplacement libre est gratuit ; remplacer une politique coûte 30 Or. Chaque branche de l'arbre technologique en débloque de nouvelles.
- **Événements** : tous les 4 à 6 tours environ, un événement vous propose un choix (sécheresse, comète, savant exilé…). La carte s'affiche dans le panneau de droite. Sans réponse au bout de 3 tours, le choix le plus raisonnable est fait pour vous.
- **Merveilles naturelles** : six sites uniques (Grandes Chutes, Mont Braise, Récif de corail, Arbre millénaire, Canyon rouge, Oasis). Les découvrir rapporte du prestige (davantage au premier). Dans votre territoire, elles produisent et rapportent du prestige, et les bâtiments voisins gagnent +1 Culture.
- **Ruines antiques** : la première unité qui y entre les fouille et y trouve de l'Or, de la Science, de la Culture, des matériaux ou une carte de la région.
- **Profils** : chacun a son bâtiment propre (onglet à son nom dans la barre de construction) et une capacité active, avec un temps de recharge (bouton ★ à côté des onglets) :
  - Négociant : Maison des Guildes, et la Grande foire (+30 % Or pendant 3 tours) ;
  - Érudit : Académie royale, et la Percée (40 % de la recherche en cours) ;
  - Bâtisseur : Atelier des maîtres, et le Chantier éclair (tous les chantiers avancent de 2 tours) ;
  - Diplomate : Chancellerie, et le Sommet (+4 relation avec tous) ;
  - Explorateur : Relais des cartographes, et la Grande expédition (carte révélée autour des unités, +2 mouvements).
- **Contrats commerciaux** : une IA vous demande une livraison (par exemple 15 planches en 6 tours) contre de l'Or, de la relation et du prestige. Un contrat accepté puis non honoré coûte de la relation.
- **Influence culturelle** : votre culture s'accumule en influence et agrandit votre territoire d'une case neutre à la fois. Avec une culture bien plus forte qu'un voisin, vous pouvez attirer une case de sa frontière, ce qui le fâche. Le détail s'affiche au survol de la Culture.
- **Crise mondiale** : vers le milieu de la partie, une crise frappe tous les pays (épidémie, krach, tempêtes). Un Congrès extraordinaire réunit les contributions en Or. Si l'objectif est atteint, la crise s'arrête et les contributeurs gagnent du prestige. Sinon, elle dure 8 tours, et personne ne paie.
- **Congrès mondial** (tous les 10 tours) : votez la résolution, élisez le Secrétaire et décidez d'adhérer à une **norme commune** : Système métrique, Union postale, Brevets internationaux ou Heure universelle. Une norme entre en vigueur dès 2 signataires. Le poids de votre vote grandit avec vos alliances, accords et ambassades.
- **Culture et tourisme** (bouton « Culture » du panneau Prestige, ou touche `C`) :
  - **Œuvres d'art** : tableaux, sculptures et opéras se commandent puis s'exposent dans un Théâtre, un Monument, un Quartier des arts ou l'Amphithéâtre. Chacune rapporte de la Culture et du tourisme, et peut être prêtée à un voisin contre de la relation et un loyer.
  - **Patrimoine mondial** : faire classer une merveille naturelle, une merveille, un monument ou un théâtre protège la case contre l'influence des voisins et attire des visiteurs.
  - **Tourisme** : il rapporte de l'Or chaque tour, et du prestige en s'accumulant.
  - **Défis scientifiques** : six objectifs ouverts à tous (Atlas du monde, Grande Encyclopédie…). Le premier qui en remplit un gagne du prestige et de la Science.
- **Musique de fond** : une musique d'ambiance générée en continu (aucun fichier audio), qui ne se répète jamais à l'identique. Son humeur suit la saison (claire au printemps, plus lente et sombre en hiver) et ses instruments suivent l'ère (lyre, luth et flûte, boîte à musique, piano électrique). Elle démarre au premier clic et se coupe ou se règle dans le menu, séparément des sons.
- **Saisons** : chacune dure 3 tours et s'affiche à côté du numéro de tour.
  - Printemps : un peu plus de Nourriture et de Culture.
  - Été : plus d'Or.
  - Automne : les récoltes (+20 % Nourriture).
  - Hiver : moins de Nourriture, et les chemins du nord sont enneigés.

  La carte change de couleur : feuillages dorés en automne, neige en hiver.
- **Pollution** : les ateliers (forge, manufacture, menuiserie) polluent leur ville, ce qui coûte de la Nourriture et de la Culture. Les parcs (onglet Cadre de vie) et les forêts du territoire l'absorbent.
- **Santé** : au-delà de 5 habitants, une ville a besoin d'un Aqueduc ; au-delà de 8, d'un Hôpital.
- **Migrations** : tous les 5 tours, des habitants quittent la ville la moins attrayante pour la plus attrayante, même chez un voisin. Le panneau de la ville affiche son attractivité, sa pollution et sa santé.
- **Traités** (Diplomatie) : un traité de 10 ou 20 tours avec les clauses de votre choix (Frontières respectées, Partage de technologie, Tarifs préférentiels, Échanges culturels). Il apporte de la relation et du prestige. Le rompre avant l'échéance coûte cher, et on le renégocie à la fin.
- **Expositions universelles et Jeux mondiaux** (tous les 15 tours environ) : deux tours avant, on peut se porter candidat pour accueillir l'événement et choisir sa participation au concours. L'hôte et les deux premiers du concours gagnent du prestige.
- **Personnalités** : chaque IA est loyale, opportuniste ou isolationniste, et se souvient de vos actes (fiche Diplomatie).
- **Grands personnages** (bouton Personnages, touche `G`) : vos rendements remplissent quatre jauges. Une jauge pleine fait venir un personnage, que vous employez quand vous voulez.
  - Savant : une avance sur la recherche en cours.
  - Artiste : une œuvre d'art offerte (ou de la Culture).
  - Marchand : de l'Or, du prestige et de meilleures relations.
  - Ingénieur : un chantier avancé de 2 tours, merveille comprise.
- **Ambitions secrètes** (option) : vous recevez 3 cartes d'objectif cachées, par exemple « 3 villes au bord d'une rivière » ou « achever 2 merveilles ». Elles sont **facultatives** : rien ne vous oblige à les jouer, et une carte gardée en main ne coûte rien.
  - Jouez-en jusqu'à 2 à la fois ; une carte jouée rapporte son prestige dès qu'elle est remplie, puis vous en piochez une autre.
  - Vous pouvez retirer une carte jouée à tout moment, et en défausser une tous les 8 tours pour piocher.
  - Avec cette option, l'objectif de prestige est un peu plus haut.
- **Vocations des villes** : à 5 habitants, une ville choisit une vocation dans son panneau : ville universitaire, d'art, place marchande, cité portuaire, centre industriel, siège diplomatique ou grenier régional. Chacune apporte un bonus marqué et une petite contrepartie. En changer coûte 60 Or, au plus tous les 10 tours.
- **Catastrophes** (option, à partir du tour 8) : le panneau de la ville indique ses risques et si elle est protégée.
  - Crues au printemps près des rivières : bâtiments endommagés, mais le limon apporte de la Nourriture. Une **Digue** protège la ville.
  - Sécheresses en été dans le sud aride et les plaines fertiles. Un **Grenier** protège la ville.
  - Incendies en été dans les villes entourées de forêts. L'Aqueduc protège la ville.

  Un bâtiment endommagé ne produit rien pendant quelques tours ; on peut le réparer contre de l'Or.
- **Aménager le territoire** : sélectionnez une case libre de votre territoire pour défricher une forêt (+Bois), reboiser une plaine (contre la pollution, près des scieries) ou aplanir une colline (+Pierre, avec l'Urbanisme).
- **Ères** : Antiquité, Renaissance (3 technologies), ère industrielle (7) et ère moderne (11). L'ère s'affiche à côté du numéro de tour.
  - Vos bâtiments changent d'allure à chaque ère : façades ocre et lanternes, puis brique et cheminées, puis façades blanches, antennes et panneaux solaires.
  - Chaque ère rapporte du prestige et ouvre une merveille (Grand Dôme, Palais de cristal, Tour des ondes), de nouveaux gouvernements, le Musée et l'Archéologue (Renaissance), puis l'Agent (ère industrielle).
- **Gouvernements** (fenêtre Politiques) : Conseil des anciens, puis République marchande ou Monarchie éclairée, Démocratie ou Technocratie, Fédération culturelle. Chacun a sa doctrine : bonus, contrepartie, parfois un emplacement de politique de plus. En changer coûte 60 Or, au plus tous les 10 tours.
- **Archéologie** : des sites antiques parsèment la carte. Un Archéologue qui en atteint un exhume un artefact, exposé comme une œuvre d'art (Culture, tourisme, prestige) ; il faut une place d'exposition libre (le Musée en offre 3). Fouiller chez un voisin le froisse.
- **Comptoirs indépendants** : comptoirs marchands, campements nomades, cités savantes et villages d'artistes, neutres. On ne les conquiert pas, on les courtise : caravane, émissaire, cadeau (30 Or), culture des villes proches. Le plus apprécié devient leur protecteur et reçoit leur bonus et du prestige. Sélectionnez-les sur la carte ou dans la Diplomatie.
- **Espionnage industriel** : un Agent entré dans une ville étrangère copie une technologie ou retarde un chantier. S'il est repéré (35 % de risque, davantage chez un joueur qui a une Chancellerie), c'est un incident diplomatique, et une fois sur deux la mission échoue.
- **Routes commerciales sur la carte** : les routes qui vous concernent sont tracées en pointillés qui défilent dans le sens du trajet. En doré, celles que vous avez ouvertes avec vos caravanes et navires ; en bleu, celles que vos voisins ont ouvertes vers vos villes. L'infobulle d'une ville les rappelle.
- **Mouvements culturels** (fenêtre Culture, touche `C`) : Stoïcisme, Humanisme, Lumières, Esprit d'entreprise, Romantisme, Mouvement hygiéniste, Modernisme.
  - Chacun naît dans la capitale du pays le plus cultivé de son ère, puis gagne les villes voisines, porté par la culture, les routes commerciales et les alliances. Les icônes des mouvements présents s'affichent à côté du nom des villes.
  - Pour chaque mouvement, vous choisissez d'**adhérer** (bonus dans chaque ville touchée, propagation plus rapide chez vous ; 2 adhésions au plus), de rester **neutre** ou de l'**interdire** (il se propage beaucoup moins chez vous).
  - Le pays fondateur gagne du prestige quand son mouvement gagne des villes étrangères.

## Structure

```
web/                 jeu (statique)
  data/*.json        règles du jeu, source unique partagée avec Python
  src/core/          moteur de règles + IA (sans rendu, testable sous Node)
  src/render/        rendu Three.js (terrain, modèles 3D)
  src/main.js        interface et boucle de jeu
python/expandto/     génération de cartes (identique au JS), équilibrage
notebooks/           notebook Google Colab
tools/sim.mjs        simulation headless IA contre IA
```

Voir [ROADMAP.md](ROADMAP.md) pour la suite et [DESIGN.md](DESIGN.md) pour la direction artistique. La planche de style des modèles 3D est sur `/gallery.html`.

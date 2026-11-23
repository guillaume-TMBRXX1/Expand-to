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
- la **taille de carte** : petite, moyenne ou grande, avec jusqu'à 7 IA sur une grande carte ;
- le **type de carte** : continent, pangée ou archipel. En archipel, la Navigation permet de traverser les lagunes ;
- la **durée** : 40, 60 ou 80 tours ;
- la **difficulté** et le **profil**.

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
| Annuler | `Échap` |

- **Déplacer** : cliquez une destination pour voir le chemin et le nombre de tours, puis cliquez à nouveau pour confirmer (Échap annule).
- **Construire** : choisissez un bâtiment dans la barre du bas, puis une case verte de votre territoire. Maintenez `Maj` pour en placer plusieurs.
- **Caravane** : envoyez-la dans une ville étrangère pour ouvrir une route commerciale. Elle rapporte de l'Or, de la relation et du prestige.
- **Industrie** : les Menuiseries, Forges et Manufactures transforment vos matières premières en planches, outils et biens. Ces biens font monter vos villes de palier (Artisans, puis Savants).
- **Adjacences** : placez vos bâtiments les uns à côté des autres pour obtenir des bonus. Le gain s'affiche au survol pendant la construction.
- **Halle marchande** (onglet Industrie) : elle permet de vendre dans l'Entrepôt vos biens, matériaux et ressources rares contre de l'Or. Le prix baisse si vous vendez beaucoup, puis remonte chaque tour. Une option vend automatiquement tout ce qui dépasse un seuil réglable pour chaque ressource (30 par défaut).
- **Merveilles** : chacune est unique dans la partie. Le premier qui l'achève la garde, et les autres chantiers sont remboursés à 50 %. Si un rival en construit une, sa carte dans l'onglet Merveilles affiche son nom et le nombre de tours restants (et les vôtres si vous êtes en course). Le journal vous prévient dès qu'une course commence.
- **Ressources rares** : épices, marbre et cristal s'exploitent avec un Comptoir. Le bouton **Entrepôt** affiche vos stocks et vos bonus actifs.
- **Diplomatie** : les voisins méfiants ou hostiles réduisent votre productivité. Accords et alliances la renforcent.
- **Victoire** : la première voie complétée l'emporte. Les voies sont Science, Culture, Économie et Diplomatie ; sinon, la victoire va au premier à 210 points de prestige, ou au meilleur score après 60 tours. Le bouton « Voies de victoire » (panneau Prestige) suit votre progression.
- **Politiques** (touche `P`) : vous adoptez jusqu'à 3 politiques (1 au départ, 2 à 4 technologies, 3 à 9). Remplir un emplacement libre est gratuit ; remplacer une politique coûte 30 Or. Chaque branche de l'arbre technologique en débloque de nouvelles.
- **Événements** : tous les 4 à 6 tours environ, un événement vous propose un choix (sécheresse, comète, savant exilé…). La carte s'affiche dans le panneau de droite. Sans réponse au bout de 3 tours, le choix le plus raisonnable est fait pour vous.
- **Merveilles naturelles** : six sites uniques (Grandes Chutes, Mont Braise, Récif de corail, Arbre millénaire, Canyon rouge, Oasis). Les découvrir rapporte du prestige (davantage au premier). Dans votre territoire, elles produisent et rapportent du prestige, et les bâtiments voisins gagnent +1 Culture.
- **Ruines antiques** : la première unité qui y entre les fouille et y trouve de l'Or, de la Science, de la Culture, des matériaux ou une carte de la région.
- **Profils** : chacun a son bâtiment propre (onglet à son nom dans la barre de construction) et une capacité active, avec un temps de recharge (bouton ★ à côté des onglets) :
  - Négociant : Maison des Guildes, et la Grande foire (+30 % Or pendant 3 tours) ;
  - Érudit : Académie royale, et la Percée (la moitié de la recherche en cours) ;
  - Bâtisseur : Atelier des maîtres, et le Chantier éclair (tous les chantiers avancent de 2 tours) ;
  - Diplomate : Chancellerie, et le Sommet (+6 relation avec tous) ;
  - Explorateur : Relais des cartographes, et la Grande expédition (carte révélée autour des unités, +2 mouvements).
- **Contrats commerciaux** : une IA vous demande une livraison (par exemple 15 planches en 6 tours) contre de l'Or, de la relation et du prestige. Un contrat accepté puis non honoré coûte de la relation.
- **Influence culturelle** : votre culture s'accumule en influence et agrandit votre territoire d'une case neutre à la fois. Avec une culture bien plus forte qu'un voisin, vous pouvez attirer une case de sa frontière, ce qui le fâche. Le détail s'affiche au survol de la Culture.
- **Crise mondiale** : vers le milieu de la partie, une crise frappe tous les pays (épidémie, krach, tempêtes). Un Congrès extraordinaire réunit les contributions en Or. Si l'objectif est atteint, la crise s'arrête et les contributeurs gagnent du prestige. Sinon, elle dure 8 tours, et personne ne paie.
- **Congrès mondial** (tous les 10 tours) : votez la résolution et élisez le Secrétaire. Le poids de votre vote grandit avec vos alliances, accords et ambassades.
- **Personnalités** : chaque IA est loyale, opportuniste ou isolationniste, et se souvient de vos actes (fiche Diplomatie).

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

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
- **Halle marchande** (onglet Industrie) : elle permet de vendre dans l'Entrepôt vos biens, matériaux et ressources rares contre de l'Or. Le prix baisse si vous vendez beaucoup, puis remonte chaque tour. Une option vend automatiquement tout ce qui dépasse 30 unités.
- **Ressources rares** : épices, marbre et cristal s'exploitent avec un Comptoir. Le bouton **Entrepôt** affiche vos stocks et vos bonus actifs.
- **Diplomatie** : les voisins méfiants ou hostiles réduisent votre productivité. Accords et alliances la renforcent.
- **Victoire** : la première voie complétée l'emporte. Les voies sont Science, Culture, Économie et Diplomatie ; sinon, la victoire va au premier à 160 points de prestige, ou au meilleur score après 60 tours. Le bouton « Voies de victoire » (panneau Prestige) suit votre progression.
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

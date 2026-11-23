# Expand-to

Jeu de stratégie et de gestion au tour par tour, minimaliste et coloré, en 3D dans le navigateur.
Vous explorez, bâtissez, commercez et négociez avec des IA. **Il n'y a pas d'armée** : la victoire se joue au **prestige**.
Une partie dure de 30 à 60 minutes.

## Lancer le jeu en local

Le jeu est un site statique, sans dépendance à installer : Three.js est inclus dans `web/vendor/`.

```bash
python3 -m http.server 8000 --directory web
```

Ouvrez ensuite <http://localhost:8000>.

## Déployer sur Vercel

Importez le dépôt dans Vercel. `vercel.json` sert directement le dossier `web/`, sans étape de build.

## Labo Python (Google Colab)

Ouvrez `notebooks/Expand_to_Lab.ipynb` dans Colab. Le notebook clone le dépôt, prévisualise les cartes, analyse l'équilibrage et lance des simulations IA contre IA.

En local :

```bash
cd python && python3 -m pytest -q
```

```bash
node tools/sim.mjs 10
```

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
| Annuler | `Échap` |

- **Construire** : choisissez un bâtiment dans la barre du bas, puis une case verte de votre territoire. Maintenez `Maj` pour en placer plusieurs.
- **Caravane** : envoyez-la dans une ville étrangère pour ouvrir une route commerciale. Elle rapporte de l'Or, de la relation et du prestige.
- **Diplomatie** : les voisins méfiants ou hostiles réduisent votre productivité. Accords et alliances la renforcent.
- **Victoire** : le premier à 150 points de prestige l'emporte, sinon le meilleur score après 60 tours. Le prestige vient des villes, des technologies, de la culture, des monuments, des merveilles, des routes commerciales, des accords et des alliances.

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

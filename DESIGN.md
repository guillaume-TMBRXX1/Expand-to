# Expand-to — Direction artistique

Ambiance : des **jouets en argile posés sur une table**. On voit des dioramas arrondis et chaleureux, lisibles d'un coup d'œil en vue isométrique.
Références : planches de bâtiments isométriques « toy », boutiques miniatures et avatars à grosse tête.
On en reprend le **style**, jamais les marques, les logos ni les personnages existants.

Planche de style vivante : `web/gallery.html` affiche tous les modèles avec l'éclairage du jeu.

## Principes

1. **Tout est arrondi.** Les blocs utilisent `RoundedBoxGeometry` : aucune arête vive, pas de flat shading.
2. **Chaque bâtiment est un diorama.** Il repose sur un socle de 0,9 case (pavés, herbe ou sable, selon sa fonction) qui porte son histoire : clôtures, pots de fleurs, bancs, caisses, lampadaires.
3. **On reconnaît la fonction à la silhouette et à la couleur du toit**, avant tout détail.
4. **Les accessoires racontent.** Bottes de foin pour la ferme, auvent rayé pour le marché, dôme vitré pour le laboratoire, échafaudage jaune pour un chantier.
5. **Les joueurs se repèrent à leur couleur** : toits des maisons, drapeaux, bonnets et sweats des personnages, territoire. Tout le reste reste dans la palette commune.
6. **Les personnages sont « toy »** : grosse tête, grands yeux ronds, bonnet ou chapeau, sweat à la couleur du joueur.

## Palette

| Rôle | Couleurs |
|---|---|
| Fond, table | `#efe8e4` (gris rosé chaud) |
| Socles et pavés | `#e9e1d6`, crème `#f6ead6`, crème foncé `#e8d6ba` |
| Toits | terracotta `#e0674f`, bleu `#4f86d9`, violet `#8b79d9`, vert `#5cb56b`, rouge `#e2574c`, or `#f2b632` |
| Végétation | `#5fae5a`, `#86c96a`, herbe `#8fcf6e` |
| Matériaux | bois `#b07446`, pierre `#b9b2aa`, acier `#a9b6c4`, vitre `#3d5a80` / `#9fd3f0` |
| Terrain | océan `#5b9bd5`, lagune `#82c8ea`, plage `#f3e0b5`, plaine `#d3e59c`, prairie `#a2d47c`, forêt `#7fbf6d`, collines `#dcb68c`, montagne `#c3bbb2` |
| Joueurs | `#ff6b4a`, `#8b5cf6`, `#f5b700`, `#14b8a6`, `#ec4899` |

Les couleurs des modèles se trouvent dans `PAL`, dans `web/src/render/models.js`. Celles de l'interface sont les variables CSS de `web/styles.css`.

## Lumière

- Ciel `#fff8f0` et sol `#c9b8ad` pour l'hémisphère, soleil chaud `#fff1dc`.
- Ombres douces (PCF soft, `normalBias` pour éviter l'acné d'ombre).
- Matériaux mats : rugosité de 0,6 à 0,75, aucun métal.

## Interface

- Police **Nunito** (arrondie, chargée depuis Google Fonts, avec la police système en secours).
- Cartes `#fffdfb` aux coins de 16 px, ombres brunes très diffuses, ressources en pastilles arrondies.
- Bouton principal corail avec une petite « marche » sous le bouton (effet jouet).
- Portraits des dirigeants en SVG (`web/src/ui/avatar.js`), un couvre-chef par profil :
  - Négociant : chapeau de paille
  - Érudit : lunettes
  - Bâtisseur : casque de chantier
  - Diplomate : casquette et nœud papillon
  - Explorateur : bonnet à pompon

## Technique

- Un modèle est un assemblage de primitives, ensuite **fusionnées par matériau** (`bake`) : un bâtiment ne coûte que quelques appels de rendu.
- Les géométries et matériaux sont mis en cache.
- Animations : les pièces animées sont marquées `anim(...)` dans `models.js` (types `spin`, `flag`, `bob`, `smoke`). Elles ne sont pas fusionnées, et le renderer les anime (coupées si `prefers-reduced-motion`).
- Terrain : flancs assombris par un shader, décor instancié (fleurs, touffes, rochers, coquillages), eau animée (vaguelettes et reflets), zones hors de vue grisées.

## Deuxième passage

- **Variantes** : chaque bâtiment tire une variante de sa position (même case, même allure à chaque partie). Les couleurs des toits et des murs changent par une table de correspondance (`VARIANTS` dans `models.js`), et l'orientation tourne d'un quart de tour, sauf pour les bâtiments liés à la côte ou aux quartiers.
- **Villes par palier** : les Artisans ajoutent une place avec une fontaine et un étal sous auvent. Les Savants ajoutent une tour à dôme aux couleurs du joueur et des maisons plus hautes.
- **Chantiers** : le bâtiment monte au fil des tours (de 25 à 90 % de sa hauteur, translucide), entouré d'échafaudages, de caisses et d'une grue dont la flèche tourne.
- **Effets** : à l'achèvement, le bâtiment apparaît avec un léger rebond, suivi d'un nuage de poussière et d'étincelles. Une nouvelle ville apparaît de la même façon, une ville qui grandit rebondit, une nouvelle unité apparaît en douceur, et une unité en marche laisse une petite traînée de poussière. Ces effets ne se jouent que pour les cases visibles, et pas au chargement d'une partie.
- **Décor** : palmiers sur les plages, sapins sur les collines et au pied des montagnes, buissons dans les plaines (instanciés, avec couleurs de sommets). Une frange d'écume borde les côtes.
- **Ciel dégagé** : les nuages ont été retirés à la demande, pour garder la carte toujours lisible.
- **Rivières** : un ruban d'eau fin et courbe, lissé par une spline, avec un léger méandre. Il s'élargit avec le débit (nombre de cases en amont), ses bords sont plus clairs, et des reflets s'écoulent doucement à sa surface. Une petite chute tombe devant chaque paroi de terrasse. Les reflets restent immobiles si le système demande moins d'animations.
- **Régions** : teinte propre à chaque région climatique, sapins enneigés au nord, cactus et palmiers au sud.
- Pistes pour la suite : éventuellement des modèles glTF faits main dans le même style.

## Troisième passage

### Lot 1 : interface tablette
- **Barre de construction repliable** : sur tablette, elle est repliée par défaut en un bouton « Construire » (icône marteau) en bas à droite, à portée du pouce. La carte reste dégagée. Le bouton porte une étoile quand la capacité du profil est prête. Une fois ouverte, la barre se replie avec la flèche fixée en haut à droite, ou avec la touche **B**. Elle reste ouverte pendant la construction d'un bâtiment ou d'une route. Le choix est mémorisé. Sur ordinateur, elle est ouverte par défaut.
- **Barre du haut** : la recherche en cours s'affiche avec une fine barre de progression. Son nom passe dans l'infobulle quand la place manque. Les chiffres secondaires (+145, +19) sont plus gras et plus foncés.
- **Contraste** : le gris des textes secondaires (`--muted`) passe de `#7f7378` à `#6e6267`, pour un contraste d'au moins 4,5:1 sur les cartes et les pastilles.
- **Fenêtres** : l'en-tête (titre et bouton Fermer) reste fixé en haut pendant le défilement. Sur tablette, les fenêtres utilisent toute la hauteur visible (`100dvh`).
- **Diplomatie** : le formulaire d'échange de ressources est replié sous « Proposer un échange », comme les traités. Les fiches des rivaux sont nettement plus courtes.

### Lot 2 : écran d'accueil
- **Deux colonnes, sans défilement** sur iPad en paysage (1180×820 comme 1024×768) et sur ordinateur. À gauche, le titre, une accroche plus courte et les cinq profils en liste verticale (avatar, effets, bâtiment et capacité). À droite, la nouvelle partie.
- **Partie en cours** : quand une sauvegarde automatique existe, un encadré vert « Reprendre » s'affiche en tête de la colonne de droite.
- **Réglages** en grille de deux colonnes, avec des champs de 44 px de haut, faciles à toucher. La graine de carte passe dans « Options avancées ».
- **Bouton « Lancer la partie »** plus grand (54 px), avec la « marche » jouet. Il est toujours visible sans défiler.
- Les sauvegardes, les dernières parties et l'aide des commandes sont repliées dans des sections. L'aide clavier n'apparaît pas sur écran tactile.
- Sous 900 px de large, l'écran repasse sur une seule colonne.

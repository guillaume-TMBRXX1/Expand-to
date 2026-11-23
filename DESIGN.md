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
- Prochaines étapes : animations légères (fumée de cheminée, drapeaux, roues), variantes de bâtiments selon l'époque, et éventuellement des modèles glTF faits main dans le même style.

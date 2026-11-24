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
- Animations : les pièces animées sont marquées `anim(...)` dans `models.js` (types `spin`, `flag`, `bob`, `smoke`, `swing`, `slide`, `pulse`, `blink`). Elles restent à part du reste du modèle, mais chaque pièce est fusionnée dans son propre repère (`mergeKept`) : une pièce animée coûte un seul appel de dessin. Le renderer ne les anime que de près (caméra à moins de 26 unités, dans un rayon proportionnel au zoom), et jamais si `prefers-reduced-motion` est actif.
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

### Lot 3 : terrain et ambiance
- **Plateau de jeu** : la carte repose sur un socle d'argile crème `#e8ddd2` aux bords très arrondis, posé sur la table (`BG`). Le monde a désormais un vrai bord.
- **Brume lisse** : les cases inexplorées s'enfoncent juste sous la surface du plateau (hauteur 0,01, sous la surface à 0,05). L'inconnu est une étendue unie, sans quadrillage, et ces cases restent cliquables pour y envoyer une unité.
- **Plateaux plutôt que marches** : l'altitude des cases de terre est arrondie par paliers de 0,06. Des cases voisines partagent souvent la même hauteur, ce qui forme de vrais plateaux. Les cases sont un peu plus larges (0,985) et leurs joints plus fins.
- **Montagnes** : des pics arrondis (profil tourné à 16 côtés) remplacent les dômes. Il y a deux silhouettes, un pic avec ses contreforts ou deux sommets jumeaux, chacune avec quelques rochers au pied. Les sommets sont enneigés, et les montagnes du nord et la haute montagne sont presque entièrement blanches. Chaque pic tourne et change légèrement de taille selon sa case. Il y a 4 maillages instanciés en tout.
- **Sources de rivière** : chaque rivière naît dans un petit bassin bleu cerclé de galets, adossé à des rochers moussus et orienté vers l'aval. Le ruban d'eau part fin du bassin, puis s'élargit avec le débit. Le décor de la case (rochers, sapins) s'efface autour. Quand une ressource rare occupe le centre de la case, le bassin glisse vers l'aval. Tous les bassins sont dessinés en un seul maillage instancié.
- **Frontières** : le liseré est plus épais (0,1) et arrondi, et le voile du territoire un peu plus marqué (opacité 0,17).
- **Coût** : sur la grande carte avec 8 joueurs (graine 777, tour 40, vue de loin), on compte 3 946 appels de dessin contre 3 931 avant, soit +0,4 %, et +3 % de triangles.

### Lot 4a : bâtiments retravaillés et animations
- **Une époque qui avance** : les premiers bâtiments sont rustiques (bois, pierre, tuiles), les bâtiments avancés plus modernes (hôpital à bandeaux vitrés, port à conteneurs). Les maisons des villes suivent le palier : des chaumières à colombages au départ, des maisons de bourg à étage avec les Artisans, puis de petits immeubles à toit-terrasse avec balcons à la couleur du joueur avec les Savants. Une seule cheminée fume par ville.
- **Bâtiments refaits** :
  - Carrière : une colline herbue entaillée en gradins striés, un derrick en bois dont la charge monte et descend, un wagonnet sur rails et des blocs sur palette.
  - Forge : une bâtisse de pierre au toit d'ardoise et une grande cheminée de briques. Sous un appentis, un foyer garde ses braises rougeoyantes. Autour, une enclume, un marteau, un tonneau, du charbon et des fers à cheval.
  - Comptoir d'épices : un souk avec une bâtisse en terre crue, un toit crénelé et une coupole turquoise. Devant, trois étals à auvents rayés portent des cônes d'épices, avec un tapis et des sacs ouverts.
  - Comptoir de cristal : une boutique de diamantaire à la flamande. Maison de brique étroite à pignon à gradins, devanture vert sombre, vitrine de pierres sur velours, enseigne dorée et gros cristal suspendu qui se balance.
  - Amphithéâtre : une arène ovale (profil tourné) à deux rangs d'arcades, des gradins soulignés de violet, une piste de sable, une porte d'honneur et des oriflammes.
  - Atelier des maîtres : une halle à colombages et une grue à roue de carrier, dont la roue tourne et la charge se balance. Autour, des blocs taillés, des poutres et une table à dessin avec un plan bleu.
  - Navire marchand : un cargo arrondi, coque bleue sur carène rouge, caisses en cale, passerelle blanche et cheminée fumante à la couleur du joueur.
- **D'après les références** :
  - Hôpital : blocs blancs à bandeaux vitrés, tour avec une grande croix rouge, auvent d'entrée, jardins et ventilateur sur le toit.
  - Scierie : cabane rouge au toit de planches bleu, poulie au pignon et crochet qui se balance, grumes, charrette, établi et scie circulaire.
  - Théâtre : façade art déco rose, enseigne verticale et marquise dont les ampoules clignotent.
  - Port : quai de béton et bassin, conteneurs, cuves, portique dont le chariot va et vient, cargo à quai.
- **Animations sur tous les modèles** :
  - Des fanions sur le marché, la bibliothèque, la halle, l'aqueduc, les quartiers et la Grande Bibliothèque.
  - D'autres mouvements selon le bâtiment : l'orbe du monument flotte, la tourelle de l'observatoire pivote, la pièce de la Grande Bourse tourne, la lunette de l'Académie et le globe du Relais tournent, un canard flotte au parc et l'eau de la fontaine du quartier marchand ondule.
- **Coût** : sur la grande carte avec 8 joueurs (graine 777, tour 40, vue de loin), on passe de 3 957 à 3 795 appels de dessin (−4 %, grâce à la fusion des pièces animées), mais les triangles augmentent de 18 % (5,5 M). Le lot 4b s'attaquera aux triangles.
- **Retouches après essai** : les toits des maisons sont plus bas et débordent moins (maisons de ville, hôtel de ville, cottage générique). Les fenêtres sont plus petites, avec un cadre plus fin. Le théâtre n'a plus ses deux hublots.
- **Galerie** : `gallery.html?only=forge,carrière` n'affiche que les modèles demandés, en grand (par clé ou par nom).

### Lot 4b : villes, unités, galerie et performances
- **Les villes grandissent visiblement** : l'enceinte suit la population.
  - Population 3 : une palissade de pieux taillés, qui devient un muret de pierre crénelé à partir des Artisans (pierre claire avec les Savants).
  - Population 5 : quatre tours d'angle coiffées d'un toit à la couleur du joueur.
  - Population 7 : une porte fortifiée encadrée de deux tours.
  - L'avant reste ouvert au milieu pour la porte. Le modèle est reconstruit jusqu'à la population 8.
- **Unités plus visibles** : elles sont 30 % plus grandes et posées sur un socle arrondi à la couleur du joueur, avec un liseré blanc (le navire flotte sans socle). Un anneau blanc les entoure tant qu'une de nos unités peut encore se déplacer ce tour.
- **Galerie** : le nombre de colonnes s'adapte à l'écran et les rangées sont plus espacées, si bien que les noms ne chevauchent plus les modèles sur iPad. Les animations y tournent aussi, sauf si le système demande moins d'animations. Le code d'animation est partagé entre le jeu et la galerie (`prepareAnims`, `animateParts` dans `models.js`).
- **Performances** :
  - Les pièces très fines (vitres, liserés, planches, moins de 0,016) deviennent des boîtes simples de 12 triangles au lieu de 108.
  - Sphères, cylindres, dômes et anneaux ont moins de facettes selon leur taille.
  - Les cases n'ont plus qu'un segment d'arrondi.
  - Les arbres sont plus légers et l'écume est faite de simples boîtes.
  - La fumée est masquée en vue d'ensemble, là où elle ne s'anime plus.
  - Mesure stable sur la grande carte avec 8 joueurs (graine 777, tour 40, vue de loin, après la fin des effets) : `main` en est à 2 248 appels de dessin et 4,5 M de triangles, cette version à 1 560 appels (−31 %) et 2,9 M de triangles (−36 %).

## Quatrième passage

### Lot 5 : villageois
- **Des mini-figurines « toy »** (`web/src/render/villagers.js`) : grosse tête, chapeau, bras qui balancent et petite ombre au sol. La tenue dépend du métier :
  - bûcheron : chemise rouge, hache ;
  - fermier : salopette bleue, chapeau de paille ;
  - ouvrier : gilet orange, casque jaune ;
  - docker : chapeau à la couleur du joueur et caisse sur l'épaule ;
  - touriste : chemise pastel, chapeau blanc, sac à dos ;
  - banquier : costume sombre, chapeau melon, mallette ;
  - habitant : chapeau à la couleur du joueur.
- **Qui va où** : les travailleurs font la navette dans la cour de leur bâtiment (scierie, ferme, moulin, carrière, forge, menuiserie, manufacture, atelier, port, phare, marché, halle, bourse, guildes). Les touristes partent de la ville la plus proche pour visiter bibliothèques, théâtres, parcs, merveilles et quartiers. Les habitants se promènent dans la ville ou vont vers un bâtiment voisin. Les banquiers font l'aller-retour entre la bourse et la ville.
- **Lisibles et sans collision** : les trajets longent l'avant du socle, côté caméra, si bien que les figurines ne traversent pas les bâtiments. Elles montent sur les socles et ne marchent jamais sur l'eau.
- **Densité « vivante »** : une à deux figurines par bâtiment et deux à cinq par ville, selon la population et le palier. Les figurines des autres joueurs n'apparaissent que sur les cases vues.
- **Krach boursier** : pendant la phase `crash` du marché mondial, trois traders par bourse, halle, quartier marchand et maison des guildes courent en tous sens, trois fois plus vite, bras levés. Hors krach, un seul discute devant.
- **Coût** : toute la population tient en 6 maillages instanciés, soit 6 appels de dessin. Seules les figurines proches du point visé sont calculées (0,2 ms par image pour 143 figurines dans le navigateur de test). Tout disparaît en vue d'ensemble, comme les animations. Avec « Réduire les animations », les figurines restent immobiles à leur poste.

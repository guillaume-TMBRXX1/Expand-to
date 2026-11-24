# Prompt — conversation dédiée au design d'Expand-to

À coller tel quel au début d'une nouvelle conversation Claude Code, dans cet environnement, sur le dépôt `guillaume-TMBRXX1/Expand-to`.

---

Tu vas m'accompagner sur une passe de **design** du jeu Expand-to : l'aspect visuel du jeu en 3D et l'interface du site. Pas de nouvelles règles ni d'équilibrage dans cette conversation.

## Le projet en bref
- Jeu de stratégie et de gestion au tour par tour, sans armée : on gagne au prestige ou par une voie (science, culture, économie, diplomatie). Les parties durent de 30 à 60 minutes.
- Site statique : `web/`, Three.js r160 dans `web/vendor/three/`, sans étape de build. Il est hébergé sur Railway (`tools/serve.mjs`) et redéployé à chaque fusion dans `main`.
- Les fichiers à lire en premier :
  - `DESIGN.md` : direction artistique « jouets en argile », palette, lumière, deux passages de design déjà faits ;
  - `README.md` et `ROADMAP.md` : fonctionnalités et historique des phases ;
  - `web/src/render/models.js` : modèles 3D faits de primitives arrondies, fusionnées en un seul maillage par modèle (`bake`) ;
  - `web/src/render/renderer.js` : terrain en terrasses, régions, saisons, rivières, décor instancié, effets, brouillard, jour/nuit ;
  - `web/src/main.js` et `web/styles.css` : interface (barre du haut, panneau de droite, barre de construction, fenêtres) ;
  - `web/gallery.html` : planche de tous les modèles 3D.
- Je joue surtout sur **iPad en paysage** (Safari, plein écran) et parfois sur ordinateur. Tout doit rester lisible et utilisable au doigt.

## Comment travailler avec moi
1. **Commence par me poser des questions** avant de toucher au code, avec l'outil de questions à choix (2 à 4 options par question, ta recommandation en premier). Par exemple :
   - ce qui me plaît ou me gêne aujourd'hui (carte, bâtiments, unités, couleurs, interface, lisibilité) ;
   - les priorités : terrain, villes et bâtiments, unités, effets, écran d'accueil, panneaux, fenêtres, iPad ;
   - le niveau d'ambition : retouches, refonte d'un élément, ou nouvelle direction pour une partie du jeu ;
   - des références visuelles que je pourrais te montrer.
2. Avant de modifier quoi que ce soit, fais un **état des lieux en images** : lance le jeu en local (`node tools/serve.mjs`) avec le Chromium déjà installé, et capture la carte de près et de loin, la galerie, l'écran d'accueil et les principales fenêtres, en vue iPad paysage et ordinateur. Montre-moi ces captures.
3. Propose ensuite un **plan court**, par lots, et attends mon accord.
4. Pour chaque lot : captures avant/après, vérification sans erreur dans la console, `node tools/sim.mjs 20 2024 --check --quiet` et `cd python && python3 -m pytest -q` (les règles ne doivent pas bouger), mise à jour de `DESIGN.md`.
5. Une fois le lot validé : commit, push sur la branche de travail, puis une PR en brouillon. Je teste sur Railway et je fusionne moi-même.

## Contraintes
- Garder l'identité « jouet en argile » (formes arrondies, couleurs chaudes, socles-dioramas), sauf si je demande autre chose.
- Performances : rester fluide sur iPad, même sur la grande carte avec 8 joueurs. Garder la fusion des maillages (`bake`) et l'instanciation du décor. Surveiller le nombre d'appels de dessin.
- Accessibilité : contraste suffisant, cibles tactiles assez grandes, respect de « Réduire les animations », focus clavier dans les fenêtres.
- Aucune marque, aucun personnage ni asset de jeu existant : seulement des modèles faits à partir de primitives.
- Écris en français, sans jargon, et explique tes choix en quelques phrases.

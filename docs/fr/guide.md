# Guide de Mindrop

Mindrop est un second cerveau qui vit dans ton navigateur. Il garde les pages, les liens, les notes, les citations, les images et les vidéos qui comptent pour toi, et te laisse les relier par des #tags et des liens `[[titre]]`, puis les parcourir en mosaïque ou en carte mentale.

Tout est stocké **localement** dans ton navigateur : pas de compte, pas de serveur, rien n'est envoyé sur Internet.

## Installation

Mindrop fonctionne dans les navigateurs basés sur Chromium : Chrome, Brave, Edge, Chromium, Vivaldi. Il n'est pas (encore) publié sur le Chrome Web Store : on l'installe depuis son dossier.

1. Récupère le dossier de l'extension depuis GitHub : bouton **Code**, puis **Download ZIP** (et dézippe-le), ou `git clone` du dépôt. Range-le à un endroit où il restera : le navigateur le lit à chaque démarrage.
2. Ouvre `chrome://extensions` (ou `brave://extensions`, `edge://extensions`).
3. Active le **Mode développeur** (en haut à droite).
4. Clique sur **Charger l'extension non empaquetée** et choisis le dossier de l'extension (celui qui contient `manifest.json`).
5. Épingle l'icône orange dans la barre d'outils (icône puzzle, puis épingle).

Pour mettre à jour : remplace le contenu du dossier par la nouvelle version (ou `git pull`), puis clique sur le bouton de rechargement de Mindrop dans la page des extensions. Tes souvenirs restent.

## Enregistrer

| Comment | Ce que ça fait |
|---|---|
| Clic sur l'icône, ou `Alt+Shift+S` | Fenêtre avec l'aperçu de la page, son titre, une note perso et des #tags. L'onglet **Note** sert à écrire une pensée rapide. |
| `Alt+Shift+D` | Enregistre la page en cours tout de suite, sans fenêtre (un ✓ s'affiche sur l'icône). |
| Clic droit sur un texte sélectionné | « Enregistrer la sélection comme citation ». |
| Clic droit sur un lien ou une image | « Enregistrer ce lien », « Enregistrer cette image ». |
| Texte sélectionné, puis clic sur l'icône | Propose de garder la sélection comme citation. |

À l'enregistrement d'une page, Mindrop garde aussi son **texte principal** (l'article, sans les menus), pour pouvoir le retrouver par la recherche. Pour une vidéo YouTube, il récupère le vrai titre, la chaîne et la miniature.

## La page Mindrop

Ouvre-la avec `Alt+Shift+M`, le lien « Ouvrir Mindrop » de la fenêtre, ou un clic droit sur l'icône.

- **Mosaïque** de tous tes souvenirs : captures des pages, notes colorées, citations, images, vidéos.
- **Index** dans la marge gauche : filtres par type (liens, notes, citations, images, vidéos, épinglés) et par tag, avec le nombre de souvenirs de chacun.
- **Recherche** instantanée (touche `/`). Elle ignore les accents et la casse, et elle est tolérante : un mot trouve aussi ses pluriels et ses variantes (« méthodes » trouve « methods », « typographie » trouve « Typography »), et les mots à une ou deux lettres près. Elle porte aussi sur le texte des pages. `#design` filtre par tag.
- **Fiche détaillée** au clic : titre, note, tags, couleur, épingler, supprimer, et le texte de la page gardé à l'enregistrement.
- **Écrire directement** une idée dans la zone du haut (`Ctrl+Entrée` pour garder) ; coller une adresse l'enregistre comme lien.
- **Glisser-déposer** ou **coller** (`Ctrl+V`) une image, un lien ou un texte sur la page.
- **Redécouvrir** ressort un souvenir au hasard.
- **Exporter et Importer** : une sauvegarde JSON, utile aussi pour passer d'un navigateur à l'autre.

## Notes en Markdown

Les notes s'écrivent en Markdown : `# titre`, `**gras**`, `*italique*`, `~~barré~~`, `` `code` ``, listes (`-`, `1.`), cases à cocher (`- [ ] tâche`), citations (`>`), blocs de code et liens `[texte](https://…)`.

- Les cases se cochent directement sur la carte de la mosaïque.
- Dans la fiche d'une note, deux onglets : **Écrire** et **Aperçu** (`Ctrl+E` pour passer de l'un à l'autre, double-clic sur l'aperçu pour écrire).
- Les notes perso des liens et des images sont aussi affichées en Markdown.

## Relier : tags et liens

- **Tags** : en tapant dans un champ de tags (popup, zone d'écriture, fiche), les tags déjà utilisés sont proposés, les plus fréquents d'abord. Flèches pour choisir, Entrée ou Tab pour valider, Échap pour fermer.
- **Liens entre souvenirs** : écris `[[Titre]]`, ou `[[Titre|texte affiché]]`, dans une note ou une note perso pour citer un autre souvenir. Le titre d'une note est sa première ligne ; accents et majuscules n'ont pas d'importance.
  - Taper `[[` propose les titres existants.
  - Un lien s'ouvre d'un clic. Un lien vers un titre qui n'existe pas encore est souligné en pointillés : un clic crée la note.
  - La fiche montre **Renvoie vers** et **Cité par**.

## Carte mentale

Le bouton **Carte mentale** montre tes souvenirs autour de leurs tags.

- Chaque #tag est une bulle reliée à « Mindrop » ; les pointillés relient les tags qui partagent des souvenirs.
- En zoomant (molette, pavé tactile, boutons + et −), les souvenirs apparaissent autour de leur premier tag, avec un fil vers chacun de leurs autres tags.
- Les liens `[[titre]]` entre souvenirs sont tracés en orange.
- Un clic sur un tag zoome dessus ; glisser un tag le déplace (sa position est retenue). **Réorganiser** propose une nouvelle disposition, **Tout voir** (ou la touche 0) recadre l'ensemble.
- Survoler un tag ou une carte met ses liens en évidence.

## Pont local : agent IA et sauvegardes

Le dossier `mcp/` installe un pont entre l'extension et ton ordinateur, sans passer par Internet. Il apporte :

- la **sauvegarde automatique** de tous tes souvenirs, images comprises, sur ton disque, avec restauration depuis la page Mindrop ;
- un **serveur MCP**, pour qu'un agent IA (Claude Code, pi ou tout client MCP) cherche dans Mindrop, en lecture seule, avec un interrupteur pour couper l'accès.

Installation et utilisation : voir le guide **[Pont local](pont-local.md)**.

## Bon à savoir

- Si un raccourci ne marche pas, il est sans doute déjà pris par le navigateur : choisis-en un autre dans `chrome://extensions/shortcuts`.
- Les pages internes du navigateur (`chrome://`, Web Store) ne peuvent pas être capturées : l'onglet Note reste disponible.
- Désinstaller l'extension efface ses données : exporte d'abord, ou installe le pont local pour avoir des sauvegardes automatiques sur ton disque.
- Pour les fichiers locaux (`file://`), active « Autoriser l'accès aux URL de fichier » dans les détails de l'extension.
- Les polices sont incluses dans `fonts/` : rien n'est chargé depuis Internet.

## Développement

Mindrop n'a aucune dépendance. Les tests demandent Node 22 ou plus, et un navigateur Chromium pour les tests navigateur (variable `CHROME_PATH` s'il n'est pas trouvé tout seul) :

```sh
npm test               # tout
npm run test:node      # recherche, liens, pont local, serveur MCP
npm run test:browser   # stockage IndexedDB, rendu Markdown, sauvegarde, suggestions
npm run site           # régénère le site de documentation (dossier docs/)
```

## Licence

Mindrop est un logiciel libre, distribué sous la **GNU Affero General Public License, version 3 ou toute version ultérieure** (AGPL-3.0-or-later) : voir le fichier [LICENSE](../../LICENSE).
Tu peux l'utiliser, l'étudier, le modifier et le redistribuer ; toute version modifiée que tu distribues, ou que tu proposes à d'autres à travers un réseau, doit rester sous la même licence, avec son code source.

Les polices incluses dans `fonts/` gardent leur propre licence, la SIL Open Font License 1.1 : Hanken Grotesk ([OFL-HankenGrotesk.txt](../../fonts/OFL-HankenGrotesk.txt)), Newsreader ([OFL-Newsreader.txt](../../fonts/OFL-Newsreader.txt)) et IBM Plex Mono ([OFL-IBMPlexMono.txt](../../fonts/OFL-IBMPlexMono.txt)).

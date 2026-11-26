# Guide de Mindrop

Mindrop est un second cerveau qui vit dans ton navigateur. Il garde les pages, les liens, les notes, les citations, les images et les vidéos qui comptent pour toi, et te laisse les relier par des #tags et des liens `[[titre]]`, puis les parcourir en mosaïque ou en carte mentale.

Tout est stocké **localement** dans ton navigateur : pas de compte, pas de serveur, rien n'est envoyé sur Internet. Seule exception, si tu l'actives : la [synchronisation](synchronisation.md) avec ton propre serveur WebDAV.

## Installation

Mindrop fonctionne dans les navigateurs basés sur Chromium : Chrome, Brave, Edge, Chromium, Vivaldi. Il n'est pas (encore) publié sur le Chrome Web Store : on l'installe depuis son dossier.

1. Télécharge **[mindrop.zip](https://github.com/Padiwa/Mindrop/releases/latest/download/mindrop.zip)**, la dernière version (toutes les versions sont sur la page [Releases](https://github.com/Padiwa/Mindrop/releases)), et dézippe-le. Range le dossier `mindrop` à un endroit où il restera : le navigateur le lit à chaque démarrage.
2. Ouvre `chrome://extensions` (ou `brave://extensions`, `edge://extensions`).
3. Active le **Mode développeur** (en haut à droite).
4. Clique sur **Charger l'extension non empaquetée** et choisis le dossier `mindrop` (celui qui contient `manifest.json`).
5. Épingle l'icône orange dans la barre d'outils (icône puzzle, puis épingle).

Pour mettre à jour : remplace le contenu du dossier par celui du nouveau zip, puis clique sur le bouton de rechargement de Mindrop dans la page des extensions. Tes souvenirs restent.

Tu peux aussi faire un `git clone` du dépôt et charger son dossier : la mise à jour se fait alors avec `git pull`.

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

## Langue

Mindrop parle français et anglais. Par défaut, il suit ton navigateur : français si le navigateur est en français, anglais sinon. Pour choisir : page Mindrop, **Réglages** dans la colonne de gauche, **Langue** : Automatique, Français ou English. Le choix vaut pour toute l'extension (page, popup, menu contextuel) ; tes notes, elles, ne sont jamais traduites.

Le nom et la description de l'extension dans la page des extensions suivent toujours la langue du navigateur : Chrome ne permet pas à une extension de les changer.

## Pont local : agent IA et sauvegardes

Le dossier `mcp/` installe un pont entre l'extension et ton ordinateur, sans passer par Internet. Il apporte :

- la **sauvegarde automatique** de tous tes souvenirs, images comprises, sur ton disque, avec restauration depuis la page Mindrop ;
- un **serveur MCP**, pour qu'un agent IA (Claude Code, pi ou tout client MCP) cherche dans Mindrop, en lecture seule, avec un interrupteur pour couper l'accès.

Installation et utilisation : voir le guide **[Pont local](pont-local.md)**.

## Synchronisation entre ordinateurs

Pour retrouver les mêmes souvenirs sur plusieurs ordinateurs, connecte Mindrop à un serveur **WebDAV** (Nextcloud, ownCloud, un NAS…) : page Mindrop, **Réglages**, **Synchronisation**. Elle est désactivée par défaut, ne demande rien à installer, et peut être chiffrée de bout en bout par une phrase de passe.

Mise en place, fonctionnement et confidentialité : voir le guide **[Synchronisation](synchronisation.md)**.

## Bon à savoir

- Si un raccourci ne marche pas, il est sans doute déjà pris par le navigateur : choisis-en un autre dans `chrome://extensions/shortcuts`.
- Les pages internes du navigateur (`chrome://`, Web Store) ne peuvent pas être capturées : l'onglet Note reste disponible.
- Désinstaller l'extension efface ses données : exporte d'abord, installe le pont local pour avoir des sauvegardes automatiques sur ton disque, ou active la synchronisation pour en garder une copie sur ton serveur.
- Pour les fichiers locaux (`file://`), active « Autoriser l'accès aux URL de fichier » dans les détails de l'extension.
- Les polices sont incluses dans `fonts/` : rien n'est chargé depuis Internet.

## Développement

L'extension n'a aucune dépendance ni étape de compilation : le dossier du dépôt se charge tel quel. Le code est en JavaScript, vérifié par TypeScript grâce à des commentaires JSDoc ; les types partagés sont dans `types.d.ts`. TypeScript n'est qu'un outil de développement, jamais embarqué dans l'extension.

Le développement demande Node 22 ou plus, et un navigateur Chromium pour les tests navigateur (variable `CHROME_PATH` s'il n'est pas trouvé tout seul) :

```sh
npm install            # TypeScript et les types Chrome et Node, pour la vérification de types
npm test               # tout : types, tests Node, tests navigateur
npm run typecheck      # les types seulement
npm run test:node      # recherche, liens, synchronisation, pont local, serveur MCP, le zip
npm run test:browser   # stockage IndexedDB, rendu Markdown, sauvegarde, suggestions
npm run pack           # fabrique dist/mindrop.zip, l'extension à distribuer
npm run site           # régénère le site de documentation (dossier docs/)
```

**Publier une version :** augmente `version` dans `manifest.json` et `package.json`, commite, puis pousse le tag correspondant : `git tag v1.8.0 && git push origin v1.8.0`. Une GitHub Action lance les tests, fabrique le zip et publie la release ; le bouton de téléchargement du site pointe toujours vers la dernière.

## Licence

Mindrop est un logiciel libre, distribué sous la **GNU Affero General Public License, version 3 ou toute version ultérieure** (AGPL-3.0-or-later) : voir le fichier [LICENSE](../../LICENSE).
Tu peux l'utiliser, l'étudier, le modifier et le redistribuer ; toute version modifiée que tu distribues, ou que tu proposes à d'autres à travers un réseau, doit rester sous la même licence, avec son code source.

Les polices incluses dans `fonts/` gardent leur propre licence, la SIL Open Font License 1.1 : Hanken Grotesk ([OFL-HankenGrotesk.txt](../../fonts/OFL-HankenGrotesk.txt)), Newsreader ([OFL-Newsreader.txt](../../fonts/OFL-Newsreader.txt)) et IBM Plex Mono ([OFL-IBMPlexMono.txt](../../fonts/OFL-IBMPlexMono.txt)).

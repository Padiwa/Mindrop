# Second Cerveau : extension Chrome / Brave

Garde tout ce qui compte (pages, liens, notes, citations, images) dans une mosaïque visuelle, à la manière de mymind.
Tout est stocké **localement** dans ton navigateur : pas de compte, pas de serveur.

## Installation (Chrome ou Brave)

1. Dézippe le dossier `second-cerveau` quelque part où il restera (ne le supprime pas ensuite).
2. Ouvre `chrome://extensions` (Chrome) ou `brave://extensions` (Brave).
3. Active le **Mode développeur** (en haut à droite).
4. Clique sur **Charger l'extension non empaquetée** et choisis le dossier `second-cerveau`.
5. Épingle l'icône orange dans la barre d'outils (icône puzzle → épingle).

## Enregistrer

| Comment | Ce que ça fait |
|---|---|
| Clic sur l'icône (ou `Alt+Shift+S`) | Fenêtre avec aperçu de la page, titre, note perso et #tags. Onglet **Note** pour écrire une pensée rapide. |
| `Alt+Shift+D` | Enregistre la page en cours instantanément, sans fenêtre (un ✓ s'affiche sur l'icône). |
| Clic droit sur un texte sélectionné | « Enregistrer la sélection comme citation » |
| Clic droit sur un lien / une image | « Enregistrer ce lien » / « Enregistrer cette image » |
| Texte sélectionné + clic sur l'icône | Propose de garder la sélection comme citation |

## Visualiser : la page « cerveau »

Ouvre-la avec `Alt+Shift+M`, le lien « Ouvrir mon cerveau » de la fenêtre, ou un clic droit sur l'icône.

- **Mosaïque** de tous tes souvenirs : captures des pages, notes colorées, citations, images, vidéos YouTube.
- **Recherche** instantanée (touche `/`), insensible aux accents ; `#design` filtre par tag.
- **Vidéos YouTube** : titre, chaîne et miniature sont récupérés auprès de YouTube, y compris pour un lien enregistré par clic droit ou collé dans la page. Les vidéos enregistrées avant la version 1.5 avec le titre « YouTube » sont réparées à la mise à jour (un titre que tu as modifié n'est jamais remplacé).
- **Index** dans la marge gauche : filtres par type (liens, notes, citations, images, vidéos, épinglés) et par tag, avec le nombre de souvenirs de chacun.
- **Carte mentale** (bouton « Carte mentale ») : chaque #tag est une bulle reliée à « Mon cerveau ».
  Les pointillés relient les tags qui partagent des souvenirs. Zoome (molette, pavé tactile ou +/−) :
  les souvenirs apparaissent autour de leur premier tag, avec un fil vers chacun de leurs autres tags.
  Clic sur un tag = zoom dessus ; glisser un tag = le déplacer (sa position est retenue) ; bouton « Réorganiser » = nouvelle disposition ;
  bouton « Tout voir » ou touche 0 = tout voir. Survoler un tag ou une carte met ses liens en évidence.
- **Notes en Markdown** : `# titre`, `**gras**`, `*italique*`, `~~barré~~`, `` `code` ``, listes (`-`, `1.`), cases à cocher (`- [ ] tâche`),
  citations (`>`), blocs de code et liens `[texte](https://…)`. Les cases se cochent directement sur la carte.
  Dans la fiche d'une note, onglets **Écrire / Aperçu** (`Ctrl+E` pour basculer, double-clic sur l'aperçu pour écrire).
  Les notes perso des liens et images sont aussi rendues en Markdown sur les cartes.
- **Fiche détaillée** au clic : modifier le titre, la note, les tags, la couleur, épingler, supprimer.
- **Écrire directement** une idée dans la barre en haut ; coller une URL l'enregistre comme lien.
- **Glisser-déposer** ou **coller** (`Ctrl+V`) une image, un lien ou un texte sur la page.
- **Redécouvrir** ressort un souvenir au hasard.
- **Exporter / Importer** : sauvegarde JSON, à faire de temps en temps (et pour passer d'un navigateur à l'autre).

## Bon à savoir

- Si un raccourci ne marche pas, c'est souvent qu'il est déjà pris par le navigateur : choisis-en un autre dans la page des raccourcis.
- Les raccourcis se modifient dans `chrome://extensions/shortcuts` (ou `brave://extensions/shortcuts`).
- Les pages internes du navigateur (`chrome://`, Web Store) ne peuvent pas être capturées : l'onglet Note reste disponible.
- Les souvenirs sont rangés dans la base IndexedDB de l'extension, un par un : deux enregistrements simultanés ne peuvent plus s'écraser.
  Depuis la version 1.2, les souvenirs de l'ancien stockage y sont copiés au premier lancement ; l'ancien stockage est conservé tel quel, en secours.
- Désinstaller l'extension efface ses données : exporte d'abord, ou installe le pont local pour avoir des sauvegardes automatiques sur ton disque.
- Les polices (Hanken Grotesk, Newsreader, IBM Plex Mono, licence SIL OFL) sont incluses dans `fonts/` : rien n'est chargé depuis Internet.
- Pour les fichiers locaux (`file://`), active « Autoriser l'accès aux URL de fichier » dans les détails de l'extension.

## Pont local : agent IA et sauvegarde automatique

Le dossier `mcp/` installe un pont entre l'extension et ton ordinateur, sans passer par Internet. Il apporte :

- la **sauvegarde automatique** de tous tes souvenirs, images comprises, sur ton disque (30 derniers jours), avec restauration depuis la page cerveau ;
- un **serveur MCP** pour qu'un agent IA (Claude Code ou tout client MCP) cherche dans ton second cerveau, en lecture seule.

Installation, utilisation, restauration, dépannage : voir **[MCP.md](MCP.md)**.

## Tests

Node 22 ou plus, et un navigateur Chromium pour les tests navigateur (`CHROME_PATH` s'il n'est pas trouvé tout seul) :

```sh
npm test               # tout
npm run test:node      # recherche MCP, pont local, Markdown (texte brut)
npm run test:browser   # stockage IndexedDB, rendu Markdown, sauvegarde et restauration
```

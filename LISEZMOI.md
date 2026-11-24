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
- **Filtres** par type (liens, notes, citations, images, vidéos, épinglés) et par tag.
- **Carte mentale** (bouton « ◎ Carte mentale ») : chaque #tag est une bulle reliée à « Mon cerveau ».
  Les pointillés relient les tags qui partagent des souvenirs. Zoome (molette, pavé tactile ou +/−) :
  les souvenirs apparaissent autour de leur premier tag, avec un fil vers chacun de leurs autres tags.
  Clic sur un tag = zoom dessus ; glisser un tag = le déplacer (sa position est retenue) ; ↻ = réorganiser ;
  ⤢ ou touche 0 = tout voir. Survoler un tag ou une carte met ses liens en évidence.
- **Fiche détaillée** au clic : modifier le titre, la note, les tags, la couleur, épingler, supprimer.
- **Écrire directement** une idée dans la barre en haut ; coller une URL l'enregistre comme lien.
- **Glisser-déposer** ou **coller** (`Ctrl+V`) une image, un lien ou un texte sur la page.
- **✦ Redécouvrir** ressort un souvenir au hasard.
- **Exporter / Importer** : sauvegarde JSON, à faire de temps en temps (et pour passer d'un navigateur à l'autre).

## Bon à savoir

- Si un raccourci ne marche pas, c'est souvent qu'il est déjà pris par le navigateur : choisis-en un autre dans la page des raccourcis.
- Les raccourcis se modifient dans `chrome://extensions/shortcuts` (ou `brave://extensions/shortcuts`).
- Les pages internes du navigateur (`chrome://`, Web Store) ne peuvent pas être capturées : l'onglet Note reste disponible.
- Désinstaller l'extension efface ses données : exporte d'abord.
- Pour les fichiers locaux (`file://`), active « Autoriser l'accès aux URL de fichier » dans les détails de l'extension.

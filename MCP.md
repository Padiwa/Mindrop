# Pont local : agent IA (MCP) et sauvegarde automatique

Le pont local relie l'extension à ton ordinateur. Une fois installé (une seule fois, voir « Installation »), il apporte deux choses :

- **un serveur MCP** : un agent IA (Claude Code ou tout client MCP) peut **chercher dans ton second cerveau**, en **lecture seule** ;
- **la sauvegarde automatique** : une copie complète, images comprises, écrite sur ton disque après chaque changement.

Rien ne passe par Internet.

## Comment ça marche

Un programme extérieur au navigateur ne peut pas lire les données d'une extension. Un pont fait donc le lien :

```
Extension  ──(native messaging)──▶  mcp/host.mjs  ──écrit──▶  brain.json  ◀──lit──  mcp/server.mjs  ◀──MCP──  Agent
```

1. À chaque ajout, modification ou suppression, l'extension envoie une copie de tes souvenirs à `mcp/host.mjs`.
   Elle passe par le « native messaging », le mécanisme officiel de Chrome pour parler à un programme local : **rien ne passe par le réseau**.
2. `host.mjs` écrit cette copie dans un fichier lisible par toi seul :
   - Linux : `~/.local/share/second-cerveau/brain.json`
   - macOS : `~/Library/Application Support/second-cerveau/brain.json`
3. Quand l'agent appelle un outil, `mcp/server.mjs` lit ce fichier. Il le relit dès qu'il a changé.

Les images enregistrées directement dans l'extension (captures, images déposées) ne sont pas copiées, seulement les liens web vers des images.

## Prérequis

- **Node.js 18 ou plus** (`node --version`).
- Un navigateur Chromium : Chrome, Chromium, Brave, Edge ou Vivaldi.
- **Linux ou macOS.** Sous Windows, l'hôte natif s'enregistre dans le registre, ce que le script d'installation ne fait pas.
- L'extension Second Cerveau chargée dans le navigateur (voir `LISEZMOI.md`).

## Installation

### 1. Récupérer l'id de l'extension

Ouvre `chrome://extensions` (ou `brave://extensions`, `edge://extensions`) et active le **Mode développeur**.
L'id est la suite de 32 lettres affichée sous le nom de l'extension, par exemple `abcdefghijklmnopabcdefghijklmnop`.

L'id d'une extension chargée « non empaquetée » dépend de son dossier : si tu déplaces le dossier, l'id change. Il faut alors refaire cette installation, et tes données ne suivent pas : exporte-les d'abord.

### 2. Enregistrer le pont

Depuis le dossier du projet :

```sh
node mcp/install.mjs <id-de-l-extension>
```

Le script :
- crée un petit lanceur `host.sh` à côté du fichier de données, avec le chemin complet de ton Node (le navigateur lance les programmes avec un `PATH` réduit) ;
- enregistre le pont pour chaque navigateur trouvé, dans son dossier `NativeMessagingHosts`, en n'autorisant que ton extension ;
- affiche la commande exacte à utiliser à l'étape 4.

### 3. Recharger l'extension

Dans la page des extensions, clique sur le bouton de rechargement de Second Cerveau. Accepte la nouvelle permission « communiquer avec des applications natives » si le navigateur la demande.

La première copie part tout de suite. Vérifie qu'elle est arrivée :

```sh
ls -l ~/.local/share/second-cerveau/brain.json
```

### 4. Brancher le serveur sur ton agent

**Claude Code :**

```sh
claude mcp add second-cerveau -- node /chemin/vers/second-cerveau/mcp/server.mjs
```

Ajoute `--scope user` pour qu'il soit disponible dans tous tes projets, pas seulement dans le dossier courant. Vérifie avec `claude mcp list`, ou `/mcp` dans une session.

**Autre client MCP** (Claude Desktop, Cursor…) : déclare un serveur stdio dans sa configuration :

```json
{
  "mcpServers": {
    "second-cerveau": {
      "command": "node",
      "args": ["/chemin/vers/second-cerveau/mcp/server.mjs"]
    }
  }
}
```

Si le client ne trouve pas `node`, mets son chemin complet dans `command` (donné par `which node`).

## Utilisation

Demande simplement à l'agent, par exemple :

- « Cherche dans mon second cerveau ce que j'ai gardé sur la typographie. »
- « Quels sont mes tags principaux, et comment sont-ils liés ? »
- « Retrouve la citation de Luhmann et montre-moi les souvenirs proches. »
- « Résume les liens que j'ai enregistrés ce mois-ci avec le tag #design. »

### Outils exposés

| Outil | Ce qu'il fait | Paramètres |
|---|---|---|
| `search_memories` | Recherche dans titres, textes, notes, tags, descriptions, URL et texte des pages. Insensible aux accents et à la casse, tolérante aux pluriels, variantes et fautes de frappe (la même recherche que dans l'extension). | `query` (`#tag` filtre par tag ; vide = les plus récents), `type` (`link`, `note`, `quote`, `image`, `video`), `tags`, `pinned`, `since`, `until` (dates ISO), `limit`, `offset` |
| `get_memory` | Contenu complet d'un souvenir : texte en Markdown, note perso, description, tags, dates, et le texte de la page gardé à l'enregistrement (par tranches de 30 000 caractères). | `id`, `contentOffset` |
| `list_tags` | Tous les tags avec leur nombre de souvenirs, et pour chacun les tags qui reviennent le plus souvent avec lui. | aucun |
| `related_memories` | Souvenirs qui partagent le plus de tags avec un souvenir donné. | `id`, `limit` |

Bon à savoir sur la recherche :
- Tous les mots doivent être présents. Si aucun souvenir ne les contient tous, la recherche renvoie ceux qui en contiennent au moins un et l'indique (`"mode": "any"`).
- Elle tolère pluriels, variantes (« typographie » trouve « Typography ») et fautes de frappe, mais ne connaît pas les synonymes : l'agent peut reformuler.
- Chaque réponse indique `syncedAt`, la date de la dernière copie reçue de l'extension.

## Mise à jour, dépannage et désinstallation

**Quand relancer `node mcp/install.mjs <id>` :** si tu déplaces le dossier du projet, si l'id de l'extension change ou si tu changes de version de Node.

**L'agent dit qu'aucune copie n'est trouvée :**
1. Vérifie que `brain.json` existe (commande de l'étape 3).
2. Recharge l'extension pour forcer une copie.
3. Vérifie que le fichier du pont existe pour ton navigateur, par exemple pour Chrome :
   `~/.config/google-chrome/NativeMessagingHosts/com.second_cerveau.bridge.json`.
   Son champ `allowed_origins` doit contenir l'id actuel de l'extension.
4. Teste le lanceur à la main : `~/.local/share/second-cerveau/host.sh` doit démarrer sans erreur (quitte avec Ctrl+C).

**Les résultats semblent anciens :** regarde `syncedAt` dans la réponse. La copie part environ une seconde après chaque changement ; l'extension doit être active dans un navigateur ouvert.

**Tout retirer :**

```sh
node mcp/install.mjs --uninstall
claude mcp remove second-cerveau
```

La copie et les sauvegardes restent sur le disque ; supprime le dossier `~/.local/share/second-cerveau/` si tu n'en veux plus.

## Activer ou désactiver l'accès des agents

Dans la page « cerveau », colonne de gauche, l'interrupteur **Accès des agents** contrôle ce que le serveur MCP peut lire. Il est activé par défaut.

- **Activé :** la copie lue par le serveur MCP est tenue à jour après chaque changement. Elle contient tous tes souvenirs sauf les images enregistrées dans l'extension (captures, images déposées) ; les liens vers des images web restent.
- **Désactivé :** la copie est **effacée** sur-le-champ et remplacée par un simple marqueur. Un agent qui interroge le serveur reçoit le message « L'accès des agents est désactivé », sans aucun souvenir.
- **Réactivé :** une copie à jour est réécrite immédiatement.

Sous l'interrupteur, une ligne indique l'état réel : nombre de souvenirs partagés, date de la dernière copie, ou pont non installé.
L'interrupteur ne touche pas à la **sauvegarde automatique**, qui continue dans les deux cas.

## Sauvegarde automatique

Dès que le pont est installé, l'extension écrit une **copie complète** de tes souvenirs, images comprises, **une minute après le dernier changement** :

- Linux : `~/.local/share/second-cerveau/backups/AAAA-MM-JJ.json`
- macOS : `~/Library/Application Support/second-cerveau/backups/AAAA-MM-JJ.json`

Un fichier par jour, réécrit à chaque sauvegarde de la journée ; **les 30 fichiers les plus récents** sont gardés. Garde-fous :

- si une sauvegarde contient **moins de souvenirs** que celle du jour (suppressions, extension réinstallée), l'ancienne n'est pas écrasée : elle est gardée sous le nom `AAAA-MM-JJ-HHMMSS.json` et apparaît dans la liste comme « version de HH:MM » ;
- une base vide n'est jamais sauvegardée ;
- une sauvegarde interrompue (navigateur fermé en plein envoi) ne remplace jamais la précédente.
Au démarrage du navigateur, une sauvegarde est refaite si la dernière date de plus d'un jour.

Dans la page « cerveau », le bloc **Sauvegarde** en bas de la colonne de gauche montre la dernière sauvegarde et permet de :

- **Sauvegarder maintenant** ;
- **Restaurer** : choisis une date, puis clique une seconde fois pour confirmer. La restauration ajoute les souvenirs absents et remet à jour ceux qui sont plus anciens que dans la sauvegarde ; **elle ne supprime jamais rien**.

Les fichiers de sauvegarde ont le même format que l'export : le bouton **Importer** les accepte aussi, par exemple pour passer sur un autre ordinateur.

## Confidentialité

- Tout reste sur ta machine : ni l'extension ni le serveur n'envoient quoi que ce soit sur Internet.
- Le fichier `brain.json`, les sauvegardes et leur dossier ne sont lisibles que par ton compte.
- Seule ton extension, désignée par son id, peut parler au pont.
- **Ce que l'agent lit est transmis au modèle d'IA qu'il utilise.** Si ton agent tourne avec un modèle en ligne, les souvenirs qu'il consulte partent vers ce service, comme tout ce que tu lui montres.

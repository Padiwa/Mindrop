# Brancher un agent sur Second Cerveau (serveur MCP)

Ce guide permet à un agent IA (Claude Code ou tout client MCP) de **chercher dans ton second cerveau** : liens, notes, citations, images, vidéos et leurs tags.
L'accès est en **lecture seule** : l'agent ne peut rien modifier ni supprimer.

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
| `search_memories` | Recherche dans titres, textes, notes, tags, descriptions et URL. Insensible aux accents et à la casse. | `query` (`#tag` filtre par tag ; vide = les plus récents), `type` (`link`, `note`, `quote`, `image`, `video`), `tags`, `pinned`, `since`, `until` (dates ISO), `limit`, `offset` |
| `get_memory` | Contenu complet d'un souvenir : texte en Markdown, note perso, description, tags, dates. | `id` |
| `list_tags` | Tous les tags avec leur nombre de souvenirs, et pour chacun les tags qui reviennent le plus souvent avec lui. | aucun |
| `related_memories` | Souvenirs qui partagent le plus de tags avec un souvenir donné. | `id`, `limit` |

Bon à savoir sur la recherche :
- Tous les mots doivent être présents. Si aucun souvenir ne les contient tous, la recherche renvoie ceux qui en contiennent au moins un et l'indique (`"mode": "any"`).
- Elle compare des morceaux de mots, sans traduction ni synonymes : « typographie » ne trouve pas « Typography ». L'agent peut reformuler.
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

La copie des données reste sur le disque ; supprime le dossier `~/.local/share/second-cerveau/` si tu n'en veux plus.

## Confidentialité

- Tout reste sur ta machine : ni l'extension ni le serveur n'envoient quoi que ce soit sur Internet.
- Le fichier `brain.json` et son dossier ne sont lisibles que par ton compte.
- Seule ton extension, désignée par son id, peut parler au pont.
- **Ce que l'agent lit est transmis au modèle d'IA qu'il utilise.** Si ton agent tourne avec un modèle en ligne, les souvenirs qu'il consulte partent vers ce service, comme tout ce que tu lui montres.

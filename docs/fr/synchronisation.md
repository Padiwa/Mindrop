# Synchronisation WebDAV

La synchronisation garde **les mêmes souvenirs sur tous tes ordinateurs**, par ton propre serveur WebDAV. Elle est **désactivée par défaut**. Sans elle, rien ne quitte ton navigateur.

WebDAV est un protocole de fichiers standard : Nextcloud, ownCloud, la plupart des NAS (Synology, QNAP…), Apache ou rclone le proposent. Mindrop a été testé avec Nextcloud, Apache et rclone. Il n'y a ni programme ni pont local à installer.

## Ce qu'il te faut

- Un compte sur un serveur WebDAV, le tien ou celui d'un hébergeur, avec une adresse en `https://`.
- Son identifiant et son mot de passe.

**Avec Nextcloud ou ownCloud**, utilise un **mot de passe d'application**, pas le mot de passe de ton compte : **Paramètres personnels**, **Sécurité**, **Créer un nouveau mot de passe d'application**. Donne-lui un nom (« Mindrop ») et copie le mot de passe affiché. Il ne donne accès qu'à tes fichiers, et tu peux le retirer à tout moment au même endroit, sans toucher au mot de passe de ton compte.

Pour vérifier qu'un serveur convient avant de t'en servir, lance `MINDROP_DAV_PASSWORD=… npm run check:webdav -- <adresse WebDAV> <utilisateur>` depuis le code source de Mindrop (Node 22 ou plus). Il fait une synchronisation complète, en clair et chiffrée, dans un dossier temporaire qu'il efface ensuite.

## Connecter un ordinateur

1. Ouvre la page Mindrop, puis, dans les **Réglages** de la colonne de gauche, **Synchronisation**, **Connecter un serveur WebDAV**.
2. Remplis :
   - **Adresse du serveur :** l'adresse WebDAV du serveur, par exemple `https://nas.exemple.fr/dav/`. Pour Nextcloud, son adresse simple (`https://cloud.exemple.fr`) suffit ; l'adresse WebDAV complète, affichée dans Fichiers, Paramètres, marche aussi.
   - **Utilisateur** et **Mot de passe :** ton identifiant sur le serveur (pour Nextcloud, le mot de passe d'application).
   - **Dossier :** `Mindrop` par défaut. Il est créé s'il n'existe pas.
   - **Phrase de passe de chiffrement :** facultative, mais recommandée. Voir « Chiffrement » plus bas.
3. Clique sur **Connecter**. Le navigateur demande l'autorisation d'accéder à ce serveur. Accepte : Mindrop ne joint que ce serveur.

La première synchronisation part tout de suite. Ensuite, elle se fait **30 secondes après chaque changement**, au démarrage du navigateur et **toutes les 15 minutes**. Le bouton **Synchroniser maintenant** la lance à la demande.

Refais ces étapes sur chaque ordinateur, avec le même serveur et le même dossier. Avec Nextcloud, tu peux utiliser le même mot de passe d'application, ou un par ordinateur pour pouvoir les retirer séparément.

Les souvenirs déjà présents sur chaque ordinateur sont **réunis** : rien n'est perdu en connectant un second ordinateur qui a déjà ses propres souvenirs.

## Chiffrement

Avec une **phrase de passe**, tout est chiffré sur ton ordinateur avant d'être envoyé. Le serveur, et quiconque y a accès, ne voit que des fichiers illisibles : ni tes textes, ni tes images, ni tes tags, ni les adresses des pages.

- **Choisis-la longue** : au moins 12 caractères, mieux, plusieurs mots (« tartine piano marée 1987 »). Elle ne sert qu'à Mindrop : ne reprends pas un mot de passe que tu utilises ailleurs.
- **Entre la même sur chaque ordinateur.** Le premier ordinateur qui se connecte avec une phrase de passe chiffre le dossier ; les suivants doivent donner la même, sinon Mindrop la refuse.
- **Garde-la précieusement.** Personne ne peut la retrouver, ni Mindrop ni l'administrateur du serveur. Si tu l'oublies, la copie sur le serveur devient illisible ; tes souvenirs, eux, restent sur tes ordinateurs. Recommence alors avec un nouveau dossier.
- La phrase de passe n'est jamais enregistrée. Mindrop garde seulement, sur cet ordinateur, la clé qui en est tirée.

**Chiffrer un dossier qui ne l'était pas :** déconnecte un ordinateur, puis reconnecte-le avec une phrase de passe. Il réécrit tout le dossier chiffré et efface les copies en clair. Les autres ordinateurs s'arrêtent alors avec le message « Ce dossier est maintenant chiffré » : déconnecte-les et reconnecte-les avec la même phrase de passe.

**Changer de phrase de passe, ou revenir à un dossier en clair :** déconnecte chaque ordinateur, supprime le dossier `Mindrop` sur le serveur (ou choisis un autre nom de dossier), puis reconnecte-les. Rien n'est perdu : chaque ordinateur garde ses souvenirs et les renvoie.

Détails techniques : la clé est tirée de la phrase de passe par PBKDF2-SHA-256 (600 000 itérations, sel aléatoire propre au dossier) ; le contenu est chiffré en AES-256-GCM, chaque fichier étant lié à son emplacement ; les images sont nommées par un HMAC, si bien qu'on ne peut pas reconnaître une image connue à son nom. Le fichier `mindrop.json` à la racine du dossier contient le sel et une valeur témoin, qui permet de reconnaître une mauvaise phrase de passe ; il ne permet pas de retrouver la clé.

## Comment ça marche

Dans le dossier `Mindrop` de ton serveur :

```
Mindrop/
  devices/<appareil>.json   un fichier par ordinateur : ses souvenirs et ses suppressions
  images/<empreinte>.jpg    les captures et images déposées, une seule fois chacune (.bin si chiffrées)
  mindrop.json              seulement si le dossier est chiffré : de quoi vérifier la phrase de passe
```

- Chaque ordinateur n'écrit **que son propre fichier** et lit ceux des autres. Deux ordinateurs n'écrivent donc jamais le même fichier, même au même moment.
- Pour chaque souvenir, **la version modifiée le plus récemment l'emporte**. Si tu modifies la même note sur deux ordinateurs avant qu'ils se synchronisent, c'est la dernière modification qui reste.
- Une **suppression** passe aux autres ordinateurs. Si un souvenir a été modifié ailleurs *après* avoir été supprimé ici, la modification gagne et le souvenir reste.
- Les images sont rangées à part, sous un nom tiré de leur contenu : une image n'est envoyée qu'une fois, même si plusieurs souvenirs l'utilisent. Celles que plus aucun souvenir n'utilise sont retirées au bout d'un jour.
- Les suppressions sont retenues 180 jours. Un ordinateur resté hors ligne plus longtemps peut faire revenir des souvenirs supprimés entre-temps.

L'heure de chaque ordinateur sert à départager deux versions : garde-la à l'heure (c'est le réglage par défaut des systèmes).

## L'état, dans les Réglages

Sous **Synchronisation**, une ligne indique l'état réel :

- **À jour il y a 2 minutes avec cloud.exemple.fr, 3 appareils :** tout va bien.
- **Des images envoyées par un autre appareil sont encore en route :** un autre ordinateur est en train d'envoyer ses images. Les souvenirs concernés arrivent au passage suivant.
- **… refuse l'utilisateur ou le mot de passe :** le mot de passe a été changé ou retiré. Déconnecte, puis reconnecte avec le bon.
- **… ne répond pas :** serveur ou connexion indisponible ; un nouvel essai a lieu tout seul.
- **Ton espace est plein :** libère de la place sur le serveur.
- **Ce dossier est maintenant chiffré :** un autre ordinateur l'a chiffré. Déconnecte, puis reconnecte avec la phrase de passe.
- **La clé du dossier a changé :** le dossier a été recréé avec une autre phrase de passe. Reconnecte avec la nouvelle.
- **Un fichier ne se déchiffre pas :** il a été modifié sur le serveur. Mindrop n'applique rien de ce fichier.

À la fin de la ligne, « Chiffrée de bout en bout » indique que le dossier est chiffré.

## Déconnecter

**Déconnecter** arrête la synchronisation sur cet ordinateur et retire l'autorisation d'accéder au serveur. **Rien n'est effacé**, ni ici ni sur le serveur : les autres ordinateurs continuent de se synchroniser entre eux.

Pour tout arrêter, déconnecte chaque ordinateur, puis supprime le dossier `Mindrop` sur le serveur. Le fichier d'un ordinateur que tu n'utilises plus peut être supprimé de `Mindrop/devices/` : les souvenirs restent sur les autres ordinateurs.

## Confidentialité

- **Avec une phrase de passe**, le serveur ne voit que des fichiers chiffrés. Il voit encore leur nombre, leur taille et leurs dates de modification : combien d'ordinateurs, combien d'images, quand tu t'en sers.
- **Sans phrase de passe**, tes souvenirs, textes et images compris, sont copiés **en clair** dans le dossier de ton serveur. Toute personne qui a accès à ce dossier peut les lire, y compris l'administrateur du serveur.
- Mindrop ne joint que le serveur que tu as indiqué, et seulement avec l'autorisation que tu as donnée.
- L'adresse, l'utilisateur, le mot de passe et la clé de chiffrement sont gardés dans le stockage de l'extension, sur cet ordinateur. Ils ne sont pas synchronisés par le navigateur. Quelqu'un qui a accès à ta session sur cet ordinateur a de toute façon accès à tes souvenirs.
- La synchronisation ne dépend ni de l'accès des agents ni de la sauvegarde automatique : les trois se règlent séparément.

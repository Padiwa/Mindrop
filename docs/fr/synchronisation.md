# Synchronisation avec Nextcloud

La synchronisation garde **les mêmes souvenirs sur tous tes ordinateurs**, par ton propre serveur Nextcloud. Elle est **désactivée par défaut**. Sans elle, rien ne quitte ton navigateur.

Elle passe par WebDAV, le protocole de fichiers de Nextcloud. Elle marche aussi avec ownCloud et d'autres serveurs WebDAV. Il n'y a ni programme ni pont local à installer.

## Ce qu'il te faut

- Un compte sur un serveur Nextcloud, le tien ou celui d'un hébergeur, avec une adresse en `https://`.
- Un **mot de passe d'application**, pas le mot de passe de ton compte. Dans Nextcloud : **Paramètres personnels**, **Sécurité**, **Créer un nouveau mot de passe d'application**. Donne-lui un nom (« Mindrop ») et copie le mot de passe affiché.

Un mot de passe d'application ne donne accès qu'à tes fichiers. Tu peux le retirer à tout moment au même endroit, sans toucher au mot de passe de ton compte.

## Connecter un ordinateur

1. Ouvre la page Mindrop, puis, dans les **Réglages** de la colonne de gauche, **Synchronisation**, **Connecter Nextcloud**.
2. Remplis :
   - **Adresse du serveur :** par exemple `https://cloud.exemple.fr`. L'adresse WebDAV complète, affichée dans Fichiers, Paramètres, marche aussi.
   - **Utilisateur :** ton identifiant Nextcloud.
   - **Mot de passe d'application :** celui que tu viens de créer.
   - **Dossier :** `Mindrop` par défaut. Il est créé s'il n'existe pas.
3. Clique sur **Connecter**. Le navigateur demande l'autorisation d'accéder à ce serveur. Accepte : Mindrop ne joint que ce serveur.

La première synchronisation part tout de suite. Ensuite, elle se fait **30 secondes après chaque changement**, au démarrage du navigateur et **toutes les 15 minutes**. Le bouton **Synchroniser maintenant** la lance à la demande.

Refais ces étapes sur chaque ordinateur, avec le même serveur et le même dossier. Tu peux utiliser le même mot de passe d'application, ou un par ordinateur pour pouvoir les retirer séparément.

Les souvenirs déjà présents sur chaque ordinateur sont **réunis** : rien n'est perdu en connectant un second ordinateur qui a déjà ses propres souvenirs.

## Comment ça marche

Dans le dossier `Mindrop` de ton Nextcloud :

```
Mindrop/
  devices/<appareil>.json   un fichier par ordinateur : ses souvenirs et ses suppressions
  images/<empreinte>.jpg    les captures et images déposées, une seule fois chacune
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
- **… refuse l'utilisateur ou le mot de passe :** le mot de passe d'application a été retiré ou est erroné. Déconnecte, crée-en un nouveau, puis reconnecte.
- **… ne répond pas :** serveur ou connexion indisponible ; un nouvel essai a lieu tout seul.
- **Ton espace est plein :** libère de la place dans Nextcloud.

## Déconnecter

**Déconnecter** arrête la synchronisation sur cet ordinateur et retire l'autorisation d'accéder au serveur. **Rien n'est effacé**, ni ici ni sur le serveur : les autres ordinateurs continuent de se synchroniser entre eux.

Pour tout arrêter, déconnecte chaque ordinateur, puis supprime le dossier `Mindrop` dans Nextcloud. Le fichier d'un ordinateur que tu n'utilises plus peut être supprimé de `Mindrop/devices/` : les souvenirs restent sur les autres ordinateurs.

## Confidentialité

- Tes souvenirs, textes et images compris, sont copiés **en clair** dans ton dossier Nextcloud. Toute personne qui a accès à ce dossier peut les lire, y compris l'administrateur du serveur. Choisis un serveur de confiance : le tien, ou un hébergeur en qui tu as confiance.
- Mindrop ne joint que le serveur que tu as indiqué, et seulement avec l'autorisation que tu as donnée.
- L'adresse, l'utilisateur et le mot de passe d'application sont gardés dans le stockage de l'extension, sur cet ordinateur. Ils ne sont pas synchronisés par le navigateur.
- La synchronisation ne dépend ni de l'accès des agents ni de la sauvegarde automatique : les trois se règlent séparément.

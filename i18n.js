// Langue de l'interface : français ou anglais.
// Par défaut, celle du navigateur (français si le navigateur est en français, anglais sinon) ;
// le choix fait dans les Réglages de la page principale (clé uiLang) l'emporte, pour toute l'extension.

export const PREF_KEY = 'uiLang';           // 'auto' | 'fr' | 'en'
export const LANGS = ['fr', 'en'];

const plural = (n, one, many) => (n > 1 ? many : one);

export const DICT = {
  fr: {
    // types et filtres
    'type.link': 'Lien', 'type.note': 'Note', 'type.quote': 'Citation', 'type.image': 'Image', 'type.video': 'Vidéo',
    'filter.all': 'Tout', 'filter.link': 'Liens', 'filter.note': 'Notes', 'filter.quote': 'Citations',
    'filter.image': 'Images', 'filter.video': 'Vidéos', 'filter.pinned': 'Épinglés',
    'count.memories': ({ n }) => `${n} ${plural(n, 'souvenir', 'souvenirs')}`,
    'count.empty': 'Vide pour l’instant',

    // page principale : en-tête, index, zone d'écriture
    'search.placeholder': 'Rechercher dans ta mémoire, ou #tag pour filtrer',
    'search.label': 'Rechercher dans ta mémoire (touche /, #tag pour filtrer)',
    'views.label': 'Affichage', 'views.grid': 'Mosaïque', 'views.map': 'Carte mentale',
    'action.random': 'Redécouvrir', 'action.random.title': 'Ressortir un souvenir au hasard',
    'action.export': 'Exporter', 'action.export.title': 'Télécharger une sauvegarde JSON',
    'action.import': 'Importer', 'action.import.title': 'Restaurer une sauvegarde JSON',
    'index.label': 'Filtres', 'index.types': 'Types', 'index.tags': 'Tags',
    'composer.label': 'Écrire une idée',
    'composer.placeholder': 'Une idée, une pensée, un lien… (Markdown accepté)',
    'composer.aria': 'Une idée, une pensée, un lien, en Markdown (Ctrl+Entrée pour garder)',
    'composer.tags': 'Tags de la note', 'composer.keep': 'Garder',
    'key.enter': 'Entrée',
    'drop': 'Dépose ici pour garder en mémoire',
    'modal.label': 'Souvenir', 'close': 'Fermer',

    // état vide
    'empty.noMatch': 'Rien ne correspond à cette recherche.',
    'empty.title': 'Mindrop t’attend.',
    'empty.body': 'Clique sur l’icône de l’extension sur n’importe quelle page, fais un clic droit sur une image, un lien ou un texte sélectionné, ou dépose quelque chose ici.',
    'empty.kOpen': 'ouvrir', 'empty.kSave': 'enregistrer direct', 'empty.kPage': 'cette page',

    // fiche
    'card.pinned': 'Épinglé',
    'sheet.write': 'Écris…', 'sheet.title': 'Titre',
    'sheet.notePlaceholder': 'Mes notes, pourquoi je garde ça…', 'sheet.tagsPlaceholder': '#tags séparés par des espaces',
    'sheet.notes': 'Notes', 'sheet.tags': 'Tags', 'sheet.color': 'Couleur', 'sheet.noColor': 'Aucune couleur',
    'sheet.colorN': ({ c }) => `Couleur ${c}`,
    'sheet.pin': 'Épingler', 'sheet.pinned': 'Épinglé', 'sheet.delete': 'Supprimer', 'sheet.confirmDelete': 'Confirmer la suppression ?',
    'sheet.deleted': 'Souvenir supprimé',
    'sheet.savedOn': ({ type, date }) => `${{ link: 'Lien gardé', note: 'Note gardée', quote: 'Citation gardée', image: 'Image gardée', video: 'Vidéo gardée' }[type] || 'Gardé'} le ${date}`,
    'sheet.pageText': ({ n }) => `Texte de la page (${n} ${plural(n, 'mot', 'mots')})`,
    'sheet.linksTo': 'Renvoie vers', 'sheet.citedBy': 'Cité par',
    'note.preview': 'Aperçu de la note', 'note.mode': 'Mode de la note', 'note.write': 'Écrire', 'note.view': 'Aperçu',
    'task.done': 'Tâche faite',

    // liens [[titre]]
    'link.open': ({ t }) => `Ouvrir « ${t} »`,
    'link.create': ({ t }) => `Créer la note « ${t} »`,
    'link.created': ({ t }) => `Note « ${t} » créée`,
    'link.createThis': 'Créer cette note', 'link.toCreate': 'à créer',
    'suggest.tags': 'Tags existants', 'suggest.links': 'Souvenirs à lier',

    // messages
    'toast.saved': 'Gardé en mémoire', 'toast.onlyImages': 'Seules les images peuvent être déposées', 'toast.imageSaved': 'Image gardée',
    'toast.imported': ({ n }) => `${n} ${plural(n, 'souvenir importé', 'souvenirs importés')}`,
    'toast.badFile': 'Fichier de sauvegarde invalide',
    'toast.importFailed': ({ e }) => `Échec de l’import : ${e}`,
    'toast.saveFailed': ({ e }) => `Échec de l’enregistrement : ${e}`,
    'toast.nothingToRediscover': 'Rien à redécouvrir pour l’instant',
    'error.unknown': 'erreur inconnue',

    // carte mentale
    'map.label': 'Carte mentale des tags',
    'map.zoomIn': 'Zoomer', 'map.zoomIn.title': 'Zoomer (+)', 'map.zoomOut': 'Dézoomer', 'map.zoomOut.title': 'Dézoomer (−)',
    'map.fit': 'Tout voir', 'map.fit.title': 'Tout voir (0)', 'map.reset': 'Réorganiser la carte',
    'map.hintFar': 'Zoome (molette) sur un #tag pour voir les souvenirs qui y sont liés',
    'map.hintNear': 'Clique sur une carte pour l’ouvrir, glisse un #tag pour le déplacer',
    'map.noTag': 'sans tag', 'map.empty': 'Ajoute des #tags à tes souvenirs pour faire pousser la carte.',

    // réglages
    'settings.summary': 'Réglages : langue, agents IA, sauvegarde et synchronisation',
    'lang.head': 'Langue', 'lang.auto': 'Automatique (langue du navigateur)', 'lang.fr': 'Français', 'lang.en': 'English',
    'agent.head': 'Accès des agents', 'agent.switch': 'Recherche par un agent IA (MCP)', 'checking': 'Vérification…',
    'agent.off': 'Désactivé : les agents n’ont accès à aucun souvenir.',
    'agent.offFailed': ({ e }) => `Désactivé, mais la copie n’a pas pu être effacée : ${e}`,
    'agent.notInstalled': 'Activé, mais le pont local n’est pas installé (voir la documentation, « Pont local »).',
    'agent.failed': ({ e }) => `Activé, dernière mise à jour en échec : ${e}`,
    'agent.on': ({ n, ago }) => `Activé : les agents lisent tes ${n} ${plural(n, 'souvenir', 'souvenirs')}, sans les images enregistrées. Copie à jour ${ago}.`,
    'agent.waiting': 'Activé : en attente de la première copie.',
    'agent.toastOn': 'Accès des agents activé', 'agent.toastOff': 'Accès des agents désactivé',
    'backup.head': 'Sauvegarde', 'backup.now': 'Sauvegarder maintenant', 'backup.restore': 'Restaurer',
    'backup.none': 'Aucune pour l’instant. Elle se fait une minute après chaque changement.',
    'backup.notInstalled': 'Pas encore activée : installe le pont local (voir la documentation, « Pont local »).',
    'backup.failed': ({ e }) => `Dernier essai en échec : ${e}`,
    'backup.last': ({ ago, n, size }) => `Dernière : ${ago}, ${n} ${plural(n, 'souvenir', 'souvenirs')} (${size}).`,
    'backup.toastDone': 'Sauvegarde faite', 'backup.toastEmpty': 'Rien à sauvegarder pour l’instant',
    'backup.toastNotInstalled': 'Pont local non installé', 'backup.toastFailed': 'Échec de la sauvegarde',
    'backup.loading': 'Chargement…', 'backup.noneOnDisk': 'Aucune sauvegarde sur le disque.',
    'backup.readFailed': ({ e }) => `Lecture impossible : ${e}`,
    'backup.confirm': 'Restaurer cette sauvegarde ?',
    'backup.version': ({ date, time }) => `${date}, version de ${time}`,
    'backup.meta': ({ n, size }) => `${n} ${plural(n, 'souvenir', 'souvenirs')}, ${size}`,
    'backup.restored': ({ added, updated, skipped }) => `${added} ${plural(added, 'souvenir restauré', 'souvenirs restaurés')}, ${updated} mis à jour${skipped ? `, ${skipped} sans image` : ''}`,
    'backup.restoreFailed': ({ e }) => `Échec de la restauration : ${e}`,
    'cloud.head': 'Synchronisation', 'cloud.setup': 'Connecter un serveur WebDAV', 'cloud.now': 'Synchroniser maintenant', 'cloud.off': 'Déconnecter',
    'cloud.url': 'Adresse du serveur', 'cloud.urlPlaceholder': 'https://cloud.exemple.fr', 'cloud.user': 'Utilisateur',
    'cloud.password': 'Mot de passe', 'cloud.folder': 'Dossier',
    'cloud.hint': 'Nextcloud, ownCloud, un NAS ou tout serveur WebDAV. Avec Nextcloud, crée un mot de passe d’application : Paramètres personnels, Sécurité, « Créer un nouveau mot de passe d’application ».',
    'cloud.passphrase': 'Phrase de passe de chiffrement (facultative)', 'cloud.passphrase2': 'Confirme la phrase de passe',
    'cloud.passHint': 'Avec une phrase de passe, tout est chiffré ici avant l’envoi : le serveur ne voit que des fichiers illisibles. La même sur chaque ordinateur. Oubliée, elle ne se récupère pas. Sans elle, tes souvenirs sont copiés en clair.',
    'cloud.mismatch': 'Les deux phrases de passe ne sont pas identiques.',
    'cloud.needPassphrase': 'Ce dossier est chiffré : entre sa phrase de passe.',
    'cloud.wrongPassphrase': 'Phrase de passe incorrecte pour ce dossier.',
    'cloud.weak': ({ n }) => `Choisis une phrase de passe d’au moins ${n} caractères : plusieurs mots, par exemple.`,
    'cloud.encryptedNote': 'Chiffrée de bout en bout.',
    'cloud.errLocked': 'Ce dossier est maintenant chiffré. Déconnecte, puis reconnecte en entrant sa phrase de passe.',
    'cloud.errKeyChanged': 'La clé du dossier a changé sur le serveur. Déconnecte, puis reconnecte avec la nouvelle phrase de passe.',
    'cloud.errDecrypt': 'Un fichier du dossier ne se déchiffre pas : il a été modifié, ou chiffré avec une autre clé. Rien n’a été changé ici.',
    'cloud.connect': 'Connecter', 'cloud.connecting': 'Connexion…', 'cloud.cancel': 'Annuler',
    'cloud.offState': 'Désactivée. Avec ton serveur WebDAV, tes souvenirs restent les mêmes sur tous tes ordinateurs.',
    'cloud.pending': ({ host }) => `Connectée à ${host}. Première synchronisation en cours…`,
    'cloud.ok': ({ ago, host, n }) => `À jour ${ago} avec ${host}, ${n} ${plural(n, 'appareil', 'appareils')}.`,
    'cloud.okWaiting': ({ ago, host, n }) => `À jour ${ago} avec ${host}, ${n} ${plural(n, 'appareil', 'appareils')}. Des images envoyées par un autre appareil sont encore en route.`,
    'cloud.errAuth': ({ host }) => `${host} refuse l’utilisateur ou le mot de passe. Déconnecte, puis reconnecte avec le bon mot de passe.`,
    'cloud.errPermission': ({ host }) => `Mindrop n’a plus l’autorisation de joindre ${host}. Déconnecte, puis reconnecte.`,
    'cloud.errNetwork': ({ host }) => `${host} ne répond pas. Nouvel essai dans 15 minutes.`,
    'cloud.errQuota': ({ host }) => `Ton espace sur ${host} est plein.`,
    'cloud.errBusy': ({ host }) => `${host} garde un fichier du dossier verrouillé, souvent parce qu’il est ouvert dans le navigateur de fichiers du serveur. Ferme-le : nouvel essai dans 15 minutes.`,
    'cloud.errVersion': 'Un autre appareil utilise une version plus récente de Mindrop : mets à jour l’extension ici.',
    'cloud.errFormat': ({ file }) => `Le fichier ${file} du dossier de synchronisation est illisible. Supprime-le sur le serveur : l’appareil concerné le réécrira.`,
    'cloud.failed': ({ e }) => `Dernier essai en échec : ${e}`,
    'cloud.missing': 'Remplis l’adresse, l’utilisateur et le mot de passe.',
    'cloud.badUrl': 'Adresse invalide : elle doit commencer par https://',
    'cloud.denied': 'Autorisation refusée : sans elle, Mindrop ne peut pas joindre ce serveur.',
    'cloud.authFailed': 'Utilisateur ou mot de passe refusé. Utilise un mot de passe d’application, pas celui de ton compte.',
    'cloud.notFound': 'Aucun espace WebDAV à cette adresse : vérifie l’adresse du serveur et l’utilisateur.',
    'cloud.unreachable': 'Serveur injoignable : vérifie l’adresse et ta connexion.',
    'cloud.connectFailed': ({ e }) => `Connexion impossible : ${e}`,
    'cloud.toastConnected': 'Synchronisation activée', 'cloud.toastOff': 'Synchronisation arrêtée sur cet appareil',
    'cloud.toastDone': ({ pulled, removed }) => (pulled || removed
      ? 'Synchronisé : ' + [pulled && `${pulled} ${plural(pulled, 'souvenir reçu', 'souvenirs reçus')}`, removed && `${removed} ${plural(removed, 'supprimé', 'supprimés')}`].filter(Boolean).join(', ')
      : 'Synchronisé, rien de nouveau'),
    'cloud.toastFailed': 'Échec de la synchronisation',
    'size.kb': 'ko', 'size.mb': 'Mo',

    // popup
    'popup.modes': 'Type d’enregistrement', 'popup.page': 'Page', 'popup.note': 'Note',
    'popup.capturing': 'Capture de la page…', 'popup.duplicate': 'Déjà enregistrée',
    'popup.title': 'Titre', 'popup.keepQuote': 'Garder la sélection comme citation',
    'popup.why': 'Pourquoi je garde ça ? (optionnel)', 'popup.note.label': 'Note',
    'popup.tagsPlaceholder': '#tags, séparés par des espaces', 'popup.tags': 'Tags',
    'popup.save': 'Enregistrer', 'popup.noteText': 'Une idée, une pensée, un rappel… (Markdown accepté : # titre, **gras**, - liste, - [ ] tâche)',
    'popup.noteText.label': 'Note en Markdown', 'popup.saveNote': 'Enregistrer la note',
    'popup.open': 'Ouvrir Mindrop', 'popup.toSave': 'pour enregistrer', 'popup.done': 'Gardé en mémoire',
    'popup.failed': ({ e }) => `Rien n’a été enregistré : ${e}. Réessaie.`,

    // menu contextuel, données
    'menu.savePage': 'Enregistrer cette page', 'menu.saveSelection': 'Enregistrer la sélection comme citation',
    'menu.saveLink': 'Enregistrer ce lien', 'menu.saveImage': 'Enregistrer cette image', 'menu.open': 'Ouvrir Mindrop',
    'video.channel': ({ a }) => `Chaîne : ${a}`,
    'storage.blocked': 'Base bloquée par un autre onglet : ferme les autres onglets Mindrop.',
    'storage.aborted': 'Enregistrement annulé',
  },

  en: {
    'type.link': 'Link', 'type.note': 'Note', 'type.quote': 'Quote', 'type.image': 'Image', 'type.video': 'Video',
    'filter.all': 'All', 'filter.link': 'Links', 'filter.note': 'Notes', 'filter.quote': 'Quotes',
    'filter.image': 'Images', 'filter.video': 'Videos', 'filter.pinned': 'Pinned',
    'count.memories': ({ n }) => `${n} ${plural(n, 'memory', 'memories')}`,
    'count.empty': 'Empty for now',

    'search.placeholder': 'Search your memory, or #tag to filter',
    'search.label': 'Search your memory (/ key, #tag to filter)',
    'views.label': 'View', 'views.grid': 'Mosaic', 'views.map': 'Mind map',
    'action.random': 'Rediscover', 'action.random.title': 'Bring back a random memory',
    'action.export': 'Export', 'action.export.title': 'Download a JSON backup',
    'action.import': 'Import', 'action.import.title': 'Restore a JSON backup',
    'index.label': 'Filters', 'index.types': 'Types', 'index.tags': 'Tags',
    'composer.label': 'Write an idea',
    'composer.placeholder': 'An idea, a thought, a link… (Markdown welcome)',
    'composer.aria': 'An idea, a thought, a link, in Markdown (Ctrl+Enter to keep it)',
    'composer.tags': 'Note tags', 'composer.keep': 'Keep',
    'key.enter': 'Enter',
    'drop': 'Drop it here to keep it',
    'modal.label': 'Memory', 'close': 'Close',

    'empty.noMatch': 'Nothing matches this search.',
    'empty.title': 'Mindrop is waiting for you.',
    'empty.body': 'Click the extension icon on any page, right-click an image, a link or selected text, or drop something here.',
    'empty.kOpen': 'open', 'empty.kSave': 'save at once', 'empty.kPage': 'this page',

    'card.pinned': 'Pinned',
    'sheet.write': 'Write…', 'sheet.title': 'Title',
    'sheet.notePlaceholder': 'My notes, why I keep this…', 'sheet.tagsPlaceholder': '#tags separated by spaces',
    'sheet.notes': 'Notes', 'sheet.tags': 'Tags', 'sheet.color': 'Colour', 'sheet.noColor': 'No colour',
    'sheet.colorN': ({ c }) => `Colour ${c}`,
    'sheet.pin': 'Pin', 'sheet.pinned': 'Pinned', 'sheet.delete': 'Delete', 'sheet.confirmDelete': 'Confirm deletion?',
    'sheet.deleted': 'Memory deleted',
    'sheet.savedOn': ({ type, date }) => `${{ link: 'Link', note: 'Note', quote: 'Quote', image: 'Image', video: 'Video' }[type] || 'Memory'} kept on ${date}`,
    'sheet.pageText': ({ n }) => `Page text (${n} ${plural(n, 'word', 'words')})`,
    'sheet.linksTo': 'Links to', 'sheet.citedBy': 'Cited by',
    'note.preview': 'Note preview', 'note.mode': 'Note mode', 'note.write': 'Write', 'note.view': 'Preview',
    'task.done': 'Task done',

    'link.open': ({ t }) => `Open “${t}”`,
    'link.create': ({ t }) => `Create the note “${t}”`,
    'link.created': ({ t }) => `Note “${t}” created`,
    'link.createThis': 'Create this note', 'link.toCreate': 'to create',
    'suggest.tags': 'Existing tags', 'suggest.links': 'Memories to link',

    'toast.saved': 'Kept', 'toast.onlyImages': 'Only images can be dropped', 'toast.imageSaved': 'Image kept',
    'toast.imported': ({ n }) => `${n} ${plural(n, 'memory', 'memories')} imported`,
    'toast.badFile': 'Invalid backup file',
    'toast.importFailed': ({ e }) => `Import failed: ${e}`,
    'toast.saveFailed': ({ e }) => `Saving failed: ${e}`,
    'toast.nothingToRediscover': 'Nothing to rediscover yet',
    'error.unknown': 'unknown error',

    'map.label': 'Mind map of tags',
    'map.zoomIn': 'Zoom in', 'map.zoomIn.title': 'Zoom in (+)', 'map.zoomOut': 'Zoom out', 'map.zoomOut.title': 'Zoom out (−)',
    'map.fit': 'Show all', 'map.fit.title': 'Show all (0)', 'map.reset': 'Rearrange the map',
    'map.hintFar': 'Zoom (wheel) on a #tag to see the memories linked to it',
    'map.hintNear': 'Click a card to open it, drag a #tag to move it',
    'map.noTag': 'no tag', 'map.empty': 'Add #tags to your memories to grow the map.',

    'settings.summary': 'Settings: language, AI agents, backup and sync',
    'lang.head': 'Language', 'lang.auto': 'Automatic (browser language)', 'lang.fr': 'Français', 'lang.en': 'English',
    'agent.head': 'Agent access', 'agent.switch': 'Search by an AI agent (MCP)', 'checking': 'Checking…',
    'agent.off': 'Off: agents have access to no memory.',
    'agent.offFailed': ({ e }) => `Off, but the copy could not be deleted: ${e}`,
    'agent.notInstalled': 'On, but the local bridge is not installed (see the documentation, “Local bridge”).',
    'agent.failed': ({ e }) => `On, last update failed: ${e}`,
    'agent.on': ({ n, ago }) => `On: agents read your ${n} ${plural(n, 'memory', 'memories')}, without stored images. Copy updated ${ago}.`,
    'agent.waiting': 'On: waiting for the first copy.',
    'agent.toastOn': 'Agent access on', 'agent.toastOff': 'Agent access off',
    'backup.head': 'Backup', 'backup.now': 'Back up now', 'backup.restore': 'Restore',
    'backup.none': 'None yet. It runs one minute after each change.',
    'backup.notInstalled': 'Not active yet: install the local bridge (see the documentation, “Local bridge”).',
    'backup.failed': ({ e }) => `Last attempt failed: ${e}`,
    'backup.last': ({ ago, n, size }) => `Last: ${ago}, ${n} ${plural(n, 'memory', 'memories')} (${size}).`,
    'backup.toastDone': 'Backup done', 'backup.toastEmpty': 'Nothing to back up yet',
    'backup.toastNotInstalled': 'Local bridge not installed', 'backup.toastFailed': 'Backup failed',
    'backup.loading': 'Loading…', 'backup.noneOnDisk': 'No backup on the disk.',
    'backup.readFailed': ({ e }) => `Cannot read: ${e}`,
    'backup.confirm': 'Restore this backup?',
    'backup.version': ({ date, time }) => `${date}, ${time} version`,
    'backup.meta': ({ n, size }) => `${n} ${plural(n, 'memory', 'memories')}, ${size}`,
    'backup.restored': ({ added, updated, skipped }) => `${added} ${plural(added, 'memory', 'memories')} restored, ${updated} updated${skipped ? `, ${skipped} without image` : ''}`,
    'backup.restoreFailed': ({ e }) => `Restore failed: ${e}`,
    'cloud.head': 'Sync', 'cloud.setup': 'Connect a WebDAV server', 'cloud.now': 'Sync now', 'cloud.off': 'Disconnect',
    'cloud.url': 'Server address', 'cloud.urlPlaceholder': 'https://cloud.example.com', 'cloud.user': 'User',
    'cloud.password': 'Password', 'cloud.folder': 'Folder',
    'cloud.hint': 'Nextcloud, ownCloud, a NAS or any WebDAV server. With Nextcloud, create an app password: Personal settings, Security, “Create new app password”.',
    'cloud.passphrase': 'Encryption passphrase (optional)', 'cloud.passphrase2': 'Confirm the passphrase',
    'cloud.passHint': 'With a passphrase, everything is encrypted here before it is sent: the server only sees unreadable files. Use the same one on every computer. If forgotten, it cannot be recovered. Without one, your memories are copied unencrypted.',
    'cloud.mismatch': 'The two passphrases differ.',
    'cloud.needPassphrase': 'This folder is encrypted: enter its passphrase.',
    'cloud.wrongPassphrase': 'Wrong passphrase for this folder.',
    'cloud.weak': ({ n }) => `Pick a passphrase of at least ${n} characters: several words, for example.`,
    'cloud.encryptedNote': 'End-to-end encrypted.',
    'cloud.errLocked': 'This folder is now encrypted. Disconnect, then connect again with its passphrase.',
    'cloud.errKeyChanged': 'The folder’s key changed on the server. Disconnect, then connect again with the new passphrase.',
    'cloud.errDecrypt': 'A file in the folder cannot be decrypted: it was altered, or encrypted with another key. Nothing was changed here.',
    'cloud.connect': 'Connect', 'cloud.connecting': 'Connecting…', 'cloud.cancel': 'Cancel',
    'cloud.offState': 'Off. With your WebDAV server, your memories stay the same on all your computers.',
    'cloud.pending': ({ host }) => `Connected to ${host}. First sync in progress…`,
    'cloud.ok': ({ ago, host, n }) => `Up to date ${ago} with ${host}, ${n} ${plural(n, 'device', 'devices')}.`,
    'cloud.okWaiting': ({ ago, host, n }) => `Up to date ${ago} with ${host}, ${n} ${plural(n, 'device', 'devices')}. Images sent by another device are still on their way.`,
    'cloud.errAuth': ({ host }) => `${host} rejects the user or password. Disconnect, then connect again with the right password.`,
    'cloud.errPermission': ({ host }) => `Mindrop is no longer allowed to reach ${host}. Disconnect, then connect again.`,
    'cloud.errNetwork': ({ host }) => `${host} does not answer. Next try in 15 minutes.`,
    'cloud.errQuota': ({ host }) => `Your space on ${host} is full.`,
    'cloud.errBusy': ({ host }) => `${host} keeps a file of the folder locked, often because it is open in the server’s file browser. Close it: next try in 15 minutes.`,
    'cloud.errVersion': 'Another device uses a newer version of Mindrop: update the extension here.',
    'cloud.errFormat': ({ file }) => `The file ${file} in the sync folder cannot be read. Delete it on the server: its device will write it again.`,
    'cloud.failed': ({ e }) => `Last attempt failed: ${e}`,
    'cloud.missing': 'Fill in the address, the user and the password.',
    'cloud.badUrl': 'Invalid address: it must start with https://',
    'cloud.denied': 'Permission denied: without it, Mindrop cannot reach this server.',
    'cloud.authFailed': 'User or password rejected. Use an app password, not your account password.',
    'cloud.notFound': 'No WebDAV space at this address: check the server address and the user.',
    'cloud.unreachable': 'Server unreachable: check the address and your connection.',
    'cloud.connectFailed': ({ e }) => `Cannot connect: ${e}`,
    'cloud.toastConnected': 'Sync on', 'cloud.toastOff': 'Sync stopped on this device',
    'cloud.toastDone': ({ pulled, removed }) => (pulled || removed
      ? 'Synced: ' + [pulled && `${pulled} ${plural(pulled, 'memory', 'memories')} received`, removed && `${removed} deleted`].filter(Boolean).join(', ')
      : 'Synced, nothing new'),
    'cloud.toastFailed': 'Sync failed',
    'size.kb': 'KB', 'size.mb': 'MB',

    'popup.modes': 'What to save', 'popup.page': 'Page', 'popup.note': 'Note',
    'popup.capturing': 'Capturing the page…', 'popup.duplicate': 'Already saved',
    'popup.title': 'Title', 'popup.keepQuote': 'Keep the selection as a quote',
    'popup.why': 'Why do I keep this? (optional)', 'popup.note.label': 'Note',
    'popup.tagsPlaceholder': '#tags, separated by spaces', 'popup.tags': 'Tags',
    'popup.save': 'Save', 'popup.noteText': 'An idea, a thought, a reminder… (Markdown welcome: # title, **bold**, - list, - [ ] task)',
    'popup.noteText.label': 'Note in Markdown', 'popup.saveNote': 'Save the note',
    'popup.open': 'Open Mindrop', 'popup.toSave': 'to save', 'popup.done': 'Kept',
    'popup.failed': ({ e }) => `Nothing was saved: ${e}. Try again.`,

    'menu.savePage': 'Save this page', 'menu.saveSelection': 'Save the selection as a quote',
    'menu.saveLink': 'Save this link', 'menu.saveImage': 'Save this image', 'menu.open': 'Open Mindrop',
    'video.channel': ({ a }) => `Channel: ${a}`,
    'storage.blocked': 'Database blocked by another tab: close the other Mindrop tabs.',
    'storage.aborted': 'Saving cancelled',
  },
};

export function resolveLang(pref, browserLang = globalThis.navigator?.language || '') {
  if (LANGS.includes(pref)) return pref;
  return /^fr\b/i.test(browserLang) ? 'fr' : 'en';
}

let current = resolveLang('auto');

export const lang = () => current;
export const locale = () => (current === 'fr' ? 'fr-FR' : 'en-GB');
export const setCurrent = l => { current = resolveLang(l); };

// t('clé', { variables }) : le texte dans la langue courante (le français en secours).
export function t(key, vars = {}) {
  const v = DICT[current][key] ?? DICT.fr[key];
  if (v == null) return key;
  return typeof v === 'function' ? v(vars) : v;
}

export async function getLangPref() {
  try { return (await chrome.storage.local.get(PREF_KEY))[PREF_KEY] || 'auto'; } catch { return 'auto'; }
}

export async function setLangPref(pref) {
  await chrome.storage.local.set({ [PREF_KEY]: LANGS.includes(pref) ? pref : 'auto' });
}

// Charge la langue choisie ; à appeler avant le premier affichage.
export async function loadLang() {
  current = resolveLang(await getLangPref());
  if (globalThis.document) document.documentElement.lang = current;
  return current;
}

export function onLangChange(cb) {
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[PREF_KEY]) cb(); });
}

// Traduit le HTML statique : data-i18n (texte), data-i18n-placeholder, data-i18n-title, data-i18n-aria-label.
/** @param {ParentNode} [root] */
export function translatePage(root = document) {
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-i18n]'))) el.textContent = t(el.dataset.i18n);
  for (const attr of ['placeholder', 'title', 'aria-label']) {
    for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
  }
}

// Types partagés, pour la vérification de types du JavaScript (npm run typecheck).
// Ce fichier n'est jamais chargé par l'extension : il ne sert qu'à TypeScript, via des commentaires JSDoc
// comme /** @param {import('./types').Item} it */.

export type ItemType = 'link' | 'note' | 'quote' | 'image' | 'video';

/** Un souvenir, tel qu'il est rangé dans IndexedDB, exporté et copié pour le pont local. */
export interface Item {
  id: string;
  type: ItemType;
  createdAt: number;
  updatedAt?: number;
  title?: string;
  url?: string;
  /** Texte d'une note (Markdown) ou d'une citation. */
  text?: string;
  /** Note perso, en Markdown. */
  note?: string;
  description?: string;
  /** Texte principal de la page, gardé à l'enregistrement. */
  content?: string;
  /** Image du souvenir : URL web ou data: URL. */
  image?: string;
  /** Capture miniature de la page (data: URL). */
  thumb?: string;
  tags: string[];
  pinned?: boolean;
  color?: string;
}

/** Ce que l'on donne à addItem : l'id et les dates sont complétés ; les tags peuvent être un texte (« #a #b »). */
export type NewItem = Partial<Omit<Item, 'tags'>> & { type: ItemType; tags?: string | string[] };

/** Ce que pageReader() lit dans une page. */
export interface PageMeta {
  title?: string;
  pageTitle?: string;
  description?: string;
  ogImage?: string;
  selection?: string;
  content?: string;
}

/** Connexion au pont local (chrome.runtime.connectNative, ou un double dans les tests). */
export type Connect = () => chrome.runtime.Port;

export interface BridgeOptions {
  connect?: Connect;
  chunkBytes?: number;
}

/** État de la dernière sauvegarde, gardé dans chrome.storage.local. */
export interface BackupStatus {
  ok: boolean;
  at: number;
  count?: number;
  bytes?: number;
  name?: string;
  error?: string;
  notInstalled?: boolean;
}

/** Paramètres de l'outil MCP search_memories. */
export interface SearchOptions {
  query?: string;
  type?: ItemType | 'all';
  tags?: string[];
  pinned?: boolean;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

/** Fichier d'un appareil dans le dossier de synchronisation (devices/<appareil>.json). */
export interface SyncDoc {
  format: 'mindrop-sync';
  version: number;
  device: string;
  /** Souvenirs ; les images encodées y sont remplacées par « mindrop-sync:<fichier> ». */
  items: Item[];
  /** Suppressions : id → date. */
  deleted: Record<string, number>;
}

/** Un fichier ou dossier distant, tel que list() le décrit. */
export interface RemoteEntry {
  name: string;
  dir: boolean;
  etag: string;
  /** Date de dernière modification (ms), si le serveur la donne. */
  modified?: number;
  size?: number;
}

/** Dossier distant de synchronisation ; chemins relatifs à ce dossier, les dossiers finissent par « / ». */
export interface SyncRemote {
  /** Contenu d'un dossier ; null s'il n'existe pas. */
  list(dir: string): Promise<RemoteEntry[] | null>;
  /** null si le fichier n'existe pas. */
  getText(path: string): Promise<string | null>;
  getBytes(path: string): Promise<ArrayBuffer | null>;
  /** Renvoie l'ETag du fichier écrit, ou '' si le serveur ne le donne pas. */
  put(path: string, body: string | Uint8Array, type: string, options?: { create?: boolean }): Promise<string>;
  /** Crée le dossier ; ne fait rien s'il existe. */
  mkdir(dir: string): Promise<void>;
  remove(path: string): Promise<void>;
}

/** Ce qu'un passage de synchronisation retient pour le suivant. */
export interface SyncState {
  /** Fichiers des autres appareils déjà lus : ETag, et images qu'ils utilisent. */
  remotes?: Record<string, { etag: string, refs: string[] }>;
  ownDigest?: string;
  ownEtag?: string;
  gcAt?: number;
  /** ETag de mindrop.json déjà vérifié, et sel de la clé utilisée (dossier chiffré). */
  keyEtag?: string;
  salt?: string;
}

/** Clé d'un dossier chiffré, gardée par l'appareil (jamais la phrase de passe). */
export interface CloudKey {
  /** 512 bits dérivés de la phrase de passe, en base64. */
  raw: string;
  /** Sel du dossier, en base64 (identifie la clé). */
  salt: string;
  /** Contenu de mindrop.json, pour le réécrire s'il disparaît. */
  keyFile: string;
}

/** Opérations de chiffrement utilisées par sync.js (crypt.js : makeCipher). */
export interface SyncCipher {
  salt: string;
  keyFile: string;
  /** HMAC-SHA-256 en hexadécimal : nom des images chiffrées. */
  name(bytes: Uint8Array): Promise<string>;
  seal(bytes: Uint8Array, path: string): Promise<Uint8Array>;
  open(bytes: ArrayBuffer | Uint8Array, path: string): Promise<Uint8Array>;
}

/** Réglages de la synchronisation Nextcloud (chrome.storage.local). */
export interface CloudConfig {
  url: string;
  user: string;
  password: string;
  folder: string;
  /** Adresse WebDAV gardée telle quelle (serveur autre que Nextcloud, servi à la racine). */
  exact?: boolean;
  /** Dossier chiffré : la clé dérivée de la phrase de passe. */
  key?: CloudKey;
}

/** État de la dernière synchronisation, gardé dans chrome.storage.local. */
export interface CloudStatus {
  ok: boolean;
  at: number;
  pulled?: number;
  removed?: number;
  devices?: number;
  waiting?: number;
  encrypted?: boolean;
  error?: string;
  /** 'auth', 'permission', 'network', 'quota', 'version', 'format' (fichier illisible : file), 'http',
   *  'locked' (dossier chiffré, pas de clé ici), 'keyChanged' (autre clé), 'decrypt'. */
  code?: string;
  file?: string;
}

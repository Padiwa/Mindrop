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

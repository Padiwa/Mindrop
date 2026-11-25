// Stockage des souvenirs : IndexedDB, un enregistrement par souvenir.
// Chaque ajout ou modification est une transaction sur un seul souvenir : deux écritures
// simultanées (popup, page principale, menu contextuel, raccourci) ne s'écrasent plus.
// Après chaque écriture, la clé REV de chrome.storage.local change : toutes les pages
// ouvertes et le service worker sont prévenus (onItemsChanged).

import { t as tr } from './i18n.js';

/** @typedef {import('./types').Item} Item */
/** @typedef {import('./types').NewItem} NewItem */

const DB_NAME = 'second-cerveau'; // nom d'origine, gardé : le changer ferait perdre les souvenirs
const DB_VERSION = 1;
const STORE = 'items';
export const KEY = 'items';            // ancien stockage (chrome.storage.local), conservé comme sauvegarde
export const REV = 'itemsRev';
const MIGRATED = 'idbMigrated';

let dbPromise = null;

/**
 * @template T
 * @param {IDBRequest<T>} r
 * @returns {Promise<T>}
 */
function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const store = r.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
      store.createIndex('url', 'url');
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error(tr('storage.blocked')));
  });
}

function db() {
  dbPromise ||= openDb().then(async d => { await migrate(d); return d; });
  return dbPromise.catch(e => { dbPromise = null; throw e; });
}

// Exécute fn(store) dans une transaction ; se résout quand elle est validée sur disque.
/**
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode, { durability: 'strict' });
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error(tr('storage.aborted')));
    Promise.resolve()
      .then(() => fn(t.objectStore(STORE)))
      .then(r => { result = r; }, e => { try { t.abort(); } catch {} reject(e); });
  });
}

// Première ouverture : copie les souvenirs de l'ancien stockage, sans écraser ce qui existe déjà.
async function migrate(d) {
  const r = await chrome.storage.local.get([MIGRATED, KEY]);
  if (r[MIGRATED]) return;
  const old = Array.isArray(r[KEY]) ? r[KEY] : [];
  if (old.length) {
    await new Promise((resolve, reject) => {
      const t = d.transaction(STORE, 'readwrite', { durability: 'strict' });
      const s = t.objectStore(STORE);
      for (const it of old) {
        if (!it?.id) continue;
        s.get(it.id).onsuccess = e => { if (!e.target.result) s.put(it); };
      }
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Migration annulée'));
    });
  }
  await chrome.storage.local.set({ [MIGRATED]: true });
}

async function notify() {
  try { await chrome.storage.local.set({ [REV]: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }); } catch {}
}

/** @param {() => void} cb */
export function onItemsChanged(cb) {
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[REV]) cb(); });
}

const newestFirst = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

/** @returns {Promise<Item[]>} */
export async function getItems() {
  const all = /** @type {Item[]} */ (await tx('readonly', s => req(s.getAll())));
  return all.sort(newestFirst);
}

/**
 * @param {string} id
 * @returns {Promise<Item | undefined>}
 */
export async function getItem(id) {
  return tx('readonly', s => req(s.get(id)));
}

// Remplace tout le contenu (en une seule transaction).
/** @param {Item[]} items */
export async function saveItems(items) {
  await tx('readwrite', s => { s.clear(); for (const it of items) if (it?.id) s.put(it); });
  await notify();
}

// Ajoute ou remplace des souvenirs, sans toucher aux autres.
/** @param {Item[]} items */
export async function putItems(items) {
  if (!items.length) return;
  await tx('readwrite', s => { for (const it of items) if (it?.id) s.put(it); });
  await notify();
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * @param {NewItem} data
 * @returns {Promise<Item>}
 */
export async function addItem(data) {
  const now = Date.now();
  /** @type {Item} */
  const item = {
    id: uid(), type: 'link', title: '', url: '', text: '', note: '',
    description: '', image: '', thumb: '', color: '',
    pinned: false, createdAt: now, updatedAt: now,
    ...data,
    tags: normalizeTags(data.tags),
  };
  await tx('readwrite', s => req(s.add(item)));
  await notify();
  return item;
}

// patch : un objet, ou une fonction qui reçoit le souvenir à jour et renvoie l'objet
// (pour les changements qui dépendent de la valeur actuelle : épingler, cocher une tâche).
/**
 * @param {string} id
 * @param {Partial<Item> | ((cur: Item) => Partial<Item> | null | undefined)} patch
 * @returns {Promise<Item | null>}
 */
export async function updateItem(id, patch) {
  const next = await tx('readwrite', async s => {
    const cur = /** @type {Item | undefined} */ (await req(s.get(id)));
    if (!cur) return null;
    const p = typeof patch === 'function' ? patch(cur) : patch;
    if (!p) return cur;
    const item = { ...cur, ...p, updatedAt: Date.now() };
    if ('tags' in p) item.tags = normalizeTags(p.tags);
    s.put(item);
    return item;
  });
  if (next) await notify();
  return next;
}

/** @param {string} id */
export async function deleteItem(id) {
  await tx('readwrite', s => { s.delete(id); });
  await notify();
}

// Fusionne des souvenirs (import, restauration) : ajoute les absents, remplace ceux qui sont
// plus anciens que la version reçue, ne supprime jamais rien. Tout est vérifié et écrit
// dans une seule transaction.
/**
 * @param {Item[]} incoming
 * @returns {Promise<{ added: number, updated: number }>}
 */
export async function mergeItems(incoming) {
  const result = await tx('readwrite', async s => {
    let added = 0, updated = 0;
    for (const raw of incoming) {
      if (!raw?.id) continue;
      const it = { ...raw, tags: normalizeTags(raw.tags) };
      const ex = await req(s.get(it.id));
      if (!ex) { added++; s.put(it); }
      else if ((it.updatedAt || 0) > (ex.updatedAt || 0)) { updated++; s.put(it); }
    }
    return { added, updated };
  });
  if (result.added || result.updated) await notify();
  return result;
}

/**
 * @param {string} url
 * @returns {Promise<Item | null>}
 */
export async function findByUrl(url) {
  if (!url) return null;
  const list = /** @type {Item[]} */ (await tx('readonly', s => req(s.index('url').getAll(url))));
  return list.find(x => x.type !== 'quote') || null;
}

/**
 * @param {string | string[] | undefined} input
 * @returns {string[]}
 */
export function normalizeTags(input) {
  const arr = Array.isArray(input) ? input : String(input || '').split(/[,\s]+/);
  return [...new Set(arr
    .map(t => String(t).trim().replace(/^#+/, '').toLowerCase())
    .filter(Boolean))];
}

/** @param {string} url */
export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function faviconUrl(url, size = 32) {
  if (!url || !/^https?:/.test(url)) return '';
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', url);
  u.searchParams.set('size', String(size));
  return u.toString();
}

/** @param {string | undefined} url */
export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : '';
}

/**
 * @param {string | undefined} url
 * @returns {import('./types').ItemType}
 */
export function guessType(url) {
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url || '')) return 'image';
  if (youtubeId(url) || /vimeo\.com\/\d+/.test(url || '')) return 'video';
  return 'link';
}

/** @param {string | undefined} url */
export function imageFor(url) {
  const yt = youtubeId(url);
  return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : '';
}

// Réduit une image (dataURL, URL ou Blob) en JPEG compact.
export async function shrinkImage(src, maxW = 640, quality = 0.72) {
  const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxW / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return blobToDataUrl(out);
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(bin)}`;
}

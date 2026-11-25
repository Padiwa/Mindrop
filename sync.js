// Synchronisation entre appareils par un dossier distant (Nextcloud par WebDAV : webdav.js).
// Indépendant de l'extension : la page, le service worker et les tests Node l'utilisent tel quel.
//
// Dans le dossier distant :
//   devices/<appareil>.json   l'état complet d'un appareil : ses souvenirs et ses suppressions.
//                             Chaque appareil n'écrit QUE son fichier : deux appareils n'écrivent
//                             jamais le même fichier, il n'y a donc pas de conflit d'écriture.
//   images/<empreinte>.<ext>  les images encodées (captures, images déposées), sorties des souvenirs,
//                             nommées d'après leur contenu (SHA-256) : écrites une fois, jamais modifiées.
//
// Fusion : pour chaque souvenir, la version modifiée le plus récemment l'emporte ; une suppression
// l'emporte sur les versions plus anciennes qu'elle. Tous les appareils convergent vers le même état.

/** @typedef {import('./types').Item} Item */
/** @typedef {import('./types').SyncDoc} SyncDoc */
/** @typedef {import('./types').SyncRemote} SyncRemote */
/** @typedef {import('./types').SyncState} SyncState */

export const FORMAT = 'mindrop-sync';
export const VERSION = 1;
export const REF = 'mindrop-sync:';           // image sortie du souvenir : « mindrop-sync:<fichier> »
const IMAGE_FIELDS = /** @type {const} */ (['image', 'thumb']);
const DELETED_TTL = 180 * 864e5;              // une suppression est oubliée après 180 jours
const GC_EVERY = 864e5;                       // ménage des images : une fois par jour
const GC_GRACE = 864e5;                       // une image orpheline depuis moins d'un jour est gardée
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

/** @param {Partial<Item>} it */
const stampOf = it => it?.updatedAt || it?.createdAt || 0;

// ---------- fusion ----------

/**
 * Ce que l'appareil doit appliquer après lecture des autres : versions plus récentes et suppressions.
 * @param {Item[]} items souvenirs locaux
 * @param {Record<string, number>} deleted suppressions locales (id → date)
 * @param {SyncDoc[]} docs fichiers des autres appareils
 * @returns {{ put: Item[], deleted: Record<string, number>, from: Map<string, number> }}
 *   from : pour chaque souvenir de put, l'index du fichier d'où il vient
 */
export function plan(items, deleted, docs) {
  const local = new Map(items.map(it => [it.id, it]));
  const gone = { ...deleted };
  const newDeleted = {};
  docs.forEach(doc => {
    for (const [id, at] of Object.entries(doc.deleted || {})) {
      if (typeof at === 'number' && at > (gone[id] || 0)) { gone[id] = at; newDeleted[id] = at; }
    }
  });
  /** @type {Map<string, Item>} */
  const best = new Map();
  const from = new Map();
  docs.forEach((doc, i) => {
    for (const it of doc.items || []) {
      if (!it?.id) continue;
      const cur = best.get(it.id) || local.get(it.id);
      if (!cur || stampOf(it) > stampOf(cur)) { best.set(it.id, it); from.set(it.id, i); }
    }
  });
  const put = [...best.values()].filter(it => !(gone[it.id] >= stampOf(it)));
  return { put, deleted: newDeleted, from };
}

// ---------- images ----------

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
/** @param {BufferSource} data */
export const sha256 = async data => hex(await crypto.subtle.digest('SHA-256', data));

/** @param {string} b64 */
function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** @param {Uint8Array} bytes */
function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Une image encodée (data: URL en base64, format connu) devient un fichier nommé d'après son contenu.
 * @param {string} value
 * @returns {Promise<{ name: string, bytes: Uint8Array, type: string } | null>} null : à laisser dans le souvenir
 */
export async function imageFile(value) {
  const m = /^data:([\w.+-]+\/[\w.+-]+);base64,([\s\S]*)$/.exec(value || '');
  if (!m || !EXT[m[1]]) return null;
  const bytes = fromBase64(m[2]);
  return { name: `${await sha256(bytes)}.${EXT[m[1]]}`, bytes, type: m[1] };
}

/** @param {string} name @param {ArrayBuffer} buf */
export function imageDataUrl(name, buf) {
  return `data:${MIME[name.split('.').pop()] || 'application/octet-stream'};base64,${toBase64(new Uint8Array(buf))}`;
}

/** @param {SyncDoc} doc @returns {string[]} les images dont le fichier a besoin */
export function refsOf(doc) {
  const out = [];
  for (const it of doc.items || []) for (const f of IMAGE_FIELDS) {
    if (typeof it?.[f] === 'string' && it[f].startsWith(REF)) out.push(it[f].slice(REF.length));
  }
  return out;
}

const isImageName = name => /^[0-9a-f]{64}\.[a-z]+$/.test(name);

// Nom du fichier d'une image d'un souvenir, retenu tant que le souvenir ne change pas :
// chaque passage n'a pas à décoder et hacher de nouveau toutes les images.
const names = new Map();
/** @param {Item} it @param {'image' | 'thumb'} f @returns {Promise<string | null>} */
async function imageName(it, f) {
  if (typeof it?.[f] !== 'string' || !it[f].startsWith('data:')) return null;
  const key = `${it.id}|${f}|${stampOf(it)}|${it[f].length}`;
  if (!names.has(key)) {
    if (names.size > 5000) names.clear();
    names.set(key, (await imageFile(it[f]))?.name ?? null);
  }
  return names.get(key);
}

// ---------- un passage de synchronisation ----------

/** @param {string} text @param {string} name */
function parseDoc(text, name) {
  let doc;
  const bad = () => Object.assign(new Error(`devices/${name}: not a Mindrop sync file`), { code: 'format', file: `devices/${name}` });
  try { doc = JSON.parse(text); } catch { throw bad(); }
  if (doc?.format !== FORMAT || !Array.isArray(doc.items)) throw bad();
  if (doc.version > VERSION) throw Object.assign(new Error(`devices/${name}: format version ${doc.version}`), { code: 'version' });
  return /** @type {SyncDoc} */ (doc);
}

/**
 * Lit les autres appareils, applique ce qui est plus récent, puis écrit le fichier de cet appareil.
 * @param {object} o
 * @param {SyncRemote} o.remote le dossier distant
 * @param {{ getItems(): Promise<Item[]>, getDeleted(): Promise<Record<string, number>>,
 *   applySync(c: { put?: Item[], deleted?: Record<string, number>, forget?: string[] }): Promise<{ put: number, removed: number }> }} o.local
 * @param {string} o.device identifiant de cet appareil
 * @param {SyncState} [o.state] ce que le passage précédent a retenu
 * @param {number} [o.now]
 * @returns {Promise<{ state: SyncState, pulled: number, removed: number, pushed: boolean, devices: number, waiting: number }>}
 */
export async function syncOnce({ remote, local, device, state = {}, now = Date.now() }) {
  const own = `${device}.json`;
  let files = await remote.list('devices/');
  if (!files) {
    await remote.mkdir('');
    await remote.mkdir('devices/');
    await remote.mkdir('images/');
    files = [];
  }
  const jsonFiles = files.filter(f => !f.dir && f.name.endsWith('.json'));

  // 1. les autres appareils dont le fichier a changé depuis le dernier passage
  const prev = state.remotes || {};
  /** @type {Record<string, { etag: string, refs: string[] }>} */
  const remotes = {};
  const changed = [];
  for (const f of jsonFiles) {
    if (f.name === own) continue;
    if (prev[f.name] && prev[f.name].etag === f.etag) { remotes[f.name] = prev[f.name]; continue; }
    const got = await remote.getText(`devices/${f.name}`);
    if (got == null) continue; // supprimé entre-temps
    changed.push({ name: f.name, etag: f.etag, doc: parseDoc(got, f.name) });
  }

  // 2. ce qui est plus récent ailleurs, images comprises
  const items = await local.getItems();
  const byId = new Map(items.map(it => [it.id, it]));
  const { put, deleted, from } = plan(items, await local.getDeleted(), changed.map(c => c.doc));
  const ready = [];
  const waiting = new Set(); // fichiers dont une image manque encore : relus au prochain passage
  for (const it of put) {
    const copy = { ...it };
    try {
      for (const f of IMAGE_FIELDS) {
        const v = copy[f];
        if (typeof v !== 'string' || !v.startsWith(REF)) continue;
        const name = v.slice(REF.length);
        const mine = byId.get(it.id);
        if (mine && (await imageName(mine, f)) === name) { copy[f] = mine[f]; continue; }
        if (!isImageName(name)) throw Object.assign(new Error(name), { missing: true });
        const buf = await remote.getBytes(`images/${name}`);
        if (!buf) throw Object.assign(new Error(name), { missing: true });
        copy[f] = imageDataUrl(name, buf);
      }
      ready.push(copy);
    } catch (e) {
      if (!e.missing) throw e;
      waiting.add(changed[from.get(it.id)].name);
    }
  }
  const stale = Object.entries(await local.getDeleted()).filter(([, at]) => now - at > DELETED_TTL).map(([id]) => id);
  const applied = await local.applySync({ put: ready, deleted, forget: stale });
  for (const c of changed) if (!waiting.has(c.name)) remotes[c.name] = { etag: c.etag, refs: refsOf(c.doc) };

  // 3. le fichier de cet appareil, images d'abord (un autre appareil ne doit jamais lire une référence absente)
  let images = await remote.list('images/');
  if (!images) { await remote.mkdir('images/'); images = []; }
  const present = new Set(images.map(f => f.name));
  const mine = await local.getItems();
  const myDeleted = Object.fromEntries(Object.entries(await local.getDeleted()).filter(([, at]) => now - at <= DELETED_TTL));
  const outItems = [];
  for (const it of mine) {
    const copy = { ...it };
    for (const f of IMAGE_FIELDS) {
      const name = await imageName(it, f);
      if (!name) continue;
      if (!present.has(name)) {
        const file = await imageFile(it[f]);
        await remote.put(`images/${name}`, file.bytes, file.type);
        present.add(name);
      }
      copy[f] = REF + name;
    }
    outItems.push(copy);
  }
  /** @type {SyncDoc} */
  const doc = { format: FORMAT, version: VERSION, device, items: outItems, deleted: myDeleted };
  const text = JSON.stringify(doc);
  const digest = await sha256(new TextEncoder().encode(text));
  const ownFile = jsonFiles.find(f => f.name === own);
  const same = digest === state.ownDigest && ownFile && (!state.ownEtag || state.ownEtag === ownFile.etag);
  let ownEtag = state.ownEtag;
  if (!same) ownEtag = await remote.put(`devices/${own}`, text, 'application/json') || '';

  // 4. ménage, une fois par jour : images qu'aucun appareil n'utilise plus depuis au moins un jour
  let gcAt = state.gcAt || 0;
  if (now - gcAt > GC_EVERY && !waiting.size) {
    const used = new Set(refsOf(doc));
    for (const r of Object.values(remotes)) for (const n of r.refs) used.add(n);
    for (const f of images) {
      if (f.dir || !isImageName(f.name) || used.has(f.name)) continue;
      if (f.modified && now - f.modified > GC_GRACE) await remote.remove(`images/${f.name}`);
    }
    gcAt = now;
  }

  return {
    state: { remotes, ownDigest: digest, ownEtag, gcAt },
    pulled: applied.put, removed: applied.removed, pushed: !same,
    devices: new Set([...jsonFiles.map(f => f.name), own]).size,
    waiting: waiting.size,
  };
}

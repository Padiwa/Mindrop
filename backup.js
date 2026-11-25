// Sauvegarde automatique via le pont local (mcp/host.mjs) : copie complète, images comprises,
// dans ~/.local/share/second-cerveau/backups/AAAA-MM-JJ.json (30 derniers jours).
import { getItems } from './storage.js';

export const HOST = 'com.second_cerveau.bridge'; // nom d'origine, gardé : le changer couperait le pont installé
export const STATUS_KEY = 'backupStatus';
const CHUNK_BYTES = 8 * 1024 * 1024;   // bien sous la limite de 64 Mo par message vers le pont

const NOT_INSTALLED = /not found|introuvable|forbidden|not allowed/i;

// Une connexion au pont : chaque demande reçoit une ou plusieurs réponses (« more: true » = la suite arrive).
/** @param {import('./types').Connect} [connect] */
export function openBridge(connect = () => chrome.runtime.connectNative(HOST)) {
  const port = connect();
  const queue = [];
  let closed = null;
  port.onMessage.addListener(msg => {
    const q = queue[0];
    if (!q) return;
    q.parts.push(msg);
    if (msg?.more) return;
    queue.shift();
    if (msg?.ok === false) q.reject(new Error(msg.error || 'erreur du pont local'));
    else q.resolve(q.parts);
  });
  port.onDisconnect.addListener(() => {
    const raw = chrome.runtime.lastError?.message || 'connexion au pont local fermée';
    closed = Object.assign(new Error(raw), { notInstalled: NOT_INSTALLED.test(raw) });
    while (queue.length) queue.shift().reject(closed);
  });
  return {
    ask(msg) {
      if (closed) return Promise.reject(closed);
      return new Promise((resolve, reject) => { queue.push({ resolve, reject, parts: [] }); port.postMessage(msg); });
    },
    close() { if (!closed) { closed = new Error('fermé'); port.disconnect(); } },
  };
}

// Découpe la liste en paquets d'environ maxBytes (au moins un souvenir par paquet).
export function chunkItems(items, maxBytes = CHUNK_BYTES) {
  const out = [];
  let batch = [], size = 0;
  for (const it of items) {
    const n = JSON.stringify(it).length;
    if (batch.length && size + n > maxBytes) { out.push(batch); batch = []; size = 0; }
    batch.push(it); size += n;
  }
  if (batch.length) out.push(batch);
  return out;
}

/** @param {import('./types').BridgeOptions} [opts] */
export async function runBackup({ connect, chunkBytes } = {}) {
  let status;
  let bridge;
  try {
    const items = await getItems();
    // Une base vide (extension tout juste réinstallée) ne remplace jamais une sauvegarde.
    if (!items.length) return getBackupStatus();
    bridge = openBridge(connect);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await bridge.ask({ type: 'backup-begin', id, total: items.length, exportedAt: new Date().toISOString() });
    for (const batch of chunkItems(items, chunkBytes)) await bridge.ask({ type: 'backup-chunk', id, items: batch });
    const [res] = await bridge.ask({ type: 'backup-end', id });
    status = { ok: true, at: Date.now(), count: res.count, bytes: res.bytes, name: res.name };
  } catch (e) {
    status = { ok: false, at: Date.now(), error: String(e.message || e), notInstalled: !!e.notInstalled };
  } finally {
    bridge?.close();
  }
  await chrome.storage.local.set({ [STATUS_KEY]: status });
  return status;
}

/** @returns {Promise<import('./types').BackupStatus | null>} */
export async function getBackupStatus() {
  const got = await chrome.storage.local.get(STATUS_KEY);
  return /** @type {import('./types').BackupStatus} */ (got[STATUS_KEY]) || null;
}

/** @param {import('./types').BridgeOptions} [opts] */
export async function listBackups({ connect } = {}) {
  const bridge = openBridge(connect);
  try { return (await bridge.ask({ type: 'list-backups' }))[0].backups; }
  finally { bridge.close(); }
}

/**
 * @param {string} name
 * @param {import('./types').BridgeOptions} [opts]
 */
export async function readBackup(name, { connect } = {}) {
  const bridge = openBridge(connect);
  try {
    const parts = await bridge.ask({ type: 'read-backup', name });
    const last = parts[parts.length - 1];
    return { items: parts.flatMap(p => p.items || []), total: last.total, skippedImages: last.skippedImages || 0 };
  } finally { bridge.close(); }
}

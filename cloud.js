// Synchronisation WebDAV (Nextcloud, ownCloud, NAS…) : réglages, autorisation d'accès au serveur, passages (sync.js par webdav.js).
// Désactivée tant que l'utilisateur ne l'a pas configurée dans les Réglages de la page principale.
// Un seul passage à la fois, même lancé à la fois par la page et par le service worker (verrou Web Locks).
// Chiffrement (crypt.js) : facultatif, choisi à la connexion par une phrase de passe. Seule la clé qui en est
// dérivée est gardée ici, jamais la phrase elle-même.

import { getItems, getDeleted, applySync, uid } from './storage.js';
import { syncOnce } from './sync.js';
import { createDav, originPattern } from './webdav.js';
import { KEY_FILE, createKey, unlockKey, makeCipher } from './crypt.js';

/** @typedef {import('./types').CloudConfig} CloudConfig */
/** @typedef {import('./types').CloudStatus} CloudStatus */

export const CONFIG_KEY = 'cloudConfig';
export const CLOUD_STATUS_KEY = 'cloudStatus';
const STATE_KEY = 'cloudState';
const DEVICE_KEY = 'cloudDevice';
export const PERIODIC_ALARM = 'cloud-periodic';
export const CHANGE_ALARM = 'cloud';
const LOCK = 'mindrop-cloud-sync';

/** @returns {Promise<CloudConfig | null>} */
export async function getCloudConfig() {
  return /** @type {CloudConfig} */ ((await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY]) || null;
}

/** @returns {Promise<CloudStatus | null>} */
export async function getCloudStatus() {
  return /** @type {CloudStatus} */ ((await chrome.storage.local.get(CLOUD_STATUS_KEY))[CLOUD_STATUS_KEY]) || null;
}

// Identifiant de cet appareil : nom de son fichier dans le dossier distant.
/** @returns {Promise<string>} */
async function deviceId() {
  const cur = /** @type {string} */ ((await chrome.storage.local.get(DEVICE_KEY))[DEVICE_KEY]);
  if (cur) return cur;
  const id = uid();
  await chrome.storage.local.set({ [DEVICE_KEY]: id });
  return id;
}

/** @param {CloudConfig} cfg */
export const hostOf = cfg => { try { return new URL(cfg.url).host; } catch { return cfg?.url || ''; } };

/**
 * Autorisation d'accès au serveur. À appeler directement dans le clic de l'utilisateur
 * (le navigateur refuse sinon), avant tout await.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export function requestAccess(url) {
  return chrome.permissions.request({ origins: [originPattern(url)] });
}

export const MIN_PASSPHRASE = 12;

/**
 * Vérifie l'adresse et l'identifiant, crée le dossier, prépare la clé, enregistre les réglages, puis synchronise.
 * Dossier déjà chiffré : la phrase de passe est obligatoire (code 'needPassphrase', 'passphrase' si fausse).
 * Dossier en clair et phrase de passe donnée : le dossier passe au chiffrement (code 'weak' si elle est trop courte).
 * @param {CloudConfig & { passphrase?: string }} cfg
 * @returns {Promise<CloudStatus>}
 */
export async function connectCloud({ passphrase = '', ...cfg }) {
  /** @type {CloudConfig} */
  const clean = { url: cfg.url.trim(), user: cfg.user.trim(), password: cfg.password, folder: (cfg.folder || '').trim() || 'Mindrop' };
  let dav = createDav(clean);
  try {
    await dav.check();
  } catch (e) {
    // Adresse nue : ce n'est peut-être pas un Nextcloud, mais un serveur WebDAV servi à cette adresse même.
    const bare = /^\/?$/.test(new URL(clean.url).pathname);
    if (!bare || (e.code !== 'url' && e.code !== 'http')) throw e;
    const plain = createDav({ ...clean, exact: true });
    try { await plain.check(); } catch { throw e; }
    clean.exact = true;
    dav = plain;
  }
  await dav.mkdir('');
  let keyText = await dav.getText(KEY_FILE);
  if (keyText == null && passphrase) {
    if (passphrase.length < MIN_PASSPHRASE) throw Object.assign(new Error('passphrase too short'), { code: 'weak' });
    const key = await createKey(passphrase);
    try {
      await dav.put(KEY_FILE, key.keyFile, 'application/json', { create: true });
      // Relu : certains serveurs WebDAV (rclone) ignorent If-None-Match et laissent gagner le dernier écrit.
      const back = await dav.getText(KEY_FILE);
      if (back === key.keyFile) clean.key = key;
      else keyText = back;
    } catch (e) {
      if (e.code !== 'exists') throw e;
      keyText = await dav.getText(KEY_FILE); // un autre appareil l'a créé au même moment : on l'ouvre
    }
  }
  if (keyText != null) {
    if (!passphrase) throw Object.assign(new Error('folder is encrypted'), { code: 'needPassphrase' });
    clean.key = await unlockKey(keyText, passphrase);
  }
  await chrome.storage.local.remove([STATE_KEY, CLOUD_STATUS_KEY]);
  await chrome.storage.local.set({ [CONFIG_KEY]: clean });
  chrome.alarms?.create(PERIODIC_ALARM, { periodInMinutes: 15 });
  return runCloudSync();
}

// Arrête la synchronisation ici. Rien n'est effacé, ni sur cet appareil ni sur le serveur.
export async function disconnectCloud() {
  const cfg = await getCloudConfig();
  await chrome.storage.local.remove([CONFIG_KEY, STATE_KEY, CLOUD_STATUS_KEY]);
  await chrome.alarms?.clear(PERIODIC_ALARM);
  if (cfg) { try { await chrome.permissions.remove({ origins: [originPattern(cfg.url)] }); } catch {} }
}

/** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
const exclusive = fn => (globalThis.navigator?.locks ? navigator.locks.request(LOCK, fn) : fn());

/**
 * Un passage de synchronisation ; null si elle n'est pas configurée.
 * @returns {Promise<CloudStatus | null>}
 */
export function runCloudSync() {
  return exclusive(async () => {
    const cfg = await getCloudConfig();
    if (!cfg) return null;
    /** @type {CloudStatus} */
    let status;
    try {
      if (!(await chrome.permissions.contains({ origins: [originPattern(cfg.url)] }))) {
        throw Object.assign(new Error('permission'), { code: 'permission' });
      }
      const state = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] || {};
      const cipher = cfg.key ? await makeCipher(cfg.key) : null;
      const r = await syncOnce({ remote: createDav(cfg), local: { getItems, getDeleted, applySync }, device: await deviceId(), cipher, state });
      await chrome.storage.local.set({ [STATE_KEY]: r.state });
      status = { ok: true, at: Date.now(), pulled: r.pulled, removed: r.removed, devices: r.devices, waiting: r.waiting, encrypted: !!cipher };
    } catch (e) {
      status = { ok: false, at: Date.now(), error: String(e?.message || e), code: e?.code, file: e?.file };
    }
    // réglages retirés pendant le passage (Déconnecter) : pas d'état à garder
    if (await getCloudConfig()) await chrome.storage.local.set({ [CLOUD_STATUS_KEY]: status });
    return status;
  });
}

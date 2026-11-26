// Chiffrement de bout en bout de la synchronisation (sync.js), avec l'API Web Crypto.
//
// Une phrase de passe, que seul l'utilisateur connaît, donne la clé (PBKDF2-SHA-256). Le serveur ne voit que
// des fichiers illisibles : souvenirs et images chiffrés en AES-256-GCM, noms d'images tirés d'un HMAC
// (et non d'un simple hachage : on ne peut pas reconnaître une image connue à son nom).
//
// mindrop.json, à la racine du dossier, est lisible par tous les appareils : il donne le sel et le nombre
// d'itérations, et une valeur témoin chiffrée qui dit tout de suite si la phrase de passe est la bonne.
// Il ne contient rien qui permette de retrouver la clé sans la phrase de passe.
//
// Chaque contenu chiffré est lié à son chemin (données associées de GCM) : le serveur ne peut pas
// échanger deux fichiers, ni présenter le fichier d'un appareil comme celui d'un autre.

/** @typedef {import('./types').SyncCipher} SyncCipher */
/** @typedef {import('./types').CloudKey} CloudKey */

export const KEY_FILE = 'mindrop.json';
export const KEY_FORMAT = 'mindrop-sync-key';
export const ITERATIONS = 600_000;
const MIN_ITERATIONS = 10_000;
const MAGIC = [0x4d, 0x44, 0x43, 0x31];        // « MDC1 »
const CHECK = 'mindrop';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** @param {Uint8Array} bytes */
export function toB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
/** @param {string} b64 */
export function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const fail = (code, message) => Object.assign(new Error(message), { code });

/** 512 bits : 256 pour AES-GCM, 256 pour le HMAC des noms. */
async function derive(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 512));
}

/**
 * Clés de travail à partir des 512 bits dérivés.
 * @param {CloudKey} key
 * @returns {Promise<SyncCipher>}
 */
export async function makeCipher(key) {
  const raw = fromB64(key.raw);
  const aes = await crypto.subtle.importKey('raw', raw.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const mac = await crypto.subtle.importKey('raw', raw.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return {
    salt: key.salt,
    keyFile: key.keyFile,
    async name(bytes) {
      const sig = new Uint8Array(await crypto.subtle.sign('HMAC', mac, /** @type {BufferSource} */ (bytes)));
      return [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
    },
    async seal(bytes, path) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(path) }, aes, /** @type {BufferSource} */ (bytes)));
      const out = new Uint8Array(4 + 12 + ct.length);
      out.set(MAGIC); out.set(iv, 4); out.set(ct, 16);
      return out;
    },
    async open(bytes, path) {
      const b = new Uint8Array(bytes);
      if (b.length < 16 + 16 || MAGIC.some((m, i) => b[i] !== m)) throw fail('decrypt', `${path}: not an encrypted Mindrop file`);
      try {
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(4, 16), additionalData: enc.encode(path) }, aes, b.subarray(16)));
      } catch {
        throw fail('decrypt', `${path}: cannot decrypt (wrong key, or file altered or moved)`);
      }
    },
  };
}

/**
 * Nouveau fichier de clé pour un dossier qui n'est pas encore chiffré.
 * @param {string} passphrase
 * @param {{ iterations?: number }} [o]
 * @returns {Promise<CloudKey>}
 */
export async function createKey(passphrase, { iterations = ITERATIONS } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const raw = await derive(passphrase, salt, iterations);
  const key = { raw: toB64(raw), salt: toB64(salt), keyFile: '' };
  const check = await (await makeCipher(key)).seal(enc.encode(CHECK), KEY_FILE);
  key.keyFile = JSON.stringify({
    format: KEY_FORMAT, version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: key.salt },
    cipher: 'AES-256-GCM',
    check: toB64(check),
  }, null, 2) + '\n';
  return key;
}

/** @param {string} text */
export function readKeyFile(text) {
  let f;
  try { f = JSON.parse(text); } catch { throw fail('format', `${KEY_FILE}: invalid JSON`); }
  if (f?.format !== KEY_FORMAT || f.kdf?.name !== 'PBKDF2' || f.kdf.hash !== 'SHA-256' || typeof f.kdf.salt !== 'string' || typeof f.check !== 'string') {
    throw fail('format', `${KEY_FILE}: not a Mindrop key file`);
  }
  if (f.version > 1) throw fail('version', `${KEY_FILE}: format version ${f.version}`);
  if (!(f.kdf.iterations >= MIN_ITERATIONS)) throw fail('format', `${KEY_FILE}: too few iterations`);
  return /** @type {{ kdf: { iterations: number, salt: string }, check: string }} */ (f);
}

/**
 * Ouvre le fichier de clé d'un dossier déjà chiffré avec la phrase de passe.
 * @param {string} text contenu de mindrop.json
 * @param {string} passphrase
 * @returns {Promise<CloudKey>} code 'passphrase' si elle est fausse
 */
export async function unlockKey(text, passphrase) {
  const f = readKeyFile(text);
  const raw = await derive(passphrase, fromB64(f.kdf.salt), f.kdf.iterations);
  const key = { raw: toB64(raw), salt: f.kdf.salt, keyFile: text };
  try {
    const got = await (await makeCipher(key)).open(fromB64(f.check), KEY_FILE);
    if (dec.decode(got) !== CHECK) throw new Error();
  } catch {
    throw fail('passphrase', 'wrong passphrase');
  }
  return key;
}

// ---------- enveloppes ----------

export const SEALED_FORMAT = 'mindrop-sync-encrypted';

/** Texte (JSON d'un appareil) → enveloppe JSON chiffrée. @param {SyncCipher} cipher @param {string} text @param {string} path */
export async function sealText(cipher, text, path) {
  return JSON.stringify({ format: SEALED_FORMAT, version: 1, data: toB64(await cipher.seal(enc.encode(text), path)) });
}
/** @param {SyncCipher} cipher @param {{ data: string }} envelope @param {string} path */
export async function openText(cipher, envelope, path) {
  return dec.decode(await cipher.open(fromB64(envelope.data), path));
}

/** Image : type MIME et octets, chiffrés ensemble. @param {SyncCipher} cipher @param {string} type @param {Uint8Array} bytes @param {string} path */
export async function sealImage(cipher, type, bytes, path) {
  const t = enc.encode(type);
  const plain = new Uint8Array(1 + t.length + bytes.length);
  plain[0] = t.length; plain.set(t, 1); plain.set(bytes, 1 + t.length);
  return cipher.seal(plain, path);
}
/** @param {SyncCipher} cipher @param {ArrayBuffer} buf @param {string} path */
export async function openImage(cipher, buf, path) {
  const plain = await cipher.open(buf, path);
  const n = plain[0];
  return { type: dec.decode(plain.subarray(1, 1 + n)), bytes: plain.subarray(1 + n) };
}

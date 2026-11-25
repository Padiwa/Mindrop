// Accès des agents (serveur MCP) : interrupteur et copie légère envoyée au pont local.
// Activé (par défaut) : la copie des souvenirs, sans images encodées, est tenue à jour pour le serveur MCP.
// Désactivé : la copie est effacée et remplacée par un marqueur ; le serveur MCP répond que l'accès est coupé.
// La sauvegarde automatique (backup.js) ne dépend pas de cet interrupteur.
import { getItems } from './storage.js';
import { HOST } from './backup.js';

export const ACCESS_KEY = 'agentAccess';
export const SYNC_KEY = 'agentSync';
const NOT_INSTALLED = /not found|introuvable|forbidden|not allowed/i;

export async function isAgentEnabled() {
  return (await chrome.storage.local.get(ACCESS_KEY))[ACCESS_KEY] !== false;
}

export async function setAgentEnabled(on) {
  await chrome.storage.local.set({ [ACCESS_KEY]: !!on });
}

export async function getAgentSync() {
  return (await chrome.storage.local.get(SYNC_KEY))[SYNC_KEY] || null;
}

// Ce que l'agent peut lire : tout sauf les images encodées (captures, images déposées).
/** @param {import('./types').Item[]} items */
export function shareable(items) {
  return items.map(({ thumb, image, ...x }) => ({ ...x, image: /^https?:/.test(image || '') ? image : '' }));
}

export async function syncAgent({ send = msg => chrome.runtime.sendNativeMessage(HOST, msg) } = {}) {
  const enabled = await isAgentEnabled();
  let status;
  try {
    let res;
    if (enabled) {
      const items = shareable(await getItems());
      res = await send({ type: 'snapshot', syncedAt: new Date().toISOString(), items });
      status = { ok: true, enabled, at: Date.now(), count: items.length };
    } else {
      res = await send({ type: 'disable-agent' });
      status = { ok: true, enabled, at: Date.now() };
    }
    if (res?.ok === false) throw new Error(res.error || 'erreur du pont local');
  } catch (e) {
    const msg = String(e?.message || e);
    status = { ok: false, enabled, at: Date.now(), error: msg, notInstalled: NOT_INSTALLED.test(msg) };
  }
  await chrome.storage.local.set({ [SYNC_KEY]: status });
  return status;
}

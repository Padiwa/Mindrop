// Client WebDAV minimal pour la synchronisation (sync.js) : Nextcloud, ownCloud, et tout serveur WebDAV.
// Sans DOMParser (absent du service worker) : les réponses PROPFIND sont lues avec des expressions régulières.

/** @typedef {import('./types').RemoteEntry} RemoteEntry */
/** @typedef {import('./types').SyncRemote} SyncRemote */
/** @typedef {import('./types').CloudConfig} CloudConfig */

/**
 * Adresse WebDAV de l'espace de l'utilisateur. L'adresse d'un serveur Nextcloud
 * (https://cloud.exemple.fr) donne https://cloud.exemple.fr/remote.php/dav/files/<utilisateur>/ ;
 * une adresse WebDAV complète (celle qu'affiche Nextcloud dans Fichiers, Paramètres) est gardée telle quelle.
 * @param {string} url
 * @param {string} user
 */
export function davRoot(url, user) {
  const u = new URL(String(url).trim());
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('https:// required'), { code: 'url' });
  if (u.protocol === 'http:' && !isLocal(u.hostname)) throw Object.assign(new Error('https:// required'), { code: 'url' });
  u.search = ''; u.hash = '';
  let path = u.pathname.replace(/\/+$/, '');
  if (!path || path === '/index.php') path = `/remote.php/dav/files/${encodeURIComponent(user)}`;
  else if (/\/remote\.php\/dav$/.test(path)) path += `/files/${encodeURIComponent(user)}`;
  else if (/\/remote\.php\/webdav$/.test(path)) path = path.replace(/webdav$/, `dav/files/${encodeURIComponent(user)}`);
  u.pathname = path + '/';
  return u.href;
}

/** @param {string} host */
export const isLocal = host => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

/** Motif d'autorisation d'accès au serveur (permissions optionnelles), sans le port. @param {string} url */
export function originPattern(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

const tag = (block, name) => {
  const m = new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`).exec(block);
  return m ? m[1].trim() : undefined;
};
const unxml = s => s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi, (_, n, d, x) =>
  d ? String.fromCodePoint(+d) : x ? String.fromCodePoint(parseInt(x, 16)) : { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[n.toLowerCase()]);
/** @param {string | null | undefined} e */
export const cleanEtag = e => (e || '').replace(/^W\//, '').replace(/^"|"$/g, '');

/**
 * Réponse PROPFIND (207 Multi-Status) → entrées, chemins (href) décodés.
 * @param {string} xml
 * @returns {Array<RemoteEntry & { href: string }>}
 */
export function parseMultistatus(xml) {
  const out = [];
  const re = /<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/g;
  for (let m; (m = re.exec(xml));) {
    const block = m[1];
    const raw = tag(block, 'href');
    if (!raw) continue;
    let href = unxml(raw);
    try { href = decodeURIComponent(new URL(href, 'http://x').pathname); } catch {}
    const dir = /<(?:[\w-]+:)?collection\b/.test(block);
    const name = href.replace(/\/+$/, '').split('/').pop() || '';
    const lm = tag(block, 'getlastmodified');
    const size = tag(block, 'getcontentlength');
    out.push({
      href, name, dir,
      etag: cleanEtag(unxml(tag(block, 'getetag') || '')),
      modified: lm ? Date.parse(lm) || undefined : undefined,
      size: size != null ? Number(size) : undefined,
    });
  }
  return out;
}

const PROPFIND = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getlastmodified/><d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>';

/** @param {string} s */
const basic = s => 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode(s)));

// Erreur d'un appel WebDAV, en termes techniques (la page la traduit d'après son code) :
// 'auth' si l'identifiant est refusé, 'quota' si l'espace est plein, 'http' sinon.
function httpError(res, what) {
  const code = res.status === 401 || res.status === 403 ? 'auth' : res.status === 507 ? 'quota' : 'http';
  return Object.assign(new Error(`${what}: HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}`), { code, status: res.status });
}

/**
 * Le dossier de synchronisation sur le serveur : <espace>/<folder>/.
 * @param {CloudConfig & { fetch?: typeof fetch }} cfg
 * @returns {SyncRemote & { root: string, base: string, check(): Promise<void> }}
 */
export function createDav({ url, user, password, folder = 'Mindrop', fetch: f = globalThis.fetch.bind(globalThis) }) {
  const root = davRoot(url, user);
  const segments = String(folder || 'Mindrop').split('/').map(s => s.trim()).filter(s => s && s !== '.' && s !== '..');
  if (!segments.length) segments.push('Mindrop');
  const base = root + segments.map(encodeURIComponent).join('/') + '/';
  const auth = basic(`${user}:${password}`);
  const at = path => base + String(path).split('/').map(encodeURIComponent).join('/');

  /** @param {string} target @param {string} method @param {RequestInit & { headers?: Record<string, string> }} [init] */
  const call = async (target, method, init = {}) => {
    try {
      return await f(target, { ...init, method, headers: { Authorization: auth, ...init.headers }, credentials: 'omit', cache: 'no-store', redirect: 'follow' });
    } catch (e) {
      throw Object.assign(new Error(`${method} ${decodeURIComponent(new URL(target).pathname)}: ${e?.message || e}`), { code: 'network' });
    }
  };
  const propfind = (target, depth) => call(target, 'PROPFIND', { headers: { Depth: String(depth), 'Content-Type': 'application/xml; charset=utf-8' }, body: PROPFIND });

  return {
    root, base,

    // Identifiant, mot de passe et adresse corrects ? (l'espace de l'utilisateur doit répondre)
    async check() {
      const res = await propfind(root, 0);
      if (res.status === 207) return;
      if (res.status === 404) throw Object.assign(new Error(`PROPFIND ${root}: HTTP 404`), { code: 'url' });
      throw httpError(res, `PROPFIND ${root}`);
    },

    async list(dir) {
      const target = at(dir);
      const res = await propfind(target, 1);
      if (res.status === 404) return null;
      if (res.status !== 207) throw httpError(res, `PROPFIND ${dir || '/'}`);
      const self = decodeURIComponent(new URL(target).pathname).replace(/\/+$/, '');
      return parseMultistatus(await res.text())
        .filter(e => e.href.replace(/\/+$/, '') !== self)
        .map(({ href, ...e }) => e);
    },

    async getText(path) {
      const res = await call(at(path), 'GET');
      if (res.status === 404) return null;
      if (!res.ok) throw httpError(res, `GET ${path}`);
      return res.text();
    },

    async getBytes(path) {
      const res = await call(at(path), 'GET');
      if (res.status === 404) return null;
      if (!res.ok) throw httpError(res, `GET ${path}`);
      return res.arrayBuffer();
    },

    async put(path, body, type) {
      const res = await call(at(path), 'PUT', { headers: { 'Content-Type': type }, body: /** @type {BodyInit} */ (body) });
      if (!res.ok) throw httpError(res, `PUT ${path}`);
      return cleanEtag(res.headers.get('oc-etag') || res.headers.get('etag'));
    },

    async mkdir(dir) {
      // le dossier lui-même (« ») crée aussi ses parents : <folder> peut être « Applis/Mindrop »
      const parts = dir ? [at(dir)] : segments.map((_, i) => root + segments.slice(0, i + 1).map(encodeURIComponent).join('/') + '/');
      for (const target of parts) {
        const res = await call(target, 'MKCOL');
        if (res.ok || res.status === 405) continue; // 405 : existe déjà
        throw httpError(res, `MKCOL ${decodeURIComponent(new URL(target).pathname)}`);
      }
    },

    async remove(path) {
      const res = await call(at(path), 'DELETE');
      if (!res.ok && res.status !== 404) throw httpError(res, `DELETE ${path}`);
    },
  };
}

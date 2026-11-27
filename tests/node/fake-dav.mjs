// Petit serveur WebDAV en mémoire, à la façon de Nextcloud (/remote.php/dav/files/<utilisateur>/),
// pour tester webdav.js et sync.js sans serveur réel.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { syncOnce } from '../../sync.js';

/**
 * space : '' pour un serveur WebDAV servi à la racine (Apache, rclone…) ;
 * ignoreIfNoneMatch : comme rclone, qui écrase même avec If-None-Match: *.
 * @param {{ user?: string, password?: string, space?: string, ignoreIfNoneMatch?: boolean }} [o]
 */
export async function startDav({ user = 'alice', password = 'app-pass', space = `/remote.php/dav/files/${user}`, ignoreIfNoneMatch = false } = {}) {
  const files = new Map();          // chemin décodé → { body: Buffer, etag, mtime, type }
  const dirs = new Set([space]);
  const log = [];
  const locked = new Set();         // chemins décodés qui répondent 423 Locked
  let clock = Date.now();
  const parent = p => p.replace(/\/[^/]+$/, '');
  const norm = p => decodeURIComponent(p).replace(/\/+$/, '');

  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const path = norm(new URL(req.url, 'http://x').pathname);
    log.push(`${req.method} ${path}`);
    if (req.headers.authorization !== 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Nextcloud"' }); return res.end();
    }
    if (!path.startsWith(space)) { res.writeHead(404); return res.end(); }
    const entry = (p, dir) => {
      const f = files.get(p);
      const href = p.split('/').map(encodeURIComponent).join('/') + (dir ? '/' : '');
      return `<d:response><d:href>${href}</d:href><d:propstat><d:prop>`
        + (dir ? '<d:resourcetype><d:collection/></d:resourcetype>' : `<d:resourcetype/><d:getcontentlength>${f.body.length}</d:getcontentlength>`)
        + `<d:getetag>&quot;${dir ? 'dir' : f.etag}&quot;</d:getetag>`
        + `<d:getlastmodified>${new Date(dir ? clock : f.mtime).toUTCString()}</d:getlastmodified>`
        + '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>';
    };
    switch (req.method) {
      case 'PROPFIND': {
        if (!dirs.has(path) && !files.has(path)) { res.writeHead(404); return res.end(); }
        const out = [entry(path, dirs.has(path))];
        if (dirs.has(path) && req.headers.depth === '1') {
          for (const d of dirs) if (parent(d) === path) out.push(entry(d, true));
          for (const f of files.keys()) if (parent(f) === path) out.push(entry(f, false));
        }
        res.writeHead(207, { 'Content-Type': 'application/xml; charset=utf-8' });
        return res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">${out.join('')}</d:multistatus>`);
      }
      case 'GET': {
        const f = files.get(path);
        if (!f) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': f.type, ETag: `"${f.etag}"` });
        return res.end(f.body);
      }
      case 'PUT': {
        if (!dirs.has(parent(path))) { res.writeHead(409); return res.end(); }
        if (!ignoreIfNoneMatch && req.headers['if-none-match'] === '*' && files.has(path)) { res.writeHead(412); return res.end(); }
        const etag = createHash('md5').update(body).update(String(++clock)).digest('hex');
        files.set(path, { body, etag, mtime: server.now?.() ?? Date.now(), type: req.headers['content-type'] || '' });
        res.writeHead(201, { ETag: `"${etag}"`, 'OC-ETag': `"${etag}"` });
        return res.end();
      }
      case 'MKCOL': {
        if (dirs.has(path) || files.has(path)) { res.writeHead(405); return res.end(); }
        if (!dirs.has(parent(path))) { res.writeHead(409); return res.end(); }
        dirs.add(path); res.writeHead(201); return res.end();
      }
      case 'DELETE': {
        if (locked.has(path)) { res.writeHead(423); return res.end(); }
        if (!files.delete(path) && !dirs.delete(path)) { res.writeHead(404); return res.end(); }
        res.writeHead(204); return res.end();
      }
      default: res.writeHead(405); return res.end();
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, user, password, files, dirs, log, space, locked,
    /** fichiers sous <espace>/<dossier>/<sous-dossier>/ */
    ls: sub => [...files.keys()].filter(k => k.startsWith(`${space}/${sub}`)).map(k => k.slice(`${space}/${sub}`.length)).sort(),
    /** date de modification donnée aux prochains fichiers écrits */
    setNow: fn => { server.now = fn; },
    close: () => new Promise(r => server.close(r)),
  };
}

// Un appareil : ses souvenirs et ses suppressions en mémoire, avec les mêmes règles que storage.js.
export function device(id, items = [], { cipher = null } = {}) {
  const stamp = it => it?.updatedAt || it?.createdAt || 0;
  const store = new Map(items.map(it => [it.id, it]));
  const deleted = new Map();
  let state = {};
  const local = {
    getItems: async () => [...store.values()].map(x => ({ ...x })),
    getDeleted: async () => Object.fromEntries(deleted),
    async applySync({ put = [], deleted: del = {}, forget = [] }) {
      let n = 0, removed = 0;
      for (const it of put) {
        const ex = store.get(it.id), gone = deleted.get(it.id);
        if (ex && stamp(ex) >= stamp(it)) continue;
        if (gone != null && gone >= stamp(it)) continue;
        store.set(it.id, { ...it }); deleted.delete(it.id); n++;
      }
      for (const [k, at] of Object.entries(del)) {
        const ex = store.get(k);
        if (ex && stamp(ex) > at) continue;
        if (ex) { store.delete(k); removed++; }
        if (!(deleted.get(k) >= at)) deleted.set(k, at);
      }
      for (const k of forget) deleted.delete(k);
      return { put: n, removed };
    },
  };
  return {
    id, store, deleted, cipher,
    add(it) { store.set(it.id, { tags: [], type: 'note', createdAt: it.updatedAt, ...it }); },
    edit(k, patch, at) { store.set(k, { ...store.get(k), ...patch, updatedAt: at }); },
    remove(k, at) { store.delete(k); deleted.set(k, at); },
    async sync(remote, now = 10_000) { // dates des tests : petits nombres, « maintenant » juste après
      const r = await syncOnce({ remote, local, device: id, cipher: this.cipher, state, now });
      state = r.state;
      return r;
    },
  };
}


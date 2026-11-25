// Petit serveur WebDAV en mémoire, à la façon de Nextcloud (/remote.php/dav/files/<utilisateur>/),
// pour tester webdav.js et sync.js sans serveur réel.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

/**
 * @param {{ user?: string, password?: string }} [o]
 */
export async function startDav({ user = 'alice', password = 'app-pass' } = {}) {
  const files = new Map();          // chemin décodé → { body: Buffer, etag, mtime, type }
  const dirs = new Set(['/remote.php/dav/files/' + user]);
  const log = [];
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
    if (!path.startsWith('/remote.php/dav/files/' + user)) { res.writeHead(404); return res.end(); }
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
        if (!files.delete(path) && !dirs.delete(path)) { res.writeHead(404); return res.end(); }
        res.writeHead(204); return res.end();
      }
      default: res.writeHead(405); return res.end();
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const space = `/remote.php/dav/files/${user}`;
  return {
    url, user, password, files, dirs, log, space,
    /** fichiers sous <espace>/<dossier>/<sous-dossier>/ */
    ls: sub => [...files.keys()].filter(k => k.startsWith(`${space}/${sub}`)).map(k => k.slice(`${space}/${sub}`.length)).sort(),
    /** date de modification donnée aux prochains fichiers écrits */
    setNow: fn => { server.now = fn; },
    close: () => new Promise(r => server.close(r)),
  };
}

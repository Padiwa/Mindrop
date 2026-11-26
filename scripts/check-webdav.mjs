// Vérifie qu'un vrai serveur WebDAV convient à la synchronisation de Mindrop, avec le même code que l'extension.
//
//   MINDROP_DAV_PASSWORD=… npm run check:webdav -- <adresse> <utilisateur>
//
// L'adresse est celle de l'espace WebDAV de l'utilisateur, prise telle quelle (http:// seulement pour localhost) ;
// pour Nextcloud : https://cloud.exemple.fr/remote.php/dav/files/<utilisateur>/.
// Le mot de passe se lit dans MINDROP_DAV_PASSWORD (pas sur la ligne de commande, qui reste dans l'historique).
// Tout se passe dans un dossier « mindrop-check-<date> » créé pour l'occasion, puis effacé.
//
// Serveurs essayés : Nextcloud 35, Apache mod_dav et rclone serve webdav. rclone ignore If-None-Match: *
// (création exclusive) : signalé ici, sans conséquence, puisque la connexion relit le fichier de clé.

import assert from 'node:assert/strict';
import { createDav } from '../webdav.js';
import { device } from '../tests/node/fake-dav.mjs';
import { createKey, unlockKey, makeCipher, KEY_FILE } from '../crypt.js';

const [url, user] = process.argv.slice(2);
const password = process.env.MINDROP_DAV_PASSWORD;
if (!url || !user || password == null) {
  console.error('Usage: MINDROP_DAV_PASSWORD=… npm run check:webdav -- <WebDAV address> <user>');
  process.exit(2);
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SECRET = 'Zettelkasten secret';
const methods = [];
/** @type {typeof fetch} */
const logged = (u, init) => { methods.push(init?.method || 'GET'); return fetch(u, init); };
const writes = () => methods.filter(m => m !== 'PROPFIND');
const top = `mindrop-check-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const mk = folder => createDav({ url, user, password, folder, exact: true, fetch: logged });

let failed = 0, warned = 0;
async function step(name, fn, { optional = false } = {}) {
  try { await fn(); console.log(`ok    ${name}`); return true; }
  catch (e) {
    if (optional) { warned++; console.log(`warn  ${name}: ${e.message}`); }
    else { failed++; console.log(`FAIL  ${name}: ${e.message}`); }
    return false;
  }
}

const remote = mk(`${top}/Mindrop é 🧠`);
const reachable = await step('address, user and password accepted', () => remote.check());
if (!reachable) process.exit(1);

try {
  await step('nested folder with a space, an accent and an emoji', async () => { await remote.mkdir(''); await remote.mkdir(''); });
  await step('ETags in PROPFIND', async () => {
    await remote.put('probe.txt', 'x', 'text/plain');
    const e = (await remote.list(''))?.find(f => f.name === 'probe.txt');
    assert.ok(e?.etag, 'no ETag: changes made by other devices would go unseen');
    await remote.remove('probe.txt');
  });
  await step('create-only PUT (If-None-Match: *)', async () => {
    await remote.put('once.json', '1', 'application/json', { create: true });
    try {
      await assert.rejects(remote.put('once.json', '2', 'application/json', { create: true }), e => e.code === 'exists',
        'ignored by the server (Mindrop re-reads the key file instead)');
    } finally { await remote.remove('once.json'); }
  }, { optional: true });

  const A = device('A'), B = device('B');
  await step('note and image from A to B', async () => {
    A.add({ id: 'n', text: 'bonjour é 🧠', updatedAt: 10 });
    A.add({ id: 'i', type: 'image', image: PNG, updatedAt: 11 });
    await A.sync(remote);
    const r = await B.sync(remote);
    assert.equal(r.pulled, 2);
    assert.equal(B.store.get('i').image, PNG);
  });
  await step('edit from B to A', async () => {
    B.edit('n', { text: 'modifié' }, 20);
    await B.sync(remote); await A.sync(remote);
    assert.equal(A.store.get('n').text, 'modifié');
  });
  await step('deletion from A to B', async () => {
    A.remove('n', 30);
    await A.sync(remote); await B.sync(remote);
    assert.equal(B.store.has('n'), false);
  });
  await step('rewritten file of another device is seen', async () => {
    B.add({ id: 'late', text: 'tardif', updatedAt: 40 });
    await B.sync(remote); await A.sync(remote);
    assert.equal(A.store.get('late')?.text, 'tardif');
  });
  await step('idle pass writes nothing', async () => {
    await A.sync(remote);
    methods.length = 0;
    const r = await A.sync(remote);
    assert.equal(r.pushed, false);
    assert.deepEqual(writes(), []);
  });

  const enc = mk(`${top}/Encrypted`);
  await step('encrypted folder: two devices, nothing readable on the server', async () => {
    await enc.mkdir('');
    const key = await createKey('a shared test passphrase', { iterations: 10_000 });
    await enc.put(KEY_FILE, key.keyFile, 'application/json');
    const C = device('C', [], { cipher: await makeCipher(key) });
    const D = device('D', [], { cipher: await makeCipher(await unlockKey(await enc.getText(KEY_FILE) ?? '', 'a shared test passphrase')) });
    C.add({ id: 's', text: SECRET, image: PNG, updatedAt: 5 });
    await C.sync(enc); await D.sync(enc);
    assert.equal(D.store.get('s').text, SECRET);
    assert.equal(D.store.get('s').image, PNG);
    for (const dir of ['devices', 'images']) for (const f of (await enc.list(dir)) || []) {
      const body = Buffer.from(await enc.getBytes(`${dir}/${f.name}`) ?? new ArrayBuffer(0)).toString('latin1');
      assert.ok(!body.includes('Zettelkasten') && !body.includes('PNG'), `${dir}/${f.name} is readable`);
    }
    await C.sync(enc);
    methods.length = 0;
    const r = await C.sync(enc);
    assert.equal(r.pushed, false);
    assert.deepEqual(writes(), [], 'idle encrypted pass wrote something');
  });
} finally {
  const res = await fetch(createDav({ url, user, password, folder: top, exact: true }).base, {
    method: 'DELETE', headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64') },
  }).catch(e => ({ ok: false, status: e.message }));
  if (!res.ok && res.status !== 404) console.log(`warn  could not delete the test folder ${top} (${res.status}): delete it by hand`);
}

console.log(failed ? `\n${failed} check(s) failed: this server is not suitable.` : `\nThis server is suitable${warned ? ` (${warned} warning)` : ''}.`);
process.exitCode = failed ? 1 : 0;

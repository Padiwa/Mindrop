import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, syncOnce, imageFile, imageDataUrl, REF } from '../../sync.js';
import { createDav, davRoot, parseMultistatus, originPattern } from '../../webdav.js';
import { startDav } from './fake-dav.mjs';

// Un appareil : ses souvenirs et ses suppressions en mémoire, avec les mêmes règles que storage.js.
function device(id, items = []) {
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
    id, store, deleted,
    add(it) { store.set(it.id, { tags: [], type: 'note', createdAt: it.updatedAt, ...it }); },
    edit(k, patch, at) { store.set(k, { ...store.get(k), ...patch, updatedAt: at }); },
    remove(k, at) { store.delete(k); deleted.set(k, at); },
    async sync(remote, now = 10_000) { // dates des tests : petits nombres, « maintenant » juste après
      const r = await syncOnce({ remote, local, device: id, state, now });
      state = r.state;
      return r;
    },
  };
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPG = 'data:image/jpeg;base64,' + Buffer.from('pas vraiment un jpeg, mais des octets').toString('base64');

async function setup() {
  const dav = await startDav();
  const remote = createDav({ url: dav.url, user: dav.user, password: dav.password, folder: 'Mindrop' });
  return { dav, remote };
}

test('fusion : la version la plus récente l’emporte, une suppression l’emporte sur plus ancien qu’elle', () => {
  const local = [{ id: 'a', updatedAt: 10 }, { id: 'b', updatedAt: 10 }, { id: 'c', updatedAt: 10 }];
  const docs = [
    { items: [{ id: 'a', updatedAt: 20, title: 'neuf' }, { id: 'b', updatedAt: 5 }, { id: 'n', createdAt: 3 }, { id: 'x', updatedAt: 4 }], deleted: { c: 15 } },
    { items: [{ id: 'a', updatedAt: 30, title: 'plus neuf' }], deleted: { x: 9, b: 8 } },
  ];
  const { put, deleted } = plan(local, {}, /** @type {any} */ (docs));
  assert.deepEqual(put.map(x => [x.id, x.title]).sort(), [['a', 'plus neuf'], ['n', undefined]]);
  assert.deepEqual(deleted, { c: 15, x: 9, b: 8 }); // b : plus ancien que la version locale, storage.js le garde
});

test('adresse WebDAV : serveur Nextcloud, adresse complète, refus du http distant', () => {
  assert.equal(davRoot('https://cloud.example.org', 'Zoé L'), 'https://cloud.example.org/remote.php/dav/files/Zo%C3%A9%20L/');
  assert.equal(davRoot('https://cloud.example.org/', 'a'), 'https://cloud.example.org/remote.php/dav/files/a/');
  assert.equal(davRoot('https://x.org/nc/remote.php/dav/files/a/', 'a'), 'https://x.org/nc/remote.php/dav/files/a/');
  assert.equal(davRoot('https://x.org/nc/remote.php/webdav', 'a'), 'https://x.org/nc/remote.php/dav/files/a/');
  assert.equal(davRoot('https://kdrive.infomaniak.com/123/', 'a'), 'https://kdrive.infomaniak.com/123/');
  assert.equal(davRoot('http://localhost:8080', 'a'), 'http://localhost:8080/remote.php/dav/files/a/');
  assert.throws(() => davRoot('http://cloud.example.org', 'a'), /https/);
  assert.throws(() => davRoot('ftp://cloud.example.org', 'a'), /https/);
  assert.equal(originPattern('https://cloud.example.org:8443/remote.php/'), 'https://cloud.example.org/*');
});

test('PROPFIND : préfixes d’espace de noms quelconques, entités, ETag faibles', () => {
  const xml = `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:">
    <D:response><D:href>/dav/Mindrop/devices/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
    <D:response><D:href>/dav/Mindrop/devices/a%20b.json</D:href><D:propstat><D:prop><D:getetag>W/&quot;123&quot;</D:getetag><D:getlastmodified>Wed, 25 Nov 2026 10:00:00 GMT</D:getlastmodified><D:getcontentlength>42</D:getcontentlength><D:resourcetype/></D:prop></D:propstat></D:response>
    <response xmlns="DAV:"><href>/dav/x&amp;y.json</href><propstat><prop><getetag>"z"</getetag></prop></propstat></response>
  </D:multistatus>`;
  const r = parseMultistatus(xml);
  assert.equal(r.length, 3);
  assert.deepEqual([r[0].dir, r[0].name], [true, 'devices']);
  assert.deepEqual([r[1].name, r[1].etag, r[1].size, r[1].modified], ['a b.json', '123', 42, Date.UTC(2026, 10, 25, 10)]);
  assert.deepEqual([r[2].name, r[2].etag], ['x&y.json', 'z']);
});

test('images : data: URL ↔ fichier nommé d’après son contenu, à l’identique', async () => {
  const f = await imageFile(PNG);
  assert.match(f.name, /^[0-9a-f]{64}\.png$/);
  assert.equal(imageDataUrl(f.name, f.bytes.buffer), PNG);
  assert.equal(await imageFile('https://example.com/a.png'), null);
  assert.equal(await imageFile('data:image/svg+xml,<svg/>'), null); // pas en base64 : reste dans le souvenir
});

test('connexion : mauvais mot de passe → code auth ; dossier imbriqué créé avec ses parents', async () => {
  const { dav } = await setup();
  try {
    const bad = createDav({ url: dav.url, user: dav.user, password: 'faux', folder: 'Mindrop' });
    await assert.rejects(bad.check(), e => e.code === 'auth');
    const nested = createDav({ url: dav.url, user: dav.user, password: dav.password, folder: 'Applis/Mindrop' });
    await nested.check();
    await nested.mkdir('');
    await nested.mkdir(''); // déjà là : rien
    assert.ok(dav.dirs.has(`${dav.space}/Applis/Mindrop`));
    assert.equal(await nested.list('devices/'), null);
  } finally { await dav.close(); }
});

test('deux appareils : ajout, image, modification, suppression, dans les deux sens', async () => {
  const { dav, remote } = await setup();
  try {
    const A = device('A'), B = device('B');
    A.add({ id: 'n1', text: 'note', updatedAt: 100 });
    A.add({ id: 'i1', type: 'image', image: PNG, thumb: JPG, updatedAt: 101 });
    let r = await A.sync(remote);
    assert.equal(r.pushed, true);
    assert.deepEqual(dav.ls('Mindrop/devices/'), ['A.json']);
    assert.equal(dav.ls('Mindrop/images/').length, 2);
    const docA = JSON.parse(dav.files.get(`${dav.space}/Mindrop/devices/A.json`).body);
    assert.ok(docA.items.find(x => x.id === 'i1').image.startsWith(REF), 'image sortie du souvenir');

    r = await B.sync(remote);
    assert.equal(r.pulled, 2);
    assert.equal(r.devices, 2);
    assert.equal(B.store.get('i1').image, PNG, 'image identique');
    assert.equal(B.store.get('i1').thumb, JPG);

    B.edit('n1', { text: 'modifiée sur B' }, 200);
    await B.sync(remote);
    r = await A.sync(remote);
    assert.equal(r.pulled, 1);
    assert.equal(A.store.get('n1').text, 'modifiée sur B');

    A.remove('i1', 300);
    await A.sync(remote);
    r = await B.sync(remote);
    assert.equal(r.removed, 1);
    assert.equal(B.store.has('i1'), false);
    assert.equal(B.deleted.get('i1'), 300);
    // B ne renvoie pas le souvenir supprimé à A
    r = await A.sync(remote);
    assert.equal(A.store.has('i1'), false);
    assert.equal(r.pulled, 0);
  } finally { await dav.close(); }
});

test('modifications concurrentes : les deux appareils convergent vers la plus récente, dans tous les ordres', async () => {
  const { dav, remote } = await setup();
  try {
    const A = device('A'), B = device('B');
    A.add({ id: 'x', text: 'départ', updatedAt: 1 });
    await A.sync(remote); await B.sync(remote);
    A.edit('x', { text: 'A' }, 10);
    B.edit('x', { text: 'B' }, 20);
    await A.sync(remote); await B.sync(remote); await A.sync(remote);
    assert.equal(A.store.get('x').text, 'B');
    assert.equal(B.store.get('x').text, 'B');
  } finally { await dav.close(); }
});

test('une modification faite après une suppression ailleurs garde le souvenir', async () => {
  const { dav, remote } = await setup();
  try {
    const A = device('A'), B = device('B');
    A.add({ id: 'x', text: 'départ', updatedAt: 1 });
    await A.sync(remote); await B.sync(remote);
    A.remove('x', 10);
    B.edit('x', { text: 'modifié après' }, 20);
    await A.sync(remote); await B.sync(remote); await A.sync(remote);
    assert.equal(A.store.get('x')?.text, 'modifié après');
    assert.equal(B.store.get('x')?.text, 'modifié après');
  } finally { await dav.close(); }
});

test('rien de changé : rien n’est réécrit ni relu', async () => {
  const { dav, remote } = await setup();
  try {
    const A = device('A'), B = device('B');
    A.add({ id: 'i', image: PNG, updatedAt: 5 });
    await A.sync(remote); await B.sync(remote); await A.sync(remote);
    dav.log.length = 0;
    const r = await A.sync(remote);
    assert.equal(r.pushed, false);
    assert.deepEqual(dav.log.filter(l => !l.startsWith('PROPFIND')), [], dav.log.join('\n'));
  } finally { await dav.close(); }
});

test('fichier de l’appareil effacé sur le serveur : il est réécrit', async () => {
  const { dav, remote } = await setup();
  try {
    const A = device('A');
    A.add({ id: 'x', updatedAt: 5 });
    await A.sync(remote);
    dav.files.delete(`${dav.space}/Mindrop/devices/A.json`);
    const r = await A.sync(remote);
    assert.equal(r.pushed, true);
    assert.ok(dav.files.has(`${dav.space}/Mindrop/devices/A.json`));
  } finally { await dav.close(); }
});

test('image pas encore arrivée : le souvenir attend le passage suivant', async () => {
  const { dav, remote } = await setup();
  try {
    const A = device('A'), B = device('B');
    A.add({ id: 'i', image: PNG, updatedAt: 5 });
    A.add({ id: 'n', text: 'sans image', updatedAt: 6 });
    await A.sync(remote);
    const [img] = dav.ls('Mindrop/images/');
    const saved = dav.files.get(`${dav.space}/Mindrop/images/${img}`);
    dav.files.delete(`${dav.space}/Mindrop/images/${img}`);
    let r = await B.sync(remote);
    assert.equal(r.waiting, 1);
    assert.equal(B.store.has('i'), false);
    assert.equal(B.store.has('n'), true, 'le reste passe');
    dav.files.set(`${dav.space}/Mindrop/images/${img}`, saved);
    r = await B.sync(remote);
    assert.equal(r.waiting, 0);
    assert.equal(B.store.get('i').image, PNG);
  } finally { await dav.close(); }
});

test('ménage : une image que plus personne n’utilise est retirée après un jour', async () => {
  const { dav, remote } = await setup();
  try {
    const day = 864e5;
    const t0 = Date.now();
    dav.setNow(() => t0);
    const A = device('A');
    A.add({ id: 'i', image: PNG, updatedAt: 5 });
    await A.sync(remote, t0);
    A.edit('i', { image: '' }, 10);
    await A.sync(remote, t0 + 1000);
    assert.equal(dav.ls('Mindrop/images/').length, 1, 'gardée le premier jour');
    await A.sync(remote, t0 + 2 * day);
    assert.equal(dav.ls('Mindrop/images/').length, 0, 'retirée ensuite');
  } finally { await dav.close(); }
});

test('suppressions oubliées après 180 jours ; fichier d’une version plus récente refusé', async () => {
  const { dav, remote } = await setup();
  try {
    const A = device('A');
    A.remove('vieux', 1000);
    await A.sync(remote, 1000 + 181 * 864e5);
    assert.equal(A.deleted.has('vieux'), false);
    await remote.put('devices/Z.json', JSON.stringify({ format: 'mindrop-sync', version: 99, device: 'Z', items: [], deleted: {} }), 'application/json');
    await assert.rejects(A.sync(remote), e => e.code === 'version');
  } finally { await dav.close(); }
});

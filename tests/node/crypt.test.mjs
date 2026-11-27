import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKey, unlockKey, makeCipher, readKeyFile, KEY_FILE, ITERATIONS } from '../../crypt.js';
import { createDav } from '../../webdav.js';
import { startDav, device } from './fake-dav.mjs';

const FAST = { iterations: 10_000 }; // les tests n'ont pas besoin de 600 000 itérations
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SECRET = 'Zettelkasten secret 🧠';

async function setup() {
  const dav = await startDav();
  const remote = createDav({ url: dav.url, user: dav.user, password: dav.password, folder: 'Mindrop' });
  await remote.mkdir('');
  return { dav, remote };
}
const everything = dav => [...dav.files.entries()].map(([k, f]) => k + '\n' + f.body.toString('latin1')).join('\n');

test('clé : même phrase → même clé ; fausse phrase refusée ; le fichier de clé ne contient pas la clé', async () => {
  const key = await createKey('correct horse battery staple', FAST);
  const f = readKeyFile(key.keyFile);
  assert.equal(f.kdf.iterations, 10_000);
  assert.ok(!key.keyFile.includes(key.raw));
  const again = await unlockKey(key.keyFile, 'correct horse battery staple');
  assert.equal(again.raw, key.raw);
  await assert.rejects(unlockKey(key.keyFile, 'correct horse battery stapler'), e => e.code === 'passphrase');
  assert.equal(ITERATIONS, 600_000, 'valeur par défaut');
  const weak = JSON.stringify({ ...JSON.parse(key.keyFile), kdf: { ...f.kdf, iterations: 10 } });
  await assert.rejects(unlockKey(weak, 'x'), e => e.code === 'format');
});

test('chiffrement lié au chemin : un fichier déplacé ou modifié ne se déchiffre pas', async () => {
  const c = await makeCipher(await createKey('une phrase de passe assez longue', FAST));
  const sealed = await c.seal(new TextEncoder().encode('bonjour'), 'devices/A.json');
  assert.equal(new TextDecoder().decode(await c.open(sealed, 'devices/A.json')), 'bonjour');
  await assert.rejects(c.open(sealed, 'devices/B.json'), e => e.code === 'decrypt');
  const altered = sealed.slice(); altered[20] ^= 1;
  await assert.rejects(c.open(altered, 'devices/A.json'), e => e.code === 'decrypt');
  const other = await makeCipher(await createKey('une autre phrase de passe', FAST));
  await assert.rejects(other.open(sealed, 'devices/A.json'), e => e.code === 'decrypt');
  assert.notEqual(await c.name(new Uint8Array([1])), await other.name(new Uint8Array([1])), 'noms d’images propres à la clé');
});

test('dossier chiffré : deux appareils s’échangent tout, le serveur ne voit rien en clair', async () => {
  const { dav, remote } = await setup();
  try {
    const key = await createKey('phrase de passe partagée', FAST);
    await remote.put(KEY_FILE, key.keyFile, 'application/json', { create: true });
    const A = device('A', [], { cipher: await makeCipher(key) });
    const B = device('B', [], { cipher: await makeCipher(await unlockKey(key.keyFile, 'phrase de passe partagée')) });
    A.add({ id: 'n', text: SECRET, title: 'Titre confidentiel', url: 'https://secret.example/page', tags: ['privé'], updatedAt: 10 });
    A.add({ id: 'i', type: 'image', image: PNG, updatedAt: 11 });
    await A.sync(remote);
    const r = await B.sync(remote);
    assert.equal(r.pulled, 2);
    assert.equal(B.store.get('n').text, SECRET);
    assert.equal(B.store.get('i').image, PNG);

    const all = everything(dav);
    for (const leak of ['Zettelkasten', 'confidentiel', 'secret.example', 'privé', 'iVBORw0KGgo', 'PNG']) assert.ok(!all.includes(leak), `en clair : ${leak}`);
    const imgs = dav.ls('Mindrop/images/');
    assert.equal(imgs.length, 1);
    assert.match(imgs[0], /^[0-9a-f]{64}\.bin$/);

    B.remove('n', 20);
    await B.sync(remote);
    await A.sync(remote);
    assert.equal(A.store.has('n'), false, 'suppression chiffrée transmise');
  } finally { await dav.close(); }
});

test('rien de changé : un dossier chiffré n’est pas réécrit (le chiffré change pourtant à chaque fois)', async () => {
  const { dav, remote } = await setup();
  try {
    const key = await createKey('phrase de passe partagée', FAST);
    await remote.put(KEY_FILE, key.keyFile, 'application/json');
    const A = device('A', [], { cipher: await makeCipher(key) });
    A.add({ id: 'i', image: PNG, updatedAt: 5 });
    await A.sync(remote); await A.sync(remote);
    dav.log.length = 0;
    const r = await A.sync(remote);
    assert.equal(r.pushed, false);
    assert.deepEqual(dav.log.filter(l => !l.startsWith('PROPFIND')), [], dav.log.join('\n'));
  } finally { await dav.close(); }
});

test('passage au chiffrement : tout est réécrit chiffré, les copies en clair disparaissent, l’appareil sans clé s’arrête', async () => {
  const { dav, remote } = await setup();
  try {
    const A = device('A'), B = device('B');
    A.add({ id: 'a', text: SECRET, image: PNG, updatedAt: 1 });
    B.add({ id: 'b', text: 'note de B', updatedAt: 2 });
    await A.sync(remote); await B.sync(remote); await A.sync(remote);
    assert.ok(everything(dav).includes('Zettelkasten'));

    const key = await createKey('on chiffre tout maintenant', FAST);
    await remote.put(KEY_FILE, key.keyFile, 'application/json', { create: true });
    A.cipher = await makeCipher(key);
    await A.sync(remote);
    const all = everything(dav);
    assert.ok(!all.includes('Zettelkasten') && !all.includes('note de B'), 'plus rien en clair');
    assert.deepEqual(dav.ls('Mindrop/devices/'), ['A.json'], 'le fichier en clair de B est retiré (A a gardé ses souvenirs)');
    assert.ok(dav.ls('Mindrop/images/').every(n => n.endsWith('.bin')));

    await assert.rejects(B.sync(remote), e => e.code === 'locked', 'B, sans clé, ne réécrit rien en clair');
    assert.deepEqual(dav.ls('Mindrop/devices/'), ['A.json']);

    B.cipher = await makeCipher(await unlockKey(key.keyFile, 'on chiffre tout maintenant'));
    await B.sync(remote);
    await A.sync(remote);
    assert.equal(A.store.get('b').text, 'note de B');
    assert.equal(B.store.get('a').image, PNG);
    assert.deepEqual(dav.ls('Mindrop/devices/'), ['A.json', 'B.json']);
    assert.ok(!everything(dav).includes('note de B'));
  } finally { await dav.close(); }
});

test('clé remplacée sur le serveur : arrêt (keyChanged) ; fichier de clé effacé : réécrit', async () => {
  const { dav, remote } = await setup();
  try {
    const key = await createKey('première phrase de passe', FAST);
    await remote.put(KEY_FILE, key.keyFile, 'application/json');
    const A = device('A', [], { cipher: await makeCipher(key) });
    A.add({ id: 'x', updatedAt: 1 });
    await A.sync(remote);

    dav.files.delete(`${dav.space}/Mindrop/${KEY_FILE}`);
    await A.sync(remote);
    assert.equal(dav.files.get(`${dav.space}/Mindrop/${KEY_FILE}`).body.toString(), key.keyFile);

    const other = await createKey('une toute autre phrase', FAST);
    await remote.put(KEY_FILE, other.keyFile, 'application/json');
    await assert.rejects(A.sync(remote), e => e.code === 'keyChanged');
  } finally { await dav.close(); }
});

test('fichier d’un appareil échangé par le serveur contre celui d’un autre : refusé', async () => {
  const { dav, remote } = await setup();
  try {
    const key = await createKey('phrase de passe partagée', FAST);
    await remote.put(KEY_FILE, key.keyFile, 'application/json');
    const A = device('A', [], { cipher: await makeCipher(key) });
    const B = device('B', [], { cipher: await makeCipher(key) });
    A.add({ id: 'x', updatedAt: 1 });
    await A.sync(remote);
    const f = dav.files.get(`${dav.space}/Mindrop/devices/A.json`);
    dav.files.set(`${dav.space}/Mindrop/devices/Z.json`, { ...f, etag: 'z' });
    dav.files.delete(`${dav.space}/Mindrop/devices/A.json`);
    await assert.rejects(B.sync(remote), e => e.code === 'decrypt');
  } finally { await dav.close(); }
});

test('création concurrente du fichier de clé : la seconde est refusée', async () => {
  const { dav, remote } = await setup();
  try {
    const k1 = await createKey('phrase un, assez longue', FAST);
    const k2 = await createKey('phrase deux, assez longue', FAST);
    await remote.put(KEY_FILE, k1.keyFile, 'application/json', { create: true });
    await assert.rejects(remote.put(KEY_FILE, k2.keyFile, 'application/json', { create: true }), e => e.code === 'exists');
    assert.equal(await remote.getText(KEY_FILE), k1.keyFile);
  } finally { await dav.close(); }
});

test('passage au chiffrement : un fichier en clair verrouillé (423) est retiré au passage suivant, sans échec', async () => {
  const { dav, remote } = await setup();
  try {
    const A = device('A'), B = device('B');
    A.add({ id: 'a', text: SECRET, image: PNG, updatedAt: 1 });
    B.add({ id: 'b', text: 'note de B', updatedAt: 2 });
    await A.sync(remote); await B.sync(remote); await A.sync(remote);

    const key = await createKey('on chiffre tout maintenant', FAST);
    await remote.put(KEY_FILE, key.keyFile, 'application/json', { create: true });
    A.cipher = await makeCipher(key);
    const plainB = `${dav.space}/Mindrop/devices/B.json`;
    dav.locked.add(plainB);
    const r = await A.sync(remote);
    assert.equal(r.devices, 1, 'le fichier en clair restant ne compte pas comme un appareil chiffré');
    assert.deepEqual(dav.ls('Mindrop/devices/'), ['A.json', 'B.json'], 'B.json, verrouillé, est resté');

    dav.locked.delete(plainB);
    dav.log.length = 0;
    await A.sync(remote);
    assert.deepEqual(dav.ls('Mindrop/devices/'), ['A.json']);
    assert.ok(!dav.log.some(l => l.startsWith('GET') && l.endsWith('/B.json')), 'pas relu : son ETag n’a pas changé');
    assert.ok(!everything(dav).includes('note de B'));
  } finally { await dav.close(); }
});

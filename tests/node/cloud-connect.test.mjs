// connectCloud (cloud.js) face à des serveurs WebDAV autres que Nextcloud, avec un chrome.storage minimal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDav } from './fake-dav.mjs';

const stored = {};
globalThis.chrome = {
  storage: { local: {
    get: async k => Object.fromEntries([k].flat().filter(x => x in stored).map(x => [x, stored[x]])),
    set: async o => { Object.assign(stored, o); },
    remove: async k => { for (const x of [k].flat()) delete stored[x]; },
  } },
};
const { connectCloud, CONFIG_KEY } = await import('../../cloud.js');

// La synchronisation qui suit la connexion échoue ici (pas d'IndexedDB sous Node) : seule la connexion est testée.
const connect = async cfg => { try { await connectCloud(cfg); } catch {} return stored[CONFIG_KEY]; };

test('adresse nue d’un serveur WebDAV servi à la racine : gardée telle quelle', async () => {
  const dav = await startDav({ space: '' });
  try {
    const cfg = await connect({ url: dav.url, user: dav.user, password: dav.password, folder: 'Mindrop' });
    assert.equal(cfg?.exact, true);
    assert.ok(dav.dirs.has('/Mindrop'), 'dossier créé à la racine');
  } finally { await dav.close(); }
});

test('adresse nue d’un Nextcloud : chemin Nextcloud, sans exact', async () => {
  const dav = await startDav();
  try {
    const cfg = await connect({ url: dav.url, user: dav.user, password: dav.password, folder: 'Mindrop' });
    assert.equal(cfg?.exact, undefined);
    assert.ok(dav.dirs.has(`${dav.space}/Mindrop`));
  } finally { await dav.close(); }
});

test('serveur qui ignore If-None-Match : la clé écrite par un autre appareil est relue', async () => {
  const dav = await startDav({ space: '', ignoreIfNoneMatch: true });
  try {
    const base = { url: dav.url, user: dav.user, password: dav.password, folder: 'Mindrop' };
    // Le fichier de clé est remplacé juste après l'écriture de cet appareil, comme si un autre l'avait écrit en même temps.
    const real = globalThis.fetch;
    let other = null;
    globalThis.fetch = async (u, init) => {
      const res = await real(u, init);
      if (init?.method === 'PUT' && String(u).endsWith('/mindrop.json') && !other) {
        other = 'pending';
        const { createKey } = await import('../../crypt.js');
        other = await createKey('la phrase de l’autre appareil', { iterations: 10_000 });
        await real(u, { ...init, body: other.keyFile });
      }
      return res;
    };
    try {
      await assert.rejects(connectCloud({ ...base, passphrase: 'ma phrase de passe à moi' }), e => e.code === 'passphrase');
    } finally { globalThis.fetch = real; }
    await connect({ ...base, passphrase: 'la phrase de l’autre appareil' });
    assert.equal(stored[CONFIG_KEY]?.key?.salt, other.salt);
  } finally { await dav.close(); }
});

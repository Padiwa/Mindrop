// Vidéos YouTube (video.js), sans réseau : fetch est imité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoInfo, withVideoInfo, cleanYoutubeTitle, needsVideoFix, hasPlaceholderTitle, bestThumbnail } from '../../video.js';
import { setCurrent } from '../../i18n.js';

const ID = 'dQw4w9WgXcQ';
function fakeFetch({ maxres = true, oembed = { title: 'Never Gonna Give You Up', author_name: 'Rick Astley' }, offline = false } = {}) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push([url, opts?.method || 'GET']);
    if (offline) throw new TypeError('Failed to fetch');
    if (url.includes('maxresdefault')) return { ok: maxres };
    if (url.includes('/oembed')) return oembed ? { ok: true, json: async () => oembed } : { ok: false };
    throw new Error('inattendu ' + url);
  };
  f.calls = calls;
  return f;
}

test('titre, chaîne et miniature HD', async () => {
  const f = fakeFetch();
  const v = await videoInfo(`https://www.youtube.com/watch?v=${ID}&t=42`, { fetchImpl: f });
  assert.deepEqual(v, { id: ID, title: 'Never Gonna Give You Up', author: 'Rick Astley', image: `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg` });
  assert.ok(f.calls.some(([u]) => u.includes(encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`))), 'adresse normalisée pour oEmbed');
});

test('Shorts et youtu.be reconnus', async () => {
  for (const url of [`https://www.youtube.com/shorts/${ID}`, `https://youtu.be/${ID}`]) {
    assert.equal((await videoInfo(url, { fetchImpl: fakeFetch() })).id, ID, url);
  }
});

test('miniature standard quand la HD n’existe pas', async () => {
  assert.equal(await bestThumbnail(ID, { fetchImpl: fakeFetch({ maxres: false }) }), `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
});

test('vidéo privée ou hors ligne : miniature quand même, titre vide', async () => {
  const priv = await videoInfo(`https://youtu.be/${ID}`, { fetchImpl: fakeFetch({ oembed: null }) });
  assert.equal(priv.title, '');
  const off = await videoInfo(`https://youtu.be/${ID}`, { fetchImpl: fakeFetch({ offline: true }) });
  assert.equal(off.title, '');
  assert.equal(off.image, `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
});

test('pas une vidéo YouTube : null, aucun appel réseau', async () => {
  const f = fakeFetch();
  assert.equal(await videoInfo('https://example.com/page', { fetchImpl: f }), null);
  assert.equal(f.calls.length, 0);
});

test('withVideoInfo complète un lien, garde le reste', async () => {
  setCurrent('fr'); // le test ne dépend pas de la langue de la machine
  const it = await withVideoInfo({ type: 'link', url: `https://youtu.be/${ID}`, title: 'youtu.be', tags: 'musique' }, { fetchImpl: fakeFetch() });
  assert.equal(it.type, 'video');
  assert.equal(it.title, 'Never Gonna Give You Up');
  assert.equal(it.description, 'Chaîne : Rick Astley');
  assert.equal(it.tags, 'musique');
  const other = { type: 'link', url: 'https://example.com', title: 'x' };
  assert.equal(await withVideoInfo(other, { fetchImpl: fakeFetch() }), other);
  setCurrent('en');
  const en = await withVideoInfo({ type: 'link', url: `https://youtu.be/${ID}` }, { fetchImpl: fakeFetch() });
  assert.equal(en.description, 'Channel: Rick Astley');
  setCurrent('auto');
});

test('titre d’onglet nettoyé', () => {
  assert.equal(cleanYoutubeTitle('(3) Never Gonna Give You Up - YouTube'), 'Never Gonna Give You Up');
  assert.equal(cleanYoutubeTitle('(99+) Titre – YouTube'), 'Titre');
  assert.equal(cleanYoutubeTitle('YouTube'), '');
});

test('repérage des vidéos à réparer, sans toucher aux titres choisis', () => {
  const url = `https://www.youtube.com/watch?v=${ID}`;
  const ytimg = `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`;
  assert.ok(needsVideoFix({ url, title: 'YouTube', image: ytimg }));
  assert.ok(needsVideoFix({ url, title: 'youtube.com', image: ytimg }));
  assert.ok(needsVideoFix({ url, title: 'Mon titre', image: '' }), 'miniature manquante');
  assert.ok(!needsVideoFix({ url, title: 'Mon titre', image: ytimg }));
  assert.ok(!needsVideoFix({ url: 'https://example.com', title: 'YouTube', image: '' }));
  assert.ok(hasPlaceholderTitle({ url, title: url }));
  assert.ok(!hasPlaceholderTitle({ url, title: 'Mon titre' }));
});

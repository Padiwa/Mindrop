// Recherche du serveur MCP (mcp/store.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, tagIndex, related, fold, full } from '../../mcp/store.mjs';

const day = 864e5, now = Date.UTC(2026, 10, 24);
const items = [
  { id: 'n1', type: 'note', title: '', text: '## Relire Zettelkasten\nUne idée par fiche.', note: '', description: '', url: '', image: 'data:image/jpeg;base64,xx', tags: ['methode', 'ecriture'], pinned: true, createdAt: now },
  { id: 'l1', type: 'link', title: 'How to take smart notes', text: '', note: 'À relier à ma fiche sur la méthode.', description: '', url: 'https://fortelabs.com/x', image: 'https://img.example/a.jpg', tags: ['methode', 'lecture'], pinned: false, createdAt: now - day },
  { id: 'q1', type: 'quote', title: 'Luhmann', text: 'On pense avec son papier.', note: '', description: '', url: 'https://fr.wikipedia.org/wiki/Luhmann', image: '', tags: ['ecriture', 'citations'], pinned: false, createdAt: now - 3 * day },
  { id: 'l2', type: 'link', title: 'Practical Typography', text: '', note: '', description: 'Le chapitre sur la longueur de ligne.', url: 'https://practicaltypography.com/', image: '', tags: ['design', 'typo'], pinned: false, createdAt: now - 12 * day },
];

test('fold ignore accents et casse', () => {
  assert.equal(fold('Méthode ÉCRITURE'), 'methode ecriture');
});

test('tous les mots doivent correspondre, sans accents', () => {
  const r = search(items, { query: 'methode fiche' });
  assert.equal(r.mode, 'all');
  assert.deepEqual(r.results.map(x => x.id).sort(), ['l1', 'n1']);
});

test('#tag filtre par préfixe de tag', () => {
  const r = search(items, { query: '#ecri papier' });
  assert.deepEqual(r.results.map(x => x.id), ['q1']);
});

test('sans correspondance complète, bascule en « au moins un mot »', () => {
  const r = search(items, { query: 'typographie ligne' });
  assert.equal(r.mode, 'any');
  assert.deepEqual(r.results.map(x => x.id), ['l2']);
});

test('requête vide : les plus récents d’abord', () => {
  const r = search(items, { query: '' });
  assert.equal(r.mode, 'recent');
  assert.deepEqual(r.results.map(x => x.id), ['n1', 'l1', 'q1', 'l2']);
});

test('filtres type, épinglés, dates, pagination', () => {
  assert.deepEqual(search(items, { type: 'link' }).results.map(x => x.id), ['l1', 'l2']);
  assert.deepEqual(search(items, { pinned: true }).results.map(x => x.id), ['n1']);
  assert.deepEqual(search(items, { since: new Date(now - 2 * day).toISOString() }).results.map(x => x.id), ['n1', 'l1']);
  const page = search(items, { limit: 2, offset: 2 });
  assert.equal(page.total, 4);
  assert.deepEqual(page.results.map(x => x.id), ['q1', 'l2']);
});

test('le titre est pris dans le texte quand il manque, le titre compte plus', () => {
  const r = search(items, { query: 'smart' });
  assert.equal(r.results[0].title, 'How to take smart notes');
  assert.equal(search(items, { query: 'zettelkasten' }).results[0].title, 'Relire Zettelkasten');
});

test('tagIndex compte et relie les tags', () => {
  const idx = tagIndex(items);
  const m = idx.find(t => t.tag === 'methode');
  assert.equal(m.count, 2);
  assert.deepEqual(m.related.map(r => r.tag).sort(), ['ecriture', 'lecture']);
});

test('related classe par tags partagés', () => {
  const r = related(items, 'n1');
  assert.deepEqual(r.results.map(x => x.id).sort(), ['l1', 'q1']);
  assert.equal(related(items, 'inconnu'), null);
});

test('full ne renvoie jamais une image encodée dans le texte', () => {
  assert.equal(full(items[0]).image, undefined);
  assert.equal(full(items[1]).image, 'https://img.example/a.jpg');
});

test('le texte des pages est cherché, avec un extrait autour du mot trouvé', () => {
  const long = 'Introduction. '.repeat(50) + 'Le zettelkasten de Luhmann comptait 90 000 fiches.' + ' Suite.'.repeat(50);
  const withContent = [...items, { id: 'p1', type: 'link', title: 'Article', text: '', note: '', description: 'Un article', url: 'https://example.com/a', image: '', tags: [], pinned: false, createdAt: now, content: long }];
  const r = search(withContent, { query: '90 000 fiches' });
  assert.deepEqual(r.results.map(x => x.id), ['p1']);
  assert.match(r.results[0].snippet, /90 000 fiches/);
  assert.equal(search(withContent, { query: 'article' }).results[0].id, 'p1', 'le titre compte plus que le texte');
});

test('get_memory : texte de la page par tranches', () => {
  const content = 'x'.repeat(70000);
  const first = full({ ...items[1], content });
  assert.equal(first.pageText.length, 30000);
  assert.equal(first.pageTextLength, 70000);
  assert.equal(first.pageTextNextOffset, 30000);
  const last = full({ ...items[1], content }, { contentOffset: 60000 });
  assert.equal(last.pageText.length, 10000);
  assert.equal(last.pageTextNextOffset, undefined);
  assert.equal(full(items[1]).pageText, undefined);
});

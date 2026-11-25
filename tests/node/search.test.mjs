// Recherche tolérante partagée (search.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stem, editDistance, buildIndex, search, parseQuery, words } from '../../search.js';

test('racines : pluriels, terminaisons, français et anglais', () => {
  assert.equal(stem('typographie'), stem('typography'));
  assert.equal(stem('methodes'), stem('methods'));
  assert.equal(stem('methode'), stem('method'));
  assert.equal(stem('fiches'), stem('fiche'));
  assert.equal(stem('classes'), stem('class'), 'ss final gardé');
  assert.equal(stem('2026'), '2026', 'nombres intacts');
  assert.equal(stem('ami'), 'ami', 'mots courts intacts');
});

test('distance d’édition, avec inversion de lettres', () => {
  assert.equal(editDistance('zettelkastn', 'zettelkasten', 2), 1);
  assert.equal(editDistance('teh', 'the', 2), 1);
  assert.equal(editDistance('abcdef', 'uvwxyz', 2), 3, 'arrêtée au-delà du maximum');
});

test('mots : sans accents, lettres et chiffres', () => {
  assert.deepEqual(words('Été 2026 : l’idée-clé !'), ['ete', '2026', 'l', 'idee', 'cle']);
});

const items = [
  { title: 'Practical Typography', text: '' },
  { title: 'Mes méthodes de travail', text: 'Les fiches et les notes.' },
  { title: 'Zettelkasten', text: 'Une fiche par idée.' },
  { title: 'Cuisine', text: 'Recette de pâtes au pesto, 90 000 calories.' },
];
const idx = buildIndex(items, [['title', 3], ['text', 1]]);
const found = q => [...search(idx, parseQuery(q).terms)].filter(([, r]) => r.matched === parseQuery(q).terms.length).sort((a, b) => b[1].score - a[1].score).map(([i]) => items[i].title);

test('exact, racine, faute de frappe', () => {
  assert.deepEqual(found('typographie'), ['Practical Typography']);
  assert.deepEqual(found('methods'), ['Mes méthodes de travail']);
  assert.deepEqual(found('zetelkasten'), ['Zettelkasten']);
  assert.deepEqual(found('pates'), ['Cuisine']);
  assert.deepEqual(found('90 000'), ['Cuisine'], 'expression exacte avec espace');
  assert.deepEqual(found('zettel'), ['Zettelkasten'], 'morceau de mot');
});

test('tous les mots doivent correspondre ; le titre compte plus que le texte', () => {
  assert.deepEqual(found('fiche idee'), ['Zettelkasten']);
  const fiche = [...search(idx, ['fiche'])].sort((a, b) => b[1].score - a[1].score).map(([i]) => items[i].title);
  assert.deepEqual(fiche.sort(), ['Mes méthodes de travail', 'Zettelkasten']);
  assert.deepEqual(found('xyzw'), []);
});

test('mots courts : pas de tolérance aux fautes (trop de bruit)', () => {
  assert.deepEqual(found('pat'), ['Cuisine'], 'morceau exact seulement');
  assert.deepEqual(found('zzz'), []);
});

test('parseQuery sépare mots et #tags', () => {
  assert.deepEqual(parseQuery('#Design  Typographie #'), { terms: ['typographie'], tags: ['design'] });
});

test('rapide sur une grosse base', () => {
  const big = Array.from({ length: 2000 }, (_, i) => ({ title: 'Titre ' + i, text: `contenu numero ${i} `.repeat(300) }));
  const bi = buildIndex(big, [['title', 3], ['text', 1]]);
  const t = performance.now();
  search(bi, ['contenue', 'numro']);
  assert.ok(performance.now() - t < 500, 'trop lent');
});

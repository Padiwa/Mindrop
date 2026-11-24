// Logique des suggestions de tags (tag-suggest.js), sans DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagCounts, currentToken, suggest } from '../../tag-suggest.js';

const counts = tagCounts([
  { tags: ['methode', 'ecriture'] }, { tags: ['methode', 'lecture'] }, { tags: ['méta', 'design'] }, { tags: ['methode'] }, { tags: [] },
]);

test('tagCounts : du plus fréquent au moins fréquent', () => {
  assert.deepEqual(counts[0], ['methode', 3]);
  assert.equal(counts.length, 5);
});

test('currentToken trouve le mot sous le curseur', () => {
  assert.deepEqual(currentToken('#design #me', 11), { start: 8, end: 11, query: 'me', hash: true });
  assert.deepEqual(currentToken('design, le', 10), { start: 8, end: 10, query: 'le', hash: false });
  assert.deepEqual(currentToken('#me suite', 3), { start: 0, end: 3, query: 'me', hash: true });
  assert.deepEqual(currentToken('#des', 2), { start: 0, end: 4, query: 'd', hash: true });
  assert.deepEqual(currentToken('', 0), { start: 0, end: 0, query: '', hash: false });
});

test('suggest : préfixe d’abord, sans accents, puis « contient »', () => {
  assert.deepEqual(suggest(counts, 'me').map(x => x[0]), ['methode', 'méta']);
  assert.deepEqual(suggest(counts, 'ture').map(x => x[0]), ['ecriture', 'lecture']);
});

test('suggest : pas les tags déjà saisis, ni le mot exact', () => {
  assert.deepEqual(suggest(counts, 'me', ['methode']).map(x => x[0]), ['méta']);
  assert.deepEqual(suggest(counts, 'design').map(x => x[0]), []);
});

test('suggest : # seul propose les plus fréquents, limité', () => {
  assert.equal(suggest(counts, '')[0][0], 'methode');
  assert.equal(suggest(counts, '', [], 2).length, 2);
});

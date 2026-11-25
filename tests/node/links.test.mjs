// Liens [[titre]] entre souvenirs (links.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinks, buildLinkGraph, displayTitle, firstLine } from '../../links.js';

test('parseLinks : cible, texte affiché, sans doublon', () => {
  assert.deepEqual(parseLinks('Voir [[Zettelkasten]], [[Luhmann|le sociologue]] et encore [[zettelkasten]].'), [
    { target: 'Zettelkasten', label: 'Zettelkasten' },
    { target: 'Luhmann', label: 'le sociologue' },
  ]);
  assert.deepEqual(parseLinks('[[]] [ [pas] ] [[sur\ndeux lignes]]'), []);
});

test('titre d’une note : sa première ligne, sans syntaxe', () => {
  assert.equal(firstLine('\n## **Relire** Zettelkasten\nsuite'), 'Relire Zettelkasten');
  assert.equal(firstLine('- [ ] tâche'), 'tâche');
  assert.equal(displayTitle({ title: 'Titre', text: '# Autre' }), 'Titre');
  assert.equal(displayTitle({ title: '', text: '', url: 'https://x.y' }), 'https://x.y');
});

const now = 1000;
const items = [
  { id: 'a', type: 'note', text: '# Zettelkasten\nUne fiche par idée.', createdAt: now },
  { id: 'b', type: 'note', text: '# Index\nVoir [[zettelkásten]] et [[Pas écrite]]. Et [[Index]] (soi-même).', note: '', createdAt: now + 1 },
  { id: 'c', type: 'link', title: 'Article', text: '', note: 'Cité dans [[Index]] et [[Zettelkasten]].', createdAt: now + 2 },
  { id: 'old', type: 'note', text: '# Doublon\nancien', createdAt: 1 },
  { id: 'new', type: 'note', text: '# doublon\nrécent', createdAt: 5 },
];
const g = buildLinkGraph(items);

test('résolution sans accents ni casse ; titres en double : le plus récent', () => {
  assert.equal(g.resolve('ZETTELKASTEN').id, 'a');
  assert.equal(g.resolve('Doublon').id, 'new');
  assert.equal(g.resolve('Inconnu'), null);
});

test('liens sortants, y compris ceux qui ne mènent nulle part', () => {
  assert.deepEqual(g.links('b').map(l => [l.target, l.item?.id ?? null]), [['zettelkásten', 'a'], ['Pas écrite', null], ['Index', 'b']]);
});

test('rétroliens, depuis le texte et la note perso, sans lien vers soi-même', () => {
  assert.deepEqual(g.backlinks('a').map(x => x.id).sort(), ['b', 'c']);
  assert.deepEqual(g.backlinks('b').map(x => x.id), ['c']);
  assert.ok(!g.edges.some(([s, t]) => s === t));
  assert.equal(g.edges.length, 3);
});

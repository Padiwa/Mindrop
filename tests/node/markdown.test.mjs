// Fonctions de markdown.js qui ne touchent pas au DOM (le rendu est testé dans le navigateur).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainText, toggleTask } from '../../markdown.js';

test('plainText retire la syntaxe', () => {
  const md = '## Titre\nUne **idée** et un *mot* `code`.\n- puce\n- [ ] tâche\n- [x] faite\n> citation\nVoir [le site](https://example.com).';
  assert.equal(plainText(md), 'Titre\nUne idée et un mot code.\n• puce\n☐ tâche\n☑ faite\ncitation\nVoir le site.');
});

test('plainText ne casse pas les mots avec soulignés', () => {
  assert.equal(plainText('snake_case_name reste tel quel'), 'snake_case_name reste tel quel');
});

test('toggleTask coche et décoche la bonne ligne', () => {
  const md = '- [ ] un\n- [ ] deux\n- [x] trois';
  assert.equal(toggleTask(md, 1, true), '- [ ] un\n- [x] deux\n- [x] trois');
  assert.equal(toggleTask(md, 2, false), '- [ ] un\n- [ ] deux\n- [ ] trois');
  assert.equal(toggleTask(md, 9, true), md);
});

// Traductions (i18n.js) : les deux langues complètes, et chaque clé utilisée existe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICT, resolveLang, t, setCurrent } from '../../i18n.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = { n: 2, e: 'erreur', t: 'Titre', c: '#fff', a: 'Chaîne', ago: 'hier', size: '2 Mo', date: '25 novembre', time: '10:15', type: 'note', added: 2, updated: 1, skipped: 0 };

test('français et anglais ont exactement les mêmes clés, de même nature', () => {
  const fr = Object.keys(DICT.fr).sort(), en = Object.keys(DICT.en).sort();
  assert.deepEqual(en, fr);
  for (const k of fr) assert.equal(typeof DICT.en[k], typeof DICT.fr[k], k);
});

test('chaque texte se construit, sans valeur manquante ni texte vide', () => {
  for (const l of ['fr', 'en']) {
    setCurrent(l);
    for (const k of Object.keys(DICT[l])) {
      const s = t(k, sample);
      assert.equal(typeof s, 'string', `${l}:${k}`);
      assert.ok(s.trim() && !/undefined|NaN|\{\w+\}/.test(s), `${l}:${k} → ${s}`);
    }
  }
  setCurrent('fr');
});

test('pluriels', () => {
  setCurrent('fr');
  assert.equal(t('count.memories', { n: 1 }), '1 souvenir');
  assert.equal(t('count.memories', { n: 3 }), '3 souvenirs');
  setCurrent('en');
  assert.equal(t('count.memories', { n: 1 }), '1 memory');
  assert.equal(t('count.memories', { n: 3 }), '3 memories');
  setCurrent('fr');
});

test('langue : le choix l’emporte, sinon celle du navigateur (français ou anglais)', () => {
  assert.equal(resolveLang('en', 'fr-FR'), 'en');
  assert.equal(resolveLang('auto', 'fr-CA'), 'fr');
  assert.equal(resolveLang('auto', 'de-DE'), 'en');
  assert.equal(resolveLang(undefined, 'fr'), 'fr');
});

test('chaque clé utilisée dans le code et le HTML existe', () => {
  const files = readdirSync(root).filter(f => /\.(js|html)$/.test(f));
  const missing = [];
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8');
    const keys = [
      ...[...src.matchAll(/\bt\(\s*'([\w.]+)'\s*[,)]/g)].map(m => m[1]),
      ...[...src.matchAll(/\btr\(\s*'([\w.]+)'\s*[,)]/g)].map(m => m[1]),
      ...[...src.matchAll(/data-i18n(?:-[\w-]+)?="([\w.]+)"/g)].map(m => m[1]),
      ...[...src.matchAll(/key: '([\w.]+)'/g)].map(m => m[1]),
    ];
    for (const k of keys) if (!(k in DICT.fr)) missing.push(`${f}: ${k}`);
  }
  // clés construites : 'filter.' + type, 'type.' + type
  for (const id of ['all', 'link', 'note', 'quote', 'image', 'video', 'pinned']) if (!(`filter.${id}` in DICT.fr)) missing.push(`filter.${id}`);
  for (const id of ['link', 'note', 'quote', 'image', 'video']) if (!(`type.${id}` in DICT.fr)) missing.push(`type.${id}`);
  assert.deepEqual(missing, []);
});

test('les fichiers _locales de Chrome couvrent les mêmes messages', () => {
  const fr = JSON.parse(readFileSync(join(root, '_locales/fr/messages.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(root, '_locales/en/messages.json'), 'utf8'));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  const manifest = readFileSync(join(root, 'manifest.json'), 'utf8');
  for (const [, k] of manifest.matchAll(/__MSG_(\w+)__/g)) assert.ok(k in en && k in fr, k);
});

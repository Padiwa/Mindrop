// Le site de documentation (scripts/build-site.mjs) : liens internes, langues, convertisseur Markdown.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let out, pages;
before(() => {
  out = mkdtempSync(join(tmpdir(), 'mindrop-site-'));
  execFileSync(process.execPath, [join(root, 'scripts', 'build-site.mjs'), '--out', out]);
  const walk = d => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  pages = walk(out).filter(f => f.endsWith('.html'));
});
after(() => rmSync(out, { recursive: true, force: true }));

test('huit pages : deux vitrines, six pages de doc', () => {
  const names = pages.map(p => p.slice(out.length + 1)).sort();
  assert.deepEqual(names, ['en/guide.html', 'en/local-bridge.html', 'en/sync.html', 'fr/guide.html', 'fr/index.html', 'fr/pont-local.html', 'fr/synchronisation.html', 'index.html']);
  assert.ok(existsSync(join(out, '.nojekyll')));
});

test('chaque lien interne et chaque ressource mène à un fichier, et chaque ancre existe', () => {
  const ids = new Map();
  const idsOf = file => {
    if (!ids.has(file)) ids.set(file, new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map(m => m[1])));
    return ids.get(file);
  };
  const broken = [];
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    for (const [, url] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      if (/^(https?:|mailto:)/.test(url)) continue;
      const [path, hash] = url.split('#');
      const target = path ? resolve(dirname(page), path) : page;
      if (!existsSync(target)) { broken.push(`${page.slice(out.length)} → ${url}`); continue; }
      if (hash && target.endsWith('.html') && !idsOf(target).has(hash)) broken.push(`${page.slice(out.length)} → ${url} (ancre)`);
    }
    assert.ok(!/href="[^"]+\.md(#[^"]*)?"/.test(html), `lien .md restant dans ${page}`);
  }
  assert.deepEqual(broken, []);
});

test('langue déclarée et page équivalente dans l’autre langue', () => {
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const lang = html.match(/<html lang="(\w+)"/)[1];
    const alt = html.match(/<link rel="alternate" hreflang="(\w+)" href="([^"]+)"/);
    assert.notEqual(alt[1], lang, page);
    const other = readFileSync(resolve(dirname(page), alt[2]), 'utf8');
    assert.equal(other.match(/<html lang="(\w+)"/)[1], alt[1], `${page} → ${alt[2]}`);
  }
});

test('vitrines : un titre, une phrase, deux actions, des captures avec texte alternatif', () => {
  for (const f of ['index.html', 'fr/index.html']) {
    const html = readFileSync(join(out, f), 'utf8');
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.equal((html.match(/class="btn btn--primary"/g) || []).length, 2, 'action en tête et en fin de page');
    for (const [img] of html.matchAll(/<img [^>]+>/g)) {
      assert.match(img, /alt="/, img);
      assert.match(img, /width="\d+" height="\d+"/, img);
    }
    assert.match(html, /data-credits/, 'crédits des photographies');
  }
});

test('convertisseur Markdown : tableaux, listes imbriquées, code échappé, liens réécrits, typographie', async () => {
  const { markdown, slug } = await import('../../scripts/build-site.mjs');
  const { html, headings } = markdown([
    '# Titre', '', '## Première partie', '', 'Un **gras**, un *italique*, du `code <b>` et [un lien](autre.md#x).', '',
    '- un', '  - sous', '- deux', '', '1. a', '2. b', '', '| A | B |', '|---|---|', '| `x|y` | z |', '', '```sh', 'echo "<ok>"', '```',
    '', "L'accès « ici » : oui",
  ].join('\n'), { link: u => u.replace(/\.md/, '.html') });
  assert.deepEqual(headings, [{ id: 'premiere-partie', html: 'Première partie' }]);
  assert.match(html, /<strong>gras<\/strong>, un <em>italique<\/em>, du <code>code &lt;b&gt;<\/code>/);
  assert.match(html, /<a href="autre.html#x">un lien<\/a>/);
  assert.match(html, /<ul><li>un<ul><li>sous<\/li><\/ul><\/li><li>deux<\/li><\/ul>/);
  assert.match(html, /<ol><li>a<\/li><li>b<\/li><\/ol>/);
  assert.match(html, /<td><code>x\|y<\/code><\/td><td>z<\/td>/, 'barre verticale dans du code');
  assert.match(html, /<pre data-lang="sh"><code>echo &quot;&lt;ok&gt;&quot;<\/code><\/pre>/);
  assert.match(html, /L’accès « ici » : oui/);
  assert.equal(slug('Mise à jour, dépannage'), 'mise-a-jour-depannage');
});

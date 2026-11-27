#!/usr/bin/env node
// Génère le site GitHub Pages (dossier docs/) à partir de la documentation Markdown, sans dépendance.
//   node scripts/build-site.mjs [--out <dossier>]
// Sources : docs/fr/*.md, docs/en/*.md, docs/assets/screens/*.webp, tokens.css, base.css, fonts/, LICENSE.
// Adresse du dépôt (liens GitHub et téléchargement) : champ "repository" de package.json, sinon aucun lien.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? process.argv[outArg + 1] : join(root, 'docs');
const SRC = join(root, 'docs');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const REPO = String((typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url) || '')
  .replace(/^git\+/, '').replace(/\.git$/, '');
// le zip de la dernière release (scripts/pack.mjs, publié par .github/workflows/release.yml)
const ZIP = REPO ? `${REPO}/releases/latest/download/mindrop.zip` : '';

// ---------- Markdown → HTML ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const slug = s => fold(s.replace(/<[^>]+>/g, '').replace(/`/g, '')).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(text, link) {
  const codes = [];
  let s = text.replace(/(`+)(.+?)\1(?!`)/g, (_, ticks, code) => {
    codes.push(`<code>${esc(ticks.length > 1 ? code.trim() : code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s)
    // typographie : apostrophes et guillemets courbes (le code est déjà mis de côté)
    .replace(/(\w)'(?=\w)/g, '$1’').replace(/'/g, '’')
    .replace(/&quot;([^&]*?)&quot;/g, '“$1”')
    // espaces insécables : « guillemets », et avant : ; ! ?
    .replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»')
    .replace(/ ([:;!?])(?=\s|$|<)/g, '\u00a0$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${esc(link(url.replace(/&amp;/g, '&')))}">${label}</a>`)
    .replace(/\*\*(?=\S)(.+?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*(?=[^\s*])([^*]*?[^\s*])\*(?![\w*])/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[i]);
}

function splitRow(line) {
  const cells = []; let cur = '', tick = false;
  for (const ch of line.trim().replace(/^\||\|$/g, '')) {
    if (ch === '`') tick = !tick;
    if (ch === '|' && !tick) { cells.push(cur.trim()); cur = ''; } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export function markdown(md, { link = u => u } = {}) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [], headings = [];
  let i = 0;
  const isBlank = l => !l.trim();
  const startsBlock = l => /^```/.test(l) || /^#{1,6}\s/.test(l) || LIST.test(l) || /^\|/.test(l) || /^---+\s*$/.test(l) || /^>\s?/.test(l);

  function list(indent) {
    const ordered = /\d/.test(LIST.exec(lines[i])[2]);
    const items = [];
    while (i < lines.length) {
      const m = LIST.exec(lines[i]);
      if (!m || m[1].length !== indent) break;
      let text = m[3], sub = '';
      i++;
      while (i < lines.length && !isBlank(lines[i])) {
        const n = LIST.exec(lines[i]);
        if (n && n[1].length > indent) { sub += list(n[1].length); continue; }
        if (n || startsBlock(lines[i].trim())) break;
        text += ' ' + lines[i].trim();
        i++;
      }
      items.push(`<li>${inline(text, link)}${sub}</li>`);
    }
    return `<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`;
  }

  while (i < lines.length) {
    const l = lines[i];
    if (isBlank(l)) { i++; continue; }
    let m;
    if ((m = /^```(\w*)/.exec(l))) {
      const body = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre${m[1] ? ` data-lang="${m[1]}"` : ''}><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
      const n = m[1].length, html = inline(m[2], link), id = slug(m[2]);
      if (n === 2) headings.push({ id, html });
      out.push(n === 1 ? `<h1>${html}</h1>` : `<h${n} id="${id}">${html}</h${n}>`);
      i++; continue;
    }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\|/.test(l) && /^\|?\s*:?-+/.test(lines[i + 1] || '')) {
      const head = splitRow(l); i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      out.push(`<div class="table"><table><thead><tr>${head.map(c => `<th scope="col">${inline(c, link)}</th>`).join('')}</tr></thead><tbody>${
        rows.map(r => `<tr>${r.map(c => `<td>${inline(c, link)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (LIST.test(l)) { out.push(list(LIST.exec(l)[1].length)); continue; }
    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !(para.length && startsBlock(lines[i]))) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '), link)}</p>`);
  }
  return { html: out.join('\n'), headings };
}

// ---------- Pages ----------
const PAGES = {
  en: { home: 'index.html', docs: [['guide', 'guide.md', 'Guide'], ['bridge', 'local-bridge.md', 'Local bridge'], ['sync', 'sync.md', 'Sync']] },
  fr: { home: 'fr/index.html', docs: [['guide', 'guide.md', 'Guide'], ['bridge', 'pont-local.md', 'Pont local'], ['sync', 'synchronisation.md', 'Synchronisation']] },
};
const docPath = (lang, file) => `${lang}/${file.replace(/\.md$/, '.html')}`;
const other = lang => (lang === 'fr' ? 'en' : 'fr');

const T = {
  en: {
    lang: 'en', switch: 'Français', switchLabel: 'Lire en français',
    title: 'Mindrop, a second brain in your browser',
    desc: 'Mindrop keeps your pages, links, Markdown notes, quotes, images and videos in your browser, connects them with tags and [[links]], and lets an AI agent search them. Free and 100% local.',
    nav: 'Main', github: 'Source code on GitHub',
    h1: 'Your second brain, in your browser.',
    lead: 'Keep pages, notes and quotes. Link them. Everything stays yours.',
    install: 'Install Mindrop', readGuide: 'Read the guide',
    heroAlt: 'The Mindrop page: a mosaic of notes, quotes, links and photos, with the tag index on the left',
    keepH: 'One click and it is kept.',
    keepAlt: 'The Mindrop popup saving a page, with the selected sentence kept as a quote',
    keep: [
      ['<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>', 'The page, a note, your #tags, and the selection as a quote.'],
      ['<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>', 'The page, saved at once, no window.'],
      ['Right-click', 'A sentence, a link or an image, from any page.'],
      ['The page text', 'Kept with it, so search finds the article itself.'],
    ],
    linkH: 'Notes that cite each other.',
    linkLine: 'Write <code>[[Title]]</code>: the note links to the other one, and the other one knows who cites it.',
    linkAlt: 'A Markdown note with two links, and its “links to” and “cited by” lists',
    linkCap: 'The sheet of a note: what it links to, and who cites it.',
    mapH: 'Every tag, every link, on one map.',
    mapAlt: 'The mind map: tags as coloured bubbles around Mindrop, memories around their tags, orange curves for links between notes',
    mapCap: 'Zoom in and memories come out around their tags. Orange curves are the links between notes.',
    agentH: 'An AI agent can search it.',
    agentLine: 'A read-only MCP server: tolerant search, page text, links and tags. A switch cuts access.',
    agentMore: 'Set up the local bridge',
    homeH: 'Your notes never leave this browser.',
    home: [
      ['100% local', 'No account, no server: everything lives in your browser.'],
      ['Backed up', 'A full copy on your disk after each change, thirty days kept.'],
      ['Search that forgives', 'Accents, plurals, variants and typos, across the page text too.'],
      ['Free software', 'AGPL-3.0: read it, change it, share it.'],
    ],
    installH: 'Install it in four steps.',
    steps: [
      ['Download', REPO ? `<a href="${esc(ZIP)}">mindrop.zip</a> and unzip it somewhere it will stay.` : 'the repository from GitHub (Code, then Download ZIP) and unzip it somewhere it will stay.'],
      ['Open', '<code>chrome://extensions</code>, or <code>brave://extensions</code>, and turn on Developer mode.'],
      ['Load', 'it with “Load\u00a0unpacked”, then pick the <code>mindrop</code> folder.'],
      ['Pin', 'the orange icon to your toolbar, then press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> on a page.'],
    ],
    download: REPO ? 'Download the ZIP' : 'Installation guide',
    darkAlt: 'The Mindrop page in dark mode',
    darkCap: 'It follows your system: light or dark.',
    foot: 'Free software under the AGPL-3.0-or-later. Fonts under the SIL Open Font License 1.1.',
    license: 'License', credits: 'Photographs in the screenshots:',
    onThisPage: 'On this page', docsNav: 'Documentation',
  },
  fr: {
    lang: 'fr', switch: 'English', switchLabel: 'Read in English',
    title: 'Mindrop, un second cerveau dans le navigateur',
    desc: 'Mindrop garde tes pages, liens, notes Markdown, citations, images et vidéos dans ton navigateur, les relie par des tags et des [[liens]], et laisse un agent IA y chercher. Libre et 100 % local.',
    nav: 'Principale', github: 'Le code source sur GitHub',
    h1: 'Ton second cerveau, dans ton navigateur.',
    lead: 'Garde pages, notes et citations. Relie-les. Tout reste chez toi.',
    install: 'Installer Mindrop', readGuide: 'Lire le guide',
    heroAlt: 'La page Mindrop : une mosaïque de notes, citations, liens et photos, avec l’index des tags à gauche',
    keepH: 'Un clic, c’est gardé.',
    keepAlt: 'La fenêtre de Mindrop qui enregistre une page, avec la phrase sélectionnée gardée comme citation',
    keep: [
      ['<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>', 'La page, une note, tes #tags, et la sélection en citation.'],
      ['<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>', 'La page, gardée tout de suite, sans fenêtre.'],
      ['Clic droit', 'Une phrase, un lien ou une image, sur n’importe quelle page.'],
      ['Le texte de la page', 'Gardé avec elle : la recherche retrouve l’article lui-même.'],
    ],
    linkH: 'Des notes qui se citent.',
    linkLine: 'Écris <code>[[Titre]]</code> : la note renvoie vers l’autre, et l’autre sait qui la cite.',
    linkAlt: 'Une note Markdown avec deux liens, et ses listes « Renvoie vers » et « Cité par »',
    linkCap: 'La fiche d’une note : ce qu’elle cite, et qui la cite.',
    mapH: 'Tous les tags, tous les liens, sur une carte.',
    mapAlt: 'La carte mentale : les tags en bulles colorées autour de Mindrop, les souvenirs autour de leurs tags, des courbes orange pour les liens entre notes',
    mapCap: 'En zoomant, les souvenirs sortent autour de leurs tags. Les courbes orange sont les liens entre notes.',
    agentH: 'Un agent IA peut y chercher.',
    agentLine: 'Un serveur MCP en lecture seule : recherche tolérante, texte des pages, liens et tags. Un interrupteur coupe l’accès.',
    agentMore: 'Installer le pont local',
    homeH: 'Tes notes ne quittent pas ton navigateur.',
    home: [
      ['100 % local', 'Ni compte ni serveur : tout vit dans ton navigateur.'],
      ['Sauvegardé', 'Une copie complète sur ton disque après chaque changement, trente jours gardés.'],
      ['Une recherche qui pardonne', 'Accents, pluriels, variantes et fautes de frappe, jusque dans le texte des pages.'],
      ['Logiciel libre', 'AGPL-3.0 : lis-le, modifie-le, partage-le.'],
    ],
    installH: 'L’installer en quatre étapes.',
    steps: [
      ['Télécharge', REPO ? `<a href="${esc(ZIP)}">mindrop.zip</a> et dézippe-le là où il restera.` : 'le dépôt depuis GitHub (Code, puis Download ZIP) et dézippe-le là où il restera.'],
      ['Ouvre', '<code>chrome://extensions</code>, ou <code>brave://extensions</code>, et active le mode développeur.'],
      ['Charge', 'l’extension avec «\u00a0Charger l’extension non empaquetée\u00a0», puis choisis le dossier <code>mindrop</code>.'],
      ['Épingle', 'l’icône orange dans la barre d’outils, puis <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> sur une page.'],
    ],
    download: REPO ? 'Télécharger le ZIP' : 'Guide d’installation',
    darkAlt: 'La page Mindrop en mode sombre',
    darkCap: 'Elle suit ton système : clair ou sombre.',
    foot: 'Logiciel libre sous AGPL-3.0-or-later. Polices sous SIL Open Font License 1.1.',
    license: 'Licence', credits: 'Photographies dans les captures :',
    onThisPage: 'Sur cette page', docsNav: 'Documentation',
  },
};

const CREDITS = [
  ['Florian Fuchs', 'CC BY 3.0', 'https://commons.wikimedia.org/wiki/File:Lake_Kinney_mit_Mount_Whitehorn.jpg'],
  ['Basile Morin', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Glass_door_of_the_library_at_Amantaka_luxury_Resort_%26_Hotel_in_Luang_Prabang_Laos.jpg'],
  ['Adrian Tync', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Walbrzych_Palm_House_greenhouse_interior_2019.jpg'],
  ['Anasuyas', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Sourdough_bread.jpg'],
];

// chemin relatif d'une page du site vers un fichier du site
const rel = (from, to) => relative(dirname(from), to) || '.';

function head(page, t, title, desc, counterpart) {
  return `<!DOCTYPE html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="${rel(page, 'assets/icon48.png')}">
<link rel="alternate" hreflang="${other(t.lang)}" href="${rel(page, counterpart)}">
<link rel="stylesheet" href="${rel(page, 'assets/site.css')}">
</head>`;
}

function nav(page, t, counterpart) {
  const L = PAGES[t.lang];
  const link = ([, file, label]) => {
    const href = docPath(t.lang, file);
    return `<a href="${rel(page, href)}"${href === page ? ' aria-current="page"' : ''}>${label}</a>`;
  };
  return `<header class="nav">
  <div class="container nav-row">
    <a class="wordmark" href="${rel(page, L.home)}"><img src="${rel(page, 'assets/icon48.png')}" alt="" width="28" height="28">Mindrop</a>
    <nav aria-label="${t.nav}">
      ${L.docs.map(link).join('\n      ')}
      <a href="${rel(page, counterpart)}" hreflang="${other(t.lang)}" lang="${other(t.lang)}" title="${t.switchLabel}">${t.switch}</a>
      ${REPO ? `<a href="${esc(REPO)}">GitHub</a>` : ''}
    </nav>
  </div>
</header>`;
}

function footer(page, t, counterpart, { credits = false } = {}) {
  const L = PAGES[t.lang];
  return `<footer class="foot">
  <div class="container foot-grid">
    <p class="foot-mark"><img src="${rel(page, 'assets/icon48.png')}" alt="" width="32" height="32">Mindrop</p>
    <p class="foot-line">${t.foot}</p>
    <nav class="foot-links" aria-label="${t.docsNav}">
      ${L.docs.map(([, file, label]) => `<a href="${rel(page, docPath(t.lang, file))}">${label}</a>`).join('\n      ')}
      <a href="${rel(page, 'assets/LICENSE.txt')}">${t.license}</a>
      <a href="${rel(page, counterpart)}" hreflang="${other(t.lang)}" lang="${other(t.lang)}">${t.switch}</a>
      ${REPO ? `<a href="${esc(REPO)}">GitHub</a>` : ''}
    </nav>
    ${credits ? `<p class="foot-credits" data-credits>${t.credits} ${CREDITS.map(([who, lic, url]) => `<a href="${url}">${who}</a> (${lic})`).join(', ')}, Wikimedia Commons.</p>` : ''}
  </div>
</footer>`;
}

const shot = (page, name, alt, w, h, extra = '') =>
  `<img src="${rel(page, `assets/screens/${name}.webp`)}" alt="${esc(alt)}" width="${w}" height="${h}"${extra}>`;

function landing(lang) {
  const t = T[lang], page = PAGES[lang].home, counterpart = PAGES[other(lang)].home;
  const guide = rel(page, docPath(lang, PAGES[lang].docs[0][1]));
  const bridge = rel(page, docPath(lang, PAGES[lang].docs[1][1]));
  const installHref = ZIP || `${guide}#${lang === 'fr' ? 'installation' : 'install'}`;
  return `${head(page, t, t.title, t.desc, counterpart)}
<body class="home">
<a class="skip" href="#main">${lang === 'fr' ? 'Aller au contenu' : 'Skip to content'}</a>
${nav(page, t, counterpart)}
<main id="main">
  <section class="hero">
    <div class="container hero-grid">
      <div class="hero-text">
        <h1>${t.h1}</h1>
        <p class="lead">${t.lead}</p>
        <p class="actions"><a class="btn btn--primary" href="#install">${t.install}</a><a class="btn" href="${guide}">${t.readGuide}</a></p>
      </div>
      <figure class="hero-shot shot" data-kind="product"><picture><source media="(max-width: 40rem)" srcset="${rel(page, 'assets/screens/grid-phone.webp')}" width="780" height="1200">${shot(page, 'grid', t.heroAlt, 2240, 1680, ' fetchpriority="high"')}</picture></figure>
    </div>
  </section>

  <section class="keep" aria-labelledby="keep-h">
    <div class="container keep-grid">
      <div>
        <h2 id="keep-h">${t.keepH}</h2>
        <dl class="facts">${t.keep.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      </div>
      <figure class="keep-shot shot" data-kind="product">${shot(page, 'popup', t.keepAlt, 720, 1150, ' loading="lazy"')}</figure>
    </div>
  </section>

  <section class="links" aria-labelledby="links-h">
    <div class="container links-grid">
      <figure class="links-shot shot" data-kind="product">${shot(page, 'sheet', t.linkAlt, 2240, 1440, ' loading="lazy"')}<figcaption>${t.linkCap}</figcaption></figure>
      <div>
        <h2 id="links-h">${t.linkH}</h2>
        <p class="lead">${t.linkLine}</p>
      </div>
    </div>
  </section>

  <section class="map band" aria-labelledby="map-h">
    <div class="container map-grid">
      <div>
        <h2 id="map-h">${t.mapH}</h2>
        <p class="lead">${t.mapCap}</p>
      </div>
      <figure class="map-shot shot" data-kind="product">${shot(page, 'map', t.mapAlt, 2117, 2010, ' loading="lazy"')}</figure>
    </div>
  </section>

  <section class="agent band--ink" aria-labelledby="agent-h">
    <div class="container agent-grid">
      <div>
        <h2 id="agent-h">${t.agentH}</h2>
        <p class="lead">${t.agentLine}</p>
        <p><a class="link" href="${bridge}">${t.agentMore}</a></p>
      </div>
      <pre class="code" aria-label="MCP"><code><span class="c-dim">$</span> node mcp/install.mjs &lt;extension-id&gt;
<span class="c-dim">$</span> claude mcp add mindrop \\
    -- node mcp/server.mjs

<span class="c-dim">tools</span>
  search_memories   get_memory
  list_tags         related_memories</code></pre>
    </div>
  </section>

  <section class="home-rows" aria-labelledby="home-h">
    <div class="container rows-grid">
      <h2 id="home-h">${t.homeH}</h2>
      <dl class="rows">${t.home.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    </div>
  </section>

  <section class="install" id="install" aria-labelledby="install-h">
    <div class="container install-grid">
      <div>
        <h2 id="install-h">${t.installH}</h2>
        <ol class="steps">${t.steps.map(([k, v]) => `<li><strong>${k}</strong> ${v}</li>`).join('')}</ol>
        <p class="actions"><a class="btn btn--primary" href="${esc(installHref)}">${t.download}</a><a class="btn" href="${bridge}">${t.agentMore}</a></p>
      </div>
      <figure class="install-shot shot" data-kind="product">${shot(page, 'grid-dark', t.darkAlt, 2240, 1680, ' loading="lazy"')}<figcaption>${t.darkCap}</figcaption></figure>
    </div>
  </section>
</main>
${footer(page, t, counterpart, { credits: true })}
</body>
</html>
`;
}

function docPage(lang, file, label, counterpartFile) {
  const t = T[lang];
  const page = docPath(lang, file);
  const counterpart = docPath(other(lang), counterpartFile);
  // liens relatifs des .md vers le site : autres .md → .html ; fichiers du dépôt → copies dans assets/
  const link = url => {
    if (/^(https?:|mailto:|#)/.test(url)) return url;
    const [path, hash = ''] = url.split('#');
    const h = hash ? '#' + hash : '';
    if (path.endsWith('.md')) return path.replace(/\.md$/, '.html') + h;
    if (/(^|\/)LICENSE$/.test(path)) return rel(page, 'assets/LICENSE.txt');
    const font = path.match(/fonts\/(OFL-[\w-]+\.txt)$/);
    if (font) return rel(page, `assets/fonts/${font[1]}`);
    if (REPO) return `${REPO}/blob/main/${path.replace(/^(\.\.\/)+/, '')}`;
    return url;
  };
  const md = readFileSync(join(SRC, lang, file), 'utf8');
  const { html, headings } = markdown(md, { link });
  const title = (md.match(/^#\s+(.*)$/m) || [, label])[1];
  return `${head(page, t, /mindrop/i.test(title) ? title : `${title}, Mindrop`, t.desc, counterpart)}
<body class="doc">
<a class="skip" href="#main">${lang === 'fr' ? 'Aller au contenu' : 'Skip to content'}</a>
${nav(page, t, counterpart)}
<div class="container doc-grid">
  <nav class="toc" aria-label="${t.onThisPage}">
    <details open>
      <summary class="toc-head">${t.onThisPage}</summary>
      <ol>${headings.map(h => `<li><a href="#${h.id}">${h.html}</a></li>`).join('')}</ol>
    </details>
  </nav>
  <main id="main" class="prose">
${html}
  </main>
</div>
${footer(page, t, counterpart)}
<script>/* sommaire replié sur petit écran (ouvert sans script) */ if (matchMedia('(max-width: 60rem)').matches) document.querySelector('.toc details').open = false;</script>
</body>
</html>
`;
}

// ---------- Écriture (seulement quand le script est lancé directement) ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  function write(rel, content) {
    const p = join(OUT, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  function copy(from, to) {
    const p = join(OUT, to);
    mkdirSync(dirname(p), { recursive: true });
    copyFileSync(from, p);
  }

  copy(join(root, 'tokens.css'), 'assets/tokens.css');
  copy(join(root, 'base.css'), 'assets/base.css');
  copy(join(root, 'LICENSE'), 'assets/LICENSE.txt');
  copy(join(root, 'icons', 'icon48.png'), 'assets/icon48.png');
  for (const f of readdirSync(join(root, 'fonts'))) copy(join(root, 'fonts', f), `assets/fonts/${f}`);
  copy(join(root, 'scripts', 'site.css'), 'assets/site.css');
  if (OUT !== SRC) for (const f of readdirSync(join(SRC, 'assets', 'screens'))) copy(join(SRC, 'assets', 'screens', f), `assets/screens/${f}`);
  write('.nojekyll', '');

  for (const lang of ['en', 'fr']) {
    write(PAGES[lang].home, landing(lang));
    PAGES[lang].docs.forEach(([, file, label], i) => write(docPath(lang, file), docPage(lang, file, label, PAGES[other(lang)].docs[i][1])));
  }
  console.log(`site écrit dans ${relative(process.cwd(), OUT) || '.'}${REPO ? ` (dépôt : ${REPO})` : ' (sans adresse de dépôt : ajoute "repository" dans package.json pour les liens GitHub)'}`);
}

import {
  onItemsChanged, getItems, mergeItems, addItem, updateItem, deleteItem,
  domainOf, faviconUrl, guessType, imageFor, shrinkImage,
} from './storage.js';
import { createMap } from './map.js';
import { icon } from './icons.js';
import { renderMarkdown, toggleTask } from './markdown.js';
import { buildIndex, search, parseQuery } from './search.js';
import { buildLinkGraph, displayTitle } from './links.js';
import { attachLinkSuggest } from './link-suggest.js';
import { withVideoInfo } from './video.js';
import { attachTagSuggest, tagCounts } from './tag-suggest.js';
import { runBackup, getBackupStatus, listBackups, readBackup, STATUS_KEY } from './backup.js';
import { isAgentEnabled, setAgentEnabled, syncAgent, getAgentSync, SYNC_KEY } from './agent.js';
import { getCloudConfig, getCloudStatus, connectCloud, disconnectCloud, runCloudSync, requestAccess, hostOf, CONFIG_KEY, CLOUD_STATUS_KEY, MIN_PASSPHRASE } from './cloud.js';
import { davRoot } from './webdav.js';
import { t, lang, locale, loadLang, translatePage, getLangPref, setLangPref, onLangChange } from './i18n.js';

// La langue est chargée avant le premier affichage ; le HTML statique est traduit tout de suite.
await loadLang();
translatePage();

const $ = s => document.querySelector(s);
let savedView = 'grid';
try { savedView = localStorage.getItem('view') || 'grid'; } catch {}
const state = { items: [], q: '', type: 'all', tag: '', openId: null, view: savedView, graph: buildLinkGraph([]), hits: null };

const TYPES = ['all', 'link', 'note', 'quote', 'image', 'video', 'pinned'];
const COLORS = ['', '#fff1b8', '#ffd9cc', '#d9f0dc', '#d6e6fb', '#e9defc', '#26241f'];
const DARK = '#26241f';
const rtf = new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' });

// ---------- utilitaires ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) {
    if (k == null || k === false || k === '') continue;
    el.append(k instanceof Node ? k : String(k));
  }
  return el;
}
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const isUrl = s => /^https?:\/\/\S+$/i.test(s.trim());

function ago(ts) {
  const diff = (ts - Date.now()) / 1000;
  /** @type {Array<[number, Intl.RelativeTimeFormatUnit]>} */
  const steps = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week'], [31557600, 'month'], [Infinity, 'year']];
  const div = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 };
  for (const [lim, unit] of steps) {
    if (Math.abs(diff) < lim) return rtf.format(Math.round(diff / div[unit]), unit);
  }
}
const fullDate = ts => new Date(ts).toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' });

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- rendu ----------
// Recherche tolérante (search.js) : mêmes champs et mêmes poids que le serveur MCP.
const SEARCH_FIELDS = [['title', 3], [it => it.tags.join(' '), 3], ['text', 1.5], ['note', 1.5], ['description', 0.75], ['content', 0.5], ['url', 0.5]];
let searchIndex = null, indexedItems = null;

// Map(id → score) des souvenirs qui contiennent tous les mots cherchés, ou null sans recherche.
function searchHits() {
  const { terms } = parseQuery(state.q);
  if (!terms.length) return null;
  if (indexedItems !== state.items) { searchIndex = buildIndex(state.items, SEARCH_FIELDS); indexedItems = state.items; }
  const hits = new Map();
  for (const [i, r] of search(searchIndex, terms)) if (r.matched === terms.length) hits.set(state.items[i].id, r.score);
  return hits;
}

function matches(it) {
  if (state.type === 'pinned') { if (!it.pinned) return false; }
  else if (state.type !== 'all' && it.type !== state.type) return false;
  if (state.tag && !it.tags.includes(state.tag)) return false;
  const { tags } = parseQuery(state.q);
  if (!tags.every(t => it.tags.some(x => fold(x).startsWith(t)))) return false;
  return !state.hits || state.hits.has(it.id);
}

function render() {
  state.hits = searchHits();
  // en recherche : les plus pertinents d'abord ; sinon les épinglés puis les plus récents
  const list = state.items.filter(matches).sort((a, b) => state.hits
    ? (state.hits.get(b.id) - state.hits.get(a.id)) || (b.createdAt - a.createdAt)
    : (b.pinned - a.pinned) || (b.createdAt - a.createdAt));

  const n = state.items.length;
  $('#count').textContent = n ? t('count.memories', { n }) : t('count.empty');

  // types
  $('#types').replaceChildren(...TYPES.map(id => {
    const label = t('filter.' + id);
    const c = id === 'all' ? n : id === 'pinned' ? state.items.filter(x => x.pinned).length : state.items.filter(x => x.type === id).length;
    if (id !== 'all' && !c) return '';
    return h('button', { type: 'button', class: 'chip' + (state.type === id ? ' on' : ''), 'aria-pressed': String(state.type === id), onclick: () => { state.type = id; render(); } },
      h('span', { class: 'label' }, label), h('span', { class: 'n' }, c));
  }).filter(Boolean));

  // tags
  const counts = {};
  state.items.forEach(it => it.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const tags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40);
  $('#tags').replaceChildren(...tags.map(([t, c]) =>
    h('button', { type: 'button', class: 'chip tag' + (state.tag === t ? ' on' : ''), 'aria-pressed': String(state.tag === t), onclick: () => {
        state.tag = state.tag === t ? '' : t;
        render();
        if (state.view === 'map' && state.tag) map.focusTag(t);
      } },
      h('span', { class: 'label' }, '#' + t), h('span', { class: 'n' }, c))));

  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.views button')).forEach(b => {
    b.classList.toggle('on', b.dataset.view === state.view);
    b.setAttribute('aria-selected', String(b.dataset.view === state.view));
  });
  if (state.view === 'map') {
    map.setData(state.items, matches);
    $('#empty').hidden = true;
    return;
  }
  $('#grid').replaceChildren(...list.map(card));
  requestAnimationFrame(() => document.querySelectorAll('#grid .md-clamp').forEach(el => {
    el.classList.toggle('is-clipped', el.scrollHeight > el.clientHeight + 1);
  }));

  const empty = $('#empty');
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.replaceChildren(n
      ? h('p', {}, t('empty.noMatch'))
      : h('div', {},
          h('h2', {}, t('empty.title')),
          h('p', {}, t('empty.body')),
          h('dl', { class: 'kbd' },
            [['S', t('empty.kOpen')], ['D', t('empty.kSave')], ['M', t('empty.kPage')]].map(([k, what]) => h('div', {},
              h('dt', {}, h('kbd', {}, 'Alt'), ' ', h('kbd', {}, 'Shift'), ' ', h('kbd', {}, k)),
              h('dd', {}, what))))));
  }
}

function mediaImg(it, cls) {
  const src = it.image || it.thumb;
  if (!src) return null;
  const img = h('img', { class: cls, src, loading: 'lazy', alt: '', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => {
    if (it.thumb && img.getAttribute('src') !== it.thumb) img.src = it.thumb;
    else img.remove();
  });
  return img;
}

function source(it) {
  if (!it.url) return null;
  const fav = faviconUrl(it.url, 16);
  return h('span', { class: 'src' }, fav && h('img', { src: fav, alt: '' }), domainOf(it.url));
}

function card(it) {
  const dark = it.color === DARK;
  const c = h('article', {
    class: `card t-${it.type}${it.color ? ' colored' : ''}${dark ? ' dark' : ''}`,
    style: it.color ? `--card:${it.color}` : null,
    tabindex: 0,
    onclick: () => openModal(it.id),
    onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) openModal(it.id); },
  });
  if (it.pinned) c.append(h('span', { class: 'pin', title: t('card.pinned') }, icon('star', { filled: true })));

  if (it.type === 'note') {
    c.append(h('div', { class: 'note-text md md-clamp' }, renderMarkdown(it.text, {
      wikilink,
      onToggle: (line, on) => updateItem(it.id, cur => ({ text: toggleTask(cur.text, line, on) })),
    })));
  } else if (it.type === 'quote') {
    c.append(h('blockquote', {}, it.text));
    c.append(h('div', { class: 'body' }, h('div', { class: 'meta' }, source(it) || h('span', {}, it.title))));
  } else if (it.type === 'image') {
    const img = mediaImg(it, 'media');
    if (img) c.append(img);
    if (it.note) c.append(h('div', { class: 'body' }, h('div', { class: 'note md md-clamp' }, renderMarkdown(it.note, { wikilink }))));
  } else {
    const img = mediaImg(it, 'media');
    if (img) c.append(h('div', { class: 'media-wrap' }, img, it.type === 'video' && h('span', { class: 'play' }, icon('play', { filled: true }))));
    c.append(h('div', { class: 'body' },
      h('h3', {}, String(it.title || it.url).replace(/ ([:;!?»])/g, '\u00a0$1')),
      it.note && h('div', { class: 'note md md-clamp' }, renderMarkdown(it.note, { wikilink })),
      h('div', { class: 'meta' }, source(it))));
  }

  const foot = h('footer', {},
    h('div', { class: 'card-tags' }, it.tags.slice(0, 4).map(t => h('span', {}, '#' + t))),
    h('time', { title: fullDate(it.createdAt) }, ago(it.createdAt)));
  c.append(foot);
  return c;
}

// ---------- détail / édition ----------
function openModal(id, { write = false } = {}) {
  const it = state.items.find(x => x.id === id);
  if (!it) return;
  state.openId = id;
  const save = debounce(patch => updateItem(id, patch), 350);

  // média
  const media = $('#m-media');
  media.replaceChildren();
  media.className = 'sheet-media';
  if (it.type === 'note' || it.type === 'quote') {
    media.classList.add('text');
    if (it.color) { media.style.setProperty('--card', it.color); media.classList.toggle('dark', it.color === DARK); }
    else media.style.removeProperty('--card');
    const ta = h('textarea', { class: it.type === 'quote' ? 'quote-edit' : 'note-edit', placeholder: t('sheet.write') });
    ta.value = it.text;
    ta.addEventListener('input', () => save({ text: ta.value }));
    if (it.type === 'note') noteEditor(media, ta, save, write);
    else { media.append(ta); setTimeout(() => ta.focus(), 30); }
    attachLinkSuggest(ta, () => linkEntries(id));
  } else {
    const img = mediaImg(it, 'big');
    if (img) media.append(it.url ? h('a', { href: it.url, target: '_blank', rel: 'noopener' }, img) : img);
    else media.append(h('div', { class: 'placeholder' }, domainOf(it.url) || '—'));
  }

  // panneau latéral
  const title = h('textarea', { class: 'm-title', rows: 1, placeholder: t('sheet.title'), 'aria-label': t('sheet.title') });
  title.value = it.title;
  title.addEventListener('input', () => { autoGrow(title); save({ title: title.value }); });

  const note = h('textarea', { class: 'm-note', rows: 5, placeholder: t('sheet.notePlaceholder'), 'aria-label': t('sheet.notes') });
  note.value = it.note;
  note.addEventListener('input', () => save({ note: note.value }));
  attachLinkSuggest(note, () => linkEntries(id));

  const tags = h('input', { class: 'm-tags', placeholder: t('sheet.tagsPlaceholder'), 'aria-label': t('sheet.tags') });
  tags.value = it.tags.map(t => '#' + t).join(' ');
  // branché avant la touche Entrée ci-dessous : Entrée choisit d'abord un tag proposé
  const tagField = attachTagSuggest(tags, () => tagCounts(state.items));
  tags.addEventListener('change', () => updateItem(id, { tags: tags.value }));
  tags.addEventListener('keydown', e => { if (e.key === 'Enter') tags.blur(); });

  const swatches = h('div', { class: 'swatches' }, COLORS.map(col =>
    h('button', {
      class: 'sw' + ((it.color || '') === col ? ' on' : ''), style: `--sw:${col || 'var(--surface)'}`,
      type: 'button', title: col ? t('sheet.color') : t('sheet.noColor'), 'aria-label': col ? t('sheet.colorN', { c: col }) : t('sheet.noColor'), 'aria-pressed': String((it.color || '') === col), onclick: () => patchAndReopen(id, { color: col }),
    })));

  const pin = h('button', { type: 'button', class: 'ghost' + (it.pinned ? ' on' : ''), 'aria-pressed': String(!!it.pinned), onclick: () => patchAndReopen(id, cur => ({ pinned: !cur.pinned })) },
    icon('star', { filled: it.pinned }), it.pinned ? t('sheet.pinned') : t('sheet.pin'));

  let armed = false;
  const del = h('button', { type: 'button', class: 'ghost danger', onclick: async () => {
    if (!armed) { armed = true; del.textContent = t('sheet.confirmDelete'); setTimeout(() => { armed = false; del.textContent = t('sheet.delete'); }, 3000); return; }
    await deleteItem(id); closeModal(); toast(t('sheet.deleted'));
  } }, t('sheet.delete'));

  const side = $('#m-side');
  side.replaceChildren(...[
    it.type !== 'note' ? title : null,
    it.url && h('a', { class: 'm-url', href: it.url, target: '_blank', rel: 'noopener' }, source(it), icon('external', { cls: 'ico arrow' })),
    it.description && h('p', { class: 'm-desc' }, it.description),
    it.content && pageText(it.content),
    linkSection(t('sheet.linksTo'), state.graph.links(id).map(l => l.item ? { item: l.item } : { missing: l.target })),
    linkSection(t('sheet.citedBy'), state.graph.backlinks(id).map(item => ({ item }))),
    h('label', {}, t('sheet.notes')), note,
    h('label', {}, t('sheet.tags')), tagField.el,
    h('label', {}, t('sheet.color')), swatches,
    h('div', { class: 'm-actions' }, pin, del),
    h('p', { class: 'm-date' }, t('sheet.savedOn', { type: it.type, date: fullDate(it.createdAt) })),
  ].filter(Boolean));
  $('#modal').hidden = false;
  document.body.classList.add('locked');
  autoGrow(title);
}

// Note en Markdown : onglets Écrire / Aperçu (Ctrl+E pour basculer).
function noteEditor(media, ta, save, write = false) {
  media.classList.add('has-tabs');
  const view = h('div', { class: 'md note-view', tabindex: 0, 'aria-label': t('note.preview') });
  const draw = () => view.replaceChildren(renderMarkdown(ta.value, {
    wikilink,
    onToggle: (line, on) => { ta.value = toggleTask(ta.value, line, on); save({ text: ta.value }); draw(); },
  }));
  const tab = (m, label) => h('button', { type: 'button', role: 'tab', 'data-mode': m, onclick: () => setMode(m) }, label);
  const tabs = h('div', { class: 'md-bar' },
    h('div', { class: 'md-tabs', role: 'tablist', 'aria-label': t('note.mode') }, tab('write', t('note.write')), tab('view', t('note.view'))),
    h('p', { class: 'md-help' }, ...(lang() === 'fr' ? ['# titre', '**gras**', '*italique*', '- liste', '- [ ] tâche', '[lien](url)', '[[Titre]]'] : ['# title', '**bold**', '*italic*', '- list', '- [ ] task', '[link](url)', '[[Title]]']).map(c => h('code', {}, c))));
  const help = tabs.querySelector('.md-help');
  function setMode(m) {
    ta.hidden = m !== 'write';
    view.hidden = m !== 'view';
    help.hidden = m !== 'write';
    tabs.querySelectorAll('[role=tab]').forEach(b => {
      const on = b.dataset.mode === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (m === 'view') draw();
    if (m === 'write') setTimeout(() => ta.focus(), 30);
  }
  media.onkeydown = e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); setMode(ta.hidden ? 'write' : 'view'); }
  };
  view.addEventListener('dblclick', () => setMode('write'));
  media.append(tabs, ta, view);
  setMode(ta.value.trim() && !write ? 'view' : 'write');
}

// Texte de la page gardé à l'enregistrement, replié par défaut.
function pageText(content) {
  const words = content.split(/\s+/).filter(Boolean).length;
  return h('details', { class: 'm-content' },
    h('summary', {}, t('sheet.pageText', { n: words.toLocaleString(locale()) })),
    h('div', { class: 'm-content-body' }, content));
}

// Écrit puis réaffiche la fiche avec le souvenir renvoyé par l'écriture,
// sans attendre que la page ait rechargé toute la liste.
async function patchAndReopen(id, patch) {
  const fresh = await updateItem(id, patch);
  if (fresh) {
    const i = state.items.findIndex(x => x.id === id);
    if (i >= 0) state.items[i] = { ...state.items[i], ...fresh };
    itemsChanged();
  }
  openModal(id);
}

// La liste a changé sur place : l'index de recherche et les liens sont à recalculer.
function itemsChanged() {
  indexedItems = null;
  state.graph = buildLinkGraph(state.items);
}

// ---------- liens [[titre]] ----------
const typeLabel = type => (['link', 'note', 'quote', 'image', 'video'].includes(type) ? t('type.' + type) : '');

// Rendu d'un [[lien]] : ouvre le souvenir visé, ou crée la note s'il n'existe pas encore.
function wikilink(target, label) {
  const hit = state.graph?.resolve(target);
  if (hit) {
    return [h('a', { class: 'wikilink', href: '#', title: t('link.open', { t: displayTitle(hit) }),
      onclick: e => { e.preventDefault(); e.stopPropagation(); openModal(hit.id); } }, label)];
  }
  return [h('button', { type: 'button', class: 'wikilink missing', title: t('link.create', { t: target }),
    onclick: e => { e.stopPropagation(); createLinkedNote(target); } }, label)];
}

async function createLinkedNote(title) {
  const it = await addItem({ type: 'note', text: `# ${title}\n\n` });
  state.items = [{ ...ITEM_DEFAULTS, ...it }, ...state.items];
  itemsChanged();
  openModal(it.id, { write: true });
  toast(t('link.created', { t: title }));
}

// Titres proposés après « [[ » (sauf le souvenir en cours d'édition).
function linkEntries(exceptId) {
  return state.items.filter(x => x.id !== exceptId).map(x => ({ id: x.id, title: displayTitle(x), kind: typeLabel(x.type) }));
}

function linkSection(heading, rows) {
  if (!rows.length) return null;
  return h('section', { class: 'm-links' },
    h('h3', {}, `${heading} (${rows.length})`),
    h('ul', {}, rows.map(r => h('li', {}, r.item
      ? h('button', { type: 'button', class: 'm-link', onclick: () => openModal(r.item.id) },
          h('span', { class: 'm-link-title' }, displayTitle(r.item)), h('span', { class: 'm-link-kind' }, typeLabel(r.item.type)))
      : h('button', { type: 'button', class: 'm-link missing', title: t('link.createThis'), onclick: () => createLinkedNote(r.missing) },
          h('span', { class: 'm-link-title' }, r.missing), h('span', { class: 'm-link-kind' }, t('link.toCreate')))))));
}

function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

function closeModal() {
  // valide un éventuel champ tags en cours d'édition
  /** @type {HTMLElement | null} */ (document.activeElement)?.blur?.();
  state.openId = null;
  $('#modal').hidden = true;
  document.body.classList.remove('locked');
}

// ---------- création ----------
async function saveText(text, tags = '') {
  text = text.trim();
  if (!text) return;
  if (isUrl(text)) {
    await addItem(await withVideoInfo({ type: guessType(text), url: text, title: domainOf(text), image: guessType(text) === 'image' ? text : imageFor(text), tags }));
  } else {
    await addItem({ type: 'note', text, tags });
  }
  toast(t('toast.saved'));
}

async function saveFile(file) {
  if (!file.type.startsWith('image/')) return toast(t('toast.onlyImages'));
  const image = await shrinkImage(file, 1400, 0.82);
  await addItem({ type: 'image', image, title: file.name.replace(/\.[^.]+$/, '') });
  toast(t('toast.imageSaved'));
}

function setupComposer() {
  const ta = $('#c-text'), row = $('#c-row');
  attachTagSuggest($('#c-tags'), () => tagCounts(state.items));
  attachLinkSuggest(ta, () => linkEntries(null));
  const grow = () => { autoGrow(ta); row.hidden = !ta.value.trim(); };
  ta.addEventListener('input', grow);
  const submit = async () => {
    await saveText(ta.value, $('#c-tags').value);
    ta.value = ''; $('#c-tags').value = ''; grow(); ta.focus();
  };
  $('#c-save').addEventListener('click', submit);
  [ta, $('#c-tags')].forEach(el => el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  }));
}

function setupDropAndPaste() {
  const drop = $('#drop');
  let depth = 0;
  window.addEventListener('dragenter', e => { e.preventDefault(); depth++; drop.hidden = false; });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.hidden = true; } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', async e => {
    e.preventDefault(); depth = 0; drop.hidden = true;
    const dt = e.dataTransfer;
    if (dt.files?.length) { for (const f of dt.files) await saveFile(f); return; }
    const uri = dt.getData('text/uri-list').split('\n').find(l => l && !l.startsWith('#'));
    await saveText(uri || dt.getData('text/plain'));
  });

  document.addEventListener('paste', async e => {
    const t = /** @type {Element} */ (e.target);
    if (t.matches?.('input, textarea')) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); for (const f of files) await saveFile(f); return; }
    const text = e.clipboardData?.getData('text/plain');
    if (text) { e.preventDefault(); await saveText(text); }
  });
}

// ---------- sauvegarde ----------
function exportJson() {
  // sans les champs de travail de la page (préfixés par _)
  const items = state.items.map(it => Object.fromEntries(Object.entries(it).filter(([k]) => !k.startsWith('_'))));
  const data = { app: 'second-cerveau', version: 1, exportedAt: new Date().toISOString(), items };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `mindrop-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJson(file) {
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(incoming)) throw new Error('format');
    const { added } = await mergeItems(incoming);
    toast(t('toast.imported', { n: added }));
  } catch (e) {
    toast(e instanceof SyntaxError || e?.message === 'format' ? t('toast.badFile') : t('toast.importFailed', { e: e?.message || e }));
  }
}

// ---------- carte mentale ----------
const map = createMap($('#map'), {
  onOpen: id => openModal(id),
  onZoom: k => {
    $('#map-hint').textContent = k < 0.4
      ? t('map.hintFar')
      : t('map.hintNear');
  },
});

function setView(v) {
  state.view = v;
  try { localStorage.setItem('view', v); } catch {}
  const isMap = v === 'map';
  document.body.classList.toggle('map-mode', isMap);
  $('#map').hidden = !isMap;
  $('.composer').hidden = isMap;
  $('#grid').hidden = isMap;
  if (isMap) map.show(); else map.hide();
  render();
}
/** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.views button')).forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('#z-in').addEventListener('click', () => map.zoom(1.4));
$('#z-out').addEventListener('click', () => map.zoom(1 / 1.4));
$('#z-fit').addEventListener('click', () => map.fit());
$('#z-reset').addEventListener('click', () => map.resetLayout());

// ---------- démarrage ----------
const ITEM_DEFAULTS = { type: 'note', title: '', url: '', text: '', note: '', description: '', content: '', image: '', thumb: '', color: '', pinned: false, createdAt: 0, tags: [] };

async function load() {
  state.items = (await getItems()).map(x => ({ ...ITEM_DEFAULTS, ...x, tags: Array.isArray(x.tags) ? x.tags : [] }));
  state.graph = buildLinkGraph(state.items);
  render();
}

onItemsChanged(load);

// ---------- accès des agents (MCP) ----------
async function showAgentStatus(st) {
  const enabled = await isAgentEnabled();
  st ??= await getAgentSync();
  const toggle = $('#agent-toggle'), el = $('#agent-status');
  toggle.checked = enabled;
  el.classList.toggle('is-error', !!st && !st.ok && !st.notInstalled);
  if (!enabled) {
    el.textContent = st?.ok === false && !st.notInstalled
      ? t('agent.offFailed', { e: st.error })
      : t('agent.off');
  } else if (st?.notInstalled) {
    el.textContent = t('agent.notInstalled');
  } else if (st && !st.ok) {
    el.textContent = t('agent.failed', { e: st.error });
  } else if (st?.enabled) {
    el.textContent = t('agent.on', { n: st.count, ago: ago(st.at) });
  } else {
    el.textContent = t('agent.waiting');
  }
}

$('#agent-toggle').addEventListener('change', async e => {
  const sw = e.currentTarget;
  sw.disabled = true;
  await setAgentEnabled(sw.checked);
  const st = await syncAgent();
  sw.disabled = false;
  showAgentStatus(st);
  toast(sw.checked ? t('agent.toastOn') : t('agent.toastOff'));
});

// ---------- sauvegarde automatique ----------
const dayFmt = new Intl.DateTimeFormat(locale(), { dateStyle: 'long' });
const sizeOf = b => (b > 1048576 ? (b / 1048576).toLocaleString(locale(), { maximumFractionDigits: 1 }) + '\u00a0' + t('size.mb') : Math.max(1, Math.round(b / 1024)) + '\u00a0' + t('size.kb'));

async function showBackupStatus(st) {
  st ??= await getBackupStatus();
  const el = $('#backup-status');
  el.classList.toggle('is-error', !!st && !st.ok && !st.notInstalled);
  $('#backup-restore').disabled = !!st?.notInstalled;
  if (!st) { el.textContent = t('backup.none'); return; }
  if (st.notInstalled) { el.textContent = t('backup.notInstalled'); return; }
  if (!st.ok) { el.textContent = t('backup.failed', { e: st.error }); return; }
  el.textContent = t('backup.last', { ago: ago(st.at), n: st.count, size: sizeOf(st.bytes) });
}

$('#backup-now').addEventListener('click', async e => {
  const b = e.currentTarget;
  b.disabled = true; b.setAttribute('aria-busy', 'true');
  const empty = !state.items.length;
  const st = await runBackup();
  b.disabled = false; b.removeAttribute('aria-busy');
  showBackupStatus(st);
  toast(empty ? t('backup.toastEmpty') : st?.ok ? t('backup.toastDone') : st?.notInstalled ? t('backup.toastNotInstalled') : t('backup.toastFailed'));
});

$('#backup-restore').addEventListener('click', async e => {
  const b = e.currentTarget, list = $('#backup-list');
  const open = list.hidden;
  b.setAttribute('aria-expanded', String(open));
  list.hidden = !open;
  if (!open) return;
  list.replaceChildren(h('li', { class: 'backup-empty' }, t('backup.loading')));
  try {
    const backups = await listBackups();
    list.replaceChildren(...(backups.length ? backups.map(restoreRow) : [h('li', { class: 'backup-empty' }, t('backup.noneOnDisk'))]));
  } catch (err) {
    list.replaceChildren(h('li', { class: 'backup-empty is-error' }, t('backup.readFailed', { e: err.message })));
  }
});

function restoreRow(bk) {
  let armed = false;
  const day = dayFmt.format(new Date(bk.date + 'T12:00:00'));
  const label = bk.time ? t('backup.version', { date: day, time: bk.time }) : day;
  const meta = bk.count != null ? t('backup.meta', { n: bk.count, size: sizeOf(bk.bytes) }) : sizeOf(bk.bytes);
  const btn = h('button', { type: 'button', class: 'backup-row', onclick: async () => {
    if (!armed) {
      armed = true; btn.classList.add('armed');
      btn.querySelector('.when').textContent = t('backup.confirm');
      setTimeout(() => { armed = false; btn.classList.remove('armed'); btn.querySelector('.when').textContent = label; }, 4000);
      return;
    }
    btn.disabled = true;
    try {
      const { items, skippedImages } = await readBackup(bk.name);
      const { added, updated } = await mergeItems(items);
      toast(t('backup.restored', { added, updated, skipped: skippedImages }));
    } catch (err) {
      toast(t('backup.restoreFailed', { e: err.message }));
    } finally { btn.disabled = false; }
  } }, h('span', { class: 'when' }, label), h('span', { class: 'what' }, meta));
  return h('li', {}, btn);
}

// ---------- synchronisation WebDAV ----------
const cloudForm = /** @type {HTMLFormElement} */ ($('#cloud-form'));
const cloudError = $('#cloud-error');

/** @param {import('./types').CloudStatus | null} [st] */
async function showCloudStatus(st) {
  const cfg = await getCloudConfig();
  st ??= await getCloudStatus();
  const el = $('#cloud-status');
  $('#cloud-setup').hidden = !!cfg;
  $('#cloud-now').hidden = $('#cloud-off').hidden = !cfg;
  el.classList.toggle('is-error', !!cfg && !!st && !st.ok);
  if (!cfg) { el.textContent = t('cloud.offState'); return; }
  cloudForm.hidden = true;
  const host = hostOf(cfg);
  if (!st) el.textContent = t('cloud.pending', { host });
  else if (st.ok) el.textContent = t(st.waiting ? 'cloud.okWaiting' : 'cloud.ok', { ago: ago(st.at), host, n: st.devices }) + (cfg.key ? ' ' + t('cloud.encryptedNote') : '');
  else el.textContent = {
    locked: () => t('cloud.errLocked'),
    keyChanged: () => t('cloud.errKeyChanged'),
    decrypt: () => t('cloud.errDecrypt'),
    auth: () => t('cloud.errAuth', { host }),
    permission: () => t('cloud.errPermission', { host }),
    network: () => t('cloud.errNetwork', { host }),
    quota: () => t('cloud.errQuota', { host }),
    version: () => t('cloud.errVersion'),
    format: () => t('cloud.errFormat', { file: st.file }),
  }[st.code]?.() || t('cloud.failed', { e: st.error });
}

/** @param {string} msg @param {string[]} [fields] champs à signaler */
function formError(msg, fields = []) {
  cloudError.textContent = msg;
  cloudError.hidden = !msg;
  for (const input of cloudForm.querySelectorAll('input')) {
    if (fields.includes(input.name)) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  if (fields[0]) /** @type {HTMLInputElement} */ (cloudForm.elements.namedItem(fields[0])).focus();
}

// la confirmation n'apparaît que si une phrase de passe est entrée
const showConfirm = () => { $('#cloud-pass2').hidden = !/** @type {HTMLInputElement} */ (cloudForm.elements.namedItem('passphrase')).value; };
/** @type {HTMLInputElement} */ (cloudForm.elements.namedItem('passphrase')).addEventListener('input', showConfirm);

$('#cloud-setup').addEventListener('click', e => {
  const open = cloudForm.hidden;
  cloudForm.hidden = !open;
  e.currentTarget.setAttribute('aria-expanded', String(open));
  if (open) { formError(''); /** @type {HTMLInputElement} */ (cloudForm.elements.namedItem('url')).focus(); }
});
$('#cloud-cancel').addEventListener('click', () => {
  cloudForm.hidden = true;
  $('#cloud-setup').setAttribute('aria-expanded', 'false');
  $('#cloud-setup').focus();
});

cloudForm.addEventListener('submit', e => {
  e.preventDefault();
  const v = name => String(/** @type {HTMLInputElement} */ (cloudForm.elements.namedItem(name)).value || '');
  let url = v('url').trim();
  if (url && !/^[a-z][\w+.-]*:\/\//i.test(url)) url = 'https://' + url;
  const cfg = { url, user: v('user').trim(), password: v('password'), folder: v('folder').trim() || 'Mindrop', passphrase: v('passphrase') };
  const missing = ['url', 'user', 'password'].filter(k => !cfg[k]);
  if (missing.length) return formError(t('cloud.missing'), missing);
  try { davRoot(cfg.url, cfg.user); } catch { return formError(t('cloud.badUrl'), ['url']); }
  if (cfg.passphrase && cfg.passphrase !== v('passphrase2')) return formError(t('cloud.mismatch'), ['passphrase2']);
  // l'autorisation doit être demandée pendant le clic, avant toute attente
  connect(requestAccess(cfg.url), cfg);
});

/** @param {Promise<boolean>} granted @param {import('./types').CloudConfig} cfg */
async function connect(granted, cfg) {
  const btn = /** @type {HTMLButtonElement} */ ($('#cloud-connect'));
  const inputs = [...cloudForm.querySelectorAll('input')];
  formError('');
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = t('cloud.connecting');
  inputs.forEach(i => { i.disabled = true; });
  try {
    if (!(await granted.catch(() => false))) return formError(t('cloud.denied'));
    const st = await connectCloud(cfg);
    cloudForm.reset();
    showConfirm();
    $('#cloud-setup').setAttribute('aria-expanded', 'false');
    await showCloudStatus(st);
    $('#cloud-now').focus();
    toast(t('cloud.toastConnected'));
  } catch (err) {
    const msg = {
      auth: 'cloud.authFailed', url: err.status === 404 || /404/.test(err.message) ? 'cloud.notFound' : 'cloud.badUrl', network: 'cloud.unreachable',
      needPassphrase: 'cloud.needPassphrase', passphrase: 'cloud.wrongPassphrase', weak: 'cloud.weak',
    }[err.code];
    const field = { auth: 'password', url: 'url', needPassphrase: 'passphrase', passphrase: 'passphrase', weak: 'passphrase' }[err.code];
    formError(msg ? t(msg, { n: MIN_PASSPHRASE }) : t('cloud.connectFailed', { e: err.message }), field ? [field] : []);
    if (field === 'passphrase') showConfirm();
  } finally {
    btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = t('cloud.connect');
    inputs.forEach(i => { i.disabled = false; });
  }
}

$('#cloud-now').addEventListener('click', async e => {
  const b = e.currentTarget;
  b.disabled = true; b.setAttribute('aria-busy', 'true');
  const st = await runCloudSync();
  b.disabled = false; b.removeAttribute('aria-busy');
  await showCloudStatus(st);
  toast(st?.ok ? t('cloud.toastDone', { pulled: st.pulled, removed: st.removed }) : t('cloud.toastFailed'));
});
$('#cloud-off').addEventListener('click', async () => {
  await disconnectCloud();
  await showCloudStatus();
  $('#cloud-setup').focus();
  toast(t('cloud.toastOff'));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATUS_KEY]) showBackupStatus(changes[STATUS_KEY].newValue);
  if (area === 'local' && changes[SYNC_KEY]) showAgentStatus(changes[SYNC_KEY].newValue);
  if (area === 'local' && (changes[CLOUD_STATUS_KEY] || changes[CONFIG_KEY])) showCloudStatus();
});
showBackupStatus();
showAgentStatus();
showCloudStatus();

// Réglages (agents IA, sauvegarde, synchronisation) : ouverts sur grand écran, repliés sur petit écran pour laisser la place à la mosaïque.
const narrow = matchMedia('(max-width: 60rem)');
const fitSettings = () => { $('#settings').open = !narrow.matches; };
narrow.addEventListener('change', fitSettings);
fitSettings();

// Langue de l'interface : la changer recharge les pages ouvertes de l'extension.
const langSelect = $('#lang-select');
langSelect.value = await getLangPref();
langSelect.addEventListener('change', () => setLangPref(langSelect.value));
onLangChange(() => location.reload());
setInterval(() => { showBackupStatus(); showAgentStatus(); showCloudStatus(); }, 60000);

// Une écriture qui échoue (disque plein, base indisponible) ne passe plus inaperçue.
window.addEventListener('unhandledrejection', e => {
  toast(t('toast.saveFailed', { e: e.reason?.message || e.reason || t('error.unknown') }));
});

$('#q').addEventListener('input', debounce(e => { state.q = e.target.value; render(); }, 120));
$('#random').addEventListener('click', () => {
  if (!state.items.length) return toast(t('toast.nothingToRediscover'));
  openModal(state.items[Math.floor(Math.random() * state.items.length)].id);
});
$('#export').addEventListener('click', exportJson);
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) importJson(f); e.target.value = ''; });
$('#modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.openId) return closeModal();
  if (e.key === '/' && !/** @type {Element} */ (e.target).matches?.('input, textarea')) { e.preventDefault(); $('#q').focus(); }
});

setupComposer();
setupDropAndPaste();
setView(state.view);
load();

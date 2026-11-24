import {
  KEY, getItems, saveItems, addItem, updateItem, deleteItem,
  domainOf, faviconUrl, guessType, imageFor, shrinkImage, normalizeTags,
} from './storage.js';
import { createMap } from './map.js';

const $ = s => document.querySelector(s);
let savedView = 'grid';
try { savedView = localStorage.getItem('view') || 'grid'; } catch {}
const state = { items: [], q: '', type: 'all', tag: '', openId: null, view: savedView };

const TYPES = [
  ['all', 'Tout'], ['link', 'Liens'], ['note', 'Notes'], ['quote', 'Citations'],
  ['image', 'Images'], ['video', 'Vidéos'], ['pinned', '★ Épinglés'],
];
const COLORS = ['', '#fff1b8', '#ffd9cc', '#d9f0dc', '#d6e6fb', '#e9defc', '#26241f'];
const DARK = '#26241f';
const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

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
  const steps = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week'], [31557600, 'month'], [Infinity, 'year']];
  const div = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 };
  for (const [lim, unit] of steps) {
    if (Math.abs(diff) < lim) return rtf.format(Math.round(diff / div[unit]), unit);
  }
}
const fullDate = ts => new Date(ts).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

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
function matches(it) {
  if (state.type === 'pinned') { if (!it.pinned) return false; }
  else if (state.type !== 'all' && it.type !== state.type) return false;
  if (state.tag && !it.tags.includes(state.tag)) return false;
  const terms = fold(state.q).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = fold([it.title, it.text, it.note, it.url, it.description, it.tags.join(' ')].join(' '));
  return terms.every(t => t.startsWith('#')
    ? it.tags.some(x => fold(x).startsWith(t.slice(1)))
    : hay.includes(t));
}

function render() {
  const list = state.items.filter(matches)
    .sort((a, b) => (b.pinned - a.pinned) || (b.createdAt - a.createdAt));

  const n = state.items.length;
  $('#count').textContent = n ? `${n} souvenir${n > 1 ? 's' : ''}` : 'Vide pour l’instant';

  // types
  $('#types').replaceChildren(...TYPES.map(([id, label]) => {
    const c = id === 'all' ? n : id === 'pinned' ? state.items.filter(x => x.pinned).length : state.items.filter(x => x.type === id).length;
    if (id !== 'all' && !c) return '';
    return h('button', { class: 'chip' + (state.type === id ? ' on' : ''), onclick: () => { state.type = id; render(); } },
      label, h('span', { class: 'n' }, c));
  }).filter(Boolean));

  // tags
  const counts = {};
  state.items.forEach(it => it.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const tags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40);
  $('#tags').replaceChildren(...tags.map(([t, c]) =>
    h('button', { class: 'chip tag' + (state.tag === t ? ' on' : ''), onclick: () => {
        state.tag = state.tag === t ? '' : t;
        render();
        if (state.view === 'map' && state.tag) map.focusTag(t);
      } },
      '#' + t, h('span', { class: 'n' }, c))));

  document.querySelectorAll('.views button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
  if (state.view === 'map') {
    map.setData(state.items, matches);
    $('#empty').hidden = true;
    return;
  }
  $('#grid').replaceChildren(...list.map(card));

  const empty = $('#empty');
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.replaceChildren(n
      ? h('p', {}, 'Rien ne correspond à cette recherche.')
      : h('div', {},
          h('h2', {}, 'Ton second cerveau t’attend.'),
          h('p', {}, 'Clique sur l’icône de l’extension sur n’importe quelle page, fais un clic droit sur une image, un lien ou un texte sélectionné, ou dépose quelque chose ici.'),
          h('p', { class: 'kbd' }, h('kbd', {}, 'Alt'), '+', h('kbd', {}, 'Shift'), '+', h('kbd', {}, 'S'), ' ouvrir · ',
            h('kbd', {}, 'Alt'), '+', h('kbd', {}, 'Shift'), '+', h('kbd', {}, 'D'), ' enregistrer direct · ',
            h('kbd', {}, 'Alt'), '+', h('kbd', {}, 'Shift'), '+', h('kbd', {}, 'M'), ' ce cerveau')));
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
    onkeydown: e => { if (e.key === 'Enter') openModal(it.id); },
  });
  if (it.pinned) c.append(h('span', { class: 'pin', title: 'Épinglé' }, '★'));

  if (it.type === 'note') {
    c.append(h('div', { class: 'note-text' }, it.text));
  } else if (it.type === 'quote') {
    c.append(h('blockquote', {}, it.text));
    c.append(h('div', { class: 'body' }, h('div', { class: 'meta' }, source(it) || h('span', {}, it.title))));
  } else if (it.type === 'image') {
    const img = mediaImg(it, 'media');
    if (img) c.append(img);
    if (it.note) c.append(h('div', { class: 'body' }, h('p', { class: 'note' }, it.note)));
  } else {
    const img = mediaImg(it, 'media');
    if (img) c.append(h('div', { class: 'media-wrap' }, img, it.type === 'video' && h('span', { class: 'play' }, '▶')));
    c.append(h('div', { class: 'body' },
      h('h3', {}, it.title || it.url),
      it.note && h('p', { class: 'note' }, it.note),
      h('div', { class: 'meta' }, source(it))));
  }

  const foot = h('footer', {},
    h('div', { class: 'card-tags' }, it.tags.slice(0, 4).map(t => h('span', {}, '#' + t))),
    h('time', { title: fullDate(it.createdAt) }, ago(it.createdAt)));
  c.append(foot);
  return c;
}

// ---------- détail / édition ----------
function openModal(id) {
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
    const ta = h('textarea', { class: it.type === 'quote' ? 'quote-edit' : 'note-edit', placeholder: 'Écris…' });
    ta.value = it.text;
    ta.addEventListener('input', () => save({ text: ta.value }));
    media.append(ta);
    setTimeout(() => ta.focus(), 30);
  } else {
    const img = mediaImg(it, 'big');
    if (img) media.append(it.url ? h('a', { href: it.url, target: '_blank', rel: 'noopener' }, img) : img);
    else media.append(h('div', { class: 'placeholder' }, domainOf(it.url) || '—'));
  }

  // panneau latéral
  const title = h('textarea', { class: 'm-title', rows: 1, placeholder: 'Titre' });
  title.value = it.title;
  title.addEventListener('input', () => { autoGrow(title); save({ title: title.value }); });

  const note = h('textarea', { class: 'm-note', rows: 5, placeholder: 'Mes notes, pourquoi je garde ça…' });
  note.value = it.note;
  note.addEventListener('input', () => save({ note: note.value }));

  const tags = h('input', { class: 'm-tags', placeholder: '#tags séparés par des espaces' });
  tags.value = it.tags.map(t => '#' + t).join(' ');
  tags.addEventListener('change', () => updateItem(id, { tags: tags.value }));
  tags.addEventListener('keydown', e => { if (e.key === 'Enter') tags.blur(); });

  const swatches = h('div', { class: 'swatches' }, COLORS.map(col =>
    h('button', {
      class: 'sw' + ((it.color || '') === col ? ' on' : ''), style: `--sw:${col || 'var(--surface)'}`,
      title: col ? 'Couleur' : 'Aucune', onclick: async () => { await updateItem(id, { color: col }); openModal(id); },
    })));

  const pin = h('button', { class: 'ghost' + (it.pinned ? ' on' : ''), onclick: async () => { await updateItem(id, { pinned: !it.pinned }); openModal(id); } },
    it.pinned ? '★ Épinglé' : '☆ Épingler');

  let armed = false;
  const del = h('button', { class: 'ghost danger', onclick: async () => {
    if (!armed) { armed = true; del.textContent = 'Confirmer la suppression ?'; setTimeout(() => { armed = false; del.textContent = 'Supprimer'; }, 3000); return; }
    await deleteItem(id); closeModal(); toast('Souvenir supprimé');
  } }, 'Supprimer');

  const side = $('#m-side');
  side.replaceChildren(...[
    h('div', { class: 'm-type' }, ({ link: 'Lien', note: 'Note', quote: 'Citation', image: 'Image', video: 'Vidéo' })[it.type] || it.type),
    it.type !== 'note' ? title : null,
    it.url && h('a', { class: 'm-url', href: it.url, target: '_blank', rel: 'noopener' }, source(it), h('span', { class: 'arrow' }, '↗')),
    it.description && h('p', { class: 'm-desc' }, it.description),
    h('label', {}, 'Notes'), note,
    h('label', {}, 'Tags'), tags,
    h('label', {}, 'Couleur'), swatches,
    h('div', { class: 'm-actions' }, pin, del),
    h('p', { class: 'm-date' }, 'Gardé le ' + fullDate(it.createdAt)),
  ].filter(Boolean));
  $('#modal').hidden = false;
  document.body.classList.add('locked');
  autoGrow(title);
}

function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

function closeModal() {
  // valide un éventuel champ tags en cours d'édition
  document.activeElement?.blur?.();
  state.openId = null;
  $('#modal').hidden = true;
  document.body.classList.remove('locked');
}

// ---------- création ----------
async function saveText(text, tags = '') {
  text = text.trim();
  if (!text) return;
  if (isUrl(text)) {
    await addItem({ type: guessType(text), url: text, title: domainOf(text), image: guessType(text) === 'image' ? text : imageFor(text), tags });
  } else {
    await addItem({ type: 'note', text, tags });
  }
  toast('Gardé en mémoire ✓');
}

async function saveFile(file) {
  if (!file.type.startsWith('image/')) return toast('Seules les images peuvent être déposées');
  const image = await shrinkImage(file, 1400, 0.82);
  await addItem({ type: 'image', image, title: file.name.replace(/\.[^.]+$/, '') });
  toast('Image gardée ✓');
}

function setupComposer() {
  const ta = $('#c-text'), row = $('#c-row');
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
    const t = e.target;
    if (t.matches?.('input, textarea')) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); for (const f of files) await saveFile(f); return; }
    const text = e.clipboardData?.getData('text/plain');
    if (text) { e.preventDefault(); await saveText(text); }
  });
}

// ---------- sauvegarde ----------
function exportJson() {
  const data = { app: 'second-cerveau', version: 1, exportedAt: new Date().toISOString(), items: state.items };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `second-cerveau-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJson(file) {
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(incoming)) throw new Error('format');
    const current = await getItems();
    const byId = new Map(current.map(x => [x.id, x]));
    let added = 0;
    for (const raw of incoming) {
      if (!raw?.id) continue;
      const it = { ...raw, tags: normalizeTags(raw.tags) };
      const ex = byId.get(it.id);
      if (!ex) added++;
      if (!ex || (it.updatedAt || 0) > (ex.updatedAt || 0)) byId.set(it.id, it);
    }
    await saveItems([...byId.values()]);
    toast(`${added} souvenir${added > 1 ? 's' : ''} importé${added > 1 ? 's' : ''}`);
  } catch {
    toast('Fichier de sauvegarde invalide');
  }
}

// ---------- carte mentale ----------
const map = createMap($('#map'), {
  onOpen: id => openModal(id),
  onZoom: k => {
    $('#map-hint').textContent = k < 0.4
      ? 'Zoome (molette) sur un #tag pour voir les souvenirs qui y sont liés'
      : 'Clique sur une carte pour l’ouvrir · glisse un #tag pour le déplacer';
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
document.querySelectorAll('.views button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('#z-in').addEventListener('click', () => map.zoom(1.4));
$('#z-out').addEventListener('click', () => map.zoom(1 / 1.4));
$('#z-fit').addEventListener('click', () => map.fit());
$('#z-reset').addEventListener('click', () => map.resetLayout());

// ---------- démarrage ----------
async function load() {
  const defaults = { type: 'note', title: '', url: '', text: '', note: '', description: '', image: '', thumb: '', color: '', pinned: false, createdAt: 0 };
  state.items = (await getItems()).map(x => ({ ...defaults, ...x, tags: Array.isArray(x.tags) ? x.tags : [] }));
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEY]) load();
});

$('#q').addEventListener('input', debounce(e => { state.q = e.target.value; render(); }, 120));
$('#random').addEventListener('click', () => {
  if (!state.items.length) return toast('Rien à redécouvrir pour l’instant');
  openModal(state.items[Math.floor(Math.random() * state.items.length)].id);
});
$('#export').addEventListener('click', exportJson);
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) importJson(f); e.target.value = ''; });
$('#modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.openId) return closeModal();
  if (e.key === '/' && !e.target.matches?.('input, textarea')) { e.preventDefault(); $('#q').focus(); }
});

setupComposer();
setupDropAndPaste();
setView(state.view);
load();

import { addItem, findByUrl, domainOf, faviconUrl } from './storage.js';
import { buildPageItem } from './capture.js';

const $ = s => document.querySelector(s);
let tab, pageItem, meta = {}, titleTouched = false, mode = 'page';

init();

async function init() {
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#save-page').addEventListener('click', savePage);
  $('#save-note').addEventListener('click', saveNote);
  $('#open-brain').addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'open-brain' }); window.close(); });
  $('#p-title').addEventListener('input', () => { titleTouched = true; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); mode === 'page' ? savePage() : saveNote(); }
  });

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const savable = tab && /^(https?|file):/.test(tab.url || '');
  if (!savable) {
    $('#tab-page').disabled = true;
    setMode('note');
    return;
  }

  $('#p-title').value = tab.title || '';
  $('#p-domain').textContent = domainOf(tab.url);
  const fav = faviconUrl(tab.url);
  if (fav) $('#p-fav').src = fav; else $('#p-fav').hidden = true;
  $('#p-note').focus();

  findByUrl(tab.url).then(x => { if (x) $('#dupe').hidden = false; });

  ({ item: pageItem, meta } = await buildPageItem(tab));
  if (!titleTouched && pageItem.title) $('#p-title').value = pageItem.title;
  showPreview(pageItem.image || pageItem.thumb, pageItem.thumb);

  if (meta.selection) {
    $('#quote-box').hidden = false;
    $('#quote-text').textContent = meta.selection.length > 280 ? meta.selection.slice(0, 280) + '…' : meta.selection;
  }
  $('#save-page').disabled = false;
}

function showPreview(src, fallback) {
  const img = $('#p-img');
  $('#shimmer').hidden = true;
  if (!src) { $('#preview').classList.add('empty'); return; }
  img.onerror = () => { if (fallback && img.src !== fallback) img.src = fallback; else $('#preview').classList.add('empty'); };
  img.src = src;
  img.hidden = false;
}

function setMode(m) {
  mode = m;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  $('#mode-page').hidden = m !== 'page';
  $('#mode-note').hidden = m !== 'note';
  (m === 'note' ? $('#n-text') : $('#p-note')).focus();
}

async function savePage() {
  if (!pageItem || $('#save-page').disabled) return;
  $('#save-page').disabled = true;
  const asQuote = meta.selection && $('#use-quote').checked;
  await addItem({
    ...pageItem,
    type: asQuote ? 'quote' : pageItem.type,
    text: asQuote ? meta.selection : '',
    title: $('#p-title').value.trim() || pageItem.title,
    note: $('#p-note').value.trim(),
    tags: $('#p-tags').value,
  });
  done();
}

async function saveNote() {
  const text = $('#n-text').value.trim();
  if (!text) return $('#n-text').focus();
  await addItem({ type: 'note', text, tags: $('#n-tags').value });
  done();
}

function done() {
  $('#done').hidden = false;
  setTimeout(() => window.close(), 750);
}

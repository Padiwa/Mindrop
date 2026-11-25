// Suggestions de titres en tapant « [[ » dans une zone de texte (lien vers un autre souvenir).
// Flèches : choisir · Entrée ou Tab : insérer [[Titre]] · Échap : fermer. Ctrl/Cmd+Entrée n'est jamais intercepté.
import { fold } from './search.js';
import { t } from './i18n.js';

let uid = 0;

// Lien en cours de frappe juste avant le curseur : { start, query } ou null.
export function openLinkAt(value, caret) {
  const m = value.slice(0, caret).match(/\[\[([^[\]\n|]*)$/);
  return m ? { start: caret - m[0].length, query: m[1] } : null;
}

// Titres proposés : commencent par la saisie, puis la contiennent ; sans accents ni casse.
export function suggestTitles(entries, query, limit = 8) {
  const q = fold(query).trim();
  const starts = [], contains = [];
  const seen = new Set();
  for (const e of entries) {
    const t = fold(e.title);
    if (!t || seen.has(t)) continue;
    if (t.startsWith(q)) { starts.push(e); seen.add(t); }
    else if (q && t.includes(q)) { contains.push(e); seen.add(t); }
  }
  return [...starts, ...contains].slice(0, limit);
}

// Position du curseur dans la zone de texte, en pixels (copie invisible de la zone).
function caretPoint(ta, pos) {
  const cs = getComputedStyle(ta);
  const mirror = document.createElement('div');
  for (const p of ['boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
    'wordSpacing', 'textTransform', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']) mirror.style[p] = cs[p];
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px' });
  mirror.textContent = ta.value.slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = '​';
  mirror.append(mark);
  document.body.append(mirror);
  const r = ta.getBoundingClientRect();
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
  const pt = { x: r.left + mark.offsetLeft - ta.scrollLeft, y: r.top + mark.offsetTop - ta.scrollTop + lh };
  mirror.remove();
  return pt;
}

/**
 * getEntries() → [{ id, title, kind }] (kind : « Note », « Lien »… affiché à droite).
 */
export function attachLinkSuggest(ta, getEntries) {
  // listes laissées par des zones de texte qui n'existent plus (fiche refermée ou rouverte)
  for (const old of document.querySelectorAll('.link-suggest')) {
    if (!document.querySelector(`[aria-controls="${old.id}"]`)) old.remove();
  }
  const id = `link-suggest-${++uid}`;
  const list = document.createElement('ul');
  list.id = id;
  list.className = 'link-suggest';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', t('suggest.links'));
  list.hidden = true;
  document.body.append(list);
  ta.setAttribute('aria-controls', id);
  ta.setAttribute('aria-expanded', 'false');

  let options = [], active = -1, at = null;

  function close() {
    list.hidden = true;
    options = []; active = -1;
    ta.setAttribute('aria-expanded', 'false');
    ta.removeAttribute('aria-activedescendant');
  }

  function highlight(i) {
    active = i;
    [...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) { ta.setAttribute('aria-activedescendant', `${id}-${i}`); list.children[i]?.scrollIntoView({ block: 'nearest' }); }
  }

  function update() {
    if (!ta.isConnected) { list.remove(); return; }
    at = openLinkAt(ta.value, ta.selectionStart ?? ta.value.length);
    if (!at) return close();
    options = suggestTitles(getEntries(), at.query);
    if (!options.length) return close();
    list.replaceChildren(...options.map((e, i) => {
      const li = document.createElement('li');
      li.id = `${id}-${i}`;
      li.setAttribute('role', 'option');
      const t = document.createElement('span');
      t.className = 'link-title';
      t.textContent = e.title;
      const k = document.createElement('span');
      k.className = 'link-kind';
      k.textContent = e.kind || '';
      li.append(t, k);
      li.addEventListener('mousedown', ev => { ev.preventDefault(); accept(i); });
      return li;
    }));
    const pt = caretPoint(ta, at.start);
    const width = Math.min(360, window.innerWidth - 16);
    list.style.left = Math.max(8, Math.min(pt.x, window.innerWidth - width - 8)) + 'px';
    list.style.top = Math.min(pt.y + 4, window.innerHeight - 40) + 'px';
    list.hidden = false;
    ta.setAttribute('aria-expanded', 'true');
    highlight(0);
  }

  function accept(i) {
    const e = options[i];
    if (!e || !at) return;
    const caret = ta.selectionStart;
    const after = ta.value.slice(caret).replace(/^[^[\]\n]*\]\]/, ''); // « ]] » déjà tapé : remplacé
    const insert = `[[${e.title}]]`;
    ta.value = ta.value.slice(0, at.start) + insert + after;
    const pos = at.start + insert.length;
    ta.setSelectionRange(pos, pos);
    close();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  ta.addEventListener('input', update);
  ta.addEventListener('click', update);
  ta.addEventListener('blur', close);
  ta.addEventListener('scroll', close);
  ta.addEventListener('keydown', e => {
    if (list.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = options.length;
      highlight(((active + (e.key === 'ArrowDown' ? 1 : -1)) % n + n) % n);
    } else if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      accept(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation(); // ferme la liste, pas la fiche
      close();
    }
  });
  return { close, list };
}

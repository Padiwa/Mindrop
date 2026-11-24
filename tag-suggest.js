// Suggestions de tags existants dans un champ de saisie de #tags (motif « combobox » accessible).
// Le mot en cours de frappe est complété avec les tags déjà utilisés, les plus fréquents d'abord.
// Flèches : choisir · Entrée ou Tab : valider · Échap : fermer. Ctrl/Cmd+Entrée n'est jamais intercepté.

const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
let uid = 0;

// [[tag, nombre], …] du plus fréquent au moins fréquent.
export function tagCounts(items) {
  const counts = new Map();
  for (const it of items) for (const t of it.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'fr'));
}

// Mot en cours autour du curseur : { start, end, query } (query sans le #).
export function currentToken(value, caret) {
  const before = value.slice(0, caret);
  const m = before.match(/(^|[\s,])(#?)([^\s,#]*)$/);
  const start = caret - m[2].length - m[3].length;
  const after = value.slice(caret).match(/^[^\s,]*/)[0];
  return { start, end: caret + after.length, query: m[3], hash: m[2] === '#' };
}

// Tags proposés pour une saisie : commencent par la saisie d'abord, puis la contiennent ; sans ceux déjà présents.
export function suggest(counts, query, present = [], limit = 6) {
  const q = fold(query);
  const taken = new Set(present.map(fold));
  const pool = counts.filter(([t]) => !taken.has(fold(t)) && fold(t) !== q);
  const starts = pool.filter(([t]) => fold(t).startsWith(q));
  const contains = q ? pool.filter(([t]) => !fold(t).startsWith(q) && fold(t).includes(q)) : [];
  return [...starts, ...contains].slice(0, limit);
}

export function attachTagSuggest(input, getCounts) {
  const id = `tag-suggest-${++uid}`;
  const wrap = document.createElement('span');
  wrap.className = 'tag-field';
  input.replaceWith(wrap);
  wrap.append(input);
  const list = document.createElement('ul');
  list.id = id;
  list.className = 'tag-suggest';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Tags existants');
  list.hidden = true;
  wrap.append(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', id);
  input.setAttribute('autocomplete', 'off');

  let options = [], active = -1, token = null;

  function close() {
    list.hidden = true;
    options = []; active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function highlight(i) {
    active = i;
    [...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) input.setAttribute('aria-activedescendant', `${id}-${i}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function update() {
    token = currentToken(input.value, input.selectionStart ?? input.value.length);
    // proposer dès qu'on tape une lettre, ou un # seul
    if (!token.query && !token.hash) return close();
    const present = input.value.split(/[\s,]+/).map(t => t.replace(/^#+/, '')).filter(Boolean);
    options = suggest(getCounts(), token.query, present);
    if (!options.length) return close();
    list.replaceChildren(...options.map(([tag, n], i) => {
      const li = document.createElement('li');
      li.id = `${id}-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      const name = document.createElement('span');
      name.className = 'tag-name';
      name.textContent = '#' + tag;
      const count = document.createElement('span');
      count.className = 'tag-count';
      count.textContent = n;
      li.append(name, count);
      li.addEventListener('mousedown', e => { e.preventDefault(); accept(i); });
      return li;
    }));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(0);
  }

  function accept(i) {
    const tag = options[i]?.[0];
    if (!tag || !token) return;
    const v = input.value;
    const insert = '#' + tag + ' ';
    const rest = v.slice(token.end).replace(/^[\s,]+/, '');
    input.value = v.slice(0, token.start) + insert + rest;
    const caret = token.start + insert.length;
    input.setSelectionRange(caret, caret);
    close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    close(); // l'événement input rouvrirait la liste sur le mot vide qui suit
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', () => { if (input.value) update(); });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', e => {
    if (list.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = options.length;
      highlight(((active + (e.key === 'ArrowDown' ? 1 : -1)) % n + n) % n);
    } else if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0) {
      e.preventDefault();
      e.stopImmediatePropagation(); // pas de validation du champ pendant le choix d'un tag
      accept(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation(); // ne ferme pas la fiche, seulement la liste
      close();
    }
  });
  return { el: wrap, close, update };
}

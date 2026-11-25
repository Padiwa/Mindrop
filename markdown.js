// Markdown minimal et sûr : construit des nœuds DOM, jamais de innerHTML.
// Blocs : titres, paragraphes (retours à la ligne conservés), listes (imbriquées,
// numérotées, cases à cocher), citations, code, séparateurs.
// En ligne : **gras**, *italique*, ~~barré~~, `code`, [lien](https://…), URL nues,
// [[Titre]] et [[Titre|texte]] (liens entre souvenirs : opts.wikilink(cible, texte) → nœuds).

import { t } from './i18n.js';

const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const SAFE_URL = /^(https?:|mailto:)/i;

function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (kids) e.append(...kids);
  return e;
}

function link(url, kids) {
  if (!SAFE_URL.test(url)) return kids;
  const a = el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, kids);
  a.addEventListener('click', e => e.stopPropagation());
  return [a];
}

// ---------- en ligne ----------
// Options du rendu en cours (renderMarkdown est synchrone).
let ctx = {};

function wikilink(target, label) {
  if (ctx.wikilink) return ctx.wikilink(target, label);
  return [el('span', { class: 'wikilink' }, [label])];
}

const INLINE = [
  { re: /\\([\\`*_{}[\]()#+\-.!~>|])/, make: m => [m[1]] },
  { re: /`([^`\n]+)`/, make: m => [el('code', null, [m[1]])] },
  { re: /\[\[([^[\]\n|]+?)(?:\|([^[\]\n]+?))?\]\]/, make: m => (m[1].trim() ? wikilink(m[1].trim(), (m[2] || m[1]).trim()) : [m[0]]) },
  { re: /\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?\s*\)/, make: m => link(m[2], inline(m[1])) },
  { re: /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"»]/, make: m => link(m[0], [m[0]]) },
  { re: /(\*\*|__)(?=\S)([\s\S]*?\S)\1/, make: m => [el('strong', null, inline(m[2]))] },
  { re: /~~(?=\S)([\s\S]*?\S)~~/, make: m => [el('del', null, inline(m[1]))] },
  { re: /(?<![\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/, make: m => [el('em', null, inline(m[1]))] },
  { re: /(?<![\w_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\w_])/, make: m => [el('em', null, inline(m[1]))] },
];

export function inline(text) {
  const out = [];
  let rest = String(text);
  while (rest) {
    let best = null, rule = null;
    for (const r of INLINE) {
      const m = r.re.exec(rest);
      if (m && (!best || m.index < best.index)) { best = m; rule = r; }
    }
    if (!best) { out.push(rest); break; }
    if (best.index) out.push(rest.slice(0, best.index));
    out.push(...rule.make(best));
    rest = rest.slice(best.index + best[0].length);
  }
  return out;
}

function lines(kids, parts) {
  parts.forEach((p, i) => { if (i) kids.push(el('br')); kids.push(...inline(p)); });
  return kids;
}

// ---------- blocs ----------
const indentOf = s => s.match(/^\s*/)[0].replace(/\t/g, '  ').length;
const isBlank = s => !s.trim();
const startsBlock = s => FENCE.test(s) || HEADING.test(s) || HR.test(s) || QUOTE.test(s) || ITEM.test(s);

function blocks(src, base, out, opts) {
  let i = 0;
  while (i < src.length) {
    const line = src[i];
    if (isBlank(line)) { i++; continue; }

    let m;
    if ((m = FENCE.exec(line))) {
      const body = [];
      i++;
      while (i < src.length && !new RegExp('^\\s*' + m[1]).test(src[i])) body.push(src[i++]);
      i++;
      out.append(el('pre', null, [el('code', null, [body.join('\n')])]));
      continue;
    }
    if ((m = HEADING.exec(line))) {
      out.append(el('h' + m[1].length, null, inline(m[2])));
      i++; continue;
    }
    if (HR.test(line)) { out.append(el('hr')); i++; continue; }
    if (QUOTE.test(line)) {
      const start = i, body = [];
      while (i < src.length && QUOTE.test(src[i])) body.push(src[i++].replace(QUOTE, ''));
      const bq = el('blockquote');
      blocks(body, base + start, bq, opts);
      out.append(bq);
      continue;
    }
    if (ITEM.test(line)) { i = list(src, i, base, out, opts); continue; }

    const para = [];
    while (i < src.length && !isBlank(src[i]) && (!para.length || !startsBlock(src[i]))) para.push(src[i++].trim());
    out.append(el('p', null, lines([], para)));
  }
}

function list(src, i, base, out, opts) {
  const first = ITEM.exec(src[i]);
  const indent = indentOf(first[1]);
  const ordered = /\d/.test(first[2]);
  const ul = el(ordered ? 'ol' : 'ul');
  if (ordered && parseInt(first[2], 10) !== 1) ul.setAttribute('start', parseInt(first[2], 10));

  while (i < src.length) {
    const m = ITEM.exec(src[i]);
    if (!m || indentOf(m[1]) !== indent || /\d/.test(m[2]) !== ordered) break;
    const li = el('li');
    const lineNo = base + i;
    const task = TASK.exec(m[3]);
    const text = [task ? task[2] : m[3]];
    i++;

    // continuation et sous-listes
    const nested = document.createDocumentFragment();
    while (i < src.length) {
      const s = src[i];
      if (isBlank(s)) {
        const next = src.slice(i + 1).find(x => !isBlank(x));
        const nm = next && ITEM.exec(next);
        if (next && (indentOf(next) > indent || (nm && indentOf(nm[1]) === indent))) { i++; continue; }
        break;
      }
      const sub = ITEM.exec(s);
      if (sub && indentOf(sub[1]) > indent) { i = list(src, i, base, nested, opts); continue; }
      if (sub || indentOf(s) <= indent && startsBlock(s)) break;
      text.push(s.trim());
      i++;
    }

    if (task) {
      li.className = 'task' + (task[1] !== ' ' ? ' done' : '');
      const box = el('input', { type: 'checkbox', 'aria-label': t('task.done') });
      box.checked = task[1] !== ' ';
      box.addEventListener('click', e => e.stopPropagation());
      if (opts.onToggle) box.addEventListener('change', () => opts.onToggle(lineNo, box.checked));
      else box.disabled = true;
      li.append(box, el('span', null, lines([], text)));
    } else {
      li.append(...lines([], text));
    }
    li.append(nested);
    ul.append(li);
  }
  out.append(ul);
  return i;
}

export function renderMarkdown(text, opts = {}) {
  const frag = document.createDocumentFragment();
  const prev = ctx;
  ctx = opts;
  try { blocks(String(text || '').replace(/\r\n?/g, '\n').split('\n'), 0, frag, opts); }
  finally { ctx = prev; }
  return frag;
}

// Coche ou décoche la case de la ligne donnée.
export function toggleTask(text, lineNo, checked) {
  const ls = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  if (ls[lineNo] != null) ls[lineNo] = ls[lineNo].replace(/\[([ xX])\]/, checked ? '[x]' : '[ ]');
  return ls.join('\n');
}

// Texte brut sans la syntaxe (carte mentale, aperçus).
export function plainText(text) {
  return String(text || '')
    .replace(/\[\[([^[\]\n|]+?)(?:\|([^[\]\n]+?))?\]\]/g, (all, t, l) => (l || t).trim() || all)
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^(\s*)([-*+]|\d{1,9}[.)])\s+\[([ xX])\]\s+/gm, (_, s, __, x) => s + (x === ' ' ? '☐ ' : '☑ '))
    .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(?<![\w*])\*(?=\S)([^*\n]*?\S)\*/g, '$1')
    .replace(/(?<![\w_])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1');
}

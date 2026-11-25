// Lecture et recherche dans la copie locale de Mindrop (écrite par host.mjs).
// Les noms techniques « second-cerveau » (dossier, pont) datent d'avant le nom Mindrop et sont gardés
// pour ne pas couper le pont installé ni égarer les sauvegardes.
import { readFileSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export const HOST_NAME = 'com.second_cerveau.bridge';

export function dataDir() {
  if (process.env.SECOND_CERVEAU_DIR) return process.env.SECOND_CERVEAU_DIR;
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'second-cerveau');
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'second-cerveau');
}
export const snapshotPath = () => join(dataDir(), 'brain.json');
export const backupDir = () => join(dataDir(), 'backups');

let cache = { mtime: 0, data: null };

// Relit le fichier seulement s'il a changé depuis la dernière lecture.
export function load() {
  const file = snapshotPath();
  let st;
  try { st = statSync(file); } catch {
    throw new Error(`Aucune copie trouvée (${file}). Lance « node mcp/install.mjs <id-extension> », puis recharge l'extension dans le navigateur pour déclencher la première synchronisation.`);
  }
  if (st.mtimeMs !== cache.mtime) {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (raw.disabled) {
      throw new Error("L'accès des agents est désactivé dans l'extension Mindrop : aucune donnée n'est partagée. Pour le rétablir : page principale de Mindrop, colonne de gauche, « Accès des agents ».");
    }
    const items = (Array.isArray(raw.items) ? raw.items : []).map(normalize);
    cache = { mtime: st.mtimeMs, data: { syncedAt: raw.syncedAt || new Date(st.mtimeMs).toISOString(), items } };
  }
  return cache.data;
}

function normalize(x) {
  return {
    id: String(x.id), type: x.type || 'note', title: x.title || '', url: x.url || '',
    text: x.text || '', note: x.note || '', description: x.description || '', content: x.content || '', image: x.image || '',
    tags: Array.isArray(x.tags) ? x.tags : [], color: x.color || '', pinned: !!x.pinned,
    createdAt: x.createdAt || 0, updatedAt: x.updatedAt || x.createdAt || 0,
  };
}

import { fold, stem, editDistance, buildIndex, search as searchIndex, parseQuery } from '../search.js';
import { buildLinkGraph, displayTitle } from '../links.js';

export { fold };
const iso = ts => (ts ? new Date(ts).toISOString() : null);

// Index de recherche et graphe des liens, calculés une fois par liste de souvenirs.
const SEARCH_FIELDS = [['title', 3], [it => it.tags.join(' '), 3], ['text', 1.5], ['note', 1.5], ['description', 0.75], ['content', 0.5], ['url', 0.5]];
const indexes = new WeakMap(), graphs = new WeakMap();
const indexOf = items => { if (!indexes.has(items)) indexes.set(items, buildIndex(items, SEARCH_FIELDS)); return indexes.get(items); };
export const graphOf = items => { if (!graphs.has(items)) graphs.set(items, buildLinkGraph(items)); return graphs.get(items); };

const ref = it => ({ id: it.id, type: it.type, title: displayTitle(it) });

// Résumé d'un souvenir pour une liste de résultats.
export function brief(it, terms = []) {
  return {
    id: it.id, type: it.type,
    title: displayTitle(it),
    url: it.url || undefined,
    tags: it.tags,
    pinned: it.pinned || undefined,
    createdAt: iso(it.createdAt),
    snippet: snippet(it, terms) || undefined,
  };
}

// Le souvenir complet (notes en Markdown, telles qu'écrites), avec ses liens [[titre]] dans les deux sens.
export const CONTENT_LIMIT = 30000;

/**
 * @param {import('../types').Item} it
 * @param {{ contentOffset?: number, graph?: ReturnType<typeof buildLinkGraph> }} [opts]
 */
export function full(it, { contentOffset = 0, graph } = {}) {
  const content = it.content ? it.content.slice(contentOffset, contentOffset + CONTENT_LIMIT) : '';
  const out = graph ? graph.links(it.id) : [];
  const back = graph ? graph.backlinks(it.id) : [];
  return {
    id: it.id, type: it.type, title: it.title || undefined, url: it.url || undefined,
    text: it.text || undefined, note: it.note || undefined, description: it.description || undefined,
    pageText: content || undefined,
    pageTextLength: it.content ? it.content.length : undefined,
    pageTextNextOffset: it.content && contentOffset + CONTENT_LIMIT < it.content.length ? contentOffset + CONTENT_LIMIT : undefined,
    image: /^https?:/.test(it.image) ? it.image : undefined,
    tags: it.tags, pinned: it.pinned, color: it.color || undefined,
    createdAt: iso(it.createdAt), updatedAt: iso(it.updatedAt),
    linksTo: out.filter(l => l.item).map(l => ref(l.item)),
    unresolvedLinks: out.filter(l => !l.item).map(l => l.target),
    linkedFrom: back.map(ref),
  };
}

// Position du premier mot cherché dans un texte (exact, sinon même racine ou à une faute près).
function locate(flat, terms) {
  const f = fold(flat);
  const exact = terms.map(t => f.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0];
  if (exact != null) return exact;
  const stems = terms.map(t => stem(t));
  for (const m of f.matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = stem(m[0]);
    if (stems.some(s => w === s || (s.length >= 4 && w.startsWith(s)) || (s.length >= 4 && editDistance(w, s, s.length >= 8 ? 2 : 1) <= (s.length >= 8 ? 2 : 1)))) return m.index;
  }
  return -1;
}

function snippet(it, terms) {
  // le premier champ qui contient un des mots cherchés, sinon le premier champ rempli
  const fields = [it.text, it.note, it.description, it.content].filter(Boolean).map(s => s.replace(/\s+/g, ' ').trim());
  if (!fields.length) return '';
  let flat = fields[0], hit = 0;
  for (const f of fields) { const i = terms.length ? locate(f, terms) : -1; if (i >= 0) { flat = f; hit = i; break; } }
  const start = Math.max(0, hit - 60);
  return (start ? '…' : '') + flat.slice(start, start + 220) + (start + 220 < flat.length ? '…' : '');
}

const TYPES = ['link', 'note', 'quote', 'image', 'video'];

// Recherche tolérante (search.js, la même que dans l'extension), classée par pertinence ;
// si aucun souvenir ne contient tous les mots, bascule en « au moins un mot ».
/**
 * @param {import('../types').Item[]} items
 * @param {import('../types').SearchOptions} [opts]
 */
export function search(items, { query = '', type, tags = [], pinned, since, until, limit = 20, offset = 0 } = {}) {
  const q = parseQuery(query);
  const tagTerms = [...q.tags, ...tags.map(t => fold(t).replace(/^#/, ''))].filter(Boolean);
  const terms = q.terms;
  const t0 = since ? Date.parse(since) : null, t1 = until ? Date.parse(until) : null;
  const keep = it =>
    (!type || type === 'all' || it.type === type) &&
    (pinned == null || it.pinned === pinned) &&
    (t0 == null || it.createdAt >= t0) && (t1 == null || it.createdAt <= t1) &&
    tagTerms.every(t => it.tags.some(x => fold(x).startsWith(t)));

  let mode = 'all', ranked;
  if (!terms.length) {
    mode = 'recent';
    ranked = items.filter(keep).map(it => ({ it, s: 0 }));
  } else {
    const scored = [...searchIndex(indexOf(items), terms)]
      .map(([i, r]) => ({ it: items[i], s: r.score + (items[i].pinned ? 0.25 : 0), matched: r.matched }))
      .filter(x => keep(x.it));
    ranked = scored.filter(x => x.matched === terms.length);
    if (!ranked.length) { mode = 'any'; ranked = scored.map(x => ({ ...x, s: x.s + x.matched * 10 })); }
  }
  ranked.sort((a, b) => (b.s - a.s) || (b.it.createdAt - a.it.createdAt));
  return { mode, total: ranked.length, results: ranked.slice(offset, offset + limit).map(x => brief(x.it, terms)) };
}

export function tagIndex(items) {
  const count = new Map(), co = new Map();
  for (const it of items) {
    for (const t of it.tags) count.set(t, (count.get(t) || 0) + 1);
    for (const a of it.tags) for (const b of it.tags) if (a !== b) {
      if (!co.has(a)) co.set(a, new Map());
      co.get(a).set(b, (co.get(a).get(b) || 0) + 1);
    }
  }
  return [...count].sort((a, b) => b[1] - a[1]).map(([tag, n]) => ({
    tag, count: n,
    related: [...(co.get(tag) || [])].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, k]) => ({ tag: t, shared: k })),
  }));
}

// Souvenirs reliés : d'abord par un lien [[titre]] (dans un sens ou l'autre), puis par les tags partagés.
export function related(items, id, limit = 10) {
  const it = items.find(x => x.id === id);
  if (!it) return null;
  const g = graphOf(items);
  const linked = new Map();
  for (const l of g.links(id)) if (l.item && l.item.id !== id) linked.set(l.item.id, { x: l.item, relation: 'cite' });
  for (const x of g.backlinks(id)) if (!linked.has(x.id)) linked.set(x.id, { x, relation: 'cité par' });
  const mine = new Set(it.tags);
  const byTags = items.filter(x => x.id !== id && !linked.has(x.id))
    .map(x => ({ x, shared: x.tags.filter(t => mine.has(t)) }))
    .filter(r => r.shared.length)
    .sort((a, b) => (b.shared.length - a.shared.length) || (b.x.createdAt - a.x.createdAt));
  const results = [
    ...[...linked.values()].map(r => ({ ...brief(r.x), relation: r.relation })),
    ...byTags.map(r => ({ ...brief(r.x), relation: 'tags', sharedTags: r.shared })),
  ].slice(0, limit);
  return { of: brief(it), results };
}

export { TYPES };

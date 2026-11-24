// Lecture et recherche dans la copie locale du second cerveau (écrite par host.mjs).
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
    const items = (Array.isArray(raw.items) ? raw.items : []).map(normalize);
    cache = { mtime: st.mtimeMs, data: { syncedAt: raw.syncedAt || new Date(st.mtimeMs).toISOString(), items } };
  }
  return cache.data;
}

function normalize(x) {
  return {
    id: String(x.id), type: x.type || 'note', title: x.title || '', url: x.url || '',
    text: x.text || '', note: x.note || '', description: x.description || '', image: x.image || '',
    tags: Array.isArray(x.tags) ? x.tags : [], color: x.color || '', pinned: !!x.pinned,
    createdAt: x.createdAt || 0, updatedAt: x.updatedAt || x.createdAt || 0,
  };
}

export const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const iso = ts => (ts ? new Date(ts).toISOString() : null);

// Résumé d'un souvenir pour une liste de résultats.
export function brief(it, terms = []) {
  return {
    id: it.id, type: it.type,
    title: it.title || firstLine(it.text) || it.url,
    url: it.url || undefined,
    tags: it.tags,
    pinned: it.pinned || undefined,
    createdAt: iso(it.createdAt),
    snippet: snippet(it, terms) || undefined,
  };
}

// Le souvenir complet (notes en Markdown, telles qu'écrites).
export function full(it) {
  return {
    id: it.id, type: it.type, title: it.title || undefined, url: it.url || undefined,
    text: it.text || undefined, note: it.note || undefined, description: it.description || undefined,
    image: /^https?:/.test(it.image) ? it.image : undefined,
    tags: it.tags, pinned: it.pinned, color: it.color || undefined,
    createdAt: iso(it.createdAt), updatedAt: iso(it.updatedAt),
  };
}

function firstLine(s) {
  const l = String(s || '').split('\n').find(x => x.trim());
  return l ? l.replace(/^#+\s*/, '').trim().slice(0, 120) : '';
}

function snippet(it, terms) {
  const src = [it.text, it.note, it.description].find(Boolean) || '';
  const flat = src.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const f = fold(flat);
  const hit = terms.map(t => f.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, hit - 60);
  return (start ? '…' : '') + flat.slice(start, start + 220) + (start + 220 < flat.length ? '…' : '');
}

const TYPES = ['link', 'note', 'quote', 'image', 'video'];

// Recherche comme dans l'extension (insensible aux accents, #tag pour filtrer),
// classée par pertinence ; si aucun souvenir ne contient tous les mots, bascule en « au moins un mot ».
export function search(items, { query = '', type, tags = [], pinned, since, until, limit = 20, offset = 0 } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const tagTerms = [...words.filter(w => w.startsWith('#')).map(w => w.slice(1)), ...tags.map(t => fold(t).replace(/^#/, ''))].filter(Boolean);
  const terms = words.filter(w => !w.startsWith('#'));
  const t0 = since ? Date.parse(since) : null, t1 = until ? Date.parse(until) : null;

  const pool = items.filter(it =>
    (!type || type === 'all' || it.type === type) &&
    (pinned == null || it.pinned === pinned) &&
    (t0 == null || it.createdAt >= t0) && (t1 == null || it.createdAt <= t1) &&
    tagTerms.every(t => it.tags.some(x => fold(x).startsWith(t))));

  const score = it => {
    const fields = [[it.title, 3], [it.tags.join(' '), 3], [it.text, 1.5], [it.note, 1.5], [it.description, 0.75], [it.url, 0.5]]
      .map(([v, w]) => [fold(v), w]);
    let s = 0, matched = 0;
    for (const t of terms) {
      let hit = false;
      for (const [v, w] of fields) if (v.includes(t)) { s += w; hit = true; }
      if (hit) matched++;
    }
    return { s: s + (it.pinned ? 0.25 : 0), matched };
  };

  let mode = 'all', ranked;
  if (!terms.length) {
    ranked = pool.map(it => ({ it, s: 0 }));
    mode = 'recent';
  } else {
    const scored = pool.map(it => ({ it, ...score(it) }));
    ranked = scored.filter(x => x.matched === terms.length);
    if (!ranked.length) { mode = 'any'; ranked = scored.filter(x => x.matched > 0).map(x => ({ ...x, s: x.s + x.matched * 10 })); }
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

// Souvenirs qui partagent le plus de tags avec celui donné.
export function related(items, id, limit = 10) {
  const it = items.find(x => x.id === id);
  if (!it) return null;
  const mine = new Set(it.tags);
  const results = items.filter(x => x.id !== id)
    .map(x => ({ x, shared: x.tags.filter(t => mine.has(t)) }))
    .filter(r => r.shared.length)
    .sort((a, b) => (b.shared.length - a.shared.length) || (b.x.createdAt - a.x.createdAt))
    .slice(0, limit)
    .map(r => ({ ...brief(r.x), sharedTags: r.shared }));
  return { of: brief(it), results };
}

export { TYPES };

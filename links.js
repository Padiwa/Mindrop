// Liens entre souvenirs : [[Titre]] ou [[Titre|texte affiché]] dans une note ou une note perso.
// Un lien vise le souvenir dont le titre est le même, sans tenir compte des accents ni de la casse ;
// le titre d'une note est sa première ligne. Partagé par la page principale, la carte et le serveur MCP.
import { fold } from './search.js';

export const WIKILINK = /\[\[([^[\]\n|]+?)(?:\|([^[\]\n]+?))?\]\]/g;

// Première ligne d'un texte, sans la syntaxe Markdown de début de ligne.
export function firstLine(s) {
  const l = String(s || '').split('\n').find(x => x.trim());
  return l ? l.replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?)/, '').replace(/[*_`~]/g, '').trim().slice(0, 120) : '';
}

export function displayTitle(it) {
  return String(it.title || '').trim() || firstLine(it.text) || it.url || '';
}

const key = s => fold(s).replace(/\s+/g, ' ').trim();

// [{ target, label }] dans l'ordre d'apparition, sans doublon de cible.
export function parseLinks(text) {
  const out = [], seen = new Set();
  for (const m of String(text || '').matchAll(WIKILINK)) {
    const target = m[1].trim();
    if (!target || seen.has(key(target))) continue;
    seen.add(key(target));
    out.push({ target, label: (m[2] || '').trim() || target });
  }
  return out;
}

/**
 * Graphe des liens d'une liste de souvenirs.
 * resolve(titre) → souvenir | null · links(id) → [{ target, label, item }] · backlinks(id) → [souvenir]
 * edges : [[idSource, idCible]] (liens résolus, sans lien vers soi-même)
 */
export function buildLinkGraph(items) {
  const byTitle = new Map();
  // à titre égal, le plus récent l'emporte
  for (const it of [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
    const k = key(displayTitle(it));
    if (k) byTitle.set(k, it);
  }
  const resolve = title => byTitle.get(key(title)) || null;
  const out = new Map(), back = new Map(), edges = [];
  for (const it of items) {
    const ls = parseLinks(`${it.text || ''}\n${it.note || ''}`).map(l => ({ ...l, item: resolve(l.target) }));
    out.set(it.id, ls);
    for (const l of ls) {
      if (!l.item || l.item.id === it.id) continue;
      if (!back.has(l.item.id)) back.set(l.item.id, []);
      if (!back.get(l.item.id).includes(it)) { back.get(l.item.id).push(it); edges.push([it.id, l.item.id]); }
    }
  }
  return {
    resolve,
    links: id => out.get(id) || [],
    backlinks: id => back.get(id) || [],
    edges,
  };
}

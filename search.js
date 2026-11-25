// Recherche tolérante, partagée par la page cerveau et le serveur MCP (aucune dépendance au navigateur).
// Un mot cherché trouve un souvenir, du plus sûr au plus large :
//   1. texte exact (morceau de mot, nombre, adresse)       « zettel », « 90 000 »
//   2. même racine (pluriels, -ie/-y, e muet)              « méthodes » → « methods », « typographie » → « Typography »
//   3. une ou deux lettres de différence (faute de frappe) « zettelkastn » → « Zettelkasten »
// L'index des mots est construit une fois pour une liste de souvenirs, puis réutilisé à chaque frappe.

export const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function words(s) {
  return fold(s).match(/[\p{L}\p{N}]+/gu) || [];
}

const ENDINGS = ['ies', 'ie', 'es', 's', 'x', 'y', 'e'];

// Racine grossière, français et anglais : retire une terminaison de pluriel ou de fin de mot.
export function stem(w) {
  if (w.length <= 3 || /\d/.test(w)) return w;
  for (const e of ENDINGS) {
    if (e === 's' && w.endsWith('ss')) continue;
    if (w.endsWith(e) && w.length - e.length >= 3) return w.slice(0, -e.length);
  }
  return w;
}

// Distance d'édition (insertion, suppression, substitution, inversion de deux lettres), arrêtée au-delà de max.
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

const allowedTypos = n => (n >= 8 ? 2 : n >= 4 ? 1 : 0);

// Qualité de correspondance d'un mot de l'index pour un mot cherché (0 = aucune).
const EXACT = 1, STEM = 0.9, PREFIX = 0.8, TYPO = 0.6;

/**
 * fields : [[nom ou fonction(item) → texte, poids], …]
 * Renvoie un index réutilisable : search(index, mots) → Map(position du souvenir → { score, matched }).
 */
export function buildIndex(items, fields) {
  const get = fields.map(([f, w]) => [typeof f === 'function' ? f : it => it[f], w]);
  const hay = items.map(it => get.map(([g, w]) => [fold(g(it)), w]));
  const vocab = new Map(); // racine → Map(position → meilleur poids de champ)
  items.forEach((it, i) => {
    for (const [g, w] of get) {
      for (const word of new Set(words(g(it)))) {
        const s = stem(word);
        let post = vocab.get(s);
        if (!post) vocab.set(s, post = new Map());
        if ((post.get(i) || 0) < w) post.set(i, w);
      }
    }
  });
  return { items, hay, vocab, cache: new Map() };
}

// Pour un mot cherché : Map(position → qualité × poids du champ), la meilleure par souvenir.
function hitsFor(index, term) {
  if (index.cache.has(term)) return index.cache.get(term);
  const hits = new Map();
  const add = (i, v) => { if ((hits.get(i) || 0) < v) hits.set(i, v); };

  // 1. texte exact, dans tous les champs
  index.hay.forEach((fields, i) => {
    for (const [text, w] of fields) if (text && text.includes(term)) add(i, EXACT * w);
  });

  // 2 et 3. par le vocabulaire : racine, début de racine, faute de frappe
  const parts = words(term);
  if (parts.length === 1) {
    const ts = stem(parts[0]);
    const k = allowedTypos(ts.length);
    for (const [s, post] of index.vocab) {
      let q = 0;
      if (s === ts) q = STEM;
      else if (ts.length >= 4 && s.startsWith(ts)) q = PREFIX;
      else if (k && Math.abs(s.length - ts.length) <= k && editDistance(s, ts, k) <= k) q = TYPO;
      if (q) for (const [i, w] of post) add(i, q * w);
    }
  }
  if (index.cache.size > 200) index.cache.clear();
  index.cache.set(term, hits);
  return hits;
}

// Chaque souvenir trouvé : { score, matched } (matched = nombre de mots cherchés trouvés).
export function search(index, terms) {
  const out = new Map();
  for (const t of terms.map(fold).filter(Boolean)) {
    for (const [i, v] of hitsFor(index, t)) {
      const r = out.get(i) || { score: 0, matched: 0 };
      r.score += v;
      r.matched++;
      out.set(i, r);
    }
  }
  return out;
}

// Découpe une requête : mots ordinaires et #tags.
export function parseQuery(q) {
  const parts = fold(q).split(/\s+/).filter(Boolean);
  return {
    terms: parts.filter(p => !p.startsWith('#')),
    tags: parts.filter(p => p.startsWith('#') && p.length > 1).map(p => p.slice(1)),
  };
}

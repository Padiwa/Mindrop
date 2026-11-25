// Titre, chaîne et miniature d'une vidéo YouTube, par le service oEmbed officiel de YouTube.
// Nécessaire parce que YouTube est une application d'une seule page : en passant d'une vidéo
// à l'autre, la balise og:title de la page reste celle du premier chargement (« YouTube »).
import { youtubeId } from './storage.js';
import { t } from './i18n.js';

const thumb = (id, q) => `https://i.ytimg.com/vi/${id}/${q}.jpg`;

// Miniature HD si elle existe (YouTube renvoie 404 sinon), sinon la miniature standard, toujours présente.
export async function bestThumbnail(id, { fetchImpl = fetch } = {}) {
  try {
    const r = await fetchImpl(thumb(id, 'maxresdefault'), { method: 'HEAD' });
    if (r.ok) return thumb(id, 'maxresdefault');
  } catch {}
  return thumb(id, 'hqdefault');
}

// { id, title, author, image } ou null (pas une vidéo YouTube, vidéo privée ou supprimée, hors ligne).
export async function videoInfo(url, { fetchImpl = fetch } = {}) {
  const id = youtubeId(url);
  if (!id) return null;
  const image = await bestThumbnail(id, { fetchImpl });
  try {
    const r = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`);
    if (!r.ok) return { id, title: '', author: '', image };
    const j = await r.json();
    return { id, title: String(j.title || '').trim(), author: String(j.author_name || '').trim(), image };
  } catch {
    return { id, title: '', author: '', image };
  }
}

// Complète un souvenir de type lien s'il pointe vers une vidéo YouTube (titre, chaîne, miniature).
/**
 * @template {import('./types').NewItem} T
 * @param {T} item
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<T>}
 */
export async function withVideoInfo(item, opts) {
  const v = await videoInfo(item.url, opts);
  if (!v) return item;
  return {
    ...item,
    type: 'video',
    title: v.title || item.title,
    image: v.image,
    description: v.author ? t('video.channel', { a: v.author }) : item.description,
  };
}

// Titre d'onglet YouTube sans le compteur de notifications ni le suffixe : « (3) Titre - YouTube » → « Titre ».
export function cleanYoutubeTitle(t) {
  const s = String(t || '').replace(/^\(\d+\+?\)\s*/, '').replace(/\s*[-–]\s*YouTube\s*$/i, '').trim();
  return /^youtube$/i.test(s) ? '' : s;
}

// Titre bouche-trou enregistré avant la correction : vide, « YouTube », le domaine ou l'adresse elle-même.
export function hasPlaceholderTitle(it) {
  const t = String(it.title || '').trim();
  return !t || /^(www\.)?(youtube|youtube\.com|youtu\.be)$/i.test(t) || t === it.url;
}

// Vidéo YouTube à compléter : titre bouche-trou ou pas de miniature YouTube.
export function needsVideoFix(it) {
  return !!youtubeId(it.url) && (hasPlaceholderTitle(it) || !/^https:\/\/i\.ytimg\.com\//.test(it.image || ''));
}

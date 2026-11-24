// Stockage local des souvenirs (chrome.storage.local, illimité).
export const KEY = 'items';

export async function getItems() {
  const r = await chrome.storage.local.get(KEY);
  return Array.isArray(r[KEY]) ? r[KEY] : [];
}

export async function saveItems(items) {
  await chrome.storage.local.set({ [KEY]: items });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function addItem(data) {
  const now = Date.now();
  const item = {
    id: uid(), type: 'link', title: '', url: '', text: '', note: '',
    description: '', image: '', thumb: '', tags: [], color: '',
    pinned: false, createdAt: now, updatedAt: now,
    ...data,
  };
  item.tags = normalizeTags(item.tags);
  const items = await getItems();
  items.unshift(item);
  await saveItems(items);
  return item;
}

export async function updateItem(id, patch) {
  const items = await getItems();
  const i = items.findIndex(x => x.id === id);
  if (i < 0) return null;
  items[i] = { ...items[i], ...patch, updatedAt: Date.now() };
  if ('tags' in patch) items[i].tags = normalizeTags(patch.tags);
  await saveItems(items);
  return items[i];
}

export async function deleteItem(id) {
  const items = await getItems();
  await saveItems(items.filter(x => x.id !== id));
}

export async function findByUrl(url) {
  if (!url) return null;
  return (await getItems()).find(x => x.url === url && x.type !== 'quote') || null;
}

export function normalizeTags(input) {
  const arr = Array.isArray(input) ? input : String(input || '').split(/[,\s]+/);
  return [...new Set(arr
    .map(t => String(t).trim().replace(/^#+/, '').toLowerCase())
    .filter(Boolean))];
}

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function faviconUrl(url, size = 32) {
  if (!url || !/^https?:/.test(url)) return '';
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', url);
  u.searchParams.set('size', String(size));
  return u.toString();
}

export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : '';
}

export function guessType(url) {
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url || '')) return 'image';
  if (youtubeId(url) || /vimeo\.com\/\d+/.test(url || '')) return 'video';
  return 'link';
}

export function imageFor(url) {
  const yt = youtubeId(url);
  return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : '';
}

// Réduit une image (dataURL, URL ou Blob) en JPEG compact.
export async function shrinkImage(src, maxW = 640, quality = 0.72) {
  const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxW / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return blobToDataUrl(out);
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(bin)}`;
}

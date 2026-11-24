// Lecture des métadonnées d'une page + capture d'écran miniature.
import { guessType, imageFor, shrinkImage } from './storage.js';

export async function readPageMeta(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const m = s => document.querySelector(s)?.getAttribute('content') || '';
        const abs = v => { try { return v ? new URL(v, location.href).href : ''; } catch { return ''; } };
        return {
          title: m('meta[property="og:title"]') || document.title,
          description: m('meta[property="og:description"]') || m('meta[name="description"]'),
          ogImage: abs(m('meta[property="og:image"]') || m('meta[name="twitter:image"]')),
          selection: String(getSelection() || '').trim(),
        };
      },
    });
    return res?.result || {};
  } catch {
    return {}; // pages protégées (chrome://, Web Store…)
  }
}

export async function captureThumb(windowId) {
  try {
    const shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 80 });
    return await shrinkImage(shot, 640, 0.7);
  } catch {
    return '';
  }
}

export async function buildPageItem(tab, { withThumb = true } = {}) {
  const meta = await readPageMeta(tab.id);
  const item = {
    type: guessType(tab.url),
    title: meta.title || tab.title || tab.url,
    url: tab.url,
    description: (meta.description || '').slice(0, 400),
    image: imageFor(tab.url) || meta.ogImage || '',
  };
  if (withThumb) item.thumb = await captureThumb(tab.windowId);
  return { item, meta };
}

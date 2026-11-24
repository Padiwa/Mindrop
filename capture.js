// Lecture d'une page au moment de l'enregistrer : métadonnées, capture miniature.
import { guessType, imageFor, shrinkImage } from './storage.js';
import { videoInfo, cleanYoutubeTitle } from './video.js';

// Exécuté dans la page : doit se suffire à lui-même (aucune variable extérieure).
export function pageReader() {
  const m = s => document.querySelector(s)?.getAttribute('content') || '';
  const abs = v => { try { return v ? new URL(v, location.href).href : ''; } catch { return ''; } };
  const youtube = /(^|\.)youtube\.com$/.test(location.hostname);

  return {
    // sur YouTube, les balises og:* restent celles de la première page chargée : on ne s'y fie pas
    title: youtube ? '' : (m('meta[property="og:title"]') || document.title),
    pageTitle: document.title,
    description: youtube ? '' : (m('meta[property="og:description"]') || m('meta[name="description"]')),
    ogImage: youtube ? '' : abs(m('meta[property="og:image"]') || m('meta[name="twitter:image"]')),
    selection: String(getSelection() || '').trim(),
  };
}

export async function readPageMeta(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: pageReader });
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
  const video = await videoInfo(tab.url);
  if (video) {
    item.title = video.title || cleanYoutubeTitle(meta.pageTitle) || cleanYoutubeTitle(tab.title) || item.title;
    item.image = video.image;
    if (video.author) item.description = 'Chaîne : ' + video.author;
  }
  if (withThumb) item.thumb = await captureThumb(tab.windowId);
  return { item, meta };
}

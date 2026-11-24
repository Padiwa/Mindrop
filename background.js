import { onItemsChanged, getItems, updateItem, addItem, guessType, domainOf, imageFor, shrinkImage } from './storage.js';
import { buildPageItem } from './capture.js';
import { runBackup, getBackupStatus } from './backup.js';
import { syncAgent } from './agent.js';
import { withVideoInfo, videoInfo, needsVideoFix, hasPlaceholderTitle } from './video.js';

const MENUS = [
  { id: 'save-page', title: 'Enregistrer cette page', contexts: ['page'] },
  { id: 'save-selection', title: 'Enregistrer la sélection comme citation', contexts: ['selection'] },
  { id: 'save-link', title: 'Enregistrer ce lien', contexts: ['link'] },
  { id: 'save-image', title: 'Enregistrer cette image', contexts: ['image'] },
  { id: 'open-brain', title: 'Ouvrir mon second cerveau', contexts: ['action'] },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => MENUS.forEach(m => chrome.contextMenus.create(m)));
  repairVideos();
  scheduleSync(0);
  chrome.alarms.create('backup', { delayInMinutes: 1 });
});

// ---------- vidéos enregistrées avec le titre « YouTube » (avant la 1.5) ----------
async function repairVideos() {
  try {
    for (const it of (await getItems()).filter(needsVideoFix)) {
      const v = await videoInfo(it.url);
      if (!v) continue;
      await updateItem(it.id, cur => ({
        type: 'video',
        title: hasPlaceholderTitle(cur) && v.title ? v.title : cur.title, // un titre choisi par toi n'est jamais remplacé
        image: v.image,
        description: cur.description || (v.author ? 'Chaîne : ' + v.author : ''),
      }));
    }
  } catch (e) { console.warn('réparation des vidéos', e); }
}

// ---------- copie pour le serveur MCP (mcp/) ----------
// Tenue à jour si l'accès des agents est activé (page cerveau), effacée sinon : voir agent.js.
let syncTimer;
function scheduleSync(delay = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncAgent(), delay);
}
onItemsChanged(() => {
  scheduleSync();
  // sauvegarde complète une minute après le dernier changement (l'alarme survit à la mise en veille du service worker)
  chrome.alarms.create('backup', { delayInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'backup') runBackup(); });
chrome.runtime.onStartup.addListener(async () => {
  scheduleSync(0);
  const last = await getBackupStatus();
  if (!last?.ok || Date.now() - last.at > 864e5) chrome.alarms.create('backup', { delayInMinutes: 1 });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    switch (info.menuItemId) {
      case 'save-page': {
        const { item } = await buildPageItem(tab);
        await addItem(item);
        break;
      }
      case 'save-selection':
        await addItem({ type: 'quote', text: info.selectionText, title: tab?.title || '', url: info.pageUrl });
        break;
      case 'save-link':
        await addItem(await withVideoInfo({
          type: guessType(info.linkUrl),
          url: info.linkUrl,
          title: info.linkText || info.selectionText || domainOf(info.linkUrl) || info.linkUrl,
          image: imageFor(info.linkUrl),
        }));
        break;
      case 'save-image': {
        let image = info.srcUrl;
        if (image?.startsWith('data:')) image = await shrinkImage(image, 1200, 0.8);
        await addItem({ type: 'image', image, url: info.pageUrl, title: tab?.title || '' });
        break;
      }
      case 'open-brain':
        return openBrain();
    }
    flash(tab?.id, true);
  } catch (e) {
    console.error(e);
    flash(tab?.id, false);
  }
});

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd === 'open-brain') return openBrain();
  if (cmd === 'quick-save') {
    tab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab || !/^(https?|file):/.test(tab.url || '')) return flash(tab?.id, false);
    const { item } = await buildPageItem(tab);
    await addItem(item);
    flash(tab.id, true);
  }
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg?.type === 'open-brain') openBrain();
});

async function openBrain() {
  const url = chrome.runtime.getURL('brain.html');
  // getContexts trouve l'onglet sans permission « tabs » (tabs.query ignorait le filtre url)
  let ctx;
  try { [ctx] = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] }); } catch {}
  if (ctx && ctx.tabId >= 0) {
    await chrome.tabs.update(ctx.tabId, { active: true });
    await chrome.windows.update(ctx.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

function flash(tabId, ok) {
  if (tabId == null) return;
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#e8613c' : '#888', tabId });
  chrome.action.setBadgeText({ text: ok ? '✓' : '×', tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }).catch(() => {}), 1800);
}

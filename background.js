import { KEY, getItems, addItem, guessType, domainOf, imageFor, shrinkImage } from './storage.js';
import { buildPageItem } from './capture.js';

const MENUS = [
  { id: 'save-page', title: 'Enregistrer cette page', contexts: ['page'] },
  { id: 'save-selection', title: 'Enregistrer la sélection comme citation', contexts: ['selection'] },
  { id: 'save-link', title: 'Enregistrer ce lien', contexts: ['link'] },
  { id: 'save-image', title: 'Enregistrer cette image', contexts: ['image'] },
  { id: 'open-brain', title: 'Ouvrir mon second cerveau', contexts: ['action'] },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => MENUS.forEach(m => chrome.contextMenus.create(m)));
  scheduleSync(0);
});

// ---------- copie locale pour le serveur MCP (mcp/) ----------
// Envoie les souvenirs à l'hôte natif, qui les écrit dans un fichier lu par l'agent.
// Sans hôte installé (node mcp/install.mjs), l'envoi échoue en silence.
const HOST = 'com.second_cerveau.bridge';
let syncTimer;
function scheduleSync(delay = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToAgent, delay);
}
async function syncToAgent() {
  try {
    const items = (await getItems()).map(({ thumb, image, ...x }) => ({ ...x, image: /^https?:/.test(image || '') ? image : '' }));
    await chrome.runtime.sendNativeMessage(HOST, { type: 'snapshot', syncedAt: new Date().toISOString(), items });
  } catch { /* hôte non installé */ }
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[KEY]) scheduleSync(); });
chrome.runtime.onStartup.addListener(() => scheduleSync(0));

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
        await addItem({
          type: guessType(info.linkUrl),
          url: info.linkUrl,
          title: info.linkText || info.selectionText || domainOf(info.linkUrl) || info.linkUrl,
          image: imageFor(info.linkUrl),
        });
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

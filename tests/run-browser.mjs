#!/usr/bin/env node
// Lance les tests de tests/browser/*.html dans Chromium headless, sans dépendance :
// un petit serveur de fichiers statiques et le protocole de débogage de Chrome (WebSocket natif de Node 22).
// Navigateur : variable CHROME_PATH, sinon chromium, google-chrome, brave… trouvé dans le PATH.
import { createServer } from 'node:http';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (typeof WebSocket === 'undefined') { console.error('Node 22 ou plus est requis (WebSocket natif).'); process.exit(2); }

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'brave', 'brave-browser', 'microsoft-edge']) {
    try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); } catch {}
  }
  for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']) {
    try { execFileSync('test', ['-x', p]); return p; } catch {}
  }
  return null;
}

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = findBrowser();
if (!browser) { console.error('Aucun navigateur Chromium trouvé : définis CHROME_PATH.'); process.exit(2); }

const profile = await mkdtemp(join(tmpdir(), 'mindrop-chrome-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let failed = 0, total = 0;
try {
  let ver;
  for (let i = 0; i < 75 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(200); } }
  if (!ver) throw new Error('le navigateur ne répond pas');
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let n = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}, sessionId) => new Promise(r => { const id = ++n; pending.set(id, r); ws.send(JSON.stringify({ id, method, params, sessionId })); });

  const pages = (await readdir(join(root, 'tests', 'browser'))).filter(f => f.endsWith('.html')).sort();
  for (const page of pages) {
    // un contexte isolé par page : IndexedDB et stockage vierges
    const { result: { browserContextId } } = await send('Target.createBrowserContext');
    const { result: { targetId } } = await send('Target.createTarget', { url: `${base}/tests/browser/${page}`, browserContextId });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    let results = null;
    for (let i = 0; i < 100 && !results; i++) {
      await sleep(200);
      const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__results || null)', returnByValue: true }, sessionId);
      results = JSON.parse(r.result?.result?.value || 'null');
    }
    console.log(`\n${page}`);
    if (!results) { console.log('  ✗ aucun résultat après 20 s (erreur de chargement ?)'); failed++; total++; }
    else for (const t of results) {
      total++;
      if (t.ok) console.log(`  ✓ ${t.name}`);
      else { failed++; console.log(`  ✗ ${t.name}\n      ${t.error.split('\n')[0]}`); }
    }
    await send('Target.disposeBrowserContext', { browserContextId });
  }
  ws.close();
} catch (e) {
  console.error('Erreur du lanceur :', e.message);
  failed++;
} finally {
  chrome.kill();
  server.close();
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
console.log(`\n${total - failed}/${total} tests navigateur réussis`);
process.exit(failed ? 1 : 0);

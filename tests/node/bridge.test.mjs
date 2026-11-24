// Le pont local (mcp/host.mjs) lancé comme le ferait le navigateur, et le serveur MCP (mcp/server.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), 'second-cerveau-test-')); });
after(() => rmSync(dir, { recursive: true, force: true }));

const frame = msg => {
  const body = Buffer.from(JSON.stringify(msg));
  const head = Buffer.alloc(4); head.writeUInt32LE(body.length);
  return Buffer.concat([head, body]);
};

// Ouvre le pont, envoie les messages, renvoie toutes les réponses décodées.
function bridge(messages) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(root, 'mcp', 'host.mjs')], { env: { ...process.env, SECOND_CERVEAU_DIR: dir } });
    let buf = Buffer.alloc(0);
    p.stdout.on('data', c => { buf = Buffer.concat([buf, c]); });
    p.on('error', reject);
    p.on('close', () => {
      const out = [];
      while (buf.length >= 4) { const n = buf.readUInt32LE(0); out.push(JSON.parse(buf.subarray(4, 4 + n))); buf = buf.subarray(4 + n); }
      resolve(out);
    });
    for (const m of messages) p.stdin.write(frame(m));
    p.stdin.end();
  });
}

const item = (i, extra = {}) => ({ id: 'i' + i, type: 'note', text: 'souvenir ' + i, tags: ['t'], createdAt: 1000 + i, updatedAt: 1000 + i, ...extra });
const backupName = () => new Date().toLocaleDateString('sv') + '.json';

test('copie légère pour le serveur MCP, écrite avec des droits privés', async () => {
  const [r] = await bridge([{ type: 'snapshot', syncedAt: '2026-11-24T10:00:00Z', items: [item(1), item(2)] }]);
  assert.deepEqual(r, { ok: true, count: 2 });
  const file = join(dir, 'brain.json');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).items.length, 2);
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('sauvegarde complète envoyée en plusieurs morceaux', async () => {
  const items = Array.from({ length: 25 }, (_, i) => item(i, { image: 'data:image/jpeg;base64,' + 'A'.repeat(1000) }));
  const replies = await bridge([
    { type: 'backup-begin', id: 'b1', total: 25, exportedAt: '2026-11-24T10:00:00Z' },
    { type: 'backup-chunk', id: 'b1', items: items.slice(0, 10) },
    { type: 'backup-chunk', id: 'b1', items: items.slice(10) },
    { type: 'backup-end', id: 'b1' },
  ]);
  assert.ok(replies.every(r => r.ok), JSON.stringify(replies));
  const end = replies.at(-1);
  assert.equal(end.count, 25);
  assert.equal(end.name, backupName());
  const saved = JSON.parse(readFileSync(join(dir, 'backups', end.name), 'utf8'));
  assert.equal(saved.app, 'second-cerveau');
  assert.deepEqual(saved.items, items, 'le fichier contient exactement les souvenirs, images comprises');
});

test('une sauvegarde incomplète est refusée et ne remplace pas la précédente', async () => {
  const before = readFileSync(join(dir, 'backups', backupName()), 'utf8');
  const replies = await bridge([
    { type: 'backup-begin', id: 'b2', total: 5 },
    { type: 'backup-chunk', id: 'b2', items: [item(1)] },
    { type: 'backup-end', id: 'b2' },
  ]);
  assert.equal(replies.at(-1).ok, false);
  assert.match(replies.at(-1).error, /incomplète/);
  assert.equal(readFileSync(join(dir, 'backups', backupName()), 'utf8'), before);
  assert.ok(!readdirSync(join(dir, 'backups')).some(n => n.startsWith('.partial-')));
});

test('navigateur fermé en pleine sauvegarde : rien n’est remplacé', async () => {
  const before = readFileSync(join(dir, 'backups', backupName()), 'utf8');
  await bridge([{ type: 'backup-begin', id: 'b3', total: 3 }, { type: 'backup-chunk', id: 'b3', items: [item(1)] }]);
  assert.equal(readFileSync(join(dir, 'backups', backupName()), 'utf8'), before);
  assert.ok(!readdirSync(join(dir, 'backups')).some(n => n.startsWith('.partial-')));
});

test('moins de souvenirs que la sauvegarde du jour : l’ancienne version est gardée', async () => {
  const replies = await bridge([{ type: 'backup-begin', id: 'shrink', total: 2 }, { type: 'backup-chunk', id: 'shrink', items: [item(1), item(2)] }, { type: 'backup-end', id: 'shrink' }]);
  assert.equal(replies.at(-1).count, 2);
  const [list] = await bridge([{ type: 'list-backups' }]);
  const today = list.backups.find(b => b.name === backupName());
  const kept = list.backups.find(b => b.date === today.date && b.time);
  assert.equal(today.count, 2);
  assert.ok(kept, 'version précédente gardée');
  assert.equal(kept.count, 25);
  assert.match(kept.name, /^\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
  const parts = await bridge([{ type: 'read-backup', name: kept.name }]);
  assert.equal(parts.flatMap(p => p.items).length, 25, 'la version gardée se relit');
  // on remet la sauvegarde complète en place pour la suite
  const items = Array.from({ length: 25 }, (_, i) => item(i, { image: 'data:image/jpeg;base64,' + 'A'.repeat(1000) }));
  await bridge([{ type: 'backup-begin', id: 'back', total: 25 }, { type: 'backup-chunk', id: 'back', items }, { type: 'backup-end', id: 'back' }]);
});

test('liste des sauvegardes avec le nombre de souvenirs', async () => {
  const [r] = await bridge([{ type: 'list-backups' }]);
  assert.equal(r.backups[0].name, backupName());
  assert.equal(r.backups[0].count, 25);
});

test('relecture découpée en messages de moins de 1 Mo', async () => {
  const big = Array.from({ length: 6 }, (_, i) => item(i, { image: 'data:image/jpeg;base64,' + 'B'.repeat(300 * 1024) }));
  await bridge([{ type: 'backup-begin', id: 'b4', total: 6 }, { type: 'backup-chunk', id: 'b4', items: big }, { type: 'backup-end', id: 'b4' }]);
  const parts = await bridge([{ type: 'read-backup', name: backupName() }]);
  assert.ok(parts.length > 1, 'plusieurs messages');
  assert.ok(parts.slice(0, -1).every(p => p.more === true) && !parts.at(-1).more);
  assert.ok(parts.every(p => JSON.stringify(p).length < 1024 * 1024));
  assert.deepEqual(parts.flatMap(p => p.items), big);
});

test('un souvenir trop lourd pour un message revient sans son image encodée', async () => {
  const huge = [item(1, { image: 'data:image/jpeg;base64,' + 'C'.repeat(1100 * 1024), thumb: 'data:x' })];
  await bridge([{ type: 'backup-begin', id: 'b5', total: 1 }, { type: 'backup-chunk', id: 'b5', items: huge }, { type: 'backup-end', id: 'b5' }]);
  const parts = await bridge([{ type: 'read-backup', name: backupName() }]);
  assert.equal(parts.at(-1).skippedImages, 1);
  assert.equal(parts.at(-1).items[0].image, '');
  assert.equal(parts.at(-1).items[0].text, 'souvenir 1');
});

test('noms de fichiers hors du dossier refusés', async () => {
  for (const name of ['../brain.json', 'index.json', '/etc/passwd']) {
    const [r] = await bridge([{ type: 'read-backup', name }]);
    assert.equal(r.ok, false, name);
  }
  const [r] = await bridge([{ type: 'backup-begin', id: '../x', total: 0 }]);
  assert.equal(r.ok, false);
});

test('seules les 30 dernières sauvegardes sont gardées', async () => {
  const bdir = join(dir, 'backups');
  mkdirSync(bdir, { recursive: true });
  for (let d = 1; d <= 35; d++) writeFileSync(join(bdir, `2020-01-${String(d).padStart(2, '0')}.json`.replace('-01-3', '-02-0')), '{"items":[]}');
  await bridge([{ type: 'backup-begin', id: 'b6', total: 0 }, { type: 'backup-end', id: 'b6' }]);
  const kept = readdirSync(bdir).filter(n => /^\d{4}-\d{2}-\d{2}(-\d{6})?\.json$/.test(n)).sort();
  assert.equal(kept.length, 30);
  assert.equal(kept.at(-1), backupName(), 'la sauvegarde du jour est gardée');
});

test('message inconnu : erreur, sans arrêter le pont', async () => {
  const replies = await bridge([{ type: 'nope' }, { type: 'ping' }]);
  assert.equal(replies[0].ok, false);
  assert.equal(replies[1].ok, true);
});

// ---------- serveur MCP ----------
function mcp(requests, env) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [join(root, 'mcp', 'server.mjs')], { env: { ...process.env, ...env } });
    const out = [];
    createInterface({ input: p.stdout }).on('line', l => out.push(JSON.parse(l)));
    p.on('close', () => resolve(out));
    for (const r of requests) p.stdin.write(JSON.stringify(r) + '\n');
    p.stdin.end();
  });
}

test('serveur MCP : initialisation, liste des outils, recherche', async () => {
  await bridge([{ type: 'snapshot', items: [item(1, { title: 'Zettelkasten', tags: ['methode'] }), item(2)] }]);
  const out = await mcp([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_memories', arguments: { query: 'zettel' } } },
    { jsonrpc: '2.0', id: 4, method: 'nope' },
  ], { SECOND_CERVEAU_DIR: dir });
  assert.equal(out.length, 4, 'la notification n’a pas de réponse');
  assert.equal(out[0].result.protocolVersion, '2025-06-18');
  assert.deepEqual(out[1].result.tools.map(t => t.name), ['search_memories', 'get_memory', 'list_tags', 'related_memories']);
  assert.ok(out[1].result.tools.every(t => t.annotations.readOnlyHint));
  const found = JSON.parse(out[2].result.content[0].text);
  assert.deepEqual(found.results.map(r => r.id), ['i1']);
  assert.equal(out[3].error.code, -32601);
});

test('serveur MCP : message clair quand aucune copie n’existe', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'second-cerveau-empty-'));
  const [r] = await mcp([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_tags', arguments: {} } }], { SECOND_CERVEAU_DIR: empty });
  rmSync(empty, { recursive: true, force: true });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /install\.mjs/);
});

test('accès des agents désactivé : la copie est effacée et le serveur le dit', async () => {
  await bridge([{ type: 'snapshot', items: [item(1, { title: 'Secret' })] }]);
  const [off] = await bridge([{ type: 'disable-agent' }]);
  assert.equal(off.ok, true);
  const raw = readFileSync(join(dir, 'brain.json'), 'utf8');
  assert.ok(!raw.includes('Secret'), 'plus aucun souvenir dans la copie');
  for (const name of ['search_memories', 'list_tags', 'get_memory']) {
    const [r] = await mcp([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { id: 'i1' } } }], { SECOND_CERVEAU_DIR: dir });
    assert.equal(r.result.isError, true, name);
    assert.match(r.result.content[0].text, /désactivé/);
  }
  // réactivé : une nouvelle copie rend l'accès
  await bridge([{ type: 'snapshot', items: [item(1, { title: 'Secret' })] }]);
  const [r] = await mcp([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_memories', arguments: { query: 'secret' } } }], { SECOND_CERVEAU_DIR: dir });
  assert.equal(r.result.isError, undefined);
  assert.equal(JSON.parse(r.result.content[0].text).total, 1);
});

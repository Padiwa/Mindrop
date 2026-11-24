// Hôte « native messaging » : l'extension lui envoie une copie des souvenirs,
// il l'écrit dans brain.json (lu par le serveur MCP). Protocole Chrome :
// chaque message = longueur sur 4 octets (little-endian) + JSON UTF-8, sur stdin/stdout.
import { mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { snapshotPath } from './store.mjs';

function reply(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([head, body]));
}

function handle(msg) {
  if (msg?.type === 'ping') return { ok: true, path: snapshotPath() };
  if (msg?.type !== 'snapshot' || !Array.isArray(msg.items)) return { ok: false, error: 'message inconnu' };
  const file = snapshotPath();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify({ app: 'second-cerveau', version: 1, syncedAt: msg.syncedAt || new Date().toISOString(), items: msg.items }), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file); // écriture atomique : le serveur MCP ne lit jamais un fichier à moitié écrit
  return { ok: true, count: msg.items.length };
}

let buf = Buffer.alloc(0);
process.stdin.on('data', chunk => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= 4) {
    const len = buf.readUInt32LE(0);
    if (buf.length < 4 + len) break;
    const body = buf.subarray(4, 4 + len).toString('utf8');
    buf = buf.subarray(4 + len);
    let res;
    try { res = handle(JSON.parse(body)); } catch (e) { res = { ok: false, error: String(e.message || e) }; }
    reply(res);
  }
});
process.stdin.on('end', () => process.exit(0));

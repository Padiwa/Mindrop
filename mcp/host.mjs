// Hôte « native messaging » du pont local. L'extension lui parle de deux façons :
//  - chrome.runtime.sendNativeMessage : un message, une réponse (copie légère pour le serveur MCP) ;
//  - chrome.runtime.connectNative : une suite de messages (sauvegarde complète par morceaux, restauration).
// Protocole Chrome : chaque message = longueur sur 4 octets (little-endian) + JSON UTF-8, sur stdin/stdout.
// Une réponse avec « more: true » annonce d'autres réponses à la même demande.
import { mkdirSync, writeFileSync, renameSync, chmodSync, openSync, writeSync, fsyncSync, closeSync,
  readFileSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotPath, backupDir } from './store.mjs';

export const KEEP_BACKUPS = 30;
const MAX_REPLY = 900 * 1024;          // Chrome refuse les messages de plus de 1 Mo vers l'extension
// AAAA-MM-JJ.json, ou AAAA-MM-JJ-HHMMSS.json pour une version antérieure gardée dans la journée
const BACKUP_NAME = /^\d{4}-\d{2}-\d{2}(-\d{6})?\.json$/;

function frame(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

function writeAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.tmp';
  writeFileSync(tmp, data, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file); // le lecteur ne voit jamais un fichier à moitié écrit
}

// ---------- copie légère pour le serveur MCP ----------
function snapshot(msg) {
  if (!Array.isArray(msg.items)) throw new Error('items manquants');
  writeAtomic(snapshotPath(), JSON.stringify({ app: 'second-cerveau', version: 1, syncedAt: msg.syncedAt || new Date().toISOString(), items: msg.items }));
  return { ok: true, count: msg.items.length };
}

// Accès des agents désactivé dans l'extension : la copie est remplacée par un marqueur, sans aucun souvenir.
function disableAgent() {
  writeAtomic(snapshotPath(), JSON.stringify({ app: 'second-cerveau', version: 1, disabled: true, disabledAt: new Date().toISOString(), items: [] }));
  return { ok: true };
}

// ---------- sauvegardes complètes ----------
const today = () => new Date().toLocaleDateString('sv') + '.json'; // AAAA-MM-JJ, date locale
const indexPath = () => join(backupDir(), 'index.json');

function readIndex() {
  try { return JSON.parse(readFileSync(indexPath(), 'utf8')); } catch { return {}; }
}

function countItems(file) {
  try { const d = JSON.parse(readFileSync(file, 'utf8')); return (Array.isArray(d) ? d : d.items || []).length; } catch { return 0; }
}

function listBackups() {
  const dir = backupDir();
  if (!existsSync(dir)) return [];
  const index = readIndex();
  return readdirSync(dir).filter(n => BACKUP_NAME.test(n)).sort().reverse().map(name => {
    const st = statSync(join(dir, name));
    const time = name.match(/-(\d{2})(\d{2})(\d{2})\.json$/);
    return { name, date: name.slice(0, 10), time: time ? `${time[1]}:${time[2]}` : null, bytes: st.size, count: index[name]?.count ?? null, savedAt: index[name]?.savedAt || st.mtime.toISOString() };
  });
}

function rotate() {
  const dir = backupDir();
  const names = readdirSync(dir).filter(n => BACKUP_NAME.test(n)).sort().reverse();
  for (const old of names.slice(KEEP_BACKUPS)) unlinkSync(join(dir, old));
  // morceaux abandonnés (navigateur fermé en pleine sauvegarde) de plus d'un jour
  for (const n of readdirSync(dir).filter(n => n.startsWith('.partial-'))) {
    if (Date.now() - statSync(join(dir, n)).mtimeMs > 864e5) unlinkSync(join(dir, n));
  }
  const index = readIndex();
  for (const k of Object.keys(index)) if (!names.slice(0, KEEP_BACKUPS).includes(k)) delete index[k];
  return index;
}

export class BackupSession {
  constructor() { this.open = new Map(); }

  begin({ id, total, exportedAt }) {
    if (!/^[\w-]{1,40}$/.test(String(id))) throw new Error('identifiant de sauvegarde invalide');
    if (!Number.isInteger(total) || total < 0) throw new Error('total invalide');
    const dir = backupDir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = join(dir, `.partial-${id}.json`);
    const fd = openSync(tmp, 'w', 0o600);
    writeSync(fd, `{"app":"second-cerveau","version":1,"exportedAt":${JSON.stringify(exportedAt || new Date().toISOString())},"items":[`);
    this.open.set(id, { fd, tmp, total, written: 0 });
    return { ok: true };
  }

  chunk({ id, items }) {
    const b = this.open.get(id);
    if (!b) throw new Error('sauvegarde inconnue');
    if (!Array.isArray(items)) throw new Error('items manquants');
    for (const it of items) writeSync(b.fd, (b.written++ ? ',' : '') + JSON.stringify(it));
    return { ok: true, written: b.written };
  }

  end({ id }) {
    const b = this.open.get(id);
    if (!b) throw new Error('sauvegarde inconnue');
    this.open.delete(id);
    writeSync(b.fd, ']}\n');
    fsyncSync(b.fd);
    closeSync(b.fd);
    if (b.written !== b.total) {
      unlinkSync(b.tmp);
      throw new Error(`sauvegarde incomplète : ${b.written} souvenirs reçus sur ${b.total}`);
    }
    const name = today();
    const file = join(backupDir(), name);
    let index = readIndex();
    // Moins de souvenirs que la sauvegarde du jour (suppressions, extension réinstallée) :
    // l'ancienne version est gardée sous un nom horodaté au lieu d'être écrasée.
    if (existsSync(file)) {
      const prev = index[name]?.count ?? countItems(file);
      if (b.written < prev) {
        const t = statSync(file).mtime;
        const kept = name.replace('.json', '-' + [t.getHours(), t.getMinutes(), t.getSeconds()].map(x => String(x).padStart(2, '0')).join('') + '.json');
        renameSync(file, join(backupDir(), kept));
        index[kept] = { count: prev, savedAt: index[name]?.savedAt || t.toISOString() };
        writeAtomic(indexPath(), JSON.stringify(index, null, 1));
      }
    }
    renameSync(b.tmp, file);
    index = rotate();
    index[name] = { count: b.written, savedAt: new Date().toISOString() };
    writeAtomic(indexPath(), JSON.stringify(index, null, 1));
    return { ok: true, name, file, count: b.written, bytes: statSync(file).size };
  }

  abort() {
    for (const b of this.open.values()) { try { closeSync(b.fd); unlinkSync(b.tmp); } catch {} }
    this.open.clear();
  }
}

// Relit une sauvegarde et la renvoie en morceaux de moins de 1 Mo.
function* readBackup({ name }) {
  if (!BACKUP_NAME.test(String(name))) throw new Error('nom de sauvegarde invalide');
  const data = JSON.parse(readFileSync(join(backupDir(), name), 'utf8'));
  const items = Array.isArray(data) ? data : data.items;
  if (!Array.isArray(items)) throw new Error('sauvegarde illisible');
  let batch = [], size = 0, skippedImages = 0;
  for (let it of items) {
    let n = JSON.stringify(it).length;
    if (n > MAX_REPLY) { // un souvenir trop lourd pour un message : on le garde sans ses images
      it = { ...it, image: /^https?:/.test(it.image || '') ? it.image : '', thumb: '' };
      n = JSON.stringify(it).length;
      skippedImages++;
    }
    if (batch.length && size + n > MAX_REPLY) { yield { ok: true, more: true, items: batch }; batch = []; size = 0; }
    batch.push(it); size += n;
  }
  yield { ok: true, items: batch, total: items.length, skippedImages };
}

// ---------- boucle de messages ----------
export function handle(msg, session) {
  switch (msg?.type) {
    case 'ping': return [{ ok: true, path: snapshotPath(), backups: backupDir() }];
    case 'snapshot': return [snapshot(msg)];
    case 'disable-agent': return [disableAgent()];
    case 'backup-begin': return [session.begin(msg)];
    case 'backup-chunk': return [session.chunk(msg)];
    case 'backup-end': return [session.end(msg)];
    case 'list-backups': return [{ ok: true, backups: listBackups() }];
    case 'read-backup': return readBackup(msg);
    default: throw new Error('message inconnu : ' + msg?.type);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const session = new BackupSession();
  let buf = Buffer.alloc(0);
  process.stdin.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (buf.length < 4 + len) break;
      const body = buf.subarray(4, 4 + len).toString('utf8');
      buf = buf.subarray(4 + len);
      try {
        for (const reply of handle(JSON.parse(body), session)) process.stdout.write(frame(reply));
      } catch (e) {
        process.stdout.write(frame({ ok: false, error: String(e.message || e) }));
      }
    }
  });
  // pas de process.exit : le processus se termine seul une fois toutes les réponses envoyées
  process.stdin.on('end', () => session.abort());
}

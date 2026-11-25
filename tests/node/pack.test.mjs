// Le zip distribué (scripts/pack.mjs) : il contient tout ce que l'extension charge, et rien d'autre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync, crc32 } from 'node:zlib';
import { packFiles, zip, pack } from '../../scripts/pack.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Lecture d'un zip par son répertoire central : [{ name, data }].
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const crc = buf.readUInt32LE(p + 16), local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = inflateRawSync(buf.subarray(start, start + size));
    assert.equal(crc32(data), crc, name);
    out.push({ name, data });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

test('zip : ce qui est écrit se relit à l’identique', () => {
  const entries = [{ name: 'a/é.txt', data: Buffer.from('bonjour '.repeat(50)) }, { name: 'a/vide', data: Buffer.alloc(0) }];
  assert.deepEqual(unzip(zip(entries)).map(e => [e.name, e.data.toString()]), entries.map(e => [e.name, e.data.toString()]));
});

test('le zip contient tout ce que le manifeste, les pages et les modules chargent', () => {
  const files = new Set(packFiles());
  const missing = [];
  const need = (from, ref) => {
    if (/^(https?:|data:|chrome:|#)/.test(ref)) return;
    const path = posix.normalize(posix.join(posix.dirname(from), ref.split(/[?#]/)[0])).replace(/^\//, '');
    if (!files.has(path)) missing.push(`${from} → ${ref}`);
  };
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  need('manifest.json', manifest.background.service_worker);
  need('manifest.json', manifest.action.default_popup);
  for (const f of Object.values(manifest.icons)) need('manifest.json', f);
  for (const l of ['en', 'fr']) need('manifest.json', `_locales/${l}/messages.json`);
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8');
    if (f.endsWith('.html')) for (const [, ref] of src.matchAll(/\s(?:src|href)="([^"]+)"/g)) need(f, ref);
    if (/\.m?js$/.test(f)) for (const [, ref] of src.matchAll(/(?:^|\n)\s*import\s[^'"]*?from\s+'(\.[^']+)'/g)) need(f, ref);
    if (f.endsWith('.js') && !f.startsWith('mcp/')) for (const [, ref] of src.matchAll(/getURL\('\/?([^']+\.\w+)'\)/g)) need(f, ref);
    if (f.endsWith('.css')) for (const [, ref] of src.matchAll(/url\(["']?([^"')]+)["']?\)/g)) need(f, ref);
  }
  assert.deepEqual(missing, []);
});

test('ni documentation, ni tests, ni outils de développement', () => {
  const files = packFiles();
  assert.deepEqual(files.filter(f => /^(docs|tests|scripts|node_modules|dist|\.)|types\.d\.ts|tsconfig|package/.test(f)), []);
  assert.ok(files.includes('mcp/server.mjs') && files.includes('mcp/install.mjs'));
});

test('pack : un dossier mindrop/ avec un package.json réduit, en deux noms de fichier', () => {
  const out = mkdtempSync(join(tmpdir(), 'mindrop-pack-'));
  try {
    const res = pack(out);
    assert.deepEqual(res.files.map(f => f.slice(out.length + 1)), ['mindrop.zip', `mindrop-${res.version}.zip`]);
    const entries = unzip(readFileSync(res.files[0]));
    assert.ok(entries.every(e => e.name.startsWith('mindrop/')));
    const pkg = JSON.parse(entries.find(e => e.name === 'mindrop/package.json').data);
    assert.equal(pkg.type, 'module');
    assert.equal(pkg.devDependencies, undefined);
    assert.equal(pkg.scripts, undefined);
    assert.equal(JSON.parse(entries.find(e => e.name === 'mindrop/manifest.json').data).version, res.version);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

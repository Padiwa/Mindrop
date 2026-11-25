#!/usr/bin/env node
// Fabrique le zip de l'extension à distribuer (releases GitHub, testeurs), sans dépendance.
//   node scripts/pack.mjs [--out <dossier>]   → <dossier>/mindrop.zip et mindrop-<version>.zip (par défaut dist/)
// Le zip contient un dossier mindrop/ : l'extension, prête pour « Charger l'extension non empaquetée »,
// et le pont local (mcp/). Ni la documentation, ni les tests, ni les outils de développement.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER = 'mindrop';

// Ce qui part dans le zip : les fichiers de l'extension à la racine, et ces dossiers en entier.
const ROOT_FILE = /\.(js|html|css)$|^(manifest\.json|LICENSE)$/;
const DIRS = ['_locales', 'icons', 'fonts', 'mcp'];

const walk = d => readdirSync(d).sort().flatMap(f => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

/** @returns {string[]} chemins relatifs à la racine du projet, avec des / */
export function packFiles(dir = root) {
  const top = readdirSync(dir).filter(f => statSync(join(dir, f)).isFile() && ROOT_FILE.test(f)).sort();
  const nested = DIRS.flatMap(d => walk(join(dir, d)).map(p => relative(dir, p)));
  return [...top, ...nested].map(p => p.split(sep).join('/'));
}

// package.json réduit : le pont local (mcp/*.mjs) importe ../search.js et ../links.js en modules ES.
function packageJson(pkg) {
  const { name, version, license, description, type, engines } = pkg;
  return JSON.stringify({ name, version, private: true, license, description, type, engines }, null, 2) + '\n';
}

/**
 * Archive zip (méthode deflate), entrées dans l'ordre donné.
 * @param {Array<{ name: string, data: Buffer }>} entries
 * @param {Date} [date]
 */
export function zip(entries, date = new Date()) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const fname = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version nécessaire
    local.writeUInt16LE(0x0800, 6);       // noms en UTF-8
    local.writeUInt16LE(8, 8);            // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fname.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);     // créé sous Unix, version 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fname.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // rw-r--r--
    central.writeUInt32LE(offset, 42);
    locals.push(local, fname, packed);
    centrals.push(central, fname);
    offset += local.length + fname.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

export function pack(out = join(root, 'dist')) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  if (manifest.version !== pkg.version) throw new Error(`versions différentes : manifest.json ${manifest.version}, package.json ${pkg.version}`);
  const entries = packFiles().map(name => ({ name: `${FOLDER}/${name}`, data: readFileSync(join(root, name)) }));
  entries.push({ name: `${FOLDER}/package.json`, data: Buffer.from(packageJson(pkg)) });
  const archive = zip(entries);
  mkdirSync(out, { recursive: true });
  const files = [join(out, 'mindrop.zip'), join(out, `mindrop-${pkg.version}.zip`)];
  for (const f of files) writeFileSync(f, archive);
  return { files, count: entries.length, bytes: archive.length, version: pkg.version };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--out');
  const res = pack(i > 0 ? process.argv[i + 1] : undefined);
  console.log(`Mindrop ${res.version} : ${res.count} fichiers, ${(res.bytes / 1024).toFixed(0)} Ko`);
  for (const f of res.files) console.log('  ' + relative(process.cwd(), f));
}

#!/usr/bin/env node
// Installe le pont entre l'extension et le serveur MCP.
//   node mcp/install.mjs <id-de-l-extension>   enregistre l'hôte natif pour les navigateurs trouvés
//   node mcp/install.mjs --uninstall           le retire
// L'id de l'extension se lit dans chrome://extensions (ou brave://extensions), mode développeur activé.
import { existsSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST_NAME, dataDir, snapshotPath } from './store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const home = homedir();
const mac = platform() === 'darwin';
const base = mac ? join(home, 'Library', 'Application Support') : join(home, '.config');

const BROWSERS = mac
  ? [['Chrome', 'Google/Chrome'], ['Chromium', 'Chromium'], ['Brave', 'BraveSoftware/Brave-Browser'], ['Edge', 'Microsoft Edge']]
  : [['Chrome', 'google-chrome'], ['Chromium', 'chromium'], ['Brave', 'BraveSoftware/Brave-Browser'], ['Edge', 'microsoft-edge'], ['Vivaldi', 'vivaldi']];

if (platform() === 'win32') {
  console.error('Windows demande une clé de registre pour l\'hôte natif : non géré par ce script.');
  process.exit(1);
}

const found = BROWSERS.map(([name, dir]) => ({ name, dir: join(base, dir) })).filter(b => existsSync(b.dir));
const arg = process.argv[2];

if (arg === '--uninstall') {
  for (const b of found) rmSync(join(b.dir, 'NativeMessagingHosts', HOST_NAME + '.json'), { force: true });
  rmSync(join(dataDir(), 'host.sh'), { force: true });
  console.log(`Hôte retiré. La copie des données reste dans ${snapshotPath()} (supprime-la à la main si tu veux).`);
  process.exit(0);
}

if (!/^[a-p]{32}$/.test(arg || '')) {
  console.error('Usage : node mcp/install.mjs <id-de-l-extension>\nL\'id (32 lettres de a à p) est affiché sous l\'extension dans chrome://extensions.');
  process.exit(1);
}
if (!found.length) {
  console.error('Aucun navigateur Chromium trouvé dans ' + base);
  process.exit(1);
}

// Le navigateur lance l'hôte avec un PATH minimal : on fige le chemin de node dans un petit lanceur.
mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
const launcher = join(dataDir(), 'host.sh');
writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${resolve(here, 'host.mjs')}" "$@"\n`);
chmodSync(launcher, 0o755);

const manifest = {
  name: HOST_NAME,
  description: 'Mindrop : pont local (serveur MCP et sauvegardes)',
  path: launcher,
  type: 'stdio',
  allowed_origins: [`chrome-extension://${arg}/`],
};
for (const b of found) {
  const dir = join(b.dir, 'NativeMessagingHosts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, HOST_NAME + '.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ ${b.name} : ${join(dir, HOST_NAME + '.json')}`);
}

const server = resolve(here, 'server.mjs');
console.log(`
Ensuite :
  1. Recharge l'extension (bouton ↻ dans la page des extensions) : elle envoie sa première copie.
     Vérifie que ce fichier existe : ${snapshotPath()}
     La sauvegarde automatique complète arrive une minute plus tard dans ${join(dataDir(), 'backups')}
  2. Branche le serveur MCP sur ton agent. Pour Claude Code :
       claude mcp add mindrop -- "${process.execPath}" "${server}"
     Pour un autre client MCP (stdio) :
       { "command": "${process.execPath}", "args": ["${server}"] }`);

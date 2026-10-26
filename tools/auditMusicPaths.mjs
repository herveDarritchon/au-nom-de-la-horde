#!/usr/bin/env node
/**
 * Scanner / convertir les références Foundry aux musiques, sans toucher aux OGG.
 * Copier dans tools/auditMusicPaths.mjs du dépôt principal.
 * Usage :
 *   node tools/auditMusicPaths.mjs --from IDENTIFIANT_MODULE
 *   node tools/auditMusicPaths.mjs --from IDENTIFIANT_MODULE --write
 * --from est facultatif si module.json à la racine possède un champ id.
 * Par sécurité, ne modifie pas les compendiums packés, les .db ou les données des mondes.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TO = 'au-nom-de-la-horde-audio';
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.pnpm', 'coverage', '.next', '.turbo', 'build', '.cache']);
const EXT = new Set(['.js','.mjs','.cjs','.ts','.tsx','.json','.jsonl','.html','.hbs','.css','.md','.yml','.yaml','.txt']);
function die(s) { console.error(`ERREUR : ${s}`); process.exit(1); }
const args = process.argv.slice(2);
const write = args.includes('--write');
const check = args.includes('--check');
if (write && check) die('--write et --check sont incompatibles.');
let from = null;
for (let i=0; i<args.length; i++) {
  if (args[i] === '--from') { from = args[++i]; if (!from) die('--from nécessite un identifiant.'); }
  else if (args[i] !== '--write' && args[i] !== '--check') die(`Argument inconnu : ${args[i]}`);
}
if (!from && existsSync(join(ROOT, 'module.json'))) {
  try { from = JSON.parse(await readFile(join(ROOT, 'module.json'), 'utf8')).id; }
  catch { /* afficher la marche à suivre */ }
}
if (!from) die('Identifiant inconnu. Utiliser --from IDENTIFIANT_DU_MODULE_PRINCIPAL.');
if (from === TO) die('Le module source et le module cible ont le même identifiant.');
const oldPath = `modules/${from}/assets/musics/ambient/`;
const newPath = `modules/${TO}/assets/musics/ambient/`;
let filesScanned = 0, matchedFiles = 0, occurrences = 0;
async function walk(dir) {
  for (const item of await readdir(dir, {withFileTypes:true})) {
    const full = join(dir, item.name);
    const rel = relative(ROOT, full).replaceAll('\\', '/');
    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name) || rel === 'assets/musics/ambient') continue;
      await walk(full);
    } else if (item.isFile()) {
      if (![...EXT].some(ext => item.name.endsWith(ext))) continue;
      if ((await stat(full)).size > 8 * 1024 * 1024) continue;
      filesScanned++;
      const content = await readFile(full, 'utf8');
      const count = content.split(oldPath).length - 1;
      if (count > 0) {
        matchedFiles++; occurrences += count;
        console.log(`${write ? 'MODIFIÉ' : 'À MODIFIER'} : ${rel} (${count})`);
        if (write) await writeFile(full, content.replaceAll(oldPath, newPath));
      }
    }
  }
}
console.log(`Ancienne référence : ${oldPath}\nNouvelle référence : ${newPath}`);
await walk(ROOT);
console.log(`Fichiers examinés : ${filesScanned} ; fichiers concernés : ${matchedFiles} ; occurrences : ${occurrences}.`);
console.log(write ? 'Vérifier git diff avant de valider.' : 'Aucun fichier modifié. Relancer avec --write pour appliquer.');
if (check && occurrences > 0) {
  console.error(`ERREUR : ${occurrences} ancienne(s) référence(s) musicale(s) subsistent.`);
  process.exitCode = 1;
} else if (check) {
  console.log('Contrôle OK : aucune ancienne référence musicale.');
}
console.log('IMPORTANT : playlists et compendiums Foundry déjà importés sont à migrer séparément.');

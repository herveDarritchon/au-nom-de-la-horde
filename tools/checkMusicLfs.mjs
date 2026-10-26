#!/usr/bin/env node
/**
 * Rapport en lecture seule sur les fichiers musicaux encore suivis par Git / LFS.
 * Ne supprime aucun fichier, ne réécrit pas l'historique et ne contacte pas GitHub.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const musicDir = 'assets/musics/ambient/';
function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.error(`ERREUR git ${args.join(' ')} : ${(r.stderr || r.error?.message || '').trim()}`);
    process.exit(1);
  }
  return r.stdout;
}
const tracked = git(['ls-files', '-z', '--', musicDir]).split('\0').filter(Boolean);
const lfsResult = spawnSync('git', ['lfs', 'ls-files', '-n'], { cwd: ROOT, encoding: 'utf8' });
const lfsAvailable = lfsResult.status === 0;
const lfs = lfsAvailable ? lfsResult.stdout.split(/\r?\n/).filter(Boolean).filter(s => s.startsWith(musicDir)) : [];
const ignore = existsSync(join(ROOT, '.gitignore')) ? readFileSync(join(ROOT, '.gitignore'), 'utf8') : '';
const ignoredLine = ignore.split(/\r?\n/).some(s => s.trim() === '/assets/musics/ambient/');
console.log('Au Nom de la Horde — état de migration Git LFS (lecture seule)');
console.log(`Fichiers musicaux suivis par Git : ${tracked.length}`);
console.log(`Fichiers musicaux présents dans git lfs ls-files : ${lfsAvailable ? lfs.length : 'indéterminé (git-lfs absent ou erreur)'}`);
console.log(`Exclusion .gitignore explicite : ${ignoredLine ? 'oui' : 'non'}`);
if (lfs.length) console.log('Exemples LFS :\n  ' + lfs.slice(0, 3).join('\n  '));
console.log('\nCe script ne retire aucun fichier de Git LFS.');
console.log('Quand la migration Foundry est testée, adapter .gitattributes, ajouter /assets/musics/ambient/ à .gitignore, puis exécuter :');
console.log('  git rm -r --cached -- assets/musics/ambient/');
console.log('  git status --short');
console.log('  git diff --cached --stat');
console.log('Les anciens objets déjà stockés dans GitHub LFS ne sont pas effacés par ce retrait.');

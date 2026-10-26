#!/usr/bin/env node
/**
 * Vérifie (ou corrige explicitement) la dépendance du module musical.
 * Vérifie aussi les références musicales des compendiums YAML, si un clone audio
 * local est disponible. Aucun accès réseau, aucune dépendance npm.
 *
 *   node tools/checkMusicIntegration.mjs
 *   node tools/checkMusicIntegration.mjs --fix
 *   node tools/checkMusicIntegration.mjs --require-audio-root
 *   node tools/checkMusicIntegration.mjs --audio-root /chemin/vers/au-nom-de-la-horde-audio
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_ID = 'warbound-campaign-content';
const AUDIO_ID = 'au-nom-de-la-horde-audio';
const AUDIO_MANIFEST = 'https://github.com/herveDarritchon/au-nom-de-la-horde-audio/releases/latest/download/module.json';
const AUDIO_PREFIX = `modules/${AUDIO_ID}/assets/musics/ambient/`;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const extensions = new Set(['.yaml', '.yml', '.json', '.md', '.html', '.js', '.mjs', '.ts', '.txt']);
let doFix = false;
let requireAudioRoot = false;
let audioRoot = resolve(ROOT, '..', AUDIO_ID);

function fail(message) { console.error(`ERREUR : ${message}`); process.exit(1); }
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--fix') doFix = true;
  else if (arg === '--require-audio-root') requireAudioRoot = true;
  else if (arg === '--audio-root') {
    if (!process.argv[i + 1]) fail('--audio-root attend un chemin.');
    audioRoot = resolve(process.argv[++i]);
  } else if (arg === '--help') {
    console.log('Usage : node tools/checkMusicIntegration.mjs [--fix] [--require-audio-root] [--audio-root CHEMIN]');
    process.exit(0);
  } else fail(`Argument inconnu : ${arg}`);
}

const manifestFile = join(ROOT, 'module.json');
if (!existsSync(manifestFile)) fail(`Manifeste principal introuvable : ${manifestFile}`);
let manifest;
try { manifest = JSON.parse(readFileSync(manifestFile, 'utf8')); }
catch (err) { fail(`JSON invalide dans module.json : ${err.message}`); }
if (manifest.id !== MODULE_ID) fail(`L'id trouvé est « ${manifest.id} », attendu « ${MODULE_ID} ». Vérifier le dépôt.`);

function listOf(rel, key) {
  const value = rel[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`relationships.${key} doit être un tableau.`);
  return value;
}
function save(manifest) { writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n'); }

if (!manifest.relationships || typeof manifest.relationships !== 'object') manifest.relationships = {};
const rel = manifest.relationships;
const recommends = listOf(rel, 'recommends');
const requires = listOf(rel, 'requires');
const requiredAudio = requires.filter(r => r && r.id === AUDIO_ID);
const recommendedAudio = recommends.filter(r => r && r.id === AUDIO_ID);

if (doFix) {
  // Ne modifie aucune autre dépendance ou configuration Foundry.
  rel.recommends = recommends.filter(r => r?.id !== AUDIO_ID);
  rel.requires = [...requires.filter(r => r?.id !== AUDIO_ID), {
    id: AUDIO_ID, type: 'module', manifest: AUDIO_MANIFEST,
  }];
  save(manifest);
  console.log(`Manifeste corrigé : ${relative(ROOT, manifestFile)} (audio déplacé/maintenu dans relationships.requires).`);
} else if (requiredAudio.length !== 1 || recommendedAudio.length !== 0 ||
           requiredAudio[0]?.type !== 'module' || requiredAudio[0]?.manifest !== AUDIO_MANIFEST) {
  console.error('La dépendance audio doit apparaître une fois dans relationships.requires, et jamais dans recommends.');
  console.error('Correction proposée : pnpm media:music:module:fix');
  process.exitCode = 1;
} else {
  console.log(`Manifeste OK : ${MODULE_ID} requiert ${AUDIO_ID}.`);
}

const compendiums = join(ROOT, 'compendiums');
let scanned = 0;
const refs = new Map();
if (existsSync(compendiums)) {
  const stack = [compendiums];
  const regex = /modules\/au-nom-de-la-horde-audio\/assets\/musics\/ambient\/[^\s"'<>\\]+?\.ogg/gi;
  while (stack.length) {
    const dir = stack.pop();
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, e.name);
      if (e.isDirectory()) { stack.push(file); continue; }
      if (!e.isFile() || ![...extensions].some(x => e.name.endsWith(x)) || statSync(file).size > MAX_FILE_SIZE) continue;
      scanned++;
      const value = readFileSync(file, 'utf8');
      for (const match of value.matchAll(regex)) {
        const url = match[0];
        if (!refs.has(url)) refs.set(url, []);
        refs.get(url).push(relative(ROOT, file));
      }
    }
  }
} else console.warn('AVERTISSEMENT : compendiums/ absent ; impossible de vérifier les chemins sources.');
console.log(`Compendiums : ${scanned} fichier(s) texte examinés, ${refs.size} chemin(s) musical(aux) distinct(s).`);

if (existsSync(join(audioRoot, 'assets', 'musics', 'ambient'))) {
  let missing = 0;
  for (const [url, sources] of refs) {
    const subpath = url.slice(`modules/${AUDIO_ID}/`.length);
    // Aucune résolution hors du dépôt audio, même si le fichier source contenait un chemin malicieux.
    const path = resolve(audioRoot, subpath);
    if (!path.startsWith(resolve(audioRoot) + sep)) {
      console.error(`ERREUR : chemin dangereux : ${url}`);
      missing++;
      continue;
    }
    if (!existsSync(path) || !statSync(path).isFile()) {
      console.error(`INTROUVABLE : ${url} (dans ${sources.join(', ')})`);
      missing++;
    }
  }
  if (missing) {
    console.error(`ERREUR : ${missing} référence(s) musicales introuvables dans ${audioRoot}.`);
    process.exitCode = 1;
  } else console.log(`Bibliothèque locale OK : ${refs.size} référence(s) vérifiées dans ${audioRoot}.`);
} else if (requireAudioRoot) {
  console.error(`ERREUR : bibliothèque audio locale introuvable dans ${audioRoot}. Utiliser --audio-root.`);
  process.exitCode = 1;
} else {
  console.warn(`AVERTISSEMENT : bibliothèque audio locale absente (${audioRoot}).`);
  console.warn('Les noms de fichiers distants ne peuvent pas être contrôlés ici. Utiliser --require-audio-root pour rendre ce contrôle obligatoire.');
}

if (!process.exitCode) console.log('Contrôle d’intégration audio OK.');

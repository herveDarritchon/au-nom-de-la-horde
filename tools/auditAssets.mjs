/**
             * Warbound — Asset Audit
                                *
                                * Vérifie que tous les médias référencés par les YAML des compendiums :
  *   1. appartiennent au module Warbound ;
*   2. existent réellement dans la codebase.
                                   *
                                   * Le script est volontairement générique :
  * - il parcourt récursivement ./compendiums ;
* - il ne dépend pas de la liste des packs ;
* - il fonctionne donc aussi avec de futurs packs Actor, RollTable,
*   Playlist, Scene, Adventure, etc.
                                *
                                * Usage :
*   node ./tools/auditAssets.mjs
                 *
                 * Code retour :
  *   0 = audit OK
                *   1 = une ou plusieurs références invalides
                                                    *   2 = erreur de configuration / lecture
                                                                      */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const CONFIG = {
  moduleId: "warbound-campaign-content",

  // Répertoire contenant les YAML produits par pushLDBtoYAML.
  compendiumsRoot: path.join(ROOT, ".", "compendiums"),

  // Politique stricte : un média Warbound doit être référencé depuis le module.
  modulePrefix: "modules/warbound-campaign-content/",

  // Exceptions éventuelles à ajouter plus tard si elles sont VOLONTAIRES.
  // Exemple :
  // allowedExternalPrefixes: ["systems/co2/"],
  allowedExternalPrefixes: [],

  // Médias pris en charge.
  extensions: {
    image: [
      "webp",
      "png",
      "jpg",
      "jpeg",
      "gif",
      "svg",
      "avif",
      "bmp",
    ],
    audio: [
      "ogg",
      "oga",
      "mp3",
      "wav",
      "flac",
      "m4a",
      "aac",
      "opus",
    ],
    video: [
      "webm",
      "mp4",
      "m4v",
      "mov",
    ],
  },
};

const allExtensions = Object.values(CONFIG.extensions).flat();
const escapedExtensions = allExtensions
  .map((extension) => extension.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

/**
 * Recherche les chemins de médias les plus courants dans des YAML Foundry.
 *
 * On analyse volontairement le texte brut au lieu de dépendre du schéma de
 * chaque Document. Cela couvre automatiquement :
 * - Item.img
 * - Actor.img
 * - prototypeToken.texture.src
 * - Scene.background.src
 * - Token.texture.src
 * - Tile.texture.src
 * - images incluses dans le HTML d'un Journal
 * - sons de Playlist / AmbientSound
 * - médias embarqués dans des Adventure documents
 *
 * Le chemin doit contenir au moins un "/" afin d'éviter de traiter comme
 * asset des mots ordinaires terminant accidentellement par ".png", etc.
 */
const MEDIA_REGEX = new RegExp(
  String.raw`(?:https?:\/\/|data:|worlds\/|modules\/|systems\/|icons\/|assets\/|[A-Za-z0-9_.@%+~:-]+\/)[^"'` +
  "`" +
  String.raw`\s<>{}\[\],]*?\.(?:${escapedExtensions})(?:\?[^"'` +
  "`" +
  String.raw`\s<>]*)?(?:#[^"'` +
  "`" +
  String.raw`\s<>]*)?`,
  "gi",
);

const stats = {
  yamlFiles: 0,
  references: 0,
  validModuleReferences: 0,
  allowedExternalReferences: 0,
  byKind: {
    image: 0,
    audio: 0,
    video: 0,
  },
};

const errors = [];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function relativeToRoot(filePath) {
  return toPosix(path.relative(ROOT, filePath));
}

function getMediaKind(mediaPath) {
  const clean = stripQueryAndHash(mediaPath).toLowerCase();

  for (const [kind, extensions] of Object.entries(CONFIG.extensions)) {
    if (extensions.some((extension) => clean.endsWith(`.${extension}`))) {
      return kind;
    }
  }

  return "unknown";
}

function stripQueryAndHash(mediaPath) {
  const queryIndex = mediaPath.indexOf("?");
  const hashIndex = mediaPath.indexOf("#");

  let end = mediaPath.length;

  if (queryIndex >= 0) end = Math.min(end, queryIndex);
  if (hashIndex >= 0) end = Math.min(end, hashIndex);

  return mediaPath.slice(0, end);
}

function normalizeReference(mediaPath) {
  // Retire ponctuation terminale susceptible d'être capturée depuis du HTML.
  return mediaPath.replace(/[).;:]+$/g, "");
}

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

function classifyExternalReference(mediaPath) {
  if (mediaPath.startsWith("worlds/")) return "WORLD_REFERENCE";

  if (mediaPath.startsWith("modules/")) return "OTHER_MODULE_REFERENCE";

  if (mediaPath.startsWith("systems/")) return "SYSTEM_REFERENCE";

  if (mediaPath.startsWith("icons/")) return "FOUNDRY_CORE_REFERENCE";

  if (/^https?:\/\//i.test(mediaPath)) return "REMOTE_REFERENCE";

  if (/^data:/i.test(mediaPath)) return "DATA_URI_REFERENCE";

  return "OUTSIDE_WARBOUND_REFERENCE";
}

function isAllowedExternalReference(mediaPath) {
  return CONFIG.allowedExternalPrefixes.some((prefix) =>
    mediaPath.startsWith(prefix),
  );
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkYamlFiles(directory) {
  const result = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...await walkYamlFiles(fullPath));
      continue;
    }

    if (entry.isFile() && /\.(?:ya?ml)$/i.test(entry.name)) {
      result.push(fullPath);
    }
  }

  return result;
}

async function auditReference({
                                sourceFile,
                                content,
                                rawReference,
                                index,
                              }) {
  const mediaPath = normalizeReference(rawReference);
  const kind = getMediaKind(mediaPath);
  const line = getLineNumber(content, index);

  stats.references += 1;

  if (Object.hasOwn(stats.byKind, kind)) {
    stats.byKind[kind] += 1;
  }

  if (mediaPath.startsWith(CONFIG.modulePrefix)) {
    const cleanPath = stripQueryAndHash(mediaPath);
    const relativeAssetPath = cleanPath.slice(CONFIG.modulePrefix.length);

    let decodedRelativeAssetPath = relativeAssetPath;

    try {
      decodedRelativeAssetPath = decodeURIComponent(relativeAssetPath);
    } catch {
      // Un chemin mal encodé sera testé tel quel et ressortira comme absent.
    }

    const localPath = path.join(ROOT, decodedRelativeAssetPath);

    if (!await fileExists(localPath)) {
      errors.push({
        type: "MISSING_FILE",
        kind,
        sourceFile,
        line,
        mediaPath,
        details: `Fichier attendu : ${relativeToRoot(localPath)}`,
      });

      return;
    }

    stats.validModuleReferences += 1;
    return;
  }

  if (isAllowedExternalReference(mediaPath)) {
    stats.allowedExternalReferences += 1;
    return;
  }

  errors.push({
    type: classifyExternalReference(mediaPath),
    kind,
    sourceFile,
    line,
    mediaPath,
    details: null,
  });
}

async function auditYamlFile(sourceFile) {
  const content = await fs.readFile(sourceFile, "utf8");
  stats.yamlFiles += 1;

  MEDIA_REGEX.lastIndex = 0;

  let match;

  while ((match = MEDIA_REGEX.exec(content)) !== null) {
    await auditReference({
      sourceFile,
      content,
      rawReference: match[0],
      index: match.index,
    });
  }
}

function countErrorsByType() {
  const counts = new Map();

  for (const error of errors) {
    counts.set(error.type, (counts.get(error.type) ?? 0) + 1);
  }

  return counts;
}

function printHeader() {
  console.log("");
  console.log("WARBOUND — Assets Audit");
  console.log("========================");
  console.log("");
  console.log(`Module.................... ${CONFIG.moduleId}`);
  console.log(`Source YAML............... ${relativeToRoot(CONFIG.compendiumsRoot)}`);
  console.log("");
}

function printStats() {
  console.log(`YAML analysés............. ${stats.yamlFiles}`);
  console.log(`Références média.......... ${stats.references}`);
  console.log(`  Images.................. ${stats.byKind.image}`);
  console.log(`  Audio................... ${stats.byKind.audio}`);
  console.log(`  Vidéo................... ${stats.byKind.video}`);
  console.log("");
  console.log(`Médias Warbound valides... ${stats.validModuleReferences}`);

  if (stats.allowedExternalReferences > 0) {
    console.log(
      `Références externes autorisées ${stats.allowedExternalReferences}`,
    );
  }
}

function printErrors() {
  if (errors.length === 0) return;

  const errorCounts = countErrorsByType();

  console.log("");
  console.log(`ERREURS................... ${errors.length}`);

  for (const [type, count] of [...errorCounts.entries()].sort()) {
    console.log(`  ${type.padEnd(26, ".")} ${count}`);
  }

  console.log("");

  for (const error of errors) {
    console.error(`[${error.type}] ${error.kind.toUpperCase()}`);
    console.error(
      `${relativeToRoot(error.sourceFile)}:${error.line}`,
    );
    console.error(`  ${error.mediaPath}`);

    if (error.details) {
      console.error(`  ${error.details}`);
    }

    console.error("");
  }
}

async function main() {
  printHeader();

  if (!await fileExists(CONFIG.compendiumsRoot)) {
    console.error(
      `❌ Répertoire YAML introuvable : ${relativeToRoot(CONFIG.compendiumsRoot)}`,
    );
    console.error(
      "Exécute d'abord pushLDBtoYAML ou vérifie CONFIG.compendiumsRoot.",
    );
    process.exitCode = 2;
    return;
  }

  const yamlFiles = await walkYamlFiles(CONFIG.compendiumsRoot);

  for (const yamlFile of yamlFiles) {
    await auditYamlFile(yamlFile);
  }

  printStats();
  printErrors();

  console.log("");

  if (errors.length > 0) {
    console.error(
      `❌ AUDIT FAILED — ${errors.length} référence(s) média à corriger.`,
    );
    console.error(
      "Le module Warbound n'est pas autonome pour ses médias.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    "✅ AUDIT OK — tous les médias référencés sont présents dans Warbound.",
  );
}

try {
  await main();
} catch (error) {
  console.error("");
  console.error("❌ AUDIT ERROR");
  console.error(error);
  process.exitCode = 2;
}
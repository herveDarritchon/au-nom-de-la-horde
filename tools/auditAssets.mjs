/**
 * Warbound — Asset Audit
 *
 * Politique :
 * - worlds/...                         => ERREUR BLOQUANTE
 * - icons/... / ui/...                 => OK (Foundry Core)
 * - systems/co2/...                    => OK
 * - systems/<autre>/...                => WARNING
 * - modules/warbound-campaign-content/ => OK si présent, WARNING si absent
 * - modules/<autre>/...                => WARNING
 * - http:// / https://                 => OK
 * - data:                              => OK
 * - autres références                  => WARNING
 *
 * Seules les références vers un world font échouer l'audit.
 *
 * Usage :
 *   node ./tools/auditAssets.mjs
 *
 * Code retour :
 *   0 = audit OK ou OK avec warnings
 *   1 = une ou plusieurs références worlds/... ont été trouvées
 *   2 = erreur de configuration / lecture
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const CONFIG = {
  moduleId: "warbound-campaign-content",
  systemId: "co2",

  // Répertoire contenant les YAML produits par pushLDBtoYAML.
  compendiumsRoot: path.join(ROOT, "compendiums"),

  // Préfixes attendus dans Foundry.
  modulePrefix: "modules/warbound-campaign-content/",
  systemPrefix: "systems/co2/",

  excludedPatterns: [
    /^worlds\/[^/]+\/vaults-cache\//
  ],

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
      "bmp"
    ],
    audio: [
      "ogg",
      "oga",
      "mp3",
      "wav",
      "flac",
      "m4a",
      "aac",
      "opus"
    ],
    video: [
      "webm",
      "mp4",
      "m4v",
      "mov"
    ]
  }
};

const allExtensions = Object.values(CONFIG.extensions).flat();

const escapedExtensions = allExtensions
  .map((extension) =>
    extension.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  )
  .join("|");

/**
 * Recherche les chemins de médias les plus courants dans des YAML Foundry.
 *
 * On analyse volontairement le texte brut afin de couvrir automatiquement :
 * - Item.img
 * - Actor.img
 * - prototypeToken.texture.src
 * - Scene.background.src
 * - Token.texture.src
 * - Tile.texture.src
 * - HTML de Journal
 * - sons de Playlist / AmbientSound
 * - médias embarqués dans des Adventure documents
 */
const MEDIA_REGEX = new RegExp(
  String.raw`(?:https?:\/\/|data:|worlds\/|modules\/|systems\/|icons\/|ui\/|assets\/|[A-Za-z0-9_.@%+~:-]+\/)[^"'` +
  "`" +
  String.raw`\s<>{}\[\],]*?\.(?:${escapedExtensions})(?:\?[^"'` +
  "`" +
  String.raw`\s<>]*)?(?:#[^"'` +
  "`" +
  String.raw`\s<>]*)?`,
  "gi"
);

const stats = {
  yamlFiles: 0,
  references: 0,

  byKind: {
    image: 0,
    audio: 0,
    video: 0
  },

  accepted: {
    module: 0,
    systemCof2: 0,
    foundryCore: 0,
    remote: 0,
    dataUri: 0
  }
};

const warnings = [];
const errors = [];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function relativeToRoot(filePath) {
  return toPosix(path.relative(ROOT, filePath));
}

function stripQueryAndHash(mediaPath) {
  const queryIndex = mediaPath.indexOf("?");
  const hashIndex = mediaPath.indexOf("#");

  let end = mediaPath.length;

  if (queryIndex >= 0) {
    end = Math.min(end, queryIndex);
  }

  if (hashIndex >= 0) {
    end = Math.min(end, hashIndex);
  }

  return mediaPath.slice(0, end);
}

function getMediaKind(mediaPath) {
  const clean = stripQueryAndHash(mediaPath).toLowerCase();

  for (const [kind, extensions] of Object.entries(CONFIG.extensions)) {
    if (
      extensions.some((extension) =>
        clean.endsWith(`.${extension}`)
      )
    ) {
      return kind;
    }
  }

  return "unknown";
}

function normalizeReference(mediaPath) {
  // Retire une ponctuation terminale susceptible d'être capturée depuis du HTML.
  return mediaPath.replace(/[).;:]+$/g, "");
}

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
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

  const entries = await fs.readdir(directory, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...await walkYamlFiles(fullPath));
      continue;
    }

    if (
      entry.isFile() &&
      /\.(?:ya?ml)$/i.test(entry.name)
    ) {
      result.push(fullPath);
    }
  }

  return result;
}

function addWarning({
                      type,
                      kind,
                      sourceFile,
                      line,
                      mediaPath,
                      details = null
                    }) {
  warnings.push({
    type,
    kind,
    sourceFile,
    line,
    mediaPath,
    details
  });
}

function addError({
                    type,
                    kind,
                    sourceFile,
                    line,
                    mediaPath,
                    details = null
                  }) {
  errors.push({
    type,
    kind,
    sourceFile,
    line,
    mediaPath,
    details
  });
}

async function auditReference({
                                sourceFile,
                                content,
                                rawReference,
                                index
                              }) {

  const mediaPath = normalizeReference(rawReference);
  const kind = getMediaKind(mediaPath);
  const line = getLineNumber(content, index);

  stats.references += 1;

  if (Object.hasOwn(stats.byKind, kind)) {
    stats.byKind[kind] += 1;
  }

  // ------------------------------------------------------------
  // 0. EXCLUSIONS EXPLICITES
  // ------------------------------------------------------------

  if (
    CONFIG.excludedPatterns.some(
      pattern => pattern.test(mediaPath)
    )
  ) {
    return;
  }

  // ------------------------------------------------------------
  // 1. WORLD : seule catégorie bloquante
  // ------------------------------------------------------------

  if (mediaPath.startsWith("worlds/")) {
    addError({
      type: "WORLD_REFERENCE",
      kind,
      sourceFile,
      line,
      mediaPath,
      details:
        "Une référence à un world n'est pas portable dans un module."
    });

    return;
  }

  // ------------------------------------------------------------
  // 2. MODULE WARBOUND : accepté
  //
  // On vérifie tout de même que le fichier existe dans la codebase.
  // S'il manque, on produit seulement un warning.
  // ------------------------------------------------------------

  if (mediaPath.startsWith(CONFIG.modulePrefix)) {
    const cleanPath = stripQueryAndHash(mediaPath);

    const relativeAssetPath = cleanPath.slice(
      CONFIG.modulePrefix.length
    );

    let decodedRelativeAssetPath = relativeAssetPath;

    try {
      decodedRelativeAssetPath =
        decodeURIComponent(relativeAssetPath);
    } catch {
      // Si le chemin est mal encodé,
      // on le teste tel quel.
    }

    const localPath = path.join(
      ROOT,
      decodedRelativeAssetPath
    );

    if (!await fileExists(localPath)) {
      addWarning({
        type: "MISSING_MODULE_FILE",
        kind,
        sourceFile,
        line,
        mediaPath,
        details:
          `Fichier local introuvable : ${relativeToRoot(localPath)}`
      });

      return;
    }

    stats.accepted.module += 1;

    return;
  }

  // ------------------------------------------------------------
  // 3. AUTRE MODULE : accepté avec warning
  // ------------------------------------------------------------

  if (mediaPath.startsWith("modules/")) {
    addWarning({
      type: "EXTERNAL_MODULE_REFERENCE",
      kind,
      sourceFile,
      line,
      mediaPath,
      details:
        "Référence vers un autre module Foundry."
    });

    return;
  }

  // ------------------------------------------------------------
  // 4. SYSTÈME COF2 : accepté
  // ------------------------------------------------------------

  if (mediaPath.startsWith(CONFIG.systemPrefix)) {
    stats.accepted.systemCof2 += 1;

    return;
  }

  // ------------------------------------------------------------
  // 5. AUTRE SYSTÈME : accepté avec warning
  // ------------------------------------------------------------

  if (mediaPath.startsWith("systems/")) {
    addWarning({
      type: "EXTERNAL_SYSTEM_REFERENCE",
      kind,
      sourceFile,
      line,
      mediaPath,
      details:
        `Référence vers un système autre que ${CONFIG.systemId}.`
    });

    return;
  }

  // ------------------------------------------------------------
  // 6. FOUNDRY CORE : accepté
  // ------------------------------------------------------------

  if (
    mediaPath.startsWith("icons/") ||
    mediaPath.startsWith("ui/")
  ) {
    stats.accepted.foundryCore += 1;

    return;
  }

  // ------------------------------------------------------------
  // 7. INTERNET : accepté
  // ------------------------------------------------------------

  if (/^https?:\/\//i.test(mediaPath)) {
    stats.accepted.remote += 1;

    return;
  }

  // ------------------------------------------------------------
  // 8. DATA URI : accepté
  // ------------------------------------------------------------

  if (/^data:/i.test(mediaPath)) {
    stats.accepted.dataUri += 1;

    return;
  }

  // ------------------------------------------------------------
  // 9. AUTRE CHEMIN : warning uniquement
  // ------------------------------------------------------------

  addWarning({
    type: "UNCLASSIFIED_REFERENCE",
    kind,
    sourceFile,
    line,
    mediaPath,
    details:
      "Référence média non reconnue par la politique Warbound."
  });
}

async function auditYamlFile(sourceFile) {
  const content = await fs.readFile(
    sourceFile,
    "utf8"
  );

  stats.yamlFiles += 1;

  MEDIA_REGEX.lastIndex = 0;

  let match;

  while (
    (match = MEDIA_REGEX.exec(content)) !== null
    ) {
    await auditReference({
      sourceFile,
      content,
      rawReference: match[0],
      index: match.index
    });
  }
}

function countByType(items) {
  const counts = new Map();

  for (const item of items) {
    counts.set(
      item.type,
      (counts.get(item.type) ?? 0) + 1
    );
  }

  return counts;
}

function printHeader() {
  console.log("");
  console.log("WARBOUND — Assets Audit");
  console.log("========================");
  console.log("");

  console.log(
    `Module.................... ${CONFIG.moduleId}`
  );

  console.log(
    `Système................... ${CONFIG.systemId}`
  );

  console.log(
    `Source YAML............... ${relativeToRoot(CONFIG.compendiumsRoot)}`
  );

  console.log("");
}

function printStats() {
  console.log(
    `YAML analysés............. ${stats.yamlFiles}`
  );

  console.log(
    `Références média.......... ${stats.references}`
  );

  console.log(
    `  Images.................. ${stats.byKind.image}`
  );

  console.log(
    `  Audio................... ${stats.byKind.audio}`
  );

  console.log(
    `  Vidéo................... ${stats.byKind.video}`
  );

  console.log("");

  console.log("RÉFÉRENCES ACCEPTÉES");

  console.log(
    `  Module Warbound......... ${stats.accepted.module}`
  );

  console.log(
    `  Système COF2............ ${stats.accepted.systemCof2}`
  );

  console.log(
    `  Foundry Core............ ${stats.accepted.foundryCore}`
  );

  console.log(
    `  Internet................ ${stats.accepted.remote}`
  );

  console.log(
    `  Data URI................ ${stats.accepted.dataUri}`
  );
}

function printWarnings() {
  if (warnings.length === 0) {
    return;
  }

  const counts = countByType(warnings);

  console.log("");

  console.log(
    `WARNINGS.................. ${warnings.length}`
  );

  for (
    const [type, count]
    of [...counts.entries()].sort()
    ) {
    console.log(
      `  ${type.padEnd(30, ".")} ${count}`
    );
  }

  console.log("");

  for (const warning of warnings) {
    console.warn(
      `[WARNING:${warning.type}] ${warning.kind.toUpperCase()}`
    );

    console.warn(
      `${relativeToRoot(warning.sourceFile)}:${warning.line}`
    );

    console.warn(
      `  ${warning.mediaPath}`
    );

    if (warning.details) {
      console.warn(
        `  ${warning.details}`
      );
    }

    console.warn("");
  }
}

function printErrors() {
  if (errors.length === 0) {
    return;
  }

  const counts = countByType(errors);

  console.log("");

  console.log(
    `ERREURS BLOQUANTES........ ${errors.length}`
  );

  for (
    const [type, count]
    of [...counts.entries()].sort()
    ) {
    console.log(
      `  ${type.padEnd(30, ".")} ${count}`
    );
  }

  console.log("");

  for (const error of errors) {
    console.error(
      `[${error.type}] ${error.kind.toUpperCase()}`
    );

    console.error(
      `${relativeToRoot(error.sourceFile)}:${error.line}`
    );

    console.error(
      `  ${error.mediaPath}`
    );

    if (error.details) {
      console.error(
        `  ${error.details}`
      );
    }

    console.error("");
  }
}

async function main() {
  printHeader();

  if (!await fileExists(CONFIG.compendiumsRoot)) {
    console.error(
      `❌ Répertoire YAML introuvable : ${relativeToRoot(CONFIG.compendiumsRoot)}`
    );

    console.error(
      "Exécute d'abord pushLDBtoYAML ou vérifie CONFIG.compendiumsRoot."
    );

    process.exitCode = 2;

    return;
  }

  const yamlFiles = await walkYamlFiles(
    CONFIG.compendiumsRoot
  );

  for (const yamlFile of yamlFiles) {
    await auditYamlFile(yamlFile);
  }

  printStats();
  printWarnings();
  printErrors();

  console.log("");

  // Seules les références worlds/... bloquent le build.
  if (errors.length > 0) {
    console.error(
      `❌ AUDIT FAILED — ${errors.length} référence(s) worlds/... à corriger.`
    );

    console.error(
      "Le module ne doit dépendre d'aucun média stocké dans un world Foundry."
    );

    process.exitCode = 1;

    return;
  }

  if (warnings.length > 0) {
    console.log(
      `✅ AUDIT OK AVEC WARNINGS — ${warnings.length} avertissement(s), aucun blocage.`
    );

    return;
  }

  console.log(
    "✅ AUDIT OK — aucune référence world détectée."
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
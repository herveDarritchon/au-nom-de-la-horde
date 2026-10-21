/**
 * Warbound — Media Optimize (orchestrateur CLI)
 *
 * Usage :
 *   pnpm media:optimize           # dry-run par défaut (aucune écriture)
 *   pnpm media:optimize --write   # applique les modifications
 *
 * Pipeline (mode --write) :
 *   scan → conversion PNG→WebP → migration des références → optimisation OGG
 *   → pnpm build → suppression des PNG devenus inutiles
 *
 * Idempotent : relancer deux fois ne produit aucune modification
 * supplémentaire.
 *
 * Code retour :
 *   0 = succès
 *   1 = une ou plusieurs erreurs sont survenues
 *   2 = erreur inattendue ou option invalide
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { collectPngAssetRefs } from "../src/tools/mediaPaths.mjs";
import { mergeManifest } from "../src/tools/conversionManifest.mjs";

import { scan } from "./mediaScanner.mjs";
import { run as convertImages } from "./convertImages.mjs";
import { readManifest, writeManifest } from "./manifestStore.mjs";
import { run as migrateRefs } from "./migrateRefs.mjs";
import { run as optimizeAudio } from "./optimizeAudio.mjs";
import { run as convertVideos } from "./convertVideos.mjs";
import { MODULE_ID, REPORTS_DIR } from "./media.config.mjs";

const ROOT = process.cwd();

/**
 * Indique si ce module est le point d'entrée du processus.
 * Permet d'importer les helpers sans déclencher l'orchestration.
 * @returns {boolean}
 */
function isMainModule() {
  const entry = process.argv[1];

  if (!entry) return false;

  return pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

function formatBytes(bytes) {
  if (!bytes) return "0 o";

  const units = ["o", "Ko", "Mo", "Go"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/**
 * Analyse les arguments de la ligne de commande.
 * @param {string[]} argv
 * @returns {{ write: boolean, help: boolean, error: string|null }}
 */
function parseArgs(argv) {
  let write = false;
  let help = false;

  for (const arg of argv) {
    if (arg === "--write") {
      write = true;
    } else if (arg === "--dry-run") {
      write = false;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else {
      return { write, help, error: `Option inconnue : ${arg}` };
    }
  }

  return { write, help, error: null };
}

function printHelp() {
  console.log(`
WARBOUND — Media Optimize

Usage :
  pnpm media:optimize [--dry-run | --write]

Options :
  --dry-run   Inventorie et projette les modifications sans rien écrire
              (comportement par défaut).
  --write     Convertit les PNG en WebP, migre les références, optimise les
              OGG, recompile les packs puis supprime les PNG devenus inutiles.
  -h, --help  Affiche cette aide.

Rapport JSON : ${REPORTS_DIR}/media-optimize-<horodatage>.json
`);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function printHeader(scanReport, mode) {
  console.log("");
  console.log("WARBOUND — Media Optimize");
  console.log("==========================");
  console.log(`Module.......................... ${MODULE_ID}`);
  console.log(`Mode............................ ${mode}`);
  console.log("");
  console.log("SCAN");
  console.log(`  Images PNG..................... ${scanReport.images.length}`);
  console.log(`  Fichiers audio.................. ${scanReport.audio.length}`);
  console.log(`  Fichiers sources analysés...... ${scanReport.sources.length}`);
  console.log(`  Fichiers avec refs médias...... ${scanReport.refs.length}`);
  console.log("");
}

function printResults(imageResult, refResult, audioResult, videoResult) {
  console.log("RÉSULTATS");

  console.log(
    `  Images converties (PNG→WebP)... ${imageResult.converted}`
  );
  console.log(
    `  Images réencodées.............. ${imageResult.reencoded}`
  );
  console.log(
    `  Images ignorées (déjà WebP).... ${imageResult.skipped}`
  );
  console.log(
    `  Sources migrées............... ${refResult.migrated}`
  );
  console.log(
    `  Remplacements de références..... ${refResult.replacements}`
  );
  console.log(
    `  Fichiers audio optimisés........ ${audioResult.optimized}`
  );
  console.log(
    `  Fichiers audio ignorés.......... ${audioResult.skipped}`
  );
  console.log(
    `  Vidéos (hors périmètre)......... ${videoResult.skipped}`
  );

  if (imageResult.sizes.probed) {
    const saved = imageResult.sizes.pngBytes - imageResult.sizes.webpBytes;
    console.log(
      `  Gain images (PNG→WebP)......... ${formatBytes(saved)}`
    );
  }

  if (audioResult.savedBytes > 0) {
    console.log(
      `  Gain audio...................... ${formatBytes(audioResult.savedBytes)}`
    );
  }

  console.log("");
}

function printErrors(results) {
  const allErrors = results.flatMap((result) => result.errors ?? []);

  if (allErrors.length === 0) return;

  console.error(`ERREURS (${allErrors.length})`);

  for (const { file, error } of allErrors) {
    console.error(`  ✗ ${path.relative(ROOT, file)}: ${error}`);
  }

  console.error("");
}

/**
 * Recense les assets PNG encore référencés après migration.
 * Ces PNG doivent être conservés : les supprimer casserait le rendu.
 *
 * Seules les références pointant vers un asset existant sont retenues : les
 * exemples d'illustration présents dans les commentaires du code ne doivent
 * pas être pris pour des références réelles.
 *
 * @param {Array<{filePath:string,fileDir:string}>} sources
 * @param {Set<string>} knownAssets
 * @returns {Promise<Set<string>>}
 */
async function collectRemainingPngRefs(sources, knownAssets) {
  const remaining = new Set();

  for (const source of sources) {
    const content = await fs.readFile(source.filePath, "utf8");
    const referenced = collectPngAssetRefs(content, {
      root: ROOT,
      fileDir: source.fileDir,
      moduleId: MODULE_ID
    });

    for (const assetPath of referenced) {
      if (knownAssets.has(assetPath)) {
        remaining.add(assetPath);
      }
    }
  }

  return remaining;
}

/**
 * Supprime les PNG qui ne sont plus référencés et dont le WebP existe.
 * @returns {Promise<{deleted: number, kept: string[]}>}
 */
async function cleanupPng(images, webpAssets, remaining) {
  let deleted = 0;
  const kept = [];

  for (const image of images) {
    if (!webpAssets.has(image.assetPath)) {
      kept.push(image.assetPath);
      continue;
    }

    if (remaining.has(image.assetPath)) {
      kept.push(image.assetPath);
      continue;
    }

    try {
      await fs.access(image.webpPath);
      await fs.unlink(image.pngPath);
      deleted++;
    } catch {
      kept.push(image.assetPath);
    }
  }

  return { deleted, kept };
}

async function writeReport(report) {
  const reportsDir = path.join(ROOT, REPORTS_DIR);
  await ensureDir(reportsDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportsDir, `media-optimize-${timestamp}.json`);

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Rapport JSON : ${path.relative(ROOT, reportPath)}`);
}

async function main() {
  const { write, help, error } = parseArgs(process.argv.slice(2));

  if (help) {
    printHelp();
    return;
  }

  if (error) {
    console.error(`❌ ${error}`);
    printHelp();
    process.exitCode = 2;
    return;
  }

  const mode = write ? "WRITE" : "DRY-RUN";

  if (!write) {
    console.log(
      "\n[DRY-RUN] Aucune écriture sur le disque. Utilise --write pour appliquer."
    );
  }

  const scanReport = await scan(ROOT);
  printHeader(scanReport, mode);

  const { manifest } = await readManifest(ROOT);
  const imageResult = await convertImages(scanReport.images, { write, manifest });

  // En dry-run, sans Sharp, la projection des tailles est impossible : on
  // migre alors toutes les références résolubles (estimation optimiste).
  const migratableAssets = imageResult.sizes.probed
    ? imageResult.webpAssets
    : undefined;

  const refResult = await migrateRefs(scanReport.refs, write, {
    root: ROOT,
    migratableAssets
  });

  const audioResult = await optimizeAudio(scanReport.audio, write);
  const videoResult = await convertVideos(scanReport.videos, write);

  printResults(imageResult, refResult, audioResult, videoResult);
  printErrors([imageResult, refResult, audioResult, videoResult]);

  const report = {
    timestamp: new Date().toISOString(),
    mode,
    module: MODULE_ID,
    scan: {
      images: scanReport.images.length,
      audio: scanReport.audio.length,
      videos: scanReport.videos.length,
      sources: scanReport.sources.length,
      filesWithRefs: scanReport.refs.length
    },
    results: {
      images: {
        converted: imageResult.converted,
        reencoded: imageResult.reencoded,
        written: imageResult.written,
        skipped: imageResult.skipped,
        keptPng: imageResult.keptPng,
        keptPngDetails: imageResult.keptPngDetails,
        byProfile: imageResult.byProfile,
        byReason: imageResult.byReason,
        sizes: imageResult.sizes,
        errors: imageResult.errors
      },
      refs: {
        migrated: refResult.migrated,
        skipped: refResult.skipped,
        replacements: refResult.replacements,
        files: refResult.files,
        stillReferenced: [],
        errors: refResult.errors
      },
      audio: audioResult,
      videos: videoResult
    },
    build: { ran: false, ok: null },
    cleanup: { deletedPng: 0, keptPng: [] }
  };

  if (!write) {
    await writeReport(report);

    const total = imageResult.converted + refResult.migrated + audioResult.optimized;
    console.log(
      `Relance avec --write pour appliquer ${total} opération(s).`
    );
    return;
  }

  // Le manifeste est réécrit : la conversion laisse une trace des réglages
  // appliqués, que le passage suivant peut comparer.
  await writeManifest(
    ROOT,
    mergeManifest(manifest, imageResult.manifestEntries, {
      module: MODULE_ID,
      pruneTo: new Set(scanReport.images.map((image) => image.assetPath))
    })
  );

  const allErrors = [
    ...imageResult.errors,
    ...refResult.errors,
    ...audioResult.errors,
    ...videoResult.errors
  ];

  if (allErrors.length > 0) {
    console.error(
      `❌ ${allErrors.length} erreur(s) — build et nettoyage non lancés.`
    );
    report.build = { ran: false, ok: null };
    await writeReport(report);
    process.exitCode = 1;
    return;
  }

  const remaining = await collectRemainingPngRefs(
    scanReport.sources,
    scanReport.assets
  );
  report.results.refs.stillReferenced = [...remaining].sort();

  console.log("Recompilation des packs LevelDB (pnpm build)...");
  report.build = { ran: true, ok: false };

  try {
    execSync("pnpm build", { stdio: "inherit", cwd: ROOT });
    report.build.ok = true;
    console.log("✅ pnpm build réussi.");
  } catch {
    console.error("❌ pnpm build a échoué. PNG originaux conservés.");
    await writeReport(report);
    process.exitCode = 1;
    return;
  }

  console.log("Nettoyage des PNG devenus inutiles...");
  const cleanup = await cleanupPng(
    scanReport.images,
    imageResult.webpAssets,
    remaining
  );

  report.cleanup = { deletedPng: cleanup.deleted, keptPng: cleanup.kept };

  console.log(`  ${cleanup.deleted} PNG supprimé(s).`);

  if (cleanup.kept.length > 0) {
    console.log(`  ${cleanup.kept.length} PNG conservé(s).`);
  }

  await writeReport(report);

  console.log("\n✅ Optimisation terminée.");
}

export { collectRemainingPngRefs, isMainModule, main, parseArgs };

try {
  if (isMainModule()) {
    await main();
  }
} catch (err) {
  console.error("\n❌ ERREUR INATTENDUE");
  console.error(err);
  process.exitCode = 2;
}

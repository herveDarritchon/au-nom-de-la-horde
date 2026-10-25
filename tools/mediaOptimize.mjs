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
 * @returns {{ write: boolean, type: string, quality: number|null, updateReferences: boolean, clean: boolean, confirm: boolean, forceClean: boolean, help: boolean, error: string|null }}
 */
function parseArgs(argv) {
  let write = false;
  let help = false;
  let type = "all";
  let quality = null;
  let updateReferences = false;
  let clean = false;
  let confirm = false;
  let forceClean = false;

  const VALID_TYPES = new Set(["images", "audio", "video", "all"]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--write") {
      write = true;
    } else if (arg === "--dry-run") {
      write = false;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--update-references") {
      updateReferences = true;
    } else if (arg === "--clean") {
      clean = true;
    } else if (arg === "--confirm") {
      confirm = true;
    } else if (arg === "--force-clean") {
      forceClean = true;
    } else if (arg === "--type") {
      const val = argv[++i];
      if (!val || !VALID_TYPES.has(val)) {
        return { write, type, quality, updateReferences, clean, confirm, forceClean, help, error: `Option --type invalide : ${val ?? "(manquante)"}` };
      }
      type = val;
    } else if (arg === "--quality") {
      const val = argv[++i];
      const n = Number(val);
      if (!val || !Number.isInteger(n) || n < 0 || n > 100) {
        return { write, type, quality, updateReferences, clean, confirm, forceClean, help, error: `Option --quality invalide : ${val ?? "(manquante)"}` };
      }
      quality = n;
    } else {
      return { write, type, quality, updateReferences, clean, confirm, forceClean, help, error: `Option inconnue : ${arg}` };
    }
  }

  return { write, type, quality, updateReferences, clean, confirm, forceClean, help, error: null };
}

function printHelp() {
  console.log(`
WARBOUND — Media Optimize

Usage :
  pnpm media:optimize [options]

Options :
  --dry-run              Inventorie et projette les modifications sans rien écrire
                         (comportement par défaut).
  --write                Applique les modifications sur le disque.
  --type images|audio|video|all
                         Limite le traitement au type de média indiqué (défaut : all).
  --quality <n>          Override global de la qualité WebP (0-100).
  --update-references    Migre les références YAML après conversion.
  --clean                Sans --confirm : liste les PNG candidats à la suppression (dry-run).
                         Avec --confirm : supprime les PNG validés (WebP valide, refs migrées, Git propre).
  --confirm              Confirme les opérations destructives (ex. : --clean).
  --force-clean          Contourne le garde Git pour --clean --confirm (CI ou post-squash).
  -h, --help             Affiche cette aide.

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
  console.log(`  Fichiers vidéo.................. ${scanReport.videos.length}`);
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
    `  Vidéos converties (MP4→WebM)... ${videoResult.converted ?? 0}`
  );
  console.log(
    `  Vidéos ignorées................. ${videoResult.skipped ?? 0}`
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

  if ((videoResult.savedBytes ?? 0) > 0) {
    console.log(
      `  Gain vidéo...................... ${formatBytes(videoResult.savedBytes)}`
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
 * Supprime (ou prévisualise la suppression de) PNG originaux devenus inutiles.
 *
 * Gardes cumulatives (dans l'ordre) :
 *   1. Git propre — sauf si forceClean ou dryRun
 *   2. Collision — deux sources différentes → même WebP
 *   3. Validation Sharp — WebP doit être lisible
 *   4. Taille — WebP doit être plus petit que le PNG
 *   5. Références restantes — aucune ref YAML vers ce PNG
 *
 * @param {Array<{assetPath:string,pngPath:string,webpPath:string,hasWebp:boolean}>} images
 * @param {Set<string>} remaining - PNG asset paths encore référencés dans les YAML
 * @param {{ dryRun?: boolean, forceClean?: boolean, webpAssets?: Set<string>|null }} options
 *   webpAssets : Set des assetPaths WebP produits dans ce run (pipeline) ;
 *                null pour un nettoyage autonome → utilise image.hasWebp du scan.
 * @returns {Promise<{deleted:number, kept:Array<{path:string,reason:string}>, candidates:string[], collisions:Array<{webp:string,sources:string[]}>, gitDirty:boolean}>}
 */
async function cleanupPng(images, remaining, { dryRun = false, forceClean = false, webpAssets = null } = {}) {
  // Garde Git (inutile en dry-run)
  if (!dryRun && !forceClean) {
    try {
      const status = execSync("git status --porcelain", { encoding: "utf8", cwd: ROOT }).trim();
      if (status) return { deleted: 0, kept: [], candidates: [], collisions: [], gitDirty: true };
    } catch {
      return { deleted: 0, kept: [], candidates: [], collisions: [], gitDirty: true };
    }
  }

  // Détection des collisions : webpPath → [sources]. Le scanner ne traite que
  // les PNG ; on inspecte donc aussi les JPEG voisins portant le même stem.
  const webpIndex = new Map();
  for (const image of images) {
    const hasWebp = webpAssets !== null ? webpAssets.has(image.assetPath) : image.hasWebp;
    if (!hasWebp) continue;
    if (!webpIndex.has(image.webpPath)) webpIndex.set(image.webpPath, []);

    const sources = [image.assetPath];
    try {
      const entries = await fs.readdir(path.dirname(image.pngPath), { withFileTypes: true });
      const stem = path.basename(image.pngPath).replace(/\.[^.]+$/, "");

      for (const entry of entries) {
        if (!entry.isFile() || !/\.(?:jpe?g)$/i.test(entry.name)) continue;

        const siblingStem = entry.name.replace(/\.[^.]+$/, "");
        if (siblingStem !== stem) continue;

        sources.push(
          path.relative(ROOT, path.join(path.dirname(image.pngPath), entry.name)).replaceAll(path.sep, "/")
        );
      }
    } catch {
      // Le test de validité du WebP produira le motif de conservation adéquat.
    }

    webpIndex.get(image.webpPath).push({ image, sources });
  }

  const collisions = [];
  const collisionAssets = new Set();
  for (const [webpPath, entries] of webpIndex) {
    const sources = [...new Set(entries.flatMap((entry) => entry.sources))];

    if (sources.length > 1) {
      collisions.push({ webp: path.relative(ROOT, webpPath), sources });
      for (const entry of entries) collisionAssets.add(entry.image.assetPath);
    }
  }

  // Chargement de sharp (une seule fois)
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    const kept = images.map((i) => ({ path: i.assetPath, reason: "webp_invalid" }));
    return { deleted: 0, kept, candidates: [], collisions, gitDirty: false };
  }

  let deleted = 0;
  const kept = [];
  const candidates = [];

  for (const image of images) {
    const hasWebp = webpAssets !== null ? webpAssets.has(image.assetPath) : image.hasWebp;

    if (!hasWebp) {
      kept.push({ path: image.assetPath, reason: "no_webp" });
      continue;
    }

    if (collisionAssets.has(image.assetPath)) {
      kept.push({ path: image.assetPath, reason: "collision" });
      continue;
    }

    // Validation Sharp
    try {
      await sharp(image.webpPath).metadata();
    } catch {
      kept.push({ path: image.assetPath, reason: "webp_invalid" });
      continue;
    }

    // Comparaison de taille
    try {
      const [webpStat, pngStat] = await Promise.all([
        fs.stat(image.webpPath),
        fs.stat(image.pngPath)
      ]);
      if (webpStat.size >= pngStat.size) {
        kept.push({ path: image.assetPath, reason: "webp_larger" });
        continue;
      }
    } catch {
      kept.push({ path: image.assetPath, reason: "webp_invalid" });
      continue;
    }

    // Références restantes
    if (remaining.has(image.assetPath)) {
      kept.push({ path: image.assetPath, reason: "refs_remaining" });
      continue;
    }

    // Suppression ou enregistrement comme candidat
    if (dryRun) {
      candidates.push(image.assetPath);
    } else {
      try {
        await fs.unlink(image.pngPath);
        deleted++;
      } catch {
        kept.push({ path: image.assetPath, reason: "webp_invalid" });
      }
    }
  }

  return { deleted, kept, candidates, collisions, gitDirty: false };
}

function printCleanPreview(result) {
  console.log("\nWARBOUND — Aperçu nettoyage PNG");
  console.log("=================================");

  if (result.collisions.length > 0) {
    console.log(`\n⚠️  Collisions (${result.collisions.length}) — conservés :`);
    for (const { webp, sources } of result.collisions) {
      console.log(`  ${webp} ← ${sources.join(", ")}`);
    }
  }

  if (result.candidates.length > 0) {
    console.log(`\n  ${result.candidates.length} PNG supprimable(s) :`);
    for (const p of result.candidates) {
      console.log(`  🗑  ${p}`);
    }
  } else {
    console.log("\n  Aucun PNG éligible à la suppression.");
  }

  const significantKept = result.kept.filter((k) => k.reason !== "no_webp");
  if (significantKept.length > 0) {
    const LABELS = {
      webp_invalid: "WebP invalide",
      webp_larger: "WebP plus grand que PNG",
      refs_remaining: "références YAML restantes",
      collision: "collision de noms"
    };
    console.log(`\n  ${significantKept.length} PNG conservé(s) :`);
    for (const { path: p, reason } of significantKept) {
      console.log(`  ✓ ${p} (${LABELS[reason] ?? reason})`);
    }
  }

  console.log(`\nRelance avec --clean --confirm pour appliquer ${result.candidates.length} suppression(s).`);
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
  const { write, type, quality, updateReferences, clean, confirm, forceClean, help, error } = parseArgs(process.argv.slice(2));

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

  // --clean seul (sans --confirm) : aperçu dry-run puis exit
  if (clean && !confirm) {
    const scanReport = await scan(ROOT);
    const remaining = await collectRemainingPngRefs(scanReport.sources, scanReport.assets);
    const result = await cleanupPng(scanReport.images, remaining, { dryRun: true, forceClean });
    printCleanPreview(result);
    return;
  }

  // --clean --confirm sans --write : nettoyage autonome puis exit
  if (clean && confirm && !write) {
    const scanReport = await scan(ROOT);
    const remaining = await collectRemainingPngRefs(scanReport.sources, scanReport.assets);
    const cleanup = await cleanupPng(scanReport.images, remaining, { dryRun: false, forceClean });
    if (cleanup.gitDirty) {
      console.error("❌ Dépôt Git non propre — nettoyage annulé. Utilise --force-clean pour contourner.");
      process.exitCode = 1;
      return;
    }
    if (cleanup.collisions.length > 0) {
      console.warn(`⚠️  ${cleanup.collisions.length} collision(s) détectée(s) — PNG concernés conservés.`);
      for (const { webp, sources } of cleanup.collisions) {
        console.warn(`   ${webp} ← ${sources.join(", ")}`);
      }
    }
    console.log(`  ${cleanup.deleted} PNG supprimé(s).`);
    if (cleanup.kept.length > 0) {
      console.log(`  ${cleanup.kept.length} PNG conservé(s).`);
    }

    try {
      execSync("pnpm packs:audit", { stdio: "inherit", cwd: ROOT });
    } catch {
      console.error("❌ pnpm packs:audit a échoué après nettoyage.");
      process.exitCode = 1;
    }

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

  const runImages = type === "images" || type === "all";
  const runAudio = type === "audio" || type === "all";
  const runVideos = type === "video" || type === "all";

  const imageResult = runImages
    ? await convertImages(scanReport.images, { write, quality, manifest })
    : { converted: 0, reencoded: 0, written: 0, skipped: scanReport.images.length, keptPng: 0, keptPngDetails: [], byProfile: {}, byReason: {}, sizes: { probed: false, pngBytes: 0, webpBytes: 0 }, webpAssets: new Set(), manifestEntries: [], errors: [] };

  const audioResult = runAudio
    ? await optimizeAudio(scanReport.audio, write)
    : { optimized: 0, skipped: scanReport.audio.length, savedBytes: 0, errors: [] };

  const videoResult = runVideos
    ? await convertVideos(scanReport.videos, write)
    : { converted: 0, skipped: scanReport.videos?.length ?? 0, savedBytes: 0, webmAssets: new Set(), errors: [] };

  // Migrate only assets validated by the conversion steps that ran. In
  // `all`, both image and video extensions share one safe reference pass.
  const migratableAssets = new Set([
    ...imageResult.webpAssets,
    ...videoResult.webmAssets
  ]);
  const migrateReferences = updateReferences || (clean && write);
  const refResult = migrateReferences
    ? await migrateRefs(scanReport.refs, write, {
        root: ROOT,
        migratableAssets,
        extensions: [".png", ".mp4", ".mov"],
        targetExtension: (rawRef) =>
          /\.png$/i.test(rawRef) ? ".webp" : ".webm"
      })
    : { migrated: 0, skipped: 0, replacements: 0, files: [], errors: [] };

  printResults(imageResult, refResult, audioResult, videoResult);
  printErrors([imageResult, refResult, audioResult, videoResult]);

  const report = {
    timestamp: new Date().toISOString(),
    mode,
    module: MODULE_ID,
    options: { type, quality, updateReferences, clean, confirm, forceClean },
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
    cleanup: { dryRun: false, deletedPng: 0, keptPng: [], collisions: [] }
  };

  if (!write) {
    await writeReport(report);

    const total =
      imageResult.converted +
      refResult.migrated +
      audioResult.optimized +
      videoResult.converted;
    console.log(
      `Relance avec --write pour appliquer ${total} opération(s).`
    );
    return;
  }

  if (runImages) {
    await writeManifest(
      ROOT,
      mergeManifest(manifest, imageResult.manifestEntries, {
        module: MODULE_ID,
        pruneTo: new Set(scanReport.images.map((image) => image.assetPath))
      })
    );
  }

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

  if (migrateReferences) {
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

    if (clean && confirm) {
      console.log("Nettoyage des PNG devenus inutiles...");
      const cleanup = await cleanupPng(
        scanReport.images,
        remaining,
        { dryRun: false, forceClean, webpAssets: imageResult.webpAssets }
      );

      if (cleanup.gitDirty) {
        console.error("❌ Dépôt Git non propre — nettoyage annulé. Utilise --force-clean pour contourner.");
        report.cleanup = { dryRun: false, deletedPng: 0, keptPng: [], collisions: [], gitDirty: true };
        await writeReport(report);
        process.exitCode = 1;
        return;
      }

      if (cleanup.collisions.length > 0) {
        console.warn(`⚠️  ${cleanup.collisions.length} collision(s) détectée(s) — PNG concernés conservés.`);
        for (const { webp, sources } of cleanup.collisions) {
          console.warn(`   ${webp} ← ${sources.join(", ")}`);
        }
      }

      report.cleanup = { dryRun: false, deletedPng: cleanup.deleted, keptPng: cleanup.kept, collisions: cleanup.collisions };

      console.log(`  ${cleanup.deleted} PNG supprimé(s).`);

      if (cleanup.kept.length > 0) {
        console.log(`  ${cleanup.kept.length} PNG conservé(s).`);
      }
    }
  }

  await writeReport(report);

  console.log("\n✅ Optimisation terminée.");
}

export { cleanupPng, collectRemainingPngRefs, isMainModule, main, parseArgs, printCleanPreview, printHelp };

try {
  if (isMainModule()) {
    await main();
  }
} catch (err) {
  console.error("\n❌ ERREUR INATTENDUE");
  console.error(err);
  process.exitCode = 2;
}

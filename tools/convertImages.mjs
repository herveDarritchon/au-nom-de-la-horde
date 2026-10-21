/**
 * Warbound — Convert Images
 *
 * Conversion PNG → WebP via Sharp, en appliquant le profil de compression
 * correspondant au type d'image (icône, portrait, carte, illustration...).
 *
 * Idempotent : un WebP produit aux mêmes réglages et depuis la même source
 * est laissé intact. Un WebP dont le profil a changé, ou dont la source a
 * été modifiée, est réencodé.
 *
 * Garde-fou : si le WebP produit est plus lourd que le PNG source, il n'est
 * pas conservé et le PNG reste en place — l'asset ne sera alors pas migré
 * vers le WebP. Un WebP antérieur, s'il existe, n'est jamais détruit. Ces
 * conversions sont signalées dans le rapport.
 *
 * Usage : importé par mediaOptimize.mjs, ou exécuté directement via
 * `pnpm media:convert:images`.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  SKIP_REASONS,
  buildManifestEntry,
  hashBuffer,
  isUpToDate,
  mergeManifest
} from "../src/tools/conversionManifest.mjs";
import { resolveImageSettings, withQualityOverride } from "../src/tools/mediaPaths.mjs";
import {
  FOUNDRY_THUMBNAIL_PATTERN,
  IMAGE_PROFILES,
  MODULE_ID,
  REPORTS_DIR,
  THUMBNAIL_DIR
} from "./media.config.mjs";

/**
 * Entrées de profils indexées par nom, pour retrouver les réglages d'un
 * profil résolu par le scanner.
 */
const PROFILE_ENTRIES = new Map(IMAGE_PROFILES.map((entry) => [entry.profile, entry]));

async function loadSharp(required) {
  try {
    const mod = await import("sharp");
    return mod.default;
  } catch (err) {
    if (required) {
      throw new Error(
        "Le module 'sharp' est introuvable. Exécute : pnpm add -D sharp"
      );
    }
    return null;
  }
}

/**
 * Construit la table de conversion PNG → WebP.
 *
 * Ne contient que les conversions réussies : un asset dont le WebP a été
 * écarté (plus lourd que le PNG) n'y figure pas.
 *
 * @param {Iterable<string>} webpAssets chemins d'assets PNG convertis
 * @returns {Record<string, string>} PNG → WebP
 */
function buildConversionTable(webpAssets) {
  const table = {};

  for (const assetPath of [...webpAssets].sort()) {
    table[assetPath] = assetPath.replace(/\.png$/i, ".webp");
  }

  return table;
}

/**
 * Liste les vignettes de scènes générées par Foundry.
 *
 * Elles sont déjà au bon format et régénérées par Foundry : les ignorer
 * évite de les convertir ou de les supprimer.
 *
 * @param {string} root racine du dépôt
 * @returns {Promise<string[]>} chemins POSIX relatifs au dépôt
 */
async function findFoundryThumbnails(root) {
  const dir = path.join(root, THUMBNAIL_DIR);

  let entries;

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.posix.join(THUMBNAIL_DIR, entry.name))
    .filter((assetPath) => FOUNDRY_THUMBNAIL_PATTERN.test(assetPath))
    .sort();
}

/**
 * Retrouve les réglages d'encodage d'un profil.
 *
 * @param {string} profile nom du profil
 * @returns {{profile: string, quality: number|null, lossless: boolean, effort: number}}
 */
function settingsForProfile(profile) {
  const entry = PROFILE_ENTRIES.get(profile) ?? PROFILE_ENTRIES.get("default");

  return {
    profile: entry.profile,
    quality: entry.quality ?? null,
    lossless: Boolean(entry.lossless),
    effort: entry.effort ?? 4
  };
}

/**
 * Traduit des réglages de profil en options `sharp.webp()`.
 *
 * Les options absentes (`quality: null`) sont omises : Sharp applique alors
 * sa propre valeur par défaut.
 *
 * @param {{quality: number|null, lossless: boolean, effort: number}} settings
 * @returns {{quality?: number, lossless: boolean, effort: number}}
 */
function sharpOptions(settings) {
  const options = { lossless: settings.lossless, effort: settings.effort };

  if (settings.quality != null) options.quality = settings.quality;

  return options;
}

/**
 * Construit l'encodeur WebP par défaut, à partir de Sharp.
 *
 * @param {Function} sharp module Sharp chargé
 * @returns {(source: Buffer, settings: object) => Promise<Buffer>}
 */
function sharpEncoder(sharp) {
  return (source, settings) => sharp(source).webp(sharpOptions(settings)).toBuffer();
}

/**
 * Charge l'encodeur par défaut.
 *
 * @param {boolean} required `true` en mode écriture : l'absence de Sharp est
 *   alors une erreur, `false` en dry-run où l'absence de Sharp n'empêche
 *   qu'une projection approximative.
 * @returns {Promise<(source: Buffer, settings: object) => Promise<Buffer>|null>}
 */
async function defaultEncoder(required) {
  const sharp = await loadSharp(required);

  return sharp ? sharpEncoder(sharp) : null;
}

/**
 * Convertit les images PNG en WebP.
 *
 * @param {Array<{assetPath:string,pngPath:string,webpPath:string,profile:string,settings?:object,hasWebp:boolean}>} images
 * @param {{
 *   write?: boolean,
 *   quality?: number|null,
 *   manifest?: object|null,
 *   encode?: (source: Buffer, settings: object) => Promise<Buffer>
 * }} [options]
 * @returns {Promise<{
 *   converted: number,
 *   reencoded: number,
 *   written: number,
 *   skipped: number,
 *   keptPng: string[],
 *   keptPngDetails: Array<{assetPath:string,pngBytes:number,webpBytes:number,savingsPct:number,profile:string,reason:string}>,
 *   outcomes: Array<{assetPath:string,profile:string,reason:string,pngBytes:number,webpBytes:number,savingsPct:number|null}>,
 *   byReason: Record<string, number>,
 *   manifestEntries: object[],
 *   thumbnailsSkipped: number,
 *   byProfile: Record<string, {candidates:number,converted:number,kept:number,skipped:number}>,
 *   webpAssets: Set<string>,
 *   sizes: { probed: boolean, pngBytes: number, webpBytes: number, producedWebpBytes: number },
 *   errors: Array<{file:string,error:string}>
 * }>}
 */
async function run(images, options = {}) {
  const { write = false, quality = null, manifest = null, encode = null } = options;

  const errors = [];
  const keptPng = [];
  const keptPngDetails = [];
  const outcomes = [];
  const manifestEntries = [];
  const webpAssets = new Set();
  const byProfile = {};
  const byReason = Object.fromEntries(
    Object.values(SKIP_REASONS).map((reason) => [reason, 0])
  );

  let converted = 0;
  let reencoded = 0;
  let written = 0;
  let skipped = 0;
  let thumbnailsSkipped = 0;
  let pngBytes = 0;
  let webpBytes = 0;
  let producedWebpBytes = 0;

  // L'encodeur peut être injecté : les tests peuvent alors contrôler
  // précisément les réglages reçus et produire des sorties de taille choisie.
  const encoder = encode ?? (await defaultEncoder(write));

  const countReason = (reason) => {
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  };

  for (const image of images) {
    const profile = image.profile ?? "default";
    const baseSettings = image.settings ?? settingsForProfile(profile);
    const settings = withQualityOverride(baseSettings, quality);

    if (!byProfile[profile]) {
      byProfile[profile] = { candidates: 0, converted: 0, kept: 0, skipped: 0 };
    }
    byProfile[profile].candidates += 1;

    // Vignettes Foundry : ni converties, ni supprimées.
    if (FOUNDRY_THUMBNAIL_PATTERN.test(image.assetPath)) {
      thumbnailsSkipped += 1;
      countReason(SKIP_REASONS.SKIP_THUMBNAIL);
      outcomes.push({
        assetPath: image.assetPath,
        profile,
        reason: SKIP_REASONS.SKIP_THUMBNAIL,
        pngBytes: 0,
        webpBytes: 0,
        savingsPct: null
      });
      continue;
    }

    const manifestEntry = manifest?.assets?.[image.assetPath] ?? null;

    try {
      const source = await fs.readFile(image.pngPath);
      const sourceHash = hashBuffer(source);
      const sourceBytes = source.length;

      pngBytes += sourceBytes;

      // Un WebP existe déjà : on ne le remplace que si le profil a changé ou
      // si la source a été modifiée.
      if (image.hasWebp) {
        const upToDate = isUpToDate(manifestEntry, settings, sourceHash);

        if (upToDate) {
          skipped += 1;
          byProfile[profile].skipped += 1;
          countReason(SKIP_REASONS.SKIP_OPTIMIZED);
          webpAssets.add(image.assetPath);

          const existingBytes = (await fs.stat(image.webpPath)).size;
          webpBytes += existingBytes;

          outcomes.push({
            assetPath: image.assetPath,
            profile,
            reason: SKIP_REASONS.SKIP_OPTIMIZED,
            pngBytes: sourceBytes,
            webpBytes: existingBytes,
            savingsPct: savingsPct(sourceBytes, existingBytes)
          });

          continue;
        }

        if (!manifestEntry) {
          // WebP produit par un autre outil : il n'est ni traçable ni
          // réencodable sans risque, il est laissé intact.
          skipped += 1;
          byProfile[profile].skipped += 1;
          countReason(SKIP_REASONS.SKIP_EXISTING);
          webpAssets.add(image.assetPath);

          const existingBytes = (await fs.stat(image.webpPath)).size;
          webpBytes += existingBytes;

          outcomes.push({
            assetPath: image.assetPath,
            profile,
            reason: SKIP_REASONS.SKIP_EXISTING,
            pngBytes: sourceBytes,
            webpBytes: existingBytes,
            savingsPct: savingsPct(sourceBytes, existingBytes)
          });

          continue;
        }
      }

      if (!encoder) {
        // Sans Sharp, impossible de mesurer : on reste optimiste et le
        // nettoyage des PNG est neutralisé (`webpAssets` vide).
        converted += 1;
        byProfile[profile].converted += 1;
        countReason(SKIP_REASONS.CONVERTED);
        continue;
      }

      const buffer = await encoder(source, settings);
      producedWebpBytes += buffer.length;

      // Garde-fou : un WebP plus lourd que son PNG n'est pas conservé. Un WebP
      // antérieur, s'il existe, reste en place.
      if (buffer.length >= sourceBytes) {
        keptPng.push(image.assetPath);
        keptPngDetails.push({
          assetPath: image.assetPath,
          profile,
          pngBytes: sourceBytes,
          webpBytes: buffer.length,
          savingsPct: 0,
          reason: SKIP_REASONS.SKIP_LARGER
        });
        byProfile[profile].kept += 1;
        countReason(SKIP_REASONS.SKIP_LARGER);

        if (image.hasWebp) {
          const existingBytes = (await fs.stat(image.webpPath)).size;
          webpBytes += existingBytes;
        }

        outcomes.push({
          assetPath: image.assetPath,
          profile,
          reason: SKIP_REASONS.SKIP_LARGER,
          pngBytes: sourceBytes,
          webpBytes: buffer.length,
          savingsPct: 0
        });

        // Aucune trace n'est écrite : le profil courant n'a pas produit de
        // WebP exploitable, la tentative sera rejouée au prochain passage.
        continue;
      }

      if (write) {
        await fs.writeFile(image.webpPath, buffer);
        written += 1;
      }

      const reason = image.hasWebp
        ? SKIP_REASONS.REENCODED
        : SKIP_REASONS.CONVERTED;

      converted += 1;
      if (image.hasWebp) reencoded += 1;
      byProfile[profile].converted += 1;
      countReason(reason);
      webpAssets.add(image.assetPath);
      webpBytes += buffer.length;

      outcomes.push({
        assetPath: image.assetPath,
        profile,
        reason,
        pngBytes: sourceBytes,
        webpBytes: buffer.length,
        savingsPct: savingsPct(sourceBytes, buffer.length)
      });

      manifestEntries.push(
        buildManifestEntry({
          assetPath: image.assetPath,
          settings,
          sourceHash,
          pngBytes: sourceBytes,
          webpBytes: buffer.length,
          reason
        })
      );
    } catch (err) {
      errors.push({ file: image.assetPath, error: err.message });
    }
  }

  return {
    converted,
    reencoded,
    written,
    skipped,
    keptPng,
    keptPngDetails,
    outcomes,
    byReason,
    manifestEntries,
    thumbnailsSkipped,
    byProfile,
    webpAssets,
    sizes: { probed: Boolean(encoder), pngBytes, webpBytes, producedWebpBytes },
    errors
  };
}

/**
 * Économie en pourcentage, `null` si la source est vide.
 *
 * @param {number} pngBytes
 * @param {number} webpBytes
 * @returns {number|null}
 */
function savingsPct(pngBytes, webpBytes) {
  if (!pngBytes) return null;

  return Math.round((1 - webpBytes / pngBytes) * 100);
}

export {
  buildConversionTable,
  findFoundryThumbnails,
  run,
  settingsForProfile,
  sharpOptions
};

// CLI entry point — exécuté seulement si lancé directement
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { scan } = await import("./mediaScanner.mjs");
  const { readManifest, writeManifest } = await import("./manifestStore.mjs");

  const ROOT = process.cwd();
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
WARBOUND — Convert Images

Usage :
  pnpm media:convert:images [--dry-run | --write] [--quality <n>]

Options :
  --dry-run        Inventorie et projette les conversions sans rien écrire (défaut).
  --write          Convertit les PNG en WebP et produit conversion-table.json.
  --quality <n>    Applique la qualité n (0-100) sur tous les profils (override).
  -h, --help       Affiche cette aide.
`);
    process.exit(0);
  }

  const write = args.includes("--write");

  const qualityIdx = args.indexOf("--quality");
  let qualityOverride = null;
  if (qualityIdx !== -1) {
    const parsed = parseInt(args[qualityIdx + 1], 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      console.error("Erreur : --quality attend un entier entre 0 et 100.");
      process.exit(1);
    }
    qualityOverride = parsed;
  }

  if (!write) {
    console.log("\n[DRY-RUN] Aucune écriture sur le disque. Utilise --write pour appliquer.");
  }

  const { manifest, warning } = await readManifest(ROOT);

  if (warning) {
    console.warn(`[AVERTISSEMENT] ${warning}`);
  }

  const { images } = await scan(ROOT);
  const result = await run(images, { write, quality: qualityOverride, manifest });
  const thumbnails = await findFoundryThumbnails(ROOT);
  const table = buildConversionTable(result.webpAssets);

  console.log("");
  console.log("WARBOUND — Convert Images");
  console.log("==========================");
  console.log(`  Mode............................ ${write ? "WRITE" : "DRY-RUN"}`);
  if (qualityOverride != null) {
    console.log(`  Qualité override................ ${qualityOverride}`);
  }
  console.log(`  Images analysées................ ${images.length}`);
  console.log(`  Converties (PNG→WebP)........... ${result.converted}`);
  console.log(`    dont réencodées............... ${result.reencoded}`);
  console.log(`  Écrites sur le disque........... ${result.written}`);
  console.log(`  Ignorées....................... ${result.skipped}`);
  console.log(`  Vignettes Foundry ignorées..... ${thumbnails.length}`);
  console.log(`  PNG conservés (WebP plus lourd). ${result.keptPng.length}`);
  console.log(`  Erreurs......................... ${result.errors.length}`);
  if (result.sizes.probed && result.sizes.pngBytes > 0) {
    const savings = savingsPct(result.sizes.pngBytes, result.sizes.webpBytes);
    const pngMb = (result.sizes.pngBytes / 1024 / 1024).toFixed(1);
    const webpMb = (result.sizes.webpBytes / 1024 / 1024).toFixed(1);
    console.log(`  Économie totale................. ${pngMb} Mo → ${webpMb} Mo (${savings} %)`);
  }
  console.log("");

  console.log("  Motifs de décision :");
  for (const reason of Object.keys(result.byReason)) {
    if (result.byReason[reason] > 0) {
      console.log(`    ${reason.padEnd(16)} ${String(result.byReason[reason]).padStart(4)}`);
    }
  }
  console.log("");

  console.log("  Répartition par profil :");
  for (const profile of Object.keys(result.byProfile).sort()) {
    const stats = result.byProfile[profile];
    console.log(
      `    ${profile.padEnd(14)} ${String(stats.converted).padStart(4)} / ${String(stats.candidates).padStart(4)} converti(s)${stats.kept > 0 ? `, ${stats.kept} conservé(s) en PNG` : ""}`
    );
  }
  console.log("");

  if (result.errors.length > 0) {
    console.error(`ERREURS (${result.errors.length})`);
    for (const { file, error } of result.errors) {
      console.error(`  ✗ ${file}: ${error}`);
    }
    console.error("");
  }

  // Table de conversion : projection en dry-run, résultat appliqué en write.
  const tablePath = path.join(ROOT, "conversion-table.json");
  await fs.writeFile(tablePath, JSON.stringify(table, null, 2), "utf8");
  console.log(
    `Table de conversion : conversion-table.json (${Object.keys(table).length} entrée(s))${write ? "" : " — projection"}`
  );

  // Manifeste : trace des réglages et des sources, pour la fois suivante.
  const mergedManifest = mergeManifest(manifest, result.manifestEntries, {
    module: MODULE_ID,
    pruneTo: new Set(images.map((image) => image.assetPath))
  });

  let manifestPath = null;

  if (write) {
    manifestPath = await writeManifest(ROOT, mergedManifest);
    console.log(`Manifeste : ${path.relative(ROOT, manifestPath)}`);
  }

  // Rapport détaillé : signale notamment les WebP plus lourds que leur PNG.
  const reportsDir = path.join(ROOT, REPORTS_DIR);
  await fs.mkdir(reportsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportsDir, `media-convert-images-${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    mode: write ? "WRITE" : "DRY-RUN",
    module: MODULE_ID,
    qualityOverride,
    scan: {
      images: images.length,
      profiles: Object.fromEntries(
        Object.entries(result.byProfile).map(([profile, stats]) => [
          profile,
          stats.candidates
        ])
      )
    },
    results: {
      converted: result.converted,
      reencoded: result.reencoded,
      written: result.written,
      skipped: result.skipped,
      thumbnailsSkipped: result.thumbnailsSkipped,
      keptPng: result.keptPng,
      keptPngDetails: result.keptPngDetails,
      byProfile: result.byProfile,
      byReason: result.byReason,
      sizes: result.sizes,
      savings: {
        pngBytes: result.sizes.pngBytes,
        webpBytes: result.sizes.webpBytes,
        savedBytes: result.sizes.pngBytes - result.sizes.webpBytes,
        pngMb: toMb(result.sizes.pngBytes),
        webpMb: toMb(result.sizes.webpBytes),
        savedMb: toMb(result.sizes.pngBytes - result.sizes.webpBytes),
        pct: savingsPct(result.sizes.pngBytes, result.sizes.webpBytes)
      },
      perFile: result.outcomes,
      errors: result.errors
    },
    thumbnails: {
      count: thumbnails.length,
      paths: thumbnails
    },
    conversionTable: {
      path: "conversion-table.json",
      entries: Object.keys(table).length
    },
    manifest: {
      path: "conversion-manifest.json",
      entries: Object.keys(mergedManifest.assets).length,
      written: Boolean(write)
    }
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Rapport JSON : ${path.relative(ROOT, reportPath)}`);

  if (result.errors.length > 0) process.exitCode = 1;
}

/**
 * Convertit des octets en mégaoctets, arrondi à une décimale.
 *
 * @param {number} bytes
 * @returns {number}
 */
function toMb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

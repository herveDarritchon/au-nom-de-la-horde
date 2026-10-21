/**
 * Warbound — Convert Images
 *
 * Conversion PNG → WebP via Sharp, en appliquant le profil de qualité
 * correspondant au type d'image (icône, portrait, carte, illustration...).
 *
 * Idempotent : une image dont le WebP existe déjà est ignorée.
 *
 * Garde-fou : si le WebP produit est plus lourd que le PNG source, il est
 * supprimé et le PNG est conservé — l'asset ne sera alors pas migré vers
 * le WebP. Ces conversions sont signalées dans le rapport.
 *
 * Usage : importé par mediaOptimize.mjs, ou exécuté directement via
 * `pnpm media:convert:images`.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  FOUNDRY_THUMBNAIL_PATTERN,
  IMAGE_PROFILES,
  MODULE_ID,
  REPORTS_DIR,
  THUMBNAIL_DIR
} from "./media.config.mjs";

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
 * @param {Array<{assetPath:string,pngPath:string,webpPath:string,profile:string,hasWebp:boolean}>} images
 * @param {boolean} write
 * @returns {Promise<{
 *   converted: number,
 *   written: number,
 *   skipped: number,
 *   keptPng: string[],
 *   keptPngDetails: Array<{assetPath:string,pngBytes:number,webpBytes:number,profile:string}>,
 *   thumbnailsSkipped: number,
 *   byProfile: Record<string, {candidates:number,converted:number,kept:number}>,
 *   webpAssets: Set<string>,
 *   sizes: { probed: boolean, pngBytes: number, webpBytes: number, producedWebpBytes: number },
 *   errors: Array<{file:string,error:string}>
 * }>}
 */
async function run(images, write) {
  const errors = [];
  const keptPng = [];
  const keptPngDetails = [];
  const webpAssets = new Set();
  const byProfile = {};

  let converted = 0;
  let written = 0;
  let skipped = 0;
  let thumbnailsSkipped = 0;
  let pngBytes = 0;
  let webpBytes = 0;
  let producedWebpBytes = 0;

  const sharp = await loadSharp(write);

  for (const image of images) {
    const profile = image.profile ?? "default";

    if (!byProfile[profile]) {
      byProfile[profile] = { candidates: 0, converted: 0, kept: 0 };
    }
    byProfile[profile].candidates += 1;

    // Vignettes Foundry : ni converties, ni supprimées.
    if (FOUNDRY_THUMBNAIL_PATTERN.test(image.assetPath)) {
      thumbnailsSkipped += 1;
      continue;
    }

    if (image.hasWebp) {
      skipped += 1;
      webpAssets.add(image.assetPath);
      continue;
    }

    const settings = IMAGE_PROFILES[profile] ?? IMAGE_PROFILES.default;

    try {
      const pngStat = await fs.stat(image.pngPath);
      pngBytes += pngStat.size;

      if (write) {
        await sharp(image.pngPath).webp(settings).toFile(image.webpPath);

        const webpStat = await fs.stat(image.webpPath);
        producedWebpBytes += webpStat.size;
        written += 1;

        if (webpStat.size >= pngStat.size) {
          await fs.unlink(image.webpPath);
          keptPng.push(image.assetPath);
          keptPngDetails.push({
            assetPath: image.assetPath,
            pngBytes: pngStat.size,
            webpBytes: webpStat.size,
            profile
          });
          byProfile[profile].kept += 1;
          continue;
        }

        converted += 1;
        webpBytes += webpStat.size;
        byProfile[profile].converted += 1;
        webpAssets.add(image.assetPath);
        continue;
      }

      if (!sharp) {
        // Sans Sharp, impossible de mesurer : on reste optimiste et le
        // nettoyage des PNG est neutralisé (`webpAssets` vide).
        converted += 1;
        byProfile[profile].converted += 1;
        continue;
      }

      const buffer = await sharp(image.pngPath).webp(settings).toBuffer();
      producedWebpBytes += buffer.length;

      if (buffer.length < pngStat.size) {
        converted += 1;
        webpBytes += buffer.length;
        byProfile[profile].converted += 1;
        webpAssets.add(image.assetPath);
      } else {
        keptPng.push(image.assetPath);
        keptPngDetails.push({
          assetPath: image.assetPath,
          pngBytes: pngStat.size,
          webpBytes: buffer.length,
          profile
        });
        byProfile[profile].kept += 1;
      }
    } catch (err) {
      errors.push({ file: image.assetPath, error: err.message });
    }
  }

  return {
    converted,
    written,
    skipped,
    keptPng,
    keptPngDetails,
    thumbnailsSkipped,
    byProfile,
    webpAssets,
    sizes: { probed: Boolean(sharp), pngBytes, webpBytes, producedWebpBytes },
    errors
  };
}

export { buildConversionTable, findFoundryThumbnails, run };

// CLI entry point — exécuté seulement si lancé directement
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { scan } = await import("./mediaScanner.mjs");

  const ROOT = process.cwd();
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
WARBOUND — Convert Images

Usage :
  pnpm media:convert:images [--dry-run | --write]

Options :
  --dry-run   Inventorie et projette les conversions sans rien écrire (défaut).
  --write     Convertit les PNG en WebP et produit conversion-table.json.
  -h, --help  Affiche cette aide.
`);
    process.exit(0);
  }

  const write = args.includes("--write");

  if (!write) {
    console.log("\n[DRY-RUN] Aucune écriture sur le disque. Utilise --write pour appliquer.");
  }

  const { images } = await scan(ROOT);
  const result = await run(images, write);
  const thumbnails = await findFoundryThumbnails(ROOT);
  const table = buildConversionTable(result.webpAssets);

  console.log("");
  console.log("WARBOUND — Convert Images");
  console.log("==========================");
  console.log(`  Mode............................ ${write ? "WRITE" : "DRY-RUN"}`);
  console.log(`  Images analysées................ ${images.length}`);
  console.log(`  Converties (PNG→WebP)........... ${result.converted}`);
  console.log(`  Écrites sur le disque........... ${result.written}`);
  console.log(`  Ignorées (WebP déjà présent).... ${result.skipped}`);
  console.log(`  Vignettes Foundry ignorées..... ${thumbnails.length}`);
  console.log(`  PNG conservés (WebP plus lourd). ${result.keptPng.length}`);
  console.log(`  Erreurs......................... ${result.errors.length}`);
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

  // Rapport détaillé : signale notamment les WebP plus lourds que leur PNG.
  const reportsDir = path.join(ROOT, REPORTS_DIR);
  await fs.mkdir(reportsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportsDir, `media-convert-images-${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    mode: write ? "WRITE" : "DRY-RUN",
    module: MODULE_ID,
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
      written: result.written,
      skipped: result.skipped,
      thumbnailsSkipped: result.thumbnailsSkipped,
      keptPng: result.keptPng,
      keptPngDetails: result.keptPngDetails,
      byProfile: result.byProfile,
      sizes: result.sizes,
      errors: result.errors
    },
    thumbnails: {
      count: thumbnails.length,
      paths: thumbnails
    },
    conversionTable: {
      path: "conversion-table.json",
      entries: Object.keys(table).length
    }
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Rapport JSON : ${path.relative(ROOT, reportPath)}`);

  if (result.errors.length > 0) process.exitCode = 1;
}

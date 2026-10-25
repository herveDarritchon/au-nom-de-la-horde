/**
 * Warbound — Convert Videos
 *
 * Conversion MP4/MOV → WebM via FFmpeg (codec VP9, mode constant-quality).
 *
 * Idempotent : si le fichier WebM cible existe déjà et porte la balise de
 * métadonnée du profil courant (`warbound-media-optimize:vp9:<crf>`), la
 * conversion est ignorée. Cela permet de relancer le pipeline sans ré-encoder.
 *
 * Le fichier d'origine n'est pas supprimé : la migration des références YAML
 * (via `migrateRefs.mjs`) et le nettoyage des sources restent une étape
 * séparée.
 *
 * Code retour CLI :
 *   0 = succès
 *   1 = une ou plusieurs erreurs sont survenues
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  buildVideoMarker,
  selectVideoProfile,
  shouldConvertVideo
} from "../src/tools/mediaVideo.mjs";

import { VIDEO_CONFIG, VIDEO_PROFILES } from "./media.config.mjs";

const ROOT = process.cwd();

/**
 * Exécute une commande et capture sa sortie.
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{code:number,stdout:string,stderr:string}>}
 */
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Vérifie que FFmpeg est disponible dans le PATH.
 * @returns {Promise<boolean>}
 */
async function ffmpegAvailable() {
  try {
    const { code } = await runCommand("ffmpeg", ["-version"]);
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Sonde un fichier vidéo : codec, bitrate, durée et balise d'optimisation.
 *
 * La balise est lue depuis les tags du format (conteneur) pour WebM, et
 * depuis les tags du flux vidéo en repli.
 *
 * @param {string} filePath
 * @returns {Promise<{codec:string|null,bitrate:number|null,duration:number|null,marker:string|null}>}
 */
async function probeMedia(filePath) {
  const { code, stdout, stderr } = await runCommand("ffprobe", [
    "-v", "error",
    "-show_entries",
    "stream=codec_name,codec_type:format=bit_rate,duration:format_tags=comment:stream_tags=comment",
    "-of", "json",
    filePath
  ]);

  if (code !== 0) {
    throw new Error(
      `ffprobe a échoué pour ${path.basename(filePath)} : ${stderr.trim()}`
    );
  }

  const parsed = JSON.parse(stdout);
  const videoStream = parsed.streams?.find((s) => s.codec_type === "video") ?? parsed.streams?.[0] ?? {};
  const format = parsed.format ?? {};

  // WebM/Matroska stores metadata tags in uppercase (COMMENT, not comment)
  const fmtTags = format.tags ?? {};
  const streamTags = videoStream.tags ?? {};
  const marker =
    fmtTags.COMMENT ?? fmtTags.comment ??
    streamTags.COMMENT ?? streamTags.comment ?? null;

  return {
    codec: videoStream.codec_name ?? null,
    bitrate: format.bit_rate ? Number(format.bit_rate) : null,
    duration: format.duration ? Number(format.duration) : null,
    marker
  };
}

/**
 * Encode un fichier vidéo vers WebM VP9 en mode constant-quality.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{crf:number,tileColumns:number,threads:number}} profile
 * @param {string} marker  balise de métadonnée à écrire dans le fichier produit
 * @returns {Promise<void>}
 */
async function encodeToWebm(inputPath, outputPath, profile, marker) {
  const args = [
    "-v", "error",
    "-i", inputPath,
    "-map_metadata", "0",
    "-c:v", "libvpx-vp9",
    "-b:v", "0",
    "-crf", String(profile.crf),
    "-tile-columns", String(profile.tileColumns),
    "-threads", String(profile.threads),
    "-metadata", `comment=${marker}`,
    "-y", outputPath
  ];

  const { code, stderr } = await runCommand("ffmpeg", args);

  if (code !== 0) {
    throw new Error(
      `ffmpeg a échoué pour ${path.basename(inputPath)} : ${stderr.trim()}`
    );
  }
}

/**
 * Vérifie que le fichier WebM produit est exploitable.
 * @param {string} tmpPath
 * @param {number|null} sourceDuration  durée de la source (secondes)
 * @returns {Promise<void>}
 */
async function validateOutput(tmpPath, sourceDuration) {
  const produced = await probeMedia(tmpPath);

  if (produced.codec !== "vp9") {
    throw new Error(
      `codec inattendu (${produced.codec} au lieu de vp9)`
    );
  }

  if (
    typeof produced.duration === "number" &&
    typeof sourceDuration === "number" &&
    sourceDuration > 0
  ) {
    const delta = Math.abs(produced.duration - sourceDuration);
    const tolerance = sourceDuration * VIDEO_CONFIG.durationToleranceRatio;

    if (delta > tolerance) {
      throw new Error(
        `durée non conforme (${produced.duration}s au lieu de ${sourceDuration}s)`
      );
    }
  }
}

/**
 * Convertit les fichiers MP4/MOV vers WebM.
 *
 * @param {Array<{assetPath:string,filePath:string}>} videos
 * @param {boolean} write
 * @returns {Promise<{
 *   converted: number,
 *   skipped: number,
 *   savedBytes: number,
 *   webmAssets: Set<string>,
 *   errors: Array<{file:string,error:string}>
 * }>}
 */
async function run(videos, write) {
  const errors = [];
  let converted = 0;
  let skipped = 0;
  let savedBytes = 0;
  const webmAssets = new Set();

  const convertible = videos.filter((v) => shouldConvertVideo(v.filePath));
  const nonConvertible = videos.length - convertible.length;

  if (convertible.length === 0) {
    if (videos.length > 0) {
      console.log(
        `[media:optimize] Aucun fichier vidéo convertible trouvé (${videos.length} fichier(s) ignoré(s) — déjà WebM ou format non pris en charge).`
      );
    } else {
      console.log("[media:optimize] Aucun fichier vidéo trouvé dans le projet.");
    }

    return { converted: 0, skipped: videos.length, savedBytes: 0, webmAssets, errors: [] };
  }

  if (!(await ffmpegAvailable())) {
    throw new Error(
      "FFmpeg introuvable dans le PATH. Installe-le avant d'utiliser l'outil."
    );
  }

  for (const video of convertible) {
    try {
      const profile = selectVideoProfile(video.assetPath, VIDEO_PROFILES);
      const marker = buildVideoMarker(VIDEO_CONFIG.markerPrefix, profile.crf);

      const webmPath = video.filePath.replace(/\.[^.]+$/i, ".webm");

      let existingMarker = null;
      try {
        await fs.access(webmPath);
        const existing = await probeMedia(webmPath);
        existingMarker = existing.marker;
      } catch {
        // WebM cible absent ou illisible — procéder à la conversion
      }

      if (existingMarker === marker) {
        skipped++;
        webmAssets.add(video.assetPath);
        continue;
      }

      if (!write) {
        converted++;
        webmAssets.add(video.assetPath);
        const source = await probeMedia(video.filePath);
        if (typeof source.bitrate === "number" && typeof source.duration === "number") {
          // VP9 atteint typiquement 50 % du bitrate source à qualité équivalente
          const estimatedGain = source.bitrate * 0.5 * source.duration / 8;
          savedBytes += Math.round(estimatedGain);
        }
        continue;
      }

      const source = await probeMedia(video.filePath);
      const tmpPath = `${webmPath}.tmp.webm`;

      await encodeToWebm(video.filePath, tmpPath, profile, marker);

      try {
        await validateOutput(tmpPath, source.duration);

        const [before, after] = await Promise.all([
          fs.stat(video.filePath),
          fs.stat(tmpPath)
        ]);

        await fs.rename(tmpPath, webmPath);

        converted++;
        webmAssets.add(video.assetPath);
        savedBytes += Math.max(0, before.size - after.size);
      } catch (err) {
        await fs.rm(tmpPath, { force: true });
        throw err;
      }
    } catch (err) {
      errors.push({ file: video.assetPath, error: err.message });
    }
  }

  skipped += nonConvertible;

  return { converted, skipped, savedBytes, webmAssets, errors };
}

export { ffmpegAvailable, probeMedia, run };

// ─── CLI entry point ────────────────────────────────────────────────────────

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

if (isMainModule()) {
  const { scan } = await import("./mediaScanner.mjs");

  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const dryRun = !write;

  console.log(
    dryRun
      ? "\nWarbound — Conversion vidéo (dry-run)\n"
      : "\nWarbound — Conversion vidéo\n"
  );

  let scanReport;

  try {
    scanReport = await scan(ROOT);
  } catch (err) {
    console.error(`Erreur de scan : ${err.message}`);
    process.exit(1);
  }

  console.log(`  Fichiers vidéo trouvés.......... ${scanReport.videos.length}`);

  let result;

  try {
    result = await run(scanReport.videos, write);
  } catch (err) {
    console.error(`Erreur : ${err.message}`);
    process.exit(1);
  }

  console.log();
  console.log(
    dryRun
      ? `  Fichiers à convertir............ ${result.converted}`
      : `  Fichiers convertis.............. ${result.converted}`
  );
  console.log(`  Fichiers ignorés................ ${result.skipped}`);

  if (result.savedBytes > 0) {
    console.log(
      dryRun
        ? `  Gain estimé..................... ${formatBytes(result.savedBytes)}`
        : `  Gain réalisé.................... ${formatBytes(result.savedBytes)}`
    );
  }

  if (result.errors.length > 0) {
    console.log();
    console.error(`  Erreurs (${result.errors.length}) :`);

    for (const { file, error } of result.errors) {
      console.error(`    ${file} — ${error}`);
    }

    process.exit(1);
  }

  console.log();
}

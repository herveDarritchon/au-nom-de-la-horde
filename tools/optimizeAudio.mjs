/**
 * Warbound — Optimize Audio
 *
 * Ré-encodage des fichiers OGG via FFmpeg au bitrate configuré.
 *
 * Les fichiers du module sont des Ogg Opus : l'encodeur est choisi d'après le
 * codec détecté par FFprobe (`libopus` en priorité, `opus` natif en repli ;
 * idem pour Vorbis).
 *
 * Idempotent : un fichier déjà optimisé porte une balise de métadonnée
 * `warbound-media-optimize:<bitrate>` et n'est pas ré-encodé. Un fichier
 * dont le bitrate est déjà inférieur ou égal à la cible est également
 * ignoré (le ré-encoder ne ferait qu'augmenter sa taille).
 *
 * Le fichier d'origine n'est remplacé qu'après validation du fichier produit
 * (codec identique, durée conforme) : en cas d'erreur, l'original est intact.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  buildAudioMarker,
  parseBitrate,
  parseEncoders,
  selectAudioProfile,
  selectEncoder,
  shouldOptimizeAudio
} from "../src/tools/mediaAudio.mjs";

import { AUDIO_CONFIG, AUDIO_PROFILES } from "./media.config.mjs";

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
 * @returns {boolean}
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
 * Détecte les encodeurs FFmpeg disponibles.
 * @returns {Promise<Map<string, {experimental: boolean}>>}
 */
async function detectEncoders() {
  const { stdout } = await runCommand("ffmpeg", ["-hide_banner", "-encoders"]);
  return parseEncoders(stdout);
}

/**
 * Sonde un média : codec, bitrate, durée et balise d'optimisation.
 * @param {string} filePath
 * @returns {Promise<{codec:string|null,bitrate:number|null,duration:number|null,marker:string|null}>}
 */
async function probeMedia(filePath) {
  const { code, stdout, stderr } = await runCommand("ffprobe", [
    "-v", "error",
    "-show_entries",
    "stream=codec_name:format=bit_rate,duration:stream_tags=comment",
    "-of", "json",
    filePath
  ]);

  if (code !== 0) {
    throw new Error(
      `ffprobe a échoué pour ${path.basename(filePath)} : ${stderr.trim()}`
    );
  }

  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] ?? {};
  const format = parsed.format ?? {};

  return {
    codec: stream.codec_name ?? null,
    bitrate: format.bit_rate ? Number(format.bit_rate) : null,
    duration: format.duration ? Number(format.duration) : null,
    marker: stream.tags?.comment ?? null
  };
}

/**
 * Ré-encode un fichier audio vers un fichier temporaire.
 * @param {string} bitrate  cible du profil, ex. "128k"
 * @returns {Promise<{tmpPath: string}>}
 */
async function encodeToTemp(inputPath, encoder, marker, bitrate) {
  const tmpPath = `${inputPath}.tmp.ogg`;

  const args = [
    "-v", "error",
    "-i", inputPath,
    "-map_metadata", "0",
    "-c:a", encoder.name
  ];

  if (encoder.experimental) {
    args.push("-strict", "-2");
  }

  args.push(
    "-b:a", bitrate,
    "-metadata", `comment=${marker}`,
    "-y", tmpPath
  );

  const { code, stderr } = await runCommand("ffmpeg", args);

  if (code !== 0) {
    await fs.rm(tmpPath, { force: true });
    throw new Error(
      `ffmpeg a échoué pour ${path.basename(inputPath)} : ${stderr.trim()}`
    );
  }

  return { tmpPath };
}

/**
 * Vérifie que le fichier produit est exploitable.
 * @returns {Promise<void>}
 */
function validateOutput(tmpPath, source) {
  return probeMedia(tmpPath).then((produced) => {
    if (produced.codec !== source.codec) {
      throw new Error(
        `codec inattendu (${produced.codec} au lieu de ${source.codec})`
      );
    }

    if (
      typeof produced.duration === "number" &&
      typeof source.duration === "number" &&
      source.duration > 0
    ) {
      const delta = Math.abs(produced.duration - source.duration);
      const tolerance =
        source.duration * AUDIO_CONFIG.durationToleranceRatio;

      if (delta > tolerance) {
        throw new Error(
          `durée non conforme (${produced.duration}s au lieu de ${source.duration}s)`
        );
      }
    }
  });
}

/**
 * @param {Array<{assetPath:string,filePath:string}>} audioPaths
 * @param {boolean} write
 * @returns {Promise<{
 *   optimized: number,
 *   skipped: number,
 *   savedBytes: number,
 *   errors: Array<{file:string,error:string}>
 * }>}
 */
async function run(audioPaths, write) {
  const errors = [];

  let optimized = 0;
  let skipped = 0;
  let savedBytes = 0;

  if (!write) {
    if (!(await ffmpegAvailable())) {
      throw new Error(
        "FFmpeg introuvable dans le PATH. Installe-le avant d'utiliser l'outil."
      );
    }

    const encoders = await detectEncoders();

    for (const audio of audioPaths) {
      try {
        const profile = selectAudioProfile(audio.assetPath, AUDIO_PROFILES);
        const targetBitrate = parseBitrate(profile.bitrate);
        const source = await probeMedia(audio.filePath);
        const needsOptimization = shouldOptimizeAudio({
          currentBitrate: source.bitrate,
          currentMarker: source.marker,
          targetBitrate,
          targetLabel: profile.bitrate,
          markerPrefix: AUDIO_CONFIG.markerPrefix
        });

        if (!needsOptimization) {
          skipped++;
          continue;
        }

        if (
          !selectEncoder(
            encoders,
            source.codec,
            AUDIO_CONFIG.encoderCandidates[source.codec]
          )
        ) {
          throw new Error(
            `aucun encodeur FFmpeg disponible pour le codec '${source.codec}'`
          );
        }

        optimized++;

        if (
          typeof source.bitrate === "number" &&
          typeof source.duration === "number"
        ) {
          const estimatedBytes =
            Math.max(0, source.bitrate - targetBitrate) *
            source.duration /
            8;

          savedBytes += Math.round(estimatedBytes);
        }
      } catch (err) {
        errors.push({ file: audio.assetPath, error: err.message });
      }
    }

    return { optimized, skipped, savedBytes, errors };
  }

  if (!(await ffmpegAvailable())) {
    throw new Error(
      "FFmpeg introuvable dans le PATH. Installe-le avant d'utiliser --write."
    );
  }

  const encoders = await detectEncoders();

  for (const audio of audioPaths) {
    try {
      const profile = selectAudioProfile(audio.assetPath, AUDIO_PROFILES);
      const targetBitrate = parseBitrate(profile.bitrate);
      const marker = buildAudioMarker(AUDIO_CONFIG.markerPrefix, profile.bitrate);
      const source = await probeMedia(audio.filePath);

      const needsOptimization = shouldOptimizeAudio({
        currentBitrate: source.bitrate,
        currentMarker: source.marker,
        targetBitrate,
        targetLabel: profile.bitrate,
        markerPrefix: AUDIO_CONFIG.markerPrefix
      });

      if (!needsOptimization) {
        skipped++;
        continue;
      }

      const encoder = selectEncoder(
        encoders,
        source.codec,
        AUDIO_CONFIG.encoderCandidates[source.codec]
      );

      if (!encoder) {
        throw new Error(
          `aucun encodeur FFmpeg disponible pour le codec '${source.codec}'`
        );
      }

      const { tmpPath } = await encodeToTemp(audio.filePath, encoder, marker, profile.bitrate);

      try {
        await validateOutput(tmpPath, source);

        const [before, after] = await Promise.all([
          fs.stat(audio.filePath),
          fs.stat(tmpPath)
        ]);

        await fs.rename(tmpPath, audio.filePath);

        optimized++;
        savedBytes += Math.max(0, before.size - after.size);
      } catch (err) {
        await fs.rm(tmpPath, { force: true });
        throw err;
      }
    } catch (err) {
      errors.push({ file: audio.assetPath, error: err.message });
    }
  }

  return { optimized, skipped, savedBytes, errors };
}

export { detectEncoders, ffmpegAvailable, probeMedia, run };

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
      ? "\nWarbound — Optimisation audio (dry-run)\n"
      : "\nWarbound — Optimisation audio\n"
  );

  let scanReport;

  try {
    scanReport = await scan(process.cwd());
  } catch (err) {
    console.error(`Erreur de scan : ${err.message}`);
    process.exit(1);
  }

  console.log(`  Fichiers audio trouvés.......... ${scanReport.audio.length}`);

  let result;

  try {
    result = await run(scanReport.audio, write);
  } catch (err) {
    console.error(`Erreur : ${err.message}`);
    process.exit(1);
  }

  console.log();
  console.log(
    dryRun
      ? `  Fichiers à optimiser............ ${result.optimized}`
      : `  Fichiers optimisés.............. ${result.optimized}`
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

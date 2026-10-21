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
 * le WebP.
 */

import fs from "node:fs/promises";

import { IMAGE_PROFILES } from "./media.config.mjs";

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
 * @param {Array<{assetPath:string,pngPath:string,webpPath:string,profile:string,hasWebp:boolean}>} images
 * @param {boolean} write
 * @returns {Promise<{
 *   converted: number,
 *   written: number,
 *   skipped: number,
 *   keptPng: string[],
 *   webpAssets: Set<string>,
 *   sizes: { probed: boolean, pngBytes: number, webpBytes: number },
 *   errors: Array<{file:string,error:string}>
 * }>}
 */
async function run(images, write) {
  const errors = [];
  const keptPng = [];
  const webpAssets = new Set();

  let converted = 0;
  let written = 0;
  let skipped = 0;
  let pngBytes = 0;
  let webpBytes = 0;

  const sharp = await loadSharp(write);

  for (const image of images) {
    if (image.hasWebp) {
      skipped++;
      webpAssets.add(image.assetPath);
      continue;
    }

    const profile = IMAGE_PROFILES[image.profile] ?? IMAGE_PROFILES.default;

    try {
      const pngStat = await fs.stat(image.pngPath);
      pngBytes += pngStat.size;

      if (write) {
        await sharp(image.pngPath).webp(profile).toFile(image.webpPath);

        const webpStat = await fs.stat(image.webpPath);
        webpBytes += webpStat.size;
        written++;

        if (webpStat.size >= pngStat.size) {
          await fs.unlink(image.webpPath);
          keptPng.push(image.assetPath);
          continue;
        }

        converted++;
        webpAssets.add(image.assetPath);
        continue;
      }

      if (!sharp) {
        // Sans Sharp, impossible de mesurer : on reste optimiste et le
        // nettoyage des PNG est neutralisé (`webpAssets` vide).
        converted++;
        continue;
      }

      const buffer = await sharp(image.pngPath).webp(profile).toBuffer();
      webpBytes += buffer.length;

      if (buffer.length < pngStat.size) {
        converted++;
        webpAssets.add(image.assetPath);
      } else {
        keptPng.push(image.assetPath);
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
    webpAssets,
    sizes: { probed: Boolean(sharp), pngBytes, webpBytes },
    errors
  };
}

export { run };

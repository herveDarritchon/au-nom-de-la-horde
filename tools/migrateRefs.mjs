/**
 * Warbound — Migrate Refs
 *
 * Réécriture des références `.png` vers `.webp` dans les fichiers sources du
 * module : compendiums YAML, feuilles de style et scripts.
 *
 * Les références ne vivent pas uniquement dans les compendiums : `styles/` et
 * `scripts/` référencent eux aussi des PNG du module. Les migrer est
 * indispensable, sinon la suppression des PNG originaux casserait le rendu.
 *
 * Idempotent : un contenu déjà entièrement en `.webp` n'est pas réécrit.
 */

import fs from "node:fs/promises";

import { rewriteAssetRefs } from "../src/tools/mediaPaths.mjs";
import { MODULE_ID } from "./media.config.mjs";

/**
 * @param {Array<{filePath:string,fileDir:string,relativePath:string}>} refs
 * @param {boolean} write
 * @param {{ root: string, migratableAssets?: Set<string> }} options
 * @returns {Promise<{
 *   migrated: number,
 *   skipped: number,
 *   replacements: number,
 *   files: Array<{file:string,replacements:number}>,
 *   errors: Array<{file:string,error:string}>
 * }>}
 */
async function run(refs, write, options = {}) {
  const { root, migratableAssets } = options;

  const errors = [];
  const files = [];

  let migrated = 0;
  let skipped = 0;
  let replacements = 0;

  for (const ref of refs) {
    try {
      const content = await fs.readFile(ref.filePath, "utf8");

      const { updated, count } = rewriteAssetRefs(content, {
        root,
        fileDir: ref.fileDir,
        moduleId: MODULE_ID,
        isKnownAsset: migratableAssets
          ? (assetPath) => migratableAssets.has(assetPath)
          : undefined
      });

      if (count === 0) {
        skipped++;
        continue;
      }

      if (write) {
        await fs.writeFile(ref.filePath, updated, "utf8");
      }

      migrated++;
      replacements += count;
      files.push({ file: ref.relativePath ?? ref.filePath, replacements: count });
    } catch (err) {
      errors.push({ file: ref.filePath, error: err.message });
    }
  }

  return { migrated, skipped, replacements, files, errors };
}

export { run };

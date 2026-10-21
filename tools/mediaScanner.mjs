/**
 * Warbound — Media Scanner
 *
 * Inventaire des médias et des références du module :
 * - PNG de `assets/` (avec leur profil de qualité et la présence d'un WebP)
 * - OGG/OGA de `assets/` (candidats à l'optimisation audio)
 * - fichiers sources contenant des références vers des assets PNG
 *
 * Aucun fichier n'est modifié : le scanner ne fait que lire.
 *
 * Usage : importé par mediaOptimize.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  collectPngAssetRefs,
  resolveImageProfile,
  toPosix
} from "../src/tools/mediaPaths.mjs";

import {
  ASSETS_DIR,
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  IMAGE_PROFILE_RULES,
  MODULE_ID,
  SOURCE_EXCLUDE_PATTERNS,
  SOURCE_TARGETS,
  VIDEO_EXTENSIONS,
  WALK_EXCLUDE_DIRS
} from "./media.config.mjs";

const ROOT = process.cwd();

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parcourt une arborescence et retourne les fichiers dont le nom termine par
 * l'une des extensions données. Les répertoires exclus sont ignorés.
 *
 * @param {string} dir
 * @param {string[]} extensions
 * @returns {Promise<string[]>}
 */
async function walkFiles(dir, extensions = []) {
  const results = [];

  let entries;

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (WALK_EXCLUDE_DIRS.includes(entry.name)) continue;
      results.push(...await walkFiles(path.join(dir, entry.name), extensions));
      continue;
    }

    if (!entry.isFile()) continue;

    if (
      extensions.length === 0 ||
      extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))
    ) {
      results.push(path.join(dir, entry.name));
    }
  }

  return results;
}

function matchesExtension(filePath, extensions) {
  const lower = filePath.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

function isExcludedSource(filePath) {
  return SOURCE_EXCLUDE_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * Liste les fichiers sources susceptibles de contenir des références.
 * @param {string} root
 * @returns {Promise<Array<{filePath: string, fileDir: string, relativePath: string}>>}
 */
async function collectSourceFiles(root) {
  const sources = [];

  for (const target of SOURCE_TARGETS) {
    if (target.files) {
      for (const relativePath of target.files) {
        const filePath = path.join(root, relativePath);

        if (await fileExists(filePath)) {
          sources.push(toSource(root, filePath));
        }
      }
      continue;
    }

    const dir = path.join(root, target.dir);

    for (const filePath of await walkFiles(dir, target.extensions)) {
      if (isExcludedSource(filePath)) continue;
      sources.push(toSource(root, filePath));
    }
  }

  return sources;
}

function toSource(root, filePath) {
  return {
    filePath,
    fileDir: path.dirname(filePath),
    relativePath: toPosix(path.relative(root, filePath))
  };
}

/**
 * Scanne le projet et retourne l'inventaire des médias candidats.
 *
 * @param {string} [root] racine du dépôt (par défaut : cwd)
 * @returns {Promise<{
 *   images: Array<{assetPath:string,pngPath:string,webpPath:string,profile:string,hasWebp:boolean}>,
 *   audio: Array<{assetPath:string,filePath:string}>,
 *   videos: Array<{assetPath:string,filePath:string}>,
 *   sources: Array<{filePath:string,fileDir:string,relativePath:string}>,
 *   refs: Array<{filePath:string,fileDir:string,relativePath:string,assets:string[]}>,
 *   assets: Set<string>
 * }>}
 */
async function scan(root = ROOT) {
  const assetsDir = path.join(root, ASSETS_DIR);
  const assetFiles = await walkFiles(assetsDir);
  const assets = new Set(assetFiles.map((file) => toPosix(path.relative(root, file))));

  const images = assetFiles
    .filter((file) => matchesExtension(file, IMAGE_EXTENSIONS))
    .map((pngPath) => {
      const assetPath = toPosix(path.relative(root, pngPath));
      const webpAssetPath = assetPath.replace(/\.png$/i, ".webp");

      return {
        assetPath,
        pngPath,
        webpPath: pngPath.replace(/\.png$/i, ".webp"),
        profile: resolveImageProfile(assetPath, IMAGE_PROFILE_RULES),
        hasWebp: assets.has(webpAssetPath)
      };
    });

  const audio = assetFiles
    .filter((file) => matchesExtension(file, AUDIO_EXTENSIONS))
    .map((filePath) => ({
      assetPath: toPosix(path.relative(root, filePath)),
      filePath
    }));

  const videos = assetFiles
    .filter((file) => matchesExtension(file, VIDEO_EXTENSIONS))
    .map((filePath) => ({
      assetPath: toPosix(path.relative(root, filePath)),
      filePath
    }));

  const sources = await collectSourceFiles(root);
  const refs = [];

  for (const source of sources) {
    const content = await fs.readFile(source.filePath, "utf8");
    const referenced = collectPngAssetRefs(content, {
      root,
      fileDir: source.fileDir,
      moduleId: MODULE_ID
    });

    const known = [...referenced].filter((asset) => assets.has(asset));

    if (known.length > 0) {
      refs.push({ ...source, assets: known });
    }
  }

  return { images, audio, videos, sources, refs, assets };
}

export { collectSourceFiles, scan, walkFiles };

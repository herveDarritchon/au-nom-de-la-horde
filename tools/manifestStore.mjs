/**
 * Lecture et écriture du manifeste de conversion PNG → WebP.
 *
 * Le manifeste est un artefact local : il décrit l'état de la copie de
 * travail (quels WebP ont été produits, avec quels réglages, depuis quelle
 * source) et n'a pas vocation à être versionné. Il est donc gitignoré, comme
 * `conversion-table.json`.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { MANIFEST_VERSION } from "../src/tools/conversionManifest.mjs";

/**
 * Nom du fichier de manifeste, à la racine du dépôt.
 */
export const MANIFEST_FILENAME = "conversion-manifest.json";

/**
 * Lit le manifeste du dépôt.
 *
 * Un manifeste absent ou illisible n'est pas une erreur : l'outil repart alors
 * d'un état vide et se comporte de façon conservatrice (un WebP existant sans
 * trace est laissé intact).
 *
 * @param {string} root racine du dépôt
 * @returns {Promise<{manifest: object|null, warning: string|null}>}
 */
async function readManifest(root) {
  const manifestPath = path.join(root, MANIFEST_FILENAME);

  let raw;

  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { manifest: null, warning: null };

    return { manifest: null, warning: `Manifeste illisible (${err.message})` };
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || typeof parsed.assets !== "object") {
      return { manifest: null, warning: "Manifeste illisible (structure inattendue)" };
    }

    if (parsed.version !== MANIFEST_VERSION) {
      return {
        manifest: null,
        warning: `Manifeste ignoré (version ${parsed.version} != ${MANIFEST_VERSION})`
      };
    }

    return { manifest: parsed, warning: null };
  } catch (err) {
    return { manifest: null, warning: `Manifeste illisible (${err.message})` };
  }
}

/**
 * Écrit le manifeste du dépôt.
 *
 * @param {string} root racine du dépôt
 * @param {object} manifest manifeste à écrire
 * @returns {Promise<string>} chemin du fichier écrit
 */
async function writeManifest(root, manifest) {
  const manifestPath = path.join(root, MANIFEST_FILENAME);

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return manifestPath;
}

/**
 * Calcule l'empreinte d'un fichier source.
 *
 * Un SHA-1 tronqué suffit : il ne sert qu'à détecter une source modifiée
 * entre deux exécutions, pas à garantir une intégrité cryptographique.
 *
 * @param {string} filePath chemin du fichier
 * @returns {Promise<string|null>} empreinte hexadécimale, `null` si le fichier est illisible
 */
async function hashFile(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash("sha1").update(content).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

export { hashFile, readManifest, writeManifest };

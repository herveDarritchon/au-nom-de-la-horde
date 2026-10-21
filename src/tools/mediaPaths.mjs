/**
 * Fonctions pures pour la manipulation des chemins médias et des références
 * vers les assets du module.
 *
 * Aucune E/S : le dépôt, le répertoire du fichier source et le prédicat
 * d'existence sont injectés par l'appelant. Les tests peuvent donc exercer
 * tous les cas (YAML, CSS, JS, références encodées en pourcentage) sans
 * toucher au disque.
 */

import path from "node:path";

/**
 * Motif de détection d'une référence PNG dans un contenu texte.
 *
 * Le jeu de caractères exclut les espaces et les guillemets : une référence
 * contenant un espace doit être encodée en pourcentage (`%20`), comme c'est
 * le cas dans les YAML du module. Les interpolations `${...}` sont admises
 * pour supporter les templates littéraux JavaScript
 * (`modules/${MODULE_ID}/assets/...`).
 */
const PNG_REF_PATTERN =
  /(?:[A-Za-z0-9_@%+~$:.\-/]|\{[A-Za-z0-9_]*\})+\.png/gi;

/** Capture le segment de module dans `modules/<segment>/...`. */
const MODULE_REF_PATTERN = /(?:^|\/)modules\/([^/]+)\//;

/** Une référence relative explicite (`./...` ou `../...`). */
const RELATIVE_REF_PATTERN = /^\.\.?[\\/]/;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

/**
 * Décode une référence percent-encodée sans lever d'exception.
 * @param {string} value
 * @returns {string}
 */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Convertit un chemin PNG en son équivalent WebP.
 * @param {string} filePath
 * @returns {string}
 */
function pngToWebpPath(filePath) {
  return filePath.replace(/\.png$/i, ".webp");
}

/**
 * Résout une référence brute vers un chemin d'asset du module.
 *
 * Le chemin retourné est relatif au dépôt et au format POSIX
 * (`assets/images/hero.png`). Il désigne toujours le fichier PNG : c'est à
 * l'appelant de décider si la référence doit basculer en `.webp`.
 *
 * Sont acceptées :
 * - `modules/<moduleId>/assets/...` (YAML, JS)
 * - `modules/${MODULE_ID}/assets/...` (template littéral JS)
 * - `assets/...` (chemin relatif à la racine du dépôt)
 * - `../assets/...` (chemin relatif au fichier source)
 *
 * Sont rejetées : les URLs distantes, les data-URI, les références `worlds/`,
 * `systems/` et les modules tiers.
 *
 * @param {string} rawRef
 * @param {{ root: string, fileDir: string, moduleId: string }} context
 * @returns {string|null}
 */
function resolveAssetRef(rawRef, context) {
  const { root, fileDir, moduleId } = context;
  const decoded = safeDecode(rawRef);

  if (!decoded) return null;
  if (decoded.includes("://")) return null;
  if (decoded.startsWith("data:")) return null;

  const moduleMatch = MODULE_REF_PATTERN.exec(decoded);

  if (moduleMatch) {
    const segment = moduleMatch[1];
    const isOwnModule =
      segment === moduleId ||
      (segment.startsWith("${") && segment.includes("MODULE_ID"));

    if (!isOwnModule) return null;

    const afterModule = decoded.slice(
      moduleMatch.index + moduleMatch[0].length
    );

    return afterModule.startsWith("assets/") ? afterModule : null;
  }

  if (decoded.startsWith("assets/")) return decoded;

  if (!RELATIVE_REF_PATTERN.test(decoded)) return null;
  if (!decoded.includes("assets/")) return null;

  const absolute = path.resolve(fileDir, decoded);
  const assetsRoot = path.resolve(root, "assets");

  if (absolute !== assetsRoot && !absolute.startsWith(assetsRoot + path.sep)) {
    return null;
  }

  return toPosix(path.relative(root, absolute));
}

/**
 * Réécrit les références PNG d'assets du module en WebP.
 *
 * @param {string} content
 * @param {{
 *   root: string,
 *   fileDir: string,
 *   moduleId: string,
 *   isKnownAsset?: (assetPath: string) => boolean
 * }} options
 * @returns {{ updated: string, count: number, rewritten: Array<{from: string, to: string, assetPath: string}> }}
 */
function rewriteAssetRefs(content, options) {
  const { root, fileDir, moduleId, isKnownAsset } = options;
  const regex = new RegExp(PNG_REF_PATTERN.source, "gi");

  let count = 0;
  const rewritten = [];

  const updated = content.replace(regex, (raw) => {
    const assetPath = resolveAssetRef(raw, { root, fileDir, moduleId });

    if (!assetPath) return raw;
    if (typeof isKnownAsset === "function" && !isKnownAsset(assetPath)) {
      return raw;
    }

    const next = raw.replace(/\.png$/i, ".webp");

    if (next === raw) return raw;

    count += 1;
    rewritten.push({ from: raw, to: next, assetPath });

    return next;
  });

  return { updated, count, rewritten };
}

/**
 * Liste les assets PNG encore référencés dans un contenu.
 * @param {string} content
 * @param {{ root: string, fileDir: string, moduleId: string }} context
 * @returns {Set<string>}
 */
function collectPngAssetRefs(content, context) {
  const regex = new RegExp(PNG_REF_PATTERN.source, "gi");
  const found = new Set();

  for (const match of content.matchAll(regex)) {
    const assetPath = resolveAssetRef(match[0], context);

    if (assetPath) found.add(assetPath);
  }

  return found;
}

/**
 * Détermine le profil de qualité d'un asset image.
 * @param {string} assetPath  chemin POSIX relatif au dépôt (`assets/...`)
 * @param {Array<{profile: string, match: RegExp}>} rules
 * @returns {string} identifiant de profil
 */
function resolveImageProfile(assetPath, rules) {
  for (const rule of rules) {
    if (rule.match.test(assetPath)) return rule.profile;
  }

  return "default";
}

export {
  PNG_REF_PATTERN,
  collectPngAssetRefs,
  escapeRegex,
  pngToWebpPath,
  resolveAssetRef,
  resolveImageProfile,
  rewriteAssetRefs,
  toPosix
};

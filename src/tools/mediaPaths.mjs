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
 * Parties d'un chemin de référence, hors extension.
 *
 * Le jeu de caractères exclut les espaces et les guillemets : une référence
 * contenant un espace doit être encodée en pourcentage (`%20`), comme c'est
 * le cas dans les YAML du module. Les accolades admettent les interpolations
 * `${...}` des templates littéraux JavaScript
 * (`modules/${MODULE_ID}/assets/...`).
 *
 * L'alternative sur les accolades est regroupée dans la classe de caractères
 * plutôt qu'en seconde branche d'alternance : une alternance de deux motifs
 * de longueur variable sur un seul caractère ferait démarrer la
 * correspondance au milieu du chemin.
 */
const REF_TOKEN = "[A-Za-z0-9_@%+~$:.{}/\\-]+";

/**
 * Effort d'encodage par défaut, aligné sur la valeur de `sharp.webp()` et sur
 * `DEFAULT_WEBP_EFFORT` de `tools/media.config.mjs`. Sert de repli pour les
 * listes de profils qui ne préciseraient pas d'effort.
 */
const DEFAULT_EFFORT = 4;

/**
 * Un caractère de mot ne peut pas suivre l'extension : `hero.pngx` ne doit
 * pas être lu comme une référence à `hero.png`.
 *
 * La borne reste volontairement laxiste sur la ponctuation, pour ne pas rater
 * une référence suivie d'un point de fin de phrase (`assets/hero.png.`).
 */
const REF_TOKEN_BOUNDARY = "(?![\\w%+])";

/** Capture le segment de module dans `modules/<segment>/...`. */
const MODULE_REF_PATTERN = /(?:^|\/)modules\/([^/]+)\//;

/** Une référence relative explicite (`./...` ou `../...`). */
const RELATIVE_REF_PATTERN = /^\.\.?[\\/]/;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Construit le motif de détection de références pour une liste d'extensions.
 *
 * Exemples d'extensions acceptées : `.png`, `.ogg`, `.webp`.
 *
 * @param {string[]} extensions
 * @returns {RegExp}
 */
function buildAssetRefPattern(extensions) {
  const alternatives = extensions.map(escapeRegex).join("|");

  return new RegExp(`${REF_TOKEN}(?:${alternatives})${REF_TOKEN_BOUNDARY}`, "gi");
}

/**
 * Motif de détection d'une référence PNG dans un contenu texte.
 *
 * @type {RegExp}
 */
const PNG_REF_PATTERN = buildAssetRefPattern([".png"]);

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
 * Réécrit les références d'assets du module vers une extension cible.
 *
 * @param {string} content
 * @param {{
 *   root: string,
 *   fileDir: string,
 *   moduleId: string,
 *   extensions?: string[],
 *   targetExtension?: string | ((rawRef: string) => string),
 *   isKnownAsset?: (assetPath: string) => boolean
 * }} options
 * @returns {{ updated: string, count: number, rewritten: Array<{from: string, to: string, assetPath: string}> }}
 */
function rewriteAssetRefs(content, options) {
  const {
    root,
    fileDir,
    moduleId,
    extensions = [".png"],
    targetExtension = ".webp",
    isKnownAsset
  } = options;
  const regex = buildAssetRefPattern(extensions);
  const extensionPattern = new RegExp(
    `(?:${extensions.map(escapeRegex).join("|")})$`,
    "i"
  );

  let count = 0;
  const rewritten = [];

  const updated = content.replace(regex, (raw) => {
    const assetPath = resolveAssetRef(raw, { root, fileDir, moduleId });

    if (!assetPath) return raw;
    if (typeof isKnownAsset === "function" && !isKnownAsset(assetPath)) {
      return raw;
    }

    const replacement = typeof targetExtension === "function"
      ? targetExtension(raw)
      : targetExtension;
    const next = raw.replace(extensionPattern, replacement);

    if (next === raw) return raw;

    count += 1;
    rewritten.push({ from: raw, to: next, assetPath });

    return next;
  });

  return { updated, count, rewritten };
}

/**
 * Liste les assets correspondant aux extensions données et encore référencés
 * dans un contenu (YAML, CSS, JS...).
 *
 * @param {string} content
 * @param {{ root: string, fileDir: string, moduleId: string }} context
 * @param {string[]} extensions extensions à rechercher (`.png`, `.ogg`...)
 * @returns {Set<string>} chemins d'assets relatifs à la racine du dépôt
 */
function collectAssetRefs(content, context, extensions) {
  const regex = buildAssetRefPattern(extensions);
  const found = new Set();

  for (const match of content.matchAll(regex)) {
    const raw = match[0];
    const assetPath = resolveAssetRef(raw, context);

    if (assetPath) found.add(assetPath);
  }

  return found;
}

/**
 * Liste les assets PNG encore référencés dans un contenu.
 * @param {string} content
 * @param {{ root: string, fileDir: string, moduleId: string }} context
 * @returns {Set<string>}
 */
function collectPngAssetRefs(content, context) {
  return collectAssetRefs(content, context, [".png"]);
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

/**
 * Détermine le profil et les réglages d'encodage effectifs d'un asset image.
 *
 * L'entrée « default » sert de repli : elle porte les réglages appliqués à
 * tout asset qui ne correspond à aucun motif plus précis.
 *
 * @param {string} assetPath  chemin POSIX relatif au dépôt (`assets/...`)
 * @param {Array<{profile: string, match: RegExp, quality?: number|null, lossless?: boolean, effort?: number}>} profiles
 * @returns {{profile: string, quality: number|null, lossless: boolean, effort: number}}
 */
function resolveImageSettings(assetPath, profiles) {
  const matched = profiles.find((entry) => entry.match.test(assetPath))
    ?? profiles.find((entry) => entry.profile === "default");

  if (!matched) {
    throw new Error(`Aucun profil de compression applicable à « ${assetPath} »`);
  }

  return {
    profile: matched.profile,
    quality: matched.quality ?? null,
    lossless: Boolean(matched.lossless),
    effort: matched.effort ?? DEFAULT_EFFORT
  };
}

/**
 * Applique un override de qualité à des réglages d'encodage.
 *
 * @param {{quality: number|null, lossless: boolean, effort: number}} settings
 * @param {number|null} quality  qualité à forcer, ou `null` pour conserver celle du profil
 * @returns {{quality: number|null, lossless: boolean, effort: number}}
 */
function withQualityOverride(settings, quality) {
  if (quality == null) return { ...settings };

  return { ...settings, quality };
}

export {
  PNG_REF_PATTERN,
  buildAssetRefPattern,
  collectAssetRefs,
  collectPngAssetRefs,
  escapeRegex,
  pngToWebpPath,
  resolveAssetRef,
  resolveImageProfile,
  resolveImageSettings,
  rewriteAssetRefs,
  toPosix,
  withQualityOverride
};

/**
 * Logique pure du manifeste de conversion PNG → WebP.
 *
 * Le manifeste répond à une question que le disque ne sait pas trancher : à
 * quel profil un WebP existant a été produit, et à partir de quelle source ?
 * Sans cette trace, tout WebP présent est ignoré et un changement de profil
 * ne réencode rien.
 *
 * Aucune E/S : le manifeste est manipulé comme une donnée.
 */

import crypto from "node:crypto";

/**
 * Version du format de manifeste. Incrémentée si la structure change.
 */
const MANIFEST_VERSION = 1;

/**
 * Effort d'encodage par défaut, aligné sur `sharp.webp()` et sur
 * `DEFAULT_WEBP_EFFORT` de `tools/media.config.mjs`.
 */
const DEFAULT_EFFORT = 4;

/**
 * Motifs de décision, reported par fichier dans le rapport.
 *
 * - `CONVERTED` : un WebP neuf a été écrit ;
 * - `REENCODED` : un WebP existant a été remplacé (réglages ou source changés) ;
 * - `SKIP_LARGER` : le WebP produit est plus lourd que le PNG, le PNG est conservé ;
 * - `SKIP_EXISTING` : un WebP existait déjà et n'a pas été produit par cet outil ;
 * - `SKIP_OPTIMIZED` : le WebP existant a été produit aux mêmes réglages et
 *   depuis la même source, il est donc laissé intact ;
 * - `SKIP_THUMBNAIL` : vignette de scène générée par Foundry.
 */
const SKIP_REASONS = {
  CONVERTED: "CONVERTED",
  REENCODED: "REENCODED",
  SKIP_LARGER: "SKIP_LARGER",
  SKIP_EXISTING: "SKIP_EXISTING",
  SKIP_OPTIMIZED: "SKIP_OPTIMIZED",
  SKIP_THUMBNAIL: "SKIP_THUMBNAIL"
};

/**
 * Signature stable des réglages d'encodage.
 *
 * Deux exécutions produisent la même signature si et seulement si elles
 * encodent de la même façon : c'est la clé de comparaison entre le profil
 * configuré et le profil ayant produit un WebP existant.
 *
 * @param {{profile: string, quality: number|null, lossless: boolean, effort: number}} settings
 * @returns {string}
 */
function settingsSignature(settings) {
  return [
    settings.profile,
    settings.quality ?? "q-",
    settings.lossless ? "lossless" : "lossy",
    `e${settings.effort ?? DEFAULT_EFFORT}`
  ].join(":");
}

/**
 * Normalise des réglages d'encodage en objet stable et sérialisable.
 *
 * @param {{profile: string, quality?: number|null, lossless?: boolean, effort?: number}} settings
 * @returns {{profile: string, quality: number|null, lossless: boolean, effort: number}}
 */
function normalizeSettings(settings) {
  return {
    profile: settings.profile,
    quality: settings.quality ?? null,
    lossless: Boolean(settings.lossless),
    effort: settings.effort ?? DEFAULT_EFFORT
  };
}

/**
 * Construit l'entrée de manifeste d'un asset traité.
 *
 * @param {{
 *   assetPath: string,
 *   settings: {profile: string, quality?: number|null, lossless?: boolean, effort?: number},
 *   sourceHash: string|null,
 *   pngBytes: number,
 *   webpBytes: number,
 *   reason: string
 * }} params
 * @returns {{
 *   profile: string,
 *   settings: {profile: string, quality: number|null, lossless: boolean, effort: number},
 *   signature: string,
 *   sourceHash: string|null,
 *   pngBytes: number,
 *   webpBytes: number,
 *   reason: string,
 *   convertedAt: string
 * }}
 */
function buildManifestEntry({ assetPath, settings, sourceHash, pngBytes, webpBytes, reason }) {
  const normalized = normalizeSettings(settings);

  return {
    profile: normalized.profile,
    settings: normalized,
    signature: settingsSignature(normalized),
    sourceHash: sourceHash ?? null,
    pngBytes,
    webpBytes,
    reason,
    assetPath,
    convertedAt: new Date().toISOString()
  };
}

/**
 * Indique si un WebP existant est à jour au regard des réglages et de la source.
 *
 * @param {object|null} entry entrée de manifeste de l'asset, `null` si absent
 * @param {{profile: string, quality?: number|null, lossless?: boolean, effort?: number}} settings
 * @param {string|null} sourceHash empreinte de la source courante
 * @returns {boolean}
 */
function isUpToDate(entry, settings, sourceHash) {
  if (!entry) return false;

  const signature = settingsSignature(normalizeSettings(settings));

  if (entry.signature !== signature) return false;

  // Sans empreinte de source, on ne peut pas conclure : on considère que
  // l'asset est à jour pour ne pas réencoder à l'aveugle.
  if (!entry.sourceHash || !sourceHash) return true;

  return entry.sourceHash === sourceHash;
}

/**
 * Calcule l'empreinte d'un contenu source.
 *
 * Un SHA-1 tronqué suffit : il ne sert qu'à détecter une source modifiée
 * entre deux exécutions, pas à garantir une intégrité cryptographique.
 *
 * @param {Buffer} content contenu du fichier source
 * @returns {string} empreinte hexadécimale
 */
function hashBuffer(content) {
  return crypto.createHash("sha1").update(content).digest("hex").slice(0, 16);
}

/**
 * Fusionne des entrées de manifeste dans un manifeste complet.
 *
 * Les entrées absentes d'un manifeste précédent sont conservées, sauf si
 * `pruneTo` est fourni : dans ce cas, seules les entrées dont l'asset est
 * encore présent sont conservées.
 *
 * @param {object|null} previous manifeste précédent
 * @param {object[]} entries entrées à fusionner
 * @param {{module?: string, generatedAt?: string, pruneTo?: Set<string>}} [meta]
 * @returns {{version: number, module: string, generatedAt: string, assets: Record<string, object>}}
 */
function mergeManifest(previous, entries, meta = {}) {
  const pruneTo = meta.pruneTo;
  const assets = {};

  for (const [assetPath, entry] of Object.entries(previous?.assets ?? {})) {
    if (pruneTo && !pruneTo.has(assetPath)) continue;
    assets[assetPath] = entry;
  }

  for (const entry of entries) {
    if (!entry?.assetPath) continue;
    assets[entry.assetPath] = entry;
  }

  return {
    version: MANIFEST_VERSION,
    module: meta.module ?? previous?.module ?? "warbound-campaign-content",
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    assets
  };
}

export {
  DEFAULT_EFFORT,
  MANIFEST_VERSION,
  SKIP_REASONS,
  buildManifestEntry,
  hashBuffer,
  isUpToDate,
  mergeManifest,
  normalizeSettings,
  settingsSignature
};

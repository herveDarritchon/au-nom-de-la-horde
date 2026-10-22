/**
 * Fonctions pures pour l'optimisation audio via FFmpeg.
 *
 * Aucune E/S : l'exécution de FFmpeg/FFprobe et les choix d'encodeur sont
 * résolus par l'appelant. Ces fonctions encapsulent les règles de décision
 * (choix de l'encodeur, idempotence) afin de les tester sans FFmpeg.
 */

/** Multiplicateurs utilisés par FFmpeg pour les suffixes de bitrate. */
const BITRATE_UNITS = {
  k: 1000,
  m: 1000000,
  g: 1000000000
};

/**
 * Convertit un bitrate FFmpeg (`"96k"`) en bits par seconde.
 * @param {string|number} value
 * @returns {number|null}
 */
function parseBitrate(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  const match = /^(\d+(?:\.\d+)?)\s*([kmg])?$/i.exec(String(value).trim());

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();

  return unit ? Math.round(amount * BITRATE_UNITS[unit]) : Math.round(amount);
}

/**
 * Analyse la sortie de `ffmpeg -encoders`.
 *
 * @param {string} output
 * @returns {Map<string, { experimental: boolean }>}
 */
function parseEncoders(output) {
  const encoders = new Map();

  for (const line of String(output).split("\n")) {
    const match = /^\s*([A-Z.]{6})\s+([A-Za-z0-9_]+)\s/.exec(line);

    if (!match) continue;

    encoders.set(match[2], { experimental: match[1].includes("X") });
  }

  return encoders;
}

/**
 * Choisit le premier encodeur disponible pour un codec donné.
 *
 * L'ordre de préférence est fourni par l'appelant (`libopus` avant `opus`,
 * `libvorbis` avant `vorbis`). Les encodeurs natifs FFmpeg sont marqués
 * « expérimentaux » et requièrent `-strict -2`.
 *
 * @param {Map<string, { experimental: boolean }>} encoders
 * @param {string} codec
 * @param {string[]} candidates
 * @returns {{ name: string, experimental: boolean }|null}
 */
function selectEncoder(encoders, codec, candidates) {
  for (const candidate of candidates ?? []) {
    const entry = encoders.get(candidate);

    if (entry) return { name: candidate, experimental: entry.experimental };
  }

  return null;
}

/**
 * Construit la balise de métadonnée marquant un fichier déjà optimisé.
 * @param {string} markerPrefix
 * @param {string} targetLabel  bitrate cible tel qu'écrit dans la config
 * @returns {string}
 */
function buildAudioMarker(markerPrefix, targetLabel) {
  return `${markerPrefix}:${targetLabel}`;
}

/**
 * Décide si un fichier audio doit être ré-encodé.
 *
 * Un fichier n'est ré-encodé que si :
 * - il ne porte pas déjà la balise de la cible courante, et
 * - son bitrate actuel dépasse la cible (ré-encoder un fichier déjà plus
 *   efficace ne ferait qu'augmenter sa taille).
 *
 * @param {{
 *   currentBitrate: number|null,
 *   currentMarker: string|null,
 *   targetBitrate: number,
 *   targetLabel: string,
 *   markerPrefix: string
 * }} state
 * @returns {boolean}
 */
function shouldOptimizeAudio(state) {
  const {
    currentBitrate,
    currentMarker,
    targetBitrate,
    targetLabel,
    markerPrefix
  } = state;

  if (currentMarker === buildAudioMarker(markerPrefix, targetLabel)) {
    return false;
  }

  if (
    typeof currentBitrate === "number" &&
    currentBitrate <= targetBitrate
  ) {
    return false;
  }

  return true;
}

/**
 * Sélectionne le profil audio correspondant à un chemin asset.
 *
 * Itère les profils dans l'ordre ; retourne le premier dont `match` réussit.
 * Le profil `default` (dernier de la liste) garantit qu'un résultat est
 * toujours retourné.
 *
 * @param {string} assetPath  chemin relatif au module (ex. `assets/musics/ambient/foo.ogg`)
 * @param {Array<{profile:string, match:RegExp, bitrate:string}>} profiles
 * @returns {{profile:string, match:RegExp, bitrate:string}}
 */
function selectAudioProfile(assetPath, profiles) {
  for (const entry of profiles) {
    if (entry.match.test(assetPath)) return entry;
  }

  return profiles[profiles.length - 1];
}

export {
  BITRATE_UNITS,
  buildAudioMarker,
  parseBitrate,
  parseEncoders,
  selectAudioProfile,
  selectEncoder,
  shouldOptimizeAudio
};

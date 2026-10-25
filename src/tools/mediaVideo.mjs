/**
 * Fonctions pures pour la conversion vidéo via FFmpeg.
 *
 * Aucune E/S : l'exécution de FFmpeg/FFprobe est résolue par l'appelant.
 * Ces fonctions encapsulent les règles de décision (choix du profil,
 * idempotence) afin de les tester sans FFmpeg.
 */

/**
 * Sélectionne le profil vidéo correspondant à un chemin asset.
 *
 * Itère les profils dans l'ordre ; retourne le premier dont `match` réussit.
 * Le profil `default` (dernier de la liste) garantit qu'un résultat est
 * toujours retourné.
 *
 * @param {string} assetPath  chemin relatif au module (ex. `assets/videos/scenes/intro.mp4`)
 * @param {Array<{profile:string, match:RegExp, crf:number, tileColumns:number, threads:number}>} profiles
 * @returns {{profile:string, match:RegExp, crf:number, tileColumns:number, threads:number}}
 */
function selectVideoProfile(assetPath, profiles) {
  for (const entry of profiles) {
    if (entry.match.test(assetPath)) return entry;
  }

  return profiles[profiles.length - 1];
}

/**
 * Indique si un fichier vidéo est convertible (source MP4 ou MOV).
 * Les fichiers `.webm` (déjà cible) et `.m4v` (hors périmètre) sont exclus.
 * @param {string} filePath
 * @returns {boolean}
 */
function shouldConvertVideo(filePath) {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".mp4") || lower.endsWith(".mov");
}

/**
 * Construit la balise de métadonnée marquant un fichier déjà converti.
 * @param {string} markerPrefix
 * @param {number} crf  valeur CRF du profil (ex. 28)
 * @returns {string}
 */
function buildVideoMarker(markerPrefix, crf) {
  return `${markerPrefix}:vp9:${crf}`;
}

export { buildVideoMarker, selectVideoProfile, shouldConvertVideo };

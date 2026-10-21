/**
 * Warbound — Media Config
 *
 * Profils de qualité, chemins et cibles de l'outil d'optimisation des médias.
 * Toutes les valeurs sont statiques : aucune dépendance runtime.
 */

export const MODULE_ID = "warbound-campaign-content";
export const MODULE_PREFIX = `modules/${MODULE_ID}/`;

export const ASSETS_DIR = "assets";
export const COMPENDIUMS_DIR = "compendiums";
export const REPORTS_DIR = "reports";

/**
 * Profils de qualité WebP par type d'image.
 *
 * `quality` est le paramètre `sharp` (0-100) ; `lossless` produit des WebP
 * sans perte, nettement plus lourds.
 */
export const IMAGE_PROFILES = {
  default: { quality: 85, lossless: false },
  ui: { quality: 92, lossless: false },
  icon: { quality: 90, lossless: false },
  token: { quality: 85, lossless: false },
  portrait: { quality: 82, lossless: false },
  illustration: { quality: 82, lossless: false },
  map: { quality: 78, lossless: false }
};

/**
 * Règles d'affectation d'un profil, évaluées dans l'ordre.
 * Le motif est appliqué au chemin POSIX de l'asset (`assets/...`).
 */
export const IMAGE_PROFILE_RULES = [
  { profile: "ui", match: /^assets\/ui\// },
  { profile: "icon", match: /^assets\/images\/icons\// },
  { profile: "token", match: /^assets\/images\/(tokens|frames)\// },
  { profile: "portrait", match: /^assets\/images\/avatar\// },
  { profile: "illustration", match: /^assets\/(images\/illustrations|elements|pages)\// },
  { profile: "map", match: /^assets\/(images\/(battlemaps|maps)|landing-page\/maps)\// }
];

/**
 * Extensions d'images converties en WebP.
 */
export const IMAGE_EXTENSIONS = [".png"];

/**
 * Extensions audio optimisées par FFmpeg.
 */
export const AUDIO_EXTENSIONS = [".ogg", ".oga"];

/**
 * Extensions vidéo (conversion hors périmètre, stub).
 */
export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm"];

export const AUDIO_CONFIG = {
  /** Bitrate cible des fichiers audio. */
  bitrate: "96k",

  /** Préfixe de la balise de métadonnée marquant un fichier optimisé. */
  markerPrefix: "warbound-media-optimize",

  /**
   * Encodeurs FFmpeg candidats par codec, par ordre de préférence.
   * `libopus`/`libvorbis` sont des encodeurs externes, les encodeurs natifs
   * FFmpeg (`opus`/`vorbis`) sont expérimentaux et requièrent `-strict -2`.
   */
  encoderCandidates: {
    opus: ["libopus", "opus"],
    vorbis: ["libvorbis", "vorbis"]
  },

  /** Tolérance (en %) sur la durée lors de la validation du fichier produit. */
  durationToleranceRatio: 0.02
};

export const VIDEO_CONFIG = {
  codec: "libvpx-vp9",
  container: "webm"
};

/**
 * Fichiers sources susceptibles de contenir des références vers les assets.
 *
 * Les références PNG ne vivent pas uniquement dans les YAML des compendiums :
 * les feuilles de style (`styles/`) et les scripts (`scripts/`, `src/`) en
 * contiennent aussi. Les migrer est indispensable, sinon le nettoyage des
 * PNG originaux casserait le rendu.
 */
export const SOURCE_TARGETS = [
  { dir: COMPENDIUMS_DIR, extensions: [".yml", ".yaml"] },
  { dir: "styles", extensions: [".css"] },
  { dir: "scripts", extensions: [".mjs", ".js"] },
  { dir: "src", extensions: [".mjs", ".js"] },
  { dir: "examples", extensions: [".html", ".htm"] },
  { files: ["module.json"], extensions: [".json"] }
];

/**
 * Fichiers ignorés lors de la migration des références (fixtures de tests).
 */
export const SOURCE_EXCLUDE_PATTERNS = [/\.test\.mjs$/];

/**
 * Répertoires ignorés lors du parcours de l'arborescence.
 */
export const WALK_EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  "packs",
  REPORTS_DIR
];

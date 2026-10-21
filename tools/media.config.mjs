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
 *
 * Correspondance avec la table de l'issue #128 :
 *
 * | Répertoire                 | Profil         | Qualité         |
 * |----------------------------|----------------|-----------------|
 * | `assets/images/avatar/`    | `portrait`     | 85, avec perte  |
 * | `assets/images/battlemaps/`| `map`          | 88, avec perte  |
 * | `assets/images/tokens/`    | `token`        | 87, avec perte  |
 * | `assets/images/icons/`     | `icon`         | lossless        |
 * | autres                     | `default`      | 85, avec perte  |
 *
 * `ui` et `illustration` affinent la ligne « autres » pour deux familles
 * d'images qui s'y apparentent : l'habillage d'interface (5 images) et les
 * illustrations décoratives (88 images), volontairement plus compressées.
 */
export const IMAGE_PROFILES = {
  default:      { quality: 85, lossless: false },
  ui:           { quality: 92, lossless: false },
  icon:         { lossless: true },
  token:        { quality: 87, lossless: false },
  portrait:     { quality: 85, lossless: false },
  illustration: { quality: 82, lossless: false },
  map:          { quality: 88, lossless: false }
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
 * Répertoire des vignettes de scènes générées par Foundry.
 */
export const THUMBNAIL_DIR = "assets/scenes";

/**
 * Vignettes de scènes auto-générées par Foundry (`thumb-*.webp`).
 *
 * Elles sont déjà au bon format et Foundry les régénère : ni converties, ni
 * supprimées. Le motif couvre aussi le cas d'une vignette servie en PNG.
 */
export const FOUNDRY_THUMBNAIL_PATTERN = /^assets\/scenes\/thumb-.*\.(webp|png)$/;

/**
 * Extensions déjà optimisées (WebP).
 */
export const WEBP_EXTENSIONS = [".webp"];

/**
 * Extensions audio optimisées par FFmpeg.
 */
export const AUDIO_EXTENSIONS = [".ogg", ".oga"];

/**
 * Extensions vidéo (conversion hors périmètre, stub).
 */
export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm"];

/**
 * Extensions pour lesquelles on recherche des références dans les sources.
 *
 * Couvre tout média pouvant être référencé par un YAML, une feuille de style
 * ou un script — le scanner doit pouvoir attribuer ses références aux OGG et
 * aux WebP existants, pas seulement aux PNG.
 */
export const MEDIA_REF_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...WEBP_EXTENSIONS,
  ".jpg",
  ".jpeg",
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS
];

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

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
 * Effort d'encodage Sharp par défaut (0-6).
 *
 * 4 est la valeur par défaut de `sharp.webp()` : les réglages par défaut
 * produisent donc exactement les mêmes WebP que la version précédente de
 * l'outil. Monter à 6 gagne environ 3 % de poids sur les icônes `lossless`,
 * pour environ 0,2 s de plus par image ; sur les profils avec perte, l'effort 6
 * multiplie le temps d'encodage par ~18 pour le même gain, il n'est donc pas
 * activé par défaut.
 */
export const DEFAULT_WEBP_EFFORT = 4;

/**
 * Bornes de l'effort d'encodage acceptées par `sharp.webp()`.
 */
export const WEBP_EFFORT_RANGE = { min: 0, max: 6 };

/**
 * Profils de compression WebP, par motif de chemin.
 *
 * Chaque entrée regroupe le motif d'affectation et les réglages d'encodage :
 * ajouter ou ajuster un profil se fait à un seul endroit, sans toucher au
 * code de conversion. Les entrées sont évaluées dans l'ordre, la première
 * correspondance l'emporte ; `default` rattrape tout le reste.
 *
 * - `quality` : paramètre `sharp` (0-100), ignoré en mode `lossless` ;
 * - `lossless` : encodage sans perte, nettement plus lourd ;
 * - `effort` : niveau d'effort CPU de `sharp` (0-6), défaut 4.
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
export const IMAGE_PROFILES = [
  { profile: "ui",           match: /^assets\/ui\//,                                      quality: 92, lossless: false, effort: 4 },
  { profile: "icon",         match: /^assets\/images\/icons\//,                            quality: null, lossless: true,  effort: 4 },
  { profile: "token",        match: /^assets\/images\/(tokens|frames)\//,                  quality: 87, lossless: false, effort: 4 },
  { profile: "portrait",     match: /^assets\/images\/avatar\//,                           quality: 85, lossless: false, effort: 4 },
  { profile: "illustration", match: /^assets\/(images\/illustrations|elements|pages)\//, quality: 82, lossless: false, effort: 4 },
  { profile: "map",          match: /^assets\/(images\/(battlemaps|maps)|landing-page\/maps)\//, quality: 88, lossless: false, effort: 4 },
  { profile: "default",      match: /^/,                                                  quality: 85, lossless: false, effort: 4 }
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
  /** Bitrate par défaut (utilisé par le profil `default`). */
  defaultBitrate: "96k",

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

/**
 * Profils de bitrate OGG, par motif de chemin asset.
 *
 * Évalués dans l'ordre — premier match retenu. Modèle identique à `IMAGE_PROFILES`.
 *
 * | Répertoire                   | Profil    | Bitrate |
 * |------------------------------|-----------|---------|
 * | `assets/musics/ambient/`     | `ambient` | 128 kbps (diffusion Foundry recommandée) |
 * | `assets/musics/sfx/`         | `sfx`     | 96 kbps |
 * | autres                       | `default` | 96 kbps |
 */
export const AUDIO_PROFILES = [
  { profile: "ambient", match: /^assets\/musics\/ambient\//, bitrate: "128k" },
  { profile: "sfx",     match: /^assets\/musics\/sfx\//,     bitrate: "96k"  },
  { profile: "default", match: /^/,                          bitrate: "96k"  }
];

/**
 * Profils de conversion WebM VP9, par motif de chemin asset.
 *
 * | Répertoire                  | Profil    | CRF | Description                  |
 * |-----------------------------|-----------|-----|------------------------------|
 * | `assets/videos/scenes/`     | `scene`   |  28 | Qualité visuelle prioritaire |
 * | `assets/videos/tokens/`     | `token`   |  33 | Balance qualité/taille       |
 * | autres                      | `default` |  33 | Balance qualité/taille       |
 *
 * En mode constant-quality VP9 (`-b:v 0 -crf <n>`) : plus le CRF est bas,
 * meilleure est la qualité (et plus le fichier est lourd).
 */
export const VIDEO_PROFILES = [
  { profile: "scene",   match: /^assets\/videos\/scenes\//, crf: 28, tileColumns: 2, threads: 4 },
  { profile: "token",   match: /^assets\/videos\/tokens\//, crf: 33, tileColumns: 1, threads: 2 },
  { profile: "default", match: /^/,                         crf: 33, tileColumns: 1, threads: 2 }
];

export const VIDEO_CONFIG = {
  codec: "libvpx-vp9",
  container: "webm",

  /** Préfixe de la balise de métadonnée marquant un fichier converti. */
  markerPrefix: "warbound-media-optimize",

  /** Tolérance (en %) sur la durée lors de la validation du fichier produit. */
  durationToleranceRatio: 0.02
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

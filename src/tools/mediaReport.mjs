/**
 * Warbound — Media Report
 *
 * Construction du rapport d'inventaire des médias à partir d'un scan.
 *
 * Ce module est pur : il ne lit ni n'écrit sur le disque. Les tailles sont
 * fournies par l'appelant, ce qui rend le format du rapport testable sans
 * fixture disque.
 */

/**
 * Indexe les sources qui référencent chaque asset.
 *
 * @param {Array<{relativePath: string, assets: string[]}>} refs
 * @returns {Map<string, string[]>} asset → sources référentes (triées, sans doublon)
 */
function indexRefsByAsset(refs) {
  const index = new Map();

  for (const ref of refs) {
    for (const asset of ref.assets) {
      if (!index.has(asset)) index.set(asset, []);

      const sources = index.get(asset);

      if (!sources.includes(ref.relativePath)) {
        sources.push(ref.relativePath);
      }
    }
  }

  for (const sources of index.values()) {
    sources.sort((a, b) => a.localeCompare(b));
  }

  return index;
}

/**
 * Compare deux chemins d'asset de façon déterministe.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function byAssetPath(a, b) {
  return a.localeCompare(b);
}

/**
 * Construit le rapport d'inventaire.
 *
 * @param {{
 *   images?: Array<{assetPath: string, sizeBytes?: number, hasWebp?: boolean, profile?: string}>,
 *   audio?: Array<{assetPath: string, sizeBytes?: number}>,
 *   videos?: Array<{assetPath: string, sizeBytes?: number}>,
 *   webp?: Array<{assetPath: string, sizeBytes?: number}>,
 *   refs?: Array<{relativePath: string, assets: string[]}>
 * }} inventory
 * @param {{ generatedAt?: string }} [options]
 * @returns {{
 *   generatedAt: string,
 *   summary: Record<string, number>,
 *   images: Array<Record<string, unknown>>,
 *   standaloneWebp: Array<Record<string, unknown>>,
 *   audio: Array<Record<string, unknown>>,
 *   videos: Array<Record<string, unknown>>,
 *   unreferenced: string[]
 * }}
 */
function buildMediaReport(inventory, options = {}) {
  const {
    images = [],
    audio = [],
    videos = [],
    webp = [],
    refs = []
  } = inventory;

  const { generatedAt = new Date().toISOString() } = options;

  const refsByAsset = indexRefsByAsset(refs);

  // Un WebP est « autonome » quand il n'a pas de PNG jumeau : c'est le cas des
  // vignettes de scènes générées par Foundry, déjà dans le bon format.
  const pngAssetPaths = new Set(images.map((image) => image.assetPath));

  const standaloneWebp = webp
    .filter((entry) => !pngAssetPaths.has(entry.assetPath.replace(/\.webp$/i, ".png")))
    .map((entry) => ({
      assetPath: entry.assetPath,
      sizeBytes: entry.sizeBytes ?? null,
      referencedBy: [...(refsByAsset.get(entry.assetPath) ?? [])]
    }))
    .sort((a, b) => byAssetPath(a.assetPath, b.assetPath));

  const imageEntries = images
    .map((image) => ({
      assetPath: image.assetPath,
      sizeBytes: image.sizeBytes ?? null,
      hasWebp: Boolean(image.hasWebp),
      profile: image.profile ?? null,
      referencedBy: [...(refsByAsset.get(image.assetPath) ?? [])]
    }))
    .sort((a, b) => byAssetPath(a.assetPath, b.assetPath));

  const audioEntries = audio
    .map((entry) => ({
      assetPath: entry.assetPath,
      sizeBytes: entry.sizeBytes ?? null,
      referencedBy: [...(refsByAsset.get(entry.assetPath) ?? [])]
    }))
    .sort((a, b) => byAssetPath(a.assetPath, b.assetPath));

  const videoEntries = videos
    .map((entry) => ({
      assetPath: entry.assetPath,
      sizeBytes: entry.sizeBytes ?? null,
      referencedBy: [...(refsByAsset.get(entry.assetPath) ?? [])]
    }))
    .sort((a, b) => byAssetPath(a.assetPath, b.assetPath));

  const totalSizeBytes = [...images, ...audio, ...videos, ...webp].reduce(
    (sum, entry) => sum + (entry.sizeBytes ?? 0),
    0
  );

  const unreferenced = [...imageEntries, ...audioEntries, ...videoEntries]
    .map((entry) => entry.assetPath)
    .filter((assetPath) => !refsByAsset.has(assetPath))
    .sort(byAssetPath);

  return {
    generatedAt,
    summary: {
      png: imageEntries.filter((image) => !image.hasWebp).length,
      webp: imageEntries.filter((image) => image.hasWebp).length + standaloneWebp.length,
      webpStandalone: standaloneWebp.length,
      ogg: audioEntries.length,
      video: videoEntries.length,
      totalSizeBytes,
      referencedAssets: refsByAsset.size
    },
    images: imageEntries,
    standaloneWebp,
    audio: audioEntries,
    videos: videoEntries,
    unreferenced
  };
}

/**
 * Formate le résumé console du rapport.
 *
 * @param {ReturnType<typeof buildMediaReport>} report
 * @returns {string[]}
 */
function formatMediaReportSummary(report) {
  const { summary, unreferenced } = report;
  const sizeMB = (summary.totalSizeBytes / 1024 / 1024).toFixed(1);

  return [
    `PNG: ${summary.png}  |  WebP autonomes (thumbnails): ${summary.webpStandalone}  |  OGG: ${summary.ogg}  |  Vidéos: ${summary.video}`,
    `Taille totale : ${sizeMB} MB  |  Actifs sans référence dans les sources : ${unreferenced.length}`
  ];
}

export { buildMediaReport, formatMediaReportSummary, indexRefsByAsset };

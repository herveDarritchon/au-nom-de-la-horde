/**
 * Warbound — Convert Videos (stub)
 *
 * Support futur MP4/MOV → WebM. Hors périmètre de l'issue #126 : la
 * conversion n'est pas implémentée, les vidéos sont simplement inventoriées.
 */

async function run(videos = [], _write) {
  if (videos.length > 0) {
    console.log(
      `[media:optimize] Conversion vidéo non encore implémentée — ${videos.length} fichier(s) ignoré(s).`
    );
  }

  return { converted: 0, skipped: videos.length, errors: [] };
}

export { run };

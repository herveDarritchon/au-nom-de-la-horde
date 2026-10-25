# Plan d'implémentation — Support de conversion vidéo MP4/MOV vers WebM

**Issue** : #134
**ADR** : n/a
**Modules probablement impactés** : `tools/convertVideos.mjs`, `tools/media.config.mjs`, `tools/mediaOptimize.mjs`, `package.json`

---

## 1. Objectif

Implémenter `tools/convertVideos.mjs` (actuellement un stub) pour convertir MP4/MOV en WebM via FFmpeg (codec VP9), avec deux profils par répertoire, et intégrer `--type video` dans l'orchestrateur `mediaOptimize.mjs`.

---

## 2. Périmètre

### Inclus

- Implémentation de `tools/convertVideos.mjs` : conversion FFmpeg VP9, deux profils, idempotence, dry-run, rapport.
- Ajout de `VIDEO_PROFILES` dans `tools/media.config.mjs` (modèle de `IMAGE_PROFILES` et `AUDIO_PROFILES`).
- Ajout de `"video"` dans `VALID_TYPES` de `parseArgs()` dans `tools/mediaOptimize.mjs`.
- Mise à jour du rapport console (`printHeader` / `printResults`) pour afficher les vidéos.
- Ajout scripts `media:optimize:video` et `media:optimize:video:write` dans `package.json`.
- Migration des références YAML `.mp4`/`.mov` → `.webm` via `migrateRefs.mjs` (réutilisation existante, aucune modification de `migrateRefs.mjs`).
- Tests Vitest : sélection de profil, dry-run sans fichier, détection d'un MP4 ajouté.

### Hors périmètre

- Codec AV1 (VP9 suffit pour l'infrastructure ; AV1 peut être un profil futur).
- Support `.m4v` et `.webm` comme source (extensions déjà dans `VIDEO_EXTENSIONS` mais non converties dans cette issue).
- Intégration `--clean` pour les vidéos sources (pattern identique aux PNG, reporté).

---

## 3. État actuel

| Fichier | État |
|---|---|
| `tools/convertVideos.mjs` | Stub : log + return `{ converted: 0, skipped: n, errors: [] }`. Aucune FFmpeg. |
| `tools/media.config.mjs` | `VIDEO_CONFIG = { codec: "libvpx-vp9", container: "webm" }` présent. `VIDEO_EXTENSIONS` couvre `.mp4 .mov .m4v .webm`. Pas de `VIDEO_PROFILES`. |
| `tools/mediaOptimize.mjs` | Import et appel de `convertVideos` déjà présents. `VALID_TYPES` = `{ "images", "audio", "all" }` — `"video"` manquant. `printHeader` n'affiche pas les vidéos. |
| `tools/mediaScanner.mjs` | Scanne et retourne `scanReport.videos` (array `{ assetPath, filePath }`). Fonctionnel. |
| `package.json` | Aucun script autonome `media:optimize:video`. |

---

## 4. Décisions d'architecture

- **Profils vidéo** : modéliser `VIDEO_PROFILES` comme `AUDIO_PROFILES` — tableau `{ profile, match, crf, tileColumns, threads }`, premier match retenu.
  - `scene` : priorité qualité (`crf 28`, `tile-columns 2`, `threads 4`) pour `assets/videos/scenes/`.
  - `token` : balance qualité/taille (`crf 33`, `tile-columns 1`, `threads 2`) pour `assets/videos/tokens/`.
  - `default` : `crf 33` pour tout le reste.
- **Idempotence** : marqueur de métadonnée FFmpeg (`comment` tag) `warbound-media-optimize:vp9:<crf>` ; si présent et crf identique → skip.
- **Sources converties** : uniquement `.mp4` et `.mov` (pas `.webm` déjà cible, pas `.m4v` hors périmètre).
- **Dry-run** : FFprobe pour estimer la taille cible (bitrate estimé × durée) sans encoder.
- **Point d'entrée CLI** : reproduire le pattern `isMainModule()` de `mediaOptimize.mjs`.
- **Fonction pure** `selectVideoProfile(assetPath, profiles)` dans `src/tools/mediaVideo.mjs` (nouveau fichier, cohérence avec `mediaAudio.mjs`).

---

## 5. Plan de travail

### Étape 1 — `tools/media.config.mjs`

Ajouter `VIDEO_PROFILES` après `AUDIO_PROFILES` :

```js
export const VIDEO_PROFILES = [
  { profile: "scene", match: /^assets\/videos\/scenes\//, crf: 28, tileColumns: 2, threads: 4 },
  { profile: "token", match: /^assets\/videos\/tokens\//, crf: 33, tileColumns: 1, threads: 2 },
  { profile: "default", match: /^/,                       crf: 33, tileColumns: 1, threads: 2 }
];
```

Étendre `VIDEO_CONFIG` avec `markerPrefix: "warbound-media-optimize"`.

### Étape 2 — `src/tools/mediaVideo.mjs` (nouveau)

Fonctions pures testables sans FFmpeg :
- `selectVideoProfile(assetPath, profiles)` : même logique que `selectAudioProfile`.
- `shouldConvertVideo(filePath)` : retourne `true` si extension `.mp4` ou `.mov`.
- `buildVideoMarker(profile)` : retourne `"warbound-media-optimize:vp9:<crf>"`.

### Étape 3 — `tools/convertVideos.mjs`

Remplacer le stub par l'implémentation complète :
- `run(videos, write)` : filtre les sources convertibles (`shouldConvertVideo`), sélectionne le profil, vérifie le marqueur d'idempotence (FFprobe), encode en WebM VP9 si `write`, calcule gain estimé si dry-run.
- Retourner `{ converted, skipped, savedBytes, errors }` (structure cohérente avec `optimizeAudio`).
- Point d'entrée CLI `isMainModule()` avec `--dry-run` / `--write`.

### Étape 4 — `tools/mediaOptimize.mjs`

- Ajouter `"video"` dans `VALID_TYPES`.
- Mettre à jour `parseArgs` : `type === "video"` actif.
- `printHeader` : ajouter ligne `Fichiers vidéo........................ ${scanReport.videos.length}`.
- `printResults` : remplacer la ligne `Vidéos (hors périmètre)` par `Vidéos converties (MP4→WebM)...`.
- Branche `runVideos` symétrique à `runAudio`.

### Étape 5 — `package.json`

```json
"media:optimize:video": "node ./tools/convertVideos.mjs --dry-run",
"media:optimize:video:write": "node ./tools/convertVideos.mjs --write"
```

### Étape 6 — Tests

- `src/tools/mediaVideo.test.mjs` : `selectVideoProfile` (scene → crf 28, token → crf 33, autre → crf 33), `shouldConvertVideo` (.mp4/.mov → true, .webm → false), `buildVideoMarker`.
- `tools/convertVideos.test.mjs` : dry-run avec 0 vidéo (message informatif, code 0), dry-run avec fixture MP4, idempotence (marqueur déjà présent → skip).

---

## 6. Fichiers modifiés

| Fichier | Modification |
|---|---|
| `tools/media.config.mjs` | Ajouter `VIDEO_PROFILES` ; étendre `VIDEO_CONFIG.markerPrefix`. |
| `src/tools/mediaVideo.mjs` | Nouveau : `selectVideoProfile`, `shouldConvertVideo`, `buildVideoMarker`. |
| `tools/convertVideos.mjs` | Remplacer le stub par l'implémentation FFmpeg VP9 complète. |
| `tools/mediaOptimize.mjs` | Ajouter `"video"` dans `VALID_TYPES`, `runVideos`, affichage rapport. |
| `package.json` | Ajouter `media:optimize:video` et `media:optimize:video:write`. |
| `src/tools/mediaVideo.test.mjs` | Nouveau : tests unitaires fonctions pures. |
| `tools/convertVideos.test.mjs` | Nouveau : tests intégration dry-run et idempotence. |

---

## 7. Tests attendus

| Test | Type | Description |
|---|---|---|
| `selectVideoProfile` profil scene | Vitest unitaire | `assets/videos/scenes/intro.mp4` → crf 28 |
| `selectVideoProfile` profil token | Vitest unitaire | `assets/videos/tokens/goblin.mov` → crf 33 |
| `selectVideoProfile` fallback | Vitest unitaire | chemin inconnu → profil default crf 33 |
| `shouldConvertVideo` MP4/MOV | Vitest unitaire | `.mp4`, `.mov` → true ; `.webm`, `.m4v` → false |
| dry-run 0 vidéo | Vitest + CLI | message "aucun fichier vidéo trouvé", exit 0 |
| dry-run avec MP4 fixture | Vitest + FFprobe | rapport liste le candidat, aucun fichier créé |
| idempotence marqueur VP9 | Vitest + FFprobe | fichier déjà marqué `vp9:33` → skip |

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| FFmpeg libvpx-vp9 absent sur la machine | Vérifier la disponibilité au démarrage, message d'erreur explicite + exit 1. |
| Conversion deux-passes VP9 longue | Utiliser une passe unique (`-b:v 0 -crf <n>`) suffisante pour WebM constant-quality. |
| `.webm` source inclus dans `VIDEO_EXTENSIONS` → boucle | `shouldConvertVideo` filtre strictement `.mp4`/`.mov`. |
| `migrateRefs.mjs` ne connaît pas `.mov`/`.mp4` → refs non migrées | Vérifier `MEDIA_REF_EXTENSIONS` dans `media.config.mjs` — `.mp4`/`.mov` déjà inclus via `VIDEO_EXTENSIONS`. |

---

## 9. Critères d'arrêt

- `pnpm media:optimize --type video --dry-run` s'exécute sans erreur avec 0 vidéo, affiche message informatif.
- `pnpm media:optimize:video` (dry-run) liste les candidats MP4/MOV avec profil et gain estimé.
- `pnpm media:optimize:video:write` convertit, valide (codec + durée FFprobe), remplace l'original par le `.webm`.
- Un MP4 ajouté dans `assets/` est détecté, converti, et ses références YAML migrées via `--type video --update-references --write`.
- Tests unitaires et intégration passent (`pnpm test`).
- `pnpm build` sort avec code 0.
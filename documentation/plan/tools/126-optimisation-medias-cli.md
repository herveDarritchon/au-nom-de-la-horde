
# Plan d'implémentation — feat(media): outil CLI d'optimisation des médias du module

**Issue**: herveDarritchon/au-nom-de-la-horde#126
**ADR**: N/A

---

## 1. Objectif

Créer un pipeline CLI Node.js idempotent (`pnpm media:optimize`) qui :
1. Scanne les médias et leurs références (YAML, CSS, JS)
2. Convertit PNG → WebP (Sharp) et optimise OGG (FFmpeg)
3. Migre les chemins dans les fichiers sources
4. Recompile les packs LevelDB et valide l'intégrité
5. Nettoie les originaux après validation complète

## 2. Périmètre

### Inclus

- `tools/mediaOptimize.mjs` — orchestrateur CLI principal (flags : `--dry-run`, `--write`, `--help`)
- `tools/mediaScanner.mjs` — inventaire PNG/WebP/OGG + refs sources
- `tools/media.config.mjs` — profils de qualité par type d'image (Sharp WebP), config audio/vidéo, cibles sources
- `tools/convertImages.mjs` — conversion PNG → WebP via Sharp
- `tools/migrateRefs.mjs` — réécriture `.png` → `.webp` dans les sources (YAML, CSS, JS)
- `tools/optimizeAudio.mjs` — optimisation bitrate OGG via FFmpeg
- `tools/convertVideos.mjs` — stub futur MP4/MOV → WebM (no-op pour l'instant)
- `src/tools/mediaPaths.mjs` — helpers purs de résolution/réécriture de références d'assets
- `src/tools/mediaAudio.mjs` — helpers purs de décision FFmpeg (bitrate, encodage, marqueur)
- `package.json` — script `media:optimize` + dépendance dev `sharp`

### Hors périmètre

- Support MP4/MOV → WebM (stub seulement)
- Intégration CI automatique
- Conversion de masse des médias existants (livrée par l'outil, appliquée dans une PR dédiée)
- Modification des assets existants WebP (déjà convertis)

## 3. État actuel

- 331 PNG, 20 WebP (thumbnails Foundry auto-générés), 56 OGG dans `assets/`
- Les 56 OGG sont **Ogg Opus** (48 kHz stéréo, 110k–150k bitrate) — pas Vorbis
- Les refs PNG ne sont pas confinées aux YAML : `styles/warbound.css` (3 refs `url(...)`) et
  `scripts/warbound.mjs` (2 refs en template littéral) en contiennent aussi
- Certaines refs sont encodées en pourcentage (`sang-froid-sombrelance%20.png`)
- `src/tools/assetPolicy.mjs` expose `classifyPath()` — réutilisable pour filtrer les refs du module
- `tools/auditAssets.mjs` : pattern YAML walker (readdir récursif + filtrage `.yml/.yaml`)
- `tools/replaceAssetPaths.mjs` : pattern remplacement string regex dans YAML
- `pnpm packs:audit` + `pnpm packs:build` disponibles pour validation post-migration

## 4. Décisions d'architecture

- **Dry-run par défaut** : sans flag `--write`, aucune écriture sur disque. Rapport JSON + résumé console uniquement.
- **Idempotence images** : `convertImages.mjs` vérifie si le `.webp` existe déjà avant conversion.
- **Idempotence audio** : chaque OGG optimize porte une balise OpusTags `warbound-media-optimize:96k`.
  Un fichier portant cette balise est ignoré, ce qui rend la seconde exécution sans effet.
- **Idempotence refs** : `migrateRefs.mjs` réécrit `.png` → `.webp` ; une ref déjà en `.webp` n'est pas touchée.
- **Périmètre des refs** : YAML + CSS + JS (et non YAML seul) — sans cela, le nettoyage des PNG
  casserait le thème (papier texture, logo, image d'acteur par défaut).
- **Orchestration séquentielle** : scan → convert images → migrate refs → optimize audio → build packs → cleanup originaux (seulement si tout passe).
- **Rapport JSON** : écrit dans `reports/media-optimize-{timestamp}.json` avec stats : scanned/converted/migrated/skipped/errors.
- **Codes de sortie** : `0` succès, `1` échec métier (conversion/erreur/cleanup bloqué), `2` usage invalide.
- **Sharp** : dépendance dev (`pnpm add -D sharp`). FFmpeg : attendu dans PATH (pas de dépendance npm).
- **Sécurité du cleanup** : un PNG n'est supprimé que si (a) un WebP exploitable existe, (b) le build
  `pnpm build` est vert, (c) plus aucune source ne référence le PNG.
- **Garde-fou de taille** : si le WebP produit est ≥ au PNG source, il est supprimé et le PNG est conservé.
- Réutiliser `classifyPath()` de `src/tools/assetPolicy.mjs` pour ne traiter que les refs `modules/warbound-campaign-content/`.
- Réutiliser le pattern YAML walker de `tools/auditAssets.mjs` (lignes ~40–80).
- Réutiliser le pattern de remplacement de `tools/replaceAssetPaths.mjs`.

## 5. Plan de travail

### Étape 1 — `tools/media.config.mjs`

Exporte les profils de qualité, les chemins du module et les cibles sources :

```js
export const MODULE_ID = 'warbound-campaign-content';
export const IMAGE_PROFILES = { default: {...}, ui: {...}, icon: {...}, ... };
export const AUDIO_CONFIG = { bitrate: '96k', markerPrefix: 'warbound-media-optimize', ... };
export const VIDEO_CONFIG = { codec: 'libvpx-vp9' };
export const SOURCE_TARGETS = ['compendiums/**/*.{yml,yaml}', 'styles/**/*.css', ...];
```

### Étape 2 — `tools/mediaScanner.mjs`

Parcourt `assets/` récursivement. Collecte :
- PNG sans WebP correspondant → candidats conversion
- OGG → candidats optimisation audio
- MP4/MOV → candidats vidéo (stub)
- Toutes les sources (YAML/CSS/JS/HTML) et les refs `.png` qu'elles contiennent

Retourne `{ images, audio, videos, sources, refs, assets }`.

### Étape 3 — `tools/convertImages.mjs`

Pour chaque PNG candidat :
1. Vérifie si `.webp` existe (idempotence → skip si oui)
2. Choisit le profil Sharp selon le chemin (ui / icon / token / portrait / illustration / map)
3. En mode `--write` : convertit via Sharp, écrit `.webp` à côté du `.png`
4. Garde-fou : si le WebP n'est pas plus léger que le PNG, le WebP est supprimé et le PNG conservé

### Étape 4 — `tools/migrateRefs.mjs`

Pour chaque source contenant une ref `.png` résoluble vers un asset du module :
1. Résout la ref (préfixe module, relatif CSS, template littéral JS, encodage `%20`)
2. Vérifie si déjà `.webp` (idempotence → skip si oui)
3. En mode `--write` : remplace `.png` → `.webp` en préservant la forme encodée d'origine

### Étape 5 — `tools/optimizeAudio.mjs`

Pour chaque OGG :
1. Vérifie la balise d'optimisation (idempotence → skip si présente)
2. Compare le bitrate courant à la cible (skip si déjà en dessous)
3. Détecte l'encodeur disponible (`libopus`, puis `opus`/`vorbis` natifs en `-strict -2`)
4. En mode `--write` : réencode via FFmpeg dans un fichier temporaire, valide codec + durée,
   puis remplace l'original de façon atomique

### Étape 6 — `tools/convertVideos.mjs`

Stub no-op — journalise « conversion vidéo non implémentée ».

### Étape 7 — `tools/mediaOptimize.mjs` (orchestrateur)

```
parse args (--dry-run default, --write explicite, --help)
→ mediaScanner.scan()
→ convertImages.run(images, write)
→ migrateRefs.run(refs, write)
→ optimizeAudio.run(audio, write)
→ convertVideos.run(videos, write)
→ if write: execSync('pnpm build')
→ if write && build OK: cleanup PNG originaux
→ write JSON report → reports/media-optimize-{timestamp}.json
→ print summary console
```

### Étape 8 — `package.json`

Ajouter dans `scripts` :
```json
"media:optimize": "node ./tools/mediaOptimize.mjs"
```

## 6. Fichiers modifiés/créés

| Fichier | Action |
|---|---|
| `tools/media.config.mjs` | créer |
| `tools/mediaScanner.mjs` | créer |
| `tools/convertImages.mjs` | créer |
| `tools/migrateRefs.mjs` | créer |
| `tools/optimizeAudio.mjs` | créer |
| `tools/convertVideos.mjs` | créer (stub) |
| `tools/mediaOptimize.mjs` | créer |
| `src/tools/mediaPaths.mjs` | créer (helpers purs) |
| `src/tools/mediaAudio.mjs` | créer (helpers purs) |
| `tools/*.test.mjs`, `src/tools/*.test.mjs` | créer (tests `node --test`) |
| `package.json` | ajouter script `media:optimize` + `sharp` (devDependency) |
| `pnpm-lock.yaml` | mis à jour (`sharp`) |
| `.gitignore` | ajouter `reports/` |
| `documentation/guide/media-optimize.md` | créer (guide d'usage) |

## 7. Tests

Runner du projet : **`node --test`** (pas Vitest).

- `node --test src/tools/ tools/` — tests unitaires (scanner, convertImages, migrateRefs, optimizeAudio, helpers purs)
- Les tests dépendants de FFmpeg sont ignorés automatiquement si FFmpeg est absent du PATH
- `pnpm test` — suite complète du dépôt
- `pnpm packs:audit` + `pnpm build` — validation de l'intégrité des packs

Scénarios couverts :
- Idempotence images (skip si `.webp` existe)
- Idempotence refs (skip si déjà `.webp`)
- Idempotence audio (skip si balise d'optimisation présente)
- Résolution des refs : préfixe module, relatif CSS, template littéral JS, encodage `%20`
- Dry-run : aucun fichier modifié
- Erreurs remontées dans le rapport plutôt que levées

## 8. Validation manuelle

- `pnpm media:optimize` (dry-run) → rapport JSON correct, aucun fichier modifié
- `pnpm media:optimize --write` → WebP créés, refs migrées, OGG réencodés, `pnpm build` vert
- `pnpm media:optimize --write` relancé → aucune modification supplémentaire (idempotence)

## 9. Risques et mitigations

| Risque | Mitigation |
|---|---|
| FFmpeg absent du PATH | Détecté en début d'exécution, message clair, sortie propre sans crash |
| Sharp incompatible Apple Silicon | `pnpm add -D sharp` installe le bon binding natif automatiquement |
| Cleanup PNG trop agressif | Nettoyage conditionné au build vert ET à l'absence de ref résiduelle |
| Refs hors YAML (CSS/JS) oubliées | Le scanner couvre YAML, CSS, JS et HTML ; refs hors module ignorées |
| Thumbnails WebP Foundry (20 existants) | `mediaScanner` les exclut (déjà `.webp`, pas de PNG correspondant) |
| YAML corrompu après migration | `pnpm packs:audit` + `pnpm packs:build` valident avant cleanup |
| Perte de qualité audio trop forte | Cible `96k` par défaut, configurable dans `tools/media.config.mjs` |
| Perte de qualité image trop forte | Profils par type d'image, garde-fou de taille (WebP ≥ PNG ⇒ PNG conservé) |

## 10. Critères d'arrêt

- [x] `pnpm media:optimize` disponible (dry-run par défaut)
- [x] Rapport JSON + résumé console après chaque exécution
- [x] `pnpm media:optimize --write` convertit PNG → WebP et migre les refs (YAML + CSS + JS)
- [x] `pnpm media:optimize --write` deux fois consécutives : aucune modification supplémentaire
- [x] `pnpm build` passe après optimisation complète
- [x] Tests unitaires verts (`node --test`)

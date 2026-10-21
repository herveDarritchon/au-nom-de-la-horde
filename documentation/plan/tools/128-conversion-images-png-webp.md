# Plan d'implémentation — feat(media): convertir les images PNG en WebP avec Sharp

**Issue** : herveDarritchon/au-nom-de-la-horde#128
**Bloqué par** : #127 (scanner) — résolu par #126, dont le scanner est déjà en place

---

## 1. Objectif

Livrer `tools/convertImages.mjs` comme point d'entrée autonome : il convertit les PNG du
module en WebP via Sharp, produit `conversion-table.json` et signale les conversions écartées.

---

## 2. État de départ

`#128` a été découpé à partir de `#126` (pipeline d'optimisation complet) le 21/10/2026, le
même jour. L'outillage de `#126` a donc déjà livré une grande partie du travail :

| Attendu par l'issue | État dans `main` avant ce chantier |
|---|---|
| `tools/convertImages.mjs` convertit via Sharp | ✅ livré par #126 |
| `sharp` en devDependency | ✅ (`^0.35.5`) |
| Script `pnpm media:convert:images` | ❌ absent |
| `conversion-table.json` produit | ❌ absent |
| `conversion-table.json` gitignoré | ❌ absent |
| Profils de qualité conformes à l'issue | ❌ `portrait: 82`, `map: 78`, `token: 85`, `icon: 90` |
| Vignettes `assets/scenes/thumb-*.webp` ignorées | ⚠️ de facto (le scanner ne liste que les `.png`), mais non explicite |
| Dimensions préservées (battlemaps) | ✅ par construction (aucun `resize`), mais ❌ sans test |
| Canal alpha préservé (tokens) | ✅ par construction, mais ❌ sans test |
| WebP plus lourds signalés dans un rapport | ❌ seul `media:optimize` produisait un rapport |

---

## 3. Décisions d'architecture

- **Point d'entrée CLI dans `convertImages.mjs`** : même garde `process.argv[1] === fileURLToPath(import.meta.url)`
  que `mediaScanner.mjs`, pour éviter un fichier wrapper.
- **Profils de qualité** : `IMAGE_PROFILES` est aligné sur la table de l'issue pour les
  répertoires qu'elle énumère (`portrait` 85, `map` 88, `token` 87, `icon` lossless).
  `ui` (92) et `illustration` (82) affinent la ligne « autres » (85) pour deux familles
  d'images qui n'y figurent pas — 5 images d'habillage et 88 illustrations décoratives,
  volontairement plus compressées. Ce choix, déjà mergé par #126, est conservé et
  documenté dans `media.config.mjs`.
- **Rapport JSON** : `reports/media-convert-images-<horodatage>.json`, comme les autres
  rapports de la famille (`media-scan-*`, `media-optimize-*`). Il porte notamment la liste
  `keptPngDetails` des WebP écartés pour poids, avec les deux tailles.
- **`conversion-table.json` écrit dans les deux modes** : en dry-run, c'est la projection
  des conversions qui réussiraient (un asset dont le WebP serait plus lourd est absent de
  la table) ; en `--write`, c'est le résultat appliqué. Le fichier est gitignoré.
  La table recense les PNG dispose d'un WebP valide : lors d'un second passage, elle
  reste complète plutôt que vide, et reste donc exploitable comme table de migration.
- **Vignettes Foundry** : `FOUNDRY_THUMBNAIL_PATTERN` rend la règle explicite. Les
  vignettes sont écartées de la conversion et recensées dans le rapport.

---

## 4. Plan de travail

### Étape 1 — `tools/media.config.mjs`

- Aligner `IMAGE_PROFILES` sur la table de l'issue.
- Documenter la correspondance profil ↔ répertoire de l'issue.
- Ajouter `THUMBNAIL_DIR` et `FOUNDRY_THUMBNAIL_PATTERN`.

### Étape 2 — `tools/convertImages.mjs`

- `run()` retourne désormais `keptPngDetails` (WebP écartés, avec tailles), `byProfile`
  (répartition par profil), `thumbnailsSkipped` et `sizes.producedWebpBytes`.
- `buildConversionTable()` (pur) : table PNG → WebP, conversions réussies uniquement.
- `findFoundryThumbnails()` : liste les vignettes de scènes présentes dans le dépôt.
- Bloc CLI : rapport JSON + `conversion-table.json` + répartition par profil en console.

### Étape 3 — `tools/convertImages.test.mjs`

- Dimensions préservées (battlemap 1024×512).
- Canal alpha préservé (token RGBA, pixel transparent vérifié).
- Dimensions et alpha conservés en profil lossless.
- WebP plus lourds signalés avec leurs tailles.
- Répartition par profil.
- Vignettes Foundry ignorées et recensées.
- Table de conversion : conversions réussies uniquement.

### Étape 4 — `tools/mediaOptimize.mjs`

- Le rapport de l'outilenglobale reprend `keptPngDetails` et `byProfile`.

### Étape 5 — Documentation

- `documentation/guide/media-optimize.md` : section `pnpm media:convert:images`.
- `documentation/plan/tools/128-conversion-images-png-webp.md` : ce plan.

---

## 5. Fichiers modifiés

| Fichier | Action |
|---|---|
| `tools/media.config.mjs` | profils conformes à l'issue + motif des vignettes Foundry |
| `tools/convertImages.mjs` | rapport JSON, table de conversion, répartition par profil, vignettes ignorées |
| `tools/convertImages.test.mjs` | dimensions, alpha, signalement des WebP lourds, table, vignettes |
| `tools/mediaOptimize.mjs` | rapport enrichi (`keptPngDetails`, `byProfile`) |
| `package.json` | script `media:convert:images` |
| `.gitignore` | `conversion-table.json` |
| `documentation/guide/media-optimize.md` | section sur la conversion des images |
| `documentation/plan/tools/128-*.md` | ce plan |

---

## 6. Tests

Runner : **`node --test`**

- `node --test tools/convertImages.test.mjs` — tests de la conversion
- `pnpm test` — suite complète
- `pnpm media:convert:images` (dry-run) — projection, aucun asset modifié
- `pnpm media:convert:images --write` (bac à sable) — 331 WebP produits, table générée
- `pnpm media:optimize` — non régressé

---

## 7. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `lossless: true` sur 164 icônes produit des WebP plus lourds | Mesuré : les 164 icônes (1254×1254) pèsent 231 Mo en lossless contre 49 Mo en `q90` avec perte. Elles restent plus légères que leurs PNG (325 Mo), donc le garde-fou ne les écarte pas — mais le module gagne 180 Mo de moins. Le passage en `q90` se fait en changeant une ligne de `IMAGE_PROFILES` |
| Le passage en lossless dégrade le gain global | Le total `assets/` passe de 562 Mo à 710 Mo (−42 % au lieu de −53 %). Les icônes restent plus légères que leurs PNG, donc le garde-fou ne les écarte pas |
| La table de conversion dry-run prise pour un résultat appliqué | Le rapport porte `mode`, et la console l'indique (« projection ») |
| `conversion-table.json` écrasé à chaque exécution | Comportement attendu (pas de fusion) ; gitignoré |
| Les vignettes Foundry seraient converties ou supprimées | Motif explicite + garde dans `run()` + test dédié |

---

## 8. Critères d'arrêt

- [x] `pnpm media:convert:images` disponible (dry-run sans écriture sur les assets)
- [x] `pnpm media:convert:images --write` produit les WebP et `conversion-table.json`
- [x] `conversion-table.json` ne contient que les conversions réussies
- [x] Relancer `--write` ne re-encode pas les WebP déjà produits (idempotence)
- [x] Les WebP plus lourds que l'original sont signalés dans le rapport et non conservés
- [x] Dimensions préservées (battlemaps) et canal alpha conservé (tokens) — couverts par tests
- [x] `pnpm test` vert
- [x] `conversion-table.json` présent dans `.gitignore`

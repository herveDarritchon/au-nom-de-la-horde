# Plan d'implémentation — feat(media): scanner les médias et générer un rapport dry-run

**Issue**: herveDarritchon/au-nom-de-la-horde#127
**Bloqué par**: #126 (épique parent — `tools/mediaScanner.mjs` livré par #126)
**ADR**: N/A

---

## Contexte

Issue #126 a livré `tools/mediaScanner.mjs` comme module importable par `mediaOptimize.mjs`.
Issue #127 demande une commande standalone `pnpm media:scan` qui exécute ce scanner de façon
autonome et produit un rapport JSON orienté inventaire (fichier + taille + refs YAML), sans
modifier aucun fichier.

`tools/mediaScanner.mjs` existe déjà (non commité) et exporte `scan()`. Il manque :
- un point d'entrée CLI dans `mediaScanner.mjs`
- le script `media:scan` dans `package.json`
- le format de rapport JSON orienté inventaire (différent du rapport `media-optimize-*.json`)

---

## 1. Objectif

Permettre au MJ de lancer `pnpm media:scan` pour obtenir un inventaire complet des médias du
module : fichiers trouvés, taille, références YAML associées, WebP déjà présents — sans aucun
effet de bord sur les fichiers source.

---

## 2. Périmètre

### Inclus

- Ajout d'un bloc CLI (`if (isEntrypoint)`) dans `tools/mediaScanner.mjs`
- Script `"media:scan"` dans `package.json`
- Rapport JSON `reports/media-scan-{timestamp}.json` (répertoire déjà gitignore)
- Tests unitaires du formatage du rapport (format, champs présents, cohérence taille)

### Hors périmètre

- Toute modification de fichier source, asset ou YAML
- Intégration CI
- Conversion ou optimisation (couvert par #126)

---

## 3. État actuel

- `tools/mediaScanner.mjs` : exporte `scan()`, `walkFiles()`, `collectSourceFiles()`.
  Pas de bloc CLI. Usage actuel : importé par `mediaOptimize.mjs`.
- `package.json` : script `media:optimize` présent, `media:scan` absent.
- `.gitignore` : `reports/` déjà exclu (ajouté par #126).
- `src/tools/mediaPaths.mjs` : helpers purs `collectPngAssetRefs`, `resolveImageProfile`, `toPosix`.
  La collecte de références est limitée aux `.png`.
- `tools/media.config.mjs` : constantes `ASSETS_DIR`, extensions, `MODULE_ID`, profils.
- **Constat** : 4 références `.ogg` et 30 références `.webp` existent dans les compendiums.
  Le scanner actuel ne les attribue pas, alors que l'inventaire demandé porte sur
  « toutes les références médias ».

---

## 4. Décisions d'architecture

- **Généralisation de la collecte de références** : `src/tools/mediaPaths.mjs` expose
  `collectAssetRefs(content, context, extensions)` construite sur `buildAssetRefPattern(extensions)`.
  `collectPngAssetRefs` en devient un appel spécialisé — l'API existante est préservée.
  Sans cela, les OGG et les WebP ne peuvent pas être attribués à leurs sources, ce qui est
  explicitement demandé par l'issue.
- **Nouvelle constante `MEDIA_REF_EXTENSIONS`** dans `media.config.mjs` : couvre PNG, WebP,
  JPEG, OGG/OGA et vidéo — tout média référençable.
- **`scan()` retourne un champ `webp` supplémentaire** : l'inventaire distingue désormais les
  WebP autonomes (thumbnails Foundry, sans PNG source) de ceux produits par conversion.
- **Entrée CLI dans le fichier existant** : `if (process.argv[1] === fileURLToPath(import.meta.url))`
  en bas de `tools/mediaScanner.mjs`, pour éviter un fichier wrapper superflu.
- **Rapport dans `reports/`** : cohérent avec le rapport `media-optimize-*.json`. Nom :
  `reports/media-scan-{timestamp}.json`. Le répertoire est déjà gitignored.
  La mention `media-report.json` dans l'issue est un nom indicatif, pas un emplacement imposé.
- **Construction du rapport dans un module pur** : `src/tools/mediaReport.mjs` expose
  `buildMediaReport(inventory, options)` et `formatMediaReportSummary(report)`. Le module ne lit
  ni n'écrit sur le disque — les tailles sont fournies par l'appelant — ce qui rend le format du
  rapport testable sans fixture disque.
- **Format du rapport** :
  ```json
  {
    "generatedAt": "<ISO>",
    "summary": {
      "png": 331, "webp": 20, "webpStandalone": 20, "ogg": 56, "video": 0,
      "totalSizeBytes": 0, "referencedAssets": 202
    },
    "images": [
      { "assetPath": "assets/...", "sizeBytes": 0, "hasWebp": false, "profile": "...", "referencedBy": ["compendiums/..."] }
    ],
    "standaloneWebp": [
      { "assetPath": "assets/...", "sizeBytes": 0, "referencedBy": [] }
    ],
    "audio": [
      { "assetPath": "assets/...", "sizeBytes": 0, "referencedBy": [] }
    ],
    "videos": [],
    "unreferenced": ["assets/..."]
  }
  ```
- **Taille fichier** : `fs.stat(filePath).size` ajouté dans le bloc CLI après `scan()` —
  sans modifier l'API publique de `scan()`.
- **Dry-run absolu** : aucun `--write`, aucun effet de bord. Exit 0 si succès, 1 si erreur.

---

## 5. Plan de travail

### Étape 1 — Généralisation de la collecte de références

Dans `src/tools/mediaPaths.mjs` :
- extraire `buildAssetRefPattern(extensions)` construisant le motif de détection ;
- exposer `collectAssetRefs(content, context, extensions)` ;
- réécrire `collectPngAssetRefs` comme appel à `collectAssetRefs(content, context, [".png"])`.

Attention à la construction du motif : une alternance de deux motifs de longueur variable
(requis pour admettre les interpolations `${...}` des templates littéraux JS) ferait démarrer
la correspondance au milieu du chemin (`content/assets/…` au lieu de `modules/…/assets/…`).
Les accolades sont donc intégrées directement à la classe de caractères.

### Étape 2 — Extension du scanner

Dans `tools/mediaScanner.mjs` :
- collecter les références avec `MEDIA_REF_EXTENSIONS` au lieu du PNG seul ;
- inventorier les WebP (`webp`) en plus des images, de l'audio et de la vidéo ;
- retourner `{ images, audio, videos, webp, sources, refs, assets }`.

### Étape 3 — Construction du rapport JSON

Après `scan()`, enrichir chaque entrée avec `sizeBytes` via `fs.stat()` en parallèle
(`Promise.all`). Deleguer l'agrégation à `buildMediaReport()` (`src/tools/mediaReport.mjs`),
qui produit :

- `summary` : comptages par type + `totalSizeBytes` + `referencedAssets`
- `images` : `assetPath`, `sizeBytes`, `hasWebp`, `profile`, `referencedBy`
- `standaloneWebp` : WebP sans PNG jumeau (thumbnails Foundry), avec taille et références
- `audio` : `assetPath`, `sizeBytes`, `referencedBy`
- `videos` : `assetPath`, `sizeBytes`, `referencedBy`
- `unreferenced` : assets PNG/OGG/vidéo sans aucune référence dans les sources

`referencedBy` remonte les fichiers sources (YAML, CSS, JS) qui référencent l'asset, dédupliqués
et triés, de façon déterministe.

### Étape 4 — Écriture du rapport et sortie console

```
pnpm media:scan
→ scan()
→ enrichir avec sizeBytes
→ buildMediaReport()
→ mkdir -p reports/
→ écrire reports/media-scan-{timestamp}.json
→ afficher formatMediaReportSummary(report)
→ exit 0
```

### Étape 5 — `package.json`

```json
"media:scan": "node ./tools/mediaScanner.mjs"
```

### Étape 6 — Tests unitaires

Fichier `tools/mediaScanner.test.mjs` (runner `node --test`) :

- `scan()` retourne les champs attendus (dont `webp`)
- `scan()` détecte les PNG sans WebP correspondant
- `scan()` remonte les références YAML vers les PNG
- `scan()` remonte les références YAML vers les OGG
- `scan()` remonte les références YAML vers les WebP existants
- `scan()` distingue les WebP autonomes de ceux adossés à un PNG
- `summary` : `png` exclut les PNG avec WebP, `webp` les compte
- Dry-run : aucun fichier modifié après exécution

Fichier `src/tools/mediaReport.test.mjs` (runner `node --test`) :

- `indexRefsByAsset` indexe et déduplique les sources référentes
- `buildMediaReport` compte PNG / WebP / OGG / vidéos
- `buildMediaReport` classe les WebP sans PNG jumeau comme autonomes
- `buildMediaReport` rattache les sources référentes et liste les actifs orphelins
- `buildMediaReport` tolère une taille manquante
- `formatMediaReportSummary` produit les deux lignes de résumé

---

## 6. Fichiers modifiés/créés

| Fichier | Action |
|---|---|
| `src/tools/mediaPaths.mjs` | modifier — `collectAssetRefs` + `buildAssetRefPattern` |
| `src/tools/mediaReport.mjs` | créer — construction pure du rapport |
| `src/tools/mediaReport.test.mjs` | créer — tests du format de rapport |
| `tools/media.config.mjs` | modifier — `MEDIA_REF_EXTENSIONS`, `WEBP_EXTENSIONS` |
| `tools/mediaScanner.mjs` | modifier — inventaire WebP + bloc CLI |
| `tools/mediaOptimize.mjs` | modifier — libellé « refs médias » (les refs couvrent tous les médias) |
| `package.json` | modifier — script `media:scan` |
| `tools/mediaScanner.test.mjs` | modifier — tests références OGG/WebP + WebP autonomes |
| `documentation/guide/media-optimize.md` | modifier — section inventaire |
| `documentation/plan/tools/127-*.md` | ce plan |

---

## 7. Tests

Runner : **`node --test`**

- `node --test src/tools/mediaReport.test.mjs` — tests du format de rapport
- `node --test tools/mediaScanner.test.mjs` — tests du scanner
- `pnpm test` — suite complète
- Validation manuelle : `pnpm media:scan` → rapport JSON dans `reports/`, résumé console,
  aucun fichier modifié, comptages cohérents avec les critères d'acceptance de l'issue.

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `scan()` API changée par #126 | Vérifié : `scan()` retourne `{images, audio, videos, sources, refs, assets}` ; le champ `webp` est ajouté sans retirer les existants |
| Motif de référence cassé par la généralisation | Alternance à longueur variable supprimée au profit d'une classe de caractères ; régression couverte par les tests existants de `mediaPaths` |
| Références OGG/WebP non attribuées | Couvert par deux tests dédiés (`scan() remonte les références YAML vers les OGG` / `vers les WebP`) |
| Rapport écrit avant que `reports/` existe | `fs.mkdir(reportsDir, { recursive: true })` dans le CLI |
| `sizeBytes` manquant si fichier supprimé entre scan et stat | `try/catch` → `sizeBytes: null` |
| Comptages faux (PNG avec WebP comptés en PNG) | `summary.png` = images sans `hasWebp`, `summary.webp` = images avec `hasWebp` + WebP autonomes |

---

## 9. Critères d'arrêt

- [x] `pnpm media:scan` termine avec exit 0
- [x] `reports/media-scan-*.json` créé avec `summary`, `images`, `standaloneWebp`, `audio`, `unreferenced`
- [x] `summary.png` = 331, `summary.ogg` = 56, `summary.webp` = 20 (`webpStandalone` = 20)
- [x] Les références OGG (4) et WebP (30) sont attribuées à leurs sources
- [x] Aucun fichier modifié après exécution
- [x] `node --test src/tools/ tools/` vert

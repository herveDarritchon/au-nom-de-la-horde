# Optimisation des médias (`pnpm media:optimize`)

Outils CLI qui inventorient les médias du module, réduisent leur poids
(`PNG → WebP`, `OGG → OGG recalculé`) et migrent les références correspondantes.

| Commande | Rôle |
|---|---|
| `pnpm media:scan` | inventaire en lecture seule : fichiers, tailles, références |
| `pnpm media:convert:images` | conversion `PNG → WebP` seule, avec table de conversion |
| `pnpm media:optimize` | conversion, migration des références, recompilation des packs |

## Prérequis

- **FFmpeg** disponible dans le `PATH` (avec un encodeur Opus : `libopus` de préférence).
  ```bash
  ffmpeg -encoders | grep -i opus
  ```
- **Node.js** ≥ 20 et **pnpm**.
- `sharp` est installé automatiquement comme dépendance de développement (`pnpm install`).

## Inventaire (`pnpm media:scan`)

Commande **strictement en lecture seule** : elle n'écrit aucun fichier du module, seulement
son rapport JSON dans `reports/`.

```bash
pnpm media:scan
```

Sortie console :

```
PNG: 331  |  WebP autonomes (thumbnails): 20  |  OGG: 56  |  Vidéos: 0
Taille totale : 571.4 MB  |  Actifs sans référence dans les sources : 197
Rapport : reports/media-scan-2026-10-21T15-07-10-602Z.json
```

Le rapport JSON contient :

| Champ | Contenu |
|---|---|
| `summary` | comptages par type, taille totale, nombre d'assets référencés |
| `images` | chaque PNG : taille, profil de qualité, présence d'un WebP, sources qui le référencent |
| `standaloneWebp` | WebP sans PNG jumeau (thumbnails Foundry auto-générés) |
| `audio` | chaque OGG : taille et sources qui le référencent |
| `videos` | chaque vidéo : taille et sources qui le référencent |
| `unreferenced` | assets PNG/OGG/vidéo dont aucune source ne dépend |

`referencedBy` remonte les fichiers sources (YAML, CSS, JS) qui référencent l'asset. Les
références sont résolues depuis les YAML des compendiums, les feuilles de style et les scripts,
y compris sous forme encodée (`%20`) ou en template littéral JavaScript.

## Conversion des images (`pnpm media:convert:images`)

Convertit les PNG du module en WebP via Sharp, sans toucher aux références ni supprimer les
originaux — cette commande ne fait que la conversion.

```bash
pnpm media:convert:images                          # dry-run : projection, aucun asset modifié
pnpm media:convert:images --write                  # convertit les PNG et produit conversion-table.json
pnpm media:convert:images --write --quality 90     # force la qualité de tous les profils
pnpm media:convert:images --help                   # aide
```

### Profils de compression

Les profils sont appliqués selon le sous-dossier. Chaque profil fixe une qualité Sharp, un mode
(`lossless` ou avec perte) et un `effort` (niveau de compression WebP, 0-6) :

| Répertoire | Profil | Qualité | Mode | Effort |
|---|---|---|---|---|
| `assets/ui/` | `ui` | 92 | avec perte | 4 |
| `assets/images/icons/` | `icon` | — | `lossless` | 4 |
| `assets/images/tokens/`, `assets/images/frames/` | `token` | 87 | avec perte | 4 |
| `assets/images/avatar/` | `portrait` | 85 | avec perte | 4 |
| `assets/images/illustrations/`, `assets/elements/`, `assets/pages/` | `illustration` | 82 | avec perte | 4 |
| `assets/images/battlemaps/`, `assets/images/maps/`, `assets/landing-page/maps/` | `map` | 88 | avec perte | 4 |
| autres | `default` | 85 | avec perte | 4 |

La liste se modifie dans `tools/media.config.mjs` (`IMAGE_PROFILES`) : une entrée =
`{ profile, match, quality, lossless, effort }`, où `match` est une expression régulière
appliquée au chemin de l'asset. La première entrée qui correspond gagne ; la dernière sert de
repli (`match: /^/`).

`quality: null` signifie « laisser Sharp décider » (cas du profil `icon` en `lossless`).

### Override global de la qualité

`--quality <n>` force la qualité de **tous** les profils (0-100). Le mode `lossless` et l'`effort`
sont conservés ; seule la qualité est remplacée. La valeur est appliquée au rapport
(`qualityOverride`) et au manifeste, ce qui rend l'override traçable.

```bash
pnpm media:convert:images --write --quality 90
```

Attention : une qualité plus haute produit des fichiers plus lourds (331 PNG : 280 Mo avec les
profils par défaut, 291 Mo en `--quality 90`).

### L'effort WebP : pourquoi 4 par défaut

L'`effort` (0-6, 4 par défaut chez Sharp) trade du temps de calcul contre quelques pourcents de
taille. Mesures réelles sur ce dépôt (21/10/2026) :

| Cas | `effort 4` | `effort 6` | Écart |
|---|---|---|---|
| Icône 1254×1254, `lossless` | 1819 Ko / 739 ms | 1760 Ko / 956 ms | −3 % / ×1,3 |
| Icône 1254×1254, `q90` | 407 Ko / 344 ms | 393 Ko / 6214 ms | −3 % / ×18 |
| Battlemaps (8 fichiers) | 0,6 Mo | 0,5 Mo | −0,4 % / ×2,5 |

Le gain est marginal face au coût : `effort 4` reste le défaut, `effort 6` est disponible dans la
config pour qui veut compresser davantage. À noter aussi que `q100` + `lossless` + `effort 6`
dégrade fortement le temps d'encodage (15 s pour une icône) pour un gain marginal.

### Règles appliquées

- les dimensions d'origine sont conservées (aucun redimensionnement) ;
- le canal alpha est préservé (tokens) ;
- un WebP plus lourd que son PNG n'est pas écrit, le PNG est conservé (`SKIP_LARGER`) ; un WebP
  antérieur, s'il existe, n'est jamais supprimé ;
- les vignettes `assets/scenes/thumb-*.webp` générées par Foundry sont ignorées ;
- un WebP produit par un autre outil est laissé intact (`SKIP_EXISTING`) ;
- un WebP déjà produit par l'outil **au même profil** et pour la **même source** n'est pas
  réencodé (`SKIP_OPTIMIZED`) ; un changement de profil ou de source force le réencodage
  (`REENCODED`).

### Motifs de décision

Chaque image reçoit un motif, reporté dans le rapport et la console :

| Motif | Signification |
|---|---|
| `CONVERTED` | PNG converti en WebP pour la première fois |
| `REENCODED` | WebP réécrit (profil changé, override changé ou source modifiée) |
| `SKIP_LARGER` | WebP plus lourd que le PNG : PNG conservé, WebP non écrit |
| `SKIP_EXISTING` | WebP présent mais produit hors de l'outil : laissé intact |
| `SKIP_OPTIMIZED` | WebP déjà optimisé au profil courant : rien à faire |
| `SKIP_THUMBNAIL` | vignette de scène Foundry : hors périmètre |

### Fichiers produits

Tous gitignorés :

| Fichier | Contenu |
|---|---|
| `conversion-table.json` (racine) | table `PNG → WebP` des PNG dispose d'un WebP valide (un asset écarté pour poids y est absent) |
| `conversion-manifest.json` (racine) | manifeste de conversion : pour chaque asset, le profil et les réglages appliqués, l'empreinte de la source et les tailles obtenues |
| `reports/media-convert-images-<horodatage>.json` | rapport détaillé : répartition par profil, économie totale, décision par fichier, erreurs, vignettes ignorées |

Le manifeste est ce qui rend l'**idempotence au même profil** possible : sans lui, un WebP déjà
présent serait indéterminé (`SKIP_EXISTING`) et ne pourrait pas être réencodé en cas de changement
de profil. Le manifeste n'est écrit qu'en mode `--write` ; en dry-run, il est seulement lu.

## Utilisation

```bash
pnpm media:optimize            # dry-run : rien n'est écrit sur le disque
pnpm media:optimize --write    # applique les conversions
pnpm media:optimize --help     # aide
```

Sans `--write`, l'outil n'écrit **que** le rapport JSON dans `reports/`. C'est le mode par défaut.

## Codes de sortie

| Code | Signification |
|---|---|
| `0` | succès (dry-run ou écriture complète) |
| `1` | échec métier : erreur de conversion, build KO, cleanup bloqué |
| `2` | usage invalide (option inconnue) |

## Ce que fait l'outil

1. **Scan** — inventorie `assets/` (PNG, OGG, MP4/MOV) et analyse les fichiers sources
   (`compendiums/**`, `styles/**`, `scripts/**`, `src/**`, `examples/**`, `module.json`)
   pour y repérer les références `.png`.
2. **Images** — convertit chaque PNG en WebP selon un profil de compression
   (interface, icône, token, portrait, illustration, carte). Si le WebP obtenu n'est pas
   plus léger que le PNG source, il n'est pas écrit et le PNG est conservé. Un WebP déjà
   optimisé au profil courant n'est pas réencodé ; un changement de profil ou de source
   déclenche un réencodage.
3. **Références** — réécrit `.png` → `.webp` dans les sources. Les références préfixées
   `modules/warbound-campaign-content/…`, relatives en CSS (`url("../assets/…")`) et en
   template littéral JavaScript (`modules/${MODULE_ID}/assets/…`) sont prises en charge,
   y compris sous forme encodée (`%20`).
4. **Audio** — réencode les OGG au bitrate cible et pose une balise
   `warbound-media-optimize:96k`. Un fichier déjà porteur de cette balise est ignoré.
5. **Build** — en mode `--write`, relance `pnpm build` (audit + compilation des packs).
6. **Nettoyage** — supprime les PNG devenus inutiles, uniquement si le build est vert
   **et** qu'aucune source ne les référence encore.

## Idempotence

Relancer l'outil ne refait rien : un WebP existant, une référence déjà en `.webp` et un OGG
déjà balisé sont détectés et ignorés. Une seconde exécution en `--write` ne modifie aucun
fichier et le rapport indique `0 PNG supprimé(s)`.

Pour les images, l'idempotence est **au profil près** : le manifeste retient les réglages
appliqués et l'empreinte de la source. Relancer sans changer de profil donne
`331 SKIP_OPTIMIZED` et n'écrit rien ; changer de profil (ou passer `--quality`) donne
`331 REENCODED`. Modifier un PNG source ne réencode que cet asset.

## Rapport JSON

`pnpm media:scan` écrit `reports/media-scan-<horodatage>.json` (inventaire détaillé, décrit
plus haut).

`pnpm media:convert:images` écrit `reports/media-convert-images-<horodatage>.json` :
répartition par profil, économie totale, décision par fichier (avec les deux tailles et le
pourcentage d'économie), erreurs et vignettes Foundry ignorées.

```json
{
  "mode": "WRITE",
  "qualityOverride": null,
  "results": {
    "converted": 331,
    "reencoded": 0,
    "written": 331,
    "skipped": 0,
    "byReason": { "CONVERTED": 331, "REENCODED": 0, "SKIP_LARGER": 0, "SKIP_EXISTING": 0, "SKIP_OPTIMIZED": 0 },
    "savings": { "pngBytes": 695111158, "webpBytes": 293301823, "savedBytes": 401809335, "pngMb": 662.9, "webpMb": 279.8, "savedMb": 383.3, "pct": 58 },
    "perFile": [
      { "assetPath": "assets/images/icons/soin.png", "profile": "icon", "reason": "CONVERTED", "pngBytes": 100000, "webpBytes": 40000, "savingsPct": 60 }
    ]
  },
  "manifest": { "path": "conversion-manifest.json", "entries": 331, "written": true }
}
```

`pnpm media:optimize` écrit `reports/media-optimize-<horodatage>.json` :

```json
{
  "mode": "DRY-RUN",
  "scan": { "images": 331, "audio": 56, "videos": 0, "sources": 513, "filesWithRefs": 136 },
  "results": {
    "images": { "converted": 331, "written": 0, "skipped": 0, "sizes": { "pngBytes": 0, "webpBytes": 0 } },
    "refs": { "migrated": 136, "replacements": 289, "stillReferenced": [] },
    "audio": { "optimized": 0, "skipped": 56 }
  }
}
```

Le dossier `reports/` est ignoré par Git.

## Configuration

Les réglages vivent dans `tools/media.config.mjs` :

| Constante | Rôle |
|---|---|
| `IMAGE_PROFILES` | profils de compression (qualité, mode, effort) et règles d'affectation à un chemin d'asset |
| `DEFAULT_WEBP_EFFORT` | effort WebP par défaut (`4`) |
| `WEBP_EFFORT_RANGE` | bornes acceptées pour l'effort (`0` à `6`) |
| `FOUNDRY_THUMBNAIL_PATTERN` | vignettes de scènes Foundry, exclues de la conversion |
| `MEDIA_REF_EXTENSIONS` | extensions cherchées dans les sources lors du scan |
| `AUDIO_CONFIG.bitrate` | bitrate cible Opus (`96k` par défaut) |
| `AUDIO_CONFIG.encoderCandidates` | ordre de préférence des encodeurs FFmpeg |
| `VIDEO_CONFIG` | stub (MP4/MOV → WebM non implémenté) |
| `SOURCE_TARGETS` | globs des fichiers sources analysés |

## Ordre de grandeur (mesuré sur le dépôt au 21/10/2026)

| Support | Avant | Après | Gain |
|---|---|---|---|
| 331 PNG | 662 Mo | 280 Mo | −58 % |
| 56 OGG | 555 Mo | 414 Mo | −25 % |
| `assets/` total | 1,2 Go | 710 Mo | −42 % |

Les 280 Mo de WebP se répartissent en 48 Mo pour les 167 images hors icônes et 231 Mo pour
les 164 icônes, encodées en `lossless` conformément à l'issue #128. Une icône lossless pèse
en moyenne 1,4 Mo contre 0,3 Mo en `q90` avec perte : un encodage avec perte ramènerait
le total du module à environ 530 Mo.

## Précaution

Le mode `--write` **supprime** les PNG d'origine. Avant de l'appliquer, travaille sur une
branche dédiée et vérifie le diff. En cas de souci, restaure les fichiers avec Git.

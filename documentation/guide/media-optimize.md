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
pnpm media:convert:images            # dry-run : projection, aucun asset modifié
pnpm media:convert:images --write    # convertit les PNG et produit conversion-table.json
pnpm media:convert:images --help     # aide
```

Les profils de qualité sont appliqués selon le sous-dossier :

| Répertoire | Profil | Qualité |
|---|---|---|
| `assets/images/avatar/` | `portrait` | 85, avec perte |
| `assets/images/battlemaps/` | `map` | 88, avec perte |
| `assets/images/tokens/` | `token` | 87, avec perte |
| `assets/images/icons/` | `icon` | lossless |
| autres | `default` | 85, avec perte |

`ui` (92) et `illustration` (82) affinent la ligne « autres » pour l'habillage d'interface et
les illustrations décoratives, volontairement plus compressées.

Règles appliquées :

- les dimensions d'origine sont conservées (aucun redimensionnement) ;
- le canal alpha est préservé (tokens) ;
- les PNG dont le WebP serait plus lourd sont conservés en PNG, et le WebP est supprimé ;
- les vignettes `assets/scenes/thumb-*.webp` générées par Foundry sont ignorées ;
- les PNG déjà convertis (WebP présent) ne sont pas réencodés — l'opération est idempotente.

Deux fichiers sont produits, tous deux gitignorés :

| Fichier | Contenu |
|---|---|
| `conversion-table.json` (racine) | table `PNG → WebP` des PNG dispose d'un WebP valide (un asset écarté pour poids y est absent) |
| `reports/media-convert-images-<horodatage>.json` | rapport détaillé : répartition par profil, WebP écartés pour poids, erreurs, vignettes ignorées |

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
2. **Images** — convertit chaque PNG en WebP selon un profil de qualité
   (interface, icône, token, portrait, illustration, carte). Si le WebP obtenu n'est pas
   plus léger que le PNG source, il est supprimé et le PNG est conservé.
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

## Rapport JSON

`pnpm media:scan` écrit `reports/media-scan-<horodatage>.json` (inventaire détaillé, décrit
plus haut).

`pnpm media:convert:images` écrit `reports/media-convert-images-<horodatage>.json` :
répartition par profil, WebP écartés pour poids (avec les deux tailles), erreurs et vignettes
Foundry ignorées.

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
| `IMAGE_PROFILES` | qualité Sharp WebP par type d'image |
| `IMAGE_PROFILE_RULES` | règles d'affectation d'un profil à un chemin d'asset |
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

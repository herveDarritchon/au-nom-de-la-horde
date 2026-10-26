# Optimisation des médias (`pnpm media:optimize`)

Outils CLI qui inventorient les médias du module, réduisent leur poids
(`PNG → WebP`, `OGG → OGG recalculé`, `MP4/MOV → WebM`) et migrent les références correspondantes.

| Commande | Rôle |
|---|---|
| `pnpm media:scan` | inventaire en lecture seule : fichiers, tailles, références |
| `pnpm media:convert:images` | conversion `PNG → WebP` seule, avec table de conversion |
| `pnpm media:optimize:audio` | optimisation audio OGG seule (dry-run par défaut) |
| `pnpm media:optimize:audio:write` | optimisation audio OGG en mode écriture |
| `pnpm media:optimize:video` | conversion `MP4/MOV → WebM` seule (dry-run par défaut) |
| `pnpm media:optimize:video:write` | conversion `MP4/MOV → WebM` en mode écriture |
| `pnpm media:migrate-refs` | migration des références `.png/.mp4/.mov` dans les sources |
| `pnpm media:optimize` | orchestrateur : conversion + migration + recompilation des packs |

## Prérequis

- **FFmpeg** et **FFprobe** disponibles dans le `PATH` (avec un encodeur Opus : `libopus` de préférence).
  ```bash
  ffmpeg -encoders | grep -i opus
  ffprobe -version
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

## Optimisation audio (`pnpm media:optimize:audio`)

Réencode les fichiers OGG/OGA au bitrate cible via FFmpeg. Le fichier original est remplacé
in-place : aucun renommage d'extension, aucune référence à mettre à jour.

```bash
pnpm media:optimize:audio          # dry-run : liste les fichiers à traiter
pnpm media:optimize:audio:write    # réencode en écriture
```

### Profils de bitrate

| Répertoire | Profil | Bitrate |
|---|---|---|
| `assets/musics/ambient/` | `ambient` | 128 kbps |
| `assets/musics/sfx/` | `sfx` | 96 kbps |
| autres | `default` | 96 kbps |

### Règles appliquées

- l'encodeur Opus est préféré (`libopus`) avec repli sur Vorbis (`libvorbis`) ;
- le fichier est réencodé vers `.tmp.ogg`, puis la durée et le codec sont validés
  (tolérance ±2 %) avant de renommer sur l'original ;
- **idempotence** : un fichier portant déjà la balise metadata `warbound-media-optimize:<bitrate>`
  est ignoré (`SKIP_OPTIMIZED`) ; un fichier dont le bitrate mesuré est déjà inférieur ou égal
  au bitrate cible est aussi ignoré.

## Conversion des vidéos (`pnpm media:optimize:video`)

Convertit les fichiers MP4/MOV en WebM via FFmpeg (codec VP9 en mode qualité constante).
L'original **n'est pas supprimé** : les deux fichiers coexistent jusqu'à ce que les références
soient migrées et les originaux supprimés manuellement si souhaité.

```bash
pnpm media:optimize:video          # dry-run : liste les vidéos à convertir
pnpm media:optimize:video:write    # convertit en écriture
```

### Profils VP9

| Répertoire | Profil | CRF | tileColumns | threads |
|---|---|---|---|---|
| `assets/videos/scenes/` | `scene` | 28 | 2 | 4 |
| `assets/videos/tokens/` | `token` | 33 | 1 | 2 |
| autres | `default` | 33 | — | — |

Un CRF plus bas = meilleure qualité et fichier plus lourd. Le profil `scene` (CRF 28) cible
les fonds de scène où la qualité visuelle est prioritaire ; le profil `token` (CRF 33)
préfère la légèreté pour des animations de petite taille.

### Règles appliquées

- codec de sortie : `libvpx-vp9`, conteneur `.webm` ;
- **idempotence** : un fichier WebM déjà porteur de la balise metadata
  `warbound-media-optimize:vp9:<crf>` n'est pas réencodé ;
- la durée de la vidéo de sortie est vérifiée (tolérance ±2 %) avant que le fichier
  soit conservé ;
- l'original `.mp4`/`.mov` n'est **jamais supprimé automatiquement** par cet outil.

## Migration des références dans les compendiums (`pnpm media:migrate-refs`)

Après conversion des images et des vidéos, les fichiers sources (YAML des compendiums, CSS,
scripts JS, `module.json`) contiennent encore les anciens chemins `.png`, `.mp4` et `.mov`.
`pnpm media:migrate-refs` les réécrit vers `.webp` et `.webm`.

```bash
pnpm media:migrate-refs              # dry-run : affiche les remplacements prévus sans écrire
pnpm media:migrate-refs --write      # applique les remplacements, puis lance pnpm packs:audit
```

### Ce qui est mis à jour

L'outil lit `conversion-table.json` (produit par `pnpm media:convert:images`) et ne réécrit
que les chemins dont un équivalent converti existe. Les champs YAML concernés dans les
acteurs, items, scènes, playlists et journaux :

| Champ YAML | Objet Foundry |
|---|---|
| `img:` | portrait d'acteur, icône d'item |
| `prototypeToken.texture.src:` | texture du token prototypeToken d'un acteur |
| `background.src:` | image de fond d'une scène |
| `texture.src:` | texture d'une tuile dans une scène |
| `sounds[].path:` | piste audio dans une playlist |
| HTML inline dans journaux | `<img src="...">` dans les pages de journaux |

Les chemins en préfixe `modules/warbound-campaign-content/…`, les URLs relatives CSS
(`url("../assets/…")`) et les templates littéraux JavaScript (`modules/${MODULE_ID}/assets/…`)
sont tous pris en charge, y compris sous forme encodée (`%20`).

Après un `--write`, `pnpm packs:audit` est lancé automatiquement pour vérifier qu'aucune
référence cassée n'a été introduite. Si l'audit échoue, aucun pack n'est recompilé.

### Mise à jour manuelle d'un nom de fichier

Si tu renommes un asset manuellement (sans passer par la conversion), `conversion-table.json`
ne contiendra pas cette correspondance. Procède ainsi :

1. Renomme le fichier asset dans `assets/`.
2. Lance `pnpm media:scan` pour vérifier les sources qui le référencent encore sous l'ancien nom.
3. Modifie les YAML concernés à la main (ou via `sed`) pour remplacer l'ancien chemin.
4. Lance `pnpm packs:audit` pour valider.
5. Lance `pnpm build` pour recompiler les packs.

## Utilisation — Orchestrateur (`pnpm media:optimize`)

```bash
pnpm media:optimize                              # dry-run complet
pnpm media:optimize:dry-run                      # alias du dry-run
pnpm media:optimize --write                      # applique les étapes sélectionnées
pnpm media:optimize --write --type images \
  --update-references                            # convertit, migre et rebuild les packs
pnpm media:optimize --clean                      # liste les PNG supprimables
pnpm media:optimize --clean --confirm            # supprime après validation et audit
pnpm media:optimize --write --clean --confirm    # pipeline complet puis nettoyage
pnpm media:optimize --help                       # aide
```

Sans `--write`, l'outil n'écrit **que** le rapport JSON dans `reports/`. C'est le mode par défaut.

Options :

| Option | Effet |
|---|---|
| `--type images\|audio\|video\|all` | limite les étapes au type de média demandé (`all` par défaut) |
| `--quality <n>` | override global WebP entre 0 et 100 |
| `--update-references` | migre les références PNG/vidéo du module avec `conversion-table.json` |
| `--clean` | prévisualise les suppressions, sans modifier les fichiers |
| `--clean --confirm` | supprime les PNG validés, avec dépôt Git propre et audit réussi |
| `--force-clean` | contourne le garde Git pour `--clean --confirm` |

Le rebuild `pnpm build` est exécuté en mode écriture lorsque `--update-references` ou `--clean`
est activé. Avec `--write --clean`, la migration des références est donc incluse avant le build.
`--clean` seul liste les candidats ; l'option `--confirm` est obligatoire pour supprimer.
Sans `--force-clean`, le dépôt Git doit être propre avant une suppression réelle.

## Codes de sortie

| Code | Signification |
|---|---|
| `0` | succès (dry-run ou écriture complète) |
| `1` | échec métier : erreur de conversion, build KO, cleanup bloqué |
| `2` | usage invalide (option inconnue) |

## Ce que fait l'outil

1. **Scan** — inventorie `assets/` (PNG, OGG, MP4/MOV) et analyse les fichiers sources
   (`compendiums/**`, `styles/**`, `scripts/**`, `src/**`, `examples/**`, `module.json`)
   pour y repérer les références `.png`, `.mp4` et `.mov`.
2. **Images** — convertit chaque PNG en WebP selon un profil de compression
   (interface, icône, token, portrait, illustration, carte). Si le WebP obtenu n'est pas
   plus léger que le PNG source, il n'est pas écrit et le PNG est conservé. Un WebP déjà
   optimisé au profil courant n'est pas réencodé ; un changement de profil ou de source
   déclenche un réencodage.
3. **Références** — réécrit `.png` → `.webp` et `.mp4`/`.mov` → `.webm` dans les sources. Les
   références préfixées `modules/warbound-campaign-content/…`, relatives en CSS
   (`url("../assets/…")`) et en template littéral JavaScript (`modules/${MODULE_ID}/assets/…`)
   sont prises en charge, y compris sous forme encodée (`%20`).
4. **Audio** — réencode les OGG au bitrate cible et pose une balise
   `warbound-media-optimize:<bitrate>`. Un fichier déjà porteur de cette balise est ignoré.
5. **Vidéo** — convertit les MP4/MOV en WebM VP9 au profil CRF adapté au répertoire.
   Un WebM déjà porteur de la balise `warbound-media-optimize:vp9:<crf>` est ignoré.
6. **Build** — avec `--write --update-references` ou `--write --clean`, relance `pnpm build`
   (audit + compilation des packs).
7. **Nettoyage** — supprime les PNG devenus inutiles, uniquement si le build est vert
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
| `AUDIO_PROFILES` | profils de bitrate audio par répertoire (`128k` ambient, `96k` sfx/défaut) |
| `AUDIO_CONFIG.bitrate` | bitrate cible Opus par défaut (`96k`) |
| `AUDIO_CONFIG.encoderCandidates` | ordre de préférence des encodeurs FFmpeg |
| `VIDEO_PROFILES` | profils VP9 par répertoire : CRF, tileColumns, threads |
| `VIDEO_CONFIG` | codec de sortie (`libvpx-vp9`), conteneur (`webm`), préfixe de balise idempotence, tolérance durée (2 %) |
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

## Workflow complet — optimiser un module non optimisé

Voici le workflow pas-à-pas pour partir d'un module dont les assets sont bruts (PNG/MP4/OGG
non optimisés) et arriver à un module entièrement optimisé avec tous les compendiums à jour.

### Étape 1 — Inventaire (lecture seule)

```bash
pnpm media:scan
```

Inspecte le rapport JSON généré dans `reports/media-scan-*.json` : nombre de PNG, OGG, vidéos ;
lesquels sont référencés dans les YAML ; lesquels sont orphelins. Aucun fichier n'est modifié.

### Étape 2 — Conversion des images

```bash
# Projection : voir ce qui serait converti, sans écrire
pnpm media:convert:images

# Appliquer la conversion
pnpm media:convert:images --write
```

Produit `conversion-table.json` et `conversion-manifest.json` à la racine du projet.
Les PNG originaux sont conservés à ce stade.

### Étape 3 — Migration des références YAML

```bash
# Voir les remplacements prévus (acteurs, items, scènes, playlists, journaux)
pnpm media:migrate-refs

# Appliquer (réécrit .png→.webp dans tous les YAML + sources, puis packs:audit)
pnpm media:migrate-refs --write
```

Tous les champs `img:`, `prototypeToken.texture.src:`, `background.src:`, `texture.src:`,
`sounds[].path:` et les `<img src="...">` dans les journaux sont mis à jour automatiquement.
Un audit est lancé après l'écriture pour détecter toute référence cassée.

### Étape 4 — Optimisation audio

```bash
# Projection
pnpm media:optimize:audio

# Appliquer
pnpm media:optimize:audio:write
```

Les fichiers OGG sont réencodés en place (même nom, même extension). Aucune référence à
mettre à jour.

### Étape 5 — Conversion vidéo

```bash
# Projection
pnpm media:optimize:video

# Appliquer
pnpm media:optimize:video:write
```

Les fichiers WebM sont créés à côté des originaux MP4/MOV. Si des vidéos sont référencées
dans les YAML, relancer `pnpm media:migrate-refs --write` pour mettre à jour les chemins
`.mp4`/`.mov` → `.webm`.

### Étape 6 — Recompilation des packs

```bash
pnpm build
```

Lance l'audit des assets puis recompile les LevelDB dans `packs/`. Cette étape est
automatique après `media:migrate-refs --write`, mais un `pnpm build` explicite est
recommandé pour valider l'ensemble.

### Étape 7 — Nettoyage des PNG d'origine (optionnel, irréversible)

```bash
# Lister les PNG supprimables (aucun fichier modifié)
pnpm media:optimize --clean

# Supprimer (nécessite un dépôt Git propre et un build vert)
pnpm media:optimize --clean --confirm
```

Cinq gardes sont vérifiées avant toute suppression : état Git propre, absence de collision
(deux PNG pointant vers le même WebP), validation Sharp du WebP, WebP plus léger que le PNG,
aucune référence YAML restante.

### Raccourci — tout enchaîner via l'orchestrateur

Les étapes 2 à 6 peuvent être combinées en une seule commande :

```bash
pnpm media:optimize --write --update-references
```

Cela exécute scan → conversion images → migration des références → audio → build en séquence.
La conversion vidéo peut être ajoutée avec `--type all` (déjà inclus par défaut).

## Précaution

`--write` **ne supprime pas** les fichiers source (PNG, MP4, MOV). Ces fichiers restent
présents jusqu'à ce que `--clean --confirm` soit explicitement utilisé (étape 7 ci-dessus).

Avant `--clean --confirm`, travaille sur une branche dédiée et vérifie le diff Git.
En cas de problème, restaure les fichiers supprimés avec :

```bash
git restore assets/
```

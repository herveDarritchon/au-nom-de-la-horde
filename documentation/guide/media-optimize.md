# Optimisation des médias (`pnpm media:optimize`)

Outil CLI en ligne de commande qui réduit le poids des médias du module
(`PNG → WebP`, `OGG → OGG recalculé`) et migre les références correspondantes.

## Prérequis

- **FFmpeg** disponible dans le `PATH` (avec un encodeur Opus : `libopus` de préférence).
  ```bash
  ffmpeg -encoders | grep -i opus
  ```
- **Node.js** ≥ 20 et **pnpm**.
- `sharp` est installé automatiquement comme dépendance de développement (`pnpm install`).

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

Chaque exécution écrit `reports/media-optimize-<horodatage>.json` :

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
| `AUDIO_CONFIG.bitrate` | bitrate cible Opus (`96k` par défaut) |
| `AUDIO_CONFIG.encoderCandidates` | ordre de préférence des encodeurs FFmpeg |
| `VIDEO_CONFIG` | stub (MP4/MOV → WebM non implémenté) |
| `SOURCE_TARGETS` | globs des fichiers sources analysés |

## Ordre de grandeur (mesuré sur le dépôt au 21/10/2026)

| Support | Avant | Après | Gain |
|---|---|---|---|
| 331 PNG | 663 Mo | 96 Mo | −85 % |
| 56 OGG | 555 Mo | 414 Mo | −25 % |
| `assets/` total | 1,2 Go | 562 Mo | −53 % |

## Précaution

Le mode `--write` **supprime** les PNG d'origine. Avant de l'appliquer, travaille sur une
branche dédiée et vérifie le diff. En cas de souci, restaure les fichiers avec Git.

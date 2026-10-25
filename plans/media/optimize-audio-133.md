# Plan d'implémentation — Optimisation du bitrate des fichiers OGG avec FFmpeg libvorbis

**Issue** : #133
**ADR** : n/a
**Modules probablement impactés** : `tools/optimizeAudio.mjs`, `tools/media.config.mjs`, `package.json`, `src/tools/mediaAudio.mjs` (si logique de profil y est extraite)

---

## 1. Objectif

Compléter l'outil d'optimisation audio OGG déjà partiellement implémenté pour satisfaire les critères d'acceptation de l'issue #133 :

- profils de bitrate par répertoire (128 kbps pour `ambient/`, 96 kbps pour `sfx/`) ;
- script autonome `pnpm media:optimize:audio` avec flag `--dry-run` ;
- rapport affichant bitrate avant/après et économie en Mo.

---

## 2. Périmètre

### Inclus

- Ajout de `AUDIO_PROFILES` dans `tools/media.config.mjs` (modèle de `IMAGE_PROFILES`).
- Mise à jour de `tools/optimizeAudio.mjs` : sélection du profil par chemin asset, rapport dry-run enrichi, point d'entrée CLI autonome.
- Mise à jour de `src/tools/mediaAudio.mjs` si la logique de sélection de profil y est placée (cohérence avec les fonctions pures existantes).
- Ajout du script `media:optimize:audio` (et `media:optimize:audio:write`) dans `package.json`.
- Tests unitaires Vitest couvrant la sélection de profil et le rapport dry-run.

### Hors périmètre

- Conversion de format (les fichiers sont déjà OGG).
- Migration des chemins YAML (même nom, même extension).
- Intégration dans le pipeline `mediaOptimize.mjs` — déjà fait via `--type audio`.

---

## 3. État actuel

| Fichier | État |
|---|---|
| `tools/optimizeAudio.mjs` | Implémenté : ré-encodage, validation, idempotence. **Manque** : profils par répertoire, point d'entrée CLI, rapport dry-run détaillé. |
| `tools/media.config.mjs` | `AUDIO_CONFIG.bitrate = "96k"` — plat, pas de profils. |
| `src/tools/mediaAudio.mjs` | Fonctions pures complètes (`parseBitrate`, `shouldOptimizeAudio`, `selectEncoder`, …). |
| `package.json` | `media:optimize` et `media:optimize:dry-run` existent. **Manque** : `media:optimize:audio`. |
| `tools/optimizeAudio.test.mjs` | Tests d'intégration FFmpeg existants. **Manque** : cas profil ambient vs sfx. |

---

## 4. Décisions d'architecture

- Modéliser `AUDIO_PROFILES` comme `IMAGE_PROFILES` : tableau de `{ profile, match, bitrate }`, évalué dans l'ordre, premier match retenu.
- La sélection de profil (`selectAudioProfile`) va dans `src/tools/mediaAudio.mjs` (logique pure, testable sans FFmpeg).
- `tools/optimizeAudio.mjs` expose un point d'entrée CLI (`isMainModule()` déjà présent dans `mediaOptimize.mjs` — reproduire ce pattern) qui lit les flags `--dry-run` / `--write`.
- En dry-run, calculer le gain estimé par FFprobe (bitrate source × durée × facteur de réduction) sans encoder.

---

## 5. Plan de travail

### Étape 1 — `tools/media.config.mjs`

Remplacer `AUDIO_CONFIG.bitrate: "96k"` par `AUDIO_CONFIG.defaultBitrate: "96k"` et ajouter :

```js
export const AUDIO_PROFILES = [
  { profile: "ambient", match: /^assets\/musics\/ambient\//, bitrate: "128k" },
  { profile: "sfx",     match: /^assets\/musics\/sfx\//,     bitrate: "96k"  },
  { profile: "default", match: /^/,                          bitrate: "96k"  }
];
```

### Étape 2 — `src/tools/mediaAudio.mjs`

Ajouter `selectAudioProfile(assetPath, profiles)` :
- itère `profiles`, retourne le premier `profile` dont `match.test(assetPath)` est vrai ;
- retourne le profil `"default"` si aucun ne correspond.

### Étape 3 — `tools/optimizeAudio.mjs`

- Importer `AUDIO_PROFILES` et `selectAudioProfile`.
- Dans `run()` : pour chaque fichier audio, déterminer `profile = selectAudioProfile(audio.assetPath, AUDIO_PROFILES)` et utiliser `profile.bitrate` comme cible (au lieu de `AUDIO_CONFIG.bitrate`).
- Construire le marqueur d'idempotence avec `profile.bitrate` (et non plus le bitrate global).
- Dry-run : calculer gain estimé = `Math.max(0, sourceBitrateBytes - targetBitrateBytes) × duration` en octets, accumuler pour le rapport.
- Ajouter point d'entrée CLI (`isMainModule()` pattern) : parse `--dry-run` / `--write`, appelle `scan()` + `run()`, affiche rapport.

### Étape 4 — `package.json`

```json
"media:optimize:audio": "node ./tools/optimizeAudio.mjs --dry-run",
"media:optimize:audio:write": "node ./tools/optimizeAudio.mjs --write"
```

### Étape 5 — Tests

- `src/tools/mediaAudio.test.mjs` : tester `selectAudioProfile` (ambient → 128k, sfx → 96k, autre → 96k).
- `tools/optimizeAudio.test.mjs` : tester dry-run avec fichiers à différents bitrates, vérifier que le profil ambient sélectionne 128k.

---

## 6. Fichiers modifiés

| Fichier | Modification |
|---|---|
| `tools/media.config.mjs` | Ajouter `AUDIO_PROFILES` ; renommer `bitrate` → `defaultBitrate` dans `AUDIO_CONFIG`. |
| `src/tools/mediaAudio.mjs` | Ajouter `selectAudioProfile`. |
| `tools/optimizeAudio.mjs` | Profils, point d'entrée CLI, rapport dry-run enrichi. |
| `package.json` | Ajouter `media:optimize:audio` et `media:optimize:audio:write`. |
| `src/tools/mediaAudio.test.mjs` | Cas `selectAudioProfile`. |
| `tools/optimizeAudio.test.mjs` | Cas profil + dry-run. |

---

## 7. Tests attendus

| Test | Type | Description |
|---|---|---|
| `selectAudioProfile` profil ambient | Vitest unitaire | `assets/musics/ambient/foo.ogg` → profil 128k |
| `selectAudioProfile` profil sfx | Vitest unitaire | `assets/musics/sfx/foo.ogg` → profil 96k |
| `selectAudioProfile` fallback | Vitest unitaire | chemin inconnu → profil default 96k |
| dry-run sans écriture | Vitest + FFmpeg | rapport affiche candidats ; aucun fichier modifié |
| `shouldOptimizeAudio` avec marker ambient | Vitest unitaire | fichier déjà marqué 128k ignoré |

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Renommage `bitrate` → `defaultBitrate` casse `mediaOptimize.mjs` | Vérifier tous les imports de `AUDIO_CONFIG.bitrate` et mettre à jour. |
| Marker d'idempotence différent par profil → fichiers déjà optimisés ré-encodés | Construire le marker avec `profile.bitrate` : `warbound-media-optimize:128k` vs `warbound-media-optimize:96k`. |
| FFprobe ne retourne pas de bitrate sur certains fichiers | Conserver le comportement actuel : `currentBitrate === null` → optimiser. |

---

## 9. Critères d'arrêt

- `pnpm media:optimize:audio --dry-run` liste les candidats avec bitrate avant/après estimé et gain total.
- Seuls les fichiers dont le bitrate source dépasse la cible de leur profil sont candidats.
- Aucun fichier n'est modifié en mode dry-run.
- `pnpm media:optimize:audio:write` ré-encode, valide (codec + durée), remplace l'original.
- Tests unitaires et intégration passent (`pnpm test`).
- `pnpm build` sort avec code 0 (audit assets).
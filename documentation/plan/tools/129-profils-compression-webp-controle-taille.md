# Plan d'implémentation — feat(media): paramétrer la compression WebP par profil et contrôler la taille

**Issue** : herveDarritchon/au-nom-de-la-horde#129
**Bloqué par** : #128 (conversion PNG → WebP) — mergé dans `main` via la PR #137 (`08c05eb`)

---

## 1. Objectif

Rendre le profil de compression WebP réellement pilotable : qualité, mode `lossless` et
effort d'encodage dans `tools/media.config.mjs`, override global `--quality` sur la CLI,
contrôle de taille explicite (`SKIP_LARGER`) et rapport JSON enrichi (taille avant/après par
fichier, économie en %, raisons de skip).

---

## 2. État de départ

`#129` a été découpé à partir de `#126` le 21/10/2026, avant la livraison de `#128`. Une
partie du travail a donc été absorbée par `#126` et livrée dans `main` :

| Attendu par l'issue | État dans `main` avant ce chantier |
|---|---|
| Profils de qualité externalisés dans `tools/media.config.mjs` | ✅ `IMAGE_PROFILES` (qualité + `lossless`) |
| Réglables sans toucher au code de conversion | ✅ |
| **Effort d'encodage Sharp configurable** | ❌ absent (`sharp.webp()` garde son défaut) |
| Profils par pattern de chemin dans la config | ⚠️ découpés en deux (`IMAGE_PROFILES` + `IMAGE_PROFILE_RULES`) |
| `--quality <n>` en override global | ✅ livré avec #128 (`run(images, write, qualityOverride)`) |
| WebP plus lourd que le PNG → PNG conservé, motif `SKIP_LARGER` | ✅ livré avec #128 |
| Rapport : taille avant/après par fichier | ✅ `convertedDetails` / `perFile` |
| Rapport : économie en % par fichier | ✅ `savingsPct` |
| Rapport : économies totale (Mo avant / Mo après / %) | ⚠️console seule, absente du JSON |
| Rapport : raisons de skip | ⚠️ `SKIP_LARGER` seul, pas de vocabulaire complet |
| **Idempotence « au même profil »** | ⚠️ tout WebP existant est ignoré : changer un profil ne réencode rien |

Le dernier point est le trou fonctionnel : ajuster la compression est le titre de l'issue,
mais sur un dépôt déjà converti le réglage n'a aucun effet. C'est aussi le préalable à
`#131` (intégration au pipeline de build), qui régénérera les WebP à chaque build.

---

## 3. Décisions d'architecture

- **Une seule liste de profils** : `IMAGE_PROFILES` devient une liste d'entrées
  `{ profile, match, quality, lossless, effort }`. Le chemin et ses réglages tiennent dans
  la même entrée : ajouter un profil se fait à un seul endroit. `resolveImageProfile()`
  (existant) continue de fonctionner tel quel, car il lit `rule.profile` et `rule.match`.
- **Effort d'encodage** : `effort` est un paramètre `sharp.webp()` (0-6, défaut 4). Valeur
  par défaut `4` partout — identique au défaut de Sharp, donc les WebP validés par #128
  restent octet pour octet identiques. Le guide documente le gain mesuré par profil.
- **Manifeste de conversion** : `conversion-manifest.json` (racine, gitignoré) enregistre,
  pour chaque asset traité, les réglages utilisés, l'empreinte du PNG source et les deux
  tailles. C'est la seule façon de savoir à quel profil un WebP existant a été produit.
  - WebP présent **sans** entrée de manifeste → `SKIP_EXISTING` (asset tiers, intact).
  - Entrée de manifeste, **mêmes réglages et même source** → `SKIP_OPTIMIZED` (idempotence).
  - Entrée de manifeste, **réglages ou source différents** → réencodage (`REENCODED`).
  - Réencodage plus lourd que le PNG → `SKIP_LARGER` : le WebP produit est supprimé et
    l'éventuel WebP antérieur est **conservé** (jamais de perte de donnée).
- **Empreinte source** : SHA-1 tronqué du PNG. Détecte un PNG modifié (artwork changé) que
  la seule comparaison de taille ne verrait pas.
- **Vocabulaire de skip** : `CONVERTED`, `REENCODED`, `SKIP_LARGER`, `SKIP_EXISTING`,
  `SKIP_OPTIMIZED`, `SKIP_THUMBNAIL`. Chaque fichier du rapport porte son motif.
- **Économie totale** : le rapport JSON expose un objet `savings` (octets, Mo, %) calculé sur
  l'ensemble des candidats, et non plus sur le seul sous-ensemble converti.
- **Compatibilité** : `run()` passe à un objet d'options (`{ write, quality, manifest }`) ;
  `mediaOptimize.mjs` est adapté et continue de fonctionner sans manifeste.

---

## 4. Plan de travail

### Étape 1 — `tools/media.config.mjs`

- Fusionner `IMAGE_PROFILES` et `IMAGE_PROFILE_RULES` en une liste unique.
- Ajouter `effort` à chaque profil, avec la table de correspondance de l'issue.
- Ajouter `DEFAULT_WEBP_EFFORT` (4) et `WEBP_EFFORT_RANGE` (0-6).

### Étape 2 — `src/tools/mediaPaths.mjs` + `src/tools/conversionManifest.mjs`

- `resolveImageSettings(assetPath, profiles)` : profil + réglages effectifs.
- Module pur du manifeste : signature des réglages, entrée, fusion, test de fraîcheur.

### Étape 3 — `tools/convertImages.mjs`

- `run(images, { write, quality, manifest })` : application de l'override, motif de skip
  par fichier, réencodage si le profil ou la source a changé, garde-fou `SKIP_LARGER` qui
  préserve un WebP antérieur.
- `conversion-table.json` : inchangé (contrat de #128).
- Rapport JSON : `savings`, `byReason`, `perFile` avec `reason`.
- Écriture du manifeste en mode `--write`.

### Étape 4 — `tools/manifestStore.mjs` + `tools/mediaOptimize.mjs`

- Lecture/écriture du manifeste, empreinte des fichiers.
- `media:optimize` lit et réécrit le manifeste pour rester cohérent.

### Étape 5 — Tests

- `src/tools/conversionManifest.test.mjs` : signature, entrée, fusion, fraîcheur.
- `src/tools/mediaPaths.test.mjs` : résolution des réglages, effort, profil par défaut.
- `tools/convertImages.test.mjs` : override global, effort appliqué, `SKIP_LARGER`,
  réencodage sur changement de profil, idempotence au même profil, économie totale.

### Étape 6 — Documentation

- `documentation/guide/media-optimize.md` : section profils (qualité/lossless/effort), override
  `--quality`, manifeste, vocabulaire de skip, table des gains mesurés par `effort`.
- `documentation/plan/tools/129-*.md` : ce plan.

---

## 5. Fichiers modifiés

| Fichier | Action |
|---|---|
| `tools/media.config.mjs` | liste unique de profils, `effort`, constantes |
| `src/tools/mediaPaths.mjs` | `resolveImageSettings()` |
| `src/tools/conversionManifest.mjs` | logique pure du manifeste (nouveau) |
| `src/tools/conversionManifest.test.mjs` | tests du manifeste (nouveau) |
| `tools/manifestStore.mjs` | lecture/écriture du manifeste, empreinte (nouveau) |
| `tools/convertImages.mjs` | options, motifs de skip, réencodage, rapport enrichi |
| `tools/convertImages.test.mjs` | tests #129 |
| `tools/mediaOptimize.mjs` | passage aux options, cohérence du manifeste |
| `.gitignore` | `conversion-manifest.json` |
| `documentation/guide/media-optimize.md` | profils, override, manifeste, skip, mesures |
| `documentation/plan/tools/129-*.md` | ce plan |

---

## 6. Tests

Runner : **`node --test`**

- `node --test src/tools/conversionManifest.test.mjs` — logique du manifeste
- `node --test tools/convertImages.test.mjs` — conversion, skip, override, réencodage
- `pnpm test` — suite complète
- `pnpm media:convert:images` (dry-run) — projection, aucun asset modifié
- `pnpm media:convert:images --write` (bac à sable) — 331 WebP, manifeste, table
- `pnpm media:convert:images --write` (2ᵉ passage) — 0 réencodage, `SKIP_OPTIMIZED`
- `pnpm media:optimize` — non régressé

---

## 7. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Le réencodage détruit un WebP valide si le nouveau est plus lourd | Garde-fou : en `SKIP_LARGER`, le WebP antérieur est conservé, seul le WebP nouvellement produit est supprimé. Test dédié |
| Un manifeste obsolèteprovient un réencodage inutile | L'empreinte du PNG est comparée : source et réglages identiques → `SKIP_OPTIMIZED` |
| Un manifeste corrompu fait planter l'outil | Lecture tolérante : JSON invalide → manifeste vide + avertissement, comportement conservateur (`SKIP_EXISTING`) |
| Le gain de `effort` est marginal et ralentit l'encodage | `effort` à 4 par défaut (défaut Sharp, sorties #128 inchangées) ; le guide documente le gain mesuré par profil, dont le surcoût temporel |
| Le changement de signature d'API casse `media:optimize` | `run()` à objet d'options : les deux appelants (`mediaOptimize.mjs`, tests) sont mis à jour dans le même commit |
| La surcharge de `run()` par un objet d'options casse des appelants externes | `run()` n'est exporté que depuis `tools/convertImages.mjs`, consommé par `tools/mediaOptimize.mjs` et les tests — périmètre fermé et vérifié par recherche |

---

## 8. Critères d'arrêt

- [ ] `pnpm media:convert:images --quality 90` applique la qualité 90 à tous les profils
- [ ] `tools/media.config.mjs` contient les profils (qualité, `lossless`, `effort`) modifiables
- [ ] Le rapport JSON expose l'économie totale (Mo avant / Mo après / %)
- [ ] Relancer au même profil ne modifie aucun WebP (`SKIP_OPTIMIZED`)
- [ ] Changer un profil réencode les assets concernés (`REENCODED`)
- [ ] Les WebP plus lourds sont conservés en PNG, signalés `SKIP_LARGER`, sans perte
- [ ] `pnpm test` vert
- [ ] `conversion-manifest.json` gitignoré

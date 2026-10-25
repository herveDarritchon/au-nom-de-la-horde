# Plan d'implémentation — Intégrer l'optimisation au pipeline de build

**Issue**: herveDarritchon/au-nom-de-la-horde#131
**ADR**: N/A
**Bloqué par**: #130 (migrateRefs CLI — déjà livré)

## 1. Objectif

Étendre `tools/mediaOptimize.mjs` (orchestre le pipeline complet) avec les options CLI manquantes : `--type`, `--quality`, `--update-references`, `--clean`/`--confirm`. Ajouter le script `media:optimize:dry-run` dans `package.json`.

## 2. Périmètre

### Inclus
- Extension de `parseArgs()` : 4 nouvelles options + `--confirm`
- Adaptation de `main()` : sélection des étapes selon `--type` et `--update-references`
- Guard `--clean` : requiert `--confirm`
- Passage de `--quality <n>` à `convertImages.run()` (déjà supporté en interne)
- Ajout de `media:optimize:dry-run` dans `package.json`
- Mise à jour des tests `parseArgs` dans `mediaOptimize.test.mjs`

### Hors périmètre
- Modification de `convertImages.mjs`, `migrateRefs.mjs`, `optimizeAudio.mjs`
- Modification du format du rapport JSON (champs existants inchangés)
- Support de `--type audio` ou `--type all` (scope limité à `images` pour ce ticket)

## 3. État avant implémentation

`tools/mediaOptimize.mjs` **existe** et orchestre déjà le pipeline complet. Options actuelles : `--write`, `--dry-run`, `--help`. Le nettoyage PNG et la migration de références se déclenchent automatiquement avec `--write`, sans contrôle granulaire.

`convertImages.run()` accepte déjà `quality` dans ses options (`tools/convertImages.mjs:193`).

## 4. Décisions d'architecture

- `--type images|audio|all` — filtre les étapes du pipeline ; `all` = comportement actuel `--write`
- `--update-references` — active la migration YAML ; sans ce flag, seule la conversion a lieu
- `--clean` — active le nettoyage des PNG originaux ; requiert `--confirm` pour éviter les suppressions accidentelles
- `--quality <n>` — override global transmis à `convertImages.run({ quality: n })`
- `--write` reste le commutateur "appliquer les modifications" ; les nouvelles options ne changent pas ce contrat
- Mode dry-run : toutes les étapes tournent sans écriture, quel que soit le `--type`

## 5. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `tools/mediaOptimize.mjs` | `parseArgs` : `--type`, `--quality`, `--update-references`, `--clean`, `--confirm` ; `main` : pipeline conditionnel |
| `tools/mediaOptimize.test.mjs` | Tests pour les 5 nouvelles options de `parseArgs` |
| `package.json` | `"media:optimize:dry-run": "node ./tools/mediaOptimize.mjs --dry-run"` |

## 6. Détail des changements

### `parseArgs()` — nouvelles branches

```
--type images|audio|all  → { type: "images"|"audio"|"all" }   défaut : "all"
--quality <n>            → { quality: parseInt(n, 10) }        défaut : null
--update-references      → { updateReferences: true }          défaut : false
--clean                  → { clean: true }                     défaut : false
--confirm                → { confirm: true }                   défaut : false
```

Erreurs à retourner :
- `--type` sans valeur ou valeur inconnue → `Option --type invalide : <val>`
- `--quality` sans valeur ou hors [0,100] → `Option --quality invalide : <val>`
- `--clean` sans `--confirm` → erreur dans `main()`, pas dans `parseArgs()`

### `main()` — pipeline conditionnel

```
type === "images" → convertImages seulement
type === "audio"  → optimizeAudio seulement
type === "all"    → convertImages + optimizeAudio + convertVideos (actuel)

updateReferences → migrateRefs (sinon skippé)
clean + confirm  → cleanupPng  (sinon skippé)
```

Le build `pnpm build` ne tourne que si `write && updateReferences` (migration terminée → recompile).

## 7. Tests attendus

Nouveaux cas dans `mediaOptimize.test.mjs` :

| Cas | Assertion |
|---|---|
| `--type images` | `type === "images"` |
| `--type audio` | `type === "audio"` |
| `--type all` | `type === "all"` |
| `--type invalide` | `error !== null` |
| `--quality 80` | `quality === 80` |
| `--quality 0` | `error !== null` (hors [1,100]) |
| `--quality abc` | `error !== null` |
| `--update-references` | `updateReferences === true` |
| `--clean` | `clean === true` |
| `--confirm` | `confirm === true` |
| `--clean` seul (sans `--confirm`) | `main()` sort avec exit 2 |

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `--clean` sans `--confirm` → suppressions accidentelles | Guard dans `main()` : exit 2 avec message explicite |
| `--quality` hors plage Sharp [1-100] | Validation dans `parseArgs()` |
| `--type images --update-references` sans `--write` | Dry-run silencieux : comportement cohérent avec le reste |
| Régression sur `--write` seul (comportement actuel) | Tests existants `parseArgs` + validation manuelle |

## 9. Critères d'arrêt

- `pnpm media:optimize --dry-run` → rapport produit, 0 fichier modifié
- `pnpm media:optimize --type images --update-references --write` → PNG convertis, YAML migrés, `pnpm build` réussi
- `pnpm media:optimize --clean` sans `--confirm` → exit 2, message d'erreur, aucun PNG supprimé
- `pnpm media:optimize:dry-run` → alias fonctionnel
- `pnpm test` passe (anciens + nouveaux tests)
- FoundryVTT charge le module sans erreur sur http://localhost:31000/game (test manuel)

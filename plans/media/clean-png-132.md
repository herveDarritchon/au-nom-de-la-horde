# Plan d'implémentation — Nettoyer les originaux PNG après migration et validation complètes

**Issue**: herveDarritchon/au-nom-de-la-horde#132
**ADR**: N/A
**Bloqué par**: #131 (pipeline d'optimisation — déjà livré)

## 1. Objectif

Implémenter un nettoyage sûr et explicite des PNG originaux dans `tools/mediaOptimize.mjs`. Le nettoyage n'opère que si toutes les conditions cumulatives sont satisfaites : WebP valide (Sharp), zéro référence YAML restante, dépôt Git propre. `--clean` seul devient un dry-run lisible ; `--clean --confirm` déclenche les suppressions réelles.

## 2. Périmètre

### Inclus
- Changement de comportement de `--clean` seul : dry-run (liste les candidats à la suppression) au lieu de exit 2
- Ajout de `--force-clean` pour contourner le garde Git
- Renforcement de `cleanupPng()` : validation Sharp, vérification taille WebP vs PNG, détection de collision de noms, check Git, log multi-compendium
- Tests unitaires couvrant les nouveaux gardes et cas particuliers
- Mise à jour de `printHelp()` et du rapport JSON (`report.cleanup`)

### Hors périmètre
- Modification de `convertImages.mjs`, `migrateRefs.mjs`, `optimizeAudio.mjs`, `convertVideos.mjs`
- Nouveaux scripts dans `package.json` (non demandés)
- Modification du format des champs existants du rapport JSON

## 3. État avant implémentation

`tools/mediaOptimize.mjs` **existe** et contient déjà :
- `cleanupPng(images, webpAssets, remaining)` : supprime un PNG si le WebP est accessible (`fs.access`) et aucune ref restante — mais sans validation Sharp, sans check taille, sans garde Git, sans détection de collision.
- Guard `clean && !confirm` → exit 2 dans `main()` : **à remplacer** par le comportement dry-run.
- `parseArgs()` reconnaît `--clean` et `--confirm` ; `--force-clean` est absent.
- Fonctions utilitaires disponibles : `collectRemainingPngRefs`, `collectPngAssetRefs`.

## 4. Décisions d'architecture

- `--clean` seul : dry-run — liste les PNG candidats à la suppression, leurs raisons de conservation éventuelles, sans modifier aucun fichier.
- `--clean --confirm` : suppression réelle, toutes conditions cumulatives vérifiées.
- `--force-clean` : passe le garde Git ; incompatible avec le mode dry-run (requiert `--confirm`).
- Détection de collision : deux sources distinctes (ex. `portrait.jpg` + `portrait.png`) pointant vers le même `portrait.webp` → aucune suppression, message d'erreur explicite dans le rapport.
- Validation Sharp : `sharp(webpPath).metadata()` — si échec → conserver le PNG.
- Garde taille : si `webpSize >= pngSize` → conserver le PNG, loguer.
- Git check : `execSync("git status --porcelain")` → si non vide et pas `--force-clean` → exit 1 propre avec message.

## 5. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `tools/mediaOptimize.mjs` | `parseArgs` : `--force-clean` ; `main()` : remplacer le guard exit-2 par logique dry-run/confirm ; `cleanupPng()` : validation Sharp, comparaison taille, garde Git, détection collision, log multi-compendium |
| `tools/mediaOptimize.test.mjs` | Nouveaux cas pour `--force-clean`, dry-run `--clean` seul, collision, WebP > PNG, Git non propre |

## 6. Détail des changements

### `parseArgs()` — nouvelle option

```
--force-clean   → { forceClean: true }   défaut : false
```

### `main()` — remplacement du guard

```
// Avant (à supprimer) :
if (clean && !confirm) { exit 2 }

// Après :
if (clean && !confirm) {
  // dry-run : afficher les candidats à la suppression
  await previewCleanup(...)
  return
}
if (clean && confirm) {
  // suppression réelle via cleanupPng() renforcé
}
```

### `cleanupPng()` — gardes supplémentaires (dans l'ordre d'évaluation)

1. **Garde Git** (si `!forceClean`) : `git status --porcelain` non vide → bloquer tout, exit 1.
2. **Collision** : construire un index `webpPath → [sources]` ; si `sources.length > 1` → signaler, conserver tous.
3. **Validation Sharp** : `await sharp(webpPath).metadata()` — échec → `kept`.
4. **Comparaison taille** : `webpStat.size >= pngStat.size` → `kept` avec raison `webp_larger`.
5. **Refs restantes** : `remaining.has(assetPath)` → `kept` avec raison `refs_remaining` + liste des compendiums.
6. **Suppression** : `fs.unlink(pngPath)`.

### Rapport JSON — champs étendus

```json
"cleanup": {
  "dryRun": true|false,
  "deletedPng": 0,
  "keptPng": [{ "path": "...", "reason": "refs_remaining|webp_invalid|webp_larger|collision" }],
  "collisions": [{ "webp": "...", "sources": ["...", "..."] }]
}
```

## 7. Tests attendus

Nouveaux cas dans `tools/mediaOptimize.test.mjs` :

| Cas | Assertion |
|---|---|
| `--clean` seul | dry-run : 0 fichier supprimé, liste candidats affichée |
| `--clean --confirm` + Git propre | suppressions réelles opérées |
| `--clean --confirm` + Git sale (sans `--force-clean`) | exit 1, 0 suppression |
| `--clean --confirm --force-clean` + Git sale | suppressions autorisées |
| `--force-clean` sans `--clean` | option ignorée (aucun effet) |
| WebP inaccessible / invalide Sharp | PNG conservé, raison `webp_invalid` |
| WebP taille ≥ PNG taille | PNG conservé, raison `webp_larger` |
| Collision `portrait.jpg` + `portrait.png` → `portrait.webp` | 0 suppression, collision reportée |
| `parseArgs(["--force-clean"])` | `forceClean === true` |

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Suppression d'un PNG encore référencé | Garde `remaining` déjà présent + logs multi-compendium |
| WebP corrompu mais accessible (`fs.access` réussit) | Validation Sharp `.metadata()` |
| Dépôt Git avec des modifications en cours → suppressions accidentelles | Garde `git status --porcelain` avant toute suppression |
| Collision silencieuse (deux sources → même WebP) | Index webpPath → sources construit avant la boucle |
| `--force-clean` utilisé par erreur en CI | `--force-clean` requiert aussi `--confirm` ; documenter dans `--help` |

## 9. Critères d'arrêt

- `pnpm media:optimize --clean` → liste les candidats, aucun fichier supprimé, exit 0
- `pnpm media:optimize --clean --confirm` (Git propre) → suppressions validées, `pnpm packs:audit` passe
- `pnpm media:optimize --clean --confirm` (Git sale, sans `--force-clean`) → exit 1, message explicite, 0 PNG supprimé
- Collision détectée → 0 suppression, rapport JSON contient `collisions`
- `pnpm test` passe (anciens + nouveaux tests)
- FoundryVTT charge le module sans erreur sur http://localhost:31000/game (test manuel)
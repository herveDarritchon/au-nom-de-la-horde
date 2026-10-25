# Plan d'implémentation — Migrer les chemins médias dans les YAML des compendiums

**Issue**: herveDarritchon/au-nom-de-la-horde#130
**ADR**: N/A

## 1. Objectif

Fournir un CLI standalone `pnpm media:migrate-refs` qui lit `conversion-table.json` et réécrit toutes les références PNG → WebP dans les fichiers sources du module (YAML des compendiums, CSS, scripts, HTML des journaux), puis valide le résultat avec `pnpm packs:audit`.

## 2. Périmètre

### Inclus
- CLI standalone dans `tools/migrateRefs.mjs`
- Commande `media:migrate-refs` dans `package.json`
- Tests unitaires pour `parseArgs()`

### Hors périmètre
- Modification de la fonction `run()` (contrat stable)
- Modification de `src/tools/mediaPaths.mjs`
- Modification de `mediaOptimize.mjs`

## 3. État avant implémentation

`tools/migrateRefs.mjs` existait comme librairie pure (`run()` seul), appelée par `mediaOptimize.mjs`. Aucun point d'entrée CLI, aucune commande `pnpm` dédiée.

## 4. Décisions d'architecture

- Suivre le pattern `isMainModule()` de `mediaOptimize.mjs` pour la détection CLI.
- Lire `conversion-table.json` → construire `migratableAssets: Set<string>` → passer à `run()` comme filtre.
- Utiliser `scan()` de `mediaScanner.mjs` pour collecter les `refs` (réutilise le walker existant).
- Post-migration en mode `--write` sans erreur : exécuter `pnpm packs:audit` via `execSync`.

## 5. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `tools/migrateRefs.mjs` | Ajout CLI : `isMainModule`, `parseArgs`, `main` + nouveaux imports |
| `tools/migrateRefs.test.mjs` | Ajout tests pour `parseArgs` |
| `package.json` | Ajout `"media:migrate-refs": "node ./tools/migrateRefs.mjs"` |

## 6. Tests attendus

- Tests unitaires `parseArgs` : args vides, `--write`, `--dry-run`, `--help`, `-h`, option inconnue.
- Tests existants `run()` : inchangés, toujours valides.
- Validation manuelle : `pnpm media:migrate-refs --dry-run` puis `--write`.

## 7. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `conversion-table.json` absent | Message clair + exit 1 |
| 0 refs trouvées | Normal si déjà migré — idempotent |
| `pnpm packs:audit` échoue | Affiche sortie complète + exit 1 |

## 8. Critères d'arrêt

- `pnpm media:migrate-refs --dry-run` projette les remplacements sans erreur
- `pnpm media:migrate-refs --write` réécrit les YAML → `pnpm packs:audit` passe (0 erreur bloquante)
- Relancer `--write` → 0 fichier modifié (idempotent)
- `pnpm test` passe

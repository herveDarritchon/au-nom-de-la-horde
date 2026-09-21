# Plan d'implémentation — Workflow CI GitHub Actions (tests, audit, migrate-assets, build)

**Issue** : [#15 — ci: workflow GitHub Actions CI (tests, audit, migrate-assets, build)](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/15)
**Module(s) impacté(s)** : `.github/workflows/ci.yml` (nouveau)

---

## 1. Objectif

Donner un status check CI bloquant sur chaque PR et chaque push `main`, enchaînant tests unitaires → audit des assets → vérification de la migration d'assets → build LevelDB → validation des datastores générés.

## 2. Périmètre

### Inclus

- Triggers `pull_request` (toutes branches) et `push` (branche `main`).
- Node 22 / pnpm 11.24.0 (cohérence avec `release.yml`).
- Cache pnpm activé.
- Les 7 étapes listées dans l'issue, chacune bloquante par défaut (pas de `continue-on-error`).

### Hors scope

- Modifier `release.yml`.
- Changer le comportement de `packs:migrate-assets` (pas de vrai mode dry-run à ajouter ; l'issue accepte "vérifier que le script s'exécute sans erreur").
- Publication de release.
- Validation LFS/OGG (spécifique à `release.yml`, non demandée ici).

## 3. Constat sur l'existant

- `release.yml` donne déjà le pattern Node 22/pnpm 11.24.0 (step `Setup pnpm and Node` via `pnpm/setup@v3`, `cache: true`), le pattern `Install Dependencies` (`pnpm install --frozen-lockfile`), et le pattern `Validate Generated Pack Datastores` (script Node inline lisant `module.json`, vérifiant que chaque pack déclaré existe et n'est pas vide) — directement réutilisable.
- `tools/replaceAssetPaths.mjs` (`packs:migrate-assets`) n'a pas de flag dry-run : il réécrit les YAML sous `compendiums/`. Exécuté dans un runner CI éphémère (rien n'est poussé), l'exécuter réellement est sans risque et satisfait "s'exécute sans erreur".
- `release.yml` fait `actions/checkout@v7` avec `lfs: true` avant `packs:build` : à vérifier si `packs:build` a besoin des assets binaires réels.

## 4. Décisions d'architecture

- Un seul job `build` (ou nom similaire), steps séquentiels dans l'ordre de l'issue (checkout → install → test → audit → migrate-assets → build → validate datastores).
- Réutiliser tel quel le bloc `Setup pnpm and Node` et le script `Validate Generated Pack Datastores` de `release.yml` (mêmes versions, même logique), sans introduire de composite action partagée (non demandée par l'issue).
- `packs:migrate-assets` exécuté directement (`pnpm packs:migrate-assets`) ; l'échec du script (exit != 0) suffit à bloquer.

## 5. Plan de travail

1. Créer `.github/workflows/ci.yml` avec triggers `on: pull_request` (toutes branches) et `on: push: branches: [main]`.
2. Step `Setup pnpm and Node` (pnpm 11.24.0 / node 22, cache: true) — reprendre le bloc de `release.yml`.
3. Step `Install Dependencies` (`pnpm install --frozen-lockfile`).
4. Step `Run Tests` (`node --test src/` ou `pnpm test`).
5. Step `Audit Pack Sources` (`pnpm packs:audit`).
6. Step `Migrate Asset Paths` (`pnpm packs:migrate-assets`).
7. Step `Build Foundry LevelDB Packs` (`pnpm packs:build`).
8. Step `Validate Generated Pack Datastores` — reprendre le script Node inline de `release.yml` qui vérifie chaque pack de `module.json`.
9. Vérifier localement chaque commande individuellement avant de pousser le workflow.
10. Pousser sur une branche/PR pour confirmer que le status check apparaît et bloque correctement en cas d'échec simulé.

## 6. Fichiers probablement modifiés

- `.github/workflows/ci.yml` (nouveau)

## 7. Tests attendus

- Chaque commande listée (`pnpm install --frozen-lockfile`, `pnpm test`, `pnpm packs:audit`, `pnpm packs:migrate-assets`, `pnpm packs:build`) s'exécute avec succès en local.
- Le workflow CI passe au vert sur une PR de test.
- Un échec volontaire d'un des steps (ex. test cassé) fait échouer le workflow.

## 8. Risques et mitigations

- Risque : `pnpm packs:migrate-assets` modifie des fichiers `compendiums/` dans le runner et pourrait masquer un état incohérent si on tentait de committer après → mitigation : ne rien committer après ce step, le runner est jetable.
- Risque : `pnpm packs:build` nécessite des assets volumineux (LFS) absents en CI standard → mitigation : vérifier si `packs:build` a besoin des assets binaires réels ou seulement des YAML ; si LFS nécessaire, ajouter `lfs: true` au checkout de `ci.yml` également.

## 9. Critères d'arrêt

Les 8 critères d'acceptation de l'issue #15 sont satisfaits :
- Déclenchement sur `pull_request` (toutes branches) et `push` (main).
- `node --test src/` exécuté, échec bloquant.
- `pnpm packs:audit` exécuté, référence `worlds/` bloquante.
- `pnpm packs:migrate-assets` exécuté sans erreur.
- `pnpm packs:build` compile sans erreur.
- Validation des datastores : chaque pack de `module.json` présent et non vide.
- Node 22 / pnpm 11.24.0 utilisés.
- Cache pnpm activé.

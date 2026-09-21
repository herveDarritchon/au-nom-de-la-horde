# Plan d'implémentation — Couverture de code + intégration des tests en CI

**Issue** : [#13 — Couverture de code + intégration des tests en CI](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/13)
**Module(s) impacté(s)** : `package.json`, `.github/workflows/release.yml`

---

## 1. Objectif

Ajouter un rapport de couverture de code (`c8`) et intégrer l'exécution des tests dans le pipeline CI (`release.yml`), de façon à ce qu'une release ne puisse pas être publiée si les tests échouent.

## 2. Périmètre

### Inclus

- `c8` ajouté en `devDependency` (`pnpm add -D c8`).
- Script `"test:coverage": "c8 node --test src/"` ajouté dans `package.json`.
- Step `pnpm test` ajouté dans `.github/workflows/release.yml`, avant le step `Audit Pack Sources`, bloquant (exit 1 si échec).

### Hors scope

- Écriture de nouveaux tests métier.
- Changement du runner de test (`node --test`) ou de sa configuration.
- Définition de seuils de couverture minimum (non demandé par l'issue).

## 3. Constat sur l'existant

- `package.json` a déjà `"test": "node --test src/"` (issue #12 résolue), mais aucun script `test:coverage` ni dépendance `c8`.
- `.github/workflows/release.yml` n'a aucun step d'exécution des tests. Le premier step métier après `Install Dependencies` est `Audit Pack Sources` (`pnpm packs:audit`).
- Issue bloquante #12 déjà mergée (tests unitaires des modules purs présents) : plus de blocage pour cette issue.

## 4. Décisions d'architecture

- Le step `pnpm test` est inséré dans `release.yml` entre `Install Dependencies` et `Audit Pack Sources`.
- Aucun `continue-on-error` : le comportement par défaut de `node --test` (exit non-zero si un test échoue) suffit à bloquer le job GitHub Actions.
- `c8` s'utilise en wrapper autour du script `test` existant (`c8 node --test src/`), sans dupliquer la logique de découverte de tests.

## 5. Plan de travail

1. `pnpm add -D c8`.
2. Ajouter le script `"test:coverage": "c8 node --test src/"` dans `package.json`.
3. Ajouter un step `Run Tests` (`run: pnpm test`) dans `release.yml`, juste avant le step `Audit Pack Sources`.
4. Vérifier en local que `pnpm test:coverage` produit un rapport de couverture en console (lignes, branches, fonctions).
5. Vérifier que la CI passe sur `main` après intégration.

## 6. Fichiers probablement modifiés

- `package.json`
- `pnpm-lock.yaml`
- `.github/workflows/release.yml`

## 7. Tests attendus

- `pnpm test` : vert.
- `pnpm test:coverage` : produit un rapport de couverture en console (lignes, branches, fonctions).

## 8. Risques et mitigations

- Risque : `c8` peut se comporter différemment sous ESM sans configuration adaptée → mitigation : valider `pnpm test:coverage` en local avant de committer le step CI.
- Risque : ajout du step CI casse un run de release existant si un test est déjà rouge → mitigation : vérifier `pnpm test` en local avant de pousser le changement de workflow.

## 9. Critères d'arrêt

Les 5 critères d'acceptation de l'issue #13 sont satisfaits :
- `c8` en devDependency.
- Script `test:coverage` présent.
- `pnpm test:coverage` produit un rapport de couverture en console.
- Step `pnpm test` bloquant ajouté avant `Audit Pack Sources` dans `release.yml`.
- La CI passe sur la branche principale.

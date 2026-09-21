# Plan d'implémentation — Tests unitaires des modules purs (textUtils, capacityMatcher, statblockParser, assetPolicy)

**Issue** : [#12 — Tests unitaires des modules purs](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/12)
**Module(s) impacté(s)** : `src/importers/cof2/parsing/textUtils.mjs`, `src/importers/cof2/parsing/capacityMatcher.mjs`, `src/importers/cof2/parsing/statblockParser.mjs`, `tools/auditAssets.mjs`, `src/tools/assetPolicy.mjs` (nouveau)

---

## 1. Objectif

Couvrir par des tests unitaires tous les modules purs (sans dépendance Foundry) qui n'en ont pas encore, et élargir les fixtures du parseur de statblocks. Aucun changement de comportement observable.

## 2. Périmètre

### Inclus

- Tests unitaires `textUtils.mjs` (`tidyCase`, `cleanName`, `toSigned`) : acronymes COF2, lettres isolées PDF, tirets unicode.
- Tests unitaires `capacityMatcher.mjs` (`normalize`, `stripParens`, `makeCapacityMatcher`) : correspondance exacte, approximative, ambiguë, priorité dossier, retour `null`.
- 3 à 5 nouvelles fixtures `__fixtures__/` pour `statblockParser.mjs` (RD, attaque à distance, taille non standard, warnings) + tests associés.
- Extraction de `tools/auditAssets.mjs` vers un module pur `src/tools/assetPolicy.mjs` exportant `classifyPath(ref, config)`, sans `process.cwd()` ni accès FS.
- Tests unitaires `assetPolicy.mjs` couvrant toute la politique documentée dans `auditAssets.mjs` (worlds/ bloquant, icons/ui OK, module propre présent/absent, systems/co2 OK, URL externe/data: OK, autre = warning).

### Hors scope

- Toute nouvelle fonctionnalité de parsing ou d'audit.
- Modification du comportement de `auditAssets.mjs` au-delà de l'extraction pure de `classifyPath`.
- Intégration CI (couverte par issue #13).

## 3. Constat sur l'existant

- `statblockParser.mjs` a déjà des tests (`statblockParser.test.mjs`) et une fixture unique (`__fixtures__/centaure.txt`).
- `textUtils.mjs` et `capacityMatcher.mjs` : implémentés, purs, sans test dédié.
- `tools/auditAssets.mjs` : logique de classification de chemins (worlds/icons/ui/systems/modules/http/data:/autre) mêlée à la lecture FS et au parcours des YAML — aucune fonction pure isolée à ce jour.
- Runner `node --test src/` déjà configuré dans `package.json` ; aucune dépendance à ajouter.

## 4. Décisions d'architecture

- `classifyPath(ref, config)` reproduit exactement la politique déjà documentée en tête de `auditAssets.mjs` (tableau de préfixes → verdict), sans changer les règles.
- `assetPolicy.mjs` prend `config` en paramètre (pas d'import de `CONFIG` global) pour rester testable indépendamment du `process.cwd()` réel.
- `auditAssets.mjs` est ensuite mis à jour pour appeler `classifyPath` au lieu de dupliquer la logique inline (limité au strict nécessaire pour brancher l'extraction, sans réécrire le reste du script).

## 5. Plan de travail

1. Écrire `textUtils.test.mjs` couvrant les cas limites listés dans l'issue.
2. Écrire `capacityMatcher.test.mjs` couvrant les 5 scénarios de correspondance.
3. Ajouter 3 à 5 fixtures statblock (`__fixtures__/*.txt`) + cas de test correspondants dans `statblockParser.test.mjs`.
4. Extraire `classifyPath(ref, config)` dans `src/tools/assetPolicy.mjs`, brancher `auditAssets.mjs` dessus.
5. Écrire `assetPolicy.test.mjs` couvrant tous les cas de la politique.
6. Lancer `pnpm test` pour valider l'ensemble.

## 6. Fichiers probablement modifiés

- `src/importers/cof2/parsing/textUtils.test.mjs` (nouveau)
- `src/importers/cof2/parsing/capacityMatcher.test.mjs` (nouveau)
- `src/importers/cof2/parsing/__fixtures__/*.txt` (nouveaux, 3 à 5 fichiers)
- `src/importers/cof2/parsing/statblockParser.test.mjs` (étendu)
- `src/tools/assetPolicy.mjs` (nouveau)
- `src/tools/assetPolicy.test.mjs` (nouveau)
- `tools/auditAssets.mjs` (modifié : délègue à `classifyPath`)

## 7. Tests attendus

- `pnpm test` (= `node --test src/`) : tous verts, incluant les nouveaux fichiers `*.test.mjs`.
- Couverture des 6 critères d'acceptation de l'issue #12.

## 8. Risques et mitigations

- Risque : extraction de `classifyPath` change subtilement un verdict existant → mitigation : dériver les cas de test directement du tableau de politique déjà en commentaire dans `auditAssets.mjs`, avant toute écriture de code.
- Risque : fixtures statblock ajoutées ne reflètent pas un cas réel de PDF → mitigation : s'inspirer du format de `centaure.txt` existant.

## 9. Critères d'arrêt

Les 6 critères d'acceptation de l'issue #12 sont satisfaits et `pnpm test` passe sans erreur.

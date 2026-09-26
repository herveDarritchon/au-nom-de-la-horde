# Plan d'implémentation — Couverture complète du pipeline pour les collections `encounter`

**Issue** : [#69 — test(importer): couvrir le pipeline complet pour les collections `encounter`](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/69)  
**Bloqué par** : #68 (livré — flags `collectionType` et libellés type-aware)  
**ADR** : aucun applicable  
**Modules impactés** :
- `src/importers/warbound-markdown/__fixtures__/durotar-razor-hill-senjin-encounters.md` (nouveau)
- `src/importers/warbound-markdown/parser/WarboundMarkdownParser.test.mjs`
- `src/importers/warbound-markdown/validator/WarboundMarkdownValidator.test.mjs`
- `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.test.mjs` (couverture déjà complète via #68)
- `src/importers/warbound-markdown/synchronizer/WarboundImportSynchronizer.test.mjs`
- `src/importers/warbound-markdown/WarboundImporter.scenarios.test.mjs`

---

## 1. Objectif

Ajouter une fixture `encounter` complète et des tests couvrant les cinq couches du pipeline (parser → validator → generator → synchronizer → scénario end-to-end) pour les collections de type `encounter`, conformément aux §56–59 du cadrage.

---

## 2. Périmètre

### Inclus

- Fixture `durotar-razor-hill-senjin-encounters.md` : front matter `type: encounter`, contexte libre, table avec 2 rencontres actives (poids 2+3=5) et 1 inactive, blocs libres multi-headings (8 rubriques), 1 bloc court et 1 bloc avec liste Markdown et citation.
- Tests parser : parsing de `type: encounter`, contexte extrait, 3 entrées (N ≠ 20), blocs multi-headings préservés, bloc court importable, caractères accentués/listes/citations.
- Tests validator : source `encounter` valide sans erreur, absence de rubriques internes sans erreur, ID dupliqué → erreur, entrée active sans bloc → erreur, poids invalide → erreur, Actif invalide → erreur, table absente → erreur, aucune rencontre active → warning.
- Tests synchronizer : collection nouvelle, réimport identique, rencontre modifiée, inactive, orpheline, renommage avec UUID stable, **changement de poids** (page dans `unchanged` car hash basé sur titre+html).
- Scénarios end-to-end : import initial (4 pages, 2 TableResult, formula `1d5`), pondération (plages [1,2] et [3,5]), rencontre inactive (page présente, absente RollTable), réimport sans changement, renommage (UUID conservé).

### Hors périmètre

- Modification du code source (`*.mjs` non-test).
- Tests validant la présence de rubriques internes (`Tension`, `Acteurs`, `Leviers des PJ`, `Combat éventuel`) — cf. §36, §57.

---

## 3. Décisions d'architecture

- La nouvelle fixture calque le format de `durotar-tauren-rumors.md` avec `type: encounter` et des blocs libres multi-headings.
- Les tests s'ajoutent aux suites existantes sans restructurer les fichiers.
- Le test "changement de poids" documente explicitement que `buildImportDiff` est indépendant des poids (hash = titre+html) — le RollTable est toujours reconstruit par l'appelant.
- Les tests generator `collectionType: "encounter"` sont déjà présents (ajoutés dans #68) — pas de duplication.

---

## 4. Fichiers modifiés

```
src/importers/warbound-markdown/__fixtures__/durotar-razor-hill-senjin-encounters.md  (nouveau)
src/importers/warbound-markdown/parser/WarboundMarkdownParser.test.mjs
src/importers/warbound-markdown/validator/WarboundMarkdownValidator.test.mjs
src/importers/warbound-markdown/synchronizer/WarboundImportSynchronizer.test.mjs
src/importers/warbound-markdown/WarboundImporter.scenarios.test.mjs
```

---

## 5. Vérification

```bash
pnpm test
# Résultat attendu : 378 tests, 0 échec
```

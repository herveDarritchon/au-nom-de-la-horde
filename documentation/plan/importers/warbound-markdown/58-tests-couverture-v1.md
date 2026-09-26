# Plan d'implémentation — Tests de couverture V1

**Issue** : [#58 — [WM Importer] Tests de couverture V1](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/58)
**Dépendances** : #50, #51, #53, #54, #55 (couche pure)

---

## 1. Objectif

Couvrir les 8 critères d'acceptation fonctionnels V1 (§41–§48) par des tests automatiques utilisant la fixture §50, et extraire cette fixture dans un fichier partagé.

---

## 2. Périmètre

### Inclus

- Fichier fixture `src/importers/warbound-markdown/__fixtures__/durotar-tauren-rumors.md`
- Fichier de scénarios `src/importers/warbound-markdown/WarboundImporter.scenarios.test.mjs`
- 8 scénarios §41–§48 : import initial, poids, entrée inactive, réimport sans changement, renommage, modification de contenu, entrée supprimée, source invalide

### Hors périmètre

- Tests Playwright (UI Foundry)
- Couche UI (#52, #56, #57)
- Modification des fichiers source `.mjs`

---

## 3. État existant

| Fichier | Couverture |
|---|---|
| `parser/WarboundMarkdownParser.test.mjs` | §49 parser — complet |
| `validator/WarboundMarkdownValidator.test.mjs` | §49 validator — complet |
| `synchronizer/WarboundImportSynchronizer.test.mjs` | §49 synchronizer — complet |
| `generator/WarboundDocumentGenerator.test.mjs` | §49 generator — complet |
| `__fixtures__/durotar-tauren-rumors.md` | **Créé** |
| `WarboundImporter.scenarios.test.mjs` | **Créé** |

---

## 4. Architecture

Les scénarios sont de purs tests de composition : pas de mock Foundry, pas de DOM.

Pipeline :
```
readFileSync(fixture) → parseWarboundMarkdown → validateWarboundModel
                      → buildJournalData / buildRollTableData / buildImportDiff
```

Note : le runner est `node --test` (Node.js built-in), pas Vitest.

---

## 5. Fichiers créés

| Fichier | Action |
|---|---|
| `src/importers/warbound-markdown/__fixtures__/durotar-tauren-rumors.md` | Créé |
| `src/importers/warbound-markdown/WarboundImporter.scenarios.test.mjs` | Créé |

---

## 6. Vérification

```bash
pnpm test
# 323 tests, 0 fail
```

# Plan d'implémentation — WarboundImportSynchronizer : synchronisation, diff, idempotence

**Issue** : [#55 — [WM Importer] Synchronisation et diff — idempotence, hash, orphelins](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/55)
**Référence cadrage** : `documentation/cadrage/Warbound_Cadrage_Importeur_Markdown_Foundry.md` §26–§31, §44–§47
**Dépendances** : #53 (JournalEntry ✅), #54 (RollTable ✅)

---

## 1. Objectif

Implémenter `WarboundImportSynchronizer` : détecter les documents existants dans Foundry par flags, calculer le diff par hash, et orchestrer les mises à jour en préservant les UUID. Les orphelins sont signalés mais jamais supprimés. Réimporter un fichier identique → 0 création, tous `unchanged`.

---

## 2. Périmètre

### Inclus

- Fonction pure `buildImportDiff(model, existingPages)` : retourne `{ new[], modified[], unchanged[], inactive[], orphan[] }` sans appel Foundry
- Recherche `JournalEntry` existant par flag `collectionId` (dans l'adaptateur Foundry)
- Correspondance pages par `{collectionId, entryId}` dans les flags
- Comparaison par `sourceHash` → états `new` / `modified` / `unchanged` / `inactive` / `orphan`
- Mise à jour des documents existants (UUID préservés — jamais delete + recreate)
- Orphelins : signalés dans le diff, non supprimés, exclus de la RollTable reconstruite
- Adaptateur Foundry `WarboundImportSynchronizer.mjs` : orchestration `syncDocuments(model, journalFolder, tableFolder)` — délègue le diff au module pur, applique les changements via `JournalEntry.update()` et `RollTable.update()`, crée les nouveaux documents via `generateDocuments`

### Hors périmètre

- Interface utilisateur (bilan de synchronisation UI reste dans une issue ultérieure)
- Rollback

---

## 3. État existant

| Fichier | Rôle |
|---|---|
| `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs` | `buildJournalData`, `buildRollTableData`, `computeEntryHash` (pur) |
| `scripts/importers/warbound-markdown/WarboundDocumentGenerator.mjs` | `generateDocuments` — crée JournalEntry + RollTable |
| `src/importers/warbound-markdown/index.mjs` | Re-exporte les fonctions pures |
| `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` | UI — appelle `generateDocuments` directement (sans détection doublon) |
| `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.test.mjs` | Tests Vitest existants |

`computeEntryHash` est déjà implémenté et stocké dans `flags[NAMESPACE][FLAG_KEY].sourceHash` à la création des pages. Le synchroniseur peut l'utiliser directement.

---

## 4. Décisions d'architecture

- **Séparation pure/Foundry** : `buildImportDiff(model, serializedPages)` opère sur les données brutes sérialisées des pages (pas d'objet Foundry) → testable Vitest.
- **Signature de `buildImportDiff`** : reçoit `model` (produit par `parseWarboundMarkdown`) + `existingPages` (tableau de `{id, uuid, name, flags}` extraits des pages Foundry existantes). Retourne `{ new[], modified[], unchanged[], inactive[], orphan[] }`.
- **Adaptateur** : `syncDocuments(model, journalFolder, tableFolder)` — cherche le JournalEntry existant par `game.journal.find(...)` sur le flag `collectionId`, extrait les pages sérialisées, appelle `buildImportDiff`, puis :
  - `new` → `journal.createEmbeddedDocuments("JournalEntryPage", [...])`
  - `modified` → `page.update({name, text, flags: {sourceHash}})`
  - `unchanged` / `inactive` → aucune modification
  - `orphan` → aucune modification (signalé uniquement)
  - RollTable → reconstruite depuis le modèle filtré (orphelins exclus) avec `buildRollTableData`
- **Premier import** : si aucun JournalEntry existant, déléguer à `generateDocuments` (pas de doublon de logique).
- **RollTable** : lors d'une mise à jour, chercher la RollTable existante **par flag `collectionId` d'abord, par nom en repli** (les tables créées par #54 n'ont pas encore de flag). `buildRollTableData` écrit désormais ce flag d'identité : sans lui, un changement de titre dans le front matter créerait une seconde table au lieu de mettre à jour la première.
- **Idempotence réelle** : la reconstruction des résultats n'a lieu que si les résultats désirés diffèrent des résultats présents (type, nom, description, `documentUuid`, bornes). Un réimport d'un fichier identique n'écrit donc **rien** — ni page, ni table, ni résultat. Le `delete` + `create` des résultats est conservé plutôt qu'un `table.update({results})` dont la sémantique de fusion reste non vérifiée en V14 (risque §8), mais il est conditionnel.
- **Contrat d'entrée explicite** : `buildImportDiff` reçoit des objets `{ id, uuid, name, sort, flags }` construits explicitement depuis les pages vivantes, et non `page.toObject()`. `id` et `uuid` sont des accesseurs absents du source : avec `toObject()` ils vaudraient `undefined` et plus aucune page ne serait détectée comme orpheline.

---

## 5. Plan de travail

### 5.1 Nouveau fichier pur : `src/importers/warbound-markdown/synchronizer/WarboundImportSynchronizer.mjs`

Exporte `buildImportDiff(model, existingPages)` :
- Index `existingPages` par `entryId` (extrait des flags)
- Pour chaque entry du modèle : chercher la page existante par `entryId`
  - absente → `new`
  - hash identique + active → `unchanged`
  - hash identique + inactive → `inactive`
  - hash différent + active → `modified`
  - hash différent + inactive → `inactive` (mise à jour quand même)
- Pages existantes sans correspondance dans le modèle → `orphan`

### 5.2 Nouveau fichier adaptateur : `scripts/importers/warbound-markdown/WarboundImportSynchronizer.mjs`

Exporte `syncDocuments(model, journalFolder, tableFolder)` :
1. Chercher JournalEntry existant par flag `collectionId` dans `game.journal`
2. Si absent : déléguer à `generateDocuments`, retourner `{ journal, table, diff: null }`
3. Si présent : extraire `{ id, uuid, name, sort, flags }` depuis les pages vivantes (`journal.pages.contents`)
4. Appeler `buildImportDiff(model, serializedPages)`
5. Appliquer : `createEmbeddedDocuments` pour `new`, `page.update()` pour `modified`
6. Reconstruire la RollTable (update ou create) via `buildRollTableData` sur le modèle filtré
7. Retourner `{ journal, table, diff }`

### 5.3 Mettre à jour `src/importers/warbound-markdown/index.mjs`

Ajouter l'export de `buildImportDiff` :

```javascript
export { buildImportDiff } from "./synchronizer/WarboundImportSynchronizer.mjs";
```

### 5.4 Mettre à jour `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs`

Remplacer l'import de `generateDocuments` par `syncDocuments` dans `#doImport`.

---

## 6. Fichiers créés / modifiés

| Fichier | Action |
|---|---|
| `src/importers/warbound-markdown/synchronizer/WarboundImportSynchronizer.mjs` | **Créé** — logique pure `buildImportDiff` |
| `src/importers/warbound-markdown/synchronizer/WarboundImportSynchronizer.test.mjs` | **Créé** — tests Vitest |
| `scripts/importers/warbound-markdown/WarboundImportSynchronizer.mjs` | **Créé** — adaptateur Foundry `syncDocuments` |
| `src/importers/warbound-markdown/index.mjs` | **Modifié** — export `buildImportDiff` |
| `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` | **Modifié** — utilise `syncDocuments` au lieu de `generateDocuments` |

---

## 7. Tests attendus (Vitest — `buildImportDiff`)

- Réimport fichier identique → tous `unchanged`, 0 `new`, 0 `modified`
- Titre changé (ID stable) → état `modified`
- Contenu modifié → état `modified`
- Entrée active absente de Foundry → état `new`
- Entrée inactive hash identique → état `inactive`
- Entrée inactive hash différent → état `inactive`
- Page présente dans Foundry, absente du modèle → `orphan`
- Modèle entièrement nouveau (aucun existant) → toutes `new`
- Couvre tous les cas §49 du cadrage (section Synchronizer)

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| API `page.update()` sur `JournalEntryPage` en Foundry V14 | Vérifier `journal.pages.get(id).update(...)` sur instance locale avant implémentation |
| `RollTable.update({results})` remplace ou fusionne ? | Non vérifié en V14 : on conserve `deleteEmbeddedDocuments` + `createEmbeddedDocuments`, mais **conditionné** à une comparaison des résultats désirés, donc jamais déclenché sur un réimport identique |
| Pages sans flags `entryId` (importées avant cette issue) | Traitées comme orphelines — comportement correct |
| `generateDocuments` toujours utilisée pour le premier import | Délégation interne dans `syncDocuments` — contrat public unique |

---

## 9. Critères d'arrêt

- Critères d'acceptation #55 tous verts.
- `pnpm build` passe.
- Tests Vitest verts : tous les états §49 couverts.
- Validation manuelle sur `http://localhost:31000/game` : réimport identique → 0 nouveau document ; titre modifié → page renommée, UUID stable.

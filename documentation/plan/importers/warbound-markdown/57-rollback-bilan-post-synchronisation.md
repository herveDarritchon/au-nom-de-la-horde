# Plan d'implémentation — Rollback et bilan post-synchronisation

**Issue** : [#57 — [WM Importer] Rollback et bilan post-synchronisation](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/57)
**Référence cadrage** : `documentation/cadrage/Warbound_Cadrage_Importeur_Markdown_Foundry.md` §32, §39, §48
**Dépendances** : #56 (Prévisualisation + confirmation ✅)

---

## 1. Objectif

Deux sous-objectifs indépendants :

1. **Rollback** : si `generateDocuments` (premier import) échoue en cours de route, supprimer uniquement les documents créés par cette opération et ne jamais toucher un document préexistant.
2. **Bilan post-synchronisation** : remplacer l'affichage minimaliste après synchronisation par un vrai bilan (`N créées, N mises à jour, N inchangées, N inactives, N erreurs`) avec les boutons [Ouvrir le Journal] et [Ouvrir la RollTable].

---

## 2. Périmètre

### Inclus

- Rollback dans `generateDocuments` : suivi de `created[]`, suppression en cas d'exception, erreur re-thrown
- Rollback limité au premier import (path `generateDocuments`) — pour les re-imports, `updateEmbeddedDocuments` est batch-atomique côté Foundry V14 : pas de rollback supplémentaire nécessaire
- Bilan dans `#renderImportResult` : comptages par état depuis `diff` (re-import) ou depuis `model` (premier import)
- `#importResult` enrichi : stocker `journalId`, `tableId`, `counts`, en plus de `journalName`
- Bouton [Ouvrir le Journal] → `game.journal.get(journalId)?.sheet.render()`
- Bouton [Ouvrir la RollTable] → `game.tables.get(tableId)?.sheet.render()` (absent si pas de table active)
- Nouveau `data-action` handler pour chaque bouton

### Hors périmètre

- Suppression manuelle des orphelins
- Rollback de re-import (diff appliqué via batch API, partiellement atomique)
- Sauvegarde/restauration du contenu de pages existantes avant mise à jour

---

## 3. État existant

| Fichier | Rôle actuel |
|---|---|
| `scripts/importers/warbound-markdown/WarboundDocumentGenerator.mjs` | `generateDocuments(model, journalFolder, tableFolder)` — crée JournalEntry + pages + RollTable, aucun rollback |
| `scripts/importers/warbound-markdown/WarboundImportSynchronizer.mjs` | `syncDocuments(...)` — retourne `{ journal, table, diff }` ; premier import délègue à `generateDocuments` |
| `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` | `#renderImportResult()` — affiche uniquement `journalName` et `tableName` ; `#doImport` stocke `{ journalName, tableName, error }` dans `#importResult` |

`syncDocuments` retourne déjà `diff` (objet avec `new[]`, `modified[]`, `unchanged[]`, `inactive[]`, `orphan[]`) pour les re-imports, et `null` pour les premiers imports.

---

## 4. Décisions d'architecture

- **Rollback minimal** : `created = []` local dans `generateDocuments` ; chaque document créé est pushé immédiatement après création ; le `catch` appelle `Promise.allSettled(created.map(d => d.delete()))` avant de re-throw. `allSettled` pour ne pas masquer l'erreur initiale si une suppression échoue elle-même — mais chaque suppression en échec est loggée (`console.error` avec l'uuid du document) : un rollback partiel laisserait des documents orphelins que rien ne signale.
- **Pas de rollback re-import** : `updateEmbeddedDocuments` en V14 applique toutes les updates en un appel ; `createEmbeddedDocuments` pareil. Risque résiduel très faible et non demandé par le cadrage.
- **Counts premier import** : `diff === null` → tout est créé, y compris les entrées inactives :
  `buildJournalData` crée une page par entrée sans marque d'inactivité, et la prévisualisation (#56) les affiche toutes en `+`. Le bilan doit refléter ce qui est réellement écrit, sinon il contredit l'aperçu et annonce des pages « inactives » qui ne le sont pas.
  - `new` = `model.entries.length + 1` (page de contexte incluse)
  - `modified`, `unchanged`, `inactive`, `errors` = 0
- **Counts re-import** : extraire depuis `diff` retourné par `syncDocuments` ; `errors` = 0 (toute erreur lève une exception)
- **`#importResult` étendu** : `{ journalName, journalId, tableId, counts, error }` ; `journalId` et `tableId` permettent d'ouvrir les sheets dans les handlers. `tableName` devient inutile (le bouton affiche un libellé générique) et n'est plus stocké
- **Deux nouveaux `data-action`** : `"open-journal"` et `"open-table"` — évite d'injecter des appels Foundry dans le HTML inline

---

## 5. Plan de travail

### 5.1 Rollback dans `WarboundDocumentGenerator.mjs`

Encapsuler le corps de `generateDocuments` dans un try/catch :

```
const created = [];
try {
  ...JournalEntry.create(...) → journal → created.push(journal)
  ...RollTable.create(...) → table → if(table) created.push(table)
  return { journal, table };
} catch (err) {
  await Promise.allSettled(created.map((doc) => doc.delete()));
  throw err;
}
```

### 5.2 Enrichir `#importResult` dans `WarboundMarkdownImporterApp.mjs`

Dans `#doImport`, après `syncDocuments` :

```javascript
const counts = diff === null
  ? {
      new: model.entries.length + 1,
      modified: 0,
      unchanged: 0,
      inactive: 0,
      errors: 0,
    }
  : {
      new: diff.new.length,
      modified: diff.modified.length,
      unchanged: diff.unchanged.length,
      inactive: diff.inactive.length,
      errors: 0,
    };

this.#importResult = {
  journalName: journal.name,
  journalId: journal.id,
  tableId: table?.id ?? null,
  counts,
};
```

### 5.3 Mettre à jour `#renderImportResult()`

Remplacer la liste simple par le bilan de synchronisation :

- En-tête succès
- Comptages : `N créées`, `N mises à jour`, `N inchangées`, `N inactives`, `N erreurs` — les cinq lignes sont toujours affichées, y compris à 0, pour coller au format de notification demandé et éviter un état vide sur un réimport sans changement. Pluriel français : `n === 1 ? "" : "s"` (0 prend le pluriel)
- Bouton [Ouvrir le Journal] → `data-action="open-journal"`
- Bouton [Ouvrir la RollTable] → `data-action="open-table"` (conditionnel : absent si `tableId === null`)

### 5.4 Ajouter les handlers dans `#onAction`

```javascript
if (action === "open-journal") {
  game.journal.get(this.#importResult?.journalId)?.sheet.render();
  return;
}
if (action === "open-table") {
  game.tables.get(this.#importResult?.tableId)?.sheet.render();
  return;
}
```

---

## 6. Fichiers modifiés

| Fichier | Action |
|---|---|
| `scripts/importers/warbound-markdown/WarboundDocumentGenerator.mjs` | Ajout rollback dans `generateDocuments` |
| `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` | `#doImport` calcule `counts` + stocke `journalId`/`tableId` ; `#renderImportResult` affiche bilan ; `#onAction` gère `open-journal` et `open-table` |

Aucun fichier créé. `WarboundImportSynchronizer.mjs` non modifié.

---

## 7. Tests attendus

Pas de nouveaux tests Vitest : le rollback est un comportement d'adaptateur Foundry (non testable unitairement) ; les comptages sont extraits du `diff` déjà testé dans `WarboundImportSynchronizer.test.mjs`.

Validation manuelle sur `http://localhost:31000/game` :

1. Fichier invalide → 0 création, 0 modification, erreur affichée
2. Simulation d'échec partiel (non automatisable sans mock Foundry) → couvrir par revue de code
3. Premier import réussi → bilan `N créées` (toutes, contexte compris), le reste à 0 ; [Ouvrir le Journal] ouvre le journal ; [Ouvrir la RollTable] ouvre la table (ou absent si aucune entrée active)
4. Réimport inchangé → bilan `0 créées, 0 mises à jour, N inchangées, N inactives`
5. Réimport avec modification → bilan `0 créées, N mises à jour, ...`
6. Orthographe des pluriels à 0 (`0 inactives`, pas `0 inactive`) et à 1 (`1 inchangée`)

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `doc.delete()` dans le rollback échoue (permissions, doc déjà absent) | `Promise.allSettled` — l'erreur originale est re-thrown sans être masquée |
| Foundry V14 : `JournalEntry.create` crée pages en transaction ? | Si la création de pages fait partie de la même requête que le journal, le journal pourrait n'exister que partiellement après l'exception → `created.push(journal)` suffit, `journal.delete()` supprime les pages embarquées |
| `model.entries.filter(e => e.active !== false)` : comportement si `active` absent | `active` absent ↔ `true` (actif) par convention du parser — `!== false` couvre les deux cas |
| Bouton [Ouvrir la RollTable] visible mais table inexistante | `tableId === null` → bouton non rendu ; sans risque |
| Rollback partiel : un `delete()` échoue et laisse un document orphelin | Chaque échec est loggé avec l'uuid ; l'erreur d'origine reste propagée à l'UI |

---

## 9. Critères d'arrêt

- Critères d'acceptation #57 tous verts.
- `pnpm build` passe.
- `pnpm test` passe (296 tests, aucun nouveau cassé).
- Fichier invalide → 0 création, 0 modification, 0 suppression.
- Bilan affiche les comptes exacts après synchronisation.
- Boutons [Ouvrir le Journal] et [Ouvrir la RollTable] fonctionnels.
- Validation manuelle sur `http://localhost:31000/game`.

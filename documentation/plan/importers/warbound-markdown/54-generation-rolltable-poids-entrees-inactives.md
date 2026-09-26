# Plan d'implémentation — WarboundDocumentGenerator : RollTable avec poids et entrées inactives

**Issue** : [#54 — [WM Importer] Génération RollTable avec poids et entrées inactives](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/54)
**Référence cadrage** : `documentation/cadrage/Warbound_Cadrage_Importeur_Markdown_Foundry.md` §23–§25, §42–§43
**Dépendances** : #53 (JournalEntry + Pages ✅)
**Module(s) impacté(s)** :
- `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs` (étendu — logique pure)
- `scripts/importers/warbound-markdown/WarboundDocumentGenerator.mjs` (étendu — adaptateur Foundry)

---

## 1. Objectif

Étendre `WarboundDocumentGenerator` pour générer une `RollTable` Foundry V14 à partir des entrées actives du modèle Warbound, en calculant les plages par poids via l'algorithme curseur, et en excluant les entrées inactives (`active: false`) de la table sans supprimer leurs pages Journal.

---

## 2. Périmètre

### Inclus

- Fonction pure `buildRollTableData(model, journalEntry)` : construit les données `RollTable` + `TableResult[]` sans appel Foundry
- Algorithme curseur pour les plages : `start = cursor; end = cursor + weight - 1; cursor = end + 1`
- Formule dé : `` `1d${sumOfWeights}` `` (somme des poids des entrées actives uniquement)
- `replacement: true`, `displayRoll: true` (§23 du cadrage)
- Entrées inactives (`active: false`) : exclues de la RollTable, pages Journal conservées (§43)
- `TableResult` : `type`, `text` (titre), `description` (aperçu/summary), lien UUID vers la `JournalEntryPage`
- Dossier cible passé en paramètre (cohérent avec `generateDocuments`)
- Vérifier la syntaxe exacte de `TableResult` et des liens UUID dans Foundry V14 au moment de l'implémentation (§24 du cadrage — ne pas inventer le schéma)

### Hors périmètre

- Synchronisation / détection de mise à jour (§26–§30 : lecture différée)
- Interface utilisateur
- Comportement d'une collection sans aucune entrée active : `buildRollTableData` renvoie `rollTableData: null` et l'adaptateur saute la création. Une formule `1d0` serait rejetée par Foundry *après* la création du JournalEntry ; le validateur (#51) n'émet qu'un warning sur ce cas, l'import ne doit donc pas échouer. Un avertissement dedicated dans l'UI reste à définir.

---

## 3. État existant

### Modules existants

- `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs` — `buildJournalData(model, folder)` + `computeEntryHash()` (pur, sans Foundry)
- `scripts/importers/warbound-markdown/WarboundDocumentGenerator.mjs` — `generateDocuments(model, folder)` : adaptateur Foundry qui crée `JournalEntry` + pages via `buildJournalData`
- `src/importers/warbound-markdown/index.mjs` — re-exporte `buildJournalData`, `computeEntryHash`, `parseWarboundMarkdown`, `validateWarboundModel`

### Modèle d'entrée (produit par `parseWarboundMarkdown`)

```javascript
{
  schema: number,
  collectionId: string,
  title: string,
  type: string,
  context: { markdown: string, html: string },
  entries: [
    { index, id, title, summary, weight, active, markdown, html }
  ]
}
```

---

## 4. Décisions d'architecture

- **Séparation pure/Foundry** : `buildRollTableData(model, pages)` construit les objets de données sans appel Foundry → testable Vitest. `generateDocuments` étend l'adaptateur existant pour créer la RollTable après les pages.
- **Signature de `buildRollTableData`** : reçoit `model` + la liste des pages créées (objets `{id, name}` issus de la création Foundry) pour construire les liens UUID réels vers les `JournalEntryPage`.
- **UUID** : syntaxe à vérifier dans Foundry V14 avant implémentation (§24) ; format attendu `JournalEntryPage.{journalId}.{pageId}`.
- **Aucun `_id`/`_stats`** fourni dans les données construites : Foundry génère ses propres identifiants.
- **Dossier cible** : passé en paramètre à `generateDocuments`, transmis à la création de la RollTable.

---

## 5. Plan de travail

### 5.1 Étendre `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs`

Ajouter la fonction pure exportée :

```javascript
/**
 * Construit les données brutes pour une RollTable avec plages par poids.
 * Seules les entrées actives (entry.active === true) sont incluses.
 * @param {object} model - Modèle parseWarboundMarkdown
 * @param {{ id: string } | null} folder
 * @param {Array<{ id: string, name: string, flags: object }>} createdPages - pages JournalEntryPage créées
 * @returns {{ rollTableData: object, results: object[] }}
 */
export function buildRollTableData(model, folder, createdPages) {
  const activeEntries = model.entries.filter(e => e.active);
  const sumOfWeights = activeEntries.reduce((acc, e) => acc + e.weight, 0);

  const rollTableData = {
    name: model.title,
    ...(folder?.id != null ? { folder: folder.id } : {}),
    formula: `1d${sumOfWeights}`,
    replacement: true,
    displayRoll: true,
  };

  let cursor = 1;
  const results = activeEntries.map(entry => {
    const start = cursor;
    const end = cursor + entry.weight - 1;
    cursor = end + 1;

    // Trouver la page créée correspondant à cet entry
    const page = createdPages.find(p =>
      p.flags?.["warbound-campaign-content"]?.markdownImport?.entryId === entry.id
    );

    return {
      // type, documentUuid, text, description : vérifier schéma Foundry V14
      range: [start, end],
      text: entry.title,
      description: entry.summary ?? "",
      // documentUuid: `JournalEntryPage.${journalId}.${page.id}` — syntaxe à confirmer
    };
  });

  return { rollTableData, results };
}
```

### 5.2 Étendre `scripts/importers/warbound-markdown/WarboundDocumentGenerator.mjs`

Modifier `generateDocuments` pour créer la RollTable après le JournalEntry :

```javascript
import { buildJournalData, buildRollTableData } from "../../../src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs";

export async function generateDocuments(model, folder) {
  const { journalData, pages } = buildJournalData(model, folder);
  const journal = await JournalEntry.create({ ...journalData, pages });

  const createdPages = journal.pages.contents;
  const { rollTableData, results } = buildRollTableData(model, folder, createdPages);
  await RollTable.create({ ...rollTableData, results });

  return journal;
}
```

> **Point de vérification** : confirmer l'API `RollTable.create()` et le schéma de `results` dans Foundry V14 (type de résultat, champ UUID, champ text) avant d'implémenter.

### 5.3 Mettre à jour `src/importers/warbound-markdown/index.mjs`

Ajouter l'export de `buildRollTableData` :

```javascript
export { buildJournalData, computeEntryHash, buildRollTableData } from "./generator/WarboundDocumentGenerator.mjs";
```

---

## 6. Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs` | Modifié — ajout `buildRollTableData` |
| `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.test.mjs` | Modifié — ajout tests Vitest pour `buildRollTableData` |
| `scripts/importers/warbound-markdown/WarboundDocumentGenerator.mjs` | Modifié — `generateDocuments` crée la RollTable |
| `src/importers/warbound-markdown/index.mjs` | Modifié — re-export `buildRollTableData` |

---

## 7. Tests attendus

### Vitest (module pur — `buildRollTableData`)

- `formula = "1d4"` pour poids `[1, 2, 1]` (entrées toutes actives)
- Plages correctes : A `[1,1]`, B `[2,3]`, C `[4,4]`
- Entrée inactive (`active: false`) absente des résultats
- `formula = "1d3"` si C inactive (poids actifs : 1+2=3)
- Page Journal présente pour C inactive, mais aucun résultat dans la RollTable
- Une seule entrée active : `formula = "1d{weight}"`, une seule plage `[1, weight]`
- Aucune entrée active : `results = []` et `rollTableData = null` (aucune création de table)
- `replacement: true`, `displayRoll: true` présents dans `rollTableData`
- Aucun `_id`/`_stats` dans les objets générés

### Validation manuelle sur `http://localhost:31000/game`

- Importer un `.md` valide → RollTable créée avec nom = `title` du front matter
- `1d4` pour `[A:1, B:2, C:1]` actifs
- Entrée inactive : page Journal présente, aucun résultat dans la RollTable
- Lien UUID fonctionnel dans chaque `TableResult` (ouvre la page détaillée)
- RollTable dans le dossier cible sélectionné
- Aucun `_id` dans les données envoyées

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Schéma `TableResult` en V14 non documenté ici | Inspecter un `RollTable.create()` existant dans le projet ou la source Foundry V14 avant implémentation (§24 du cadrage) |
| Syntaxe UUID `JournalEntryPage` à confirmer | Vérifier `journal.pages.contents[i].uuid` sur une page existante dans l'instance locale |
| `journal.pages.contents` peut être vide ou ordonné différemment | Utiliser les flags `entryId` pour corréler page ↔ entrée, pas l'ordre |
| RollTable sans résultat (aucune entrée active) | `rollTableData: null` + création sautée dans l'adaptateur : évite la formule invalide `1d0` qui ferait échouer l'import après la création du JournalEntry |

---

## 9. Critères d'arrêt

- Tous les critères d'acceptation de l'issue #54 sont verts.
- `pnpm build` passe (audit + compile).
- Tests Vitest verts sur `WarboundDocumentGenerator.test.mjs` (nouveaux cas RollTable).
- Validation manuelle concluante sur `http://localhost:31000/game`.
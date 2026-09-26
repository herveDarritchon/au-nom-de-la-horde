# Plan d'implémentation — WarboundDocumentGenerator : JournalEntry, JournalEntryPage et flags

**Issue** : [#53 — [WM Importer] Génération JournalEntry, JournalEntryPage et flags](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/53)
**Référence cadrage** : `documentation/cadrage/Warbound_Cadrage_Importeur_Markdown_Foundry.md` §22, §29–§30
**Dépendances** : #50 (Parser ✅) · #51 (Validator ✅) · #52 (UI squelette ✅)
**Module(s) impacté(s)** :
- `scripts/importers/warbound-markdown/WarboundDocumentGenerator.mjs` (créé)

---

## 1. Objectif

Implémenter `WarboundDocumentGenerator` : transformer le modèle produit par le parser en documents Foundry V14 (`JournalEntry` + `JournalEntryPage`) avec flags d'identité stables (`collectionId`, `entryId`, `sourceHash`), créés dans le dossier choisi par l'utilisateur.

---

## 2. Périmètre

### Inclus

- `WarboundDocumentGenerator` : fonction (ou classe légère) recevant le modèle parsé et le dossier cible
- Création `JournalEntry` avec flags `warbound-campaign-content.markdownImport.{schema, collectionId}`
- Page « Contexte » (`JournalEntryPage`) contenant le HTML du bloc contextuel
- Une `JournalEntryPage` par entrée : nom = titre de la ligne de table, flags `{collectionId, entryId, sourceHash}`
- `sourceHash` via FNV-1a — fonction pure extraite / inspirée de `src/importers/cof2/library/contentHash.mjs`
- API Foundry V14 : `JournalEntry.create()`, `JournalEntryPage.create()` — aucun `_id`/`_stats`/timestamps fourni manuellement

### Hors périmètre

- RollTable
- Synchronisation / détection de mise à jour (§29–§30 : lecture différée)
- Interface utilisateur (gérée dans #52)

---

## 3. État existant

- `src/importers/warbound-markdown/parser/WarboundMarkdownParser.mjs` — produit le modèle (livré #50)
- `src/importers/warbound-markdown/validator/WarboundMarkdownValidator.mjs` — valide le modèle (livré #51)
- `src/importers/warbound-markdown/index.mjs` — re-exporte `parseWarboundMarkdown` et `validateWarboundModel`
- `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` — UI squelette (livré #52)
- `src/importers/cof2/library/contentHash.mjs` — FNV-1a 32 bits, à réutiliser ou s'en inspirer

### Modèle produit par `parseWarboundMarkdown`

```javascript
{
  schema: number,          // ex. 1
  collectionId: string,    // ex. "durotar-tauren-rumors"
  title: string,           // nom de la collection
  type: string,
  context: { markdown: string, html: string },
  entries: [
    { index, id, title, summary, weight, active, markdown, html }
  ]
}
```

---

## 4. Décisions d'architecture

- **Séparation pure/Foundry** : une fonction pure `buildJournalData(model)` construit les objets de données (sans appel Foundry) → testable Vitest. Une fonction async `generateDocuments(model, folder)` appelle l'API Foundry.
- **sourceHash** : FNV-1a sur le contenu source de l'entrée (titre + html), même algorithme que `contentHash.mjs` — extraire une fonction générique `fnv1a(str)` dans un module partagé ou dupliquer localement si le couplage avec COF2 est indésirable.
- **Pas de `_id`** fourni : Foundry génère ses propres identifiants (§22 du cadrage).
- **Flags** : clé de namespace `"warbound-campaign-content"`, sous-clé `markdownImport`, cohérent avec le cadrage §22.
- **Dossier cible** : passé en paramètre comme objet `Folder` Foundry (ou `null` pour la racine).

---

## 5. Plan de travail

### 5.1 Créer `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs`

Module pur (sans import Foundry) :

```javascript
export function buildJournalData(model, folder) {
  // Retourne { journalData, pages }
  // journalData = { name, folder: folder?.id, flags: { "warbound-campaign-content": { markdownImport: { schema, collectionId } } } }
  // pages[0] = page Contexte
  // pages[1..n] = une page par entries[i]
}

export function computeEntryHash(entry) {
  // FNV-1a sur entry.title + "::" + entry.html
}
```

### 5.2 Créer `scripts/importers/warbound-markdown/WarboundDocumentGenerator.mjs`

Module Foundry (adaptateur) :

```javascript
import { buildJournalData } from "../../src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs";

export async function generateDocuments(model, folder) {
  const { journalData, pages } = buildJournalData(model, folder);
  const journal = await JournalEntry.create(journalData);
  for (const page of pages) {
    await JournalEntryPage.create({ ...page, parent: journal });
  }
  return journal;
}
```

### 5.3 Structure des flags

**JournalEntry** :
```javascript
flags: {
  "warbound-campaign-content": {
    markdownImport: { schema: model.schema, collectionId: model.collectionId }
  }
}
```

**JournalEntryPage « Contexte »** :
```javascript
{
  name: "Contexte",
  type: "text",
  text: { content: model.context.html, format: 1 },
  flags: {
    "warbound-campaign-content": {
      markdownImport: {
        collectionId: model.collectionId,
        entryId: "context",
        sourceHash: computeEntryHash({ title: "Contexte", html: model.context.html })
      }
    }
  }
}
```

**JournalEntryPage par entrée** :
```javascript
{
  name: entry.title,
  type: "text",
  text: { content: entry.html, format: 1 },
  flags: {
    "warbound-campaign-content": {
      markdownImport: {
        collectionId: model.collectionId,
        entryId: entry.id,
        sourceHash: computeEntryHash(entry)
      }
    }
  }
}
```

---

## 6. Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs` | Créé — logique pure |
| `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.test.mjs` | Créé — tests Vitest |
| `scripts/importers/warbound-markdown/WarboundDocumentGenerator.mjs` | Créé — adaptateur Foundry |
| `src/importers/warbound-markdown/index.mjs` | Modifié — re-exporter `buildJournalData`, `computeEntryHash` |

---

## 7. Tests attendus

### Vitest (module pur)

- `buildJournalData(model, null)` retourne un objet journal avec les flags corrects et `folder: undefined`
- `buildJournalData(model, folder)` positionne `folder.id` dans `journalData.folder`
- La page Contexte est générée en premier avec `entryId: "context"`
- Une page par entry avec `name = entry.title` et `entryId = entry.id`
- `sourceHash` est une chaîne hex de 8 caractères
- Aucun `_id`/`_stats` présent dans les objets générés

### Validation manuelle sur `http://localhost:31000/game`

- Importer un `.md` valide → JournalEntry créé avec nom = `title` du front matter
- Flags `collectionId` et `schema` corrects sur le Journal
- Page Contexte présente avec le HTML contextuel
- Autant de pages que d'entrées dans la table Warbound
- Flags `entryId` + `sourceHash` présents sur chaque page
- Aucun `_id` dans les données envoyées (logs réseau ou console)
- Création dans le dossier sélectionné (si applicable)

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| API `JournalEntryPage.create()` en V14 peut différer de V13 | Vérifier la signature dans le code source Foundry ou la doc V14 avant implémentation |
| `format: 1` (HTML) peut varier selon la version | Confirmer avec un journal existant dans l'instance locale |
| FNV-1a dupliquée entre COF2 et warbound-markdown | Tolérable pour l'instant ; factoriser dans `src/lib/` en V2 si besoin |
| Ordre des pages non garanti par Foundry | Fixer `sort` explicitement sur chaque page (ex. `sort: i * 100000`) |

---

## 9. Critères d'arrêt

- Tous les critères d'acceptation de l'issue #53 sont verts.
- `pnpm build` passe (audit + compile).
- Tests Vitest verts sur `WarboundDocumentGenerator.test.mjs`.
- Validation manuelle concluante sur `http://localhost:31000/game`.
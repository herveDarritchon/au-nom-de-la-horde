# Plan d'implémentation — Reconnaître `encounter` comme type métier de premier rang

**Issue** : [#68](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/68)  
**ADR** : aucun applicable  
**Modules principalement impactés** :
- `src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs`
- `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs`

---

## 1. Objectif

Permettre à l'importeur Warbound Markdown de reconnaître `type: encounter` comme type métier de premier rang, en :

1. persistant `collectionType` dans les flags Foundry des documents générés ;
2. affichant des libellés adaptés au type dans la prévisualisation et le bilan post-import.

---

## 2. Périmètre

### Inclus

- Ajout de `collectionType: model.type` dans les flags du `JournalEntry` et de la `RollTable` (générateur).
- Registre de libellés type-aware (`COLLECTION_TYPE_LABELS`) dans l'App UI.
- Prévisualisation : affichage du type + comptage localisé (`N rencontres`).
- Libellé conditionnel du bouton `Ouvrir la RollTable` → `Ouvrir la table de rencontres` quand `type === "encounter"`.
- Fallback générique pour tout type inconnu (`entrée / entrées / Table aléatoire`).

### Hors périmètre

- Validation fermée du champ `type` dans le parser/modèle.
- Modification du schéma YAML ou du format de fichier source.
- Nouveaux composants spécialisés par type.
- Régression des types existants (`rumor`, `hook`).

---

## 3. État existant

| Élément | État actuel |
|---|---|
| `flags.markdownImport` (JournalEntry) | `{ schema, collectionId }` — pas de `collectionType` |
| `flags.markdownImport` (RollTable) | `{ schema, collectionId }` — pas de `collectionType` |
| Label comptage prévisualisation | `N entrée/entrées` codé en dur (ligne 148 de l'App) |
| Bouton post-import | `Ouvrir la RollTable` — non conditionnel |
| `model.type` | Champ déjà présent dans le modèle parsé, non utilisé dans les flags ni l'UI |

---

## 4. Décisions d'architecture

- **Registre statique** `COLLECTION_TYPE_LABELS` dans `WarboundMarkdownImporterApp.mjs` : objet littéral fermé (`encounter`, `rumor`) + fallback générique. Pas de classe ni de fichier séparé pour ce volume.
- **Flag `collectionType`** ajouté uniquement au niveau racine des documents (`JournalEntry`, `RollTable`), pas sur les pages individuelles — cohérent avec `collectionId` existant.
- La prévisualisation lit `model.type` directement depuis le modèle parsé (déjà disponible) ; pas besoin de relire les flags.

---

## 5. Plan de travail

### Étape A — `WarboundDocumentGenerator.mjs`

1. Dans `buildJournalData` (lignes 36–43) : ajouter `collectionType: model.type` dans `flags[NAMESPACE][FLAG_KEY]`.
2. Dans `buildRollTableData` (lignes 103–107) : ajouter `collectionType: model.type` dans `flags[NAMESPACE][FLAG_KEY]`.

### Étape B — `WarboundMarkdownImporterApp.mjs`

3. Déclarer `COLLECTION_TYPE_LABELS` en constante module-level :
   ```js
   const COLLECTION_TYPE_LABELS = {
     encounter: { singular: "rencontre", plural: "rencontres", table: "Table de rencontres" },
     rumor:     { singular: "rumeur",    plural: "rumeurs",    table: "Table de rumeurs" },
   };
   const DEFAULT_LABELS = { singular: "entrée", plural: "entrées", table: "Table aléatoire" };
   ```
4. Dans `#renderPreview` (ligne 148) : remplacer le label codé en dur par :
   ```js
   const labels = COLLECTION_TYPE_LABELS[model.type] ?? DEFAULT_LABELS;
   // comptage : `${rows.length} ${rows.length > 1 ? labels.plural : labels.singular}`
   // type affiché : ajouter une ligne <span class="wb-preview-type">Type : ${labels.plural}</span>
   ```
5. Dans `#renderImportResult` (ligne 188–190) : rendre le libellé du bouton conditionnel :
   ```js
   const tableLabel = COLLECTION_TYPE_LABELS[/* type récupéré */]?.table ?? DEFAULT_LABELS.table;
   // `Ouvrir la ${tableLabel}`
   ```
   → Le type doit être transmis depuis `#importResult` ou récupéré depuis `this.#model.type`.

---

## 6. Fichiers probablement modifiés

```
src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs
scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs
```

---

## 7. Tests attendus

- **Unitaires (Vitest)** dans le fichier de tests existant pour `WarboundDocumentGenerator` :
  - `buildJournalData` avec `type: "encounter"` → flags contiennent `collectionType: "encounter"`.
  - `buildRollTableData` avec `type: "encounter"` → flags contiennent `collectionType: "encounter"`.
  - Types existants `rumor` et `hook` → `collectionType` bien renseigné, pas de régression.
- **Intégration/UI (Playwright ou manuel)** :
  - Importer un fichier avec `type: encounter` → prévisualisation affiche `Type : Rencontres` et `N rencontres`.
  - Bilan post-import : bouton libellé `Ouvrir la Table de rencontres`.
  - Type inconnu → fallback `entrée/entrées/Table aléatoire`.

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `model.type` absent/undefined pour fichiers anciens | Utiliser `model.type ?? undefined` ; flag omis si absent (ne casse pas) |
| `this.#importResult` ne transporte pas le type → bouton conditionnel impossible | Stocker `model.type` dans `#importResult` lors du commit du résultat ou lire depuis `this.#model` |
| Régression labels `rumor`/`hook` | Couvrir par tests unitaires + test manuel avant merge |

---

## 9. Critères d'arrêt

- [ ] `collectionType: "encounter"` présent dans les flags `JournalEntry` et `RollTable` après import.
- [ ] Prévisualisation affiche `Type : Rencontres` et `N rencontres`.
- [ ] Bouton post-import libellé `Ouvrir la Table de rencontres`.
- [ ] Type inconnu → fallback générique sans erreur.
- [ ] Collections `rumor` et `hook` importables sans régression.
- [ ] Tests unitaires passants (générateur).
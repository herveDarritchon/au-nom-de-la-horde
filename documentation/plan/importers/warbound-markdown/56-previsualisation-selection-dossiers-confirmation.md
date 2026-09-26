# Plan d'implémentation — Prévisualisation, sélection des dossiers et confirmation

**Issue** : [#56 — [WM Importer] Prévisualisation, sélection des dossiers et confirmation](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/56)
**Référence cadrage** : `documentation/cadrage/Warbound_Cadrage_Importeur_Markdown_Foundry.md` §20–§21, §28
**Dépendances** : #55 (WarboundImportSynchronizer ✅)

---

## 1. Objectif

Ajouter une étape de prévisualisation dans `WarboundMarkdownImporterApp` entre la lecture du fichier et l'écriture Foundry : afficher le diff calculé (états `+`, `~`, `=`, `○`, `!`), permettre la sélection des dossiers de destination, et ne déclencher aucune écriture avant confirmation explicite via [Synchroniser].

---

## 2. Périmètre

### Inclus

- Calcul du diff (`buildImportDiff`) après lecture du fichier, avant toute écriture
- Section prévisualisation dans le rendu HTML : résumé (comptages), liste des entrées avec marqueur d'état, sélecteurs dossier JournalEntry et RollTable
- Marqueurs : `+` Nouvelle, `~` Modifiée, `=` Inchangée, `○` Inactive, `!` Orpheline
- Bouton [Annuler] → ferme sans écriture ; Bouton [Synchroniser] → déclenche `syncDocuments`
- Sélecteurs filtrés par type compatible (`JournalEntry` / `RollTable`)
- Intégration avec `syncDocuments` existant (pas de changement de signature)

### Hors périmètre

- Bilan post-synchronisation détaillé
- Rollback
- Création automatique de dossiers
- Template HBS (l'app utilise `_renderHTML` avec HTML inline — pas de fichier `.hbs` existant)

---

## 3. État existant

| Fichier | Rôle actuel |
|---|---|
| `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` | App ApplicationV2 ; parse → validate → sélecteurs dossiers → [Importer] ; appelle `syncDocuments` directement après clic |
| `scripts/importers/warbound-markdown/WarboundImportSynchronizer.mjs` | `syncDocuments(model, journalFolder, tableFolder)` — calcule diff ET applique |
| `src/importers/warbound-markdown/synchronizer/WarboundImportSynchronizer.mjs` | `buildImportDiff(model, existingPages)` — pure, retourne `{ new[], modified[], unchanged[], inactive[], orphan[] }` |
| `src/importers/warbound-markdown/synchronizer/WarboundImportSynchronizer.test.mjs` | Tests Vitest de `buildImportDiff` |

Aujourd'hui le flux est : fichier lu → validation → sélecteurs dossiers → [Importer] → `syncDocuments`.
Après cette issue : fichier lu → validation → **calcul diff → prévisualisation + sélecteurs → [Synchroniser]** → `syncDocuments`.

---

## 4. Décisions d'architecture

- **Calcul du diff au moment de `#onFileRead`** : appeler `findExistingJournal` + `buildImportDiff` à la lecture, stocker `#diffResult` dans l'instance. `syncDocuments` recalcule lui-même en interne (idempotent), donc pas de risque de divergence.
- **Pas de nouveau fichier** : tout reste dans `WarboundMarkdownImporterApp.mjs`. La prévisualisation est une nouvelle méthode privée `#renderPreview()`.
- **Import de `buildImportDiff` et `findExistingJournal`** : `buildImportDiff` est déjà exporté de `src/.../index.mjs`. `findExistingJournal` est privé dans l'adaptateur — soit dupliquer la recherche dans l'app (une ligne), soit l'exporter depuis l'adaptateur. Préférer l'export depuis `WarboundImportSynchronizer.mjs` pour éviter la duplication de la logique de recherche par flag.
- **État `#diffResult`** : stocké comme `{ diff, existingJournal }` — `null` si premier import (aucun JournalEntry existant), objet diff sinon. La prévisualisation gère les deux cas.
- **Sélecteurs dossiers** : déjà présents dans `#renderFolderSelect()`, déplacés dans la section prévisualisation (pas de duplication).
- **Bouton renommé** : `[Importer]` → `[Synchroniser]` ; `data-action="import"` reste inchangé pour ne pas casser `#onAction`.

---

## 5. Plan de travail

### 5.1 Exporter `findExistingJournal` depuis l'adaptateur

Dans `scripts/importers/warbound-markdown/WarboundImportSynchronizer.mjs` : transformer `function findExistingJournal` en export nommé.

### 5.2 Ajouter `#diffResult` à l'état de l'app

Dans `WarboundMarkdownImporterApp` : ajouter `#diffResult = null` aux champs privés ; réinitialiser à `null` dans le handler `change` du file input.

### 5.3 Calculer le diff dans `#onFileRead`

Après `validateWarboundModel` réussi (0 erreur) :
1. Appeler `findExistingJournal(model.collectionId)` → `existingJournal`
2. Si `existingJournal` : extraire les pages sérialisées + appeler `buildImportDiff(model, pages)` → stocker dans `#diffResult`
3. Sinon : `#diffResult = null` (premier import — toutes les entrées seront `new`)

### 5.4 Ajouter `#renderPreview()`

Nouvelle méthode privée retournant le HTML de la section prévisualisation :
- En-tête : titre de collection, nombre total, comptages par état
- Corps : liste des entrées avec marqueur (`+` / `~` / `=` / `○` / `!`) + titre
- Pour un premier import (`#diffResult === null`) : toutes les entrées apparaissent avec `+`
- Sélecteurs dossiers (contenu de `#renderFolderSelect()` déplacé ici)
- Boutons [Annuler] / [Synchroniser] en bas

### 5.5 Mettre à jour `#renderSource()`

- Remplacer `folderSection` (appel à `#renderFolderSelect()`) par la section prévisualisation `#renderPreview()`
- Déplacer les boutons dans `#renderPreview()` ou supprimer `importButton` de la `footer` (éviter doublon)
- Supprimer `#renderFolderSelect()` (absorbé dans `#renderPreview()`)

### 5.6 Mettre à jour le label du bouton

`[Importer]` → `[Synchroniser]` dans `#renderPreview()`.

---

## 6. Fichiers modifiés

| Fichier | Action |
|---|---|
| `scripts/importers/warbound-markdown/WarboundImportSynchronizer.mjs` | Export de `findExistingJournal` |
| `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` | Ajout `#diffResult`, calcul dans `#onFileRead`, `#renderPreview()`, refactoring `#renderSource()` |

Aucun fichier créé. Aucun fichier de test modifié (`buildImportDiff` est déjà testé — le comportement pur est inchangé).

---

## 7. Tests attendus

Validation manuelle sur `http://localhost:31000/game` :

1. Sélectionner un fichier `.md` valide (nouveau) → prévisualisation affiche toutes les entrées en `+`
2. Cliquer [Annuler] → aucun document créé dans Foundry
3. Cliquer [Synchroniser] → journal + table créés
4. Resélectionner le même fichier inchangé → toutes les entrées `=`, bouton [Synchroniser] actif, clic → 0 document créé/modifié
5. Modifier une entrée, réimporter → entrée concernée `~`, clic [Synchroniser] → page mise à jour, UUID stable
6. Entrée inactive → `○` ; page Foundry sans correspondance dans le modèle → `!`

Pas de nouveaux tests Vitest : le calcul du diff (logique pure) est déjà couvert par `WarboundImportSynchronizer.test.mjs`. La prévisualisation est du rendu HTML sans logique testable unitairement.

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `findExistingJournal` appelée dans l'app AVANT `syncDocuments` : double recherche | Acceptable — recherche légère sur `game.journal` ; `syncDocuments` reste idempotent |
| Diff calculé au `#onFileRead` devient obsolète si l'utilisateur modifie Foundry entre lecture et clic [Synchroniser] | Risque marginal en contexte MJ solo ; `syncDocuments` recalcule en interne |
| Export de `findExistingJournal` expose un détail d'implémentation | Nommer l'export `findExistingJournalByCollectionId` pour clarifier le contrat |

---

## 9. Critères d'arrêt

- Critères d'acceptation #56 tous verts.
- `pnpm build` passe.
- Prévisualisation affichée avant toute écriture Foundry.
- Marqueurs d'état corrects pour chaque entrée.
- Orphelins visibles avec `!`.
- Sélecteurs dossiers filtrés par type compatible.
- [Annuler] ne crée aucun document.
- [Synchroniser] déclenche la création/mise à jour.
- Validation manuelle sur `http://localhost:31000/game`.
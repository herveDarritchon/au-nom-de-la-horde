# Plan d'implémentation — refactor(markdown-import): migrer WarboundMarkdownImporterApp vers HandlebarsApplicationMixin + PARTS

**Issue** : [#89 — refactor(markdown-import): migrer WarboundMarkdownImporterApp vers HandlebarsApplicationMixin + PARTS](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/89)
**Dépendance** : #87 (TEMPLATE_ROOT) — **déjà livrée** (`src/constants/templates.mjs` existe)
**Branche active** : `refactor/markdown-importer-hbs`

---

## 1. Objectif

Supprimer `_renderHTML()` / `_replaceHTML()` de `WarboundMarkdownImporterApp` et adopter le pattern `HandlebarsApplicationMixin` + `PARTS`, exactement comme `Cof2ImportWizardApp`, en déplaçant chaque section HTML dans un template `.hbs` dédié.

---

## 2. Périmètre

### Inclus

- Conversion de la classe vers `HandlebarsApplicationMixin(ApplicationV2)`
- Déclaration de `static PARTS` avec 4 templates HBS
- Implémentation de `_prepareContext()` et `_onRender()` (à la place de `#activateListeners`)
- Suppression de `_renderHTML()`, `_replaceHTML()`, et de la fonction `esc()` locale
- Création des 4 fichiers HBS dans `templates/apps/warbound-markdown-importer/`
- Import de `TEMPLATE_ROOT` depuis `src/constants/templates.mjs`

### Hors périmètre

- Modification du parseur, du validateur, ou de `WarboundImportSynchronizer`
- Modification des tests existants (aucun test UI actuellement)
- Ajout de nouvelles fonctionnalités à l'importateur

---

## 3. État existant

- `WarboundMarkdownImporterApp` hérite de `foundry.applications.api.ApplicationV2` directement
- Rendu via `_renderHTML()` (retourne HTML string) + `_replaceHTML()` (injecte + bind listeners)
- Fonction `esc()` utilitaire définie localement (à supprimer car Handlebars gère l'échappement)
- `TEMPLATE_ROOT` disponible dans `src/constants/templates.mjs` (livré par #87)
- Modèle de référence : `scripts/importers/cof2ImportWizard.mjs` + `templates/apps/cof2-import-wizard/*.hbs`
- Aucun template HBS pour `warbound-markdown-importer` n'existe encore

---

## 4. Décisions d'architecture

- Suivre exactement le pattern `Cof2ImportWizardApp` : `HandlebarsApplicationMixin` + `PARTS` + `_prepareContext()` + `_onRender()`
- Les 4 PARTS correspondent aux 4 états de l'UI : `source`, `validation`, `preview`, `result`
- `_prepareContext()` expose toutes les données d'état privées en un objet de contexte plat (sans logique de rendu)
- `_onRender()` remplace `#activateListeners()` — lie les événements après chaque rendu de part
- Handlebars gère l'échappement HTML nativement : supprimer `esc()`
- `TEMPLATE_ROOT` importé depuis `src/constants/templates.mjs`

---

## 5. Plan de travail

1. **Modifier `WarboundMarkdownImporterApp.mjs`** :
   - Ajouter l'import de `{ TEMPLATE_ROOT }` depuis `../../../src/constants/templates.mjs`
   - Remplacer `extends ApplicationV2` par `extends HandlebarsApplicationMixin(ApplicationV2)`
   - Ajouter `static PARTS` avec les 4 templates
   - Implémenter `_prepareContext(options)` : retourne un objet avec toutes les données de state
   - Ajouter `_onRender(context, options)` : bind les event listeners (reprend la logique de `#activateListeners`)
   - Supprimer `_renderHTML()`, `_replaceHTML()`, `esc()`, et toutes les méthodes `#render*()` privées
   - Adapter `#canPreview()`, `#doImport()`, etc. (logique métier inchangée)

2. **Créer `templates/apps/warbound-markdown-importer/source.hbs`** :
   - Input fichier, nom de fichier, erreur de lecture
   - Footer avec bouton Fermer

3. **Créer `templates/apps/warbound-markdown-importer/validation.hbs`** :
   - Succès (aucune erreur/warning) ou liste d'erreurs/warnings par sévérité
   - Visible uniquement si `validationResult` non null (guard `{{#if isActive}}`)

4. **Créer `templates/apps/warbound-markdown-importer/preview.hbs`** :
   - Header avec titre, collectionId, type, total
   - Liste des entrées avec état + marqueur
   - Selects dossiers Journal/Table
   - Boutons Synchroniser / Annuler
   - Visible uniquement si `canPreview` (guard HBS)

5. **Créer `templates/apps/warbound-markdown-importer/result.hbs`** :
   - Succès avec compteurs, boutons Ouvrir Journal / Ouvrir Table
   - Ou erreur d'import
   - Visible uniquement si `importResult` non null

---

## 6. Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` | Modifier |
| `templates/apps/warbound-markdown-importer/source.hbs` | Créer |
| `templates/apps/warbound-markdown-importer/validation.hbs` | Créer |
| `templates/apps/warbound-markdown-importer/preview.hbs` | Créer |
| `templates/apps/warbound-markdown-importer/result.hbs` | Créer |

---

## 7. Tests attendus

Aucun test unitaire réaliste (rendu Foundry/Handlebars non testable en Vitest sans mock lourd). Validation manuelle :

- Ouvrir l'importateur depuis le Journal Directory → fenêtre s'affiche
- Sélectionner un `.md` valide → sections validation + preview apparaissent
- Sélectionner un `.md` invalide → section validation affiche les erreurs
- Cliquer "Synchroniser" → bilan s'affiche avec compteurs corrects
- Cliquer "Ouvrir le Journal" / "Ouvrir la Table" → sheets s'ouvrent
- Cliquer "Fermer" / "Annuler" → fenêtre se ferme
- `pnpm build` passe sans erreur

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Handlebars échappement différent de `esc()` — double-encodage | Utiliser `{{{triple}}}` uniquement pour HTML contrôlé ; `{{double}}` pour les données utilisateur |
| `_onRender()` appelé par part → listeners dupliqués | Guard avec `options.isFirstRender` ou retirer les listeners existants avant d'en ajouter |
| `game.folders` non disponible en dehors d'un contexte Foundry actif | Pattern identique à `cof2ImportWizard` — aucun risque supplémentaire |

---

## 9. Critères d'arrêt

- `_renderHTML()` et `_replaceHTML()` absents du fichier source
- `esc()` absent du fichier source
- `TEMPLATE_ROOT` utilisé dans `static PARTS`
- Les 4 fichiers HBS existent
- Validation manuelle dans Foundry : flux complet source → validation → preview → résultat fonctionne

# Plan d'implémentation — refactor(cof2-import): migrer Cof2ImportWizardApp vers HandlebarsApplicationMixin + PARTS

**Issue** : [#88 — refactor(cof2-import): migrer Cof2ImportWizardApp vers HandlebarsApplicationMixin + PARTS](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/88)
**Dépendances** : [#87 — TEMPLATE_ROOT](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/87) ✅ (fusionné)

---

## 1. Objectif

Remplacer les 9 méthodes `#render*()` et le rendu HTML inline de `Cof2ImportWizardApp` par l'architecture officielle Foundry v14 :
`HandlebarsApplicationMixin(ApplicationV2)` + 4 PARTS HBS + 1 partial partagé (stepper).

Le JS conserve toute la logique métier (état, listeners, appels Foundry) ; seule la couche de rendu change.

---

## 2. Périmètre

### Inclus

- Migration de `Cof2ImportWizardApp` dans `scripts/importers/cof2ImportWizard.mjs`
- Création des 4 templates HBS de step et du partial stepper
- Enregistrement du partial dans le hook `init` (via `loadTemplates`)
- Importation de `TEMPLATE_ROOT` depuis `src/constants/templates.mjs`

### Hors périmètre

- Migration de `WarboundMarkdownImporterApp` (issue séparée)
- Modification du CSS existant
- Modification de `encounterFactory.mjs` ou des parsers `src/importers/cof2/`

---

## 3. État existant

`scripts/importers/cof2ImportWizard.mjs` (494 lignes) :

| Élément | Ligne(s) | Sort |
|---|---|---|
| `class Cof2ImportWizardApp extends ApplicationV2` | ~50 | → `HandlebarsApplicationMixin(ApplicationV2)` |
| `async _renderHTML()` | 64–76 | Supprimer |
| `async _replaceHTML(result, content)` | 79–82 | Supprimer |
| `#renderStepper()` | 84–91 | → partial `cof2-wizard-stepper.hbs` |
| `#renderSource()` | 92–108 | → `source.hbs` |
| `#renderAbilities()` | 109–121 | → bloc inline dans `preview.hbs` |
| `#renderAttacksTable()` | 122–146 | → bloc inline dans `preview.hbs` |
| `#renderVariantComparisonRow()` | 151–163 | → bloc inline dans `preview.hbs` |
| `#renderCapacitiesTable()` | 164–194 | → bloc inline dans `preview.hbs` |
| `#renderDiagnostics()` | 195–209 | → bloc inline dans `preview.hbs` |
| `#renderPreview()` | 210–241 | → `preview.hbs` |
| `#renderOptions()` | 242–266 | → `options.hbs` |
| `#renderResult()` | 267–298 | → `result.hbs` |
| `const esc = (s) => …` | 33 | Supprimer (HBS échappe `{{…}}` par défaut) |
| `#activateListeners()` | 315–333 | Conserver tel quel |
| `#onAction()` | 335–366 | Conserver tel quel |
| Hooks `ready`, `renderActorDirectory` | 455–494 | Conserver, ajouter `loadTemplates` dans `init` |

`TEMPLATE_ROOT` déjà disponible : `src/constants/templates.mjs`.
Dossiers `templates/apps/` et `templates/partials/` déjà créés (issue #87).

---

## 4. Décisions d'architecture

### 4.1 HandlebarsApplicationMixin + PARTS

`static PARTS` déclare 4 parts, une par step. `_configureRenderOptions()` filtre dynamiquement `options.parts` pour ne rendre que la part active. Le stepper est un partial Handlebars inclus dans chaque template via `{{> cof2-wizard-stepper}}`.

```js
static PARTS = {
  source:  { template: `${TEMPLATE_ROOT}/apps/cof2-import-wizard/source.hbs` },
  preview: { template: `${TEMPLATE_ROOT}/apps/cof2-import-wizard/preview.hbs` },
  options: { template: `${TEMPLATE_ROOT}/apps/cof2-import-wizard/options.hbs` },
  result:  { template: `${TEMPLATE_ROOT}/apps/cof2-import-wizard/result.hbs` },
};

_configureRenderOptions(options) {
  super._configureRenderOptions(options);
  options.parts = [this.#step];
}
```

### 4.2 _prepareContext()

Retourne un objet contexte complet couvrant tous les steps. `_preparePartContext(partId, context)` peut être utilisé si un sous-ensemble suffit par part ; pour ce wizard, `_prepareContext()` seul est suffisant (le contexte est petit).

Données à exposer : `step`, `steps` (pour le stepper), `sourceText`, `draft`, `capacityHits` (convertie en tableau), `confirmedVariants`, `options`, `result`, `analyzeError`, constantes de labels.

### 4.3 data-variant-confirm et listeners

`#activateListeners(content)` est appelé depuis `_onRender()` (hook Foundry v14 post-render). Remplace l'appel actuel dans `_replaceHTML()`.

### 4.4 Enregistrement du partial

Dans le hook `Hooks.once("init", ...)`, appeler :
```js
loadTemplates({ "cof2-wizard-stepper": `${TEMPLATE_ROOT}/partials/cof2-wizard-stepper.hbs` });
```

### 4.5 Triple escape

Dans les templates HBS, utiliser `{{{val}}}` (triple stache) uniquement pour le HTML déjà construit (aucun cas ici). Tous les champs utilisateur passent par `{{val}}` (double stache, échappement automatique). La fonction `esc()` est supprimée.

---

## 5. Plan de travail

1. **Ajouter le hook `init`** dans `scripts/importers/cof2ImportWizard.mjs` pour appeler `loadTemplates` avec le partial stepper.
2. **Remplacer l'héritage de classe** : `ApplicationV2` → `HandlebarsApplicationMixin(ApplicationV2)`.
3. **Importer `TEMPLATE_ROOT`** depuis `src/constants/templates.mjs`.
4. **Ajouter `static PARTS`** avec les 4 chemins HBS.
5. **Implémenter `_configureRenderOptions()`** pour filtrer par step actif.
6. **Implémenter `_prepareContext()`** en extrayant les données de toutes les méthodes `#render*()`.
7. **Implémenter `_onRender(context, options)`** pour appeler `#activateListeners()`.
8. **Supprimer** : `_renderHTML()`, `_replaceHTML()`, `esc()`, et les 9 méthodes `#render*()`.
9. **Créer** `templates/partials/cof2-wizard-stepper.hbs`.
10. **Créer** `templates/apps/cof2-import-wizard/source.hbs`.
11. **Créer** `templates/apps/cof2-import-wizard/preview.hbs`.
12. **Créer** `templates/apps/cof2-import-wizard/options.hbs`.
13. **Créer** `templates/apps/cof2-import-wizard/result.hbs`.

---

## 6. Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `scripts/importers/cof2ImportWizard.mjs` | Modifier (migration classe + suppression render*) |
| `templates/partials/cof2-wizard-stepper.hbs` | Créer |
| `templates/apps/cof2-import-wizard/source.hbs` | Créer |
| `templates/apps/cof2-import-wizard/preview.hbs` | Créer |
| `templates/apps/cof2-import-wizard/options.hbs` | Créer |
| `templates/apps/cof2-import-wizard/result.hbs` | Créer |

Aucune modification de `src/`, `module.json`, ni des autres importeurs.

---

## 7. Tests attendus

- Validation manuelle sur instance Foundry locale (http://localhost:31000/game) :
  - Ouvrir le wizard via le bouton « Importer une rencontre COF2 » dans l'annuaire des acteurs
  - Parcourir les 4 steps avec un statblock valide
  - Vérifier le stepper (active/done/pending)
  - Vérifier `data-variant-confirm` (checkbox → `#confirmedVariants`)
  - Vérifier que les champs de formulaire persistent l'état entre renders
  - Vérifier la création d'acteur (step result)
- `pnpm build` passe sans erreur (pas de référence `worlds/`)
- Si des tests unitaires couvrent `_prepareContext()` (logique de mapping pur), les ajouter dans `src/importers/cof2/` sous Vitest.

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `_onRender()` appelé sur une autre part que celle attendue | Toujours vérifier `options.parts` dans `_onRender` avant d'appeler `#activateListeners()` |
| Perte de l'état textarea entre re-renders (HBS recréé le DOM) | Lier `#sourceText` depuis `_prepareContext()` ; la valeur textarea vient du contexte, pas du DOM |
| Echappement double sur les labels de constantes | Constantes en pur texte → double stache `{{…}}` suffit |
| `loadTemplates` appelé après `ready` (partial non enregistré) | Utiliser `Hooks.once("init", ...)`, qui s'exécute avant `ready` |
| `#capacityHits` est une `Map` — non sérialisable directement en contexte HBS | Convertir en tableau `[{index, hit, status, comparison}]` dans `_prepareContext()` |

---

## 9. Critères d'arrêt

- [ ] `_renderHTML()` et `_replaceHTML()` absents du fichier
- [ ] `HandlebarsApplicationMixin` utilisé comme mixin de base
- [ ] `static PARTS` déclaré avec les 4 chemins via `TEMPLATE_ROOT`
- [ ] Les 4 templates HBS existent et sont non vides
- [ ] Le partial `cof2-wizard-stepper.hbs` existe et est enregistré dans `init`
- [ ] `esc()` absent du JS
- [ ] Les 4 steps s'affichent et fonctionnent dans le navigateur
- [ ] `data-variant-confirm` déclenche bien la mise à jour de `#confirmedVariants`
- [ ] `pnpm build` passe

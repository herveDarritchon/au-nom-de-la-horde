# Plan d'implémentation — refactor(templates): créer TEMPLATE_ROOT et l'arborescence templates/

**Issue** : [#87 — refactor(templates): créer la constante TEMPLATE_ROOT et l'arborescence templates/](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/87)
**Dépendances** : Aucune

---

## 1. Objectif

Poser le socle technique nécessaire à toutes les futures migrations HBS :
- Centraliser `MODULE_ID` et construire `TEMPLATE_ROOT` dans un fichier de constantes dédié
- Créer l'arborescence `templates/` vide (avec `.gitkeep`) pour accueillir les futurs templates HBS

---

## 2. Périmètre

### Inclus

- `src/constants/templates.mjs` — exporte `MODULE_ID` et `TEMPLATE_ROOT`
- Dossiers vides avec `.gitkeep` : `templates/apps/`, `templates/dialogs/`, `templates/chat/`, `templates/components/`, `templates/partials/`

### Hors périmètre

- Migration des importeurs existants vers `TEMPLATE_ROOT` (issue future)
- Aucune modification des fichiers existants (`scripts/warbound.mjs`, etc.)

---

## 3. État existant

- `MODULE_ID = "warbound-campaign-content"` est défini localement dans :
  - `scripts/warbound.mjs:6`
  - `scripts/importers/cof2Debug.mjs`
  - `scripts/importers/cof2ImportWizard.mjs`
- Aucun répertoire `src/constants/` n'existe
- Aucun répertoire `templates/` n'existe

---

## 4. Décisions d'architecture

- `TEMPLATE_ROOT` = `` `modules/${MODULE_ID}/templates` `` — préfixe canonique Foundry pour charger les templates HBS depuis un module
- Le fichier est placé dans `src/constants/` (logique pure, pas de dépendance Foundry)
- Les `.gitkeep` permettent de versionner les dossiers vides dans git

---

## 5. Plan de travail

1. Créer `src/constants/templates.mjs` avec les deux exports
2. Créer `templates/apps/.gitkeep`
3. Créer `templates/dialogs/.gitkeep`
4. Créer `templates/chat/.gitkeep`
5. Créer `templates/components/.gitkeep`
6. Créer `templates/partials/.gitkeep`

---

## 6. Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `src/constants/templates.mjs` | Créer |
| `templates/apps/.gitkeep` | Créer |
| `templates/dialogs/.gitkeep` | Créer |
| `templates/chat/.gitkeep` | Créer |
| `templates/components/.gitkeep` | Créer |
| `templates/partials/.gitkeep` | Créer |

Aucun fichier existant modifié.

---

## 7. Tests attendus

Pas de test unitaire requis pour des constantes et des dossiers vides. Vérification manuelle :
- `import { TEMPLATE_ROOT } from './src/constants/templates.mjs'` résout correctement
- `pnpm build` passe sans erreur

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `TEMPLATE_ROOT` mal formé (double slash, mauvaise casse) | Vérifier le résultat de la concaténation : `modules/warbound-campaign-content/templates` |
| Collision avec un futur `src/constants/index.mjs` | Nommer le fichier `templates.mjs` (spécifique) ; un barrel peut l'importer plus tard |

---

## 9. Critères d'arrêt

- [ ] `TEMPLATE_ROOT` exporté depuis `src/constants/templates.mjs`
- [ ] Les 5 dossiers `templates/*/` existent dans le dépôt avec `.gitkeep`
- [ ] Aucun fichier existant modifié
- [ ] `pnpm build` passe
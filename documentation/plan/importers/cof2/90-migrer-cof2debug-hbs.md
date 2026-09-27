# Plan d'implémentation — refactor(cof2-debug): migrer les DialogV2 de cof2Debug vers des templates HBS

**Issue** : [#90 — refactor(cof2-debug): migrer les DialogV2 de cof2Debug vers des templates HBS](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/90)
**Dépendance** : [#87 — TEMPLATE_ROOT](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/87) ✅ (fusionné)

---

## 1. Objectif

Supprimer les 3 blocs HTML inline dans `scripts/importers/cof2Debug.mjs` (lignes 25, 39, 60).
Chaque bloc devient un template HBS dans `templates/dialogs/`.
Le JS passe un contexte structuré à `foundry.applications.handlebars.renderTemplate()` avant d'appeler `DialogV2.prompt()`.
Le helper `esc()` est supprimé (Handlebars échappe nativement).

---

## 2. Périmètre

### Inclus

- Création de 3 templates HBS dans `templates/dialogs/`
- Modification de `scripts/importers/cof2Debug.mjs` : import `TEMPLATE_ROOT`, suppression `esc()`, appels `renderTemplate()`

### Hors périmètre

- Modification des parsers `src/importers/cof2/`
- Modification de `encounterFactory.mjs`
- Modification du CSS existant

---

## 3. État existant

`scripts/importers/cof2Debug.mjs` (~80 lignes) :

| Élément | Ligne | Sort |
|---|---|---|
| `const esc = (s) => …` | 13 | Supprimer |
| `content: \`<div class="form-group stacked">…\`` | 25 | → `renderTemplate(…/cof2-statblock-input.hbs, {})` |
| `content: \`<p>Rien n'a été créé…\`` | 39 | → `renderTemplate(…/cof2-statblock-errors.hbs, { errors })` |
| `content: \`<p>${counts…}\`` | 60 | → `renderTemplate(…/cof2-import-report.hbs, { counts, messages, rollbackFailed })` |

Infrastructure disponible :
- `src/constants/templates.mjs` → `TEMPLATE_ROOT = "modules/warbound-campaign-content/templates"`
- `templates/dialogs/` → dossier vide prêt
- Pattern établi par issues #88 et #89

---

## 4. Décisions d'architecture

**Emojis de niveau** : ne pas créer un helper Handlebars global. Pré-calculer dans le JS :
```js
const enrichedMessages = messages.map((m) => ({ ...m, emoji: LEVEL_EMOJI[m.level] ?? "🔴" }));
```
Puis dans le template : `{{this.emoji}} {{this.message}}`.

**`renderTemplate` asynchrone** : les 3 appels précèdent `DialogV2.prompt()` dans le même bloc `async`. Pas d'impact sur le flux existant.

---

## 5. Plan de travail

### 5.1 Créer `templates/dialogs/cof2-statblock-input.hbs`

Template statique (pas de contexte) :
```hbs
<div class="form-group stacked">
  <label>Collez un statblock du Bestiaire COF2</label>
  <textarea name="statblock" rows="18" style="width:100%;font-family:monospace" autofocus></textarea>
</div>
```

### 5.2 Créer `templates/dialogs/cof2-statblock-errors.hbs`

Contexte : `{ errors: blockingErrors }` (tableau de `{ message: string }`).
```hbs
<p>Rien n'a été créé :</p>
<ul>
  {{#each errors}}
    <li>{{this.message}}</li>
  {{/each}}
</ul>
```

### 5.3 Créer `templates/dialogs/cof2-import-report.hbs`

Contexte : `{ counts, messages: enrichedMessages, rollbackFailed }`.
```hbs
<p>{{counts.attacksCreated}} attaque(s) créée(s), {{counts.capacitiesReused}} capacité(s) réutilisée(s),
  {{counts.capacitiesCreated}} capacité(s) créée(s), {{counts.errors}} erreur(s), {{counts.toReview}} élément(s) à vérifier.</p>
{{#if rollbackFailed}}
  <p><strong>Le rollback automatique a échoué : l'acteur est incomplet, envisager sa suppression manuelle.</strong></p>
{{/if}}
<ul>
  {{#each messages}}
    <li>{{this.emoji}} {{this.message}}</li>
  {{/each}}
</ul>
```

### 5.4 Modifier `scripts/importers/cof2Debug.mjs`

1. Ajouter en tête : `import { TEMPLATE_ROOT } from "../../src/constants/templates.mjs";`
2. Supprimer `const esc = (s) => …`
3. Dialogue 1 (statblock input) :
   ```js
   content: await foundry.applications.handlebars.renderTemplate(
     `${TEMPLATE_ROOT}/dialogs/cof2-statblock-input.hbs`, {}
   ),
   ```
4. Dialogue 2 (erreurs bloquantes) :
   ```js
   content: await foundry.applications.handlebars.renderTemplate(
     `${TEMPLATE_ROOT}/dialogs/cof2-statblock-errors.hbs`, { errors: blockingErrors }
   ),
   ```
5. Dialogue 3 (compte-rendu) :
   ```js
   const enrichedMessages = messages.map((m) => ({ ...m, emoji: LEVEL_EMOJI[m.level] ?? "🔴" }));
   content: await foundry.applications.handlebars.renderTemplate(
     `${TEMPLATE_ROOT}/dialogs/cof2-import-report.hbs`,
     { counts, messages: enrichedMessages, rollbackFailed: report.diagnostics.some((d) => d.code === "IMPORT_ROLLBACK_FAILED") }
   ),
   ```

---

## 6. Fichiers modifiés

| Fichier | Action |
|---|---|
| `scripts/importers/cof2Debug.mjs` | Modifier |
| `templates/dialogs/cof2-statblock-input.hbs` | Créer |
| `templates/dialogs/cof2-statblock-errors.hbs` | Créer |
| `templates/dialogs/cof2-import-report.hbs` | Créer |

---

## 7. Tests attendus

Pas de test unitaire automatisé possible pour les `DialogV2` (API Foundry UI).
Validation manuelle via console Foundry :

```js
game.modules.get("warbound-campaign-content").api.cof2.importStatblockFromPrompt()
```

Vérifier :
- Dialogue 1 s'ouvre avec le textarea statblock
- Dialogue 2 s'ouvre avec la liste d'erreurs si statblock invalide
- Dialogue 3 s'ouvre avec les compteurs et messages si création réussie avec avertissements

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `renderTemplate` lève une erreur si le chemin HBS est introuvable | Tester immédiatement dans Foundry après création des fichiers |
| `LEVEL_EMOJI` utilisé avant la suppression de `esc` | `LEVEL_EMOJI` est conservé, seul `esc` disparaît |

---

## 9. Critères d'arrêt

- 0 chaîne HTML inline dans `cof2Debug.mjs` (`grep "content: \`<"` retourne vide)
- `esc` absent du fichier
- `TEMPLATE_ROOT` importé et utilisé
- Les 3 dialogues s'ouvrent correctement dans Foundry local

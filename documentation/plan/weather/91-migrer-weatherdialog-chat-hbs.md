# Plan d'implémentation — refactor(weather): migrer le message de chat WeatherDialog vers un template HBS

**Issue** : [#91 — refactor(weather): migrer le message de chat WeatherDialog vers un template HBS](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/91)
**Dépendance** : [#87 — TEMPLATE_ROOT](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/87) ✅ (fusionné)

---

## 1. Objectif

Supprimer le HTML inline dans `WeatherDialog.#onPublishToChat()`.
Extraire le rendu dans `templates/chat/weather-report.hbs`.
Le JS prépare le contexte depuis `_prepareContext({})` et appelle `foundry.applications.handlebars.renderTemplate()` avant `ChatMessage.create()`.

---

## 2. Périmètre

### Inclus

- Création de `templates/chat/weather-report.hbs`
- Modification de `scripts/weather/ui/WeatherDialog.mjs` : import `TEMPLATE_ROOT`, appel `renderTemplate()`

### Hors périmètre

- Modification des services météo (`WeatherEngine`, `WeatherStateService`, `ZoneWeatherService`)
- Modification du CSS existant
- Modification d'autres méthodes de `WeatherDialog`

---

## 3. État existant

`scripts/weather/ui/WeatherDialog.mjs`, méthode `static async #onPublishToChat()` (~lignes 107–122) :

```js
const content = `<div class="warbound weather-chat">
  <h3><i class="fa-solid ${ctx.regimeIcon}"></i> ${ctx.regimeLabel}</h3>
  <ul>
    <li><strong>Ciel</strong> : ${ctx.labels.sky}</li>
    <li><strong>Précipitations</strong> : ${ctx.labels.precipitation}</li>
    <li><strong>Vent</strong> : ${ctx.labels.wind}</li>
    <li><strong>Température</strong> : ${ctx.labels.temperature}</li>
  </ul>
  <p class="narrative">${ctx.narrative}</p>
</div>`
await ChatMessage.create({ content, style: CONST.CHAT_MESSAGE_STYLES.OTHER })
```

Le contexte vient de `await this._prepareContext({})` qui retourne déjà `regimeIcon`, `regimeLabel`, `labels`, `narrative`.

Infrastructure disponible :
- `src/constants/templates.mjs` → `TEMPLATE_ROOT`
- `templates/chat/` → dossier vide prêt

---

## 4. Décisions d'architecture

**Contexte minimal** : passer uniquement les champs utilisés par le template (`regimeIcon`, `regimeLabel`, `labels`, `narrative`) plutôt que le `ctx` complet. Évite de lier le template à la structure interne de `_prepareContext`.

**Pas d'escaping manuel** : Handlebars échappe les valeurs par défaut — aucun helper à ajouter.

---

## 5. Plan de travail

### 5.1 Créer `templates/chat/weather-report.hbs`

Contexte : `{ regimeIcon, regimeLabel, labels: { sky, precipitation, wind, temperature }, narrative }`.

```hbs
<div class="warbound weather-chat">
  <h3><i class="fa-solid {{regimeIcon}}"></i> {{regimeLabel}}</h3>
  <ul>
    <li><strong>Ciel</strong> : {{labels.sky}}</li>
    <li><strong>Précipitations</strong> : {{labels.precipitation}}</li>
    <li><strong>Vent</strong> : {{labels.wind}}</li>
    <li><strong>Température</strong> : {{labels.temperature}}</li>
  </ul>
  <p class="narrative">{{narrative}}</p>
</div>
```

### 5.2 Modifier `scripts/weather/ui/WeatherDialog.mjs`

1. Ajouter en tête du fichier :
   ```js
   import { TEMPLATE_ROOT } from "../../../src/constants/templates.mjs";
   ```
2. Dans `#onPublishToChat()`, remplacer le template littéral par :
   ```js
   const content = await foundry.applications.handlebars.renderTemplate(
     `${TEMPLATE_ROOT}/chat/weather-report.hbs`,
     { regimeIcon: ctx.regimeIcon, regimeLabel: ctx.regimeLabel, labels: ctx.labels, narrative: ctx.narrative }
   )
   ```

---

## 6. Fichiers modifiés

| Fichier | Action |
|---|---|
| `scripts/weather/ui/WeatherDialog.mjs` | Modifier |
| `templates/chat/weather-report.hbs` | Créer |

---

## 7. Tests attendus

Pas de test unitaire automatisé pour `ChatMessage.create()` (API Foundry UI).
Validation manuelle dans Foundry :

1. Ouvrir le dialogue météo (module actif, zone configurée).
2. Cliquer « Publier au chat ».
3. Vérifier : icône régime affichée, 4 labels (Ciel/Précipitations/Vent/Température), narrative présente.

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `renderTemplate` lève une erreur si le chemin HBS introuvable | Tester immédiatement dans Foundry après création du fichier |
| Chemin relatif vers `src/constants/templates.mjs` incorrect depuis `scripts/weather/ui/` | Vérifier : `../../../src/constants/templates.mjs` — 3 niveaux de remontée depuis `scripts/weather/ui/` |

---

## 9. Critères d'arrêt

- 0 HTML inline dans `#onPublishToChat()` (`grep "content = \`<"` retourne vide)
- `TEMPLATE_ROOT` importé et utilisé
- Message de chat s'affiche correctement dans Foundry

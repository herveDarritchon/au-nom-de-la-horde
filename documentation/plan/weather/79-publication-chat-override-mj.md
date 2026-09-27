# Plan d'implémentation — feat(weather): publication dans le chat et override MJ

**Issue** : [#79 — feat(weather): publication dans le chat et override MJ](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/79)
**Dépendances** : #78 — interface MJ dialogue météo — terminée

---

## 1. Objectif

Ajouter deux boutons dans `WeatherDialog` :
1. **"Publier dans le chat"** — crée un `ChatMessage` visible par tous les joueurs avec l'état météo courant (icône, intitulé, composantes, description narrative).
2. **↻ (override)** — relance `WeatherEngine.next()` avec le même contexte (même biome/saison, même historique) sans incrémenter `regimeAge` ni pousser l'état courant dans l'historique.

---

## 2. Périmètre

### Inclus

- `scripts/weather/ui/WeatherDialog.mjs` — deux nouvelles actions statiques : `publishToChat`, `overrideWeather`
- `scripts/weather/ui/weather-dialog.hbs` — deux nouveaux boutons dans le template

### Hors périmètre

- Sélection de zone via l'UI
- Format riche Handlebars pour le message chat (texte brut suffisant pour cette itération)
- Historique météo dans le dialogue
- Paramétrage des zones

---

## 3. État existant

- `scripts/weather/ui/WeatherDialog.mjs` — `WeatherDialog extends ApplicationV2`, action `nextDay` existante, helpers `buildNarrative()`, `REGIME_LABELS`, `REGIME_ICONS`, `SKY_LABELS`, `PRECIP_LABELS`, `WIND_LABELS`, `TEMP_LABELS`
- `scripts/weather/services/WeatherStateService.mjs` — `getState(zoneId)`, `setState(zoneId, state)`
- `scripts/weather/services/ZoneWeatherService.mjs` — `getZoneConfig(zoneId)`
- `src/weather/engine/WeatherEngine.mjs` — `next({ biome, season, previousWeather, history })` → nouvel état

---

## 4. Décisions d'architecture

### 4.1 Publication dans le chat

Utiliser `ChatMessage.create({ content, style: CONST.CHAT_MESSAGE_STYLES.OTHER })` (API Foundry v14). Le contenu est du HTML généré localement dans `WeatherDialog.mjs` via une fonction `buildChatContent(context)` — pas de template séparé pour cette itération.

Structure du message :
```
<div class="warbound weather-chat">
  <h3><i class="fa-solid {regimeIcon}"></i> {regimeLabel}</h3>
  <ul>
    <li>Ciel : {labels.sky}</li>
    <li>Précipitations : {labels.precipitation}</li>
    <li>Vent : {labels.wind}</li>
    <li>Température : {labels.temperature}</li>
  </ul>
  <p class="narrative">{narrative}</p>
</div>
```

### 4.2 Override (↻)

L'override **ne pousse pas** l'état courant dans l'historique — il écrase l'état courant par un nouveau tirage avec le même contexte. `regimeAge` repart à 0 (valeur retournée par `WeatherEngine.next()`). L'historique (`previous.history`) est conservé inchangé.

Séquence :
1. `ZoneWeatherService.getZoneConfig(zoneId)` → `biome`, `season`
2. `WeatherStateService.getState(zoneId)` → `previous`
3. `WeatherEngine.next({ biome, season, previousWeather: previous, history: previous?.history ?? [] })`
4. `WeatherStateService.setState(zoneId, { ...next, zoneId, history: previous?.history ?? [] })` — historique inchangé
5. `this.render()`

Différence avec `#onNextDay` : pas d'ajout de `previous` dans `history`.

### 4.3 Enregistrement des actions

Les deux nouvelles actions s'ajoutent dans `DEFAULT_OPTIONS.actions` :
```js
actions: {
  nextDay:        WeatherDialog.#onNextDay,
  publishToChat:  WeatherDialog.#onPublishToChat,
  overrideWeather: WeatherDialog.#onOverrideWeather,
}
```

---

## 5. Plan de travail

| Étape | Fichier | Action |
|---|---|---|
| 1 | `scripts/weather/ui/WeatherDialog.mjs` | Ajouter `buildChatContent(context)` et les deux actions statiques privées |
| 2 | `scripts/weather/ui/WeatherDialog.mjs` | Déclarer `publishToChat` et `overrideWeather` dans `DEFAULT_OPTIONS.actions` |
| 3 | `scripts/weather/ui/weather-dialog.hbs` | Ajouter les deux boutons dans le template |

---

## 6. Fichiers modifiés

| Fichier | Statut |
|---|---|
| `scripts/weather/ui/WeatherDialog.mjs` | Modifié |
| `scripts/weather/ui/weather-dialog.hbs` | Modifié |

---

## 7. Tests attendus

Pas de tests unitaires automatisés pour `WeatherDialog` (classe Foundry). Validation manuelle requise.

Tests unitaires existants (`WeatherStateService.test.mjs`, `ZoneWeatherService.test.mjs`) couvrent la couche service — pas de régression attendue.

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `ChatMessage.create` échoue si pas de `game` initialisé | Action accessible uniquement depuis le dialogue ouvert → `game` garanti initialisé |
| Override produit le même résultat (même seed) | `WeatherEngine.next()` utilise `Math.random()` — pas de seed fixe, résultat différent à chaque appel |
| Historique corrompu après override suivi de `nextDay` | Override conserve `previous.history` inchangé → `nextDay` empile correctement depuis le nouvel état |

---

## 9. Validation manuelle

URL : http://localhost:31000/game

1. Charger le module — vérifier l'absence d'erreur console
2. Ouvrir le dialogue météo (bouton scene controls GM)
3. Cliquer "Publier dans le chat" → message visible dans le chat pour GM et joueurs, contenant icône, régime, composantes, narratif
4. Vérifier format du message (lisible, pas de données brutes)
5. Cliquer ↻ → météo régénérée, `regimeAge` remis à 0, historique inchangé, dialogue rafraîchi
6. Cliquer "Jour suivant" après un override → génération normale avec empilement dans l'historique
7. Vérifier que "Jour suivant" pousse bien l'état de l'override (pas l'état pré-override)

---

## 10. Critères d'arrêt

- "Publier dans le chat" envoie un `ChatMessage` visible par tous les joueurs
- Message contient icône, intitulé de régime, composantes et description narrative
- Bouton ↻ relance la génération sans incrémenter `regimeAge` ni modifier `history`
- Après override, "Jour suivant" continue normalement depuis le nouvel état
- Format du message cohérent avec le style éditorial Warbound (texte lisible, pas de données brutes)
- Aucune erreur console
- Validation manuelle confirmée sur http://localhost:31000/game
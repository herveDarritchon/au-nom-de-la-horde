# Plan d'implémentation — feat(weather): intégration Simple Calendar

**Issue** : [#104 — feat(weather): intégration Simple Calendar — avancer la météo lors d'un changement de date](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/104)
**Modules impactés** : `scripts/weather/index.mjs`, `scripts/weather/services/WeatherSettings.mjs`, `scripts/weather/services/ZoneWeatherService.mjs`, nouveau `scripts/weather/integrations/SimpleCalendarIntegration.mjs`

---

## 1. Objectif

Lorsque Simple Calendar avance d'un jour, déclencher automatiquement `WeatherEngine.next()` pour chaque zone météo active, sans action manuelle du MJ.
L'intégration est optionnelle (setting world on/off, défaut off) et transparente si Simple Calendar est absent.

---

## 2. Périmètre

### Inclus

- Nouveau fichier `SimpleCalendarIntegration.mjs` : enregistrement conditionnel du hook Simple Calendar
- Deux nouveaux settings world dans `WeatherSettings.mjs` :
  - `simpleCalendarIntegration` (on/off, défaut **false**, `config: true`, visible GM)
  - `simpleCalendarAutoPublish` (on/off, défaut **false**, `config: true`, visible GM)
- Ajout d'un helper `ZoneWeatherService.getAllZoneIds()` pour itérer sur toutes les zones configurées
- Enregistrement de l'intégration dans `index.mjs` via `Hooks.once('ready')`
- Tests unitaires du handler (mock Simple Calendar hook, mock zones)

### Hors périmètre

- Modification du `WeatherDialog`
- Intégration avec d'autres calendriers que Simple Calendar
- UI de configuration Simple Calendar (les settings standard Foundry suffisent)
- Modificateurs de biome (issue #102)

---

## 3. État existant

### Appel `WeatherEngine.next()` — patron existant

`WeatherDialog.mjs` `#onNextDay` (lignes 140–162) contient déjà le patron complet à réutiliser :

```
const config   = ZoneWeatherService.getZoneConfig(zoneId)
const previous = WeatherStateService.getState(zoneId)
const next     = WeatherEngine.next({ biome, season, previousWeather, history })
const newHistory = [...(previous?.history ?? []), previous].filter(Boolean)
await WeatherStateService.setState(zoneId, { ...next, zoneId, history: newHistory })
```

### Zones actives

`ZoneWeatherService.getZoneConfig(zoneId)` lit `game.settings.get(MODULE_ID, WEATHER_ZONE_CONFIGS_SETTING)`.
Il n'existe pas encore de helper pour itérer toutes les zones — à ajouter.

### Hook Simple Calendar

Simple Calendar émet `SimpleCalendar.Hooks.DateTimeChange` (ou équivalent) lors de tout changement de date.
Vérification de présence : `game.modules.get('simple-calendar')?.active`.

---

## 4. Décisions d'architecture

- **Isolation** : tout le code d'intégration dans `SimpleCalendarIntegration.mjs`. `index.mjs` appelle uniquement `registerSimpleCalendarIntegration()`.
- **Guard** : l'enregistrement du hook Simple Calendar se fait dans `Hooks.once('ready')` (modules actifs garantis), jamais dans `init`.
- **Double guard** : vérifier `game.modules.get('simple-calendar')?.active` ET le setting `simpleCalendarIntegration` avant d'attacher le hook.
- **Réutilisation** : le handler réplique exactement la logique de `#onNextDay` (WeatherDialog.mjs:140–162) pour chaque zone.
- **Publication auto** : si le setting `simpleCalendarAutoPublish` est activé, le handler publie un message de chat pour chaque zone (même appel que `#onPublishToChat`).
- **`config.weather !== 'disabled'`** : une zone `disabled` ne doit pas être avancée — `ZoneWeatherService.resolveWeatherState()` retourne `null` dans ce cas, utiliser ce retour comme guard.

---

## 5. Plan de travail

### 5.1 Ajouter `ZoneWeatherService.getAllZoneIds()`

Dans `scripts/weather/services/ZoneWeatherService.mjs` :

```
getAllZoneIds() {
  const configs = game.settings.get(MODULE_ID, WEATHER_ZONE_CONFIGS_SETTING) ?? {}
  return Object.keys(configs)
},
```

### 5.2 Ajouter les settings dans `WeatherSettings.mjs`

Deux settings supplémentaires dans `registerWeatherSettings()` :

- `simpleCalendarIntegration` — `scope: 'world'`, `config: true`, `type: Boolean`, `default: false`
- `simpleCalendarAutoPublish` — `scope: 'world'`, `config: true`, `type: Boolean`, `default: false`

### 5.3 Créer `scripts/weather/integrations/SimpleCalendarIntegration.mjs`

```
export function registerSimpleCalendarIntegration() {
  Hooks.once('ready', () => {
    if (!game.modules.get('simple-calendar')?.active) return
    if (!game.settings.get(MODULE_ID, SIMPLE_CALENDAR_INTEGRATION_SETTING)) return
    // écouter le hook Simple Calendar
    // pour chaque zone active : appeler advanceZoneWeather(zoneId)
  })
}

async function advanceZoneWeather(zoneId) {
  // même logique que WeatherDialog.#onNextDay
  // si simpleCalendarAutoPublish → publier le message de chat
}
```

### 5.4 Brancher dans `index.mjs`

Dans `Hooks.once('init')`, après `registerWeatherSettings()` :

```
import { registerSimpleCalendarIntegration } from './integrations/SimpleCalendarIntegration.mjs'
// ...
registerSimpleCalendarIntegration()
```

---

## 6. Fichiers modifiés

| Fichier | Action |
|---|---|
| `scripts/weather/integrations/SimpleCalendarIntegration.mjs` | **Nouveau** — handler d'intégration |
| `scripts/weather/services/WeatherSettings.mjs` | Ajouter 2 settings + exporter leurs constantes |
| `scripts/weather/services/ZoneWeatherService.mjs` | Ajouter `getAllZoneIds()` |
| `scripts/weather/index.mjs` | Importer et appeler `registerSimpleCalendarIntegration()` |

---

## 7. Tests attendus

- **Unitaire** : handler appelé avec 2 zones → `WeatherEngine.next()` appelé 2 fois, `WeatherStateService.setState()` appelé 2 fois (mock Simple Calendar et Foundry API)
- **Unitaire** : zone avec `weather: 'disabled'` → `WeatherEngine.next()` **non** appelé pour cette zone
- **Unitaire** : `getAllZoneIds()` retourne les clés du setting, tableau vide si aucune config
- **Unitaire** : setting `simpleCalendarIntegration = false` → hook non enregistré
- **Unitaire** : `simpleCalendarAutoPublish = true` → `ChatMessage.create()` appelé pour chaque zone avancée
- **Non-régression** : avance manuelle via bouton "Jour suivant" dans `WeatherDialog` inchangée

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Nom exact du hook Simple Calendar inconnu | Vérifier la doc Simple Calendar v2 avant d'implémenter ; utiliser `SimpleCalendar.Hooks.DateTimeChange` |
| Hook déclenché à chaque changement d'heure, pas seulement de jour | Filtrer sur le delta jour > 0 dans l'argument du hook |
| Double avance si plusieurs tabs GM ouverts | Foundry world settings sont partagés ; accepté pour V2, documenter en commentaire |
| Simple Calendar absent → erreur silencieuse | Guard `game.modules.get('simple-calendar')?.active` avant tout |

---

## 9. Critères d'arrêt

- Sans Simple Calendar : comportement identique (aucune régression)
- Avec Simple Calendar + setting off : comportement identique
- Avec Simple Calendar + setting on : avancer d'un jour → toutes les zones actives avancent automatiquement
- Setting `simpleCalendarAutoPublish` on : message de chat publié automatiquement par zone
- `pnpm build` passe (exit 0)
- Tests unitaires du handler passent

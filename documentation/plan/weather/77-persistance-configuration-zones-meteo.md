# Plan d'implémentation — feat(weather): persistance et configuration des zones météo (Foundry)

**Issue** : [#77 — feat(weather): persistance et configuration des zones météo (Foundry)](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/77)
**Dépendances** : #76 — moteur météo (machine à états) — terminée

---

## 1. Objectif

Créer deux services Foundry dans `scripts/weather/services/` :

- `WeatherStateService.mjs` — lecture/écriture de l'état météo courant par zone via `game.world.setFlag`/`getFlag`
- `ZoneWeatherService.mjs` — configuration de zone (biome, saison, mode météo) et résolution de l'héritage `inheritOutside`

---

## 2. Périmètre

### Inclus

- `scripts/weather/services/WeatherStateService.mjs`
- `scripts/weather/services/ZoneWeatherService.mjs`
- Tests `node:test` colocalisés

### Hors périmètre

- UI MJ / Application Foundry
- Intégration avec `WeatherEngine.next()` (branchement hook de temps)
- Toute autre issue du générateur météo

---

## 3. État existant

- `src/weather/engine/WeatherEngine.mjs` — moteur pur, produit `{ regime, sky, precipitation, wind, temperature, regimeAge }`
- `scripts/warbound.mjs` — `MODULE_ID = "warbound-campaign-content"` déjà défini

---

## 4. Architecture

### WeatherStateService

```js
const FLAG_SCOPE = 'warbound-campaign-content'
const flagKey = (zoneId) => `weather.zones.${zoneId}`

export const WeatherStateService = {
  getState(zoneId)           // → state | null
  async setState(zoneId, state)
}
```

État par zone (`game.world.setFlag`) :
```js
{ zoneId, biomeId, season, regime, sky, precipitation, wind, temperature, regimeAge, history }
```

### ZoneWeatherService

```js
const zoneKey = (zoneId) => `weather.zone-config.${zoneId}`

export const ZoneWeatherService = {
  getZoneConfig(zoneId)                   // → config | null
  async setZoneConfig(zoneId, config)
  resolveWeatherState(zoneId)             // → state | null (gère disabled / inheritOutside)
}
```

Config de zone :
```js
{
  id, name, biome, season,
  weather,      // 'active' | 'disabled' | 'inheritOutside'
  parentZoneId  // requis si weather === 'inheritOutside'
}
```

`resolveWeatherState` : `disabled` → `null` ; `inheritOutside` → état de `parentZoneId` ; `active` → état de la zone.

---

## 5. Fichiers créés

| Fichier | Statut |
|---|---|
| `scripts/weather/services/WeatherStateService.mjs` | Créé |
| `scripts/weather/services/ZoneWeatherService.mjs` | Créé |
| `scripts/weather/services/WeatherStateService.test.mjs` | Créé |
| `scripts/weather/services/ZoneWeatherService.test.mjs` | Créé |

---

## 6. Tests

Runner : `node --test` (11 tests, pass 11/11)

| # | Critère |
|---|---|
| 1 | `setState` appelle `setFlag` avec clé `weather.zones.{zoneId}` |
| 2 | `getState` retourne l'état après `setState` |
| 3 | `getState` zone inconnue → `null` |
| 4 | Isolation par `zoneId` |
| 5 | `setZoneConfig` / `getZoneConfig` round-trip |
| 6 | `getZoneConfig` zone inexistante → `null` |
| 7 | Zone `disabled` → `resolveWeatherState` retourne `null` |
| 8 | Zone `active` → état de la zone |
| 9 | Zone `inheritOutside` → état de `parentZoneId` |
| 10 | Zone `inheritOutside` sans `parentZoneId` → `null` + warn |
| 11 | Zone sans config → `null` |

---

## 7. Validation manuelle

URL : http://localhost:31000/game

```js
// Configurer une zone
await ZoneWeatherService.setZoneConfig('durotar', {
  id: 'durotar', name: 'Durotar', biome: 'arid', season: 'summer', weather: 'active'
})

// Persister un état météo
await WeatherStateService.setState('durotar', {
  zoneId: 'durotar', biomeId: 'arid', season: 'summer',
  regime: 2, sky: 'overcast', precipitation: 'moderate', wind: 'moderate',
  temperature: 'hot', regimeAge: 1, history: []
})

// Recharger Foundry (F5), puis vérifier :
WeatherStateService.getState('durotar') // → état ci-dessus
```

---

## 8. Critères d'arrêt

- `node --test` passe sans erreur
- Aucun accès direct à `game.world.data` — uniquement `setFlag`/`getFlag`
- `WeatherStateService` et `ZoneWeatherService` exportés et utilisables depuis la console Foundry
- Validation manuelle de persistance post-rechargement confirmée

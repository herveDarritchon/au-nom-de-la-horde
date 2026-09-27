# Plan d'implémentation — feat(weather): interface MJ — dialogue météo Foundry v14

**Issue** : [#78 — feat(weather): interface MJ — dialogue météo Foundry v14](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/78)
**Dépendances** : #77 — persistance et configuration des zones météo — terminée

---

## 1. Objectif

Créer l'interface MJ du générateur de météo : un dialogue Foundry v14 (`ApplicationV2`) affichant l'état météo courant de la zone active, avec un bouton "Jour suivant" pour avancer la météo sans recalcul implicite. Exposer ce dialogue via un bouton dans les scene controls (GM uniquement).

---

## 2. Périmètre

### Inclus

- `scripts/weather/ui/WeatherDialog.mjs` — classe `ApplicationV2`
- `scripts/weather/ui/weather-dialog.hbs` — template Handlebars
- `scripts/weather/index.mjs` — point d'entrée : enregistre le bouton scene controls (GM uniquement)
- `module.json` — ajout de `scripts/weather/index.mjs` dans `esmodules` et `"scripts/weather"` dans `flags.hotReload.paths`

### Hors périmètre

- Paramétrage de zone via l'UI (issue distincte)
- Hook de temps automatique
- Historique météo visible dans le dialogue
- Toute autre issue du générateur météo

---

## 3. État existant

- `scripts/weather/services/WeatherStateService.mjs` — `getState(zoneId)`, `setState(zoneId, state)` via `game.world.setFlag`
- `scripts/weather/services/ZoneWeatherService.mjs` — `getZoneConfig(zoneId)`, `resolveWeatherState(zoneId)`
- `src/weather/engine/WeatherEngine.mjs` — `next({ biome, season, previousWeather, history, random })` → `{ regime, sky, precipitation, wind, temperature, regimeAge }`
- `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` — pattern `ApplicationV2` existant (référence pour les conventions)
- `module.json` — `esmodules` liste `scripts/warbound.mjs` + importers ; `hotReload.paths` inclut `'scripts'` (les sous-dossiers sont couverts)

---

## 4. Décisions d'architecture

### 4.1 Classe de base : `ApplicationV2`

Utiliser `foundry.applications.api.ApplicationV2` conformément au pattern établi dans `WarboundMarkdownImporterApp.mjs` et aux exigences Foundry v14.

### 4.2 Zone active

En l'absence de sélection de zone dans l'UI, utiliser une zone par défaut configurée (ex. : `'durotar'` pour le développement) ou la première zone disponible via `ZoneWeatherService`. Une constante `DEFAULT_ZONE_ID` dans `index.mjs` suffit pour cette itération.

### 4.3 Avancement météo ("Jour suivant")

Le bouton appelle :
1. `ZoneWeatherService.getZoneConfig(zoneId)` → obtenir `biome`, `season`
2. `WeatherStateService.getState(zoneId)` → obtenir `previousWeather` et `history`
3. `WeatherEngine.next({ biome, season, previousWeather, history })` → nouvel état
4. `WeatherStateService.setState(zoneId, newState)` → persister
5. `this.render()` → rafraîchir le dialogue

### 4.4 Pas de recalcul à l'ouverture

`_prepareContext()` appelle uniquement `WeatherStateService.getState(zoneId)` — lecture pure, jamais `WeatherEngine.next()`.

### 4.5 `hotReload.paths`

`'scripts'` est déjà présent dans `flags.hotReload.paths` et couvre `scripts/weather/**`. Aucune modification de `module.json` sur ce point. Seul l'ajout de `scripts/weather/index.mjs` dans `esmodules` est nécessaire.

### 4.6 Scene controls (GM uniquement)

Utiliser le hook `getSceneControlButtons` pour injecter le bouton dans le groupe `token` (ou créer un groupe `weather` si le projet évolue). Condition `game.user.isGM` obligatoire.

---

## 5. Plan de travail

| Étape | Fichier | Action |
|---|---|---|
| 1 | `scripts/weather/ui/WeatherDialog.mjs` | Créer classe `WeatherDialog extends ApplicationV2` |
| 2 | `scripts/weather/ui/weather-dialog.hbs` | Créer template Handlebars |
| 3 | `scripts/weather/index.mjs` | Créer point d'entrée + hook `getSceneControlButtons` |
| 4 | `module.json` | Ajouter `"scripts/weather/index.mjs"` dans `esmodules` |

---

## 6. Fichiers modifiés / créés

| Fichier | Statut |
|---|---|
| `scripts/weather/ui/WeatherDialog.mjs` | Créé |
| `scripts/weather/ui/weather-dialog.hbs` | Créé |
| `scripts/weather/index.mjs` | Créé |
| `module.json` | Modifié — `esmodules` |

---

## 7. Structure de `WeatherDialog`

```js
// scripts/weather/ui/WeatherDialog.mjs
import { WeatherStateService } from '../services/WeatherStateService.mjs'
import { ZoneWeatherService }  from '../services/ZoneWeatherService.mjs'
import { WeatherEngine }       from '../../../src/weather/engine/WeatherEngine.mjs'

export class WeatherDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'weather-dialog',
    classes: ['warbound', 'weather-dialog'],
    window: { title: 'Météo', icon: 'fa-solid fa-cloud-sun', resizable: false },
    position: { width: 400, height: 'auto' },
    actions: { nextDay: WeatherDialog.#onNextDay },
  }

  static PARTS = {
    form: { template: 'modules/warbound-campaign-content/scripts/weather/ui/weather-dialog.hbs' },
  }

  #zoneId

  constructor(zoneId, options = {}) {
    super(options)
    this.#zoneId = zoneId
  }

  async _prepareContext() {
    const state = WeatherStateService.getState(this.#zoneId)
    return { state, zoneId: this.#zoneId }
  }

  static async #onNextDay() {
    const config = ZoneWeatherService.getZoneConfig(this.#zoneId)
    if (!config) return
    const previous = WeatherStateService.getState(this.#zoneId)
    const next = WeatherEngine.next({
      biome: config.biome,
      season: config.season,
      previousWeather: previous,
      history: previous?.history ?? [],
    })
    await WeatherStateService.setState(this.#zoneId, { ...next, zoneId: this.#zoneId, history: [...(previous?.history ?? []), previous].filter(Boolean) })
    this.render()
  }
}
```

---

## 8. Tests attendus

Pas de tests unitaires automatisés pour `WeatherDialog` (classe Foundry, coût/bénéfice défavorable). Validation manuelle requise sur http://localhost:31000/game.

Tests unitaires existants (`WeatherStateService.test.mjs`, `ZoneWeatherService.test.mjs`) couvrent la couche service — pas de régression attendue.

---

## 9. Validation manuelle

URL : http://localhost:31000/game

1. Charger le module — vérifier l'absence d'erreur console
2. Connecter en GM — vérifier présence du bouton "Météo" dans les scene controls
3. Cliquer le bouton — vérifier ouverture du dialogue avec l'état courant (pas de recalcul)
4. Cliquer "Jour suivant" — vérifier mise à jour de l'affichage
5. Fermer et rouvrir → même état affiché
6. Connecter en joueur → bouton absent
7. Changer de scène dans la même zone → météo inchangée

---

## 10. Critères d'arrêt

- Bouton "Météo" visible uniquement pour le GM dans les scene controls
- Ouverture du dialogue → lecture seule de l'état, sans appel à `WeatherEngine.next()`
- "Jour suivant" génère une nouvelle météo, persiste via `WeatherStateService`, rafraîchit le dialogue
- Fermer/rouvrir → état inchangé
- Aucune erreur console au chargement du module
- Validation manuelle confirmée sur http://localhost:31000/game
# Plan d'implémentation — feat(weather): catalogue d'événements météo contextuels

**Issue** : [#80 — feat(weather): catalogue d'événements météo contextuels](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/80)
**Dépendances** : #76 (moteur météo), #78 (interface MJ dialogue) — terminées

---

## 1. Objectif

Ajouter une couche "événements" au générateur de météo : suggestions de mise en scène au MJ, jamais des effets automatiques. Un événement est sélectionné (ou non) après chaque génération météo selon le biome, les conditions courantes et l'historique.

---

## 2. Périmètre

### Inclus

- `src/weather/data/weather-events.mjs` — catalogue ≥10 événements (données pures)
- `src/weather/engine/WeatherEventSelector.mjs` — logique de sélection (pure, testable)
- `src/weather/engine/WeatherEngine.mjs` — étendre `next()` pour retourner `event`
- `scripts/weather/ui/WeatherDialog.mjs` — section "ÉVÉNEMENT POSSIBLE" + bouton "Ignorer"
- `scripts/weather/ui/weather-dialog.hbs` — bloc conditionnel événement

### Hors périmètre

- Effets mécaniques automatiques (malus, jets de dés)
- Persistance de l'état "ignoré" au-delà de la session dialogue
- Ajout d'événements au-delà des 10 requis

---

## 3. État existant

- `src/weather/engine/WeatherEngine.mjs` — `next()` retourne `{ regime, sky, precipitation, wind, temperature, regimeAge }` (pas de champ `event`)
- `scripts/weather/ui/WeatherDialog.mjs` — `ApplicationV2`, actions `nextDay`, `publishToChat`, `overrideWeather`
- `scripts/weather/ui/weather-dialog.hbs` — template sans bloc événement

---

## 4. Décisions d'architecture

### 4.1 Schéma d'un événement

```js
{
  id: 'dust-devil',
  biomes: ['arid', 'semiArid'],
  requires: {
    precipitation: 'none',          // valeur exacte (optionnel)
    windMin: 'light',               // vent ≥ ce niveau (optionnel)
    temperatureMin: 'hot',          // température ≥ ce niveau chaleur (optionnel)
    historyPattern: {               // sur l'historique (optionnel)
      precipitation: ['moderate', 'heavy'],
      minDays: 3,
    },
  },
  text: 'Un tourbillon de poussière…',
}
```

### 4.2 Ordres de comparaison

- **Vent** : `calm < light < moderate < strong < violent`
- **Température** : `hot > warm > mild > cold > freezing` (`temperatureMin: 'hot'` → uniquement `hot`)

### 4.3 Intégration moteur

`WeatherEngine.next()` appelle `WeatherEventSelector.select()` après calcul du régime et retourne `{ ...state, event }`. `event = null` si aucun ne correspond. Non persisté dans `WeatherStateService`.

### 4.4 Bouton "Ignorer"

Géré par `this.#eventIgnored` (booléen d'instance), remis à `false` à chaque `nextDay`/`overrideWeather`.

---

## 5. Plan de travail

| Étape | Fichier | Action |
|---|---|---|
| 1 | `src/weather/data/weather-events.mjs` | Créer catalogue 10 événements |
| 2 | `src/weather/engine/WeatherEventSelector.mjs` | Créer module pur de sélection |
| 3 | `src/weather/engine/WeatherEventSelector.test.mjs` | Tests unitaires node:test |
| 4 | `src/weather/engine/WeatherEngine.mjs` | Import + appel `select()` + champ `event` |
| 5 | `scripts/weather/ui/WeatherDialog.mjs` | `#eventIgnored`, `#lastEvent`, action `ignoreEvent`, contexte étendu |
| 6 | `scripts/weather/ui/weather-dialog.hbs` | Bloc conditionnel événement + bouton "Ignorer" |

---

## 6. Fichiers modifiés / créés

| Fichier | Statut |
|---|---|
| `src/weather/data/weather-events.mjs` | Créé |
| `src/weather/engine/WeatherEventSelector.mjs` | Créé |
| `src/weather/engine/WeatherEventSelector.test.mjs` | Créé |
| `src/weather/engine/WeatherEngine.mjs` | Modifié |
| `scripts/weather/ui/WeatherDialog.mjs` | Modifié |
| `scripts/weather/ui/weather-dialog.hbs` | Modifié |

---

## 7. Tests attendus

- `dust-devil` en biome arid, sans pluie, vent ≥ light, temp = hot ✓
- `dust-devil` absent en biome temperate ✓
- `swollen-river`/`muddy-trail` après 3 jours pluie ✓
- `muddy-trail` impossible après 3 jours secs ✓
- `null` si aucune correspondance ✓
- déterminisme ✓

---

## 8. Critères d'arrêt

- [ ] ≥10 événements dans le catalogue
- [ ] `dust-devil` filtré : biome arid/semiArid, sans pluie, vent ≥ light, temp = hot
- [ ] 3 jours de pluie → swollen-river/muddy-trail éligibles
- [ ] 3 jours secs → muddy-trail non éligible
- [ ] Dialogue affiche "ÉVÉNEMENT POSSIBLE" + bouton "Ignorer"
- [ ] Bouton "Ignorer" masque la section (session uniquement)
- [ ] Aucun effet mécanique automatique
- [ ] `pnpm test` vert
- [ ] Validation manuelle sur http://localhost:31000/game

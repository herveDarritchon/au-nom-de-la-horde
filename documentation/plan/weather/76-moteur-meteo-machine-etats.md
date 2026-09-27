# Plan d'implémentation — feat(weather): moteur météo — machine à états et contraintes de cohérence

**Issue** : [#76 — feat(weather): moteur météo — machine à états et contraintes de cohérence](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/76)
**Dépendances** : #75 — données météo (biomes, saisons) — terminée

---

## 1. Objectif

Implémenter le moteur météo pur JS dans `src/weather/engine/` : machine à états de régime (transitions probabilistes + inertie) et validateur de cohérence. Point d'entrée public :

```js
WeatherEngine.next({ biome, season, previousWeather, history, random }) → Weather
```

`Weather` = `{ regime, sky, precipitation, wind, temperature, regimeAge }`.

---

## 2. Périmètre

### Inclus

- `src/weather/engine/WeatherTransition.mjs` — transitions de régime (60 % continuité / 30 % ±1 / 10 % ±2) avec inertie (plus un régime dure, plus il évolue)
- `src/weather/engine/WeatherConstraints.mjs` — contraintes absolues : neige+chaud impossible, forte pluie+ciel clair impossible
- `src/weather/engine/WeatherEngine.mjs` — orchestrateur public
- `src/weather/engine/WeatherEngine.test.mjs` — tests d'acceptation (§19 du cadrage)

### Hors périmètre

- Rendu MJ / UI Foundry
- Persistance / flags Foundry
- Génération des descripteurs textuels (sky, precipitation, wind, temperature)
- Toute autre issue du générateur météo

---

## 3. État existant

- `src/weather/data/biomes.mjs` — 10 biomes avec profils régime × saison (`BIOMES`)
- `src/weather/data/seasons.mjs` — 4 saisons
- `src/weather/engine/` — n'existe pas encore

---

## 4. Architecture

### Signature publique

```js
// WeatherEngine.mjs
export const WeatherEngine = {
  next({ biome, season, previousWeather, history, random }) {
    // 1. Calculer les poids de transition (WeatherTransition)
    // 2. Appliquer les contraintes (WeatherConstraints)
    // 3. Sélectionner le régime final avec random
    // 4. Retourner le Weather
  }
}
```

### WeatherTransition — logique de pondération

Entrée : `{ biome, season, previousWeather, history }`  
Sortie : tableau de poids `[p0, p1, p2, p3, p4]`

Algorithme :
1. Base = `BIOMES[biome][season].transitions`
2. Appliquer la distribution de transition depuis `previousWeather.regime` :
   - +60 % sur le régime courant (continuité)
   - +30 % sur ±1 (glissement proche)
   - +10 % sur ±2 (saut)
   - Normaliser à 1.0
3. Inertie : si `previousWeather.regimeAge >= 3`, multiplier par `1 + 0.1 * (regimeAge - 2)` les poids des régimes ≠ courant, puis renormaliser

### WeatherConstraints — contraintes absolues

Entrée : `{ weights, dominantTemp }`  
Sortie : `weights` filtré (poids à 0 pour régimes impossibles)

Règles :
- `dominantTemp === 'hot'` → régime 4 (`severe`, neige) impossible → `weights[4] = 0`
- `dominantTemp === 'glacial'` → régime 1 (`variable`, pluie liquide) réduit fortement ou à 0
- Cohérence interne du `Weather` final : `sky === 'clear' && precipitation === 'heavy'` impossible

### Structure Weather

```js
{
  regime,        // 0–4
  sky,           // dérivé du régime (placeholder null pour l'instant)
  precipitation, // dérivé du régime
  wind,          // dérivé du régime
  temperature,   // dérivé de dominantTemp
  regimeAge      // incrémenté si même régime que previousWeather, sinon 1
}
```

### Injection du hasard

`random` est une fonction `() => Float[0,1)`. Si absent, utilise `Math.random`. Permet tests déterministes.

---

## 5. Fichiers à créer

| Fichier | Action |
|---|---|
| `src/weather/engine/WeatherTransition.mjs` | Créé |
| `src/weather/engine/WeatherConstraints.mjs` | Créé |
| `src/weather/engine/WeatherEngine.mjs` | Créé |
| `src/weather/engine/WeatherEngine.test.mjs` | Créé |

---

## 6. Tests (`WeatherEngine.test.mjs`)

Runner : `pnpm test` (Vitest)

| # | Critère d'acceptation |
|---|---|
| 1 | `semiArid + summer` → 0 régime sévère (neige) sur 1 000 générations consécutives |
| 2 | `glacial + winter` → pluie liquide exceptionnelle (p < 5 %) ou impossible |
| 3 | Régime 4 en J-1 → P(régime 2 ou 3 en J) > P(régime 0) sur 1 000 tirages |
| 4 | 3 jours régime identique → P(changement) > P(changement sans inertie) |
| 5 | `sky 'clear' + precipitation 'heavy'` → impossible (contrainte cohérence) |
| 6 | `dominantTemp 'hot'` → régime 4 impossible |
| 7 | `random` fixé (seed) → résultat identique sur 2 appels |
| 8 | `pnpm test` passe sans erreur |

---

## 7. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Tous les poids à 0 après contraintes | Fallback : retourner le régime le plus probable avant filtre |
| `regimeAge` absent de `previousWeather` | Défaut à 1 si `undefined` |
| Descripteurs `sky/precipitation/wind` non définis dans cette issue | Retourner `null` — ne pas bloquer l'implémentation |

---

## 9. Critères d'arrêt

- `pnpm test` passe sans erreur
- Les 8 critères d'acceptation couverts par les tests
- Aucune dépendance Foundry dans `src/weather/engine/`
- `WeatherEngine.next()` produit un `Weather` avec `regimeAge` cohérent

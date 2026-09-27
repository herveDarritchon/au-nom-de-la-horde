# Plan d'implémentation — feat(weather): données météo — biomes, saisons et profils

**Issue** : [#75 — feat(weather): données météo — biomes, saisons et profils](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/75)
**Dépendances** : aucune — peut démarrer immédiatement

---

## 1. Objectif

Créer la couche de données météo pure (zéro dépendance Foundry) dans `src/weather/data/` : 10 biomes avec profils de probabilités de régime par saison, 4 saisons, et les tests d'intégrité associés.

Ces données sont le socle de toutes les issues suivantes du générateur de météo (machine à états, rendu MJ).

---

## 2. Périmètre

### Inclus

- `src/weather/data/biomes.mjs` — 10 biomes avec profils régime × saison
- `src/weather/data/seasons.mjs` — 4 saisons (`spring`, `summer`, `autumn`, `winter`)
- `src/weather/data/biomes.test.mjs` — tests d'intégrité des profils
- Création du dossier `src/weather/data/`

### Hors périmètre

- Moteur de transition (machine à états)
- Rendu MJ / UI Foundry
- Persistance / flags Foundry
- Toute autre issue du générateur météo

---

## 3. État existant

`src/weather/` n'existait pas. Nouveau domaine créé.

---

## 4. Architecture

### Régimes météo (5 niveaux, cadrage §3)

| Niveau | Identifiant | Description |
|---:|---|---|
| 0 | `clear` | Clair |
| 1 | `variable` | Variable |
| 2 | `overcast` | Couvert |
| 3 | `disturbed` | Perturbé |
| 4 | `severe` | Sévère |

### Structure d'un profil biome × saison

```js
{ transitions: [p0, p1, p2, p3, p4], dominantTemp: 'hot' }
// somme(transitions) ≈ 1.0 (tolérance ±0.001)
```

### Les 10 biomes

`arid`, `semiArid`, `temperatePlain`, `temperateForest`, `humidForest`, `wetland`, `coastal`, `mountain`, `tundra`, `glacial`

---

## 5. Fichiers créés

| Fichier | Action |
|---|---|
| `src/weather/data/seasons.mjs` | Créé |
| `src/weather/data/biomes.mjs` | Créé |
| `src/weather/data/biomes.test.mjs` | Créé |

---

## 6. Tests (`biomes.test.mjs`)

Runner : `node --test`

- 10 biomes définis
- Chaque biome × saison : `transitions` longueur 5, somme ≈ 1.0, `dominantTemp` défini
- `semiArid×summer` : `transitions[4]` === 0
- `arid` toutes saisons : `transitions[0]` ≥ 0.60
- `glacial×winter` : `dominantTemp === 'glacial'` et `transitions[4]` ≥ 0.30
- `wetland` vs `arid` : `transitions[2]` (couvert) strictement supérieur toutes saisons

---

## 9. Critères d'arrêt

- `pnpm test` passe sans erreur
- Les 7 critères d'acceptation de l'issue couverts par les tests
- Aucune dépendance Foundry dans `src/weather/data/`

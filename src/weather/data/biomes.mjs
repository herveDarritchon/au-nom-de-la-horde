/**
 * Régimes météo internes (cadrage §3) :
 *   0 = clear (Clair)
 *   1 = variable (Variable)
 *   2 = overcast (Couvert) — sert aussi de proxy brouillard jusqu'à l'ajout d'un niveau dédié
 *   3 = disturbed (Perturbé)
 *   4 = severe (Sévère : orage, neige forte, tempête)
 *
 * Chaque profil biome×saison :
 *   transitions[i] = poids de probabilité initiale du régime i (somme ≈ 1.0)
 *   dominantTemp    = contrainte de température dominante
 */
export const BIOMES = {
  arid: {
    spring:  { transitions: [0.60, 0.25, 0.09, 0.05, 0.01], dominantTemp: 'hot' },
    summer:  { transitions: [0.75, 0.15, 0.06, 0.03, 0.01], dominantTemp: 'hot' },
    autumn:  { transitions: [0.65, 0.22, 0.08, 0.04, 0.01], dominantTemp: 'warm' },
    winter:  { transitions: [0.60, 0.25, 0.09, 0.05, 0.01], dominantTemp: 'mild' },
  },

  semiArid: {
    spring:  { transitions: [0.45, 0.30, 0.15, 0.08, 0.02], dominantTemp: 'warm' },
    summer:  { transitions: [0.55, 0.28, 0.12, 0.05, 0.00], dominantTemp: 'hot' },
    autumn:  { transitions: [0.40, 0.32, 0.18, 0.08, 0.02], dominantTemp: 'mild' },
    winter:  { transitions: [0.35, 0.30, 0.20, 0.10, 0.05], dominantTemp: 'cold' },
  },

  temperatePlain: {
    spring:  { transitions: [0.30, 0.30, 0.20, 0.15, 0.05], dominantTemp: 'mild' },
    summer:  { transitions: [0.40, 0.30, 0.18, 0.09, 0.03], dominantTemp: 'warm' },
    autumn:  { transitions: [0.25, 0.28, 0.25, 0.15, 0.07], dominantTemp: 'mild' },
    winter:  { transitions: [0.20, 0.25, 0.25, 0.18, 0.12], dominantTemp: 'cold' },
  },

  temperateForest: {
    spring:  { transitions: [0.25, 0.28, 0.25, 0.15, 0.07], dominantTemp: 'mild' },
    summer:  { transitions: [0.35, 0.30, 0.20, 0.10, 0.05], dominantTemp: 'warm' },
    autumn:  { transitions: [0.20, 0.25, 0.28, 0.18, 0.09], dominantTemp: 'mild' },
    winter:  { transitions: [0.15, 0.22, 0.28, 0.22, 0.13], dominantTemp: 'cold' },
  },

  humidForest: {
    spring:  { transitions: [0.15, 0.25, 0.30, 0.20, 0.10], dominantTemp: 'warm' },
    summer:  { transitions: [0.20, 0.28, 0.28, 0.16, 0.08], dominantTemp: 'hot' },
    autumn:  { transitions: [0.12, 0.22, 0.30, 0.24, 0.12], dominantTemp: 'mild' },
    winter:  { transitions: [0.10, 0.20, 0.30, 0.25, 0.15], dominantTemp: 'cold' },
  },

  wetland: {
    spring:  { transitions: [0.15, 0.22, 0.35, 0.20, 0.08], dominantTemp: 'mild' },
    summer:  { transitions: [0.20, 0.25, 0.33, 0.16, 0.06], dominantTemp: 'warm' },
    autumn:  { transitions: [0.10, 0.20, 0.38, 0.22, 0.10], dominantTemp: 'mild' },
    winter:  { transitions: [0.08, 0.18, 0.36, 0.25, 0.13], dominantTemp: 'cold' },
  },

  coastal: {
    spring:  { transitions: [0.30, 0.28, 0.22, 0.14, 0.06], dominantTemp: 'mild' },
    summer:  { transitions: [0.40, 0.30, 0.18, 0.09, 0.03], dominantTemp: 'warm' },
    autumn:  { transitions: [0.25, 0.27, 0.25, 0.16, 0.07], dominantTemp: 'mild' },
    winter:  { transitions: [0.20, 0.25, 0.27, 0.18, 0.10], dominantTemp: 'cold' },
  },

  mountain: {
    spring:  { transitions: [0.25, 0.25, 0.22, 0.18, 0.10], dominantTemp: 'cold' },
    summer:  { transitions: [0.35, 0.28, 0.20, 0.12, 0.05], dominantTemp: 'mild' },
    autumn:  { transitions: [0.20, 0.22, 0.25, 0.20, 0.13], dominantTemp: 'cold' },
    winter:  { transitions: [0.15, 0.18, 0.22, 0.25, 0.20], dominantTemp: 'freezing' },
  },

  tundra: {
    spring:  { transitions: [0.20, 0.25, 0.28, 0.18, 0.09], dominantTemp: 'freezing' },
    summer:  { transitions: [0.30, 0.30, 0.22, 0.13, 0.05], dominantTemp: 'cold' },
    autumn:  { transitions: [0.15, 0.22, 0.28, 0.22, 0.13], dominantTemp: 'freezing' },
    winter:  { transitions: [0.10, 0.18, 0.25, 0.27, 0.20], dominantTemp: 'glacial' },
  },

  glacial: {
    spring:  { transitions: [0.15, 0.22, 0.28, 0.22, 0.13], dominantTemp: 'freezing' },
    summer:  { transitions: [0.25, 0.28, 0.25, 0.15, 0.07], dominantTemp: 'cold' },
    autumn:  { transitions: [0.10, 0.18, 0.27, 0.25, 0.20], dominantTemp: 'freezing' },
    winter:  { transitions: [0.05, 0.12, 0.23, 0.30, 0.30], dominantTemp: 'glacial' },
  },
}

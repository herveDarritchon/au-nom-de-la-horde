import { BIOMES } from '../data/biomes.mjs'

export function computeTransitionWeights({ biome, season, previousWeather }) {
  const base = BIOMES[biome][season].transitions

  if (previousWeather?.regime == null) return base.slice()

  const prev = previousWeather.regime
  const regimeAge = previousWeather.regimeAge ?? 1

  const weights = base.slice()
  weights[prev] += 0.60
  if (prev - 1 >= 0) weights[prev - 1] += 0.30
  if (prev + 1 <= 4) weights[prev + 1] += 0.30
  if (prev - 2 >= 0) weights[prev - 2] += 0.10
  if (prev + 2 <= 4) weights[prev + 2] += 0.10

  if (regimeAge >= 3) {
    const factor = 1 + 0.1 * (regimeAge - 2)
    for (let i = 0; i < 5; i++) {
      if (i !== prev) weights[i] *= factor
    }
  }

  return normalize(weights)
}

function normalize(weights) {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum === 0) return [0.2, 0.2, 0.2, 0.2, 0.2]
  return weights.map(w => w / sum)
}

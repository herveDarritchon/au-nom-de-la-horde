import { BIOMES } from '../data/biomes.mjs'
import { computeTransitionWeights } from './WeatherTransition.mjs'
import { applyConstraints } from './WeatherConstraints.mjs'

const REGIME_DESCRIPTORS = [
  { sky: 'clear',          precipitation: 'none',     wind: 'calm'     },
  { sky: 'partly-cloudy',  precipitation: 'light',    wind: 'light'    },
  { sky: 'overcast',       precipitation: 'moderate', wind: 'moderate' },
  { sky: 'cloudy',         precipitation: 'heavy',    wind: 'strong'   },
  { sky: 'stormy',         precipitation: 'heavy',    wind: 'violent'  },
]

export const WeatherEngine = {
  next({ biome, season, previousWeather = null, history = [], random = Math.random }) {
    const profile = BIOMES[biome][season]

    let weights = computeTransitionWeights({ biome, season, previousWeather })
    weights = applyConstraints({ weights, dominantTemp: profile.dominantTemp })

    const regime = pickRegime(weights, random)
    const desc = REGIME_DESCRIPTORS[regime]
    const prevAge = previousWeather?.regime === regime ? (previousWeather.regimeAge ?? 1) : 0

    return {
      regime,
      sky: desc.sky,
      precipitation: desc.precipitation,
      wind: desc.wind,
      temperature: profile.dominantTemp,
      regimeAge: prevAge + 1,
    }
  },
}

function pickRegime(weights, random) {
  const r = random()
  let cumulative = 0
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i]
    if (r < cumulative) return i
  }
  return weights.length - 1
}

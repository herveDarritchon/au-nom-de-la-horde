import { WEATHER_EVENTS } from '../data/weather-events.mjs'

const WIND_ORDER = ['calm', 'light', 'moderate', 'strong', 'violent']
const TEMP_ORDER = ['hot', 'warm', 'mild', 'cold', 'freezing']

export const WeatherEventSelector = {
  select({ biome, weather, history = [], random = Math.random }) {
    let candidates = WEATHER_EVENTS.filter(e => e.biomes.includes(biome))
    candidates = candidates.filter(e => matchesWeather(e.requires, weather))
    candidates = candidates.filter(e => matchesHistory(e.requires, history))
    if (candidates.length === 0) return null
    return pickWeighted(candidates, random)
  },
}

function pickWeighted(candidates, random) {
  const total = candidates.reduce((sum, e) => sum + (e.weight ?? 1), 0)
  let r = random() * total
  for (const e of candidates) {
    r -= (e.weight ?? 1)
    if (r <= 0) return e
  }
  return candidates[candidates.length - 1]
}

function matchesWeather(requires, weather) {
  if (requires.precipitation !== undefined && requires.precipitation !== weather.precipitation) return false
  if (requires.windMin !== undefined) {
    if (WIND_ORDER.indexOf(weather.wind) < WIND_ORDER.indexOf(requires.windMin)) return false
  }
  if (requires.windMax !== undefined) {
    if (WIND_ORDER.indexOf(weather.wind) > WIND_ORDER.indexOf(requires.windMax)) return false
  }
  if (requires.temperatureMin !== undefined) {
    // TEMP_ORDER index 0 = hottest; higher index = colder
    if (TEMP_ORDER.indexOf(weather.temperature) > TEMP_ORDER.indexOf(requires.temperatureMin)) return false
  }
  return true
}

function matchesHistory(requires, history) {
  if (!requires.historyPattern) return true
  const { precipitation, minDays } = requires.historyPattern
  if (history.length < minDays) return false
  return history.slice(-minDays).every(h => precipitation.includes(h.precipitation))
}

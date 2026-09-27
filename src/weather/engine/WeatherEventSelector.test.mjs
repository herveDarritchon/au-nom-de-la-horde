import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { WeatherEventSelector } from './WeatherEventSelector.mjs'

const ARID_HOT_CLEAR = { precipitation: 'none', wind: 'light', temperature: 'hot', sky: 'clear', regime: 0 }
const ARID_HOT_WINDY = { precipitation: 'none', wind: 'strong', temperature: 'hot', sky: 'clear', regime: 0 }
const TEMPERATE_RAIN  = { precipitation: 'heavy', wind: 'moderate', temperature: 'mild', sky: 'overcast', regime: 3 }
const TEMPERATE_DRY   = { precipitation: 'none',  wind: 'calm',     temperature: 'mild', sky: 'clear',   regime: 0 }

function rainyHistory(n) {
  return Array.from({ length: n }, () => ({ precipitation: 'heavy', wind: 'moderate', temperature: 'mild' }))
}

function dryHistory(n) {
  return Array.from({ length: n }, () => ({ precipitation: 'none', wind: 'calm', temperature: 'hot' }))
}

describe('WeatherEventSelector — dust-devil', () => {
  test('apparaît en arid, sans pluie, vent ≥ light, temp = hot', () => {
    const result = WeatherEventSelector.select({ biome: 'arid', weather: ARID_HOT_CLEAR, history: [], random: () => 0 })
    assert.ok(result !== null)
    assert.equal(result.id, 'dust-devil')
  })

  test('absent en biome temperate', () => {
    for (let i = 0; i < 100; i++) {
      const r = WeatherEventSelector.select({ biome: 'temperatePlain', weather: ARID_HOT_CLEAR, history: [], random: Math.random })
      assert.ok(r === null || r.id !== 'dust-devil')
    }
  })

  test('absent si précipitations présentes', () => {
    const rain = { ...ARID_HOT_CLEAR, precipitation: 'moderate' }
    for (let i = 0; i < 50; i++) {
      const r = WeatherEventSelector.select({ biome: 'arid', weather: rain, history: [], random: Math.random })
      assert.ok(r === null || r.id !== 'dust-devil')
    }
  })

  test('absent si vent < light (calm)', () => {
    const calm = { ...ARID_HOT_CLEAR, wind: 'calm' }
    for (let i = 0; i < 50; i++) {
      const r = WeatherEventSelector.select({ biome: 'arid', weather: calm, history: [], random: Math.random })
      assert.ok(r === null || r.id !== 'dust-devil')
    }
  })

  test('absent si température < hot (warm)', () => {
    const warm = { ...ARID_HOT_CLEAR, temperature: 'warm' }
    for (let i = 0; i < 50; i++) {
      const r = WeatherEventSelector.select({ biome: 'arid', weather: warm, history: [], random: Math.random })
      assert.ok(r === null || r.id !== 'dust-devil')
    }
  })
})

describe('WeatherEventSelector — swollen-river et muddy-trail', () => {
  test('swollen-river éligible après 3 jours de pluie', () => {
    const history = rainyHistory(3)
    const found = findById('swollen-river', 'temperatePlain', TEMPERATE_RAIN, history)
    assert.ok(found, 'swollen-river doit être éligible avec 3 jours de pluie')
  })

  test('muddy-trail éligible après 3 jours de pluie', () => {
    const history = rainyHistory(3)
    const found = findById('muddy-trail', 'temperatePlain', TEMPERATE_DRY, history)
    assert.ok(found, 'muddy-trail doit être éligible avec 3 jours de pluie')
  })

  test('muddy-trail impossible après 3 jours secs', () => {
    const history = dryHistory(3)
    for (let i = 0; i < 100; i++) {
      const r = WeatherEventSelector.select({ biome: 'temperatePlain', weather: TEMPERATE_DRY, history, random: Math.random })
      assert.ok(r === null || r.id !== 'muddy-trail')
    }
  })

  test('swollen-river absent si historique < 3 jours', () => {
    const history = rainyHistory(2)
    for (let i = 0; i < 100; i++) {
      const r = WeatherEventSelector.select({ biome: 'temperatePlain', weather: TEMPERATE_RAIN, history, random: Math.random })
      assert.ok(r === null || r.id !== 'swollen-river')
    }
  })
})

describe('WeatherEventSelector — cas généraux', () => {
  test('retourne null si aucun événement ne correspond', () => {
    // glacial + calm + freezing + no rain + no history → snowdrift needs windMin:moderate
    const weather = { precipitation: 'none', wind: 'calm', temperature: 'freezing', sky: 'clear', regime: 0 }
    const result = WeatherEventSelector.select({ biome: 'glacial', weather, history: [], random: Math.random })
    assert.equal(result, null)
  })

  test('pickRandom ne retourne jamais undefined sur liste non vide', () => {
    for (let i = 0; i < 200; i++) {
      const r = WeatherEventSelector.select({ biome: 'arid', weather: ARID_HOT_WINDY, history: [], random: Math.random })
      if (r !== null) assert.notEqual(r, undefined)
    }
  })

  test('déterminisme : même random seed → même résultat', () => {
    const r1 = WeatherEventSelector.select({ biome: 'arid', weather: ARID_HOT_CLEAR, history: [], random: () => 0 })
    const r2 = WeatherEventSelector.select({ biome: 'arid', weather: ARID_HOT_CLEAR, history: [], random: () => 0 })
    assert.deepEqual(r1, r2)
  })
})

function findById(id, biome, weather, history) {
  for (let i = 0; i < 500; i++) {
    const r = WeatherEventSelector.select({ biome, weather, history, random: Math.random })
    if (r?.id === id) return true
  }
  return false
}

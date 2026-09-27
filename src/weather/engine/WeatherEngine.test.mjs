import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { WeatherEngine } from './WeatherEngine.mjs'

describe('WeatherEngine — contraintes biome/température', () => {
  test('semiArid×summer : 0 régime sévère (4) sur 1 000 générations', () => {
    let prev = null
    for (let i = 0; i < 1000; i++) {
      prev = WeatherEngine.next({ biome: 'semiArid', season: 'summer', previousWeather: prev })
      assert.notEqual(prev.regime, 4, `Régime sévère détecté à l'itération ${i}`)
    }
  })

  test('glacial×winter : régime 1 (pluie liquide) impossible sur 1 000 générations', () => {
    let prev = null
    let count = 0
    for (let i = 0; i < 1000; i++) {
      prev = WeatherEngine.next({ biome: 'glacial', season: 'winter', previousWeather: prev })
      if (prev.regime === 1) count++
    }
    assert.equal(count, 0, `Régime 1 apparu ${count} fois sur 1000 en glacial×winter`)
  })
})

describe('WeatherEngine — inertie et transitions', () => {
  test('régime 4 en J-1 : couvert/perturbé (2 ou 3) plus probable que clair (0) sur 1 000 tirages', () => {
    const storm = { regime: 4, regimeAge: 1, sky: 'stormy', precipitation: 'heavy', wind: 'violent', temperature: 'mild' }
    let countOvercastDisturbed = 0
    let countClear = 0
    for (let i = 0; i < 1000; i++) {
      const w = WeatherEngine.next({ biome: 'temperatePlain', season: 'spring', previousWeather: storm })
      if (w.regime === 2 || w.regime === 3) countOvercastDisturbed++
      if (w.regime === 0) countClear++
    }
    assert.ok(
      countOvercastDisturbed > countClear,
      `P(couvert/perturbé)=${countOvercastDisturbed / 1000} devrait être > P(clair)=${countClear / 1000}`
    )
  })

  test('inertie : regimeAge=3 produit plus de changements que regimeAge=1', () => {
    const shared = { biome: 'temperatePlain', season: 'spring' }
    const prev1 = { regime: 2, regimeAge: 1, sky: 'overcast', precipitation: 'moderate', wind: 'moderate', temperature: 'mild' }
    const prev3 = { regime: 2, regimeAge: 3, sky: 'overcast', precipitation: 'moderate', wind: 'moderate', temperature: 'mild' }
    let changes1 = 0
    let changes3 = 0
    for (let i = 0; i < 10_000; i++) {
      if (WeatherEngine.next({ ...shared, previousWeather: prev1 }).regime !== 2) changes1++
      if (WeatherEngine.next({ ...shared, previousWeather: prev3 }).regime !== 2) changes3++
    }
    assert.ok(
      changes3 > changes1,
      `changements avec regimeAge=3 (${changes3}) devrait être > regimeAge=1 (${changes1})`
    )
  })
})

describe('WeatherEngine — contraintes de cohérence', () => {
  test('sky clear + precipitation heavy : combinaison impossible sur 1 000 générations', () => {
    let prev = null
    for (let i = 0; i < 1000; i++) {
      prev = WeatherEngine.next({ biome: 'temperatePlain', season: 'summer', previousWeather: prev })
      assert.ok(
        !(prev.sky === 'clear' && prev.precipitation === 'heavy'),
        `Combinaison sky=clear + precipitation=heavy à l'itération ${i}`
      )
    }
  })

  test('dominantTemp hot (arid×summer) : régime 4 impossible sur 1 000 générations', () => {
    let prev = null
    for (let i = 0; i < 1000; i++) {
      prev = WeatherEngine.next({ biome: 'arid', season: 'summer', previousWeather: prev })
      assert.notEqual(prev.regime, 4, `Régime 4 détecté en arid×summer (dominantTemp=hot) à l'itération ${i}`)
    }
  })
})

describe('WeatherEngine — déterminisme', () => {
  test('random fixé (même seed) : résultat identique sur 2 appels', () => {
    const makeRandom = (seed) => {
      let s = seed
      return () => {
        s = (s * 16807) % 2147483647
        return (s - 1) / 2147483646
      }
    }
    const prev = {
      regime: 1, regimeAge: 2,
      sky: 'partly-cloudy', precipitation: 'light', wind: 'light', temperature: 'mild',
    }
    const args = { biome: 'coastal', season: 'autumn', previousWeather: prev }
    const r1 = WeatherEngine.next({ ...args, random: makeRandom(42) })
    const r2 = WeatherEngine.next({ ...args, random: makeRandom(42) })
    assert.deepEqual(r1, r2)
  })
})

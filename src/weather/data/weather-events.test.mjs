import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { WEATHER_EVENTS } from './weather-events.mjs'
import { WeatherEngine } from '../engine/WeatherEngine.mjs'
import { WeatherEventSelector } from '../engine/WeatherEventSelector.mjs'

const WITH_HINT = WEATHER_EVENTS.filter(e => e.impactHint !== undefined)

describe('weather-events — impactHint', () => {
  test('3 à 5 événements portent un impactHint', () => {
    assert.ok(
      WITH_HINT.length >= 3 && WITH_HINT.length <= 5,
      `${WITH_HINT.length} événements portent un impactHint (attendu 3 à 5)`,
    )
  })

  test('chaque impactHint est une chaîne non vide distincte du texte narratif', () => {
    for (const event of WEATHER_EVENTS) {
      if (event.impactHint === undefined) continue
      assert.equal(typeof event.impactHint, 'string', `impactHint non textuel pour ${event.id}`)
      assert.ok(event.impactHint.trim().length > 0, `impactHint vide pour ${event.id}`)
      assert.notEqual(event.impactHint.trim(), event.text.trim(), `impactHint identique au texte pour ${event.id}`)
    }
  })

  test('les événements sans impactHint ne portent pas la clé', () => {
    for (const event of WEATHER_EVENTS) {
      if (WITH_HINT.some(e => e.id === event.id)) continue
      assert.equal(
        Object.prototype.hasOwnProperty.call(event, 'impactHint'), false,
        `${event.id} ne devrait pas porter de clé impactHint (le garde {{#if}} du template resterait ambigu)`,
      )
    }
  })

  test('les identifiants des événements restent uniques', () => {
    const ids = WEATHER_EVENTS.map(e => e.id)
    assert.equal(new Set(ids).size, ids.length, 'Identifiants d\'événements météo dupliqués')
  })
})

describe('weather-events — impactHint sans effet mécanique', () => {
  test('la météo du jour ne porte aucun modificateur issu de impactHint', () => {
    const expectedKeys = ['regime', 'sky', 'precipitation', 'wind', 'temperature', 'regimeAge', 'event']
    let prev = null
    for (let i = 0; i < 500; i++) {
      prev = WeatherEngine.next({ biome: 'arid', season: 'summer', previousWeather: prev })
      assert.deepEqual(
        Object.keys(prev).sort(),
        [...expectedKeys].sort(),
        `Clés inattendues sur la météo du jour : ${Object.keys(prev).join(', ')}`,
      )
    }
  })

  test('impactHint est transmis tel quel par le sélecteur, sans transformation', () => {
    const weather = { sky: 'stormy', precipitation: 'heavy', wind: 'violent', temperature: 'cold' }
    const seen = new Map()
    for (let i = 0; i < 2000; i++) {
      const selected = WeatherEventSelector.select({ biome: 'glacial', weather, history: [] })
      if (!selected || !selected.impactHint) continue
      seen.set(selected.id, selected.impactHint)
    }
    assert.ok(seen.size > 0, 'Aucun événement porteur d\'un impactHint sélectionné en glacial')
    for (const [id, hint] of seen) {
      const source = WEATHER_EVENTS.find(e => e.id === id)
      assert.equal(hint, source.impactHint, `impactHint altéré pour ${id}`)
    }
  })
})

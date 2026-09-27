import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { WeatherStateService } from './WeatherStateService.mjs'

const SAMPLE_STATE = {
  zoneId: 'durotar', biomeId: 'arid', season: 'summer',
  regime: 2, sky: 'overcast', precipitation: 'moderate', wind: 'moderate',
  temperature: 'hot', regimeAge: 1, history: [],
}

describe('WeatherStateService', () => {
  let flagStore
  let mockGame

  beforeEach(() => {
    flagStore = {}
    mockGame = {
      world: {
        getFlag(_scope, key) {
          return flagStore[key] ?? undefined
        },
        async setFlag(_scope, key, value) {
          flagStore[key] = value
        },
      },
    }
    global.game = mockGame
  })

  afterEach(() => {
    delete global.game
  })

  test('setState appelle setFlag avec la clé correcte', async () => {
    let capturedKey
    let capturedValue
    mockGame.world.setFlag = async (_scope, key, value) => {
      capturedKey = key
      capturedValue = value
    }
    await WeatherStateService.setState('durotar', SAMPLE_STATE)
    assert.equal(capturedKey, 'weather.zones.durotar')
    assert.deepEqual(capturedValue, SAMPLE_STATE)
  })

  test("getState retourne l'état après setState", async () => {
    await WeatherStateService.setState('durotar', SAMPLE_STATE)
    const result = WeatherStateService.getState('durotar')
    assert.deepEqual(result, SAMPLE_STATE)
  })

  test('getState zone inconnue retourne null', () => {
    const result = WeatherStateService.getState('unknown-zone')
    assert.equal(result, null)
  })

  test('setState / getState sont scope-isolés par zoneId', async () => {
    const state2 = { ...SAMPLE_STATE, zoneId: 'elwynn', regime: 0 }
    await WeatherStateService.setState('durotar', SAMPLE_STATE)
    await WeatherStateService.setState('elwynn', state2)
    assert.equal(WeatherStateService.getState('durotar').regime, 2)
    assert.equal(WeatherStateService.getState('elwynn').regime, 0)
  })
})

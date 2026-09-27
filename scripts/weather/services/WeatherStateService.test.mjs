import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { WeatherStateService } from './WeatherStateService.mjs'
import { MODULE_ID, WEATHER_STATES_SETTING } from './WeatherSettings.mjs'

const SAMPLE_STATE = {
  zoneId: 'durotar', biomeId: 'arid', season: 'summer',
  regime: 2, sky: 'overcast', precipitation: 'moderate', wind: 'moderate',
  temperature: 'hot', regimeAge: 1, history: [],
}

describe('WeatherStateService', () => {
  let settingStore
  let mockGame

  beforeEach(() => {
    settingStore = { [WEATHER_STATES_SETTING]: {} }
    mockGame = {
      settings: {
        get(scope, key) {
          assert.equal(scope, MODULE_ID)
          return settingStore[key]
        },
        async set(scope, key, value) {
          assert.equal(scope, MODULE_ID)
          settingStore[key] = value
        },
      },
    }
    global.game = mockGame
  })

  afterEach(() => {
    delete global.game
  })

  test('setState sauvegarde la zone dans le paramètre world', async () => {
    let capturedKey
    let capturedValue
    mockGame.settings.set = async (_scope, key, value) => {
      capturedKey = key
      capturedValue = value
    }
    await WeatherStateService.setState('durotar', SAMPLE_STATE)
    assert.equal(capturedKey, WEATHER_STATES_SETTING)
    assert.deepEqual(capturedValue.durotar, SAMPLE_STATE)
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

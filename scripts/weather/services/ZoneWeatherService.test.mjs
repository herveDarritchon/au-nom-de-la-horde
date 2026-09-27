import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { ZoneWeatherService } from './ZoneWeatherService.mjs'
import { MODULE_ID, WEATHER_STATES_SETTING, WEATHER_ZONE_CONFIGS_SETTING } from './WeatherSettings.mjs'

const DUROTAR_CONFIG = {
  id: 'durotar', name: 'Durotar', biome: 'arid', season: 'summer', weather: 'active',
}

const OUTSIDE_STATE = {
  zoneId: 'outside', biomeId: 'arid', season: 'summer',
  regime: 1, sky: 'partly-cloudy', precipitation: 'light', wind: 'light',
  temperature: 'hot', regimeAge: 2, history: [],
}

describe('ZoneWeatherService — config', () => {
  let settingStore

  beforeEach(() => {
    settingStore = { [WEATHER_ZONE_CONFIGS_SETTING]: {} }
    global.game = {
      settings: {
        get(scope, key) { assert.equal(scope, MODULE_ID); return settingStore[key] },
        async set(scope, key, value) { assert.equal(scope, MODULE_ID); settingStore[key] = value },
      },
    }
  })

  afterEach(() => { delete global.game })

  test('setZoneConfig / getZoneConfig round-trip', async () => {
    await ZoneWeatherService.setZoneConfig('durotar', DUROTAR_CONFIG)
    const result = ZoneWeatherService.getZoneConfig('durotar')
    assert.deepEqual(result, DUROTAR_CONFIG)
  })

  test('getZoneConfig zone inexistante retourne null', () => {
    assert.equal(ZoneWeatherService.getZoneConfig('nowhere'), null)
  })
})

describe('ZoneWeatherService — resolveWeatherState', () => {
  let settingStore

  beforeEach(() => {
    settingStore = {
      [WEATHER_ZONE_CONFIGS_SETTING]: {},
      [WEATHER_STATES_SETTING]: {},
    }
    global.game = {
      settings: {
        get(scope, key) { assert.equal(scope, MODULE_ID); return settingStore[key] },
        async set(scope, key, value) { assert.equal(scope, MODULE_ID); settingStore[key] = value },
      },
    }
  })

  afterEach(() => { delete global.game })

  test('zone disabled retourne null', async () => {
    await ZoneWeatherService.setZoneConfig('inn', { id: 'inn', weather: 'disabled' })
    assert.equal(ZoneWeatherService.resolveWeatherState('inn'), null)
  })

  test("zone active retourne l'état de la zone elle-même", async () => {
    const state = { zoneId: 'durotar', regime: 2, regimeAge: 1 }
    await ZoneWeatherService.setZoneConfig('durotar', DUROTAR_CONFIG)
    settingStore[WEATHER_STATES_SETTING].durotar = state
    assert.deepEqual(ZoneWeatherService.resolveWeatherState('durotar'), state)
  })

  test("zone inheritOutside retourne l'état de la zone parente", async () => {
    await ZoneWeatherService.setZoneConfig('barracks', {
      id: 'barracks', weather: 'inheritOutside', parentZoneId: 'outside',
    })
    settingStore[WEATHER_STATES_SETTING].outside = OUTSIDE_STATE
    assert.deepEqual(ZoneWeatherService.resolveWeatherState('barracks'), OUTSIDE_STATE)
  })

  test('zone inheritOutside sans parentZoneId retourne null', async () => {
    await ZoneWeatherService.setZoneConfig('orphan', { id: 'orphan', weather: 'inheritOutside' })
    assert.equal(ZoneWeatherService.resolveWeatherState('orphan'), null)
  })

  test('zone sans config retourne null', () => {
    assert.equal(ZoneWeatherService.resolveWeatherState('ghost'), null)
  })
})

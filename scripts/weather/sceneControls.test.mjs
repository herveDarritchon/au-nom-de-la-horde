import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { registerWeatherSceneControl } from './sceneControls.mjs'

describe('registerWeatherSceneControl', () => {
  test('ajoute un bouton v14 au groupe de contrôles pour le MJ', () => {
    const controls = {
      tokens: { order: 2, tools: {} },
      tiles: { order: 4, tools: {} },
    }
    const openWeatherDialog = () => {}

    const added = registerWeatherSceneControl(controls, { isGM: true, openWeatherDialog })

    assert.equal(added, true)
    assert.equal(controls.weather.name, 'weather')
    assert.equal(controls.weather.order, 5)
    assert.equal(controls.weather.visible, true)
    assert.equal(Array.isArray(controls.weather.tools), false)
    assert.equal(controls.weather.tools['weather-open'].button, true)
    assert.equal(controls.weather.tools['weather-open'].onChange, openWeatherDialog)
  })

  test('ne crée pas le contrôle pour un joueur', () => {
    const controls = { tokens: { order: 0, tools: {} } }

    const added = registerWeatherSceneControl(controls, {
      isGM: false,
      openWeatherDialog: () => {},
    })

    assert.equal(added, false)
    assert.equal(Object.hasOwn(controls, 'weather'), false)
  })
})

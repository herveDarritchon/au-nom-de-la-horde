import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { buildItemPilesConfig, INTEGRATION_VERSION } from './config.mjs'

/**
 * Garde de contrat : rejoue les validations strictes de `addSystemIntegration`
 * (bundle Item Piles 3.3.4) pour empêcher qu'une évolution casse l'enregistrement
 * au démarrage de Foundry sans que les tests unitaires purs ne le détectent.
 */
describe('buildItemPilesConfig — contrat addSystemIntegration 3.3.4', () => {
  const config = buildItemPilesConfig()

  test('VERSION est une string', () => {
    assert.equal(typeof config.VERSION, 'string')
    assert.equal(config.VERSION, INTEGRATION_VERSION)
  })

  test('ACTOR_CLASS_TYPE est une string', () => {
    assert.equal(typeof config.ACTOR_CLASS_TYPE, 'string')
    assert.equal(config.ACTOR_CLASS_TYPE, 'encounter')
  })

  test('ITEM_QUANTITY_ATTRIBUTE / ITEM_PRICE_ATTRIBUTE sont des strings', () => {
    assert.equal(typeof config.ITEM_QUANTITY_ATTRIBUTE, 'string')
    assert.equal(config.ITEM_QUANTITY_ATTRIBUTE, 'system.quantity.current')
    assert.equal(typeof config.ITEM_PRICE_ATTRIBUTE, 'string')
    assert.equal(config.ITEM_PRICE_ATTRIBUTE, 'system.price.value')
  })

  test('ITEM_FILTERS est un tableau dont chaque entry a path: string et filters: string', () => {
    assert.ok(Array.isArray(config.ITEM_FILTERS))
    for (const filter of config.ITEM_FILTERS) {
      assert.equal(typeof filter.path, 'string')
      assert.equal(typeof filter.filters, 'string', 'filters doit être une string CSV — un tableau lèverait une exception dans 3.3.4')
    }
  })

  test('ITEM_FILTERS bloque les types non physiques et container', () => {
    const values = config.ITEM_FILTERS[0].filters.split(',').map((s) => s.trim())
    for (const type of ['profile', 'feature', 'capacity', 'attack', 'path', 'container']) {
      assert.ok(values.includes(type), `type ${type} doit être filtré`)
    }
  })

  test('ITEM_SIMILARITIES est un tableau de strings (jamais une fonction)', () => {
    assert.ok(Array.isArray(config.ITEM_SIMILARITIES), 'ITEM_SIMILARITIES doit être un tableau dans 3.3.4')
    for (const path of config.ITEM_SIMILARITIES) {
      assert.equal(typeof path, 'string')
    }
  })

  test('CURRENCIES est un tableau valide', () => {
    assert.ok(Array.isArray(config.CURRENCIES))
    assert.equal(config.CURRENCIES.length, 3)

    let primaryCount = 0
    for (const currency of config.CURRENCIES) {
      assert.equal(typeof currency.primary, 'boolean', 'currency.primary doit être un boolean')
      assert.equal(typeof currency.name, 'string')
      assert.equal(typeof currency.abbreviation, 'string')
      assert.equal(typeof currency.exchangeRate, 'number', 'exchangeRate doit être un number (et non "exchange")')
      assert.equal(typeof currency.data, 'object')
      assert.equal(typeof currency.data.path, 'string', 'currency.data doit contenir un path string')
      if (currency.primary) primaryCount += 1
    }
    assert.equal(primaryCount, 1, 'exactement une devise primaire')
    assert.equal(config.CURRENCIES[0].primary, true)
    assert.equal(config.CURRENCIES[0].data.path, 'system.wealth.gp.value')
  })

  test('UNSTACKABLE_ITEM_TYPES ne bloque pas tout equipment', () => {
    assert.ok(Array.isArray(config.UNSTACKABLE_ITEM_TYPES))
    assert.ok(!config.UNSTACKABLE_ITEM_TYPES.includes('equipment'))
  })

  test('PILE_DEFAULTS est un objet (aucune clé illégale ici)', () => {
    assert.equal(typeof config.PILE_DEFAULTS, 'object')
    assert.ok(!Array.isArray(config.PILE_DEFAULTS))
  })

  test('ITEM_TRANSFORMER est une fonction retournant un objet (validation 3.3.4)', async () => {
    assert.equal(typeof config.ITEM_TRANSFORMER, 'function')
    const out = await config.ITEM_TRANSFORMER({})
    assert.equal(typeof out, 'object', 'ITEM_TRANSFORMER({}) doit retourner un object')
  })

  test('ITEM_COST_TRANSFORMER est une fonction retournant un number', () => {
    assert.equal(typeof config.ITEM_COST_TRANSFORMER, 'function')
    const result = config.ITEM_COST_TRANSFORMER({ system: { price: { value: 8, unit: 'pa' } } })
    assert.equal(typeof result, 'number')
    assert.equal(result, 0.8, '8 PA (unit "pa") doit valoir 0.8 PO primaire')
  })

  test('ITEM_COST_TRANSFORMER sans prix → 0 (pas NaN)', () => {
    assert.equal(config.ITEM_COST_TRANSFORMER({}), 0)
  })
})

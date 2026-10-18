import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  isPhysicalItem,
  isStackable,
  areSimilar,
  hasQuantity,
  normalizeQuantity,
  applyStackingFlag,
  ITEM_SIMILARITY_PATHS,
} from './items.mjs'

const equipment = (overrides = {}) => ({
  type: 'equipment',
  name: 'Épée longue',
  system: {
    slug: 'epee-longue',
    rarity: 'common',
    properties: { stackable: false },
    charges: { max: null },
    ...overrides.system,
  },
  ...overrides,
})

const potion = (overrides = {}) => ({
  type: 'equipment',
  name: 'Potion de soin',
  system: {
    slug: 'potion-de-soin',
    rarity: 'common',
    properties: { stackable: true },
    charges: { max: null },
    ...overrides.system,
  },
  ...overrides,
})

describe('isPhysicalItem', () => {
  test('equipment → true', () => {
    assert.ok(isPhysicalItem({ type: 'equipment' }))
  })

  test('profile → false', () => {
    assert.ok(!isPhysicalItem({ type: 'profile' }))
  })

  test('feature → false', () => {
    assert.ok(!isPhysicalItem({ type: 'feature' }))
  })

  test('capacity → false', () => {
    assert.ok(!isPhysicalItem({ type: 'capacity' }))
  })

  test('attack → false', () => {
    assert.ok(!isPhysicalItem({ type: 'attack' }))
  })

  test('path → false', () => {
    assert.ok(!isPhysicalItem({ type: 'path' }))
  })

  test('container → false (exclu jusqu\'à P5)', () => {
    assert.ok(!isPhysicalItem({ type: 'container' }))
  })

  test('objet null → false', () => {
    assert.ok(!isPhysicalItem(null))
  })
})

describe('isStackable', () => {
  test('stackable=true → true', () => {
    assert.ok(isStackable(potion()))
  })

  test('stackable=false → false', () => {
    assert.ok(!isStackable(equipment()))
  })

  test('stackable absent → false', () => {
    assert.ok(!isStackable({ type: 'equipment', system: { properties: {} } }))
  })

  test('objet null → false', () => {
    assert.ok(!isStackable(null))
  })
})

describe('hasQuantity', () => {
  test('equipment → true', () => {
    assert.ok(hasQuantity({ type: 'equipment' }))
  })

  test('container → false', () => {
    assert.ok(!hasQuantity({ type: 'container' }))
  })

  test('null → false', () => {
    assert.ok(!hasQuantity(null))
  })
})

describe('ITEM_SIMILARITY_PATHS', () => {
  test('est un tableau de chaînes (contract 3.3.4)', () => {
    assert.ok(Array.isArray(ITEM_SIMILARITY_PATHS))
    assert.ok(ITEM_SIMILARITY_PATHS.every((p) => typeof p === 'string'))
  })

  test('n\'inclut pas system.charges (charges ≠ quantité)', () => {
    assert.ok(!ITEM_SIMILARITY_PATHS.some((p) => p.startsWith('system.charges')))
  })
})

describe('areSimilar', () => {
  test('deux potions identiques → true', () => {
    assert.ok(areSimilar(potion(), potion()))
  })

  test('potion vs équipement non-stackable → false', () => {
    assert.ok(!areSimilar(potion(), equipment()))
  })

  test('deux potions de noms différents → false', () => {
    const p2 = potion({ name: 'Potion de vitesse' })
    assert.ok(!areSimilar(potion(), p2))
  })

  test('deux potions de slug différents → false', () => {
    const p2 = potion({ system: { slug: 'potion-de-vitesse', rarity: 'common', properties: { stackable: true } } })
    assert.ok(!areSimilar(potion(), p2))
  })

  test('deux potions de rareté différente → false', () => {
    const p2 = potion({ system: { slug: 'potion-de-soin', rarity: 'rare', properties: { stackable: true } } })
    assert.ok(!areSimilar(potion(), p2))
  })

  test('deux équipements non-stackable même nom → false (pas de fusion)', () => {
    assert.ok(!areSimilar(equipment(), equipment()))
  })

  test('symétrie : areSimilar(a, b) === areSimilar(b, a)', () => {
    assert.equal(areSimilar(potion(), equipment()), areSimilar(equipment(), potion()))
  })

  test('potion vs potion non-stackable → false', () => {
    const notStackable = potion({ system: { slug: 'potion-de-soin', rarity: 'common', properties: { stackable: false } } })
    assert.ok(!areSimilar(potion(), notStackable))
  })
})

describe('normalizeQuantity', () => {
  test('quantité valide sans max → retournée', () => {
    assert.equal(normalizeQuantity(3, null), 3)
  })

  test('quantité valide dans max → retournée', () => {
    assert.equal(normalizeQuantity(5, 8), 5)
  })

  test('quantité 0 → 0', () => {
    assert.equal(normalizeQuantity(0, null), 0)
  })

  test('quantité > max → null', () => {
    assert.equal(normalizeQuantity(5, 3), null)
  })

  test('quantité égale au max → conservée (borne inclusive)', () => {
    assert.equal(normalizeQuantity(8, 8), 8)
  })

  test('max = 0 et quantité 0 → 0', () => {
    assert.equal(normalizeQuantity(0, 0), 0)
  })

  test('max = 0 et quantité 1 → null', () => {
    assert.equal(normalizeQuantity(1, 0), null)
  })

  test('quantité négative → null', () => {
    assert.equal(normalizeQuantity(-1, null), null)
  })

  test('quantité fractionnaire → null', () => {
    assert.equal(normalizeQuantity(1.5, null), null)
  })

  test('quantité 0.5 → null', () => {
    assert.equal(normalizeQuantity(0.5, null), null)
  })

  test('NaN → null', () => {
    assert.equal(normalizeQuantity(NaN, null), null)
  })

  test('Infinity → null', () => {
    assert.equal(normalizeQuantity(Infinity, null), null)
  })
})

describe('applyStackingFlag', () => {
  test('objet stackable → canStack "yes"', () => {
    const out = applyStackingFlag(potion())
    assert.equal(out.flags['item-piles'].item.canStack, 'yes')
  })

  test('objet non-stackable → canStack "no"', () => {
    const out = applyStackingFlag(equipment())
    assert.equal(out.flags['item-piles'].item.canStack, 'no')
  })

  test('ne mute pas l\'objet source', () => {
    const src = potion()
    const out = applyStackingFlag(src)
    assert.notEqual(out, src)
    assert.equal(src.flags, undefined)
  })

  test('préserve les flags item-piles existants', () => {
    const src = potion()
    src.flags = { 'item-piles': { item: { prices: [10] } } }
    const out = applyStackingFlag(src)
    assert.deepEqual(out.flags['item-piles'].item.prices, [10])
    assert.equal(out.flags['item-piles'].item.canStack, 'yes')
  })

  test('objet vide → objet retourné (validation addSystemIntegration)', () => {
    const out = applyStackingFlag({})
    assert.equal(typeof out, 'object')
    assert.equal(out.flags['item-piles'].item.canStack, 'no')
  })

  test('null → null', () => {
    assert.equal(applyStackingFlag(null), null)
  })

  test('préserve les flags de premier niveau non liés à item-piles', () => {
    const src = potion()
    src.flags = { 'custom-flag': { key: 'value' } }
    const out = applyStackingFlag(src)
    assert.deepEqual(out.flags['custom-flag'], { key: 'value' })
    assert.equal(out.flags['item-piles'].item.canStack, 'yes')
  })

  test('idempotent : réappliqué, le résultat est stable', () => {
    const once = applyStackingFlag(potion())
    const twice = applyStackingFlag(once)
    assert.equal(twice.flags['item-piles'].item.canStack, 'yes')
    assert.deepEqual(twice, once)
  })
})

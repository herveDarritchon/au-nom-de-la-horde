import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  applyMerchantMarkup,
  isSaleAllowed,
  canSellToMerchant,
  isItemHidden,
  isService,
  isInfiniteQuantity,
  isAccessible,
} from './merchant.mjs'

const item = (flagOverrides = {}) => ({
  _id: 'item-1',
  type: 'equipment',
  flags: { 'item-piles': { item: { ...flagOverrides } } },
})

describe('applyMerchantMarkup', () => {
  test('majoration +20 % : 100 PC → 120 PC', () => {
    assert.equal(applyMerchantMarkup(100, 1.2), 120)
  })

  test('réduction −10 % : 100 PC → 90 PC', () => {
    assert.equal(applyMerchantMarkup(100, 0.9), 90)
  })

  test('facteur neutre (×1) : prix inchangé', () => {
    assert.equal(applyMerchantMarkup(80, 1), 80)
  })

  test('modificateur zéro : prix = 0 (article gratuit)', () => {
    assert.equal(applyMerchantMarkup(100, 0), 0)
  })

  test('arrondi : 80 PC × 1.2 = 96 PC (pas de virgule)', () => {
    assert.equal(applyMerchantMarkup(80, 1.2), 96)
  })

  test('prix zéro × modificateur → 0', () => {
    assert.equal(applyMerchantMarkup(0, 1.5), 0)
  })

  test('basePrice négatif → null', () => {
    assert.equal(applyMerchantMarkup(-10, 1), null)
  })

  test('modifier négatif → null', () => {
    assert.equal(applyMerchantMarkup(100, -1), null)
  })

  test('basePrice NaN → null', () => {
    assert.equal(applyMerchantMarkup(NaN, 1), null)
  })

  test('modifier Infinity → null', () => {
    assert.equal(applyMerchantMarkup(100, Infinity), null)
  })
})

describe('isSaleAllowed (flag notForSale)', () => {
  test('flag absent → vente autorisée', () => {
    assert.equal(isSaleAllowed(item()), true)
  })

  test('flag notForSale=true → vente interdite', () => {
    assert.equal(isSaleAllowed(item({ notForSale: true })), false)
  })

  test('flag notForSale=false → vente autorisée', () => {
    assert.equal(isSaleAllowed(item({ notForSale: false })), true)
  })

  test('objet sans flags → vente autorisée', () => {
    assert.equal(isSaleAllowed({ _id: 'x', type: 'equipment' }), true)
  })

  test('item null → false', () => {
    assert.equal(isSaleAllowed(null), false)
  })
})

describe('canSellToMerchant (flag cantBeSoldToMerchants)', () => {
  test('flag absent → revente autorisée', () => {
    assert.equal(canSellToMerchant(item()), true)
  })

  test('flag cantBeSoldToMerchants=true → revente interdite', () => {
    assert.equal(canSellToMerchant(item({ cantBeSoldToMerchants: true })), false)
  })

  test('flag cantBeSoldToMerchants=false → revente autorisée', () => {
    assert.equal(canSellToMerchant(item({ cantBeSoldToMerchants: false })), true)
  })

  test('item null → false', () => {
    assert.equal(canSellToMerchant(null), false)
  })
})

describe('isItemHidden (flag hidden)', () => {
  test('flag hidden=true → caché', () => {
    assert.equal(isItemHidden(item({ hidden: true })), true)
  })

  test('flag hidden=false → visible', () => {
    assert.equal(isItemHidden(item({ hidden: false })), false)
  })

  test('flag absent → visible', () => {
    assert.equal(isItemHidden(item()), false)
  })

  test('item null → caché (défense)', () => {
    assert.equal(isItemHidden(null), true)
  })
})

describe('isService (flag isService)', () => {
  test('flag isService=true → service', () => {
    assert.equal(isService(item({ isService: true })), true)
  })

  test('flag absent → objet normal', () => {
    assert.equal(isService(item()), false)
  })

  test('item null → false', () => {
    assert.equal(isService(null), false)
  })
})

describe('isInfiniteQuantity (tri-état infiniteQuantity)', () => {
  test('"yes" → true', () => {
    assert.equal(isInfiniteQuantity(item({ infiniteQuantity: 'yes' })), true)
  })

  test('"no" → false même si le marchand est infini', () => {
    assert.equal(isInfiniteQuantity(item({ infiniteQuantity: 'no' }), true), false)
  })

  test('"default" → valeur du marchand (true)', () => {
    assert.equal(isInfiniteQuantity(item({ infiniteQuantity: 'default' }), true), true)
  })

  test('"default" → valeur du marchand (false)', () => {
    assert.equal(isInfiniteQuantity(item({ infiniteQuantity: 'default' }), false), false)
  })

  test('flag absent → valeur du marchand', () => {
    assert.equal(isInfiniteQuantity(item(), true), true)
  })
})

describe('isAccessible', () => {
  test('objet visible + acteur présent + vendable → accessible', () => {
    assert.equal(isAccessible(item(), { _id: 'actor-1' }), true)
  })

  test('objet caché → non accessible', () => {
    assert.equal(isAccessible(item({ hidden: true }), { _id: 'actor-1' }), false)
  })

  test('acteur absent → non accessible', () => {
    assert.equal(isAccessible(item(), null), false)
  })

  test('objet notForSale → non accessible', () => {
    assert.equal(isAccessible(item({ notForSale: true }), { _id: 'actor-1' }), false)
  })
})

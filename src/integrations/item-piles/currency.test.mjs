import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  toPrimaryAmount,
  toLowestDenomination,
  fromLowestDenomination,
  resolveCurrencyId,
  canAfford,
  subtractCurrency,
  calculateChange,
  EXCHANGE_RATES,
} from './currency.mjs'

describe('resolveCurrencyId', () => {
  test('abréviation française po → gp', () => {
    assert.equal(resolveCurrencyId('po'), 'gp')
  })

  test('abréviation française pa → sp', () => {
    assert.equal(resolveCurrencyId('pa'), 'sp')
  })

  test('abréviation française pc → cp', () => {
    assert.equal(resolveCurrencyId('pc'), 'cp')
  })

  test('id de devise gp/sp/cp accepté', () => {
    assert.equal(resolveCurrencyId('gp'), 'gp')
    assert.equal(resolveCurrencyId('sp'), 'sp')
    assert.equal(resolveCurrencyId('cp'), 'cp')
  })

  test('casse et espaces tolérés', () => {
    assert.equal(resolveCurrencyId(' PA '), 'sp')
  })

  test('unité inconnue → null', () => {
    assert.equal(resolveCurrencyId('xx'), null)
  })

  test('unit non string → null', () => {
    assert.equal(resolveCurrencyId(undefined), null)
    assert.equal(resolveCurrencyId(null), null)
  })
})

describe('toPrimaryAmount', () => {
  test('1 PO → 1', () => {
    assert.equal(toPrimaryAmount({ value: 1, unit: 'po' }), 1)
  })

  test('10 PA → 1 PO', () => {
    assert.equal(toPrimaryAmount({ value: 10, unit: 'pa' }), 1)
  })

  test('100 PC → 1 PO', () => {
    assert.equal(toPrimaryAmount({ value: 100, unit: 'pc' }), 1)
  })

  test('8 PA (arbalète de poing COF2) → 0.8 PO', () => {
    assert.equal(toPrimaryAmount({ value: 8, unit: 'pa' }), 0.8)
  })

  test('ids gp/sp/cp aussi acceptés', () => {
    assert.equal(toPrimaryAmount({ value: 10, unit: 'sp' }), 1)
    assert.equal(toPrimaryAmount({ value: 1, unit: 'gp' }), 1)
  })

  test('unit inconnu → null', () => {
    assert.equal(toPrimaryAmount({ value: 5, unit: 'unknown' }), null)
  })

  test('value NaN → null', () => {
    assert.equal(toPrimaryAmount({ value: NaN, unit: 'po' }), null)
  })

  test('value négatif → null', () => {
    assert.equal(toPrimaryAmount({ value: -1, unit: 'po' }), null)
  })

  test('value Infinity → null', () => {
    assert.equal(toPrimaryAmount({ value: Infinity, unit: 'po' }), null)
  })

  test('appel sans argument → null', () => {
    assert.equal(toPrimaryAmount(), null)
  })

  test('value zéro → 0', () => {
    assert.equal(toPrimaryAmount({ value: 0, unit: 'po' }), 0)
  })
})

describe('toLowestDenomination', () => {
  test('1 PO = 100 PC', () => {
    assert.equal(toLowestDenomination(1, 0, 0), 100)
  })

  test('1 PA = 10 PC', () => {
    assert.equal(toLowestDenomination(0, 1, 0), 10)
  })

  test('1 PO + 2 PA + 3 PC = 123 PC', () => {
    assert.equal(toLowestDenomination(1, 2, 3), 123)
  })

  test('0 partout → 0', () => {
    assert.equal(toLowestDenomination(0, 0, 0), 0)
  })

  test('invariant test A09 : 7 PA < 8 PA (80 vs 100 PC)', () => {
    const buyer  = toLowestDenomination(0, 7, 0)
    const price  = toLowestDenomination(0, 8, 0)
    assert.ok(buyer < price, `7 PA (${buyer} PC) doit être < 8 PA (${price} PC)`)
  })
})

describe('fromLowestDenomination', () => {
  test('100 PC → {gp:1, sp:0, cp:0}', () => {
    assert.deepEqual(fromLowestDenomination(100), { gp: 1, sp: 0, cp: 0 })
  })

  test('123 PC → {gp:1, sp:2, cp:3}', () => {
    assert.deepEqual(fromLowestDenomination(123), { gp: 1, sp: 2, cp: 3 })
  })

  test('0 → {gp:0, sp:0, cp:0}', () => {
    assert.deepEqual(fromLowestDenomination(0), { gp: 0, sp: 0, cp: 0 })
  })

  test('négatif → null', () => {
    assert.equal(fromLowestDenomination(-1), null)
  })

  test('non entier → null', () => {
    assert.equal(fromLowestDenomination(1.5), null)
  })

  test('NaN → null', () => {
    assert.equal(fromLowestDenomination(NaN), null)
  })

  test('aller-retour : 1 PO + 5 PA + 3 PC', () => {
    const totalCp = toLowestDenomination(1, 5, 3)
    assert.deepEqual(fromLowestDenomination(totalCp), { gp: 1, sp: 5, cp: 3 })
  })
})

describe('canAfford', () => {
  test('A09 — achat exact : 8 PA pour 8 PA → true', () => {
    assert.equal(canAfford({ gp: 0, sp: 8, cp: 0 }, { gp: 0, sp: 8, cp: 0 }), true)
  })

  test('test de référence — 7 PA pour article à 8 PA → false', () => {
    assert.equal(canAfford({ gp: 0, sp: 7, cp: 0 }, { gp: 0, sp: 8, cp: 0 }), false)
  })

  test('A10 — 1 PO pour article à 8 PA → true (100 PC >= 80 PC)', () => {
    assert.equal(canAfford({ gp: 1, sp: 0, cp: 0 }, { gp: 0, sp: 8, cp: 0 }), true)
  })

  test('A11 — fonds insuffisants multi-devise → false', () => {
    assert.equal(canAfford({ gp: 0, sp: 5, cp: 9 }, { gp: 0, sp: 6, cp: 0 }), false)
  })

  test('A12 — prix zéro → toujours affordé', () => {
    assert.equal(canAfford({ gp: 0, sp: 0, cp: 0 }, { gp: 0, sp: 0, cp: 0 }), true)
    assert.equal(canAfford({ gp: 1, sp: 0, cp: 0 }, { gp: 0, sp: 0, cp: 0 }), true)
  })

  test('wallet null → false', () => {
    assert.equal(canAfford(null, { gp: 0, sp: 1, cp: 0 }), false)
  })

  test('cost null → false', () => {
    assert.equal(canAfford({ gp: 0, sp: 1, cp: 0 }, null), false)
  })
})

describe('subtractCurrency', () => {
  test('A09 — soustraction exacte : 8 PA − 8 PA = 0', () => {
    assert.deepEqual(subtractCurrency({ gp: 0, sp: 8, cp: 0 }, { gp: 0, sp: 8, cp: 0 }), { gp: 0, sp: 0, cp: 0 })
  })

  test('A10 — 1 PO − 8 PA = 2 PA (solde acheteur après paiement)', () => {
    assert.deepEqual(subtractCurrency({ gp: 1, sp: 0, cp: 0 }, { gp: 0, sp: 8, cp: 0 }), { gp: 0, sp: 2, cp: 0 })
  })

  test('A11 — fonds insuffisants → null, aucune mutation', () => {
    const wallet = { gp: 0, sp: 7, cp: 0 }
    const result = subtractCurrency(wallet, { gp: 0, sp: 8, cp: 0 })
    assert.equal(result, null)
    assert.deepEqual(wallet, { gp: 0, sp: 7, cp: 0 }, 'wallet non muté')
  })

  test('A13 — multi-devise : 1 PO 5 PA − 8 PA = 7 PA', () => {
    assert.deepEqual(subtractCurrency({ gp: 1, sp: 5, cp: 0 }, { gp: 0, sp: 8, cp: 0 }), { gp: 0, sp: 7, cp: 0 })
  })

  test('A14 — solde exact avec PC : 1 PO 2 PA 3 PC − 1 PO = 2 PA 3 PC', () => {
    assert.deepEqual(subtractCurrency({ gp: 1, sp: 2, cp: 3 }, { gp: 1, sp: 0, cp: 0 }), { gp: 0, sp: 2, cp: 3 })
  })
})

describe('calculateChange', () => {
  test('A09 — paiement exact → rendu zéro', () => {
    assert.deepEqual(calculateChange({ gp: 0, sp: 8, cp: 0 }, { gp: 0, sp: 8, cp: 0 }), { gp: 0, sp: 0, cp: 0 })
  })

  test('A10 — 1 PO pour 8 PA → rendu 2 PA', () => {
    assert.deepEqual(calculateChange({ gp: 1, sp: 0, cp: 0 }, { gp: 0, sp: 8, cp: 0 }), { gp: 0, sp: 2, cp: 0 })
  })

  test('A11 — paiement insuffisant → null', () => {
    assert.equal(calculateChange({ gp: 0, sp: 7, cp: 0 }, { gp: 0, sp: 8, cp: 0 }), null)
  })

  test('A12 — prix zéro → rendu égal au paiement', () => {
    assert.deepEqual(calculateChange({ gp: 0, sp: 3, cp: 0 }, { gp: 0, sp: 0, cp: 0 }), { gp: 0, sp: 3, cp: 0 })
  })

  test('A13 — 1 PO 5 PA pour 8 PA → rendu 7 PA', () => {
    assert.deepEqual(calculateChange({ gp: 1, sp: 5, cp: 0 }, { gp: 0, sp: 8, cp: 0 }), { gp: 0, sp: 7, cp: 0 })
  })

  test('A14 — multi-devise avec PC : 1 PO 2 PA 3 PC pour 1 PO → rendu 2 PA 3 PC', () => {
    assert.deepEqual(calculateChange({ gp: 1, sp: 2, cp: 3 }, { gp: 1, sp: 0, cp: 0 }), { gp: 0, sp: 2, cp: 3 })
  })

  test('régression 3.3.3 — rendu doit être soustrait du marchand', () => {
    // Scénario : acheteur paie 1 PO, article coûte 8 PA. Rendu = 2 PA.
    // Le marchand DOIT perdre 2 PA de son stock de monnaie.
    const change = calculateChange({ gp: 1, sp: 0, cp: 0 }, { gp: 0, sp: 8, cp: 0 })
    assert.deepEqual(change, { gp: 0, sp: 2, cp: 0 }, 'rendu = 2 PA')
    const merchantWallet = { gp: 0, sp: 10, cp: 0 }
    const merchantAfter  = subtractCurrency(merchantWallet, change)
    assert.deepEqual(merchantAfter, { gp: 0, sp: 8, cp: 0 }, 'marchand perd 2 PA (régression 3.3.3 absente)')
  })

  test('paid null → null', () => {
    assert.equal(calculateChange(null, { gp: 0, sp: 1, cp: 0 }), null)
  })

  test('price null → null', () => {
    assert.equal(calculateChange({ gp: 0, sp: 1, cp: 0 }, null), null)
  })
})

describe('EXCHANGE_RATES — invariants', () => {
  test('gp est l\'unité de référence (rate=1)', () => {
    assert.equal(EXCHANGE_RATES.gp, 1)
  })

  test('taux sp < taux gp', () => {
    assert.ok(EXCHANGE_RATES.sp < EXCHANGE_RATES.gp)
  })

  test('taux cp < taux sp', () => {
    assert.ok(EXCHANGE_RATES.cp < EXCHANGE_RATES.sp)
  })
})

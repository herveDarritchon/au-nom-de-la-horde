import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildVaultAccessEntry,
  hasVaultRight,
  canView,
  canOrganize,
  canDepositItems,
  canWithdrawItems,
  canDepositCurrencies,
  canWithdrawCurrencies,
  snapshotItemMetadata,
  assertMetadataIntegrity,
} from './vault.mjs'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const uuidA = 'Actor.a'
const uuidB = 'Actor.b'

const vaultAccess = () => [
  buildVaultAccessEntry({ uuid: uuidA, view: true, organize: true, items: { deposit: true, withdraw: true }, currencies: { deposit: true, withdraw: true } }),
  buildVaultAccessEntry({ uuid: uuidB, view: true }),
]

const item = (overrides = {}) => ({
  id: 'item-1',
  type: 'equipment',
  system: {
    charges: { max: 10, value: 7 },
    quantity: { current: 2 },
    ...overrides.system,
  },
  effects: overrides.effects ?? [{ name: 'Effet A' }, { name: 'Effet B' }],
})

// ── buildVaultAccessEntry ─────────────────────────────────────────────────────

describe('buildVaultAccessEntry', () => {
  test('applique les defaults du contrat 3.3.4', () => {
    assert.deepEqual(buildVaultAccessEntry({ uuid: uuidA }), {
      uuid: uuidA,
      view: true,
      organize: false,
      items: { deposit: false, withdraw: false },
      currencies: { deposit: false, withdraw: false },
    })
  })

  test('normalise les droits booléens', () => {
    const entry = buildVaultAccessEntry({
      uuid: uuidA,
      view: false,
      organize: 1,
      items: { deposit: true, withdraw: 'yes' },
      currencies: { deposit: 0, withdraw: true },
    })
    assert.equal(entry.view, false)
    assert.equal(entry.organize, false)
    assert.equal(entry.items.deposit, true)
    assert.equal(entry.items.withdraw, false)
    assert.equal(entry.currencies.deposit, false)
    assert.equal(entry.currencies.withdraw, true)
  })

  test('uuid absent → chaîne vide', () => {
    assert.equal(buildVaultAccessEntry().uuid, '')
  })
})

// ── hasVaultRight + wrappers ──────────────────────────────────────────────────

describe('hasVaultRight', () => {
  test('droit accordé → true', () => {
    assert.equal(hasVaultRight(vaultAccess(), uuidA, 'depositItems'), true)
    assert.equal(hasVaultRight(vaultAccess(), uuidA, 'organize'), true)
  })

  test('droit non accordé → false', () => {
    assert.equal(hasVaultRight(vaultAccess(), uuidB, 'depositItems'), false)
    assert.equal(hasVaultRight(vaultAccess(), uuidB, 'organize'), false)
  })

  test('acteur absent du tableau → false', () => {
    assert.equal(hasVaultRight(vaultAccess(), 'Actor.x', 'view'), false)
  })

  test('view par défaut true si non spécifié', () => {
    assert.equal(hasVaultRight([{ uuid: uuidA }], uuidA, 'view'), true)
  })

  test('vaultAccess null/undefined → false', () => {
    assert.equal(hasVaultRight(null, uuidA, 'view'), false)
    assert.equal(hasVaultRight(undefined, uuidA, 'view'), false)
  })

  test('actorUuid null → false', () => {
    assert.equal(hasVaultRight(vaultAccess(), null, 'view'), false)
  })

  test('droit inconnu → false', () => {
    assert.equal(hasVaultRight(vaultAccess(), uuidA, 'nope'), false)
  })
})

describe('wrappers de droits', () => {
  test('canView / canOrganize', () => {
    assert.equal(canView(vaultAccess(), uuidB), true)
    assert.equal(canOrganize(vaultAccess(), uuidB), false)
    assert.equal(canOrganize(vaultAccess(), uuidA), true)
  })

  test('canDepositItems / canWithdrawItems', () => {
    assert.equal(canDepositItems(vaultAccess(), uuidA), true)
    assert.equal(canWithdrawItems(vaultAccess(), uuidA), true)
    assert.equal(canDepositItems(vaultAccess(), uuidB), false)
  })

  test('canDepositCurrencies / canWithdrawCurrencies', () => {
    assert.equal(canDepositCurrencies(vaultAccess(), uuidA), true)
    assert.equal(canWithdrawCurrencies(vaultAccess(), uuidA), true)
    assert.equal(canWithdrawCurrencies(vaultAccess(), uuidB), false)
  })
})

// ── snapshotItemMetadata ──────────────────────────────────────────────────────

describe('snapshotItemMetadata', () => {
  test('snapshot complet depuis un objet normal', () => {
    assert.deepEqual(snapshotItemMetadata(item()), {
      charges:  { max: 10, value: 7 },
      quantity: 2,
      effects:  ['Effet A', 'Effet B'],
    })
  })

  test('objet sans charges → {max: null, value: null}', () => {
    const i = { id: 'x', system: { quantity: { current: 1 } } }
    assert.deepEqual(snapshotItemMetadata(i), {
      charges:  { max: null, value: null },
      quantity: 1,
      effects:  [],
    })
  })

  test('objet sans quantity → quantity: null', () => {
    const i = { id: 'x', system: { charges: { max: 5, value: 5 } } }
    assert.deepEqual(snapshotItemMetadata(i), {
      charges:  { max: 5, value: 5 },
      quantity: null,
      effects:  [],
    })
  })

  test('objet null → null', () => {
    assert.equal(snapshotItemMetadata(null), null)
  })
})

// ── assertMetadataIntegrity ───────────────────────────────────────────────────

describe('assertMetadataIntegrity', () => {
  test('objet identique → true', () => {
    const i = item()
    assert.equal(assertMetadataIntegrity(i, snapshotItemMetadata(i)), true)
  })

  test('charges.value changé → false', () => {
    const i        = item()
    const snapshot = snapshotItemMetadata(i)
    const altered  = item({ system: { charges: { max: 10, value: 3 }, quantity: { current: 2 } } })
    assert.equal(assertMetadataIntegrity(altered, snapshot), false)
  })

  test('charges.max changé → false', () => {
    const i        = item()
    const snapshot = snapshotItemMetadata(i)
    const altered  = item({ system: { charges: { max: 5, value: 7 }, quantity: { current: 2 } } })
    assert.equal(assertMetadataIntegrity(altered, snapshot), false)
  })

  test('quantity changée → false', () => {
    const i        = item()
    const snapshot = snapshotItemMetadata(i)
    const altered  = item({ system: { charges: { max: 10, value: 7 }, quantity: { current: 99 } } })
    assert.equal(assertMetadataIntegrity(altered, snapshot), false)
  })

  test('effets changés → false', () => {
    const i        = item()
    const snapshot = snapshotItemMetadata(i)
    const altered  = item({ effects: [{ name: 'Effet A' }] })
    assert.equal(assertMetadataIntegrity(altered, snapshot), false)
  })

  test('objet null → false', () => {
    assert.equal(assertMetadataIntegrity(null, snapshotItemMetadata(item())), false)
  })

  test('snapshot null → false', () => {
    assert.equal(assertMetadataIntegrity(item(), null), false)
  })
})

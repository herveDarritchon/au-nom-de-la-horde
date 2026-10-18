import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  isPopulatedContainer,
  extractContainerContents,
  validateContainerTransfer,
} from './containers.mjs'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const emptyContainer = (overrides = {}) => ({
  _id: 'container-1',
  type: 'container',
  system: { contents: [], ...overrides.system },
  ...overrides,
})

const populatedContainer = (uuids = ['Item.abc123', 'Item.def456'], overrides = {}) => ({
  _id: 'container-2',
  type: 'container',
  system: { contents: [...uuids], ...overrides.system },
  ...overrides,
})

const actor = () => ({ _id: 'actor-1', name: 'Héros' })

// ─── isPopulatedContainer ────────────────────────────────────────────────────

describe('isPopulatedContainer', () => {
  test('conteneur avec 2 UUIDs → true', () => {
    assert.ok(isPopulatedContainer(populatedContainer()))
  })

  test('conteneur vide → false', () => {
    assert.ok(!isPopulatedContainer(emptyContainer()))
  })

  test('type equipment → false', () => {
    assert.ok(!isPopulatedContainer({ type: 'equipment', system: { contents: ['Item.abc'] } }))
  })

  test('item null → false', () => {
    assert.ok(!isPopulatedContainer(null))
  })

  test('contents absent → false', () => {
    assert.ok(!isPopulatedContainer({ type: 'container', system: {} }))
  })
})

// ─── extractContainerContents ─────────────────────────────────────────────────

describe('extractContainerContents', () => {
  test('retourne copie du tableau UUIDs', () => {
    const uuids = ['Item.abc123', 'Item.def456']
    const result = extractContainerContents(populatedContainer(uuids))
    assert.deepEqual(result, uuids)
  })

  test('copie défensive — mutation du résultat ne touche pas la source', () => {
    const container = populatedContainer(['Item.abc123'])
    const result = extractContainerContents(container)
    result.push('Item.extra')
    assert.equal(container.system.contents.length, 1)
  })

  test('conteneur vide → []', () => {
    assert.deepEqual(extractContainerContents(emptyContainer()), [])
  })

  test('type non-container → []', () => {
    assert.deepEqual(extractContainerContents({ type: 'equipment', system: { contents: ['Item.abc'] } }), [])
  })

  test('item null → []', () => {
    assert.deepEqual(extractContainerContents(null), [])
  })

  test('contents absent → []', () => {
    assert.deepEqual(extractContainerContents({ type: 'container', system: {} }), [])
  })
})

// ─── validateContainerTransfer ───────────────────────────────────────────────

describe('validateContainerTransfer', () => {
  test('conteneur valide + acteur → ok: true', () => {
    const result = validateContainerTransfer(populatedContainer(), actor())
    assert.deepEqual(result, { ok: true, reason: null })
  })

  // A19 — conteneur avec contenu : transfert valide si acteur présent
  test('A19 — conteneur peuplé + acteur → ok: true', () => {
    const result = validateContainerTransfer(populatedContainer(['Item.uuid1', 'Item.uuid2']), actor())
    assert.deepEqual(result, { ok: true, reason: null })
  })

  test('item null → not-container', () => {
    const result = validateContainerTransfer(null, actor())
    assert.deepEqual(result, { ok: false, reason: 'not-container' })
  })

  test('type equipment → not-container', () => {
    const result = validateContainerTransfer({ type: 'equipment', system: {} }, actor())
    assert.deepEqual(result, { ok: false, reason: 'not-container' })
  })

  test('acteur null → no-target-actor', () => {
    const result = validateContainerTransfer(populatedContainer(), null)
    assert.deepEqual(result, { ok: false, reason: 'no-target-actor' })
  })

  // conteneur vide : le transfert reste valide (rien à inclure)
  test('conteneur vide + acteur → ok: true (transfert vide autorisé)', () => {
    const result = validateContainerTransfer(emptyContainer(), actor())
    assert.deepEqual(result, { ok: true, reason: null })
  })
})
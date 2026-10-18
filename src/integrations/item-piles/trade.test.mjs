import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { buildTradeLogEntry, appendTradeLog } from './trade.mjs'

const traderData = (overrides = {}) => ({
  user: 'user-1',
  actor: 'Actor.aaa',
  items: [{ uuid: 'Item.a' }],
  currencies: [{ primary: true, amount: 10 }],
  itemCurrencies: [],
  accepted: true,
  ...overrides,
})

// ── buildTradeLogEntry ────────────────────────────────────────────────────────

describe('buildTradeLogEntry', () => {
  test('construit une entrée à partir des arguments réels du hook', () => {
    const entry = buildTradeLogEntry({
      tradeId: 'trade-1',
      instigator: 'user-1',
      leftTraderData: traderData({ user: 'user-1', actor: 'Actor.a' }),
      rightTraderData: traderData({ user: 'user-2', actor: 'Actor.b', accepted: false }),
      ts: 4242,
    })
    assert.equal(entry.ts, 4242)
    assert.equal(entry.tradeId, 'trade-1')
    assert.equal(entry.instigator, 'user-1')
    assert.equal(entry.left.user, 'user-1')
    assert.equal(entry.left.actor, 'Actor.a')
    assert.equal(entry.left.items, 1)
    assert.equal(entry.left.currencies, 1)
    assert.equal(entry.left.accepted, true)
    assert.equal(entry.right.user, 'user-2')
    assert.equal(entry.right.accepted, false)
  })

  test('compte les items/currencies/itemCurrencies, 0 si absents', () => {
    const entry = buildTradeLogEntry({
      tradeId: 't',
      leftTraderData: { user: 'u', actor: 'a' },
      rightTraderData: { user: 'u2', actor: 'b' },
    })
    assert.equal(entry.left.items, 0)
    assert.equal(entry.left.currencies, 0)
    assert.equal(entry.left.itemCurrencies, 0)
    assert.equal(entry.left.accepted, false)
  })

  test('ts par défaut = maintenant', () => {
    const before = Date.now()
    const entry  = buildTradeLogEntry({ tradeId: 't', leftTraderData: {}, rightTraderData: {} })
    assert.ok(entry.ts >= before)
  })

  test('tradeId manquant → null', () => {
    assert.equal(buildTradeLogEntry({ leftTraderData: {}, rightTraderData: {} }), null)
  })

  test('un côté manquant → null', () => {
    assert.equal(buildTradeLogEntry({ tradeId: 't', leftTraderData: {} }), null)
  })

  test('argument vide → null', () => {
    assert.equal(buildTradeLogEntry(), null)
    assert.equal(buildTradeLogEntry({}), null)
  })
})

// ── appendTradeLog ────────────────────────────────────────────────────────────

describe('appendTradeLog', () => {
  const entry = (n = 1) => ({ ts: 1000 + n, tradeId: `trade-${n}` })

  test('ajoute une entrée à un journal vide', () => {
    const log = appendTradeLog([], entry(1))
    assert.equal(log.length, 1)
    assert.deepEqual(log[0], entry(1))
  })

  test('ajoute une entrée à un journal existant', () => {
    const log = appendTradeLog([entry(1)], entry(2))
    assert.deepEqual(log.map((e) => e.tradeId), ['trade-1', 'trade-2'])
  })

  test('immutable — original inchangé', () => {
    const original = [entry(1)]
    appendTradeLog(original, entry(2))
    assert.equal(original.length, 1)
  })

  test('history undefined → traité comme vide', () => {
    assert.equal(appendTradeLog(undefined, entry(1)).length, 1)
  })

  test('entry nulle → history inchangée', () => {
    const original = [entry(1)]
    assert.deepEqual(appendTradeLog(original, null), original)
  })

  test('tronque à 100 entrées FIFO (les plus récentes conservées)', () => {
    const full = Array.from({ length: 100 }, (_, i) => entry(i))
    const log  = appendTradeLog(full, entry(100))
    assert.equal(log.length, 100)
    assert.equal(log[log.length - 1].tradeId, 'trade-100')
    assert.equal(log[0].tradeId, 'trade-1')
  })
})

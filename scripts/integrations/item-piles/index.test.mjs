import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

function setGlobals({ systemId = 'co2', moduleActive = true, hasApi = true } = {}) {
  const calls = []
  globalThis.Hooks = {
    once: () => {}, // no-op : le handler est capturé ci-dessous à l'import
  }
  globalThis.game = {
    system: { id: systemId, version: '2.3.12' },
    modules: new Map([['item-piles', { active: moduleActive, version: '3.3.4' }]]),
    itempiles: hasApi
      ? { API: { addSystemIntegration: async (data, version) => calls.push({ data, version }) } }
      : {},
    user: { isGM: true },
  }
  return calls
}

// Capture du handler branché par `Hooks.once('item-piles-ready', ...)` à l'import du module.
let hookedHandler = null
let hookedName = null
globalThis.Hooks = {
  once: (name, handler) => {
    hookedName = name
    hookedHandler = handler
  },
}
globalThis.game = { system: { id: 'co2' }, modules: new Map(), user: { isGM: false } }
await import('./index.mjs')

describe('enregistrement Item Piles × COF2', () => {
  test('branche le hook item-piles-ready', () => {
    assert.equal(hookedName, 'item-piles-ready')
    assert.equal(typeof hookedHandler, 'function')
  })

  test('système co2 + API disponible → addSystemIntegration appelé une fois', async () => {
    const calls = setGlobals({ systemId: 'co2', moduleActive: true, hasApi: true })
    const ok = await hookedHandler()
    assert.equal(ok, true)
    assert.equal(calls.length, 1, 'addSystemIntegration doit être appelé une seule fois par invocation')
    assert.equal(calls[0].version, 'latest')
    assert.equal(calls[0].data.VERSION, '1')
  })

  test('système non-co2 → aucun appel, pas d\'erreur', async () => {
    const calls = setGlobals({ systemId: 'dnd5e', moduleActive: true, hasApi: true })
    const ok = await hookedHandler()
    assert.equal(ok, false)
    assert.equal(calls.length, 0)
  })

  test('Item Piles absent/désactivé → dégradation gracieuse', async () => {
    const calls = setGlobals({ systemId: 'co2', moduleActive: false, hasApi: true })
    const ok = await hookedHandler()
    assert.equal(ok, false)
    assert.equal(calls.length, 0)
  })

  test('API.addSystemIntegration manquante → avertissement, pas de throw', async () => {
    setGlobals({ systemId: 'co2', moduleActive: true, hasApi: false })
    const ok = await hookedHandler()
    assert.equal(ok, false)
  })

  test('addSystemIntegration qui lève → erreur capturée, pas de rethrow', async () => {
    globalThis.game = {
      system: { id: 'co2', version: '2.3.12' },
      modules: new Map([['item-piles', { active: true, version: '3.3.4' }]]),
      itempiles: { API: { addSystemIntegration: async () => { throw new Error('config invalide') } } },
      user: { isGM: true },
    }
    const ok = await hookedHandler()
    assert.equal(ok, false)
  })
})

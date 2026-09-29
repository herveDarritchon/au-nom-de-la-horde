import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { registerSimpleCalendarIntegration, _resetDaySnapshot } from './SimpleCalendarIntegration.mjs'
import {
  MODULE_ID,
  WEATHER_STATES_SETTING,
  WEATHER_ZONE_CONFIGS_SETTING,
  SIMPLE_CALENDAR_INTEGRATION_SETTING,
  SIMPLE_CALENDAR_AUTO_PUBLISH_SETTING,
} from '../services/WeatherSettings.mjs'

// Nom réel du hook SC Reborn (SimpleCalendar.Hooks.DateTimeChange) : les tests
// utilisent un alias local pour ne pas dépendre du global en direct.
const DATE_TIME_CHANGE = 'sc:dateTimeChange'

// Forme réelle du payload SC Reborn :
//   data.diff  = changeInSeconds (Number, > 0 = forward)
//   data.date  = { year, month, day, hour, minute, seconds, … }
function makeScPayload(diffSeconds, date) {
  return { diff: diffSeconds, date: { year: 1, month: 1, day: 1, hour: 0, minute: 0, seconds: 0, ...date } }
}
const ONE_DAY_SEC  = 86400
const ONE_HOUR_SEC = 3600

// ── helpers ──────────────────────────────────────────────────────────────────

function makeHooksMock() {
  const registered = {}
  const hooks = {
    once(name, fn) {
      registered[name] = registered[name] ?? []
      registered[name].push(fn)
    },
    on(name, fn) {
      registered[name] = registered[name] ?? []
      registered[name].push(fn)
    },
    // Résout les handlers asynchrones : sans cela, les assertions sur les
    // effets d'un handler `async` s'exécuteraient avant qu'il ait fini.
    async trigger(name, ...args) {
      await Promise.all((registered[name] ?? []).map(fn => fn(...args)))
    },
    countFor(name) { return (registered[name] ?? []).length },
  }
  return { hooks, registered }
}

function makeSettingStore(overrides = {}) {
  return {
    [WEATHER_ZONE_CONFIGS_SETTING]: {},
    [WEATHER_STATES_SETTING]: {},
    [SIMPLE_CALENDAR_INTEGRATION_SETTING]: true,
    [SIMPLE_CALENDAR_AUTO_PUBLISH_SETTING]: false,
    ...overrides,
  }
}

/**
 * @param {object} store    magasin de settings
 * @param {object} options  { simpleCalendarActive, stateSetCalls, statesHistory }
 */
function makeGame(store, {
  simpleCalendarActive = true,
  stateSetCalls = [],
  statesHistory = [],
} = {}) {
  return {
    modules: {
      // Identifiant réel du module : 'foundryvtt-simple-calendar-reborn'
      get: id => id === 'foundryvtt-simple-calendar-reborn' ? { active: simpleCalendarActive } : undefined,
    },
    settings: {
      get(_scope, key) { return store[key] },
      async set(_scope, key, value) {
        if (key === WEATHER_STATES_SETTING) {
          const before = store[key] ?? {}
          statesHistory.push({ ...value })
          for (const zoneId of new Set([...Object.keys(before), ...Object.keys(value)])) {
            if (before[zoneId] !== value[zoneId]) stateSetCalls.push(zoneId)
          }
        }
        store[key] = value
      },
      register() {},
    },
    ui: { notifications: { warn() {}, info() {} } },
  }
}

function mockFoundryChat() {
  const rendered = []
  global.foundry = {
    applications: {
      handlebars: {
        async renderTemplate(path, context) {
          rendered.push({ path, context })
          return `<rendered ${path}>`
        },
      },
    },
  }
  global.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 5 } }
  return rendered
}

const ACTIVE_ZONE   = { id: 'durotar', biome: 'arid', season: 'summer', weather: 'active' }
const OTHER_ZONE    = { id: 'elwynn', biome: 'temperatePlain', season: 'spring', weather: 'active' }
const DISABLED_ZONE = { id: 'aerie', biome: 'mountain', season: 'winter', weather: 'disabled' }

// ── enregistrement conditionnel ──────────────────────────────────────────────

describe('SimpleCalendarIntegration — enregistrement conditionnel', () => {
  let originalGame, originalHooks, originalSimpleCalendar, originalWarn
  let warnings

  beforeEach(() => {
    _resetDaySnapshot()
    originalGame           = global.game
    originalHooks          = global.Hooks
    originalSimpleCalendar = global.SimpleCalendar
    originalWarn           = console.warn
    warnings = []
    console.warn = (...args) => warnings.push(args.join(' '))
    global.SimpleCalendar = { Hooks: { DateTimeChange: DATE_TIME_CHANGE } }
  })

  afterEach(() => {
    global.game            = originalGame
    global.Hooks           = originalHooks
    global.SimpleCalendar  = originalSimpleCalendar
    console.warn           = originalWarn
  })

  test('Simple Calendar absent → aucun hook enregistré', async () => {
    const { hooks } = makeHooksMock()
    global.Hooks = hooks
    global.game = makeGame(makeSettingStore(), { simpleCalendarActive: false })

    registerSimpleCalendarIntegration()
    await hooks.trigger('ready')

    assert.equal(hooks.countFor(DATE_TIME_CHANGE), 0)
  })

  test('setting intégration off → aucun hook enregistré', async () => {
    const { hooks } = makeHooksMock()
    global.Hooks = hooks
    global.game = makeGame(makeSettingStore({ [SIMPLE_CALENDAR_INTEGRATION_SETTING]: false }))

    registerSimpleCalendarIntegration()
    await hooks.trigger('ready')

    assert.equal(hooks.countFor(DATE_TIME_CHANGE), 0)
  })

  test('module actif + setting on → hook enregistré', async () => {
    const { hooks } = makeHooksMock()
    global.Hooks = hooks
    global.game = makeGame(makeSettingStore())

    registerSimpleCalendarIntegration()
    await hooks.trigger('ready')

    assert.equal(hooks.countFor(DATE_TIME_CHANGE), 1)
  })

  test('module actif mais global SimpleCalendar absent → avertissement, aucun hook, pas de crash', async () => {
    const { hooks } = makeHooksMock()
    global.Hooks = hooks
    delete global.SimpleCalendar
    global.game = makeGame(makeSettingStore())

    registerSimpleCalendarIntegration()
    await hooks.trigger('ready')

    assert.equal(hooks.countFor(DATE_TIME_CHANGE), 0)
    assert.equal(warnings.length, 1, 'Un avertissement aurait dû être émis')
    assert.match(warnings[0], /DateTimeChange/)
  })
})

// ── avance des zones ─────────────────────────────────────────────────────────

describe('SimpleCalendarIntegration — avance des zones', () => {
  let originalGame, originalHooks, originalSimpleCalendar, originalFoundry, originalConst
  let stateSetCalls, statesHistory

  beforeEach(() => {
    _resetDaySnapshot()
    originalGame           = global.game
    originalHooks          = global.Hooks
    originalSimpleCalendar = global.SimpleCalendar
    originalFoundry        = global.foundry
    originalConst          = global.CONST

    global.SimpleCalendar = { Hooks: { DateTimeChange: DATE_TIME_CHANGE } }
    stateSetCalls = []
    statesHistory = []
    mockFoundryChat()
  })

  afterEach(() => {
    global.game           = originalGame
    global.Hooks          = originalHooks
    global.SimpleCalendar = originalSimpleCalendar
    global.foundry        = originalFoundry
    global.CONST          = originalConst
  })

  async function setup(zoneConfigs, { autoPublish = false } = {}) {
    const store = makeSettingStore({
      [WEATHER_ZONE_CONFIGS_SETTING]: zoneConfigs,
      [SIMPLE_CALENDAR_AUTO_PUBLISH_SETTING]: autoPublish,
    })
    const { hooks } = makeHooksMock()
    global.Hooks = hooks
    global.game = makeGame(store, { stateSetCalls, statesHistory })
    registerSimpleCalendarIntegration()
    await hooks.trigger('ready')
    // Prime : le premier événement calibre le snapshot sans avancer.
    // Les tests peuvent ensuite déclencher des avances sur un jour différent.
    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_HOUR_SEC, { day: 1 }))
    stateSetCalls.length = 0  // reset pour ne pas polluer les assertions suivantes
    statesHistory.length = 0
    return hooks
  }

  test('toutes les zones actives sont avancées', async () => {
    const hooks = await setup({ durotar: ACTIVE_ZONE, elwynn: OTHER_ZONE })

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_DAY_SEC, { day: 2 }))

    assert.deepEqual(stateSetCalls.sort(), ['durotar', 'elwynn'])
  })

  test('chaque zone avancée reçoit un état complet dérivé du jour précédent', async () => {
    const hooks = await setup({ durotar: ACTIVE_ZONE })

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_DAY_SEC, { day: 2 }))
    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_DAY_SEC, { day: 3 }))

    assert.equal(statesHistory.length, 2)
    const [day1, day2] = statesHistory.map(map => map.durotar)
    for (const state of [day1, day2]) {
      assert.equal(state.zoneId, 'durotar')
      assert.equal(typeof state.regime, 'number')
      assert.ok(['clear', 'partly-cloudy', 'overcast', 'cloudy', 'stormy'].includes(state.sky))
      assert.ok(Array.isArray(state.history))
    }
    assert.equal(day1.regimeAge, 1, 'Le premier jour n\'a pas d\'antécédent')
    assert.deepEqual(day2.history, [day1], 'L\'historique du jour 2 contient l\'état du jour 1')
  })

  test('regimeAge : incrémenté si le régime stagne, remis à 1 s\'il change', async () => {
    const previous = {
      regime: 2, regimeAge: 3,
      sky: 'overcast', precipitation: 'moderate', wind: 'moderate',
      temperature: 'cold', history: [],
    }
    let sawSame = false
    let sawChanged = false

    for (let trial = 0; trial < 60; trial++) {
      _resetDaySnapshot()
      const store = makeSettingStore({
        [WEATHER_ZONE_CONFIGS_SETTING]: { durotar: ACTIVE_ZONE },
        [WEATHER_STATES_SETTING]: { durotar: { ...previous } },
      })
      const localCalls = []
      const localHistory = []
      const { hooks } = makeHooksMock()
      global.Hooks = hooks
      global.game = makeGame(store, { stateSetCalls: localCalls, statesHistory: localHistory })
      registerSimpleCalendarIntegration()
      await hooks.trigger('ready')
      // Prime : calibre le snapshot sur le jour 1 avant l'avance réelle
      await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_HOUR_SEC, { day: 1 }))
      // Un jour unique par essai pour que la déduplication ne bloque pas les avances
      await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_DAY_SEC, { day: trial + 2 }))

      const next = store[WEATHER_STATES_SETTING].durotar
      if (next.regime === previous.regime) {
        assert.equal(next.regimeAge, previous.regimeAge + 1, 'Âge incrémenté sur un régime stagnant')
        sawSame = true
      } else {
        assert.equal(next.regimeAge, 1, 'Âge remis à 1 sur un changement de régime')
        sawChanged = true
      }
    }

    assert.ok(sawSame, 'La branche « régime stagnant » doit être exercée')
    assert.ok(sawChanged, 'La branche « changement de régime » doit être exercée')
  })

  test('zone disabled → non avancée, les autres le sont', async () => {
    const hooks = await setup({ durotar: ACTIVE_ZONE, aerie: DISABLED_ZONE })

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_DAY_SEC, { day: 2 }))

    assert.deepEqual(stateSetCalls, ['durotar'])
  })

  test('diff = 0 → aucune zone avancée', async () => {
    const hooks = await setup({ durotar: ACTIVE_ZONE })

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(0, { day: 1 }))

    assert.equal(stateSetCalls.length, 0)
  })

  test('diff négatif (recul) → aucune zone avancée', async () => {
    const hooks = await setup({ durotar: ACTIVE_ZONE })

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(-ONE_DAY_SEC, { day: 1 }))

    assert.equal(stateSetCalls.length, 0)
  })

  test('changement d\'heure sans changement de jour → aucune zone avancée', async () => {
    const hooks = await setup({ durotar: ACTIVE_ZONE })

    // Advance 2h but date.day stays the same
    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_HOUR_SEC * 2, { day: 1 }))

    assert.equal(stateSetCalls.length, 0)
  })

  test('même jour déclenché deux fois → une seule avance', async () => {
    const hooks = await setup({ durotar: ACTIVE_ZONE })

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_DAY_SEC, { day: 2 }))
    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_HOUR_SEC, { day: 2 }))

    assert.equal(stateSetCalls.length, 1, 'Le deuxième déclenchement sur le même jour ne doit pas avancer')
  })

  test('payload sans diff → aucune zone avancée, pas de crash', async () => {
    const hooks = await setup({ durotar: ACTIVE_ZONE })

    await hooks.trigger(DATE_TIME_CHANGE, {})
    await hooks.trigger(DATE_TIME_CHANGE, undefined)

    assert.equal(stateSetCalls.length, 0)
  })

  test('aucune zone configurée → aucun crash', async () => {
    const hooks = await setup({})

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_DAY_SEC, { day: 2 }))

    assert.equal(stateSetCalls.length, 0)
  })

  test('avance de plusieurs jours en un seul événement → une seule avance', async () => {
    const hooks = await setup({ durotar: ACTIVE_ZONE })

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(3 * ONE_DAY_SEC, { day: 4 }))

    assert.equal(stateSetCalls.length, 1, 'Un saut de 3 jours ne doit produire qu\'une avance')
  })
})

// ── publication automatique ──────────────────────────────────────────────────

describe('SimpleCalendarIntegration — publication chat automatique', () => {
  let originalGame, originalHooks, originalSimpleCalendar, originalFoundry, originalConst, originalChatMessage
  let stateSetCalls, chatCreateCalls, statesHistory, rendered

  beforeEach(() => {
    _resetDaySnapshot()
    originalGame           = global.game
    originalHooks          = global.Hooks
    originalSimpleCalendar = global.SimpleCalendar
    originalFoundry        = global.foundry
    originalConst          = global.CONST
    originalChatMessage    = global.ChatMessage

    global.SimpleCalendar = { Hooks: { DateTimeChange: DATE_TIME_CHANGE } }
    stateSetCalls  = []
    chatCreateCalls = []
    statesHistory  = []
    rendered = mockFoundryChat()
    global.ChatMessage = { async create(data) { chatCreateCalls.push(data) } }
  })

  afterEach(() => {
    global.game           = originalGame
    global.Hooks          = originalHooks
    global.SimpleCalendar = originalSimpleCalendar
    global.foundry        = originalFoundry
    global.CONST          = originalConst
    global.ChatMessage    = originalChatMessage
  })

  async function setup(autoPublish) {
    const store = makeSettingStore({
      [WEATHER_ZONE_CONFIGS_SETTING]: { durotar: ACTIVE_ZONE, elwynn: OTHER_ZONE },
      [SIMPLE_CALENDAR_AUTO_PUBLISH_SETTING]: autoPublish,
    })
    const { hooks } = makeHooksMock()
    global.Hooks = hooks
    global.game = makeGame(store, { stateSetCalls, statesHistory })
    registerSimpleCalendarIntegration()
    await hooks.trigger('ready')
    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_HOUR_SEC, { day: 1 }))
    stateSetCalls.length = 0
    statesHistory.length = 0
    chatCreateCalls.length = 0
    rendered.length = 0
    return hooks
  }

  test('publication off → aucun message publié', async () => {
    const hooks = await setup(false)

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_DAY_SEC, { day: 2 }))

    assert.equal(stateSetCalls.length, 2, 'Les zones doivent quand même avancer')
    assert.equal(chatCreateCalls.length, 0)
  })

  test('publication on → un message par zone avancée', async () => {
    const hooks = await setup(true)

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_DAY_SEC, { day: 2 }))

    assert.equal(chatCreateCalls.length, 2, 'Un message par zone avancée')
    for (const call of chatCreateCalls) {
      assert.equal(call.style, 5, 'Le style de message doit être celui du rapport météo')
      assert.ok(call.content.includes('weather-report.hbs'), 'Le contenu doit provenir du template météo')
    }
  })

  test('publication on → le contexte contient libellés, récit et événement', async () => {
    const hooks = await setup(true)

    await hooks.trigger(DATE_TIME_CHANGE, makeScPayload(ONE_DAY_SEC, { day: 2 }))

    assert.equal(rendered.length, 2)
    for (const { context } of rendered) {
      assert.ok(context.regimeLabel, 'regimeLabel attendu')
      assert.ok(context.regimeIcon, 'regimeIcon attendu')
      for (const key of ['sky', 'precipitation', 'wind', 'temperature']) {
        assert.ok(context.labels[key], `labels.${key} attendu`)
      }
      assert.ok(context.narrative.startsWith('Le ciel est'), 'narrative attendu')
      assert.ok('event' in context, 'event attendu (peut valoir null)')
    }
  })
})

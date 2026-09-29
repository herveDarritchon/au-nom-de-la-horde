import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  REGIME_LABELS,
  REGIME_ICONS,
  SKY_LABELS,
  PRECIP_LABELS,
  WIND_LABELS,
  TEMP_LABELS,
  buildNarrative,
  buildStateLabels,
  buildReportContext,
  publishWeatherReport,
} from './WeatherChatPublisher.mjs'

const STATE = {
  regime: 3, regimeAge: 2,
  sky: 'cloudy', precipitation: 'heavy', wind: 'strong', temperature: 'cold',
}

describe('WeatherChatPublisher — tables de libellés', () => {
  test('chaque table couvre toutes les valeurs du moteur', () => {
    const skies    = ['clear', 'partly-cloudy', 'overcast', 'cloudy', 'stormy']
    const precips  = ['none', 'light', 'moderate', 'heavy']
    const winds    = ['calm', 'light', 'moderate', 'strong', 'violent']
    const temps    = ['hot', 'warm', 'mild', 'cold', 'freezing']

    for (const v of skies)   assert.ok(SKY_LABELS[v],    `Sky manquant : ${v}`)
    for (const v of precips) assert.ok(PRECIP_LABELS[v], `Précipitation manquante : ${v}`)
    for (const v of winds)   assert.ok(WIND_LABELS[v],   `Vent manquant : ${v}`)
    for (const v of temps)   assert.ok(TEMP_LABELS[v],   `Température manquante : ${v}`)
  })

  test('cinq régimes ont un libellé et une icône', () => {
    assert.equal(REGIME_LABELS.length, 5)
    assert.equal(REGIME_ICONS.length, 5)
    for (let i = 0; i < 5; i++) {
      assert.ok(REGIME_LABELS[i], `Libellé manquant pour le régime ${i}`)
      assert.ok(REGIME_ICONS[i], `Icône manquante pour le régime ${i}`)
    }
  })
})

describe('WeatherChatPublisher — buildNarrative', () => {
  test('état absent → message explicite', () => {
    assert.equal(buildNarrative(null), 'Aucun état météo disponible pour cette zone.')
  })

  test('sans précipitation → « sans précipitations »', () => {
    const narrative = buildNarrative({ ...STATE, precipitation: 'none' })
    assert.match(narrative, /sans précipitations/)
    assert.doesNotMatch(narrative, /avec .* précipitations/)
  })

  test('avec précipitation → libellé traduit en minuscules', () => {
    const narrative = buildNarrative({ ...STATE, precipitation: 'moderate' })
    assert.match(narrative, /avec modérées précipitations/)
  })

  test('valeurs hors table → repli sur la valeur brute', () => {
    const narrative = buildNarrative({ sky: 'eclipse', wind: 'calm', temperature: 'mild', precipitation: 'none' })
    assert.match(narrative, /eclipse/)
  })
})

describe('WeatherChatPublisher — buildStateLabels', () => {
  test('état absent → quatre tirets', () => {
    assert.deepEqual(buildStateLabels(null), { sky: '—', precipitation: '—', wind: '—', temperature: '—' })
  })

  test('état présent → libellés traduits', () => {
    assert.deepEqual(buildStateLabels(STATE), {
      sky: 'Nuageux', precipitation: 'Fortes', wind: 'Fort', temperature: 'Froid',
    })
  })
})

describe('WeatherChatPublisher — buildReportContext', () => {
  test('état absent → régime 0 par défaut', () => {
    const ctx = buildReportContext(null)
    assert.equal(ctx.regimeLabel, REGIME_LABELS[0])
    assert.equal(ctx.regimeIcon, REGIME_ICONS[0])
    assert.equal(ctx.event, null)
  })

  test('régime hors bornes → tirets, comme le dialogue d\'origine', () => {
    const ctx = buildReportContext({ ...STATE, regime: 99 })
    assert.equal(ctx.regimeLabel, '—')
    assert.equal(ctx.regimeIcon, 'fa-cloud')
  })

  test('événement injecté → conservé tel quel', () => {
    const event = { id: 'fog-bank', text: 'texte', impactHint: 'indice' }
    assert.equal(buildReportContext(STATE, event).event, event)
  })

  test('sans événement → null, jamais undefined', () => {
    assert.equal(buildReportContext(STATE).event, null)
  })
})

describe('WeatherChatPublisher — publishWeatherReport', () => {
  let originalFoundry, originalConst, originalChatMessage
  let rendered, created

  beforeEach(() => {
    originalFoundry     = global.foundry
    originalConst       = global.CONST
    originalChatMessage = global.ChatMessage
    rendered = []
    created  = []

    global.foundry = {
      applications: {
        handlebars: {
          async renderTemplate(path, context) {
            rendered.push({ path, context })
            return '<contenu>'
          },
        },
      },
    }
    global.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 5 } }
    global.ChatMessage = {
      async create(data) { created.push(data) },
    }
  })

  afterEach(() => {
    global.foundry     = originalFoundry
    global.CONST       = originalConst
    global.ChatMessage = originalChatMessage
  })

  test('rend le template météo puis crée un message au bon style', async () => {
    await publishWeatherReport(STATE)

    assert.equal(rendered.length, 1)
    assert.match(rendered[0].path, /chat\/weather-report\.hbs$/)
    assert.deepEqual(created, [{ content: '<contenu>', style: 5 }])
  })

  test('le contexte rendu reprend l\'état et l\'événement fournis', async () => {
    const event = { id: 'blizzard', text: 'tempête', impactHint: 'congères' }
    await publishWeatherReport(STATE, event)

    const { context } = rendered[0]
    assert.equal(context.regimeLabel, REGIME_LABELS[STATE.regime])
    assert.deepEqual(context.labels, buildStateLabels(STATE))
    assert.equal(context.narrative, buildNarrative(STATE))
    assert.equal(context.event, event)
  })
})

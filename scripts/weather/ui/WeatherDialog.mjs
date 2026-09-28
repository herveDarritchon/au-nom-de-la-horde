import { WeatherStateService } from '../services/WeatherStateService.mjs'
import { ZoneWeatherService }  from '../services/ZoneWeatherService.mjs'
import { WeatherEngine }       from '../../../src/weather/engine/WeatherEngine.mjs'
import { TEMPLATE_ROOT }       from '../../../src/constants/templates.mjs'

const MODULE_ID = 'warbound-campaign-content'

const SKY_LABELS = {
  'clear':          'Dégagé',
  'partly-cloudy':  'Partiellement nuageux',
  'overcast':       'Couvert',
  'cloudy':         'Nuageux',
  'stormy':         'Orageux',
}

const PRECIP_LABELS = {
  none:     'Aucune',
  light:    'Légères',
  moderate: 'Modérées',
  heavy:    'Fortes',
}

const WIND_LABELS = {
  calm:     'Calme',
  light:    'Léger',
  moderate: 'Modéré',
  strong:   'Fort',
  violent:  'Violent',
}

const TEMP_LABELS = {
  hot:      'Chaud',
  warm:     'Doux',
  mild:     'Tempéré',
  cold:     'Froid',
  freezing: 'Glacial',
}

const REGIME_LABELS = ['Clair', 'Variable', 'Couvert', 'Perturbé', 'Sévère']
const REGIME_ICONS  = ['fa-sun', 'fa-cloud-sun', 'fa-cloud', 'fa-cloud-showers-heavy', 'fa-bolt-lightning']

function buildNarrative(state) {
  if (!state) return 'Aucun état météo disponible pour cette zone.'
  const sky  = SKY_LABELS[state.sky]   ?? state.sky
  const wind = WIND_LABELS[state.wind] ?? state.wind
  const temp = TEMP_LABELS[state.temperature] ?? state.temperature
  const prec = state.precipitation === 'none'
    ? 'sans précipitations'
    : `avec ${(PRECIP_LABELS[state.precipitation] ?? state.precipitation).toLowerCase()} précipitations`
  return `Le ciel est ${sky.toLowerCase()}, ${prec}. Vent ${wind.toLowerCase()}, température ${temp.toLowerCase()}.`
}

export class WeatherDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    id: 'weather-dialog',
    classes: ['warbound', 'weather-dialog'],
    window: { title: 'Météo', icon: 'fa-solid fa-cloud-sun', resizable: false },
    position: { width: 420, height: 'auto' },
    actions: {
      nextDay:         WeatherDialog.#onNextDay,
      publishToChat:   WeatherDialog.#onPublishToChat,
      overrideWeather: WeatherDialog.#onOverrideWeather,
      ignoreEvent:     WeatherDialog.#onIgnoreEvent,
    },
  }

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/scripts/weather/ui/weather-dialog.hbs` },
  }

  #zoneId
  #lastEvent   = null
  #eventIgnored = false

  constructor(zoneId, options = {}) {
    super(options)
    this.#zoneId = zoneId
  }

  async _prepareContext(options) {
    const state  = WeatherStateService.getState(this.#zoneId)
    const regime = state?.regime ?? 0
    return {
      state,
      zoneId:        this.#zoneId,
      hasState:      state !== null,
      regimeLabel:   REGIME_LABELS[regime] ?? '—',
      regimeIcon:    REGIME_ICONS[regime]  ?? 'fa-cloud',
      regimeAge:     state?.regimeAge ?? 0,
      labels: {
        sky:           SKY_LABELS[state?.sky]              ?? state?.sky           ?? '—',
        precipitation: PRECIP_LABELS[state?.precipitation] ?? state?.precipitation ?? '—',
        wind:          WIND_LABELS[state?.wind]            ?? state?.wind          ?? '—',
        temperature:   TEMP_LABELS[state?.temperature]     ?? state?.temperature   ?? '—',
      },
      narrative:     buildNarrative(state),
      event:         this.#lastEvent,
      eventIgnored:  this.#eventIgnored,
    }
  }

  static async #onPublishToChat() {
    const ctx = await this._prepareContext({})
    if (!ctx.hasState) {
      ui.notifications.warn('[Météo] Aucun état météo à publier.')
      return
    }
    const content = await foundry.applications.handlebars.renderTemplate(
      `${TEMPLATE_ROOT}/chat/weather-report.hbs`,
      { regimeIcon: ctx.regimeIcon, regimeLabel: ctx.regimeLabel, labels: ctx.labels, narrative: ctx.narrative }
    )
    await ChatMessage.create({ content, style: CONST.CHAT_MESSAGE_STYLES.OTHER })
  }

  static async #onOverrideWeather() {
    const config = ZoneWeatherService.getZoneConfig(this.#zoneId)
    if (!config) {
      ui.notifications.warn(`[Météo] Aucune configuration pour la zone "${this.#zoneId}"`)
      return
    }
    const previous = WeatherStateService.getState(this.#zoneId)
    const next     = WeatherEngine.next({
      biome:           config.biome,
      season:          config.season,
      previousWeather: previous,
      history:         previous?.history ?? [],
    })
    this.#lastEvent    = next.event ?? null
    this.#eventIgnored = false
    await WeatherStateService.setState(this.#zoneId, {
      ...next,
      zoneId:  this.#zoneId,
      history: previous?.history ?? [],
    })
    this.render()
  }

  static async #onNextDay(event, target) {
    const config = ZoneWeatherService.getZoneConfig(this.#zoneId)
    if (!config) {
      ui.notifications.warn(`[Météo] Aucune configuration pour la zone "${this.#zoneId}"`)
      return
    }
    const previous   = WeatherStateService.getState(this.#zoneId)
    const next       = WeatherEngine.next({
      biome:           config.biome,
      season:          config.season,
      previousWeather: previous,
      history:         previous?.history ?? [],
    })
    this.#lastEvent    = next.event ?? null
    this.#eventIgnored = false
    const newHistory = [...(previous?.history ?? []), previous].filter(Boolean)
    await WeatherStateService.setState(this.#zoneId, {
      ...next,
      zoneId:  this.#zoneId,
      history: newHistory,
    })
    this.render()
  }

  static #onIgnoreEvent() {
    this.#eventIgnored = true
    this.render()
  }
}

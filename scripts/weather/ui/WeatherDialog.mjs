import { WeatherStateService } from '../services/WeatherStateService.mjs'
import { ZoneWeatherService }  from '../services/ZoneWeatherService.mjs'
import { WeatherEngine }       from '../../../src/weather/engine/WeatherEngine.mjs'
import {
  REGIME_LABELS,
  REGIME_ICONS,
  buildNarrative,
  buildStateLabels,
  publishWeatherReport,
} from '../services/WeatherChatPublisher.mjs'

const MODULE_ID = 'warbound-campaign-content'

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
      labels:        buildStateLabels(state),
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
    await publishWeatherReport(ctx.state, ctx.event)
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

import { WeatherStateService } from '../services/WeatherStateService.mjs'
import { ZoneWeatherService }  from '../services/ZoneWeatherService.mjs'
import { WeatherEngine }       from '../../../src/weather/engine/WeatherEngine.mjs'

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

export class WeatherDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'weather-dialog',
    classes: ['warbound', 'weather-dialog'],
    window: { title: 'Météo', icon: 'fa-solid fa-cloud-sun', resizable: false },
    position: { width: 420, height: 'auto' },
    actions: { nextDay: WeatherDialog.#onNextDay },
  }

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/scripts/weather/ui/weather-dialog.hbs` },
  }

  #zoneId

  constructor(zoneId, options = {}) {
    super(options)
    this.#zoneId = zoneId
  }

  async _prepareContext(options) {
    const state  = WeatherStateService.getState(this.#zoneId)
    const regime = state?.regime ?? 0
    return {
      state,
      zoneId:      this.#zoneId,
      hasState:    state !== null,
      regimeLabel: REGIME_LABELS[regime] ?? '—',
      regimeIcon:  REGIME_ICONS[regime]  ?? 'fa-cloud',
      regimeAge:   state?.regimeAge ?? 0,
      labels: {
        sky:           SKY_LABELS[state?.sky]              ?? state?.sky           ?? '—',
        precipitation: PRECIP_LABELS[state?.precipitation] ?? state?.precipitation ?? '—',
        wind:          WIND_LABELS[state?.wind]            ?? state?.wind          ?? '—',
        temperature:   TEMP_LABELS[state?.temperature]     ?? state?.temperature   ?? '—',
      },
      narrative: buildNarrative(state),
    }
  }

  static async #onNextDay(event, target) {
    const config = ZoneWeatherService.getZoneConfig(this.#zoneId)
    if (!config) {
      ui.notifications.warn(`[Météo] Aucune configuration pour la zone "${this.#zoneId}"`)
      return
    }
    const previous  = WeatherStateService.getState(this.#zoneId)
    const next      = WeatherEngine.next({
      biome:           config.biome,
      season:          config.season,
      previousWeather: previous,
      history:         previous?.history ?? [],
    })
    const newHistory = [...(previous?.history ?? []), previous].filter(Boolean)
    await WeatherStateService.setState(this.#zoneId, {
      ...next,
      zoneId:  this.#zoneId,
      history: newHistory,
    })
    this.render()
  }
}

import { WeatherEngine }       from '../../../src/weather/engine/WeatherEngine.mjs'
import { WeatherStateService } from '../services/WeatherStateService.mjs'
import { ZoneWeatherService }  from '../services/ZoneWeatherService.mjs'
import { publishWeatherReport } from '../services/WeatherChatPublisher.mjs'
import {
  MODULE_ID,
  SIMPLE_CALENDAR_INTEGRATION_SETTING,
  SIMPLE_CALENDAR_AUTO_PUBLISH_SETTING,
} from '../services/WeatherSettings.mjs'

// L'identifiant du module est 'foundryvtt-simple-calendar-reborn', pas 'simple-calendar'.
const SIMPLE_CALENDAR_MODULE_ID = 'foundryvtt-simple-calendar-reborn'

// data.diff est un nombre de secondes, pas un objet { day } : on retient le dernier
// jour calendaire traité pour ignorer les simples avances d'heure.
let _previousDayKey = null

// Exporté pour l'isolation des tests uniquement — ne pas appeler en production.
export function _resetDaySnapshot() { _previousDayKey = null }

export function registerSimpleCalendarIntegration() {
  Hooks.once('ready', () => {
    if (!game.modules.get(SIMPLE_CALENDAR_MODULE_ID)?.active) return
    if (!game.settings.get(MODULE_ID, SIMPLE_CALENDAR_INTEGRATION_SETTING)) return

    const dateTimeChange = globalThis.SimpleCalendar?.Hooks?.DateTimeChange
    if (!dateTimeChange) {
      console.warn(`${MODULE_ID} | Simple Calendar est actif mais n'expose pas SimpleCalendar.Hooks.DateTimeChange`)
      return
    }

    // data.diff  = changeInSeconds (Number, >0 = avance, <0 = recul)
    // data.date  = { year, month, day, hour, minute, seconds, … }
    // On n'avance la météo que si le jour calendaire a réellement changé.
    //
    // Premier événement non-négatif : on initialise le snapshot sans avancer,
    // pour éviter qu'une simple correction d'heure en début de session ne
    // déclenche une avance météo (le snapshot est null au ready).
    Hooks.on(dateTimeChange, async (data) => {
      if (typeof data?.diff !== 'number' || data.diff <= 0) return

      const d = data.date
      if (!d) return

      const currentKey = `${d.year}-${d.month}-${d.day}`

      if (_previousDayKey === null) {
        _previousDayKey = currentKey
        return
      }

      if (_previousDayKey === currentKey) return
      _previousDayKey = currentKey

      for (const zoneId of ZoneWeatherService.getAllZoneIds()) {
        await advanceZoneWeather(zoneId)
      }
    })

    console.info(`${MODULE_ID} | Intégration Simple Calendar activée`)
  })
}

async function advanceZoneWeather(zoneId) {
  const config = ZoneWeatherService.getZoneConfig(zoneId)
  if (!config || config.weather === 'disabled') return

  const previous   = WeatherStateService.getState(zoneId)
  const next       = WeatherEngine.next({
    biome:           config.biome,
    season:          config.season,
    previousWeather: previous,
    history:         previous?.history ?? [],
  })
  const newHistory = [...(previous?.history ?? []), previous].filter(Boolean)
  await WeatherStateService.setState(zoneId, {
    ...next,
    zoneId,
    history: newHistory,
  })

  if (game.settings.get(MODULE_ID, SIMPLE_CALENDAR_AUTO_PUBLISH_SETTING)) {
    await publishWeatherReport(next, next.event ?? null)
  }
}

import { WeatherEngine }       from '../../../src/weather/engine/WeatherEngine.mjs'
import { WeatherStateService } from '../services/WeatherStateService.mjs'
import { ZoneWeatherService }  from '../services/ZoneWeatherService.mjs'
import { publishWeatherReport } from '../services/WeatherChatPublisher.mjs'
import {
  MODULE_ID,
  SIMPLE_CALENDAR_INTEGRATION_SETTING,
  SIMPLE_CALENDAR_AUTO_PUBLISH_SETTING,
} from '../services/WeatherSettings.mjs'

const SIMPLE_CALENDAR_MODULE_ID = 'simple-calendar'

export function registerSimpleCalendarIntegration() {
  Hooks.once('ready', () => {
    if (!game.modules.get(SIMPLE_CALENDAR_MODULE_ID)?.active) return
    if (!game.settings.get(MODULE_ID, SIMPLE_CALENDAR_INTEGRATION_SETTING)) return

    const dateTimeChange = globalThis.SimpleCalendar?.Hooks?.DateTimeChange
    if (!dateTimeChange) {
      console.warn(`${MODULE_ID} | Simple Calendar est actif mais n'expose pas SimpleCalendar.Hooks.DateTimeChange`)
      return
    }

    // Le hook part sur chaque changement de date ou d'heure : on ne retient
    // que les avances de journée réelles, sinon une correction d'heure ferait
    // sauter la météo.
    Hooks.on(dateTimeChange, async (data) => {
      if (!data?.diff?.day || data.diff.day <= 0) return
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

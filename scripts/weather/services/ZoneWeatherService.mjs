import { WeatherStateService } from './WeatherStateService.mjs'
import { MODULE_ID, WEATHER_ZONE_CONFIGS_SETTING } from './WeatherSettings.mjs'

export const ZoneWeatherService = {
  getZoneConfig(zoneId) {
    return game.settings.get(MODULE_ID, WEATHER_ZONE_CONFIGS_SETTING)?.[zoneId] ?? null
  },

  async setZoneConfig(zoneId, config) {
    const configs = game.settings.get(MODULE_ID, WEATHER_ZONE_CONFIGS_SETTING) ?? {}
    await game.settings.set(MODULE_ID, WEATHER_ZONE_CONFIGS_SETTING, {
      ...configs,
      [zoneId]: config,
    })
  },

  getAllZoneIds() {
    const configs = game.settings.get(MODULE_ID, WEATHER_ZONE_CONFIGS_SETTING) ?? {}
    return Object.keys(configs)
  },

  resolveWeatherState(zoneId) {
    const config = ZoneWeatherService.getZoneConfig(zoneId)
    if (!config) return null
    if (config.weather === 'disabled') return null
    if (config.weather === 'inheritOutside') {
      if (!config.parentZoneId) {
        console.warn(`[warbound-campaign-content] Zone '${zoneId}' has weather='inheritOutside' but no parentZoneId`)
        return null
      }
      return WeatherStateService.getState(config.parentZoneId)
    }
    return WeatherStateService.getState(zoneId)
  },
}

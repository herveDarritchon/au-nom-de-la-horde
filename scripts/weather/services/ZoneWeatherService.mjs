import { WeatherStateService } from './WeatherStateService.mjs'

const FLAG_SCOPE = 'warbound-campaign-content'
const zoneKey = (zoneId) => `weather.zone-config.${zoneId}`

export const ZoneWeatherService = {
  getZoneConfig(zoneId) {
    return game.world.getFlag(FLAG_SCOPE, zoneKey(zoneId)) ?? null
  },

  async setZoneConfig(zoneId, config) {
    await game.world.setFlag(FLAG_SCOPE, zoneKey(zoneId), config)
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

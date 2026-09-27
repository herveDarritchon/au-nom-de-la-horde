const FLAG_SCOPE = 'warbound-campaign-content'
const flagKey = (zoneId) => `weather.zones.${zoneId}`

export const WeatherStateService = {
  getState(zoneId) {
    return game.world.getFlag(FLAG_SCOPE, flagKey(zoneId)) ?? null
  },

  async setState(zoneId, state) {
    await game.world.setFlag(FLAG_SCOPE, flagKey(zoneId), state)
  },
}

import { MODULE_ID, WEATHER_STATES_SETTING } from './WeatherSettings.mjs'

export const WeatherStateService = {
  getState(zoneId) {
    return game.settings.get(MODULE_ID, WEATHER_STATES_SETTING)?.[zoneId] ?? null
  },

  async setState(zoneId, state) {
    const states = game.settings.get(MODULE_ID, WEATHER_STATES_SETTING) ?? {}
    await game.settings.set(MODULE_ID, WEATHER_STATES_SETTING, {
      ...states,
      [zoneId]: state,
    })
  },
}

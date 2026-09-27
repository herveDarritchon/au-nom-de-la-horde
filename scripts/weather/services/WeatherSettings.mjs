export const MODULE_ID = 'warbound-campaign-content'
export const WEATHER_STATES_SETTING = 'weatherStates'
export const WEATHER_ZONE_CONFIGS_SETTING = 'weatherZoneConfigs'

export function registerWeatherSettings() {
  game.settings.register(MODULE_ID, WEATHER_STATES_SETTING, {
    name: 'Warbound weather states',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  })

  game.settings.register(MODULE_ID, WEATHER_ZONE_CONFIGS_SETTING, {
    name: 'Warbound weather zone configurations',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  })
}

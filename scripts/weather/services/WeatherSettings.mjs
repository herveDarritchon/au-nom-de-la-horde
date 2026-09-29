export const MODULE_ID = 'warbound-campaign-content'
export const WEATHER_STATES_SETTING = 'weatherStates'
export const WEATHER_ZONE_CONFIGS_SETTING = 'weatherZoneConfigs'
export const SIMPLE_CALENDAR_INTEGRATION_SETTING = 'simpleCalendarIntegration'
export const SIMPLE_CALENDAR_AUTO_PUBLISH_SETTING = 'simpleCalendarAutoPublish'

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

  game.settings.register(MODULE_ID, SIMPLE_CALENDAR_INTEGRATION_SETTING, {
    name: 'Intégration Simple Calendar',
    hint: 'Avance automatiquement la météo de toutes les zones actives lors d\'un changement de date.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  })

  game.settings.register(MODULE_ID, SIMPLE_CALENDAR_AUTO_PUBLISH_SETTING, {
    name: 'Publication automatique lors de l\'avance',
    hint: 'Publie un message de chat météo pour chaque zone lors de l\'avance automatique.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  })
}

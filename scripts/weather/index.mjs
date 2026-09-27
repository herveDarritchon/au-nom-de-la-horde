import { WeatherDialog } from './ui/WeatherDialog.mjs'
import { ZoneWeatherService } from './services/ZoneWeatherService.mjs'
import { registerWeatherSettings } from './services/WeatherSettings.mjs'

const MODULE_ID      = 'warbound-campaign-content'
const DEFAULT_ZONE_ID = 'durotar'

let _weatherDialog = null

Hooks.once('init', () => {
  registerWeatherSettings()

  const module = game.modules.get(MODULE_ID)
  if (module) {
    module.api = {
      ...module.api,
      weather: {
        ...module.api?.weather,
        setZoneConfig: (zoneId, config) => ZoneWeatherService.setZoneConfig(zoneId, config),
        getZoneConfig: (zoneId) => ZoneWeatherService.getZoneConfig(zoneId),
        openWeatherDialog,
      },
    }
  }
})

function openWeatherDialog() {
  if (_weatherDialog?.rendered) {
    _weatherDialog.bringToFront()
    return
  }
  _weatherDialog = new WeatherDialog(DEFAULT_ZONE_ID)
  _weatherDialog.render(true)
}

Hooks.on('getSceneControlButtons', (controls) => {
  if (!game.user?.isGM) return

  controls.push({
    name:        'weather',
    title:       'Météo',
    icon:        'fa-solid fa-cloud-sun',
    layer:       'controls',
    activeTool:  'weather-open',
    tools: [
      {
        name:    'weather-open',
        title:   'Afficher la météo',
        icon:    'fa-solid fa-cloud-sun',
        button:  true,
        onClick: openWeatherDialog,
      },
    ],
  })

  console.info(`${MODULE_ID} | Contrôle météo enregistré`)
})

import { WeatherDialog } from './ui/WeatherDialog.mjs'
import { ZoneWeatherService } from './services/ZoneWeatherService.mjs'
import { registerWeatherSettings } from './services/WeatherSettings.mjs'
import { registerWeatherSceneControl } from './sceneControls.mjs'

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
  const added = registerWeatherSceneControl(controls, {
    isGM: game.user?.isGM,
    openWeatherDialog,
  })

  if (added) console.info(`${MODULE_ID} | Contrôle météo enregistré`)
})

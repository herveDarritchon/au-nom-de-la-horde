export function registerWeatherSceneControl(controls, { isGM, openWeatherDialog }) {
  if (!isGM) return false

  const order = Object.values(controls).reduce(
    (lastOrder, control) => Math.max(lastOrder, control.order ?? -1),
    -1,
  ) + 1

  controls.weather = {
    name: 'weather',
    title: 'Météo',
    icon: 'fa-solid fa-cloud-sun',
    order,
    visible: true,
    tools: {
      'weather-open': {
        name: 'weather-open',
        title: 'Afficher la météo',
        icon: 'fa-solid fa-cloud-sun',
        order: 0,
        button: true,
        visible: true,
        onChange: openWeatherDialog,
      },
    },
  }

  return true
}

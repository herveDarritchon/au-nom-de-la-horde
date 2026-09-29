import { TEMPLATE_ROOT } from '../../../src/constants/templates.mjs'

export const REGIME_LABELS = ['Clair', 'Variable', 'Couvert', 'Perturbé', 'Sévère']
export const REGIME_ICONS  = ['fa-sun', 'fa-cloud-sun', 'fa-cloud', 'fa-cloud-showers-heavy', 'fa-bolt-lightning']

export const SKY_LABELS = {
  'clear':         'Dégagé',
  'partly-cloudy': 'Partiellement nuageux',
  'overcast':      'Couvert',
  'cloudy':        'Nuageux',
  'stormy':        'Orageux',
}
export const PRECIP_LABELS = { none: 'Aucune', light: 'Légères', moderate: 'Modérées', heavy: 'Fortes' }
export const WIND_LABELS   = { calm: 'Calme', light: 'Léger', moderate: 'Modéré', strong: 'Fort', violent: 'Violent' }
export const TEMP_LABELS   = { hot: 'Chaud', warm: 'Doux', mild: 'Tempéré', cold: 'Froid', freezing: 'Glacial' }

export function buildNarrative(state) {
  if (!state) return 'Aucun état météo disponible pour cette zone.'
  const sky  = SKY_LABELS[state.sky]   ?? state.sky
  const wind = WIND_LABELS[state.wind] ?? state.wind
  const temp = TEMP_LABELS[state.temperature] ?? state.temperature
  const prec = state.precipitation === 'none'
    ? 'sans précipitations'
    : `avec ${(PRECIP_LABELS[state.precipitation] ?? state.precipitation).toLowerCase()} précipitations`
  return `Le ciel est ${sky.toLowerCase()}, ${prec}. Vent ${wind.toLowerCase()}, température ${temp.toLowerCase()}.`
}

export function buildStateLabels(state) {
  return {
    sky:           SKY_LABELS[state?.sky]              ?? state?.sky           ?? '—',
    precipitation: PRECIP_LABELS[state?.precipitation] ?? state?.precipitation ?? '—',
    wind:          WIND_LABELS[state?.wind]            ?? state?.wind          ?? '—',
    temperature:   TEMP_LABELS[state?.temperature]     ?? state?.temperature   ?? '—',
  }
}

/**
 * Construit le contexte du template weather-report.hbs.
 * `event` est injecté séparément car la boîte de dialogue Dispose d'un
 * événement en mémoire qui peut différer de celui persisté dans l'état.
 */
export function buildReportContext(state, event = null) {
  const regime = state?.regime ?? 0
  return {
    regimeIcon:  REGIME_ICONS[regime]  ?? 'fa-cloud',
    regimeLabel: REGIME_LABELS[regime] ?? '—',
    labels:      buildStateLabels(state),
    narrative:   buildNarrative(state),
    event:       event ?? null,
  }
}

export async function publishWeatherReport(state, event = null) {
  const content = await foundry.applications.handlebars.renderTemplate(
    `${TEMPLATE_ROOT}/chat/weather-report.hbs`,
    buildReportContext(state, event),
  )
  await ChatMessage.create({ content, style: CONST.CHAT_MESSAGE_STYLES.OTHER })
}

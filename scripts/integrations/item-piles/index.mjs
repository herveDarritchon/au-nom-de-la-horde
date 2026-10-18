import { buildItemPilesConfig, INTEGRATION_VERSION, INTEGRATION_TARGET_VERSION } from './config.mjs'
import { logDiagnostics } from './diagnostics.mjs'
import { registerTradeHooks } from './hooks-trade.mjs'

const MODULE_ID     = 'warbound-campaign-content'
const ITEM_PILES_ID = 'item-piles'
const SUPPORTED_SYSTEM_ID = 'co2'

/**
 * Enregistre le profil COF2 auprès d'Item Piles (contract v3.3.4).
 * Idempotence : `Hooks.once('item-piles-ready')` ci-dessous garantit un appel unique
 * par chargement de page, et chaque branche de garde sort sans effet de bord.
 * Exporté pour les tests d'intégration (les globals `game`/`Hooks` sont lus à l'exécution).
 */
export async function registerItemPilesIntegration() {
  if (game.system?.id !== SUPPORTED_SYSTEM_ID) return false
  if (!game.modules?.get(ITEM_PILES_ID)?.active) return false

  const api = game.itempiles?.API
  if (typeof api?.addSystemIntegration !== 'function') {
    console.warn(
      `${MODULE_ID} | item-piles-ready déclenché mais API.addSystemIntegration absent — version incompatible ?`
    )
    return false
  }

  try {
    await api.addSystemIntegration(buildItemPilesConfig(), INTEGRATION_TARGET_VERSION)
    console.info(
      `${MODULE_ID} | Intégration COF2 × Item Piles enregistrée (contrat v${INTEGRATION_VERSION})`
    )
  } catch (err) {
    console.error(`${MODULE_ID} | Échec addSystemIntegration :`, err)
    return false
  }

  logDiagnostics()
  registerTradeHooks()
  return true
}

Hooks.once('item-piles-ready', registerItemPilesIntegration)

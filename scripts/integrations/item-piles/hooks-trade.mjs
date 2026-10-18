/**
 * Hooks Foundry — échanges PJ↔PJ F08–F10 (Issue #116).
 *
 * Contrat vérifié (bundle Item Piles 3.3.4, préfixe `item-piles-`) :
 *   Hooks.callAll('item-piles-tradeComplete', instigator, leftTraderData, rightTraderData, tradeId)
 *   traderData = { user: userId, actor: uuid, items: [], currencies: [], itemCurrencies: [], accepted }
 *
 * `tradeComplete` est émis en `Hooks.callAll` : **non annulable**. Warbound observe donc
 * l'échange terminé et en tient un journal ; il ne peut ni le veto ni le modifier (les
 * garanties de validation, de sécurité et d'idempotence sont natives à Item Piles).
 *
 * Aucun hook de *pré*-validation PJ↔PJ n'existe dans Item Piles 3.3.4.
 */

import { buildTradeLogEntry, appendTradeLog } from '../../../src/integrations/item-piles/trade.mjs'

const MODULE_ID = 'warbound-campaign-content'
const WARBOUND_FLAG_SCOPE = 'warbound'
const TRADE_HISTORY_FLAG = 'tradeHistory'

export function registerTradeHooks() {
  Hooks.on('item-piles-tradeComplete', onTradeComplete)
}

/**
 * Écrit une entrée de journal d'échange sur chaque acteur participant possédé par
 * l'utilisateur courant. Les acteurs non possédés sont ignorés (permission Foundry).
 */
async function onTradeComplete(instigator, leftTraderData, rightTraderData, tradeId) {
  const entry = buildTradeLogEntry({ tradeId, instigator, leftTraderData, rightTraderData })
  if (!entry) return

  for (const data of [leftTraderData, rightTraderData]) {
    const actor = data?.actor ? globalThis.fromUuidSync?.(data.actor) : null
    if (!actor?.isOwner) continue

    const current = actor.flags?.[WARBOUND_FLAG_SCOPE]?.[TRADE_HISTORY_FLAG] ?? []
    try {
      await actor.setFlag(WARBOUND_FLAG_SCOPE, TRADE_HISTORY_FLAG, appendTradeLog(current, entry))
    } catch (err) {
      console.warn(`${MODULE_ID} | journal d'échange non écrit pour ${data.actor} :`, err)
    }
  }
}

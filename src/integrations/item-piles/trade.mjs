/**
 * Échange PJ↔PJ — F08–F10 (Issue #116).
 *
 * Item Piles 3.3.4 gère **nativement** l'échange PJ↔PJ : double validation, sécurité par
 * possession d'acteur, idempotence (`ongoingTrades` + transaction atomique) et gestion des
 * annulations (refus, expiration, déconnexion). Conformément au cadrage §5, Warbound ne
 * réimplémente **pas** cette logique.
 *
 * Ce module ne fournit qu'un **journal** des échanges observés, écrit depuis le hook
 * `item-piles-tradeComplete`. Contrat vérifié (bundle 3.3.4, préfixe `item-piles-`) :
 *
 *   Hooks.callAll('item-piles-tradeComplete', instigator, leftTraderData, rightTraderData, tradeId)
 *   traderData = { user: userId, actor: uuid, items: [], currencies: [], itemCurrencies: [], accepted: bool }
 *
 * Important : il n'existe **aucun** hook de *pré*-validation PJ↔PJ, et `tradeComplete` est
 * émis en `Hooks.callAll` (non annulable). Warbound ne peut donc ni veto ni modifier un
 * échange — il l'observe seulement (les garanties A15–A17/A20–A22 sont natives).
 */

const MAX_TRADE_HISTORY = 100

function countEntries(value) {
  return Array.isArray(value) ? value.length : 0
}

function summarizeSide(data) {
  return {
    user: data?.user ?? null,
    actor: data?.actor ?? null,
    items: countEntries(data?.items),
    currencies: countEntries(data?.currencies),
    itemCurrencies: countEntries(data?.itemCurrencies),
    accepted: data?.accepted === true,
  }
}

/**
 * Construit une entrée de journal à partir des arguments réels du hook
 * `item-piles-tradeComplete`. Retourne null si `tradeId` ou un côté manque.
 * ts est injectable pour les tests (défaut : Date.now()).
 */
export function buildTradeLogEntry({
  tradeId,
  instigator = null,
  leftTraderData = null,
  rightTraderData = null,
  ts = Date.now(),
} = {}) {
  if (!tradeId || !leftTraderData || !rightTraderData) return null
  return {
    ts,
    tradeId,
    instigator,
    left: summarizeSide(leftTraderData),
    right: summarizeSide(rightTraderData),
  }
}

/**
 * Ajoute une entrée au journal d'échange (immutable, FIFO tronqué à MAX_TRADE_HISTORY).
 * history non-tableau → traité comme vide. entry nulle → history inchangée.
 */
export function appendTradeLog(history, entry) {
  const base = Array.isArray(history) ? history : []
  if (!entry) return base
  const updated = [...base, entry]
  return updated.length > MAX_TRADE_HISTORY
    ? updated.slice(updated.length - MAX_TRADE_HISTORY)
    : updated
}

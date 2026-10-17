const MODULE_ID = 'warbound-campaign-content'

export function logDiagnostics() {
  if (!game.user?.isGM) return

  const itempiles = game.modules.get('item-piles')
  const co2       = game.system

  console.group(`${MODULE_ID} | Diagnostic Item Piles × COF2`)
  console.info(`  Item Piles : ${itempiles?.version ?? 'N/A'}`)
  console.info(`  COF2       : ${co2?.version ?? 'N/A'}`)
  console.info(`  Système    : ${co2?.id}`)
  console.groupEnd()
}

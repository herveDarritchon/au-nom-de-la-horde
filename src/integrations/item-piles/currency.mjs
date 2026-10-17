// Taux de conversion COF2 : 1 PO = 10 PA = 100 PC (cadrage §5.1, DÉCIDÉ P0 #112 — convention COF2 retenue).
// L'unité de référence (primary) est la pièce d'or (gp).
export const EXCHANGE_RATES = {
  gp: 1,      // PO — unité de référence
  sp: 0.1,    // PA — 10 PA = 1 PO
  cp: 0.01,   // PC — 100 PC = 1 PO
}

/**
 * Abréviations d'unité de prix observées dans COF2 (`system.price.unit`).
 * Le champ est un StringField libre (initial "pa") ; les contenus réels utilisent
 * les abréviations françaises "po"/"pa"/"pc". On accepte aussi les ids de devise
 * ("gp"/"sp"/"cp") par robustesse.
 */
export const PRICE_UNIT_ALIASES = {
  po: 'gp',
  pa: 'sp',
  pc: 'cp',
  gp: 'gp',
  sp: 'sp',
  cp: 'cp',
}

/**
 * Résout une unité de prix COF2 vers l'id de devise correspondant.
 * Retourne null si l'unité est inconnue ou invalide.
 */
export function resolveCurrencyId(unit) {
  if (typeof unit !== 'string') return null
  return PRICE_UNIT_ALIASES[unit.trim().toLowerCase()] ?? null
}

/**
 * Convertit un prix COF2 {value, unit} en montant PO (primary currency).
 * Retourne null si les données sont invalides.
 */
export function toPrimaryAmount({ value, unit } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  const currencyId = resolveCurrencyId(unit)
  if (currencyId === null) return null
  return value * EXCHANGE_RATES[currencyId]
}

/**
 * Convertit gp/sp/cp en nombre entier de PC (plus petite dénomination).
 * Utile pour valider les invariants financiers sans arrondi flottant.
 */
export function toLowestDenomination(gp = 0, sp = 0, cp = 0) {
  return Math.round(gp * 100 + sp * 10 + cp)
}

/**
 * Décompose un total en PC en {gp, sp, cp}.
 * Retourne null si le total est invalide (négatif, non entier).
 */
export function fromLowestDenomination(totalCp) {
  if (!Number.isInteger(totalCp) || totalCp < 0) return null
  const gp = Math.floor(totalCp / 100)
  const sp = Math.floor((totalCp % 100) / 10)
  const cp = totalCp % 10
  return { gp, sp, cp }
}

/**
 * Règles marchands COF2 — lecteurs des flags Item Piles 3.3.4.
 *
 * Cadrage §5 : Warbound ne réimplémente PAS la logique marchande ; Item Piles pilote
 * l'UI et le flux de transaction. Ce module n'est qu'une couche de lecture/validation
 * des flags réels d'Item Piles, pour raisonner et tester les règles métier COF2 sans
 * dépendre de Foundry. Aucune de ces fonctions n'est branchée sur un hook : elles
 * reflètent le contrat 3.3.4 documenté dans `docs/item-piles.md`.
 *
 * Flags réels (sous `flags['item-piles'].item.*`, cf. `CONSTANTS.FLAGS.ITEM`) :
 * - `notForSale` (boolean) — l'objet n'est pas proposé à la vente par le marchand.
 * - `cantBeSoldToMerchants` (boolean) — le joueur ne peut pas revendre l'objet à un marchand.
 * - `hidden` (boolean) — l'objet est masqué dans l'inventaire du marchand.
 * - `isService` (boolean) — service : paiement sans livraison d'Item.
 * - `infiniteQuantity` (string) — stock infini, tri-état `"default"` / `"yes"` / `"no"`.
 */

const ITEM_FLAGS_NAMESPACE = 'item-piles'

/** Lit un flag Item Piles d'objet, ou undefined s'il est absent. */
function getItemFlag(item, key) {
  return item?.flags?.[ITEM_FLAGS_NAMESPACE]?.item?.[key]
}

/**
 * Applique une majoration ou réduction à un prix de base (politique d'arrondi §6.2).
 * modifier : facteur multiplicateur (1.2 = +20 %, 0.9 = −10 %, 0 = gratuit).
 * Prix en PC entiers ; résultat arrondi à l'entier le plus proche, minimum 0.
 * Retourne null si les arguments sont invalides.
 */
export function applyMerchantMarkup(basePrice, modifier) {
  if (typeof basePrice !== 'number' || !Number.isFinite(basePrice) || basePrice < 0) return null
  if (typeof modifier !== 'number' || !Number.isFinite(modifier) || modifier < 0) return null
  return Math.max(0, Math.round(basePrice * modifier))
}

/**
 * Retourne true si l'objet peut être proposé à la vente (flag `notForSale` non positionné).
 * Un objet null est considéré non vendable (défense).
 */
export function isSaleAllowed(item) {
  if (!item) return false
  return getItemFlag(item, 'notForSale') !== true
}

/**
 * Retourne true si le joueur peut revendre l'objet à un marchand
 * (flag `cantBeSoldToMerchants` non positionné).
 */
export function canSellToMerchant(item) {
  if (!item) return false
  return getItemFlag(item, 'cantBeSoldToMerchants') !== true
}

/**
 * Retourne true si l'objet est masqué dans l'inventaire du marchand (flag `hidden`).
 */
export function isItemHidden(item) {
  if (!item) return true
  return getItemFlag(item, 'hidden') === true
}

/**
 * Retourne true si l'objet est un service (flag `isService`) : payé sans livraison d'Item.
 */
export function isService(item) {
  if (!item) return false
  return getItemFlag(item, 'isService') === true
}

/**
 * Résout le stock infini d'un objet (tri-état `infiniteQuantity`).
 * `"yes"` → true, `"no"` → false, `"default"` → valeur du marchand (`merchantDefault`).
 * Miroir de la résolution Item Piles 3.3.4.
 */
export function isInfiniteQuantity(item, merchantDefault = false) {
  return {
    default: merchantDefault === true,
    yes: true,
    no: false,
  }[getItemFlag(item, 'infiniteQuantity') ?? 'default']
}

/**
 * Retourne true si l'objet est accessible/achetable par un acteur :
 * visible, acteur présent, et proposé à la vente.
 * (Item Piles applique en plus la possession de l'acteur et l'ouverture du marchand.)
 */
export function isAccessible(item, actor) {
  if (isItemHidden(item)) return false
  if (!actor) return false
  return isSaleAllowed(item)
}

// ─── F12 — Paramétrage marchand COF2 ─────────────────────────────────────────
//
// Fonctions pures de classification COF2 pour l'affichage marchand (F12).
// Non branchées sur un hook : Item Piles reste maître du runtime.

// Types COF2 exposables dans un inventaire marchand avec leur clé i18n COF2.
const COF2_MERCHANT_CATEGORIES = {
  equipment: 'CO.ItemType.equipment',
  container: 'CO.ItemType.container',
}

/**
 * Retourne la clé i18n COF2 de la catégorie marchande pour un type d'item.
 * Retourne null pour les types non marchands (profile, feature, capacity, attack, path).
 */
export function getMerchantCategory(item) {
  if (!item) return null
  return COF2_MERCHANT_CATEGORIES[item.type] ?? null
}

/**
 * Retourne l'état de visibilité de l'item dans un inventaire marchand.
 * `visible: true` si ni caché ni interdit de vente.
 * `reason` précise le motif d'exclusion (`'hidden'` | `'not-for-sale'` | `'no-item'` | null).
 */
export function getItemVisibility(item) {
  if (!item) return { visible: false, reason: 'no-item' }
  if (isItemHidden(item)) return { visible: false, reason: 'hidden' }
  if (!isSaleAllowed(item)) return { visible: false, reason: 'not-for-sale' }
  return { visible: true, reason: null }
}

/**
 * Retourne les droits d'accès d'un acteur sur un item marchand.
 * `allowed: true` si l'item est visible et l'acteur présent.
 * `reason` précise le motif de refus (`'no-item'` | `'no-actor'` | `'hidden'` | `'not-for-sale'` | null).
 */
export function getItemPermissions(item, actor) {
  if (!item) return { allowed: false, reason: 'no-item' }
  if (!actor) return { allowed: false, reason: 'no-actor' }
  if (isItemHidden(item)) return { allowed: false, reason: 'hidden' }
  if (!isSaleAllowed(item)) return { allowed: false, reason: 'not-for-sale' }
  return { allowed: true, reason: null }
}

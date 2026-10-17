// Types COF2 non physiques — jamais transférables via Item Piles.
const NON_PHYSICAL_TYPES = new Set(['profile', 'feature', 'capacity', 'attack', 'path'])

// container exclu jusqu'à handler complet validé (P5 — #117).
const EXCLUDED_TYPES = new Set([...NON_PHYSICAL_TYPES, 'container'])

// Types physiques COF2 qui portent `system.quantity.current` — requis par `isItemStackable` d'Item Piles.
const QUANTITY_BEARING_TYPES = new Set(['equipment'])

/**
 * Chemins de similarité Item Piles (Array<string> — contract 3.3.4 strict, jamais une fonction).
 * Item Piles compare chaque chemin par égalité stricte pour décider si deux objets fusionnent.
 * On n'inclut PAS `system.charges.*` : les charges ne représentent jamais une quantité d'objets
 * (cadrage §4.2) et `null` vs `undefined` créerait des faux écarts.
 */
export const ITEM_SIMILARITY_PATHS = ['name', 'type', 'system.slug', 'system.rarity']

/**
 * Retourne true si l'objet COF2 peut être transféré via Item Piles.
 */
export function isPhysicalItem(item) {
  if (!item) return false
  return !EXCLUDED_TYPES.has(item.type)
}

/**
 * Retourne true si l'objet COF2 est empilable (par objet, pas par type).
 * Utilise system.properties.stackable — confirmé dans le diagnostic 16/10/2026.
 */
export function isStackable(item) {
  return item?.system?.properties?.stackable === true
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

/**
 * Retourne true si deux objets COF2 sont considérés comme identiques pour Item Piles.
 * Miroir pur de la comparaison par chemins de `ITEM_SIMILARITY_PATHS` (égalité stricte),
 * pour test sans Foundry. La décision d'empilement réelle est déléguée à Item Piles.
 */
export function areSimilar(a, b) {
  if (!isStackable(a) || !isStackable(b)) return false
  return ITEM_SIMILARITY_PATHS.every((path) => getPath(a, path) === getPath(b, path))
}

/**
 * Retourne true si l'objet COF2 transporte `system.quantity.current`.
 * Condition `isItemStackable` d'Item Piles pour qu'un type puisse s'empiler.
 */
export function hasQuantity(item) {
  return !!item && QUANTITY_BEARING_TYPES.has(item.type)
}

/**
 * Valide une quantité COF2 : entier >= 0, ne dépasse pas max si défini.
 * Retourne la quantité normalisée ou null si invalide.
 */
export function normalizeQuantity(qty, max) {
  if (typeof qty !== 'number' || !Number.isFinite(qty)) return null
  if (!Number.isInteger(qty) || qty < 0) return null
  if (max !== null && max !== undefined && qty > max) return null
  return qty
}

/**
 * Retourne une copie de l'objet avec le flag Item Piles `canStack` posé selon
 * `system.properties.stackable`. Nécessaire car `ITEM_SIMILARITIES` est un tableau
 * de chemins (pas une fonction) : seul un flag par objet permet d'empiler un
 * consommable tout en gardant une arme unique non fusionnée (F03).
 * Ne mute jamais l'objet source.
 */
export function applyStackingFlag(item) {
  if (!item || typeof item !== 'object') return item
  const flags = { ...(item.flags ?? {}) }
  const itemPiles = { ...(flags['item-piles'] ?? {}) }
  itemPiles.item = { ...(itemPiles.item ?? {}), canStack: isStackable(item) ? 'yes' : 'no' }
  flags['item-piles'] = itemPiles
  return { ...item, flags }
}

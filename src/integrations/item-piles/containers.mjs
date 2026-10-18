/**
 * Logique pure — Items COF2 de type `container`.
 *
 * `system.contents` = ArrayField(DocumentUUIDField) — liste d'UUIDs d'Items (modèle COF2 2.3.12,
 * `module/models/container.mjs`). La résolution des UUIDs (fromUuidSync) est déléguée aux
 * handlers Foundry dans `scripts/integrations/item-piles/config.mjs` qui seuls ont accès à l'API
 * Foundry. Ces fonctions restent pures et testables sans dépendance à Foundry.
 */

/**
 * Retourne true si l'item est un conteneur COF2 avec au moins un UUID dans `system.contents`.
 */
export function isPopulatedContainer(item) {
  return (
    item?.type === 'container' &&
    Array.isArray(item?.system?.contents) &&
    item.system.contents.length > 0
  )
}

/**
 * Retourne une copie défensive du tableau `system.contents` (UUIDs).
 * Retourne [] si l'item n'est pas un conteneur ou si `contents` est absent/vide.
 */
export function extractContainerContents(item) {
  if (!item || item.type !== 'container') return []
  return [...(item.system?.contents ?? [])]
}

/**
 * Valide un transfert de conteneur au niveau données pures (sans résoudre les UUIDs).
 * Retourne `{ok: true}` ou `{ok: false, reason: string}`.
 *
 * Raisons possibles :
 * - `'not-container'` : l'item n'est pas de type `container`
 * - `'no-target-actor'` : acteur cible absent
 */
export function validateContainerTransfer(container, targetActor) {
  if (!container || container.type !== 'container') return { ok: false, reason: 'not-container' }
  if (!targetActor) return { ok: false, reason: 'no-target-actor' }
  return { ok: true, reason: null }
}
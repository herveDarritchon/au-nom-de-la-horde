/**
 * Vault partagé — F13 (Issue #116).
 *
 * Item Piles 3.3.4 gère **nativement** la grille de vault, les droits et le journal.
 * Conformément au cadrage §5, Warbound ne réimplémente **pas** cette logique. Ce module
 * fournit :
 *   1. un constructeur du flag **réel** `vaultAccess` et des lecteurs de droits ;
 *   2. des utilitaires purs de préservation des métadonnées d'objet (charges/effets).
 *
 * Contrat vérifié (bundle 3.3.4) — flag d'acteur vault `flags['item-piles'].vaultAccess` :
 *
 *   vaultAccess = [
 *     { uuid, view, organize, items: { deposit, withdraw }, currencies: { deposit, withdraw } }
 *   ]
 *
 * Résolution native `getVaultAccess()` (bundle l. 36426) : ne retient que les entrées dont
 * `fromUuidSync(uuid)?.isOwner`, applique `view ?? true`, et exige un **destinataire**
 * (`hasRecipient`) pour dépôt/retrait. Réglages globaux associés : `restrictVaultAccess`
 * (bool) et `logVaultActions` / `vaultLogType` (journal natif).
 *
 * Important : il n'existe **aucun** hook vault dans Item Piles 3.3.4 — les droits sont
 * **data-driven**. Warbound configure le flag ; Item Piles l'applique.
 */

const RIGHTS = {
  view:               (access) => access.view ?? true,
  organize:           (access) => access.organize === true,
  depositItems:       (access) => access.items?.deposit === true,
  withdrawItems:      (access) => access.items?.withdraw === true,
  depositCurrencies:  (access) => access.currencies?.deposit === true,
  withdrawCurrencies: (access) => access.currencies?.withdraw === true,
}

/**
 * Construit une entrée de `vaultAccess` conforme au contrat 3.3.4 (defaults appliqués).
 * `view` par défaut true (comme Item Piles) ; les autres droits par défaut false.
 */
export function buildVaultAccessEntry({ uuid, view = true, organize = false, items = {}, currencies = {} } = {}) {
  return {
    uuid: uuid ?? '',
    view: view === true,
    organize: organize === true,
    items: {
      deposit: items?.deposit === true,
      withdraw: items?.withdraw === true,
    },
    currencies: {
      deposit: currencies?.deposit === true,
      withdraw: currencies?.withdraw === true,
    },
  }
}

/**
 * Retourne true si le tableau `vaultAccess` accorde `right` à `actorUuid`.
 * right ∈ { view, organize, depositItems, withdrawItems, depositCurrencies, withdrawCurrencies }.
 * Note : Item Piles ajoute la contrainte de possession (`uuid.isOwner`) et de destinataire.
 */
export function hasVaultRight(vaultAccess, actorUuid, right) {
  if (!Array.isArray(vaultAccess) || !actorUuid) return false
  const resolver = RIGHTS[right]
  if (!resolver) return false
  return vaultAccess.some((access) => access?.uuid === actorUuid && resolver(access) === true)
}

export function canView(vaultAccess, actorUuid)               { return hasVaultRight(vaultAccess, actorUuid, 'view') }
export function canOrganize(vaultAccess, actorUuid)           { return hasVaultRight(vaultAccess, actorUuid, 'organize') }
export function canDepositItems(vaultAccess, actorUuid)       { return hasVaultRight(vaultAccess, actorUuid, 'depositItems') }
export function canWithdrawItems(vaultAccess, actorUuid)      { return hasVaultRight(vaultAccess, actorUuid, 'withdrawItems') }
export function canDepositCurrencies(vaultAccess, actorUuid)  { return hasVaultRight(vaultAccess, actorUuid, 'depositCurrencies') }
export function canWithdrawCurrencies(vaultAccess, actorUuid) { return hasVaultRight(vaultAccess, actorUuid, 'withdrawCurrencies') }

function effectNames(item) {
  const effects = item?.effects
  if (!effects) return []
  return Array.from(effects).map((effect) => effect?.name ?? null)
}

/**
 * Prend un snapshot des métadonnées stables d'un objet avant déplacement en vault.
 * Champs : charges.{max,value}, quantity.current, noms des effets. Retourne null si absent.
 */
export function snapshotItemMetadata(item) {
  if (!item) return null
  return {
    charges: {
      max:   item?.system?.charges?.max   ?? null,
      value: item?.system?.charges?.value ?? null,
    },
    quantity: item?.system?.quantity?.current ?? null,
    effects:  effectNames(item),
  }
}

/**
 * Vérifie que les métadonnées stables d'un objet correspondent au snapshot pris avant
 * déplacement (charges, quantité, effets inchangés). Retourne false si un champ a changé
 * ou si l'objet/le snapshot est absent.
 */
export function assertMetadataIntegrity(item, snapshot) {
  if (!item || !snapshot) return false
  const current = snapshotItemMetadata(item)
  const expectedEffects = Array.isArray(snapshot.effects) ? snapshot.effects : []
  return (
    current.charges.max   === snapshot.charges.max   &&
    current.charges.value === snapshot.charges.value &&
    current.quantity      === snapshot.quantity      &&
    current.effects.length === expectedEffects.length &&
    current.effects.every((name, i) => name === expectedEffects[i])
  )
}

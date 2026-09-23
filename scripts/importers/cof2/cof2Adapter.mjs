/**
 * Adaptateur isolant tous les appels spécifiques à l'API du système COF2 (Epic Importateur COF2 PDF, §30 Story 7).
 * Seul fichier à connaître le nom exact des méthodes COF2 non standard (`actor.addCapacity`,
 * `game.system.CONST.martialTrainingsWeapons`) : un changement de signature côté système COF2 ne touche que ce
 * fichier.
 */

import { normalizeWeaponName } from "../../../src/importers/cof2/resolution/attackTypeResolver.mjs";

/**
 * @param {Actor} actor
 * @returns {boolean}
 */
function supportsAddCapacity(actor) {
  return typeof actor?.addCapacity === "function";
}

/**
 * Lit les groupes/catégories d'armes déclarés par le système COF2 (Issue #29), avec leur label localisé, sans les
 * transformer en règle métier (un groupe n'est qu'une catégorie, pas un type d'attaque — cf. `attackTypeResolver.mjs`).
 * Retourne une `Map` vide si `game.system.CONST.martialTrainingsWeapons` est absent (système non chargé, contexte
 * de test) : la résolution en aval retombe alors naturellement sur le fallback `melee`.
 * @returns {Map<string, string>} nom normalisé (label localisé) → clé du groupe (ex. `"longBow"`)
 */
function getMartialTrainingWeaponGroups() {
  const groups = new Map();
  try {
    for (const group of game.system.CONST.martialTrainingsWeapons ?? []) {
      const label = game.i18n.localize(group.label);
      groups.set(normalizeWeaponName(label), group.key);
    }
  } catch {
    return new Map();
  }
  return groups;
}

/**
 * Ajoute une capacité à un acteur via l'API COF2, en vérifiant d'abord qu'elle est disponible.
 * @param {Actor} actor
 * @param {object} doc Document `Item` (type `capacity`) à ajouter
 * @returns {Promise<{ok:true}|{ok:false, reason:"unsupported"}>}
 */
async function addCapacityToActor(actor, doc) {
  if (!supportsAddCapacity(actor)) return { ok: false, reason: "unsupported" };
  await actor.addCapacity(doc, null);
  return { ok: true };
}

export { supportsAddCapacity, addCapacityToActor, getMartialTrainingWeaponGroups };

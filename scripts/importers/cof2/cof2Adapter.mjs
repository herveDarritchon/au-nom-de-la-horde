/**
 * Adaptateur isolant tous les appels spécifiques à l'API du système COF2 (Epic Importateur COF2 PDF, §30 Story 7).
 * Seul fichier à connaître le nom exact des méthodes COF2 non standard (`actor.addCapacity`) : un changement de
 * signature côté système COF2 ne touche que ce fichier.
 */

/**
 * @param {Actor} actor
 * @returns {boolean}
 */
function supportsAddCapacity(actor) {
  return typeof actor?.addCapacity === "function";
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

export { supportsAddCapacity, addCapacityToActor };

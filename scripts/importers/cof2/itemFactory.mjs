/**
 * Construction des données d'`Item` COF2 (`attack`, `capacity`) depuis les modèles intermédiaires purs
 * (`AttackDraft`, `CapacityDraft`, voir `src/importers/cof2/parsing/encounterDraft.mjs`). Epic Importateur COF2
 * PDF, §30 Story 7.
 *
 * Ne fait aucun appel Foundry (pas de `Item.create*`) : ne construit que des objets de données, créés par
 * l'appelant (`encounterFactory.mjs`, `importLibrary.mjs`).
 */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraph = (s) => (s ? `<p>${esc(s)}</p>` : "");

/**
 * @param {import("../../../src/importers/cof2/parsing/encounterDraft.mjs").AttackDraft} atk
 * @returns {object} Données d'un `Item` de type `attack`
 */
function buildAttackItemData(atk) {
  const actionType = { melee: "melee", ranged: "ranged", magical: "magical" }[atk.kind];
  return {
    name: atk.name,
    type: "attack",
    img: "icons/svg/sword.svg",
    system: {
      description: paragraph(atk.extra),
      subtype: atk.kind,
      learned: true,
      properties: { spell: false, reloadable: false },
      range: atk.range ? { value: atk.range, unit: "m" } : { value: null, unit: "" },
      actions: [
        {
          indice: 0,
          label: "",
          chatFlavor: "",
          type: actionType,
          img: "icons/svg/d20-highlight.svg",
          properties: { activable: true, enabled: false, temporary: false, visible: false },
          conditions: [{ predicate: "isOwned" }],
          resolvers: [
            {
              type: "attack",
              skill: { formula: atk.bonus, crit: "20", difficulty: "@cible.def" },
              dmg: { formula: atk.damage },
              target: { type: "none", number: 0, scope: "all" },
            },
          ],
          modifiers: [],
        },
      ],
    },
  };
}

/**
 * @param {import("../../../src/importers/cof2/parsing/encounterDraft.mjs").CapacityDraft} cap
 * @param {{reviewMeta?:{hash:string, sourceType:string, parserVersion:string,
 *   reviewStatus:("generated"|"review-required"|"reviewed")}}} [options] `reviewMeta` n'est fourni que pour les
 *   capacités créées dans la bibliothèque d'import (§15/§16 de l'Epic, Story 6) : porte les `flags.warbound.*`.
 * @returns {object} Données d'un `Item` de type `capacity`
 */
function buildCapacityItemData(cap, { reviewMeta } = {}) {
  const data = {
    name: cap.name,
    type: "capacity",
    system: { description: paragraph(cap.description), learned: true, path: null },
  };
  if (reviewMeta) {
    data.flags = {
      warbound: {
        imported: true,
        sourceType: reviewMeta.sourceType,
        parserVersion: reviewMeta.parserVersion,
        sourceHash: reviewMeta.hash,
        reviewStatus: reviewMeta.reviewStatus,
      },
    };
  }
  return data;
}

export { esc, paragraph, buildAttackItemData, buildCapacityItemData };

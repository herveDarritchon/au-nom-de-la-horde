/**
 * Construction de l'acteur `encounter` COF2 depuis un `EncounterDraft` (parsing pur, voir
 * `src/importers/cof2/parsing/encounterDraft.mjs`). Epic Importateur COF2 PDF, §30 Story 7.
 *
 * Le mapping taille/catégorie vers le vocabulaire COF2 (`SIZES`, `category`) est déjà fait par
 * `statblockParser.mjs` (module pur) : cette factory ne fait que transposer les champs de l'`EncounterDraft`
 * dans la forme attendue par `Actor.create`.
 */

import { paragraph } from "./itemFactory.mjs";

const ABILITIES = ["for", "agi", "con", "per", "cha", "int", "vol"];

/**
 * @param {import("../../../src/importers/cof2/parsing/encounterDraft.mjs").EncounterDraft} parsed
 * @returns {object} Données passées à `Actor.create`
 */
function buildEncounterActorData(parsed) {
  return {
    name: parsed.name,
    type: "encounter",
    system: {
      abilities: Object.fromEntries(ABILITIES.map((a) => [a, parsed.abilities[a]])),
      attributes: { nc: parsed.nc, hp: { base: parsed.hp, value: parsed.hp } },
      combat: { def: { base: parsed.defense }, init: { base: parsed.initiative }, dr: { base: parsed.damageReduction } },
      details: { category: parsed.category, size: parsed.size, notes: { public: parsed.notes.map(paragraph).join("") } },
    },
    prototypeToken: { disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE },
  };
}

/**
 * @param {import("../../../src/importers/cof2/parsing/encounterDraft.mjs").EncounterDraft} parsed
 * @returns {Promise<Actor>}
 */
async function createEncounterActor(parsed) {
  return Actor.create(buildEncounterActorData(parsed));
}

export { ABILITIES, buildEncounterActorData, createEncounterActor };

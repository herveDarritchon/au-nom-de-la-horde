import { test } from "node:test";
import assert from "node:assert/strict";

import { createEncounter } from "./encounterFactory.mjs";

globalThis.CONST = { TOKEN_DISPOSITIONS: { HOSTILE: -1 } };

const baseParsed = () => ({
  name: "Centaure",
  nc: 4,
  category: "living",
  size: "large",
  abilities: { for: { base: 4, superior: false }, agi: { base: 1, superior: false }, con: { base: 2, superior: false }, per: { base: 0, superior: false }, cha: { base: 0, superior: false }, int: { base: -1, superior: false }, vol: { base: 1, superior: false } },
  defense: 15,
  hp: 45,
  initiative: 2,
  damageReduction: 0,
  notes: [],
  attacks: [],
  capacities: [],
  diagnostics: [],
});

const CHARGE_TEMPLATE = {
  _id: "charge-13",
  name: "Charge (13)",
  uuid: "Compendium.cof2-base.cof-2-base-items.Item.charge-13",
  system: { description: "<p>test de FOR difficulté 13</p>", actions: [{ resolvers: [{ saveDifficulty: "13" }] }] },
  toObject() {
    return { system: this.system };
  },
};

/**
 * Mock Foundry minimal : un compendium officiel avec une seule capacité `Charge (13)`, un acteur qui capture les
 * items créés/embarqués et les capacités ajoutées via `addCapacity` (API COF2, cf. `cof2Adapter.mjs`).
 */
function setupFoundryMocks() {
  const createdItems = [];
  const addedCapacities = [];
  const actor = {
    createEmbeddedDocuments: async (docType, items) => {
      createdItems.push(...items);
      return items.map((data, i) => ({ id: `item-${i}`, uuid: `Actor.a1.Item.item-${i}`, toObject: () => ({ system: { actions: [] } }) }));
    },
    updateEmbeddedDocuments: async () => {},
    addCapacity: async (doc) => addedCapacities.push(doc),
  };
  globalThis.Actor = { create: async () => actor };
  globalThis.game = {
    packs: {
      get: () => ({
        folders: [{ id: "folder-rencontres", name: "Capacités des rencontres" }],
        getIndex: async () => [{ _id: "charge-13", name: "Charge (13)", type: "capacity", folder: "folder-rencontres" }],
        getDocument: async () => CHARGE_TEMPLATE,
      }),
    },
  };
  return { actor, createdItems, addedCapacities };
}

function teardownFoundryMocks() {
  delete globalThis.Actor;
  delete globalThis.game;
}

test("createEncounter surcharge la difficulté et crée une variante indépendante quand confirmée", async () => {
  const { createdItems } = setupFoundryMocks();
  const parsed = { ...baseParsed(), capacities: [{ rawName: "Charge (difficulté 16)", name: "Charge", description: "", actionType: null, frequency: null, parameters: {}, confidence: "high" }] };

  const { warnings } = await createEncounter(parsed, { confirmedVariants: new Set(["Charge (difficulté 16)"]) });

  assert.equal(createdItems.length, 1);
  assert.equal(createdItems[0].system.actions[0].resolvers[0].saveDifficulty, "16");
  assert.equal(createdItems[0].system.description, "<p>test de FOR difficulté 16</p>");
  assert.ok(warnings.some((w) => w.includes("difficulté 16")));
  assert.equal(CHARGE_TEMPLATE.system.actions[0].resolvers[0].saveDifficulty, "13", "le modèle officiel ne doit jamais être muté");

  teardownFoundryMocks();
});

test("createEncounter ne surcharge rien sans confirmation (comportement historique inchangé)", async () => {
  const { createdItems, addedCapacities } = setupFoundryMocks();
  const parsed = { ...baseParsed(), capacities: [{ rawName: "Charge (difficulté 16)", name: "Charge", description: "", actionType: null, frequency: null, parameters: {}, confidence: "high" }] };

  const { warnings } = await createEncounter(parsed);

  // Sans confirmation, réutilisation du modèle tel quel (comportement historique) : aucune variante clonée.
  assert.equal(createdItems.length, 0);
  assert.deepEqual(addedCapacities, [CHARGE_TEMPLATE]);
  assert.ok(warnings.some((w) => w.includes("vérifier le paramètre")));

  teardownFoundryMocks();
});

test("createEncounter émet CAPACITY_PARAMETER_MISMATCH quand le paramètre source n'est pas reconnu", async () => {
  const { warnings } = await (async () => {
    setupFoundryMocks();
    const parsed = { ...baseParsed(), capacities: [{ rawName: "Charge (rapide)", name: "Charge", description: "", actionType: null, frequency: null, parameters: {}, confidence: "medium" }] };
    const result = await createEncounter(parsed);
    teardownFoundryMocks();
    return result;
  })();

  assert.ok(warnings.some((w) => w.includes("Paramètre de capacité non reconnu")));
});

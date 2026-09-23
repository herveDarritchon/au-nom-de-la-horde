import { test } from "node:test";
import assert from "node:assert/strict";

import { createEncounter, buildAttackTypeResolver } from "./encounterFactory.mjs";

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
function setupFoundryMocks({ actorDeleteImpl, createEmbeddedDocumentsImpl, debugLoggingEnabled = false } = {}) {
  const createdItems = [];
  const addedCapacities = [];
  const deleteCalls = [];
  const debugCalls = [];
  const actor = {
    id: "a1",
    createEmbeddedDocuments: createEmbeddedDocumentsImpl ?? (async (docType, items) => {
      createdItems.push(...items);
      return items.map((data, i) => ({ id: `item-${i}`, uuid: `Actor.a1.Item.item-${i}`, toObject: () => ({ system: { actions: [] } }) }));
    }),
    updateEmbeddedDocuments: async () => {},
    addCapacity: async (doc) => addedCapacities.push(doc),
    delete: actorDeleteImpl ?? (async () => deleteCalls.push("actor")),
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
    settings: { get: () => debugLoggingEnabled },
  };
  originalConsoleDebug = console.debug;
  console.debug = (...args) => debugCalls.push(args);
  return { actor, createdItems, addedCapacities, deleteCalls, debugCalls };
}

let originalConsoleDebug = console.debug;

function teardownFoundryMocks() {
  delete globalThis.Actor;
  delete globalThis.game;
  console.debug = originalConsoleDebug;
}

test("createEncounter surcharge la difficulté et crée une variante indépendante quand confirmée", async () => {
  const { createdItems } = setupFoundryMocks();
  const parsed = { ...baseParsed(), capacities: [{ rawName: "Charge (difficulté 16)", name: "Charge", description: "", actionType: null, frequency: null, parameters: {}, confidence: "high" }] };

  const { report: { warnings } } = await createEncounter(parsed, { confirmedVariants: new Set(["Charge (difficulté 16)"]) });

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

  const { report: { warnings } } = await createEncounter(parsed);

  // Sans confirmation, réutilisation du modèle tel quel (comportement historique) : aucune variante clonée.
  assert.equal(createdItems.length, 0);
  assert.deepEqual(addedCapacities, [CHARGE_TEMPLATE]);
  assert.ok(warnings.some((w) => w.includes("vérifier le paramètre")));

  teardownFoundryMocks();
});

test("createEncounter émet CAPACITY_PARAMETER_MISMATCH quand le paramètre source n'est pas reconnu", async () => {
  const {
    report: { warnings },
  } = await (async () => {
    setupFoundryMocks();
    const parsed = { ...baseParsed(), capacities: [{ rawName: "Charge (rapide)", name: "Charge", description: "", actionType: null, frequency: null, parameters: {}, confidence: "medium" }] };
    const result = await createEncounter(parsed);
    teardownFoundryMocks();
    return result;
  })();

  assert.ok(warnings.some((w) => w.includes("Paramètre de capacité non reconnu")));
});

// --- Story 10 : transaction, rollback et rapport final (§20 de l'Epic) ---

test("createEncounter renvoie un rapport avec compteurs corrects en cas de succès complet, sans rollback", async () => {
  const { deleteCalls } = setupFoundryMocks();
  const parsed = { ...baseParsed(), attacks: [{ raw: "", name: "Sabots", kind: "melee", bonus: "+7", damage: "1d6+3", range: null, extra: "", confidence: "high" }], capacities: [{ rawName: "Charge (13)", name: "Charge (13)", description: "", actionType: null, frequency: null, parameters: {}, confidence: "high" }] };

  const { actor, report } = await createEncounter(parsed);

  assert.ok(actor);
  assert.equal(report.counts.attacksCreated, 1);
  assert.equal(report.counts.capacitiesReused, 1);
  assert.equal(report.counts.capacitiesCreated, 0);
  assert.equal(report.counts.errors, 0);
  assert.equal(report.counts.toReview, 0);
  assert.equal(deleteCalls.length, 0);

  teardownFoundryMocks();
});

test("createEncounter effectue un rollback complet et renvoie actor:null quand l'écriture d'une capacité échoue", async () => {
  const { deleteCalls } = setupFoundryMocks({
    createEmbeddedDocumentsImpl: async (docType, items) => {
      throw new Error("Item.createDocuments a échoué");
    },
  });
  const parsed = { ...baseParsed(), attacks: [{ raw: "", name: "Sabots", kind: "melee", bonus: "+7", damage: "1d6+3", range: null, extra: "", confidence: "high" }] };

  const { actor, report } = await createEncounter(parsed);

  assert.equal(actor, null);
  assert.deepEqual(deleteCalls, ["actor"]);
  assert.equal(report.counts.errors, 1);
  assert.ok(report.diagnostics.some((d) => d.code === "IMPORT_WRITE_FAILED"));
  assert.ok(!report.diagnostics.some((d) => d.code === "IMPORT_ROLLBACK_FAILED"));

  teardownFoundryMocks();
});

test("createEncounter renvoie l'acteur partiel et un diagnostic IMPORT_ROLLBACK_FAILED quand le rollback échoue lui-même", async () => {
  const { deleteCalls } = setupFoundryMocks({
    actorDeleteImpl: async () => {
      throw new Error("actor.delete a échoué");
    },
    createEmbeddedDocumentsImpl: async () => {
      throw new Error("Item.createDocuments a échoué");
    },
  });
  const parsed = { ...baseParsed(), attacks: [{ raw: "", name: "Sabots", kind: "melee", bonus: "+7", damage: "1d6+3", range: null, extra: "", confidence: "high" }] };

  const { actor, report } = await createEncounter(parsed);

  assert.ok(actor, "l'acteur partiel doit être renvoyé, pas masqué");
  assert.equal(deleteCalls.length, 0, "delete n'a jamais réussi");
  assert.equal(report.counts.errors, 2);
  assert.ok(report.diagnostics.some((d) => d.code === "IMPORT_WRITE_FAILED"));
  assert.ok(report.diagnostics.some((d) => d.code === "IMPORT_ROLLBACK_FAILED"));

  teardownFoundryMocks();
});

test("createEncounter n'émet aucun log de debug quand cof2ImportDebugLogging est désactivé (défaut)", async () => {
  const { debugCalls } = setupFoundryMocks({ debugLoggingEnabled: false });
  const parsed = baseParsed();

  await createEncounter(parsed);

  assert.equal(debugCalls.length, 0);

  teardownFoundryMocks();
});

test("createEncounter émet des logs de debug structurés quand cof2ImportDebugLogging est activé", async () => {
  const { debugCalls } = setupFoundryMocks({ debugLoggingEnabled: true });
  const parsed = baseParsed();

  await createEncounter(parsed);

  assert.ok(debugCalls.some(([label]) => label.includes("ACTOR_CREATED")));

  teardownFoundryMocks();
});

/**
 * Mock Foundry pour `buildAttackTypeResolver` (Issue #29) : un référentiel COF2 avec le groupe `longBow`
 * (« Arc long ») et un équipement correspondant (`martialCategory: "longBow"`) dont l'action est `ranged`.
 */
function setupAttackTypeMocks() {
  globalThis.game = {
    system: { CONST: { martialTrainingsWeapons: [{ key: "longBow", label: "COFBASE.config.martialTrainingWeapon.longBow" }] } },
    i18n: { localize: (key) => ({ "COFBASE.config.martialTrainingWeapon.longBow": "Arc long" })[key] },
    packs: {
      get: () => ({
        getIndex: async () => [{ _id: "arc-long", type: "equipment", system: { subtype: "weapon", martialCategory: "longBow" } }],
        getDocument: async () => ({ system: { actions: [{ type: "ranged" }] } }),
      }),
    },
  };
}

test("buildAttackTypeResolver résout Arc long en ranged via le référentiel COF2", async () => {
  setupAttackTypeMocks();

  const resolver = await buildAttackTypeResolver();

  assert.equal(resolver.resolve("Arc long"), "ranged");
  assert.equal(resolver.resolve("Sabots"), null);

  delete globalThis.game;
});

test("buildAttackTypeResolver renvoie null quand le compendium officiel est absent", async () => {
  globalThis.game = { packs: { get: () => undefined } };

  assert.equal(await buildAttackTypeResolver(), null);

  delete globalThis.game;
});

test("buildAttackTypeResolver renvoie un resolver toujours null quand le référentiel martialTrainingsWeapons est absent (fallback melee en aval)", async () => {
  globalThis.game = { packs: { get: () => ({ getIndex: async () => [] }) } };

  const resolver = await buildAttackTypeResolver();

  assert.equal(resolver.resolve("Arc long"), null);

  delete globalThis.game;
});

test("createEncounter résout Arc long en ranged via le référentiel COF2 avant de créer les items d'attaque (Centaure, issue #29)", async () => {
  const createdItems = [];
  const actor = {
    id: "a1",
    createEmbeddedDocuments: async (docType, items) => {
      createdItems.push(...items);
      return items.map((data, i) => ({ id: `item-${i}`, uuid: `Actor.a1.Item.item-${i}`, toObject: () => ({ system: { actions: [] } }) }));
    },
    updateEmbeddedDocuments: async () => {},
    addCapacity: async () => {},
    delete: async () => {},
  };
  globalThis.Actor = { create: async () => actor };
  globalThis.game = {
    system: { CONST: { martialTrainingsWeapons: [{ key: "longBow", label: "COFBASE.config.martialTrainingWeapon.longBow" }] } },
    i18n: { localize: (key) => ({ "COFBASE.config.martialTrainingWeapon.longBow": "Arc long" })[key] },
    packs: {
      get: () => ({
        folders: [],
        getIndex: async () => [{ _id: "arc-long-item", type: "equipment", system: { subtype: "weapon", martialCategory: "longBow" } }],
        getDocument: async () => ({ system: { actions: [{ type: "ranged" }] } }),
      }),
    },
    settings: { get: () => false },
  };

  const parsed = { ...baseParsed(), attacks: [{ raw: "Sabots +7 · DM 1d8+6", name: "Sabots", kind: "melee", bonus: "+7", damage: "1d8+6", range: null, extra: "", confidence: "high" }, { raw: "Arc long +4 · DM 1d8", name: "Arc long", kind: "melee", bonus: "+4", damage: "1d8", range: null, extra: "", confidence: "high" }] };

  await createEncounter(parsed);

  assert.deepEqual(createdItems.map((i) => i.system.subtype), ["melee", "ranged"]);

  delete globalThis.Actor;
  delete globalThis.game;
});

// --- Story 6 : saveToLibrary ---

test("createEncounter avec saveToLibrary:false crée la capacité NOT_FOUND directement dans l'acteur sans écrire dans la bibliothèque", async () => {
  const librarySaved = [];
  globalThis.Item = {
    createDocuments: async (items) => {
      librarySaved.push(...items);
      return items.map((d, i) => ({ _id: `lib-${i}`, name: d.name, flags: d.flags, delete: async () => {} }));
    },
  };
  const { createdItems } = setupFoundryMocks();
  const parsed = { ...baseParsed(), capacities: [{ rawName: "Griffe du vide", name: "Griffe du vide", description: "Attaque spectrale.", actionType: "action", frequency: null, parameters: {}, confidence: "high" }] };

  const { report } = await createEncounter(parsed, { saveToLibrary: false });

  assert.equal(librarySaved.length, 0, "rien ne doit être écrit dans la bibliothèque");
  assert.equal(report.counts.capacitiesCreated, 1);
  assert.equal(report.counts.capacitiesReused, 0);

  delete globalThis.Item;
  teardownFoundryMocks();
});

test("createEncounter avec saveToLibrary:true (défaut) crée une nouvelle capacité NOT_FOUND dans la bibliothèque d'import", async () => {
  const librarySaved = [];
  const libraryPack = {
    collection: "world.warbound-imported-capacities",
    getIndex: async () => [],
    getDocument: async (id) => ({ _id: id, name: "Griffe du vide", system: {}, flags: {} }),
  };
  globalThis.Item = {
    createDocuments: async (items) => {
      librarySaved.push(...items);
      return items.map((d, i) => ({ _id: `lib-${i}`, name: d.name, flags: d.flags, delete: async () => {} }));
    },
  };
  const { createdItems, addedCapacities } = setupFoundryMocks();
  game.packs.get = (id) => (id === "world.warbound-imported-capacities" ? libraryPack : { folders: [{ id: "folder-rencontres", name: "Capacités des rencontres" }], getIndex: async () => [{ _id: "charge-13", name: "Charge (13)", type: "capacity", folder: "folder-rencontres" }], getDocument: async () => ({}) });
  const parsed = { ...baseParsed(), capacities: [{ rawName: "Griffe du vide", name: "Griffe du vide", description: "Attaque spectrale.", actionType: "action", frequency: null, parameters: {}, confidence: "high" }] };

  const { report } = await createEncounter(parsed, { saveToLibrary: true });

  assert.equal(librarySaved.length, 1, "la capacité doit être sauvegardée dans la bibliothèque");
  assert.equal(librarySaved[0].flags?.warbound?.imported, true);
  assert.equal(librarySaved[0].flags?.warbound?.reviewStatus, "generated");
  assert.equal(report.counts.capacitiesCreated, 1);

  delete globalThis.Item;
  teardownFoundryMocks();
});

test("createEncounter avec reuseExisting:false ne réutilise pas la capacité officielle et la crée directement dans l'acteur", async () => {
  const { createdItems, addedCapacities } = setupFoundryMocks();
  // "Charge (13)" existe dans le compendium officiel mais reuseExisting:false doit la créer directement
  const parsed = { ...baseParsed(), capacities: [{ rawName: "Charge (13)", name: "Charge (13)", description: "", actionType: null, frequency: null, parameters: {}, confidence: "high" }] };

  const { report } = await createEncounter(parsed, { reuseExisting: false, saveToLibrary: false });

  assert.equal(addedCapacities.length, 0, "addCapacity ne doit pas être appelé");
  assert.equal(createdItems.length, 1, "la capacité doit être créée directement dans l'acteur");
  assert.equal(report.counts.capacitiesCreated, 1);
  assert.equal(report.counts.capacitiesReused, 0);

  teardownFoundryMocks();
});

test("createEncounter réutilise une capacité déjà dans la bibliothèque d'import (REUSE_IMPORTED via resolver)", async () => {
  const importedDoc = { _id: "griffe-lib", name: "Griffe du vide", system: {}, flags: { warbound: { imported: true } } };
  const libPack = {
    collection: "world.warbound-imported-capacities",
    getIndex: async () => [{ _id: "griffe-lib", name: "Griffe du vide", type: "capacity", flags: { warbound: { imported: true } } }],
    getDocument: async () => importedDoc,
  };
  const officialPack = {
    folders: [{ id: "folder-rencontres", name: "Capacités des rencontres" }],
    getIndex: async () => [],
    getDocument: async () => ({}),
  };
  const { addedCapacities } = setupFoundryMocks();
  game.packs.get = (id) => (id === "world.warbound-imported-capacities" ? libPack : officialPack);
  const parsed = { ...baseParsed(), capacities: [{ rawName: "Griffe du vide", name: "Griffe du vide", description: "", actionType: null, frequency: null, parameters: {}, confidence: "high" }] };

  const { report } = await createEncounter(parsed, { saveToLibrary: true });

  assert.deepEqual(addedCapacities, [importedDoc]);
  assert.equal(report.counts.capacitiesReused, 1);
  assert.equal(report.counts.capacitiesCreated, 0);
  assert.ok(report.warnings.some((w) => w.includes("réutilise")));

  teardownFoundryMocks();
});

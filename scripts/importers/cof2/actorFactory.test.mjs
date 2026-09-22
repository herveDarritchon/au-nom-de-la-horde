import { test } from "node:test";
import assert from "node:assert/strict";

import { buildEncounterActorData, createEncounterActor } from "./actorFactory.mjs";

globalThis.CONST = { TOKEN_DISPOSITIONS: { HOSTILE: -1 } };

const parsed = {
  name: "Centaure",
  nc: 4,
  category: "living",
  size: "large",
  abilities: { for: { base: 4, superior: false }, agi: { base: 1, superior: false }, con: { base: 2, superior: false }, per: { base: 0, superior: false }, cha: { base: 0, superior: false }, int: { base: -1, superior: false }, vol: { base: 1, superior: false } },
  defense: 15,
  hp: 45,
  initiative: 2,
  damageReduction: 0,
  notes: ["Créature des plaines."],
  attacks: [],
  capacities: [],
  diagnostics: [],
};

test("buildEncounterActorData mappe l'EncounterDraft vers les données Actor.create", () => {
  const data = buildEncounterActorData(parsed);
  assert.equal(data.type, "encounter");
  assert.equal(data.name, "Centaure");
  assert.equal(data.system.attributes.nc, 4);
  assert.equal(data.system.attributes.hp.base, 45);
  assert.equal(data.system.attributes.hp.value, 45);
  assert.equal(data.system.combat.def.base, 15);
  assert.equal(data.system.combat.init.base, 2);
  assert.equal(data.system.details.category, "living");
  assert.equal(data.system.details.size, "large");
  assert.equal(data.system.abilities.for.base, 4);
  assert.equal(data.system.details.notes.public, "<p>Créature des plaines.</p>");
});

test("buildEncounterActorData positionne le jeton en disposition hostile", async () => {
  const data = buildEncounterActorData(parsed);
  assert.equal(data.prototypeToken.disposition, -1);
});

test("createEncounterActor délègue à Actor.create avec les données mappées", async () => {
  const calls = [];
  globalThis.Actor = { create: async (data) => (calls.push(data), { ...data, id: "actor-1" }) };

  const actor = await createEncounterActor(parsed);

  assert.equal(actor.id, "actor-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "Centaure");

  delete globalThis.Actor;
});

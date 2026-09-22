import { test } from "node:test";
import assert from "node:assert/strict";

import { supportsAddCapacity, addCapacityToActor } from "./cof2Adapter.mjs";

test("supportsAddCapacity détecte la méthode COF2 présente", () => {
  assert.equal(supportsAddCapacity({ addCapacity: async () => {} }), true);
});

test("supportsAddCapacity renvoie false quand la méthode est absente", () => {
  assert.equal(supportsAddCapacity({}), false);
  assert.equal(supportsAddCapacity(null), false);
});

test("addCapacityToActor appelle actor.addCapacity(doc, null) quand disponible", async () => {
  const calls = [];
  const actor = { addCapacity: async (doc, ability) => calls.push([doc, ability]) };
  const doc = { name: "Charge" };

  const result = await addCapacityToActor(actor, doc);

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [[doc, null]]);
});

test("addCapacityToActor n'appelle rien et renvoie ok:false quand la méthode est absente", async () => {
  const actor = {};
  const result = await addCapacityToActor(actor, { name: "Charge" });
  assert.deepEqual(result, { ok: false, reason: "unsupported" });
});

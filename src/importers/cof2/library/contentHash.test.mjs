import { test } from "node:test";
import assert from "node:assert/strict";

import { computeContentHash } from "./contentHash.mjs";

const base = {
  type: "capacity",
  name: "Charge",
  description: "L'attaquant se rue sur sa cible.",
  actionType: "L",
  frequency: { kind: "at-will" },
  parameters: { difficulty: "16" },
};

test("computeContentHash est stable pour une entrée identique", () => {
  assert.equal(computeContentHash(base), computeContentHash({ ...base }));
});

test("computeContentHash est insensible aux espaces et à la casse superflus", () => {
  const spaced = {
    ...base,
    name: "  CHARGE  ",
    description: "L'ATTAQUANT   se rue   sur sa cible.",
  };
  assert.equal(computeContentHash(base), computeContentHash(spaced));
});

test("computeContentHash change si la description change", () => {
  assert.notEqual(computeContentHash(base), computeContentHash({ ...base, description: "Autre effet." }));
});

test("computeContentHash change si le paramètre change (Charge 16 vs Charge 13)", () => {
  assert.notEqual(computeContentHash(base), computeContentHash({ ...base, parameters: { difficulty: "13" } }));
});

test("computeContentHash change si le temps d'action change", () => {
  assert.notEqual(computeContentHash(base), computeContentHash({ ...base, actionType: "A" }));
});

test("computeContentHash tolère des champs absents (frequency/parameters non définis)", () => {
  assert.doesNotThrow(() => computeContentHash({ type: "capacity", name: "Discret" }));
});

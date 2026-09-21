import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pdfNoiseRemoved,
  attackDamageReconnected,
  ambiguousCapacity,
  capacityParameterMismatch,
  unsupportedAutomation,
  missingAbility,
  multipleStatblocks,
  toEncounterDraft,
} from "./encounterDraft.mjs";

const STABLE_CODES = [
  "PDF_NOISE_REMOVED",
  "ATTACK_DAMAGE_RECONNECTED",
  "AMBIGUOUS_CAPACITY",
  "CAPACITY_PARAMETER_MISMATCH",
  "UNSUPPORTED_AUTOMATION",
  "MISSING_ABILITY",
  "MULTIPLE_STATBLOCKS",
];

test("chaque constructeur de diagnostic produit un code stable parmi les 7 de l'Epic, une sévérité et un message", () => {
  const cases = [
    [pdfNoiseRemoved("INTRO"), "PDF_NOISE_REMOVED", "info", "INTRO"],
    [attackDamageReconnected("Sabots +7 ·"), "ATTACK_DAMAGE_RECONNECTED", "info", "Sabots +7 ·"],
    [ambiguousCapacity("Résistance"), "AMBIGUOUS_CAPACITY", "warning", "Résistance"],
    [capacityParameterMismatch("Charge (15)"), "CAPACITY_PARAMETER_MISMATCH", "warning", "Charge (15)"],
    [unsupportedAutomation("S Défense 13 à 100"), "UNSUPPORTED_AUTOMATION", "warning", "S Défense 13 à 100"],
    [missingAbility("FOR"), "MISSING_ABILITY", "error", "FOR"],
    [multipleStatblocks("Ombre errante | NC 2"), "MULTIPLE_STATBLOCKS", "warning", "Ombre errante | NC 2"],
  ];
  for (const [diagnostic, code, severity, sourceFragment] of cases) {
    assert.equal(diagnostic.code, code);
    assert.equal(diagnostic.severity, severity);
    assert.ok(STABLE_CODES.includes(diagnostic.code));
    assert.ok(diagnostic.message.length > 0);
    assert.equal(diagnostic.sourceFragment, sourceFragment);
  }
});

test("pdfNoiseRemoved accepte une sévérité explicite pour une ligne de corps non reconnue", () => {
  const diagnostic = pdfNoiseRemoved("Un murmure parcourt la salle.", "warning");
  assert.equal(diagnostic.code, "PDF_NOISE_REMOVED");
  assert.equal(diagnostic.severity, "warning");
});

test("toEncounterDraft assemble un EncounterDraft minimal avec la source fournie", () => {
  const parsed = {
    name: "Aigle commun",
    nc: 0.5,
    category: "living",
    size: "small",
    abilities: {},
    defense: 13,
    hp: 3,
    initiative: 16,
    damageReduction: 0,
    attacks: [],
    capacities: [],
    notes: [],
    diagnostics: [],
  };
  const source = { rawText: "raw", normalizedText: "normalized" };

  const draft = toEncounterDraft(parsed, source);

  assert.equal(draft.source, source);
  assert.equal(draft.name, "Aigle commun");
  assert.equal(draft.defense, 13);
  assert.deepEqual(draft.diagnostics, []);
});

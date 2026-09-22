import { test } from "node:test";
import assert from "node:assert/strict";

import { detectParameter, compareTemplateVariant, buildDifficultyOverride } from "./capacityVariant.mjs";

test("detectParameter reconnaît une difficulté explicite", () => {
  assert.deepEqual(detectParameter("Charge (difficulté 16)"), { kind: "difficulty", value: 16 });
});

test("detectParameter reconnaît une distance", () => {
  assert.deepEqual(detectParameter("Souffle (10 m)"), { kind: "distance", value: 10 });
});

test("detectParameter reconnaît une durée en tours ou rounds", () => {
  assert.deepEqual(detectParameter("Étourdissement (2 tours)"), { kind: "duration", value: 2 });
  assert.deepEqual(detectParameter("Étourdissement (2 rounds)"), { kind: "duration", value: 2 });
});

test("detectParameter traite un nombre nu comme une difficulté (convention du compendium officiel)", () => {
  assert.deepEqual(detectParameter("Charge (13)"), { kind: "difficulty", value: 13 });
});

test("detectParameter renvoie null sans parenthèse finale ou sur un contenu non reconnu", () => {
  assert.equal(detectParameter("Discret"), null);
  assert.equal(detectParameter("Vol (rapide)"), null);
});

test("compareTemplateVariant résout OVERRIDABLE sur une différence de difficulté", () => {
  assert.deepEqual(compareTemplateVariant("Charge (difficulté 16)", "Charge (13)"), {
    status: "OVERRIDABLE",
    kind: "difficulty",
    from: 13,
    to: 16,
  });
});

test("compareTemplateVariant résout DETECTED_NOT_OVERRIDABLE sur une différence de distance", () => {
  assert.deepEqual(compareTemplateVariant("Souffle (15 m)", "Souffle (10 m)"), {
    status: "DETECTED_NOT_OVERRIDABLE",
    kind: "distance",
    from: 10,
    to: 15,
  });
});

test("compareTemplateVariant résout UNRECOGNIZED quand le nom source n'a pas de paramètre reconnu", () => {
  assert.deepEqual(compareTemplateVariant("Vol (rapide)", "Vol (lent)"), { status: "UNRECOGNIZED" });
});

test("compareTemplateVariant résout UNRECOGNIZED quand le modèle n'a pas de paramètre de même nature", () => {
  assert.deepEqual(compareTemplateVariant("Charge (difficulté 16)", "Charge (rapide)"), { status: "UNRECOGNIZED" });
});

const templateSystemData = {
  description: "<p>La créature réalise un test de FOR difficulté 13 ou est renversée.</p>",
  actions: [
    { resolvers: [] },
    { resolvers: [{ saveDifficulty: "13", saveAbility: "for" }, { saveDifficulty: "20", saveAbility: "agi" }] },
  ],
};

test("buildDifficultyOverride remplace saveDifficulty et la difficulté dans la description", () => {
  const result = buildDifficultyOverride(templateSystemData, 13, 16);
  assert.equal(result.actions[1].resolvers[0].saveDifficulty, "16");
  assert.equal(result.actions[1].resolvers[1].saveDifficulty, "20");
  assert.equal(result.description, "<p>La créature réalise un test de FOR difficulté 16 ou est renversée.</p>");
});

test("buildDifficultyOverride ne mute pas l'objet reçu", () => {
  const before = structuredClone(templateSystemData);
  buildDifficultyOverride(templateSystemData, 13, 16);
  assert.deepEqual(templateSystemData, before);
});

test("buildDifficultyOverride laisse un resolvers[] sans saveDifficulty inchangé", () => {
  const data = { description: "", actions: [{ resolvers: [{ saveAbility: "for" }] }] };
  const result = buildDifficultyOverride(data, 13, 16);
  assert.deepEqual(result.actions[0].resolvers[0], { saveAbility: "for" });
});

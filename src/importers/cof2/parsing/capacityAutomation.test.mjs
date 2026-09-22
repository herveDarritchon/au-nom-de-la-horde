import { test } from "node:test";
import assert from "node:assert/strict";

import { detectFrequency, detectState, detectAbilityTest, detectNumericBonus } from "./capacityAutomation.mjs";

test("detectFrequency reconnaît « 1 fois/combat » et « 1 fois par combat »", () => {
  assert.deepEqual(detectFrequency("1 fois/combat, la créature charge."), { period: "combat", confidence: "high" });
  assert.deepEqual(detectFrequency("1 fois par combat, la créature charge."), { period: "combat", confidence: "high" });
});

test("detectFrequency reconnaît « 1 fois/jour » et « 1 fois par jour »", () => {
  assert.deepEqual(detectFrequency("1 fois/jour, la créature vole."), { period: "daily", confidence: "high" });
  assert.deepEqual(detectFrequency("1 fois par jour, la créature vole."), { period: "daily", confidence: "high" });
});

test("detectFrequency renvoie null sans fréquence explicite", () => {
  assert.equal(detectFrequency("La créature charge sans limite."), null);
});

test("detectFrequency ne mute pas la description reçue", () => {
  const description = "1 fois/combat, la créature charge.";
  detectFrequency(description);
  assert.equal(description, "1 fois/combat, la créature charge.");
});

test("detectState reconnaît un état simple et un état avec durée", () => {
  assert.deepEqual(detectState("La victime est renversée."), { pattern: "renversée", confidence: "medium" });
  assert.deepEqual(detectState("La victime est étourdie pendant 2 rounds."), { pattern: "étourdie pendant 2 rounds", confidence: "medium" });
});

test("detectState renvoie null sans état reconnu", () => {
  assert.equal(detectState("La créature charge sans effet."), null);
});

test("detectAbilityTest reconnaît un test de caractéristique explicite", () => {
  assert.deepEqual(detectAbilityTest("La victime doit faire un test de FOR difficulté 16."), { pattern: "test de FOR difficulté 16", confidence: "medium" });
});

test("detectAbilityTest renvoie null sans test explicite", () => {
  assert.equal(detectAbilityTest("La victime encaisse les dégâts."), null);
});

test("detectNumericBonus reconnaît un bonus numérique simple", () => {
  assert.deepEqual(detectNumericBonus("+5 en discrétion en forêt."), { pattern: "+5 en discrétion", confidence: "low" });
});

test("detectNumericBonus renvoie null sans bonus numérique", () => {
  assert.equal(detectNumericBonus("La créature n'a aucun bonus."), null);
});

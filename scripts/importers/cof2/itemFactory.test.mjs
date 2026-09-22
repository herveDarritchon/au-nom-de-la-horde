import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAttackItemData, buildCapacityItemData, buildCapacityVariantItemData } from "./itemFactory.mjs";

test("buildAttackItemData produit un item de type attack utilisable", () => {
  const data = buildAttackItemData({ name: "Griffe", kind: "melee", bonus: "+5", damage: "1d6+3", range: null, extra: "Attaque acérée." });
  assert.equal(data.type, "attack");
  assert.equal(data.system.learned, true);
  assert.equal(data.system.subtype, "melee");
  assert.equal(data.system.actions[0].type, "melee");
  assert.equal(data.system.actions[0].resolvers[0].skill.formula, "+5");
  assert.equal(data.system.actions[0].resolvers[0].dmg.formula, "1d6+3");
});

test("buildAttackItemData échappe le HTML de la description libre", () => {
  const data = buildAttackItemData({ name: "Griffe", kind: "melee", bonus: "+5", damage: "1d6", range: null, extra: "<script>x</script>" });
  assert.equal(data.system.description, "<p>&lt;script&gt;x&lt;/script&gt;</p>");
});

test("buildCapacityItemData produit une capacité apprise (learned:true), sans flags par défaut", () => {
  const data = buildCapacityItemData({ name: "Discret", description: "Se fond dans l'ombre." });
  assert.equal(data.type, "capacity");
  assert.equal(data.system.learned, true);
  assert.equal(data.system.description, "<p>Se fond dans l'ombre.</p>");
  assert.equal(data.flags, undefined);
});

test("buildCapacityItemData ajoute flags.warbound.* seulement quand reviewMeta est fourni", () => {
  const data = buildCapacityItemData(
    { name: "Discret", description: "Se fond dans l'ombre." },
    { reviewMeta: { hash: "abc123", sourceType: "pdf-text", parserVersion: "1.0.0", reviewStatus: "generated" } }
  );
  assert.deepEqual(data.flags, {
    warbound: { imported: true, sourceType: "pdf-text", parserVersion: "1.0.0", sourceHash: "abc123", reviewStatus: "generated" },
  });
});

test("buildCapacityItemData mappe actionType (L/A/M/G) sur system.actionType en minuscule", () => {
  for (const actionType of ["L", "A", "M", "G"]) {
    const data = buildCapacityItemData({ name: "Charge", description: "...", actionType, frequency: null });
    assert.equal(data.system.actionType, actionType.toLowerCase());
  }
});

test("buildCapacityItemData laisse system.actionType vide quand actionType est null", () => {
  const data = buildCapacityItemData({ name: "Discret", description: "...", actionType: null, frequency: null });
  assert.equal(data.system.actionType, "");
});

test("buildCapacityItemData mappe frequency sur system.frequency (combat/daily), défaut none", () => {
  assert.equal(buildCapacityItemData({ name: "X", description: "...", frequency: { period: "combat" } }).system.frequency, "combat");
  assert.equal(buildCapacityItemData({ name: "X", description: "...", frequency: { period: "daily" } }).system.frequency, "daily");
  assert.equal(buildCapacityItemData({ name: "X", description: "...", frequency: null }).system.frequency, "none");
});

test("buildCapacityVariantItemData clone le modèle avec le system surchargé et learned:true", () => {
  const template = { name: "Charge (13)", uuid: "Compendium.cof2-base.cof-2-base-items.Item.abc", system: { learned: true, description: "old" } };
  const overriddenSystem = { description: "<p>test difficulté 16</p>" };

  const data = buildCapacityVariantItemData(template, overriddenSystem);

  assert.equal(data.type, "capacity");
  assert.equal(data.name, "Charge (13)");
  assert.deepEqual(data.system, { description: "<p>test difficulté 16</p>", learned: true });
  assert.deepEqual(data.flags, { warbound: { imported: true, variantOf: "Compendium.cof2-base.cof-2-base-items.Item.abc" } });
});

test("buildCapacityVariantItemData ne copie pas _id/_stats.compendiumSource du modèle", () => {
  const template = { name: "Charge (13)", _id: "abc", uuid: "Compendium.cof2-base.cof-2-base-items.Item.abc", _stats: { compendiumSource: "Compendium.cof2-base.cof-2-base-items.Item.abc" }, system: {} };

  const data = buildCapacityVariantItemData(template, {});

  assert.equal(data._id, undefined);
  assert.equal(data._stats, undefined);
});

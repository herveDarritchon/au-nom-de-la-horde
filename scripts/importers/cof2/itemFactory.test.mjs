import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAttackItemData, buildCapacityItemData } from "./itemFactory.mjs";

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

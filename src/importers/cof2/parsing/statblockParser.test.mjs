import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseStatblock, parseAttackLine, matchTitle } from "./statblockParser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const centaure = readFileSync(path.join(__dirname, "__fixtures__", "centaure.txt"), "utf8");

test("parseStatblock reproduit le comportement de la macro d'origine sur le Centaure", () => {
  const result = parseStatblock(centaure);

  assert.equal(result.name, "Centaure");
  assert.equal(result.nc, 3);
  assert.equal(result.category, "humanoid");
  assert.equal(result.size, "large");

  assert.deepEqual(result.abilities, {
    agi: { base: 3, superior: false },
    con: { base: 6, superior: true },
    for: { base: 6, superior: false },
    per: { base: 1, superior: true },
    cha: { base: 0, superior: false },
    int: { base: -1, superior: false },
    vol: { base: 0, superior: false },
  });

  assert.equal(result.def, 15);
  assert.equal(result.hp, 30);
  assert.equal(result.init, 14);
  assert.equal(result.dr, 0);

  assert.equal(result.attacks.length, 3);
  assert.deepEqual(
    result.attacks.map((a) => a.name),
    ["Sabots", "Épée longue", "Arc long"]
  );
  assert.deepEqual(
    result.attacks.map((a) => a.damage),
    ["1d8+6", "1d8+3", "1d8"]
  );
  assert.ok(result.attacks.every((a) => a.kind === "melee"));

  assert.equal(result.capacities.length, 4);
  assert.deepEqual(
    result.capacities.map((c) => c.name),
    ["Attaque double (A)", "Charge (L)", "Hybride", "Discret"]
  );
  assert.ok(result.capacities.every((c) => c.text.length > 0));

  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.errors, []);
});

test("parseStatblock signale une erreur bloquante sans ligne NC", () => {
  const result = parseStatblock("Un texte quelconque sans statblock.");
  assert.ok(result.errors.length > 0);
  assert.equal(result.attacks.length, 0);
});

test("parseAttackLine reconnaît une attaque avec dégâts sur la même ligne", () => {
  const attack = parseAttackLine("Sabots +7 · DM 1d8+6");
  assert.deepEqual(attack, { name: "Sabots", kind: "melee", bonus: "+7", damage: "1d8+6", extra: "", range: null });
});

test("parseAttackLine ne reconnaît pas une ligne DM isolée (limite connue de la macro d'origine)", () => {
  assert.equal(parseAttackLine("DM 1d8+6"), null);
});

test("matchTitle sépare le nom de capacité du texte qui suit le deux-points", () => {
  assert.deepEqual(matchTitle("Charge (L) : texte"), { name: "Charge (L)", text: "texte" });
  assert.equal(matchTitle("Une phrase sans deux-points"), null);
});

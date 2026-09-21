import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseStatblock, parseAttackLine, matchTitle } from "./statblockParser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");
const centaure = fixture("centaure.txt");
const centaurePdfBrut = fixture("centaure-pdf-brut.txt");
const statblockUneLigne = fixture("statblock-une-ligne.txt");

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

  assert.equal(result.rawText, centaure);
  assert.ok(result.normalizedText.length > 0);
});

test("parseStatblock reconstruit un Centaure brut (bruit de page, césure, attaque coupée sur deux lignes)", () => {
  const result = parseStatblock(centaurePdfBrut);

  assert.equal(result.name, "Centaure");
  assert.equal(result.nc, 3);
  assert.deepEqual(result.errors, []);

  assert.equal(result.attacks.length, 3);
  assert.deepEqual(
    result.attacks.map((a) => a.name),
    ["Sabots", "Épée longue", "Arc long"]
  );
  assert.deepEqual(
    result.attacks.map((a) => a.damage),
    ["1d8+6", "1d8+3", "1d8"]
  );

  assert.ok(!result.warnings.some((w) => /DM 1d8\+6/.test(w)));
  assert.ok(!result.warnings.some((w) => /BESTIAIRE/i.test(w)));
  assert.ok(!result.warnings.some((w) => /INTRO/.test(w)));

  const hybride = result.capacities.find((c) => c.name === "Hybride");
  assert.ok(hybride);
  assert.ok(/piétine/.test(hybride.text));
  assert.ok(!/pié-/.test(hybride.text));
});

test("parseStatblock segmente un statblock entièrement collé sur une seule ligne", () => {
  const result = parseStatblock(statblockUneLigne);

  assert.equal(result.name, "Aigle commun");
  assert.equal(result.nc, 0.5);
  assert.equal(result.size, "small");
  assert.equal(Object.keys(result.abilities).length, 7);
  assert.equal(result.def, 13);
  assert.equal(result.hp, 3);
  assert.equal(result.init, 16);

  assert.equal(result.attacks.length, 1);
  assert.equal(result.attacks[0].name, "Serres");
  assert.equal(result.attacks[0].damage, "1d4");

  assert.equal(result.capacities.length, 1);
  assert.equal(result.capacities[0].name, "Vol rapide");
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

test("parseStatblock lit la réduction des DM (RD) après la Défense", () => {
  const result = parseStatblock(fixture("golem-rd.txt"));

  assert.equal(result.name, "Golem de pierre");
  assert.equal(result.category, "undead");
  assert.equal(result.def, 18);
  assert.equal(result.dr, 5);
  assert.deepEqual(result.errors, []);
});

test("parseStatblock reconnaît une attaque à distance avec portée", () => {
  const result = parseStatblock(fixture("archer-distance.txt"));

  const arc = result.attacks.find((a) => a.name.startsWith("Arc court"));
  assert.ok(arc);
  assert.equal(arc.kind, "ranged");
  assert.equal(arc.range, 20);
  assert.equal(arc.damage, "1d6");
});

test("parseStatblock reconnaît une taille non standard (colossale)", () => {
  const result = parseStatblock(fixture("dragon-taille.txt"));

  assert.equal(result.size, "colossal");
  assert.equal(result.nc, 12);
});

test("parseStatblock signale les avertissements sur un statblock imparfait", () => {
  const result = parseStatblock(fixture("ombre-avertissements.txt"));

  assert.equal(result.name, "Ombre errante");
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => /ligne\(s\) avant le nom ignorée\(s\)/.test(w)));
  assert.ok(result.warnings.some((w) => /Ligne non reconnue/.test(w)));
  assert.ok(result.warnings.some((w) => /Aucune attaque reconnue/.test(w)));
});

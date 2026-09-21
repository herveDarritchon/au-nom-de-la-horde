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

const codes = (diagnostics) => diagnostics.map((d) => d.code);
const byMessage = (diagnostics, re) => diagnostics.some((d) => re.test(d.message));

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

  assert.equal(result.defense, 15);
  assert.equal(result.hp, 30);
  assert.equal(result.initiative, 14);
  assert.equal(result.damageReduction, 0);

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
  assert.ok(result.attacks.every((a) => a.confidence === "high"));

  assert.equal(result.capacities.length, 4);
  assert.deepEqual(
    result.capacities.map((c) => c.name),
    ["Attaque double", "Charge", "Hybride", "Discret"]
  );
  assert.deepEqual(
    result.capacities.map((c) => c.actionType),
    ["A", "L", null, null]
  );
  assert.ok(result.capacities.every((c) => c.description.length > 0));
  assert.ok(result.capacities.every((c) => ["high", "medium", "low"].includes(c.confidence)));

  assert.deepEqual(result.diagnostics, []);

  assert.equal(result.source.rawText, centaure);
  assert.ok(result.source.normalizedText.length > 0);
});

test("parseStatblock reconstruit un Centaure brut (bruit de page, césure, attaque coupée sur deux lignes)", () => {
  const result = parseStatblock(centaurePdfBrut);

  assert.equal(result.name, "Centaure");
  assert.equal(result.nc, 3);
  assert.ok(!result.diagnostics.some((d) => d.severity === "error"));

  assert.equal(result.attacks.length, 3);
  assert.deepEqual(
    result.attacks.map((a) => a.name),
    ["Sabots", "Épée longue", "Arc long"]
  );
  assert.deepEqual(
    result.attacks.map((a) => a.damage),
    ["1d8+6", "1d8+3", "1d8"]
  );

  assert.ok(!byMessage(result.diagnostics, /DM 1d8\+6/));
  assert.ok(!byMessage(result.diagnostics, /BESTIAIRE/i));
  assert.ok(!byMessage(result.diagnostics, /INTRO/));

  const hybride = result.capacities.find((c) => c.name === "Hybride");
  assert.ok(hybride);
  assert.ok(/piétine/.test(hybride.description));
  assert.ok(!/pié-/.test(hybride.description));
});

test("parseStatblock segmente un statblock entièrement collé sur une seule ligne", () => {
  const result = parseStatblock(statblockUneLigne);

  assert.equal(result.name, "Aigle commun");
  assert.equal(result.nc, 0.5);
  assert.equal(result.size, "small");
  assert.equal(Object.keys(result.abilities).length, 7);
  assert.equal(result.defense, 13);
  assert.equal(result.hp, 3);
  assert.equal(result.initiative, 16);

  assert.equal(result.attacks.length, 1);
  assert.equal(result.attacks[0].name, "Serres");
  assert.equal(result.attacks[0].damage, "1d4");

  assert.equal(result.capacities.length, 1);
  assert.equal(result.capacities[0].name, "Vol rapide");
  assert.ok(!result.diagnostics.some((d) => d.severity === "error"));
});

test("parseStatblock signale une erreur bloquante sans ligne NC", () => {
  const result = parseStatblock("Un texte quelconque sans statblock.");
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  assert.ok(errors.length > 0);
  assert.ok(errors.every((d) => d.code === "MISSING_ABILITY"));
  assert.equal(result.attacks.length, 0);
});

test("parseAttackLine reconnaît une attaque avec dégâts sur la même ligne", () => {
  const attack = parseAttackLine("Sabots +7 · DM 1d8+6");
  assert.deepEqual(attack, {
    raw: "Sabots +7 · DM 1d8+6",
    name: "Sabots",
    kind: "melee",
    bonus: "+7",
    damage: "1d8+6",
    range: null,
    extra: "",
    confidence: "high",
  });
});

test("parseAttackLine ne reconnaît pas une ligne DM isolée (limite connue de la macro d'origine)", () => {
  assert.equal(parseAttackLine("DM 1d8+6"), null);
});

test("matchTitle sépare le nom de capacité du texte qui suit le deux-points, en extrayant le temps d'action", () => {
  assert.deepEqual(matchTitle("Charge (L) : texte"), {
    rawName: "Charge (L)",
    name: "Charge",
    description: "texte",
    actionType: "L",
    frequency: null,
    parameters: {},
    confidence: "high",
  });
  assert.equal(matchTitle("Une phrase sans deux-points"), null);
});

test("matchTitle abaisse la confiance sur une parenthèse qui n'est pas un type d'action (L/A/M/G)", () => {
  const capacity = matchTitle("Résistance (Golem) : texte");
  assert.equal(capacity.confidence, "medium");
});

test("parseStatblock lit la réduction des DM (RD) après la Défense", () => {
  const result = parseStatblock(fixture("golem-rd.txt"));

  assert.equal(result.name, "Golem de pierre");
  assert.equal(result.category, "undead");
  assert.equal(result.defense, 18);
  assert.equal(result.damageReduction, 5);
  assert.ok(!result.diagnostics.some((d) => d.severity === "error"));
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

test("parseStatblock signale les diagnostics sur un statblock imparfait", () => {
  const result = parseStatblock(fixture("ombre-avertissements.txt"));

  assert.equal(result.name, "Ombre errante");
  assert.ok(!result.diagnostics.some((d) => d.severity === "error"));
  assert.ok(codes(result.diagnostics).every((c) => c === "PDF_NOISE_REMOVED"));
  assert.ok(byMessage(result.diagnostics, /Notes du MJ/));
  assert.ok(byMessage(result.diagnostics, /Un murmure parcourt la salle/));
  assert.equal(result.attacks.length, 0);
});

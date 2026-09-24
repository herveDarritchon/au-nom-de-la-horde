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
const centaureSansNc = fixture("centaure-sans-nc.txt");
const statblockUneLigne = fixture("statblock-une-ligne.txt");
const scorpionGeant = fixture("scorpion-geant.txt");

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
  assert.deepEqual(
    result.capacities.map((c) => c.frequency),
    [null, null, null, null]
  );

  // « Charge » contient « test de FOR difficulté 16 » et « renversée » dans sa description : patterns niveau B
  // reconnus mais non structurés (§17 Niveau B), signalés en diagnostic informatif sans bloquer l'import ni
  // modifier le texte source.
  assert.ok(codes(result.diagnostics).every((c) => c === "UNSUPPORTED_AUTOMATION"));
  assert.ok(byMessage(result.diagnostics, /renversée/));
  assert.ok(byMessage(result.diagnostics, /test de FOR difficulté 16/));

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

test("parseStatblock n'échoue plus bloquant sur l'absence de NC, mais signale toujours les autres champs requis manquants", () => {
  const result = parseStatblock("Un texte quelconque sans statblock.");
  assert.equal(result.nc, null);
  assert.ok(!result.diagnostics.some((d) => d.sourceFragment === "NC"));
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  assert.ok(errors.length > 0);
  assert.ok(errors.every((d) => d.code === "MISSING_ABILITY"));
  assert.equal(result.attacks.length, 0);
});

test("parseStatblock importe le Centaure du Bestiaire officiel sans NC, avec préfixes OCR (S)/(V)/(I) pour DEF/PV/Init", () => {
  const result = parseStatblock(centaureSansNc);

  assert.equal(result.name, "Centaure");
  assert.equal(result.nc, null);
  assert.equal(result.category, "humanoid");
  assert.equal(result.size, "large");

  assert.equal(result.defense, 15);
  assert.equal(result.hp, 30);
  assert.equal(result.initiative, 14);

  assert.equal(result.attacks.length, 3);
  assert.deepEqual(
    result.attacks.map((a) => a.name),
    ["Sabots", "Épée longue", "Arc long"]
  );
  assert.deepEqual(
    result.attacks.map((a) => a.damage),
    ["1d8+6", "1d8+3", "1d8"]
  );

  const blockingCodes = ["NC", "Défense", "Points de vigueur", "Initiative"];
  assert.ok(!result.diagnostics.some((d) => blockingCodes.includes(d.sourceFragment)));
});

test("les regex DEF/PV/Init acceptent le préfixe décoratif (S)/(V)/(I), espacé ou non, avec « : » ou « . » optionnels", () => {
  const variants = [
    "DEF 15",
    "(S)DEF 15",
    "(S) DEF 15",
    "(S)DEF: 15",
    "PV 30",
    "(V)PV 30",
    "(V) PV 30",
    "(V)PV: 30",
    "Init. 14",
    "(I)Init. 14",
    "(I) Init. 14",
    "(I)Init 14",
  ];
  for (const line of variants) {
    const statblock = `Aigle commun\n| NC 1\ntaille petite\nAGI +3 CON +2 FOR -3 PER +4 CHA +0 INT -4 VOL +0\n${line}\n`;
    const result = parseStatblock(statblock);
    assert.ok(
      result.defense === 15 || result.hp === 30 || result.initiative === 14,
      `variante non reconnue : « ${line} »`
    );
  }
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

test("parseStatblock détecte la fréquence explicite d'une capacité (« 1 fois/combat »)", () => {
  const result = parseStatblock(fixture("golem-rd.txt").replace("La créature inflige des DM supplémentaires si la cible est au sol.", "1 fois/combat, la créature inflige des DM supplémentaires si la cible est au sol."));

  const ecrasement = result.capacities.find((c) => c.name === "Écrasement");
  assert.deepEqual(ecrasement.frequency, { period: "combat", confidence: "high" });
  assert.equal(codes(result.diagnostics).includes("UNSUPPORTED_AUTOMATION"), false);
});

test("parseStatblock ne bloque jamais la création et n'ajoute aucun diagnostic sur une capacité sans pattern niveau B", () => {
  const result = parseStatblock(fixture("golem-rd.txt"));

  const ecrasement = result.capacities.find((c) => c.name === "Écrasement");
  assert.equal(ecrasement.frequency, null);
  assert.deepEqual(result.diagnostics, []);
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
  assert.ok(codes(result.diagnostics).every((c) => c === "PDF_NOISE_REMOVED" || c === "UNSUPPORTED_AUTOMATION"));
  assert.ok(byMessage(result.diagnostics, /Notes du MJ/));
  assert.ok(byMessage(result.diagnostics, /Un murmure parcourt la salle/));
  // « Toucher glacial » contient « test de VOL difficulté 14 » : pattern niveau B reconnu mais non structuré.
  assert.ok(byMessage(result.diagnostics, /test de VOL difficulté 14/));
  assert.equal(result.attacks.length, 0);
});

test("parseStatblock détecte les capacités de créature successives du Scorpion géant (issue #41) : VERMINE, CUIRASSÉ, POISON, sans confusion avec les attaques ni absorption mutuelle", () => {
  const result = parseStatblock(scorpionGeant);

  assert.equal(result.name, "Arthropode (moyen)");
  assert.equal(result.nc, 3);

  // Les attaques restent des attaques, jamais confondues avec les capacités qui suivent.
  assert.equal(result.attacks.length, 2);
  assert.deepEqual(
    result.attacks.map((a) => a.name),
    ["Pinces", "Dard"]
  );
  assert.deepEqual(
    result.attacks.map((a) => a.damage),
    ["2d6+3", "1d4"]
  );

  // « Capacités communes » est un en-tête de section, pas une capacité (pas de deux-points) : bruit résiduel.
  assert.deepEqual(codes(result.diagnostics), ["PDF_NOISE_REMOVED"]);
  assert.ok(byMessage(result.diagnostics, /Capacités communes/));

  // 3 capacités détectées dans l'ordre, sans liste fermée : le nom et la description multi-ligne complète sont
  // conservés, aucune n'absorbe le texte de la suivante.
  assert.equal(result.capacities.length, 3);
  assert.deepEqual(
    result.capacities.map((c) => c.name),
    ["Vermine", "Cuirassé", "Poison"]
  );

  const vermine = result.capacities.find((c) => c.name === "Vermine");
  assert.equal(
    vermine.description,
    "Tous les arthropodes géants obtiennent un dé bonus en FOR, en AGI et en CON, et lorsque la créature atteint 0 PV, elle peut encore agir 1 round complet. Ils sont rapides et se déplacent de 15 m par action de mouvement."
  );
  assert.ok(!/CUIRASSÉ/i.test(vermine.description), "Vermine ne doit pas absorber le texte de Cuirassé");

  const cuirasse = result.capacities.find((c) => c.name === "Cuirassé");
  assert.equal(cuirasse.description, "La créature bénéficie d'une RD 5 contre les armes.");
  assert.ok(!/POISON/i.test(cuirasse.description), "Cuirassé ne doit pas absorber le texte de Poison");

  const poison = result.capacities.find((c) => c.name === "Poison");
  assert.equal(
    poison.description,
    "Le poison inflige des DM supplémentaires à la victime à chaque attaque (voir les profils). Si le PJ réussit un test de CON de la difficulté indiquée, il ne subit que ½ DM."
  );

  // Les bonus `*` du statblock (`AGI +4*`, `CON +3*`, `FOR +3*`) sont déjà représentés dans `result.abilities` :
  // le parseur n'applique aucun effet réel pour `Vermine`, donc pas de risque de double application du bonus.
  assert.deepEqual(result.abilities.agi, { base: 4, superior: true });
  assert.deepEqual(result.abilities.con, { base: 3, superior: true });
  assert.deepEqual(result.abilities.for, { base: 3, superior: true });
});

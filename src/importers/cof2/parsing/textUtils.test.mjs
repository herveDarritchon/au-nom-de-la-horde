import { test } from "node:test";
import assert from "node:assert/strict";

import { tidyCase, cleanName, toSigned } from "./textUtils.mjs";

test("tidyCase capitalise un texte tout en majuscules et met les mots en minuscule", () => {
  assert.equal(tidyCase("ARAIGNÉE GÉANTE"), "Araignée géante");
});

test("tidyCase préserve les acronymes COF2 connus", () => {
  assert.equal(tidyCase("GARDE DM ÉLITE"), "Garde DM élite");
});

test("tidyCase préserve une parenthèse à une seule lettre (ex: capacité (A))", () => {
  assert.equal(tidyCase("ATTAQUE DOUBLE (A)"), "Attaque double (A)");
});

test("tidyCase laisse inchangé un texte déjà en casse mixte", () => {
  assert.equal(tidyCase("Araignée Géante"), "Araignée Géante");
});

test("cleanName retire les lettres isolées laissées par les pictogrammes PDF", () => {
  assert.equal(cleanName("W W ARAIGNÉE GÉANTE"), "Araignée géante");
});

test("cleanName laisse un nom sans lettres isolées inchangé (hors casse)", () => {
  assert.equal(cleanName("CENTAURE"), "Centaure");
});

test("cleanName retire les espaces superflus en tête et en fin de chaîne", () => {
  assert.equal(cleanName("  CENTAURE  "), "Centaure");
});

test("toSigned normalise le signe moins unicode et retire les espaces", () => {
  assert.equal(toSigned("− 3"), "-3");
});

test("toSigned normalise le tiret cadratin unicode", () => {
  assert.equal(toSigned("– 5"), "-5");
});

test("toSigned laisse un signe plus ASCII inchangé", () => {
  assert.equal(toSigned("+3"), "+3");
});

test("toSigned retire tous les espaces internes", () => {
  assert.equal(toSigned(" +  3 "), "+3");
});

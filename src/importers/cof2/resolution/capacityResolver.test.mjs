import { test } from "node:test";
import assert from "node:assert/strict";

import { normalize, stripParens, extractActionType, makeCapacityResolver } from "./capacityResolver.mjs";

test("normalize retire les accents et met en minuscule", () => {
  assert.equal(normalize("Résistance"), "resistance");
});

test("stripParens retire un paramètre entre parenthèses en fin de nom", () => {
  assert.equal(stripParens("Charge (15)"), "Charge");
});

test("extractActionType sépare le temps d'action du nom", () => {
  assert.deepEqual(extractActionType("Charge (L)"), { name: "Charge", actionType: "L" });
  assert.deepEqual(extractActionType("Frappe (A)"), { name: "Frappe", actionType: "A" });
  assert.deepEqual(extractActionType("Morsure (M)"), { name: "Morsure", actionType: "M" });
  assert.deepEqual(extractActionType("Rugissement (G)"), { name: "Rugissement", actionType: "G" });
});

test("extractActionType laisse un nom sans suffixe d'action inchangé", () => {
  assert.deepEqual(extractActionType("Discret"), { name: "Discret", actionType: null });
});

test("extractActionType laisse un paramètre non-action intact sur le nom", () => {
  assert.deepEqual(extractActionType("Vol (rapide)"), { name: "Vol (rapide)", actionType: null });
  assert.deepEqual(extractActionType("Charge (13)"), { name: "Charge (13)", actionType: null });
});

const officialEntries = [
  { _id: "1", name: "Charge (13)", folder: "folder-a" },
  { _id: "2", name: "Charge (15)", folder: "folder-b" },
  { _id: "3", name: "Résistance", folder: "folder-a" },
  { _id: "4", name: "Résistance", folder: "folder-b" },
  { _id: "5", name: "Discret", folder: "folder-a" },
  { _id: "6", name: "Vol (rapide)", folder: "folder-a" },
];

const importedEntries = [{ _id: "10", name: "Discret pro", folder: "world-lib" }];

test("makeCapacityResolver résout EXACT_REUSE sur une correspondance officielle exacte", () => {
  const resolve = makeCapacityResolver({ officialEntries });
  assert.deepEqual(resolve("Discret"), { status: "EXACT_REUSE", entry: officialEntries[4] });
});

test("makeCapacityResolver applique le dossier prioritaire sur un homonyme exact identique", () => {
  const resolve = makeCapacityResolver({ officialEntries, priorityFolderId: "folder-b" });
  assert.deepEqual(resolve("Résistance"), { status: "EXACT_REUSE", entry: officialEntries[3] });
});

test("makeCapacityResolver retombe sur la première entrée sans dossier prioritaire", () => {
  const resolve = makeCapacityResolver({ officialEntries });
  assert.deepEqual(resolve("Résistance"), { status: "EXACT_REUSE", entry: officialEntries[2] });
});

test("makeCapacityResolver résout TEMPLATE_VARIANT sans jamais renvoyer EXACT_REUSE pour un paramètre différent", () => {
  const resolve = makeCapacityResolver({ officialEntries: [{ _id: "1", name: "Charge (13)", folder: "folder-a" }] });
  const result = resolve("Charge (difficulté 16)");
  assert.equal(result.status, "TEMPLATE_VARIANT");
  assert.notEqual(result.status, "EXACT_REUSE");
});

test("makeCapacityResolver résout TEMPLATE_VARIANT sur une variante paramétrée non ambiguë", () => {
  const resolve = makeCapacityResolver({ officialEntries });
  assert.deepEqual(resolve("Vol (lent)"), { status: "TEMPLATE_VARIANT", entry: officialEntries[5] });
});

test("makeCapacityResolver signale AMBIGUOUS sur une variante paramétrée à plusieurs candidats", () => {
  const resolve = makeCapacityResolver({ officialEntries });
  assert.deepEqual(resolve("Charge"), { status: "AMBIGUOUS", candidates: ["Charge (13)", "Charge (15)"] });
});

test("makeCapacityResolver résout REUSE_IMPORTED quand seule la bibliothèque d'import correspond", () => {
  const resolve = makeCapacityResolver({ officialEntries, importedEntries });
  assert.deepEqual(resolve("Discret pro"), { status: "REUSE_IMPORTED", entry: importedEntries[0] });
});

test("makeCapacityResolver ne redescend jamais vers la bibliothèque d'import quand l'officiel est ambigu", () => {
  const resolve = makeCapacityResolver({
    officialEntries,
    importedEntries: [{ _id: "11", name: "Charge", folder: "world-lib" }],
  });
  assert.equal(resolve("Charge").status, "AMBIGUOUS");
});

test("makeCapacityResolver résout NOT_FOUND quand aucune source ne correspond", () => {
  const resolve = makeCapacityResolver({ officialEntries, importedEntries });
  assert.deepEqual(resolve("Capacité inconnue"), { status: "NOT_FOUND" });
});

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
  assert.deepEqual(resolve("Discret"), { status: "EXACT_REUSE", entry: officialEntries[4], source: "cof2" });
});

test("makeCapacityResolver applique le dossier prioritaire sur un homonyme exact identique", () => {
  const resolve = makeCapacityResolver({ officialEntries, priorityFolderId: "folder-b" });
  assert.deepEqual(resolve("Résistance"), { status: "EXACT_REUSE", entry: officialEntries[3], source: "cof2" });
});

test("makeCapacityResolver signale AMBIGUOUS pour un doublon de nom exact sans dossier prioritaire (issue #36)", () => {
  const resolve = makeCapacityResolver({ officialEntries });
  assert.deepEqual(resolve("Résistance"), {
    status: "AMBIGUOUS",
    candidates: ["Résistance [folder:folder-a id:3]", "Résistance [folder:folder-b id:4]"],
  });
});

test("makeCapacityResolver résout TEMPLATE_VARIANT sans jamais renvoyer EXACT_REUSE pour un paramètre différent", () => {
  const resolve = makeCapacityResolver({ officialEntries: [{ _id: "1", name: "Charge (13)", folder: "folder-a" }] });
  const result = resolve("Charge (difficulté 16)");
  assert.equal(result.status, "TEMPLATE_VARIANT");
  assert.notEqual(result.status, "EXACT_REUSE");
});

test("makeCapacityResolver résout TEMPLATE_VARIANT sur une variante paramétrée non ambiguë", () => {
  const resolve = makeCapacityResolver({ officialEntries });
  assert.deepEqual(resolve("Vol (lent)"), { status: "TEMPLATE_VARIANT", entry: officialEntries[5], source: "cof2" });
});

test("makeCapacityResolver signale AMBIGUOUS sur une variante paramétrée à plusieurs candidats", () => {
  const resolve = makeCapacityResolver({ officialEntries });
  assert.deepEqual(resolve("Charge"), { status: "AMBIGUOUS", candidates: ["Charge (13)", "Charge (15)"] });
});

test("makeCapacityResolver résout REUSE_IMPORTED quand seule la bibliothèque d'import correspond", () => {
  const resolve = makeCapacityResolver({ officialEntries, importedEntries });
  assert.deepEqual(resolve("Discret pro"), { status: "REUSE_IMPORTED", entry: importedEntries[0], source: "library" });
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

// --- Issue #32 : compendiums Warbound en priorité 1 ---

const warboundEntries = [
  { _id: "20", name: "Discret", folder: "wb-folder" },
  { _id: "21", name: "Attaque double (A)", folder: "wb-folder" },
];

test("makeCapacityResolver réutilise la capacité Warbound avant un homonyme officiel COF2", () => {
  const resolve = makeCapacityResolver({ warboundEntries, officialEntries });
  assert.deepEqual(resolve("Discret"), { status: "EXACT_REUSE", entry: warboundEntries[0], source: "warbound" });
});

test("makeCapacityResolver résout TEMPLATE_VARIANT depuis Warbound avant de considérer l'officiel COF2", () => {
  const resolve = makeCapacityResolver({ warboundEntries, officialEntries });
  assert.deepEqual(resolve("Attaque double (L)"), { status: "TEMPLATE_VARIANT", entry: warboundEntries[1], source: "warbound" });
});

test("makeCapacityResolver retombe sur l'officiel COF2 quand Warbound ne correspond pas", () => {
  const resolve = makeCapacityResolver({ warboundEntries, officialEntries });
  assert.deepEqual(resolve("Vol (lent)"), { status: "TEMPLATE_VARIANT", entry: officialEntries[5], source: "cof2" });
});

test("makeCapacityResolver retombe sur la bibliothèque d'import quand ni Warbound ni COF2 ne correspondent", () => {
  const resolve = makeCapacityResolver({ warboundEntries, officialEntries, importedEntries });
  assert.deepEqual(resolve("Discret pro"), { status: "REUSE_IMPORTED", entry: importedEntries[0], source: "library" });
});

test("makeCapacityResolver applique le dossier prioritaire Warbound sur un homonyme Warbound exact", () => {
  const homonyms = [
    { _id: "30", name: "Discret", folder: "wb-a" },
    { _id: "31", name: "Discret", folder: "wb-b" },
  ];
  const resolve = makeCapacityResolver({ warboundEntries: homonyms, officialEntries, warboundPriorityFolderId: "wb-b" });
  assert.deepEqual(resolve("Discret"), { status: "EXACT_REUSE", entry: homonyms[1], source: "warbound" });
});

test("makeCapacityResolver ignore Warbound quand warboundEntries est absent (non-régression)", () => {
  const resolve = makeCapacityResolver({ officialEntries, importedEntries });
  assert.deepEqual(resolve("Discret"), { status: "EXACT_REUSE", entry: officialEntries[4], source: "cof2" });
});

// --- Issue #35 : correspondance exacte prioritaire sur une variante paramétrée, toutes sources confondues ---

test("makeCapacityResolver préfère une correspondance exacte officielle à une variante Warbound de même nom", () => {
  const resolve = makeCapacityResolver({
    warboundEntries: [{ _id: "40", name: "Charge (13)", folder: "wb-folder" }],
    officialEntries: [{ _id: "41", name: "Charge", folder: "folder-a" }],
  });
  assert.deepEqual(resolve("Charge"), { status: "EXACT_REUSE", entry: { _id: "41", name: "Charge", folder: "folder-a" }, source: "cof2" });
});

test("makeCapacityResolver préfère une correspondance exacte à une variante paramétrée au sein de la même source", () => {
  const mixed = [
    { _id: "50", name: "Charge", folder: "folder-a" },
    { _id: "51", name: "Charge (13)", folder: "folder-a" },
  ];
  const resolve = makeCapacityResolver({ officialEntries: mixed });
  assert.deepEqual(resolve("Charge"), { status: "EXACT_REUSE", entry: mixed[0], source: "cof2" });
});

test("makeCapacityResolver résout toujours TEMPLATE_VARIANT quand aucune entrée exacte ne correspond au nom demandé", () => {
  const resolve = makeCapacityResolver({ officialEntries: [{ _id: "51", name: "Charge (13)", folder: "folder-a" }] });
  assert.deepEqual(resolve("Charge (16)"), {
    status: "TEMPLATE_VARIANT",
    entry: { _id: "51", name: "Charge (13)", folder: "folder-a" },
    source: "cof2",
  });
});

// --- Issue #36 : doublons de nom exact au sein d'une même source ---

test("makeCapacityResolver tranche un doublon exact « Charge » via le dossier prioritaire configuré", () => {
  const duplicates = [
    { _id: "60", name: "Charge", folder: "folder-a" },
    { _id: "61", name: "Charge", folder: "folder-b" },
  ];
  const resolve = makeCapacityResolver({ officialEntries: duplicates, priorityFolderId: "folder-b" });
  assert.deepEqual(resolve("Charge"), { status: "EXACT_REUSE", entry: duplicates[1], source: "cof2" });
});

test("makeCapacityResolver signale AMBIGUOUS pour un doublon exact « Charge » sans dossier prioritaire tranchant", () => {
  const duplicates = [
    { _id: "60", name: "Charge", folder: "folder-a" },
    { _id: "61", name: "Charge", folder: "folder-b" },
  ];
  const resolve = makeCapacityResolver({ officialEntries: duplicates });
  assert.deepEqual(resolve("Charge"), {
    status: "AMBIGUOUS",
    candidates: ["Charge [folder:folder-a id:60]", "Charge [folder:folder-b id:61]"],
  });
});

test("makeCapacityResolver signale AMBIGUOUS pour un doublon exact Warbound sans dossier prioritaire tranchant", () => {
  const duplicates = [
    { _id: "70", name: "Discret", folder: "wb-a" },
    { _id: "71", name: "Discret", folder: "wb-c" },
  ];
  const resolve = makeCapacityResolver({ warboundEntries: duplicates, officialEntries, warboundPriorityFolderId: "wb-b" });
  assert.deepEqual(resolve("Discret"), {
    status: "AMBIGUOUS",
    candidates: ["Discret [folder:wb-a id:70]", "Discret [folder:wb-c id:71]"],
  });
});

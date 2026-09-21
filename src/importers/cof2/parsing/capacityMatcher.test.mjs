import { test } from "node:test";
import assert from "node:assert/strict";

import { normalize, stripParens, makeCapacityMatcher } from "./capacityMatcher.mjs";

test("normalize retire les accents et met en minuscule", () => {
  assert.equal(normalize("Résistance"), "resistance");
});

test("normalize uniformise les apostrophes courbes", () => {
  assert.equal(normalize("L’Épée"), "l'epee");
});

test("normalize retire la ponctuation non alphanumérique restante", () => {
  assert.equal(normalize("Charge (15) !"), "charge 15");
});

test("stripParens retire un paramètre entre parenthèses en fin de nom", () => {
  assert.equal(stripParens("Charge (15)"), "Charge");
});

test("stripParens retire les parenthèses avec contenu textuel", () => {
  assert.equal(stripParens("Résistance (Golem)"), "Résistance");
});

test("stripParens laisse un nom sans parenthèses inchangé", () => {
  assert.equal(stripParens("Discret"), "Discret");
});

const entries = [
  { _id: "1", name: "Charge (13)", folder: "folder-a" },
  { _id: "2", name: "Charge (15)", folder: "folder-b" },
  { _id: "3", name: "Résistance", folder: "folder-a" },
  { _id: "4", name: "Résistance", folder: "folder-b" },
  { _id: "5", name: "Discret", folder: "folder-a" },
  { _id: "6", name: "Vol (rapide)", folder: "folder-a" },
];

test("makeCapacityMatcher trouve une correspondance exacte non ambiguë", () => {
  const match = makeCapacityMatcher(entries)("Discret");
  assert.deepEqual(match, { entry: entries[4], approximate: false });
});

test("makeCapacityMatcher applique le dossier prioritaire en cas d'homonyme exact", () => {
  const match = makeCapacityMatcher(entries, "folder-b")("Résistance");
  assert.deepEqual(match, { entry: entries[3], approximate: false });
});

test("makeCapacityMatcher retombe sur la première entrée sans dossier prioritaire", () => {
  const match = makeCapacityMatcher(entries)("Résistance");
  assert.deepEqual(match, { entry: entries[2], approximate: false });
});

test("makeCapacityMatcher trouve une correspondance approximative sans ambiguïté (paramètre différent)", () => {
  const match = makeCapacityMatcher(entries)("Vol (lent)");
  assert.deepEqual(match, { entry: entries[5], approximate: true });
});

test("makeCapacityMatcher signale une correspondance ambiguë", () => {
  const match = makeCapacityMatcher(entries)("Charge");
  assert.deepEqual(match, { ambiguous: ["Charge (13)", "Charge (15)"] });
});

test("makeCapacityMatcher retourne null en l'absence de correspondance", () => {
  const match = makeCapacityMatcher(entries)("Capacité inconnue");
  assert.equal(match, null);
});

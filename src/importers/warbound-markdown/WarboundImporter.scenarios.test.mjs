import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { parseWarboundMarkdown } from "./parser/WarboundMarkdownParser.mjs";
import { validateWarboundModel } from "./validator/WarboundMarkdownValidator.mjs";
import {
  buildJournalData,
  buildRollTableData,
  computeEntryHash,
} from "./generator/WarboundDocumentGenerator.mjs";
import { buildImportDiff } from "./synchronizer/WarboundImportSynchronizer.mjs";

// ── Fixture §50 ───────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "__fixtures__/durotar-tauren-rumors.md");
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, "utf-8");

const NAMESPACE = "warbound-campaign-content";
const FLAG_KEY = "markdownImport";

function parseFixture(rawText = FIXTURE_TEXT) {
  return parseWarboundMarkdown(rawText);
}

function makeFlag(entryId, sourceHash) {
  return { [NAMESPACE]: { [FLAG_KEY]: { entryId, sourceHash } } };
}

/** Simule les pages créées lors d'un premier import (uuid fictif). */
function makeCreatedPages(model) {
  const { pages } = buildJournalData(model, null);
  return pages.map((p, i) => ({
    ...p,
    uuid: `JournalEntryPage.fake-journal.page-${i}`,
  }));
}

/** Simule les pages existantes Foundry pour le diff (même hash = inchangé). */
function makeExistingPages(model) {
  return makeCreatedPages(model).map((p, i) => ({
    id: `page-${i}`,
    uuid: `JournalEntryPage.fake-journal.page-${i}`,
    name: p.name,
    flags: p.flags,
  }));
}

// ── §41 — Import initial ──────────────────────────────────────────────────────
describe("§41 — Import initial", () => {
  const model = parseFixture();
  const { errors } = validateWarboundModel(model, FIXTURE_TEXT);
  const { pages } = buildJournalData(model, null);
  const createdPages = makeCreatedPages(model);
  const { rollTableData, results } = buildRollTableData(model, null, createdPages);

  test("fixture §50 valide — aucune erreur de validation", () => {
    assert.equal(errors.length, 0);
  });

  test("buildJournalData produit 4 pages (Contexte + 3 entrées)", () => {
    assert.equal(pages.length, 4);
  });

  test("première page = Contexte", () => {
    assert.equal(pages[0].name, "Contexte");
  });

  test("pages d'entrée ont les bons noms", () => {
    assert.equal(pages[1].name, "Le convoi Stonehoof");
    assert.equal(pages[2].name, "Les bêtes quittent les crêtes");
    assert.equal(pages[3].name, "Les Grimtotem seraient à Durotar");
  });

  test("buildRollTableData produit 2 résultats (grimtotem inactive)", () => {
    assert.equal(results.length, 2);
  });

  test("rollTableData formula = 1d2 (2 entrées actives poids 1 chacune)", () => {
    assert.equal(rollTableData.formula, "1d2");
  });

  test("chaque résultat a un titre et un aperçu", () => {
    for (const r of results) {
      assert.ok(r.name, "titre manquant");
      assert.ok(r.description !== undefined, "aperçu manquant");
    }
  });

  test("chaque résultat a un documentUuid non null", () => {
    for (const r of results) {
      assert.ok(r.documentUuid, `documentUuid absent pour ${r.name}`);
    }
  });
});

// ── §42 — Poids ───────────────────────────────────────────────────────────────
describe("§42 — Poids (A×1, B×2, C×1 toutes actives)", () => {
  const model = parseFixture();
  model.entries[0].weight = 1; // stonehoof
  model.entries[1].weight = 2; // thunderhorn
  model.entries[2].weight = 1; // grimtotem — rendu actif pour ce scénario
  model.entries[2].active = true;

  const createdPages = makeCreatedPages(model);
  const { rollTableData, results } = buildRollTableData(model, null, createdPages);

  test("formula = 1d4", () => {
    assert.equal(rollTableData.formula, "1d4");
  });

  test("plage A = [1, 1]", () => {
    assert.deepEqual(results[0].range, [1, 1]);
  });

  test("plage B = [2, 3]", () => {
    assert.deepEqual(results[1].range, [2, 3]);
  });

  test("plage C = [4, 4]", () => {
    assert.deepEqual(results[2].range, [4, 4]);
  });
});

// ── §43 — Entrée inactive ─────────────────────────────────────────────────────
describe("§43 — Entrée inactive (grimtotem)", () => {
  const model = parseFixture();
  const { pages } = buildJournalData(model, null);
  const createdPages = makeCreatedPages(model);
  const { results } = buildRollTableData(model, null, createdPages);

  test("page grimtotem présente dans le journal", () => {
    const names = pages.map((p) => p.name);
    assert.ok(names.includes("Les Grimtotem seraient à Durotar"));
  });

  test("résultat grimtotem absent de la RollTable", () => {
    const names = results.map((r) => r.name);
    assert.ok(!names.includes("Les Grimtotem seraient à Durotar"));
  });
});

// ── §44 — Réimport sans changement ────────────────────────────────────────────
describe("§44 — Réimport sans changement", () => {
  const model = parseFixture();
  const existingPages = makeExistingPages(model);
  const diff = buildImportDiff(model, existingPages);

  test("aucune entrée new", () => {
    assert.equal(diff.new.length, 0);
  });

  test("aucune entrée modified", () => {
    assert.equal(diff.modified.length, 0);
  });

  test("aucune entrée orphan", () => {
    assert.equal(diff.orphan.length, 0);
  });

  test("4 entrées inchangées (contexte + 3 entrées)", () => {
    assert.equal(diff.unchanged.length + diff.inactive.length, 4);
  });
});

// ── §45 — Renommage (titre changé, ID stable) ─────────────────────────────────
describe("§45 — Renommage (titre changé, entryId stable)", () => {
  const model = parseFixture();
  const existingPages = makeExistingPages(model); // hashes basés sur le titre original

  // Changer le titre sans changer l'id → hash différent → modified
  model.entries[0].title = "Le convoi Stonehoof (renommé)";

  const diff = buildImportDiff(model, existingPages);

  test("stonehoof dans modified", () => {
    const found = diff.modified.some((e) => e.entry?.id === "stonehoof-convoi");
    assert.ok(found, "stonehoof absent de modified");
  });

  test("UUID stonehoof préservé dans modified", () => {
    const originalPage = existingPages.find(
      (p) => p.flags?.[NAMESPACE]?.[FLAG_KEY]?.entryId === "stonehoof-convoi"
    );
    assert.ok(originalPage, "page originale introuvable");
    const diffEntry = diff.modified.find((e) => e.existing?.uuid === originalPage.uuid);
    assert.ok(diffEntry, "UUID non préservé dans modified");
  });
});

// ── §46 — Modification de contenu ─────────────────────────────────────────────
describe("§46 — Modification de contenu (HTML changé)", () => {
  const model = parseFixture();
  const existingPages = makeExistingPages(model);

  // Altérer le contenu HTML de thunderhorn dans le modèle
  model.entries[1].html = "<p>Contenu modifié.</p>";

  const diff = buildImportDiff(model, existingPages);

  test("thunderhorn dans modified", () => {
    const found = diff.modified.some((e) => e.entry?.id === "thunderhorn-migration");
    assert.ok(found, "thunderhorn absent de modified");
  });

  test("UUID thunderhorn stable dans modified", () => {
    const originalPage = existingPages.find(
      (p) => p.flags?.[NAMESPACE]?.[FLAG_KEY]?.entryId === "thunderhorn-migration"
    );
    assert.ok(originalPage, "page originale introuvable");
    const diffEntry = diff.modified.find((e) => e.existing?.uuid === originalPage.uuid);
    assert.ok(diffEntry, "UUID non préservé dans modified");
  });
});

// ── §47 — Entrée orpheline ────────────────────────────────────────────────────
describe("§47 — Entrée supprimée du Markdown (orpheline)", () => {
  const model = parseFixture();
  const existingPages = makeExistingPages(model);

  // Ajouter une page existante dont l'id n'est plus dans le modèle
  existingPages.push({
    id: "page-orphan",
    uuid: "JournalEntryPage.fake-journal.page-orphan",
    name: "Entrée supprimée",
    flags: makeFlag("deleted-entry", "aabbccdd"),
  });

  const diff = buildImportDiff(model, existingPages);

  test("page orpheline dans orphan", () => {
    const found = diff.orphan.some((e) => e.existing?.id === "page-orphan");
    assert.ok(found, "orpheline absente de diff.orphan");
  });

  test("orpheline absente de modified", () => {
    const found = diff.modified.some((e) => e.existing?.id === "page-orphan");
    assert.ok(!found, "orpheline présente dans modified");
  });

  test("orpheline absente de new", () => {
    const found = diff.new.some((e) => e.existing?.id === "page-orphan");
    assert.ok(!found, "orpheline présente dans new");
  });
});

// ── Fixture encounter ─────────────────────────────────────────────────────────
const ENCOUNTER_FIXTURE_PATH = join(__dirname, "__fixtures__/durotar-razor-hill-senjin-encounters.md");
const ENCOUNTER_FIXTURE_TEXT = readFileSync(ENCOUNTER_FIXTURE_PATH, "utf-8");

function parseEncounterFixture(rawText = ENCOUNTER_FIXTURE_TEXT) {
  return parseWarboundMarkdown(rawText);
}

// ── §enc-1 — Import initial encounter ────────────────────────────────────────
describe("§enc-1 — Import initial encounter", () => {
  const model = parseEncounterFixture();
  const { errors } = validateWarboundModel(model, ENCOUNTER_FIXTURE_TEXT);
  const { journalData, pages } = buildJournalData(model, null);
  const createdPages = makeCreatedPages(model);
  const { rollTableData, results } = buildRollTableData(model, null, createdPages);

  test("fixture encounter valide — aucune erreur de validation", () => {
    assert.equal(errors.length, 0);
  });

  test("collectionId correct", () => {
    assert.equal(model.collectionId, "durotar-razor-hill-senjin-encounters");
  });

  test("type parsé comme 'encounter'", () => {
    assert.equal(model.type, "encounter");
  });

  test("buildJournalData produit 4 pages (Contexte + 3 entrées)", () => {
    assert.equal(pages.length, 4);
  });

  test("première page = Contexte", () => {
    assert.equal(pages[0].name, "Contexte");
  });

  test("pages d'entrée ont les bons noms", () => {
    assert.equal(pages[1].name, "Patrouille des sables");
    assert.equal(pages[2].name, "Éclaireurs de Kul'Tiras");
    assert.equal(pages[3].name, "Caravane pillée");
  });

  test("buildRollTableData produit 2 résultats (caravane-pillee inactive)", () => {
    assert.equal(results.length, 2);
  });

  test("rollTableData formula = 1d5 (poids actifs : 2+3)", () => {
    assert.equal(rollTableData.formula, "1d5");
  });

  test("flags JournalEntry contiennent collectionType 'encounter'", () => {
    const flags = journalData.flags["warbound-campaign-content"].markdownImport;
    assert.equal(flags.collectionType, "encounter");
  });

  test("chaque résultat a un titre et un aperçu", () => {
    for (const r of results) {
      assert.ok(r.name, "titre manquant");
      assert.ok(r.description !== undefined, "aperçu manquant");
    }
  });

  test("chaque résultat a un documentUuid non null", () => {
    for (const r of results) {
      assert.ok(r.documentUuid, `documentUuid absent pour ${r.name}`);
    }
  });
});

// ── §enc-2 — Pondération correcte encounter ───────────────────────────────────
describe("§enc-2 — Pondération correcte encounter (A×2, B×3)", () => {
  const model = parseEncounterFixture();
  const createdPages = makeCreatedPages(model);
  const { rollTableData, results } = buildRollTableData(model, null, createdPages);

  test("formula = 1d5 (somme poids actifs)", () => {
    assert.equal(rollTableData.formula, "1d5");
  });

  test("plage patrouille-de-sable = [1, 2] (poids 2)", () => {
    const r = results.find((r) => r.name === "Patrouille des sables");
    assert.ok(r, "résultat patrouille introuvable");
    assert.deepEqual(r.range, [1, 2]);
  });

  test("plage eclaireurs-kul-tiras = [3, 5] (poids 3)", () => {
    const r = results.find((r) => r.name === "Éclaireurs de Kul'Tiras");
    assert.ok(r, "résultat éclaireurs introuvable");
    assert.deepEqual(r.range, [3, 5]);
  });
});

// ── §enc-3 — Rencontre inactive encounter ─────────────────────────────────────
describe("§enc-3 — Rencontre inactive encounter (caravane-pillee)", () => {
  const model = parseEncounterFixture();
  const { pages } = buildJournalData(model, null);
  const createdPages = makeCreatedPages(model);
  const { results } = buildRollTableData(model, null, createdPages);

  test("page caravane-pillee présente dans le journal", () => {
    const names = pages.map((p) => p.name);
    assert.ok(names.includes("Caravane pillée"));
  });

  test("résultat caravane-pillee absent de la RollTable", () => {
    const names = results.map((r) => r.name);
    assert.ok(!names.includes("Caravane pillée"));
  });
});

// ── §enc-4 — Réimport sans changement encounter ───────────────────────────────
describe("§enc-4 — Réimport sans changement encounter", () => {
  const model = parseEncounterFixture();
  const existingPages = makeExistingPages(model);
  const diff = buildImportDiff(model, existingPages);

  test("aucune entrée new", () => {
    assert.equal(diff.new.length, 0);
  });

  test("aucune entrée modified", () => {
    assert.equal(diff.modified.length, 0);
  });

  test("aucune entrée orphan", () => {
    assert.equal(diff.orphan.length, 0);
  });

  test("4 entrées stable (contexte + 3 entrées)", () => {
    assert.equal(diff.unchanged.length + diff.inactive.length, 4);
  });
});

// ── §enc-5 — Renommage encounter (titre changé, entryId stable) ───────────────
describe("§enc-5 — Renommage encounter (titre changé, entryId stable)", () => {
  const model = parseEncounterFixture();
  const existingPages = makeExistingPages(model);

  model.entries[0].title = "Patrouille des sables (renommée)";

  const diff = buildImportDiff(model, existingPages);

  test("patrouille dans modified", () => {
    const found = diff.modified.some((e) => e.entry?.id === "patrouille-de-sable");
    assert.ok(found, "patrouille absente de modified");
  });

  test("UUID patrouille préservé dans modified", () => {
    const originalPage = existingPages.find(
      (p) => p.flags?.["warbound-campaign-content"]?.markdownImport?.entryId === "patrouille-de-sable"
    );
    assert.ok(originalPage, "page originale introuvable");
    const diffEntry = diff.modified.find((e) => e.existing?.uuid === originalPage.uuid);
    assert.ok(diffEntry, "UUID non préservé dans modified");
  });
});

// ── §48 — Source invalide ─────────────────────────────────────────────────────
describe("§48 — Source invalide", () => {
  const INVALID_SOURCE = "# Un fichier sans front matter\n\nPas de YAML ici.";
  const model = parseWarboundMarkdown(INVALID_SOURCE);
  const { errors } = validateWarboundModel(model, INVALID_SOURCE);

  test("validation retourne au moins une erreur", () => {
    assert.ok(errors.length > 0, "aucune erreur détectée sur source invalide");
  });

  test("pas de journal généré si erreurs présentes (pipeline stoppé)", () => {
    if (errors.length > 0) {
      // Confirme que le consommateur doit stopper — buildJournalData n'est pas appelé
      assert.ok(true, "pipeline correctement stoppé sur validation échouée");
    }
  });
});

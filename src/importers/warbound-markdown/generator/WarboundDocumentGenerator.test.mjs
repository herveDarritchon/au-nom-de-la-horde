import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildJournalData, computeEntryHash, buildRollTableData } from "./WarboundDocumentGenerator.mjs";

const MODEL = {
  schema: 1,
  collectionId: "durotar-tauren-rumors",
  title: "Rumeurs taurènes — Durotar",
  type: "rumor",
  context: {
    markdown: "# Contexte\n\nTexte contextuel.",
    html: "<h1>Contexte</h1>\n<p>Texte contextuel.</p>",
  },
  entries: [
    {
      index: 1,
      id: "stonehoof-convoi",
      title: "Le convoi Stonehoof",
      summary: "Une cargaison pillée.",
      weight: 1,
      active: true,
      markdown: "## Le convoi",
      html: "<h2>Le convoi</h2>",
    },
    {
      index: 2,
      id: "thunderhorn-migration",
      title: "Les bêtes quittent les crêtes",
      summary: "Des migrations inhabituelles.",
      weight: 2,
      active: true,
      markdown: "## Les bêtes",
      html: "<h2>Les bêtes</h2>",
    },
  ],
};

describe("computeEntryHash", () => {
  test("retourne une chaîne hex de 8 caractères", () => {
    const hash = computeEntryHash({ title: "Test", html: "<p>test</p>" });
    assert.match(hash, /^[0-9a-f]{8}$/);
  });

  test("est stable pour des entrées identiques", () => {
    const e = { title: "Test", html: "<p>test</p>" };
    assert.equal(computeEntryHash(e), computeEntryHash({ ...e }));
  });

  test("change si le titre change", () => {
    const base = { title: "A", html: "<p>x</p>" };
    assert.notEqual(computeEntryHash(base), computeEntryHash({ ...base, title: "B" }));
  });

  test("change si le html change", () => {
    const base = { title: "A", html: "<p>x</p>" };
    assert.notEqual(computeEntryHash(base), computeEntryHash({ ...base, html: "<p>y</p>" }));
  });

  test("tolère les valeurs absentes", () => {
    assert.doesNotThrow(() => computeEntryHash({ title: undefined, html: undefined }));
    assert.match(computeEntryHash({ title: undefined, html: undefined }), /^[0-9a-f]{8}$/);
  });
});

describe("buildJournalData", () => {
  test("nom du journal = title du modèle", () => {
    const { journalData } = buildJournalData(MODEL, null);
    assert.equal(journalData.name, MODEL.title);
  });

  test("folder absent quand null passé", () => {
    const { journalData } = buildJournalData(MODEL, null);
    assert.equal("folder" in journalData, false);
  });

  test("folder positionné si folder.id fourni", () => {
    const { journalData } = buildJournalData(MODEL, { id: "folder-123" });
    assert.equal(journalData.folder, "folder-123");
  });

  test("flags JournalEntry contiennent schema et collectionId", () => {
    const { journalData } = buildJournalData(MODEL, null);
    const flags = journalData.flags["warbound-campaign-content"].markdownImport;
    assert.equal(flags.schema, 1);
    assert.equal(flags.collectionId, "durotar-tauren-rumors");
  });

  test("aucun _id dans journalData", () => {
    const { journalData } = buildJournalData(MODEL, null);
    assert.equal("_id" in journalData, false);
  });

  test("aucun _stats dans journalData", () => {
    const { journalData } = buildJournalData(MODEL, null);
    assert.equal("_stats" in journalData, false);
  });

  test("première page = Contexte avec entryId 'context'", () => {
    const { pages } = buildJournalData(MODEL, null);
    assert.equal(pages[0].name, "Contexte");
    assert.equal(pages[0].flags["warbound-campaign-content"].markdownImport.entryId, "context");
  });

  test("nombre total de pages = entrées + 1 (Contexte)", () => {
    const { pages } = buildJournalData(MODEL, null);
    assert.equal(pages.length, MODEL.entries.length + 1);
  });

  test("noms des pages d'entrée = titres des entrées", () => {
    const { pages } = buildJournalData(MODEL, null);
    MODEL.entries.forEach((entry, i) => {
      assert.equal(pages[i + 1].name, entry.title);
    });
  });

  test("flags des pages d'entrée contiennent collectionId et entryId", () => {
    const { pages } = buildJournalData(MODEL, null);
    MODEL.entries.forEach((entry, i) => {
      const flags = pages[i + 1].flags["warbound-campaign-content"].markdownImport;
      assert.equal(flags.collectionId, MODEL.collectionId);
      assert.equal(flags.entryId, entry.id);
    });
  });

  test("sourceHash est une chaîne hex de 8 caractères sur chaque page", () => {
    const { pages } = buildJournalData(MODEL, null);
    for (const page of pages) {
      const { sourceHash } = page.flags["warbound-campaign-content"].markdownImport;
      assert.match(sourceHash, /^[0-9a-f]{8}$/, `sourceHash invalide sur la page "${page.name}"`);
    }
  });

  test("aucun _id dans les pages", () => {
    const { pages } = buildJournalData(MODEL, null);
    for (const page of pages) {
      assert.equal("_id" in page, false, `_id trouvé sur la page "${page.name}"`);
    }
  });

  test("type des pages = 'text'", () => {
    const { pages } = buildJournalData(MODEL, null);
    for (const page of pages) {
      assert.equal(page.type, "text");
    }
  });

  test("format HTML = 1 sur toutes les pages", () => {
    const { pages } = buildJournalData(MODEL, null);
    for (const page of pages) {
      assert.equal(page.text.format, 1);
    }
  });

  test("Contexte a sort = 0, pages suivantes ont sort croissant", () => {
    const { pages } = buildJournalData(MODEL, null);
    assert.equal(pages[0].sort, 0);
    for (let i = 1; i < pages.length; i++) {
      assert.ok(pages[i].sort > pages[i - 1].sort, `sort non croissant à l'index ${i}`);
    }
  });

  test("contenu HTML de la page Contexte = model.context.html", () => {
    const { pages } = buildJournalData(MODEL, null);
    assert.equal(pages[0].text.content, MODEL.context.html);
  });

  test("contenu HTML des pages d'entrée = entry.html", () => {
    const { pages } = buildJournalData(MODEL, null);
    MODEL.entries.forEach((entry, i) => {
      assert.equal(pages[i + 1].text.content, entry.html);
    });
  });
});

const NAMESPACE = "warbound-campaign-content";
const FLAG_KEY = "markdownImport";

function makePages(model) {
  return model.entries.map((entry) => ({
    uuid: `JournalEntry.journal-abc.JournalEntryPage.${entry.id}-id`,
    flags: { [NAMESPACE]: { [FLAG_KEY]: { entryId: entry.id } } },
  }));
}

const MODEL_WITH_INACTIVE = {
  ...MODEL,
  entries: [
    { ...MODEL.entries[0], weight: 1, active: true },
    { ...MODEL.entries[1], weight: 2, active: true },
    {
      index: 3,
      id: "third-entry",
      title: "Troisième entrée",
      summary: "Inactif.",
      weight: 1,
      active: false,
      markdown: "## Troisième",
      html: "<h2>Troisième</h2>",
    },
  ],
};

describe("buildRollTableData", () => {
  test("formula = 1d4 pour poids [1, 2, 1] toutes actives", () => {
    const model = {
      ...MODEL,
      entries: [
        { ...MODEL.entries[0], weight: 1, active: true },
        { ...MODEL.entries[1], weight: 2, active: true },
        { index: 3, id: "c", title: "C", summary: "c", weight: 1, active: true, markdown: "", html: "" },
      ],
    };
    const pages = makePages(model);
    const { rollTableData } = buildRollTableData(model, null, pages);
    assert.equal(rollTableData.formula, "1d4");
  });

  test("plages correctes : A [1,1], B [2,3], C [4,4]", () => {
    const model = {
      ...MODEL,
      entries: [
        { index: 1, id: "a", title: "A", summary: "", weight: 1, active: true, markdown: "", html: "" },
        { index: 2, id: "b", title: "B", summary: "", weight: 2, active: true, markdown: "", html: "" },
        { index: 3, id: "c", title: "C", summary: "", weight: 1, active: true, markdown: "", html: "" },
      ],
    };
    const pages = makePages(model);
    const { results } = buildRollTableData(model, null, pages);
    assert.deepEqual(results[0].range, [1, 1]);
    assert.deepEqual(results[1].range, [2, 3]);
    assert.deepEqual(results[2].range, [4, 4]);
  });

  test("entrée inactive absente des résultats", () => {
    const pages = makePages(MODEL_WITH_INACTIVE);
    const { results } = buildRollTableData(MODEL_WITH_INACTIVE, null, pages);
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.name !== "Troisième entrée"));
  });

  test("formula = 1d3 si C inactive (poids actifs 1+2)", () => {
    const pages = makePages(MODEL_WITH_INACTIVE);
    const { rollTableData } = buildRollTableData(MODEL_WITH_INACTIVE, null, pages);
    assert.equal(rollTableData.formula, "1d3");
  });

  test("une seule entrée active : formula = 1d{weight}, plage [1, weight]", () => {
    const model = {
      ...MODEL,
      entries: [
        { index: 1, id: "only", title: "Seule", summary: "", weight: 3, active: true, markdown: "", html: "" },
      ],
    };
    const pages = makePages(model);
    const { rollTableData, results } = buildRollTableData(model, null, pages);
    assert.equal(rollTableData.formula, "1d3");
    assert.deepEqual(results[0].range, [1, 3]);
  });

  test("aucune entrée active : results vide", () => {
    const model = {
      ...MODEL,
      entries: [
        { index: 1, id: "a", title: "A", summary: "", weight: 1, active: false, markdown: "", html: "" },
      ],
    };
    const { results } = buildRollTableData(model, null, []);
    assert.equal(results.length, 0);
  });

  test("aucune entrée active : rollTableData null (pas de formule 1d0)", () => {
    const model = {
      ...MODEL,
      entries: [
        { index: 1, id: "a", title: "A", summary: "", weight: 1, active: false, markdown: "", html: "" },
      ],
    };
    const { rollTableData } = buildRollTableData(model, null, []);
    assert.equal(rollTableData, null);
  });

  test("replacement et displayRoll à true", () => {
    const pages = makePages(MODEL);
    const { rollTableData } = buildRollTableData(MODEL, null, pages);
    assert.equal(rollTableData.replacement, true);
    assert.equal(rollTableData.displayRoll, true);
  });

  test("folder absent quand null passé", () => {
    const pages = makePages(MODEL);
    const { rollTableData } = buildRollTableData(MODEL, null, pages);
    assert.equal("folder" in rollTableData, false);
  });

  test("folder positionné si folder.id fourni", () => {
    const pages = makePages(MODEL);
    const { rollTableData } = buildRollTableData(MODEL, { id: "folder-999" }, pages);
    assert.equal(rollTableData.folder, "folder-999");
  });

  test("name de la RollTable = title du modèle", () => {
    const pages = makePages(MODEL);
    const { rollTableData } = buildRollTableData(MODEL, null, pages);
    assert.equal(rollTableData.name, MODEL.title);
  });

  test("type de chaque résultat = 'document'", () => {
    const pages = makePages(MODEL);
    const { results } = buildRollTableData(MODEL, null, pages);
    for (const r of results) assert.equal(r.type, "document");
  });

  test("documentUuid correspond à la page de l'entrée", () => {
    const pages = makePages(MODEL);
    const { results } = buildRollTableData(MODEL, null, pages);
    MODEL.entries.filter((e) => e.active).forEach((entry, i) => {
      assert.equal(
        results[i].documentUuid,
        `JournalEntry.journal-abc.JournalEntryPage.${entry.id}-id`
      );
    });
  });

  test("documentUuid null si page absente", () => {
    const { results } = buildRollTableData(MODEL, null, []);
    for (const r of results) assert.equal(r.documentUuid, null);
  });

  test("aucun _id dans rollTableData", () => {
    const pages = makePages(MODEL);
    const { rollTableData } = buildRollTableData(MODEL, null, pages);
    assert.equal("_id" in rollTableData, false);
  });

  test("aucun _id dans les résultats", () => {
    const pages = makePages(MODEL);
    const { results } = buildRollTableData(MODEL, null, pages);
    for (const r of results) assert.equal("_id" in r, false);
  });
});

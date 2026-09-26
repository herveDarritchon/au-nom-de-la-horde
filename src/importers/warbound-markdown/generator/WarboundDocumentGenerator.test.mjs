import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildJournalData, computeEntryHash } from "./WarboundDocumentGenerator.mjs";

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

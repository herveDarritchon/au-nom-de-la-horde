import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildImportDiff } from "./WarboundImportSynchronizer.mjs";
import { computeEntryHash } from "../generator/WarboundDocumentGenerator.mjs";

const NAMESPACE = "warbound-campaign-content";
const FLAG_KEY = "markdownImport";

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
    {
      index: 3,
      id: "grimtotem-rituel",
      title: "Rite des Grimtotem",
      summary: "Un rituel interdit.",
      weight: 1,
      active: false,
      markdown: "## Rite",
      html: "<h2>Rite</h2>",
    },
  ],
};

function makeFlag(entryId, sourceHash) {
  return { [NAMESPACE]: { [FLAG_KEY]: { entryId, sourceHash } } };
}

function makeExistingPages(model) {
  const contextHash = computeEntryHash({ title: "Contexte", html: model.context.html });
  const pages = [
    { id: "page-ctx", uuid: "JournalEntryPage.j1.page-ctx", name: "Contexte", flags: makeFlag("context", contextHash) },
  ];
  for (const entry of model.entries) {
    pages.push({
      id: `page-${entry.id}`,
      uuid: `JournalEntryPage.j1.page-${entry.id}`,
      name: entry.title,
      flags: makeFlag(entry.id, computeEntryHash(entry)),
    });
  }
  return pages;
}

describe("buildImportDiff — collection nouvelle (aucune page existante)", () => {
  test("toutes les entrées sont 'new'", () => {
    const diff = buildImportDiff(MODEL, []);
    assert.equal(diff.new.length, 1 + MODEL.entries.length); // context + entries
    assert.equal(diff.modified.length, 0);
    assert.equal(diff.unchanged.length, 0);
    assert.equal(diff.inactive.length, 0);
    assert.equal(diff.orphan.length, 0);
  });

  test("le contexte est dans 'new'", () => {
    const diff = buildImportDiff(MODEL, []);
    const contextItem = diff.new.find((d) => d.entry.id === "context");
    assert.ok(contextItem, "contexte doit être dans new");
  });
});

describe("buildImportDiff — réimport fichier identique", () => {
  test("0 new, 0 modified, 0 orphan; unchanged = context + actives; inactive = inactives", () => {
    const existingPages = makeExistingPages(MODEL);
    const diff = buildImportDiff(MODEL, existingPages);

    assert.equal(diff.new.length, 0);
    assert.equal(diff.modified.length, 0);
    assert.equal(diff.orphan.length, 0);

    const activeCount = MODEL.entries.filter((e) => e.active).length;
    assert.equal(diff.unchanged.length, 1 + activeCount); // context + actives
    assert.equal(diff.inactive.length, MODEL.entries.filter((e) => !e.active).length);
  });

  test("hashChanged = false sur les entrées inactives non modifiées", () => {
    const existingPages = makeExistingPages(MODEL);
    const diff = buildImportDiff(MODEL, existingPages);
    for (const item of diff.inactive) {
      assert.equal(item.hashChanged, false);
    }
  });
});

describe("buildImportDiff — entrée nouvelle dans le modèle", () => {
  test("entrée absente de Foundry → 'new'", () => {
    const existingPages = makeExistingPages(MODEL);
    const modelWithExtra = {
      ...MODEL,
      entries: [
        ...MODEL.entries,
        { index: 4, id: "darkspear-sorcier", title: "Sorcier Darkspear", summary: "Un visiteur.", weight: 1, active: true, html: "<p>Visiteur</p>" },
      ],
    };
    const diff = buildImportDiff(modelWithExtra, existingPages);
    const newItem = diff.new.find((d) => d.entry.id === "darkspear-sorcier");
    assert.ok(newItem, "nouvelle entrée doit être dans new");
  });
});

describe("buildImportDiff — contenu modifié (titre ou HTML changé)", () => {
  test("titre changé, ID stable → 'modified'", () => {
    const existingPages = makeExistingPages(MODEL);
    const modifiedModel = {
      ...MODEL,
      entries: MODEL.entries.map((e) =>
        e.id === "stonehoof-convoi" ? { ...e, title: "Nouveau titre Stonehoof" } : e
      ),
    };
    const diff = buildImportDiff(modifiedModel, existingPages);
    const item = diff.modified.find((d) => d.entry.id === "stonehoof-convoi");
    assert.ok(item, "entrée avec titre modifié doit être dans modified");
    assert.equal(item.existing.id, "page-stonehoof-convoi");
    assert.equal(item.existing.uuid, "JournalEntryPage.j1.page-stonehoof-convoi");
  });

  test("contenu HTML changé → 'modified'", () => {
    const existingPages = makeExistingPages(MODEL);
    const modifiedModel = {
      ...MODEL,
      entries: MODEL.entries.map((e) =>
        e.id === "thunderhorn-migration" ? { ...e, html: "<h2>Nouveau contenu</h2>" } : e
      ),
    };
    const diff = buildImportDiff(modifiedModel, existingPages);
    const item = diff.modified.find((d) => d.entry.id === "thunderhorn-migration");
    assert.ok(item, "entrée avec HTML modifié doit être dans modified");
  });

  test("UUID préservé dans modified (id existant retourné)", () => {
    const existingPages = makeExistingPages(MODEL);
    const modifiedModel = {
      ...MODEL,
      entries: MODEL.entries.map((e) =>
        e.id === "stonehoof-convoi" ? { ...e, title: "Titre modifié" } : e
      ),
    };
    const diff = buildImportDiff(modifiedModel, existingPages);
    const item = diff.modified.find((d) => d.entry.id === "stonehoof-convoi");
    assert.equal(item.existing.id, "page-stonehoof-convoi", "id de la page existante préservé");
  });
});

describe("buildImportDiff — entrée inactive", () => {
  test("entrée active:false, hash identique → 'inactive' avec hashChanged=false", () => {
    const existingPages = makeExistingPages(MODEL);
    const diff = buildImportDiff(MODEL, existingPages);
    const item = diff.inactive.find((d) => d.entry.id === "grimtotem-rituel");
    assert.ok(item);
    assert.equal(item.hashChanged, false);
  });

  test("entrée active:false, contenu modifié → 'inactive' avec hashChanged=true", () => {
    const existingPages = makeExistingPages(MODEL);
    const modifiedModel = {
      ...MODEL,
      entries: MODEL.entries.map((e) =>
        e.id === "grimtotem-rituel" ? { ...e, html: "<h2>Rite modifié</h2>" } : e
      ),
    };
    const diff = buildImportDiff(modifiedModel, existingPages);
    const item = diff.inactive.find((d) => d.entry.id === "grimtotem-rituel");
    assert.ok(item);
    assert.equal(item.hashChanged, true);
  });

  test("entrée inactive n'est pas dans modified ni unchanged", () => {
    const existingPages = makeExistingPages(MODEL);
    const diff = buildImportDiff(MODEL, existingPages);
    const ids = [...diff.modified, ...diff.unchanged].map((d) => d.entry.id);
    assert.ok(!ids.includes("grimtotem-rituel"));
  });
});

describe("buildImportDiff — entrée orpheline", () => {
  test("page dans Foundry absente du modèle → 'orphan'", () => {
    const existingPages = makeExistingPages(MODEL);
    const extraPage = {
      id: "page-old-entry",
      uuid: "JournalEntryPage.j1.page-old-entry",
      name: "Ancienne entrée",
      flags: makeFlag("old-entry", "deadbeef"),
    };
    const diff = buildImportDiff(MODEL, [...existingPages, extraPage]);
    const item = diff.orphan.find((d) => d.existing.id === "page-old-entry");
    assert.ok(item, "page sans correspondance doit être orpheline");
  });

  test("orpheline n'est pas modifiée ni supprimée (pas dans other arrays)", () => {
    const existingPages = makeExistingPages(MODEL);
    const extraPage = { id: "page-orphan", uuid: "JournalEntryPage.j1.page-orphan", name: "Orpheline", flags: makeFlag("orphan-id", "deadbeef") };
    const diff = buildImportDiff(MODEL, [...existingPages, extraPage]);
    const allNonOrphan = [...diff.new, ...diff.modified, ...diff.unchanged, ...diff.inactive];
    const found = allNonOrphan.some((d) => d.existing?.id === "page-orphan");
    assert.ok(!found);
  });
});

describe("buildImportDiff — page sans flags Warbound", () => {
  test("page sans entryId traité comme orpheline", () => {
    const pageNoFlags = { id: "page-no-flags", uuid: "JournalEntryPage.j1.page-no-flags", name: "Sans flags", flags: {} };
    const diff = buildImportDiff(MODEL, [pageNoFlags]);
    const orphan = diff.orphan.find((d) => d.existing.id === "page-no-flags");
    assert.ok(orphan);
    assert.equal(diff.new.length, 1 + MODEL.entries.length);
  });
});

describe("buildImportDiff — contexte modifié", () => {
  test("HTML du contexte changé → 'modified'", () => {
    const existingPages = makeExistingPages(MODEL);
    const modifiedModel = { ...MODEL, context: { ...MODEL.context, html: "<p>Nouveau contexte</p>" } };
    const diff = buildImportDiff(modifiedModel, existingPages);
    const item = diff.modified.find((d) => d.entry.id === "context");
    assert.ok(item, "contexte modifié doit être dans modified");
    assert.equal(item.existing.id, "page-ctx");
  });
});

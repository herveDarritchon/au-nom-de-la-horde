import { computeEntryHash } from "../generator/WarboundDocumentGenerator.mjs";

const NAMESPACE = "warbound-campaign-content";
const FLAG_KEY = "markdownImport";

function getEntryId(page) {
  return page.flags?.[NAMESPACE]?.[FLAG_KEY]?.entryId ?? null;
}

function getSourceHash(page) {
  return page.flags?.[NAMESPACE]?.[FLAG_KEY]?.sourceHash ?? null;
}

/**
 * Calcule le diff entre un modèle Warbound et les pages JournalEntryPage existantes sérialisées.
 * Ne fait aucun appel Foundry — testable Vitest.
 * @param {object} model - Modèle produit par parseWarboundMarkdown
 * @param {Array<{ id: string, uuid: string, name: string, sort?: number, flags: object }>} existingPages - pages existantes, identifiants inclus
 * @returns {{ new: object[], modified: object[], unchanged: object[], inactive: object[], orphan: object[] }}
 */
export function buildImportDiff(model, existingPages) {
  const pageByEntryId = new Map();
  for (const page of existingPages) {
    const entryId = getEntryId(page);
    if (entryId != null) pageByEntryId.set(entryId, page);
  }

  const matched = new Set();
  const diff = { new: [], modified: [], unchanged: [], inactive: [], orphan: [] };

  const contextEntry = { id: "context", title: "Contexte", html: model.context.html, active: true };
  const contextHash = computeEntryHash({ title: contextEntry.title, html: contextEntry.html });
  const existingContext = pageByEntryId.get("context");

  if (!existingContext) {
    diff.new.push({ entry: contextEntry });
  } else {
    matched.add(existingContext.id);
    if (getSourceHash(existingContext) === contextHash) {
      diff.unchanged.push({ entry: contextEntry, existing: { id: existingContext.id, uuid: existingContext.uuid, name: existingContext.name } });
    } else {
      diff.modified.push({ entry: contextEntry, existing: { id: existingContext.id, uuid: existingContext.uuid, name: existingContext.name } });
    }
  }

  for (const entry of model.entries) {
    const entryHash = computeEntryHash(entry);
    const existingPage = pageByEntryId.get(entry.id);

    if (!existingPage) {
      diff.new.push({ entry });
      continue;
    }

    matched.add(existingPage.id);
    const hashChanged = getSourceHash(existingPage) !== entryHash;

    if (!entry.active) {
      diff.inactive.push({ entry, existing: { id: existingPage.id, uuid: existingPage.uuid, name: existingPage.name }, hashChanged });
    } else if (hashChanged) {
      diff.modified.push({ entry, existing: { id: existingPage.id, uuid: existingPage.uuid, name: existingPage.name } });
    } else {
      diff.unchanged.push({ entry, existing: { id: existingPage.id, uuid: existingPage.uuid, name: existingPage.name } });
    }
  }

  for (const page of existingPages) {
    if (!matched.has(page.id)) {
      diff.orphan.push({ existing: { id: page.id, uuid: page.uuid, name: page.name } });
    }
  }

  return diff;
}

// Adaptateur Foundry V14 — synchronisation idempotente d'une collection Warbound

import { buildJournalData, buildRollTableData, computeEntryHash } from "../../../src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs";
import { buildImportDiff } from "../../../src/importers/warbound-markdown/synchronizer/WarboundImportSynchronizer.mjs";
import { generateDocuments } from "./WarboundDocumentGenerator.mjs";

const NAMESPACE = "warbound-campaign-content";
const FLAG_KEY = "markdownImport";

function findExistingJournal(collectionId) {
  return game.journal.find(
    (j) => j.flags?.[NAMESPACE]?.[FLAG_KEY]?.collectionId === collectionId
  ) ?? null;
}

function findExistingTable(collectionId, name) {
  const byFlag = game.tables.find(
    (t) => t.flags?.[NAMESPACE]?.[FLAG_KEY]?.collectionId === collectionId
  );
  if (byFlag) return byFlag;
  // Repli par nom pour les tables créées avant l'ajout des flags d'identité.
  return game.tables.find((t) => t.name === name) ?? null;
}

function resultsAreUpToDate(existingResults, desiredResults) {
  if (existingResults.length !== desiredResults.length) return false;
  return existingResults.every((r, i) => {
    const d = desiredResults[i];
    return (
      r.type === d.type &&
      r.name === d.name &&
      (r.description ?? "") === d.description &&
      (r.documentUuid ?? null) === d.documentUuid &&
      r.range?.[0] === d.range[0] &&
      r.range?.[1] === d.range[1]
    );
  });
}

function buildPageUpdateData(entry) {
  return {
    name: entry.title,
    "text.content": entry.html,
    [`flags.${NAMESPACE}.${FLAG_KEY}.sourceHash`]: computeEntryHash(entry),
  };
}

function buildNewPageData(entry, collectionId, sort) {
  const hash = computeEntryHash({ title: entry.title, html: entry.html });
  return {
    name: entry.title,
    type: "text",
    sort,
    text: { content: entry.html, format: 1 },
    flags: {
      [NAMESPACE]: {
        [FLAG_KEY]: {
          collectionId,
          entryId: entry.id,
          sourceHash: hash,
        },
      },
    },
  };
}

/**
 * Synchronise de façon idempotente une collection Warbound dans Foundry V14.
 * - Premier import : délègue à generateDocuments.
 * - Réimport : calcule le diff, applique uniquement les changements, préserve les UUID.
 * @param {object} model - Modèle produit par parseWarboundMarkdown
 * @param {Folder | null} journalFolder - Dossier cible pour le JournalEntry
 * @param {Folder | null} [tableFolder] - Dossier cible pour la RollTable (défaut : journalFolder)
 * @returns {Promise<{ journal: JournalEntry, table: RollTable | null, diff: object | null }>}
 */
export async function syncDocuments(model, journalFolder, tableFolder = journalFolder) {
  const existingJournal = findExistingJournal(model.collectionId);

  if (!existingJournal) {
    const { journal, table } = await generateDocuments(model, journalFolder, tableFolder);
    return { journal, table, diff: null };
  }

  const existingPages = existingJournal.pages.contents.map((p) => ({
    id: p.id,
    uuid: p.uuid,
    name: p.name,
    sort: p.sort,
    flags: p.flags,
  }));
  const diff = buildImportDiff(model, existingPages);

  // Mettre à jour les pages modifiées (actives et inactives avec contenu changé)
  const pagesToUpdate = [
    ...diff.modified.map((d) => ({ _id: d.existing.id, ...buildPageUpdateData(d.entry) })),
    ...diff.inactive.filter((d) => d.hashChanged).map((d) => ({ _id: d.existing.id, ...buildPageUpdateData(d.entry) })),
  ];

  if (pagesToUpdate.length > 0) {
    await existingJournal.updateEmbeddedDocuments("JournalEntryPage", pagesToUpdate);
  }

  // Créer les nouvelles pages — la page « Contexte » reste en tête
  if (diff.new.length > 0) {
    const maxSort = existingPages.reduce((acc, p) => Math.max(acc, p.sort ?? 0), 0);
    let rank = 0;
    const newPageData = diff.new.map((d) =>
      d.entry.id === "context"
        ? buildNewPageData(d.entry, model.collectionId, 0)
        : buildNewPageData(d.entry, model.collectionId, maxSort + ++rank * 100000)
    );
    await existingJournal.createEmbeddedDocuments("JournalEntryPage", newPageData);
  }

  // Reconstruire la RollTable (orphelins exclus car absents du modèle)
  const currentPages = existingJournal.pages.contents;
  const { rollTableData, results } = buildRollTableData(model, tableFolder, currentPages);

  const existingTable = findExistingTable(model.collectionId, model.title);
  let table = null;

  if (rollTableData) {
    if (!existingTable) {
      table = await RollTable.create({ ...rollTableData, results });
    } else {
      const needsResultsRebuild = !resultsAreUpToDate(existingTable.results.contents, results);
      const needsFormulaUpdate = existingTable.formula !== rollTableData.formula;
      const needsFlagAdoption = existingTable.flags?.[NAMESPACE]?.[FLAG_KEY]?.collectionId !== model.collectionId;

      if (needsResultsRebuild) {
        const staleResultIds = existingTable.results.contents.map((r) => r.id);
        if (staleResultIds.length > 0) {
          await existingTable.deleteEmbeddedDocuments("TableResult", staleResultIds);
        }
      }

      if (needsFormulaUpdate || needsFlagAdoption) {
        await existingTable.update({ formula: rollTableData.formula, flags: rollTableData.flags });
      }

      if (needsResultsRebuild) {
        await existingTable.createEmbeddedDocuments("TableResult", results);
      }

      table = existingTable;
    }
  }

  return { journal: existingJournal, table, diff };
}

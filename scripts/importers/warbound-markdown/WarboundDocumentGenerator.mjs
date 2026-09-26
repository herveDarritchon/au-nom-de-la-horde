// Adaptateur Foundry V14 — délègue la construction des données au module pur

import { buildJournalData, buildRollTableData } from "../../../src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs";

/**
 * Crée un JournalEntry Foundry V14 avec ses JournalEntryPage et une RollTable depuis un modèle Warbound parsé.
 * Aucune RollTable n'est créée si le modèle ne contient aucune entrée active.
 * @param {object} model - Modèle produit par parseWarboundMarkdown
 * @param {Folder | null} folder - Dossier Foundry cible, ou null pour la racine
 * @returns {Promise<JournalEntry>}
 */
export async function generateDocuments(model, folder) {
  const { journalData, pages } = buildJournalData(model, folder);
  const journal = await JournalEntry.create({ ...journalData, pages });

  const createdPages = journal.pages.contents;
  const { rollTableData, results } = buildRollTableData(model, folder, createdPages);
  if (rollTableData) await RollTable.create({ ...rollTableData, results });

  return journal;
}

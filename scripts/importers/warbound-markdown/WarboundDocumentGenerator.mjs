// Adaptateur Foundry V14 — délègue la construction des données au module pur

import { buildJournalData, buildRollTableData } from "../../../src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs";

/**
 * Crée un JournalEntry Foundry V14 avec ses JournalEntryPage et une RollTable depuis un modèle Warbound parsé.
 * Aucune RollTable n'est créée si le modèle ne contient aucune entrée active.
 * @param {object} model - Modèle produit par parseWarboundMarkdown
 * @param {Folder | null} journalFolder - Dossier Foundry pour le JournalEntry, ou null pour la racine
 * @param {Folder | null} [tableFolder] - Dossier Foundry pour la RollTable (défaut : même que journalFolder)
 * @returns {Promise<{ journal: JournalEntry, table: RollTable | null }>} la table est null si aucune entrée active
 */
export async function generateDocuments(model, journalFolder, tableFolder = journalFolder) {
  const { journalData, pages } = buildJournalData(model, journalFolder);
  const journal = await JournalEntry.create({ ...journalData, pages });

  const createdPages = journal.pages.contents;
  const { rollTableData, results } = buildRollTableData(model, tableFolder, createdPages);
  const table = rollTableData ? await RollTable.create({ ...rollTableData, results }) : null;

  return { journal, table };
}

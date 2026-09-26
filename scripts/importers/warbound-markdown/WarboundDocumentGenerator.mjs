// Adaptateur Foundry V14 — délègue la construction des données au module pur

import { buildJournalData } from "../../../src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs";

/**
 * Crée un JournalEntry Foundry V14 avec ses JournalEntryPage depuis un modèle Warbound parsé.
 * @param {object} model - Modèle produit par parseWarboundMarkdown
 * @param {Folder | null} folder - Dossier Foundry cible, ou null pour la racine
 * @returns {Promise<JournalEntry>}
 */
export async function generateDocuments(model, folder) {
  const { journalData, pages } = buildJournalData(model, folder);
  return JournalEntry.create({ ...journalData, pages });
}

// Adaptateur Foundry V14 — délègue la construction des données au module pur

import { buildJournalData, buildRollTableData } from "../../../src/importers/warbound-markdown/generator/WarboundDocumentGenerator.mjs";

const MODULE_ID = "warbound-campaign-content";

/**
 * Crée un JournalEntry Foundry V14 avec ses JournalEntryPage et une RollTable depuis un modèle Warbound parsé.
 * Aucune RollTable n'est créée si le modèle ne contient aucune entrée active.
 * En cas d'échec, seuls les documents créés par cet appel sont supprimés : un document préexistant
 * n'est jamais touché, et l'erreur d'origine est propagée au lieu d'être masquée par le rollback.
 * @param {object} model - Modèle produit par parseWarboundMarkdown
 * @param {Folder | null} journalFolder - Dossier Foundry pour le JournalEntry, ou null pour la racine
 * @param {Folder | null} [tableFolder] - Dossier Foundry pour la RollTable (défaut : même que journalFolder)
 * @returns {Promise<{ journal: JournalEntry, table: RollTable | null }>} la table est null si aucune entrée active
 */
export async function generateDocuments(model, journalFolder, tableFolder = journalFolder) {
  const created = [];
  try {
    const { journalData, pages } = buildJournalData(model, journalFolder);
    const journal = await JournalEntry.create({ ...journalData, pages });
    created.push(journal);

    const createdPages = journal.pages.contents;
    const { rollTableData, results } = buildRollTableData(model, tableFolder, createdPages);
    const table = rollTableData ? await RollTable.create({ ...rollTableData, results }) : null;
    if (table) created.push(table);

    return { journal, table };
  } catch (err) {
    // Rollback : `allSettled` pour ne pas masquer l'erreur d'origine, mais chaque échec de
    // suppression est journalisé — un rollback incomplet laisserait des documents orphelins invisibles.
    const rollbacks = await Promise.allSettled(created.map((doc) => doc.delete()));
    for (const [index, rollback] of rollbacks.entries()) {
      if (rollback.status === "rejected") {
        console.error(
          `${MODULE_ID} | WarboundDocumentGenerator rollback failed`,
          created[index].uuid,
          rollback.reason
        );
      }
    }
    throw err;
  }
}

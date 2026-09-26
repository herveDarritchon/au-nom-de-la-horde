// Générateur de données JournalEntry Warbound — module pur, sans dépendance Foundry

const NAMESPACE = "warbound-campaign-content";
const FLAG_KEY = "markdownImport";

/** FNV-1a 32 bits, hex sur 8 caractères. Module pur, pas de garantie cryptographique. */
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Hash déterministe d'une page à partir de son titre et de son contenu HTML.
 * Permet la détection de modification au prochain import (§29 du cadrage).
 * @param {{ title?: string, html?: string }} entry
 * @returns {string} chaîne hex de 8 caractères
 */
export function computeEntryHash({ title, html }) {
  return fnv1a(`${title ?? ""}::${html ?? ""}`);
}

/**
 * Construit les données brutes pour JournalEntry + JournalEntryPage, sans appel Foundry.
 * @param {object} model - Modèle produit par parseWarboundMarkdown
 * @param {{ id: string } | null} folder - Objet Folder Foundry (ou null pour la racine)
 * @returns {{ journalData: object, pages: object[] }}
 */
export function buildJournalData(model, folder) {
  const journalData = {
    name: model.title,
    ...(folder?.id != null ? { folder: folder.id } : {}),
    flags: {
      [NAMESPACE]: {
        [FLAG_KEY]: {
          schema: model.schema,
          collectionId: model.collectionId,
          ...(model.type != null ? { collectionType: model.type } : {}),
        },
      },
    },
  };

  const contextPage = {
    name: "Contexte",
    type: "text",
    sort: 0,
    text: { content: model.context.html, format: 1 },
    flags: {
      [NAMESPACE]: {
        [FLAG_KEY]: {
          collectionId: model.collectionId,
          entryId: "context",
          sourceHash: computeEntryHash({ title: "Contexte", html: model.context.html }),
        },
      },
    },
  };

  const entryPages = model.entries.map((entry, i) => ({
    name: entry.title,
    type: "text",
    sort: (i + 1) * 100000,
    text: { content: entry.html, format: 1 },
    flags: {
      [NAMESPACE]: {
        [FLAG_KEY]: {
          collectionId: model.collectionId,
          entryId: entry.id,
          sourceHash: computeEntryHash(entry),
        },
      },
    },
  }));

  return { journalData, pages: [contextPage, ...entryPages] };
}

/**
 * Construit les données brutes pour une RollTable Foundry V14 avec plages par poids.
 * Seules les entrées actives (entry.active === true) sont incluses.
 * Sans aucune entrée active, aucune table n'est construite : `rollTableData` vaut null
 * plutôt que de produire une formule `1d0` rejetée par Foundry.
 * @param {object} model - Modèle produit par parseWarboundMarkdown
 * @param {{ id: string } | null} folder - Objet Folder Foundry (ou null pour la racine)
 * @param {Array<{ uuid: string, flags: object }>} createdPages - pages JournalEntryPage créées
 * @returns {{ rollTableData: object | null, results: object[] }}
 */
export function buildRollTableData(model, folder, createdPages) {
  const activeEntries = model.entries.filter((e) => e.active);
  if (!activeEntries.length) return { rollTableData: null, results: [] };

  const sumOfWeights = activeEntries.reduce((acc, e) => acc + e.weight, 0);

  const rollTableData = {
    name: model.title,
    ...(folder?.id != null ? { folder: folder.id } : {}),
    formula: `1d${sumOfWeights}`,
    replacement: true,
    displayRoll: true,
    flags: {
      [NAMESPACE]: {
        [FLAG_KEY]: {
          schema: model.schema,
          collectionId: model.collectionId,
          ...(model.type != null ? { collectionType: model.type } : {}),
        },
      },
    },
  };

  let cursor = 1;
  const results = activeEntries.map((entry) => {
    const start = cursor;
    const end = cursor + entry.weight - 1;
    cursor = end + 1;

    const page = createdPages.find(
      (p) => p.flags?.[NAMESPACE]?.[FLAG_KEY]?.entryId === entry.id
    );

    return {
      type: "document",
      name: entry.title,
      description: entry.summary ?? "",
      documentUuid: page?.uuid ?? null,
      range: [start, end],
    };
  });

  return { rollTableData, results };
}

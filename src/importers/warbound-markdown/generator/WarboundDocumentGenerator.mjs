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

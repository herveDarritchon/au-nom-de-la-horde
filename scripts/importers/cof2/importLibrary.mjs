/**
 * Bibliothèque d'objets importés (Epic Importateur COF2 PDF, §15/§16 ; Story 6) : compendium(s) de monde dédiés
 * aux capacités créées par l'importateur, séparés de `cof2-base`. Toute l'API Foundry (`game.packs`,
 * `CompendiumCollection`) vit ici, au même titre que `encounterFactory.mjs`.
 *
 * Ne jamais écrire dans `cof2-base.cof-2-base-items` : ce module ne touche que les compendiums monde qu'il crée
 * ou charge lui-même.
 */

const PARSER_VERSION = "1.0.0";

const LIBRARY_PACKS = {
  capacity: { name: "warbound-imported-capacities", label: "Warbound — Capacités importées" },
  path: { name: "warbound-imported-paths", label: "Warbound — Voies importées" },
};

/**
 * Récupère le compendium monde dédié à un type d'objet importé, en le créant s'il n'existe pas encore.
 * @param {"capacity"|"path"} kind
 * @returns {Promise<CompendiumCollection>}
 */
async function ensureImportLibraryPack(kind) {
  const { name, label } = LIBRARY_PACKS[kind];
  const collectionId = `world.${name}`;
  const existing = game.packs.get(collectionId);
  if (existing) return existing;
  return CompendiumCollection.createCompendium({
    type: "Item",
    label,
    name,
    package: "world",
    ownership: { PLAYER: "NONE", TRUSTED: "NONE", ASSISTANT: "OWNER" },
  });
}

/**
 * Charge les entrées de la bibliothèque d'import, au format attendu par `makeCapacityResolver({importedEntries})`
 * (priorité 3, contrat inchangé de #5).
 * @param {CompendiumCollection} pack
 * @returns {Promise<object[]>}
 */
async function loadImportedEntries(pack) {
  const index = await pack.getIndex({ fields: ["folder", "flags.warbound"] });
  return index.filter((e) => e.type === "capacity");
}

/**
 * Cherche un document déjà importé avec le même hash de contenu.
 * @param {CompendiumCollection} pack
 * @param {string} hash
 * @returns {Promise<object|null>}
 */
async function findByHash(pack, hash) {
  const index = await pack.getIndex({ fields: ["flags.warbound"] });
  const found = index.find((e) => e.flags?.warbound?.sourceHash === hash);
  return found ? pack.getDocument(found._id) : null;
}

/**
 * Crée une capacité dans la bibliothèque d'import avec ses métadonnées `flags.warbound.*`.
 * @param {CompendiumCollection} pack
 * @param {{name:string, description:string, actionType:(string|null), frequency:(object|null)}} draft
 * @param {{hash:string, sourceType:string, reviewStatus:("generated"|"review-required"|"reviewed")}} meta
 * @returns {Promise<object>}
 */
async function saveImportedCapacity(pack, draft, { hash, sourceType, reviewStatus }) {
  const [item] = await Item.createDocuments(
    [
      {
        name: draft.name,
        type: "capacity",
        system: { description: draft.description ? `<p>${draft.description}</p>` : "", learned: true, path: null },
        flags: {
          warbound: {
            imported: true,
            sourceType,
            parserVersion: PARSER_VERSION,
            sourceHash: hash,
            reviewStatus,
          },
        },
      },
    ],
    { pack: pack.collection }
  );
  return item;
}

export { PARSER_VERSION, LIBRARY_PACKS, ensureImportLibraryPack, loadImportedEntries, findByHash, saveImportedCapacity };

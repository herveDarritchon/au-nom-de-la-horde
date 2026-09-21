/**
 * Résolution multi-sources d'une capacité par priorité (compendiums officiels puis bibliothèque d'import du
 * monde), conforme à la section 14 de l'Epic Importateur COF2 : EXACT_REUSE > TEMPLATE_VARIANT > REUSE_IMPORTED >
 * NOT_FOUND, avec détection explicite des homonymes incompatibles (AMBIGUOUS). Aucun fallback approximatif
 * silencieux : chaque issue produit un statut nommé.
 *
 * Module pur : reçoit des entrées déjà chargées, ne fait aucun accès Foundry.
 */

const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripParens = (s) => s.replace(/\([^)]*\)\s*$/, "").trim();

/**
 * Sépare un temps d'action (L/A/M/G) porté par une parenthèse finale du reste du nom, avant toute recherche.
 * « Charge (L) » → { name: "Charge", actionType: "L" }. Un paramètre non-action (« Vol (rapide) ») est laissé
 * intact sur le nom.
 * @param {string} rawName
 * @returns {{name:string, actionType:("L"|"A"|"M"|"G"|null)}}
 */
function extractActionType(rawName) {
  const m = rawName.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (!m || !/^[LAMG]$/.test(m[2].trim())) return { name: rawName, actionType: null };
  return { name: m[1].trim(), actionType: m[2].trim() };
}

const addTo = (map, key, entry) => map.set(key, [...(map.get(key) ?? []), entry]);

function buildIndex(entries) {
  const exact = new Map();
  const loose = new Map();
  for (const entry of entries) {
    addTo(exact, normalize(entry.name), entry);
    addTo(loose, normalize(stripParens(entry.name)), entry);
  }
  return { exact, loose };
}

/**
 * @param {object[]} candidates Entrées partageant la même clé normalisée
 * @param {string} [priorityFolderId]
 * @returns {{entry:object}|{ambiguous:string[]}}
 */
function pickAmongCandidates(candidates, priorityFolderId) {
  const distinctNames = new Set(candidates.map((e) => e.name));
  if (distinctNames.size > 1) return { ambiguous: [...distinctNames] };
  return { entry: candidates.find((e) => e.folder === priorityFolderId) ?? candidates[0] };
}

/**
 * @typedef {{status:"EXACT_REUSE"|"REUSE_IMPORTED"|"TEMPLATE_VARIANT", entry:object}
 *   | {status:"AMBIGUOUS", candidates:string[]}
 *   | {status:"NOT_FOUND"}} CapacityResolution
 */

/**
 * Construit le resolver de capacités multi-sources.
 * @param {{officialEntries:object[], importedEntries?:object[], priorityFolderId?:string}} sources
 * @returns {(name:string) => CapacityResolution}
 */
function makeCapacityResolver({ officialEntries, importedEntries = [], priorityFolderId }) {
  const official = buildIndex(officialEntries);
  const imported = buildIndex(importedEntries);

  return (name) => {
    // Priorité 1 — correspondance exacte dans les compendiums officiels
    const officialExact = official.exact.get(normalize(name));
    if (officialExact) {
      const picked = pickAmongCandidates(officialExact, priorityFolderId);
      return "ambiguous" in picked ? { status: "AMBIGUOUS", candidates: picked.ambiguous } : { status: "EXACT_REUSE", entry: picked.entry };
    }

    // Priorité 2 — variante paramétrée connue dans les compendiums officiels
    const officialVariant = official.loose.get(normalize(stripParens(name)));
    if (officialVariant) {
      const picked = pickAmongCandidates(officialVariant, priorityFolderId);
      return "ambiguous" in picked ? { status: "AMBIGUOUS", candidates: picked.ambiguous } : { status: "TEMPLATE_VARIANT", entry: picked.entry };
    }

    // Priorité 3 — bibliothèque d'import du monde (capacités déjà importées et validées)
    const importedExact = imported.exact.get(normalize(name));
    if (importedExact) {
      const picked = pickAmongCandidates(importedExact, priorityFolderId);
      return "ambiguous" in picked ? { status: "AMBIGUOUS", candidates: picked.ambiguous } : { status: "REUSE_IMPORTED", entry: picked.entry };
    }

    // Priorité 4 — création nécessaire
    return { status: "NOT_FOUND" };
  };
}

export { normalize, stripParens, extractActionType, makeCapacityResolver };

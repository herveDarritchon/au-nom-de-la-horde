/**
 * Résolution multi-sources d'une capacité par priorité (compendiums Warbound, puis compendiums officiels COF2,
 * puis bibliothèque d'import du monde — issue #32), conforme à la section 14 de l'Epic Importateur COF2 :
 * EXACT_REUSE > TEMPLATE_VARIANT > REUSE_IMPORTED > NOT_FOUND, avec détection explicite des homonymes
 * incompatibles (AMBIGUOUS). Aucun fallback approximatif silencieux : chaque issue produit un statut nommé.
 * Chaque résolution porteuse d'une `entry` indique sa provenance via `source` (`"warbound"|"cof2"|"library"`).
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
 * Départage un groupe de candidats partageant la même clé normalisée. Deux catégories d'ambiguïté sont
 * distinguées (issue #36) : des noms réellement différents (variantes homonymes, ex. `Charge (13)`/`Charge (15)`)
 * et des noms strictement identiques (doublons, ex. deux entrées `Charge` dans des dossiers différents). Dans ce
 * second cas, seul le dossier prioritaire configuré (`priorityFolderId`) peut trancher de façon déterministe ;
 * s'il ne désigne pas exactement un candidat, le choix n'est jamais arbitraire (plus de repli sur `candidates[0]`)
 * — l'ambiguïté est remontée avec un libellé par candidat (dossier + id) puisque leurs noms seuls ne les
 * distinguent pas.
 * @param {object[]} candidates Entrées partageant la même clé normalisée
 * @param {string} [priorityFolderId]
 * @returns {{entry:object}|{ambiguous:string[]}}
 */
function pickAmongCandidates(candidates, priorityFolderId) {
  const distinctNames = new Set(candidates.map((e) => e.name));
  if (distinctNames.size > 1) return { ambiguous: [...distinctNames] };
  if (candidates.length === 1) return { entry: candidates[0] };
  const inPriorityFolder = priorityFolderId ? candidates.filter((e) => e.folder === priorityFolderId) : [];
  if (inPriorityFolder.length === 1) return { entry: inPriorityFolder[0] };
  return { ambiguous: candidates.map((e) => `${e.name} [folder:${e.folder ?? "?"} id:${e._id ?? "?"}]`) };
}

/**
 * @typedef {{status:"EXACT_REUSE"|"REUSE_IMPORTED"|"TEMPLATE_VARIANT", entry:object, source:("warbound"|"cof2"|"library")}
 *   | {status:"AMBIGUOUS", candidates:string[]}
 *   | {status:"NOT_FOUND"}} CapacityResolution
 */

/**
 * Construit le resolver de capacités multi-sources.
 * @param {{warboundEntries?:object[], officialEntries:object[], importedEntries?:object[], priorityFolderId?:string,
 *   warboundPriorityFolderId?:string}} sources
 * @returns {(name:string) => CapacityResolution}
 */
function makeCapacityResolver({ warboundEntries = [], officialEntries, importedEntries = [], priorityFolderId, warboundPriorityFolderId }) {
  const warbound = buildIndex(warboundEntries);
  const official = buildIndex(officialEntries);
  const imported = buildIndex(importedEntries);

  return (name) => {
    // Priorité 1 — correspondance exacte dans les compendiums Warbound (issue #32)
    const warboundExact = warbound.exact.get(normalize(name));
    if (warboundExact) {
      const picked = pickAmongCandidates(warboundExact, warboundPriorityFolderId);
      return "ambiguous" in picked ? { status: "AMBIGUOUS", candidates: picked.ambiguous } : { status: "EXACT_REUSE", entry: picked.entry, source: "warbound" };
    }

    // Priorité 2 — correspondance exacte dans les compendiums officiels COF2 (issue #35 : exact avant variante,
    // toutes sources confondues)
    const officialExact = official.exact.get(normalize(name));
    if (officialExact) {
      const picked = pickAmongCandidates(officialExact, priorityFolderId);
      return "ambiguous" in picked ? { status: "AMBIGUOUS", candidates: picked.ambiguous } : { status: "EXACT_REUSE", entry: picked.entry, source: "cof2" };
    }

    // Priorité 3 — variante paramétrée connue dans les compendiums Warbound
    const warboundVariant = warbound.loose.get(normalize(stripParens(name)));
    if (warboundVariant) {
      const picked = pickAmongCandidates(warboundVariant, warboundPriorityFolderId);
      return "ambiguous" in picked ? { status: "AMBIGUOUS", candidates: picked.ambiguous } : { status: "TEMPLATE_VARIANT", entry: picked.entry, source: "warbound" };
    }

    // Priorité 4 — variante paramétrée connue dans les compendiums officiels COF2
    const officialVariant = official.loose.get(normalize(stripParens(name)));
    if (officialVariant) {
      const picked = pickAmongCandidates(officialVariant, priorityFolderId);
      return "ambiguous" in picked ? { status: "AMBIGUOUS", candidates: picked.ambiguous } : { status: "TEMPLATE_VARIANT", entry: picked.entry, source: "cof2" };
    }

    // Priorité 5 — bibliothèque d'import du monde (capacités déjà importées et validées)
    const importedExact = imported.exact.get(normalize(name));
    if (importedExact) {
      const picked = pickAmongCandidates(importedExact, priorityFolderId);
      return "ambiguous" in picked ? { status: "AMBIGUOUS", candidates: picked.ambiguous } : { status: "REUSE_IMPORTED", entry: picked.entry, source: "library" };
    }

    // Priorité 6 — création nécessaire
    return { status: "NOT_FOUND" };
  };
}

export { normalize, stripParens, extractActionType, makeCapacityResolver };

/**
 * Correspondance nom → capacité de compendium.
 * Pure : reçoit des entrées déjà chargées, ne fait aucun accès Foundry.
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
 * Construit la fonction de correspondance nom → capacité du compendium.
 * Nom identique d'abord (dossier prioritaire en cas de doublon), puis nom sans paramètre final (« Charge (15) » → « Charge (13) »),
 * accepté seulement s'il est sans ambiguïté (« Résistance » ne doit pas devenir « Résistance (Golem) » au hasard).
 * @param {{_id:string, name:string, folder:string}[]} entries Capacités candidates
 * @param {string} [priorityFolderId] Dossier à préférer entre homonymes
 * @returns {(name:string) => {entry:object, approximate:boolean}|{ambiguous:string[]}|null}
 */
function makeCapacityMatcher(entries, priorityFolderId) {
  const exact = new Map();
  const loose = new Map();
  const add = (map, key, entry) => map.set(key, [...(map.get(key) ?? []), entry]);
  for (const entry of entries) {
    add(exact, normalize(entry.name), entry);
    add(loose, normalize(stripParens(entry.name)), entry);
  }
  return (name) => {
    const same = exact.get(normalize(name));
    if (same) return { entry: same.find((e) => e.folder === priorityFolderId) ?? same[0], approximate: false };
    const near = loose.get(normalize(stripParens(name)));
    if (!near) return null;
    return near.length === 1 ? { entry: near[0], approximate: true } : { ambiguous: near.map((e) => e.name) };
  };
}

export { normalize, stripParens, makeCapacityMatcher };

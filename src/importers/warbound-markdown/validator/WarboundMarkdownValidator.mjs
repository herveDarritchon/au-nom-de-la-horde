// Validateur Warbound Markdown V1 — aucune dépendance Foundry

const SUPPORTED_SCHEMAS = [1];
const REQUIRED_COLUMNS = ["Index", "ID", "Titre", "Aperçu", "Poids", "Actif"];

function err(code, message, extras = {}) {
  return { code, message, ...extras };
}

function warn(code, message, extras = {}) {
  return { code, message, ...extras };
}

function isPositiveInteger(str) {
  return /^[1-9][0-9]*$/.test((str ?? "").trim());
}

// --- Extraction des données brutes depuis rawText ---

function extractRawTableRows(rawText) {
  if (!rawText) return [];
  const tableMatch = rawText.match(/<!--\s*warbound:table:start\s*-->([\s\S]*?)<!--\s*warbound:table:end\s*-->/);
  if (!tableMatch) return [];
  const lines = tableMatch[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));
  const sepIdx = lines.findIndex((l) => /^\|[\s|:\-]+\|$/.test(l));
  if (sepIdx === -1) return [];
  return lines.slice(sepIdx + 1).map((line) => {
    const parts = line.split("|").slice(1, -1).map((c) => c.trim());
    return { id: parts[1] ?? "", actifRaw: parts[5] ?? "", weightRaw: parts[4] ?? "" };
  });
}

function extractRawBlockIds(rawText) {
  if (!rawText) return [];
  const re = /<!--\s*warbound:entry\s+id="([^"]+)"\s*-->/g;
  const ids = [];
  let m;
  while ((m = re.exec(rawText)) !== null) ids.push(m[1]);
  return ids;
}

function checkStructural(rawText, errors) {
  if (!rawText) return;
  const tableStartCount = (rawText.match(/<!--\s*warbound:table:start\s*-->/g) ?? []).length;
  if (tableStartCount === 0) {
    errors.push(err("missing-table", "Import impossible. La table Warbound est absente. Marqueur attendu : <!-- warbound:table:start -->"));
    return;
  }
  if (tableStartCount > 1) {
    errors.push(err("multiple-tables", `Import impossible. ${tableStartCount} tables Warbound déclarées. Une seule table est autorisée.`));
  }
  const tableMatch = rawText.match(/<!--\s*warbound:table:start\s*-->([\s\S]*?)<!--\s*warbound:table:end\s*-->/);
  if (tableMatch) {
    const lines = tableMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|"));
    if (lines.length > 0) {
      const headerCells = lines[0].split("|").slice(1, -1).map((c) => c.trim());
      for (const col of REQUIRED_COLUMNS) {
        if (!headerCells.includes(col)) {
          errors.push(err("missing-column", `Import impossible. Colonne obligatoire manquante : "${col}".`));
        }
      }
    }
  }
}

// --- Validateur principal ---

/**
 * Valide le modèle interne produit par parseWarboundMarkdown.
 *
 * @param {object} model - Modèle retourné par parseWarboundMarkdown
 * @param {string} [rawText] - Texte brut source (requis pour certaines vérifications structurelles)
 * @returns {{ errors: object[], warnings: object[] }}
 */
export function validateWarboundModel(model, rawText) {
  const errors = [];
  const warnings = [];

  // 1. Front matter absent
  const hasFrontMatter = rawText ? /^---\r?\n[\s\S]*?\r?\n---/.test(rawText) : true;
  if (!hasFrontMatter) {
    errors.push(err("missing-front-matter", "Import impossible. Le front matter YAML est absent."));
    return { errors, warnings };
  }

  // 2. schema absent ou non supporté
  if (model.schema === undefined || model.schema === null) {
    errors.push(err("missing-schema", "Import impossible. Le champ warbound.schema est absent du front matter."));
  } else if (!SUPPORTED_SCHEMAS.includes(model.schema)) {
    errors.push(err("unsupported-schema", `Import impossible. Schema "${model.schema}" non supporté. Schemas valides : ${SUPPORTED_SCHEMAS.join(", ")}.`));
  }

  // 3. warbound.id absent
  if (!model.collectionId) {
    errors.push(err("missing-id", "Import impossible. Le champ warbound.id est absent du front matter."));
  }

  // 4. warbound.title absent
  if (!model.title) {
    errors.push(err("missing-title", "Import impossible. Le champ warbound.title est absent du front matter."));
  }

  // 5. Vérifications structurelles via rawText
  checkStructural(rawText, errors);
  if (errors.some((e) => e.code === "missing-table")) {
    return { errors, warnings };
  }

  // 6. Valeurs brutes Actif et Poids via rawText
  const rawRows = extractRawTableRows(rawText);
  for (const row of rawRows) {
    const actifNorm = (row.actifRaw ?? "").toLowerCase();
    if (actifNorm !== "oui" && actifNorm !== "non") {
      errors.push(
        err("invalid-actif", `Import impossible. Valeur Actif invalide "${row.actifRaw}" pour l'entrée "${row.id}". Valeurs acceptées : "oui", "non".`, { id: row.id })
      );
    }
    if (!isPositiveInteger(row.weightRaw)) {
      errors.push(
        err("invalid-weight", `Import impossible. Poids invalide "${row.weightRaw}" pour l'entrée "${row.id}". Le poids doit être un entier strictement positif.`, { id: row.id })
      );
    }
  }

  // 7. ID vide dans la table
  const emptyIds = model.entries.filter((e) => !e.id);
  if (emptyIds.length > 0) {
    errors.push(err("empty-id", `Import impossible. ${emptyIds.length} entrée(s) avec ID vide dans la table.`));
  }

  // 8. IDs dupliqués dans la table
  const seenTableIds = new Set();
  for (const entry of model.entries) {
    if (entry.id) {
      if (seenTableIds.has(entry.id)) {
        errors.push(err("duplicate-id-table", `Import impossible. ID dupliqué dans la table : "${entry.id}".`, { id: entry.id }));
      } else {
        seenTableIds.add(entry.id);
      }
    }
  }

  // 9. IDs dupliqués dans les blocs entrée
  const blockIds = extractRawBlockIds(rawText);
  const seenBlockIds = new Set();
  for (const id of blockIds) {
    if (seenBlockIds.has(id)) {
      errors.push(
        err("duplicate-id-block", `Import impossible. ID dupliqué dans les blocs entrée : "${id}".\n\nBloc attendu unique :\n\n<!-- warbound:entry id="${id}" -->`, { id })
      );
    } else {
      seenBlockIds.add(id);
    }
  }

  // 10. Entrée active sans bloc détaillé
  for (const entry of model.entries) {
    if (entry.active && !entry.markdown) {
      errors.push(
        err(
          "missing-block-for-active-entry",
          `Import impossible.\n\nCollection : ${model.collectionId}\n\nL'entrée "${entry.id}" est active mais aucun bloc correspondant n'a été trouvé.\n\nBloc attendu :\n\n<!-- warbound:entry id="${entry.id}" -->`,
          { id: entry.id }
        )
      );
    }
  }

  // --- Warnings ---

  // W1. Blocs orphelins (présents dans les blocs mais absents de la table)
  const tableIdSet = new Set(model.entries.map((e) => e.id));
  for (const blockId of new Set(blockIds)) {
    if (!tableIdSet.has(blockId)) {
      warnings.push(warn("orphan-block", `Avertissement. Le bloc entrée "${blockId}" n'est référencé par aucune ligne de la table.`, { id: blockId }));
    }
  }

  // W2. Trous dans les Index
  const indices = model.entries.map((e) => e.index).filter((i) => Number.isInteger(i) && i > 0).sort((a, b) => a - b);
  for (let i = 0; i < indices.length - 1; i++) {
    for (let gap = indices[i] + 1; gap < indices[i + 1]; gap++) {
      warnings.push(warn("index-gap", `Avertissement. Trou dans les Index : l'Index ${gap} est manquant.`));
    }
  }

  // W3. Titres dupliqués
  const seenTitles = new Map();
  for (const entry of model.entries) {
    if (entry.title) {
      if (seenTitles.has(entry.title)) {
        warnings.push(warn("duplicate-title", `Avertissement. Titre dupliqué "${entry.title}" pour les entrées "${seenTitles.get(entry.title)}" et "${entry.id}".`, { id: entry.id }));
      } else {
        seenTitles.set(entry.title, entry.id);
      }
    }
  }

  // W4. Aucune entrée active
  if (model.entries.length > 0 && !model.entries.some((e) => e.active)) {
    warnings.push(warn("no-active-entry", "Avertissement. Aucune entrée active dans la collection."));
  }

  // W5. Aperçu vide
  for (const entry of model.entries) {
    if (entry.id && !entry.summary) {
      warnings.push(warn("empty-summary", `Avertissement. L'aperçu de l'entrée "${entry.id}" est vide.`, { id: entry.id }));
    }
  }

  return { errors, warnings };
}

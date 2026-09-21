/**
 * Modèle intermédiaire `EncounterDraft` et diagnostics codés (Epic Importateur COF2 PDF, section 10).
 * Module pur, sans aucune dépendance Foundry (`game`, `Actor`, `Item`, `foundry.*`).
 */

/**
 * @typedef {"high"|"medium"|"low"} Confidence
 */

/**
 * @typedef {Object} AbilityDraft
 * @property {number} base
 * @property {boolean} superior
 */

/**
 * @typedef {Object} AttackDraft
 * @property {string} raw
 * @property {string} name
 * @property {"melee"|"ranged"|"magical"|"unknown"} kind
 * @property {string|null} bonus
 * @property {string|null} damage
 * @property {number|null} range
 * @property {string} extra
 * @property {Confidence} confidence
 */

/**
 * @typedef {Object} CapacityDraft
 * @property {string} rawName
 * @property {string} name
 * @property {string} description
 * @property {"L"|"A"|"M"|"G"|null} actionType
 * @property {object|null} frequency
 * @property {string} [originPath]
 * @property {Record<string,string|number>} parameters
 * @property {object} [resolution]
 * @property {Confidence} confidence
 */

/**
 * @typedef {Object} Diagnostic
 * @property {"info"|"warning"|"error"} severity
 * @property {string} code
 * @property {string} message
 * @property {string} [sourceFragment]
 */

/**
 * @typedef {Object} ImportSource
 * @property {string} rawText
 * @property {string} normalizedText
 */

/**
 * @typedef {Object} EncounterDraft
 * @property {ImportSource} source
 * @property {string} name
 * @property {number} nc
 * @property {string} category
 * @property {string} size
 * @property {Record<string, AbilityDraft>} abilities
 * @property {number|null} defense
 * @property {number|null} hp
 * @property {number|null} initiative
 * @property {number} damageReduction
 * @property {AttackDraft[]} attacks
 * @property {CapacityDraft[]} capacities
 * @property {string[]} notes
 * @property {Diagnostic[]} diagnostics
 */

const diagnostic = (severity, code, message, sourceFragment) =>
  sourceFragment === undefined ? { severity, code, message } : { severity, code, message, sourceFragment };

/** Fragment de texte retiré/ignoré sans être bloquant (bruit d'en-tête avant le nom, ligne du corps non reconnue). */
function pdfNoiseRemoved(fragment, severity = "info") {
  return diagnostic(severity, "PDF_NOISE_REMOVED", `Ligne ignorée : « ${fragment} ».`, fragment);
}

/** Les dégâts (`DM ...`) d'une attaque ont dû être recollés depuis une autre ligne du texte source. */
function attackDamageReconnected(fragment) {
  return diagnostic("info", "ATTACK_DAMAGE_RECONNECTED", `Dégâts recollés pour « ${fragment} ».`, fragment);
}

/** Un nom de capacité correspond à plusieurs entrées candidates du référentiel, sans correspondance exacte. */
function ambiguousCapacity(fragment) {
  return diagnostic("warning", "AMBIGUOUS_CAPACITY", `Capacité ambiguë : « ${fragment} ».`, fragment);
}

/** Le paramètre d'une capacité (ex. valeur entre parenthèses) ne correspond à aucune variante connue. */
function capacityParameterMismatch(fragment) {
  return diagnostic("warning", "CAPACITY_PARAMETER_MISMATCH", `Paramètre de capacité non reconnu : « ${fragment} ».`, fragment);
}

/** Une donnée est présente dans le texte source mais ne peut pas être automatisée ; seule la première valeur est retenue. */
function unsupportedAutomation(fragment) {
  return diagnostic("warning", "UNSUPPORTED_AUTOMATION", `Non automatisable, valeur ignorée : « ${fragment} ».`, fragment);
}

/**
 * Un champ requis du statblock est introuvable. Couvre les 7 caractéristiques (FOR/AGI/CON/PER/CHA/INT/VOL) mais
 * aussi, faute d'un code dédié parmi les 7 codes stables de l'Epic, les autres champs structurants requis (nom,
 * NC, Défense, Points de vigueur, Initiative) : `sourceFragment` précise le champ concerné dans chaque cas.
 */
function missingAbility(field) {
  return diagnostic("error", "MISSING_ABILITY", `Champ requis introuvable : ${field}.`, field);
}

/** Plusieurs statblocks ont été collés à la suite ; seul le premier est importé. */
function multipleStatblocks(fragment) {
  return diagnostic("warning", "MULTIPLE_STATBLOCKS", "Plusieurs statblocks détectés : seul le premier est importé.", fragment);
}

/**
 * Assemble l'`EncounterDraft` final à partir du résultat interne du parseur.
 * @param {Omit<EncounterDraft, "source">} parsed Résultat interne du parseur (mêmes champs que `EncounterDraft`, hors `source`)
 * @param {ImportSource} source
 * @returns {EncounterDraft}
 */
function toEncounterDraft(parsed, source) {
  return { source, ...parsed };
}

export {
  pdfNoiseRemoved,
  attackDamageReconnected,
  ambiguousCapacity,
  capacityParameterMismatch,
  unsupportedAutomation,
  missingAbility,
  multipleStatblocks,
  toEncounterDraft,
};

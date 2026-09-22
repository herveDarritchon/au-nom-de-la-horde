/**
 * Détection et comparaison du paramètre numérique porté par la parenthèse finale d'une capacité `TEMPLATE_VARIANT`
 * (`capacityResolver.mjs`, §5), pour distinguer un simple avertissement d'une surcharge automatique fiable
 * (Epic Importateur COF2 PDF, §14 Priorité 2, §17 Niveau B). Module pur, sans aucun accès Foundry.
 */

const DIFFICULTY_RE = /difficult[ée]\s*(\d+)/i;
const DISTANCE_RE = /(\d+)\s*m\b/i;
const DURATION_RE = /(\d+)\s*(?:tours?|rounds?)\b/i;
const BARE_NUMBER_RE = /^(\d+)$/;

/**
 * Isole le contenu de la parenthèse finale d'un nom, comme `stripParens`/`extractActionType`.
 * @param {string} name
 * @returns {string|null}
 */
function trailingParenContent(name) {
  const m = name.match(/\(([^)]*)\)\s*$/);
  return m ? m[1].trim() : null;
}

/**
 * Détecte un paramètre numérique (difficulté, distance, durée) dans la parenthèse finale d'un nom de capacité. Un
 * nombre nu (ex. `"Charge (13)"`) suit la convention du compendium officiel : toujours interprété comme une
 * difficulté.
 * @param {string} name
 * @returns {{kind:"difficulty"|"distance"|"duration", value:number}|null}
 */
function detectParameter(name) {
  const content = trailingParenContent(name);
  if (!content) return null;

  const difficulty = content.match(DIFFICULTY_RE);
  if (difficulty) return { kind: "difficulty", value: Number(difficulty[1]) };

  const distance = content.match(DISTANCE_RE);
  if (distance) return { kind: "distance", value: Number(distance[1]) };

  const duration = content.match(DURATION_RE);
  if (duration) return { kind: "duration", value: Number(duration[1]) };

  const bare = content.match(BARE_NUMBER_RE);
  if (bare) return { kind: "difficulty", value: Number(bare[1]) };

  return null;
}

/**
 * @typedef {{status:"OVERRIDABLE"|"DETECTED_NOT_OVERRIDABLE", kind:("difficulty"|"distance"|"duration"), from:number, to:number}
 *   | {status:"UNRECOGNIZED"}} VariantComparison
 */

/**
 * Compare le paramètre détecté dans le nom source à celui du nom du modèle officiel choisi par le resolver.
 * Seule la difficulté est surchargeable automatiquement (§17 Niveau B, `saveDifficulty` a un point d'ancrage
 * structuré fiable) ; distance et durée sont détectées et signalées mais jamais surchargées automatiquement.
 * @param {string} draftName Nom source (`CapacityDraft.rawName`)
 * @param {string} templateName Nom de l'entrée modèle du compendium officiel
 * @returns {VariantComparison}
 */
function compareTemplateVariant(draftName, templateName) {
  const draft = detectParameter(draftName);
  if (!draft) return { status: "UNRECOGNIZED" };

  const template = detectParameter(templateName);
  const to = draft.value;
  const from = template?.kind === draft.kind ? template.value : null;
  if (from === null) return { status: "UNRECOGNIZED" };

  const status = draft.kind === "difficulty" ? "OVERRIDABLE" : "DETECTED_NOT_OVERRIDABLE";
  return { status, kind: draft.kind, from, to };
}

/**
 * Clone les données `system` d'une capacité modèle en surchargeant la difficulté détectée : le champ structuré
 * `actions[].resolvers[].saveDifficulty` et la première occurrence textuelle `difficulté N` de `description`. Ne
 * mute jamais l'objet reçu.
 * @param {object} templateSystemData `system` du document `Item` modèle (compendium officiel)
 * @param {number} from Difficulté actuelle du modèle
 * @param {number} to Difficulté détectée dans le texte source
 * @returns {object} Clone profond de `templateSystemData` avec la difficulté surchargée
 */
function buildDifficultyOverride(templateSystemData, from, to) {
  const clone = structuredClone(templateSystemData);

  for (const action of clone.actions ?? []) {
    for (const resolver of action.resolvers ?? []) {
      if (resolver.saveDifficulty === String(from)) resolver.saveDifficulty = String(to);
    }
  }

  if (typeof clone.description === "string") {
    clone.description = clone.description.replace(new RegExp(`difficult[ée]\\s*${from}`, "i"), (match) => match.replace(String(from), String(to)));
  }

  return clone;
}

export { detectParameter, compareTemplateVariant, buildDifficultyOverride };

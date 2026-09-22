/**
 * Détection de patterns niveau B (Epic Importateur COF2 PDF, §17) dans la description assemblée d'une capacité :
 * fréquence explicite (mappée sur un champ Foundry structuré) et trois patterns informatifs — état COF2, test de
 * caractéristique, bonus numérique — reconnus avec un niveau de confiance mais jamais écrits dans un champ
 * structuré (pas de squelette `actions[]/resolvers[]` fiable pour une capacité sans template officiel, §17
 * Niveau C). Module pur, sans aucun accès Foundry.
 */

const FREQUENCY_RE = /\b1\s*fois\s*(?:\/|par)\s*(combat|jour)\b/i;
const FREQUENCY_PERIODS = { combat: "combat", jour: "daily" };

// Pas de `\b` en tête : les accents (« é ») ne sont pas des caractères de mot pour `\b` en mode non-unicode JS.
const STATE_RE = /(renversé[e]?|étourdi[e]?(?:\s+pendant\s+\d+\s*(?:tours?|rounds?))?)\b/i;
const ABILITY_TEST_RE = /\btest\s+de\s+(FOR|AGI|CON|PER|CHA|INT|VOL)\s+difficult[ée]\s*(\d+)\b/i;
const NUMERIC_BONUS_RE = /([+\-−–]\s*\d+)\s+en\s+([a-zàâéèêëîïôùûüç]+)/i;

/**
 * Détecte une fréquence d'usage explicite (`1 fois/combat`, `1 fois par jour`, insensible à la casse).
 * @param {string} description
 * @returns {{period:"combat"|"daily", confidence:"high"}|null}
 */
function detectFrequency(description) {
  const m = description.match(FREQUENCY_RE);
  if (!m) return null;
  return { period: FREQUENCY_PERIODS[m[1].toLowerCase()], confidence: "high" };
}

/**
 * Détecte un état COF2 explicite (`renversé`, `étourdi pendant X round(s)`). Reconnaissance informative
 * uniquement : aucun champ Foundry structuré n'existe pour une capacité sans template officiel.
 * @param {string} description
 * @returns {{pattern:string, confidence:"medium"}|null}
 */
function detectState(description) {
  const m = description.match(STATE_RE);
  return m ? { pattern: m[0], confidence: "medium" } : null;
}

/**
 * Détecte un test de caractéristique explicite (`test de FOR difficulté 16`). Reconnaissance informative
 * uniquement.
 * @param {string} description
 * @returns {{pattern:string, confidence:"medium"}|null}
 */
function detectAbilityTest(description) {
  const m = description.match(ABILITY_TEST_RE);
  return m ? { pattern: m[0], confidence: "medium" } : null;
}

/**
 * Détecte un bonus numérique simple (`+5 en discrétion en forêt`). Reconnaissance informative uniquement.
 * @param {string} description
 * @returns {{pattern:string, confidence:"low"}|null}
 */
function detectNumericBonus(description) {
  const m = description.match(NUMERIC_BONUS_RE);
  return m ? { pattern: m[0], confidence: "low" } : null;
}

export { detectFrequency, detectState, detectAbilityTest, detectNumericBonus };

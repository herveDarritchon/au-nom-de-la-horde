/**
 * Helpers texte purs utilisés par le parseur de statblocks COF2.
 * Aucune dépendance Foundry.
 */

const ACRONYMS = new Set(["DM", "PV", "RD", "DEF", "NC", "PJ", "FOR", "AGI", "CON", "PER", "CHA", "INT", "VOL"]);

/** « ARAIGNÉE GÉANTE » → « Araignée géante » ; un texte déjà en casse mixte est laissé tel quel. */
function tidyCase(text) {
  if (/[a-zà-öø-ÿ]/.test(text)) return text;
  const words = text.split(" ").map((w) => (ACRONYMS.has(w) || /^\(.\)$/.test(w) ? w : w.toLowerCase()));
  return words.join(" ").replace(/^./, (c) => c.toUpperCase());
}

/** Retire les lettres isolées laissées par les pictogrammes du PDF (« W W ARAIGNÉE ») puis normalise la casse. */
const cleanName = (raw) => tidyCase(raw.replace(/^(?:[A-Z]\s+)+(?=\S{2,})/, "").trim());

const toSigned = (str) => str.replace(/[−–]/g, "-").replace(/\s+/g, "");

export { ACRONYMS, tidyCase, cleanName, toSigned };

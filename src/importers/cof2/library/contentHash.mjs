/**
 * Hash de contenu normalisé pour une capacité importée (Epic Importateur COF2 PDF, §15/§16) : sert au
 * dédoublonnage dans la bibliothèque d'import (Story 6). Module pur, sans aucune dépendance Foundry.
 */

import { normalize } from "../resolution/capacityResolver.mjs";

const normalizeText = (s) => normalize(String(s ?? ""));

function serializeParameters(parameters) {
  return Object.keys(parameters ?? {})
    .sort()
    .map((key) => `${normalizeText(key)}=${normalizeText(parameters[key])}`)
    .join("|");
}

function serializeFrequency(frequency) {
  if (!frequency || typeof frequency !== "object") return "";
  return Object.keys(frequency)
    .sort()
    .map((key) => `${normalizeText(key)}=${normalizeText(frequency[key])}`)
    .join("|");
}

/** FNV-1a 32 bits, hex sur 8 caractères : suffisant pour du dédoublonnage, pas de garantie cryptographique. */
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * @param {{type?:string, name:string, description?:string, actionType?:string|null, frequency?:object|null,
 *   parameters?:Record<string,string|number>}} draft
 * @returns {string} hash de contenu normalisé, stable pour des champs équivalents
 */
function computeContentHash({ type, name, description, actionType, frequency, parameters }) {
  const payload = [
    normalizeText(type),
    normalizeText(name),
    normalizeText(description),
    normalizeText(actionType),
    serializeFrequency(frequency),
    serializeParameters(parameters),
  ].join("::");
  return fnv1a(payload);
}

export { computeContentHash };

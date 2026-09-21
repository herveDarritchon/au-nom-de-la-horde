/**
 * Analyse d'un statblock COF2 collé (Bestiaire COF2).
 *
 * Module pur, sans aucune dépendance Foundry (`game`, `Actor`, `Item`, `foundry.*`) : exécutable et testable
 * sous Node.js pur, en plus d'être importé côté navigateur par le module Foundry.
 *
 * Format attendu (Bestiaire COF2) :
 *   Aigle commun
 *   | NC 1/2
 *   taille petite                       (ou « créature humanoïde · taille grande »)
 *   AGI +3* CON +2 FOR -3 PER +4* CHA +0 INT -4 VOL +0        (* = dé bonus)
 *   S Défense 13
 *   V Points de vigueur 3
 *   I Initiative 16
 *   Serres +3 · DM 1d4
 *   Vol rapide :
 *   La créature obtient une action de mouvement…
 */

import { tidyCase, cleanName, toSigned } from "./textUtils.mjs";
import { reconstructText } from "./textReconstruction.mjs";
import { missingAbility, multipleStatblocks, pdfNoiseRemoved, toEncounterDraft, unsupportedAutomation } from "./encounterDraft.mjs";

const ABILITIES = ["for", "agi", "con", "per", "cha", "int", "vol"];
const SIZES = { "très petite": "verySmall", minuscule: "tiny", petite: "small", moyenne: "medium", grande: "large", énorme: "huge", colossale: "colossal" };

const NC_LINE_RE = /^(?:(.*?)\s*\|\s*)?NC\s*(\d+(?:\s*\/\s*\d+)?)\b/;
const ABILITY_RE = /\b(FOR|AGI|CON|PER|CHA|INT|VOL)\s*([+\-−–]\s*\d+)\s*(\*)?/g;
const DEF_RE = /(?:^|\s)(?:S\s+)?(?:D[ée]fense|DEF)\s*:?\s*(\d+)/i;
const HP_RE = /(?:^|\s)(?:V\s+)?(?:Points? de (?:vigueur|vie)|PV)\s*:?\s*(\d+)/i;
const INIT_RE = /(?:^|\s)(?:I\s+)?(?:Initiative|Init\.?)\s*:?\s*(\d+)/i;
const ATTACK_RE = /^(.+?)\s+([+\-−–]\s*\d+)\s*(?:[·•|]\s*)?(?:DM\s*(.*))?$/;
const DAMAGE_RE = /^((?:\d*d\d+°?|\d+)(?:\s*[+\-]\s*(?:\d*d\d+°?|\d+))*)\s*(.*)$/i;
const TITLE_RE = /^([A-ZÀ-ÖØ-Þ][^:.!?\[@]{0,60}?)\s*:\s*(.*)$/;

/**
 * Analyse un statblock COF2 collé.
 * @param {string} text Le texte du statblock
 * @returns {import("./encounterDraft.mjs").EncounterDraft}
 */
function parseStatblock(text) {
  const diagnostics = [];
  const { rawText, normalizedText } = reconstructText(text);
  let lines = normalizedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result = { name: "", nc: 0, category: "living", size: "medium", abilities: {}, defense: null, hp: null, initiative: null, damageReduction: 0, notes: [], attacks: [], capacities: [], diagnostics };

  // 1. Ligne « | NC x » : le nom est avant sur la même ligne, ou sur la ligne précédente
  const ncIndex = lines.findIndex((l) => NC_LINE_RE.test(l));
  if (ncIndex < 0) {
    diagnostics.push(missingAbility("NC"));
    return toEncounterDraft(result, { rawText, normalizedText });
  }
  const ncMatch = lines[ncIndex].match(NC_LINE_RE);
  const inlineName = ncMatch[1]?.trim();
  const nameLine = inlineName || lines[ncIndex - 1];
  if (!nameLine) diagnostics.push(missingAbility("nom"));
  result.name = cleanName(nameLine ?? "");
  const skipped = inlineName ? ncIndex : ncIndex - 1;
  if (skipped > 0) diagnostics.push(pdfNoiseRemoved(lines.slice(0, skipped).join(" / ")));
  const [num, den] = ncMatch[2].split("/").map((n) => Number(n.trim()));
  result.nc = den ? num / den : num;

  // 2. Un deuxième statblock collé par erreur : on s'arrête avant son nom
  lines = lines.slice(ncIndex + 1);
  const nextNc = lines.findIndex((l) => NC_LINE_RE.test(l));
  if (nextNc >= 0) {
    const inline = NC_LINE_RE.exec(lines[nextNc])[1]?.trim();
    lines.length = inline ? nextNc : Math.max(0, nextNc - 1);
    diagnostics.push(multipleStatblocks(lines[nextNc]));
  }

  // 3. En-tête : caractéristiques, défense, PV, initiative, catégorie/taille, jusqu'à ce que tout soit lu
  const headerDone = () => ABILITIES.every((a) => a in result.abilities) && result.defense !== null && result.hp !== null && result.initiative !== null;
  let i = 0;
  for (; i < lines.length && !headerDone(); i++) {
    const line = lines[i];
    let matched = false;
    for (const m of line.matchAll(ABILITY_RE)) {
      result.abilities[m[1].toLowerCase()] = { base: Number(toSigned(m[2])), superior: !!m[3] };
      matched = true;
    }
    for (const [re, key] of [[DEF_RE, "defense"], [HP_RE, "hp"], [INIT_RE, "initiative"]]) {
      const m = line.match(re);
      if (!m) continue;
      result[key] = Number(m[1]);
      matched = true;
      // Suite éventuelle : « (RD 5) » = réduction des DM ; toute autre parenthèse ou « à 100 » n'est pas modélisée
      const tail = line.slice(m.index + m[0].length).match(/^\s*(\(\s*RD\s*(\d+)\s*\)|\([^)]*\)|à\s*\d+)/i);
      if (tail?.[2]) result.damageReduction = Number(tail[2]);
      else if (tail) diagnostics.push(unsupportedAutomation(`${m[0].trim()} ${tail[1]}`));
    }
    if (matched) continue;
    if (/(^|·\s*)(créature|taille)\b/i.test(line)) {
      if (/non[- ]vivant/i.test(line)) result.category = "undead";
      else if (/humano/i.test(line)) result.category = "humanoid";
      else if (/v[ée]g[ée]tal|plante/i.test(line)) result.category = "plant";
      const size = line.match(/taille\s+(très petite|minuscule|petite|moyenne|grande|énorme|colossale)/i);
      if (size) result.size = SIZES[size[1].toLowerCase()];
      continue;
    }
    if (parseAttackLine(line) || matchTitle(line)) break;
    result.notes.push(line);
  }
  for (const a of ABILITIES) if (!(a in result.abilities)) diagnostics.push(missingAbility(a.toUpperCase()));
  if (result.defense === null) diagnostics.push(missingAbility("Défense"));
  if (result.hp === null) diagnostics.push(missingAbility("Points de vigueur"));
  if (result.initiative === null) diagnostics.push(missingAbility("Initiative"));

  // 4. Corps : attaques (avant la première capacité) puis capacités « Titre : texte »
  let current = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const last = result.attacks.at(-1);
    if (!current && last && (last.extra.match(/\(/g)?.length ?? 0) > (last.extra.match(/\)/g)?.length ?? 0)) {
      last.extra = `${last.extra} ${line}`;
      continue;
    }
    const attack = current ? null : parseAttackLine(line);
    if (attack) {
      result.attacks.push(attack);
      continue;
    }
    // Un titre sans texte réclame la ligne suivante comme texte, même si elle ressemble à un titre
    const title = current && !current.description ? null : matchTitle(line);
    if (title) {
      current = title;
      result.capacities.push(current);
    } else if (current) {
      current.description = current.description ? `${current.description} ${line}` : line;
    } else {
      // Aucun des 7 codes stables ne décrit précisément une ligne de corps non reconnue : traitée comme du
      // bruit résiduel (au même titre que le bruit d'en-tête), en sévérité `warning` pour rester visible.
      diagnostics.push(pdfNoiseRemoved(line, "warning"));
    }
  }
  // `attacks.length === 0` est directement lisible sur le draft : pas de diagnostic dédié, aucun des 7 codes
  // stables ne correspondant à « aucune attaque reconnue ».

  return toEncounterDraft(result, { rawText, normalizedText });
}

/**
 * @param {string} line
 * @returns {import("./encounterDraft.mjs").AttackDraft|null}
 */
function parseAttackLine(line) {
  const m = line.match(ATTACK_RE);
  if (!m) return null;
  const name = m[1].trim();
  const rangeMatch = name.match(/\((?:portée\s*)?(\d+)\s*m\)/i);
  const range = rangeMatch ? Number(rangeMatch[1]) : null;
  let kind = "melee";
  if (/^attaque magique/i.test(name)) kind = "magical";
  else if (range || /^attaque à distance/i.test(name)) kind = "ranged";
  const dm = m[3]?.trim() ? m[3].trim().match(DAMAGE_RE) : null;
  const damage = dm ? dm[1].replace(/\s+/g, "") : "";
  return { raw: line, name, kind, bonus: toSigned(m[2]), damage, range, extra: dm ? dm[2].trim() : (m[3]?.trim() ?? ""), confidence: damage ? "high" : "low" };
}

/**
 * @param {string} line
 * @returns {import("./encounterDraft.mjs").CapacityDraft|null}
 */
function matchTitle(line) {
  const m = line.match(TITLE_RE);
  if (!m || m[1].trim().split(/\s+/).length > 7) return null;
  const rawName = m[1].trim();
  // « Charge (L) » : la parenthèse porte le type d'action (L/A/M/G), pas une variante paramétrée ambiguë.
  const trailingParens = rawName.match(/\(([^)]*)\)\s*$/);
  const confidence = trailingParens && !/^[LAMG]$/.test(trailingParens[1].trim()) ? "medium" : "high";
  return { rawName, name: tidyCase(rawName), description: m[2].trim(), actionType: null, frequency: null, parameters: {}, confidence };
}

export { ABILITIES, SIZES, parseStatblock, parseAttackLine, matchTitle };

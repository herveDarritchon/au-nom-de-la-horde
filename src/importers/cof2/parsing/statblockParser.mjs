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
 * @returns {{name:string, nc:number, category:string, size:string, abilities:object, def:number, hp:number, init:number, dr:number,
 *   notes:string[], attacks:object[], capacities:{name:string,text:string}[], warnings:string[], errors:string[]}}
 */
function parseStatblock(text) {
  const warnings = [];
  const errors = [];
  let lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, " ").replace(/ {2,}/g, " ").replace(/[‐-‒−]/g, "-").trim())
    .filter(Boolean);

  const result = { name: "", nc: 0, category: "living", size: "medium", abilities: {}, def: null, hp: null, init: null, dr: 0, notes: [], attacks: [], capacities: [], warnings, errors };

  // 1. Ligne « | NC x » : le nom est avant sur la même ligne, ou sur la ligne précédente
  const ncIndex = lines.findIndex((l) => NC_LINE_RE.test(l));
  if (ncIndex < 0) {
    errors.push("Ligne « NC » introuvable : le collage ne ressemble pas à un statblock COF2.");
    return result;
  }
  const ncMatch = lines[ncIndex].match(NC_LINE_RE);
  const inlineName = ncMatch[1]?.trim();
  const nameLine = inlineName || lines[ncIndex - 1];
  if (!nameLine) errors.push("Nom de la créature introuvable (attendu juste avant la ligne « NC »).");
  result.name = cleanName(nameLine ?? "");
  const skipped = inlineName ? ncIndex : ncIndex - 1;
  if (skipped > 0) warnings.push(`${skipped} ligne(s) avant le nom ignorée(s).`);
  const [num, den] = ncMatch[2].split("/").map((n) => Number(n.trim()));
  result.nc = den ? num / den : num;

  // 2. Un deuxième statblock collé par erreur : on s'arrête avant son nom
  lines = lines.slice(ncIndex + 1);
  const nextNc = lines.findIndex((l) => NC_LINE_RE.test(l));
  if (nextNc >= 0) {
    const inline = NC_LINE_RE.exec(lines[nextNc])[1]?.trim();
    lines.length = inline ? nextNc : Math.max(0, nextNc - 1);
    warnings.push("Plusieurs statblocks détectés : seul le premier est importé.");
  }

  // 3. En-tête : caractéristiques, défense, PV, initiative, catégorie/taille, jusqu'à ce que tout soit lu
  const headerDone = () => ABILITIES.every((a) => a in result.abilities) && result.def !== null && result.hp !== null && result.init !== null;
  let i = 0;
  for (; i < lines.length && !headerDone(); i++) {
    const line = lines[i];
    let matched = false;
    for (const m of line.matchAll(ABILITY_RE)) {
      result.abilities[m[1].toLowerCase()] = { base: Number(toSigned(m[2])), superior: !!m[3] };
      matched = true;
    }
    for (const [re, key] of [[DEF_RE, "def"], [HP_RE, "hp"], [INIT_RE, "init"]]) {
      const m = line.match(re);
      if (!m) continue;
      result[key] = Number(m[1]);
      matched = true;
      // Suite éventuelle : « (RD 5) » = réduction des DM ; toute autre parenthèse ou « à 100 » n'est pas modélisée
      const tail = line.slice(m.index + m[0].length).match(/^\s*(\(\s*RD\s*(\d+)\s*\)|\([^)]*\)|à\s*\d+)/i);
      if (tail?.[2]) result.dr = Number(tail[2]);
      else if (tail) warnings.push(`« ${m[0].trim()} ${tail[1]} » : seule la première valeur (${m[1]}) est retenue.`);
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
  for (const a of ABILITIES) if (!(a in result.abilities)) errors.push(`Caractéristique ${a.toUpperCase()} introuvable.`);
  if (result.def === null) errors.push("Défense introuvable.");
  if (result.hp === null) errors.push("Points de vigueur introuvables.");
  if (result.init === null) errors.push("Initiative introuvable.");

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
    const title = current && !current.text ? null : matchTitle(line);
    if (title) {
      current = title;
      result.capacities.push(current);
    } else if (current) {
      current.text = current.text ? `${current.text} ${line}` : line;
    } else {
      warnings.push(`Ligne non reconnue : « ${line} »`);
    }
  }
  if (!result.attacks.length) warnings.push("Aucune attaque reconnue.");

  return result;
}

/**
 * @param {string} line
 * @returns {{name:string, kind:"melee"|"ranged"|"magic", bonus:string, damage:string, extra:string, range:number|null}|null}
 */
function parseAttackLine(line) {
  const m = line.match(ATTACK_RE);
  if (!m) return null;
  const name = m[1].trim();
  const rangeMatch = name.match(/\((?:portée\s*)?(\d+)\s*m\)/i);
  const range = rangeMatch ? Number(rangeMatch[1]) : null;
  let kind = "melee";
  if (/^attaque magique/i.test(name)) kind = "magic";
  else if (range || /^attaque à distance/i.test(name)) kind = "ranged";
  const dm = m[3]?.trim() ? m[3].trim().match(DAMAGE_RE) : null;
  return { name, kind, bonus: toSigned(m[2]), damage: dm ? dm[1].replace(/\s+/g, "") : "", extra: dm ? dm[2].trim() : (m[3]?.trim() ?? ""), range };
}

/**
 * @param {string} line
 * @returns {{name:string, text:string}|null}
 */
function matchTitle(line) {
  const m = line.match(TITLE_RE);
  if (!m || m[1].trim().split(/\s+/).length > 7) return null;
  return { name: tidyCase(m[1].trim()), text: m[2].trim() };
}

export { ABILITIES, SIZES, parseStatblock, parseAttackLine, matchTitle };

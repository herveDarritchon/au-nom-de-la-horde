/**
 * Normalisation et reconstruction du texte brut colle depuis un PDF (Bestiaire COF2).
 * Module pur, sans aucune dependance Foundry, execute avant `parseStatblock` : une ligne PDF n'est plus
 * une unite semantique fiable (bruit de page, cesures, attaques ou champs coupes sur plusieurs lignes,
 * plusieurs champs colles sur une seule ligne).
 */

const NOISE_PAGE_NUMBER_RE = /^\d+$/;
const NOISE_RUNNING_TITLE_RE = /^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9 ]*\s-\s[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9 ]*$/;
const NOISE_KEYWORD_RE = /^(?:INTRO)$/i;
const NOISE_PICTOGRAM_RE = /^(?:[A-Z](?:\s+|$))+$/;

const ATTACK_TAIL_RE = /[+\-−–]\s*\d+\s*(?:[·•|]\s*)?$/;
const ABILITY_TOKEN_RE = /\b(?:FOR|AGI|CON|PER|CHA|INT|VOL)\b/;

/** Un mot COF2 "en toutes lettres" : Majuscule suivie de minuscules, ou de mots minuscules (ex. "Epee longue"). */
const WORD_SHAPE = "[\\p{Lu}][\\p{Ll}'’]*(?:\\s[\\p{Ll}][\\p{Ll}'’]*)*";
const ATTACK_START_RE = new RegExp(`(?<=^|\\s)(${WORD_SHAPE})\\s+([+\\-−–]\\s*\\d+)`, "gu");
const TITLE_START_RE = /(?<=^|\s)([\p{Lu}][\p{L}' ]{0,40}?)\s*:(?=\s|$)/gu;

const HEADER_FIELD_MARKERS = [
  /\b(?:cr[ée]ature|taille)\b/i,
  /\b(?:FOR|AGI|CON|PER|CHA|INT|VOL)\s*[+\-−–]\s*\d+/,
  /(?:^|\s)(?:S\s+)?(?:D[ée]fense|DEF)\s*:?\s*\d+/i,
  /(?:^|\s)(?:V\s+)?(?:Points?\s+de\s+(?:vigueur|vie)|PV)\s*:?\s*\d+/i,
  /(?:^|\s)(?:I\s+)?(?:Initiative|Init\.?)\s*:?\s*\d+/i,
];

/** Espaces insecables, tirets Unicode, apostrophes, ligatures, caracteres de controle -> formes simples. */
function normalizeUnicode(text) {
  return String(text ?? "")
    .replace(/[   - ]/g, " ")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/** Une ligne de bruit PDF : numero de page isole, titre courant ("BESTIAIRE - ..."), mot-cle "INTRO", ou lettres isolees de pictogramme. */
function isNoiseLine(line) {
  const trimmed = line.trim();
  return (
    NOISE_PAGE_NUMBER_RE.test(trimmed) ||
    NOISE_RUNNING_TITLE_RE.test(trimmed) ||
    NOISE_KEYWORD_RE.test(trimmed) ||
    NOISE_PICTOGRAM_RE.test(trimmed)
  );
}

/** Retire les lignes de bruit PDF ; suppression silencieuse, jamais bloquante. */
function stripPdfNoise(lines) {
  return lines.filter((line) => !isNoiseLine(line));
}

/** Repare les cesures "mot-\nsuite" -> "motsuite" ; ne fusionne pas si la suite commence par une majuscule (mot compose ou nouveau champ). */
function repairHyphenation(text) {
  return text.replace(/([\p{L}]+)-\n[ \t]*(\p{Ll}[\p{L}]*)/gu, "$1$2");
}

/** Rejoint une ligne d'attaque sans DM ("Sabots +7 ·") avec la ligne suivante qui porte les degats ("DM 1d8+6"). */
function mergeDmContinuation(lines) {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    const isDanglingAttack = ATTACK_TAIL_RE.test(line) && !/\bDM\b/i.test(line) && !ABILITY_TOKEN_RE.test(line);
    if (isDanglingAttack && next && /^DM\b/i.test(next.trim())) {
      result.push(`${line} ${next.trim()}`);
      i++;
      continue;
    }
    result.push(line);
  }
  return result;
}

/**
 * Separe une ligne d'en-tete "NC + taille + caracteristiques + Defense + PV + Initiative" colles en un seul
 * bloc en plusieurs lignes, une par champ. Ne touche pas aux lignes qui ne contiennent pas "NC".
 */
function splitHeaderFields(line) {
  if (!/\bNC\s*\d/.test(line)) return [line];
  const ncMatch = line.match(/^(.*?\bNC\s*\d+(?:\s*\/\s*\d+)?\b)(.*)$/);
  if (!ncMatch) return [line];
  const head = ncMatch[1].trim();
  const rest = ncMatch[2];

  const cutIndices = new Set([0]);
  for (const marker of HEADER_FIELD_MARKERS) {
    const m = rest.match(marker);
    if (m && m.index !== undefined) cutIndices.add(m.index);
  }
  const cuts = [...cutIndices].sort((a, b) => a - b);

  const segments = [head];
  for (let k = 0; k < cuts.length; k++) {
    const start = cuts[k];
    const end = k + 1 < cuts.length ? cuts[k + 1] : rest.length;
    const seg = rest.slice(start, end).trim();
    if (seg) segments.push(seg);
  }
  return segments;
}

/** Separe les attaques collees sur une meme ligne (plusieurs attaques, ou stats + attaque). */
function splitAttackChunks(line) {
  const matches = [...line.matchAll(ATTACK_START_RE)];
  if (matches.length === 0) return [line];
  if (matches.length === 1 && matches[0].index === 0) return [line];

  const segments = [];
  const leading = line.slice(0, matches[0].index).trim();
  if (leading) segments.push(leading);
  for (let k = 0; k < matches.length; k++) {
    const start = matches[k].index;
    const end = k + 1 < matches.length ? matches[k + 1].index : line.length;
    const seg = line.slice(start, end).trim();
    if (seg) segments.push(seg);
  }
  return segments;
}

/** Separe un titre de capacite ("Nom :") colle apres une attaque ou un autre champ. */
function splitTitleChunks(line) {
  const matches = [...line.matchAll(TITLE_START_RE)].filter((m) => m.index > 0);
  if (matches.length === 0) return [line];

  const segments = [];
  let prevEnd = 0;
  for (const m of matches) {
    const seg = line.slice(prevEnd, m.index).trim();
    if (seg) segments.push(seg);
    prevEnd = m.index;
  }
  const tail = line.slice(prevEnd).trim();
  if (tail) segments.push(tail);
  return segments;
}

/** Reconstruit les segments logiques : DM sur ligne suivante, champs d'en-tete colles, attaques et titres colles. */
function reconstructSegments(lines) {
  return mergeDmContinuation(lines)
    .flatMap(splitHeaderFields)
    .flatMap(splitAttackChunks)
    .flatMap(splitTitleChunks);
}

/**
 * Orchestre la normalisation Unicode, la suppression du bruit PDF, la reparation des cesures puis la
 * reconstruction des segments logiques. Conserve `rawText` et `normalizedText` separement pour la tracabilite.
 * @param {string} rawText Texte brut colle depuis le PDF
 * @returns {{rawText:string, normalizedText:string}}
 */
function reconstructText(rawText) {
  const raw = String(rawText ?? "");
  const unicodeNormalized = normalizeUnicode(raw);
  const collapsedLines = unicodeNormalized
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const withoutNoise = stripPdfNoise(collapsedLines);
  const hyphenRepaired = repairHyphenation(withoutNoise.join("\n"));
  const reconstructedLines = reconstructSegments(
    hyphenRepaired
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  );
  return { rawText: raw, normalizedText: reconstructedLines.join("\n") };
}

export { normalizeUnicode, stripPdfNoise, repairHyphenation, reconstructSegments, reconstructText };

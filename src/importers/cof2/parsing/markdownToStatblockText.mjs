/**
 * Convertit un statblock COF2 mis en forme en Markdown en texte brut pour le parseur.
 *
 * Ce n'est PAS un assainisseur HTML/XSS. Le texte doit rester traité comme du texte
 * non fiable et ne jamais être inséré via innerHTML.
 *
 * Les astérisques simples des caractéristiques supérieures (CON +6*) sont conservés.
 * Fonction pure et idempotente : peut être appelée au collage ET avant l'analyse.
 *
 * @param {string} source
 * @returns {string}
 */
function markdownToStatblockText(source) {
  if (typeof source !== "string" || !source) return "";

  const result = [];
  for (const rawLine of source.replace(/\r\n?/g, "\n").replace(/[\u00A0\u202F]/g, " ").split("\n")) {
    let line = rawLine;

    // Supprime seulement les délimiteurs de bloc, pas le texte des blocs de code.
    if (/^\s*```/.test(line) || /^\s*~~~/.test(line)) continue;
    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) continue;
    // Lignes séparatrices de tableaux Markdown (|---|:---:|, etc.).
    if (/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)) continue;

    line = line.replace(/^\s{0,3}#{1,6}[ \t]+/, ""); // Titres
    line = line.replace(/^\s*>[ \t]?/, "");        // Citation
    line = line.replace(/^\s*[-+*][ \t]+/, "");     // Puce

    // Remplace les liens par leur texte, sans conserver leur URL parasite.
    line = line.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
    // Retire les marques d'emphase doubles, sans toucher au '*' seul de CON +6*.
    line = line.replace(/\*\*|__(?=\S)|(?<=\S)__/g, "");
    // Emphase simple seulement lorsque les marqueurs encadrent du texte.
    // Ne jamais absorber un astérisque accolé à une valeur numérique (+6*).
    line = line.replace(/(?<![\w*])\*([A-Za-zÀ-ÖØ-öø-ÿ][^*\n]*[A-Za-zÀ-ÖØ-öø-ÿ])\*(?![\w*])/g, "$1");
    line = line.replace(/~~/g, "");
    line = line.replace(/`([^`\n]+)`/g, "$1");

    // L'éditeur peut avoir écrit « CENTAURE — NC 3 » : format attendu « CENTAURE | NC 3 ».
    // Conversion volontairement limitée aux lignes qui se terminent exactement par un NC.
    line = line.replace(/^(.+?)\s+[—–-]\s+(NC\s*\d+(?:\s*\/\s*\d+)?)\s*$/i, "$1 | $2");

    result.push(line.trimEnd());
  }

  return result.join("\n").trim();
}

export { markdownToStatblockText };

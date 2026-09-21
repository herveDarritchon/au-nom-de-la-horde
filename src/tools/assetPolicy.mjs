/**
 * Politique de classification des références d'assets Warbound.
 *
 * Module pur : aucune lecture du système de fichiers, aucun `process.cwd()`. Reçoit une référence de chemin déjà
 * extraite d'un YAML et une config explicite, retourne un verdict — la vérification de présence sur disque du cas
 * `MODULE` reste à la charge de l'appelant (elle nécessite une I/O).
 *
 * Politique (voir `tools/auditAssets.mjs`) :
 * - worlds/...                         => ERREUR BLOQUANTE
 * - modules/<config.modulePrefix>/...  => OK (vérification de présence déléguée à l'appelant)
 * - modules/<autre>/...                => WARNING
 * - systems/<config.systemPrefix>/...  => OK
 * - systems/<autre>/...                => WARNING
 * - icons/... / ui/...                 => OK (Foundry Core)
 * - http:// / https://                 => OK
 * - data:...                           => OK
 * - autres références                  => WARNING
 */

/**
 * @param {string} ref Référence de chemin extraite d'un YAML (ex: "modules/warbound-campaign-content/img/x.webp")
 * @param {{modulePrefix:string, systemPrefix:string, excludedPatterns?:RegExp[]}} config
 * @returns {{type:string, verdict:"ok"|"warning"|"error", requiresFileCheck?:boolean, details?:string}}
 */
function classifyPath(ref, config) {
  if (config.excludedPatterns?.some((pattern) => pattern.test(ref))) {
    return { type: "EXCLUDED", verdict: "ok" };
  }

  if (ref.startsWith("worlds/")) {
    return {
      type: "WORLD_REFERENCE",
      verdict: "error",
      details: "Une référence à un world n'est pas portable dans un module."
    };
  }

  if (ref.startsWith(config.modulePrefix)) {
    return { type: "MODULE", verdict: "ok", requiresFileCheck: true };
  }

  if (ref.startsWith("modules/")) {
    return {
      type: "EXTERNAL_MODULE_REFERENCE",
      verdict: "warning",
      details: "Référence vers un autre module Foundry."
    };
  }

  if (ref.startsWith(config.systemPrefix)) {
    return { type: "SYSTEM_COF2", verdict: "ok" };
  }

  if (ref.startsWith("systems/")) {
    return {
      type: "EXTERNAL_SYSTEM_REFERENCE",
      verdict: "warning",
      details: `Référence vers un système autre que ${config.systemPrefix.replace(/^systems\/|\/$/g, "")}.`
    };
  }

  if (ref.startsWith("icons/") || ref.startsWith("ui/")) {
    return { type: "FOUNDRY_CORE", verdict: "ok" };
  }

  if (/^https?:\/\//i.test(ref)) {
    return { type: "REMOTE", verdict: "ok" };
  }

  if (/^data:/i.test(ref)) {
    return { type: "DATA_URI", verdict: "ok" };
  }

  return {
    type: "UNCLASSIFIED_REFERENCE",
    verdict: "warning",
    details: "Référence média non reconnue par la politique Warbound."
  };
}

export { classifyPath };

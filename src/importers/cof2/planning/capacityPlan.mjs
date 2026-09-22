/**
 * Traduit le statut du resolver (`capacityResolver.mjs`, §5) et, en priorité 3, le résultat de la bibliothèque
 * d'import (`importLibrary.mjs`, §6) vers le vocabulaire `ImportPlan` de l'Epic Importateur COF2 PDF (§19) :
 * `REUSE_OFFICIAL`, `REUSE_IMPORTED`, `CREATE_NEW`, `CREATE_FROM_TEMPLATE`, `MANUAL_REVIEW`.
 *
 * Module pur : ne connaît ni le resolver ni la bibliothèque d'import, ne fait aucun accès Foundry.
 */

/**
 * @typedef {{status:"REUSE_OFFICIAL"|"REUSE_IMPORTED"|"CREATE_NEW"|"CREATE_FROM_TEMPLATE", reason?:string}
 *   | {status:"MANUAL_REVIEW", reason:string}} CapacityResolutionPlan
 */

/**
 * @param {{resolverStatus:("EXACT_REUSE"|"TEMPLATE_VARIANT"|"AMBIGUOUS"|"NOT_FOUND"),
 *   libraryOutcome?:{reused?:boolean, variant?:boolean}}} input
 * @returns {CapacityResolutionPlan}
 */
function planCapacityResolution({ resolverStatus, libraryOutcome }) {
  switch (resolverStatus) {
    case "EXACT_REUSE":
      return { status: "REUSE_OFFICIAL" };
    case "TEMPLATE_VARIANT":
      return { status: "CREATE_FROM_TEMPLATE" };
    case "AMBIGUOUS":
      return { status: "MANUAL_REVIEW", reason: "ambiguous-official" };
    case "NOT_FOUND":
      if (libraryOutcome?.reused) return { status: "REUSE_IMPORTED" };
      if (libraryOutcome?.variant) return { status: "MANUAL_REVIEW", reason: "library-name-variant" };
      return { status: "CREATE_NEW" };
    default:
      throw new Error(`Statut de résolution inconnu : ${resolverStatus}`);
  }
}

export { planCapacityResolution };

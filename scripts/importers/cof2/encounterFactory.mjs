/**
 * Création Foundry d'une rencontre COF2 depuis un `EncounterDraft` (parsing pur, voir `src/importers/cof2/`).
 *
 * Orchestrateur : délègue la construction des documents à `actorFactory.mjs`/`itemFactory.mjs`, l'isolation de
 * l'API COF2 à `cof2Adapter.mjs`, la résolution multi-sources au resolver (`capacityResolver.mjs`, #5) et à la
 * bibliothèque d'import (`importLibrary.mjs`, #6), et la traduction en statut `ImportPlan` (§19 de l'Epic) à
 * `capacityPlan.mjs`. Seul point d'écriture Foundry du pipeline d'import COF2, partagé par la commande de debug
 * (`cof2Debug.mjs`) et le wizard d'import (`cof2ImportWizard.mjs`).
 *
 * Transaction et rollback (§20 de l'Epic, Story 10) : toute la séquence d'écriture (acteur → attaques →
 * capacités → bibliothèque → attachement) est enveloppée dans un seul `try/catch`. Chaque écriture réussie pousse
 * une action de rollback (`rollbackActions`) ; une exception déclenche leur exécution en ordre inverse avant de
 * renvoyer un rapport d'échec, sans jamais laisser un acteur à moitié importé silencieusement.
 */

import { makeCapacityResolver, computeContentHash, compareTemplateVariant, buildDifficultyOverride, capacityParameterMismatch, importWriteFailed, importRollbackFailed } from "../../../src/importers/cof2/index.mjs";
import { planCapacityResolution } from "../../../src/importers/cof2/planning/capacityPlan.mjs";
import { ensureImportLibraryPack, findByHash, saveImportedCapacity } from "./importLibrary.mjs";
import { createEncounterActor } from "./actorFactory.mjs";
import { buildAttackItemData, buildCapacityItemData, buildCapacityVariantItemData } from "./itemFactory.mjs";
import { addCapacityToActor } from "./cof2Adapter.mjs";

const MODULE_ID = "warbound-campaign-content";
const DEBUG_LOGGING_SETTING = "cof2ImportDebugLogging";
const PACK_ID = "cof2-base.cof-2-base-items";
const CAPACITY_FOLDERS = ["Capacités des rencontres", "Capacité de base"];
const IMPORT_SOURCE_TYPE = "pdf-text";

/**
 * @returns {boolean} true si le réglage `cof2ImportDebugLogging` est actif. `game.settings` peut être absent
 *   (tests avec mock Foundry minimal) : toute erreur de lecture est traitée comme « désactivé ».
 */
function isDebugLoggingEnabled() {
  try {
    return game.settings.get(MODULE_ID, DEBUG_LOGGING_SETTING) === true;
  } catch {
    return false;
  }
}

/**
 * Émet un log de debug structuré (code diagnostic + fragment source) si le réglage `cof2ImportDebugLogging` est
 * actif, sans jamais modifier le comportement de l'import (AC #5 de l'issue #10).
 * @param {string} code
 * @param {string} fragment
 * @param {string} [message]
 */
function debugLog(code, fragment, message = "") {
  if (isDebugLoggingEnabled()) console.debug(`Import COF2 | ${code}`, { fragment, message });
}

/**
 * Charge les capacités de créatures du compendium (dossiers « Capacités des rencontres » et « Capacité de base » uniquement :
 * ce sont les seuls que le bestiaire utilise, les capacités de voies de PJ n'ont rien à faire sur un monstre).
 * @returns {Promise<{pack:object, resolve:ReturnType<typeof makeCapacityResolver>}|null>} null si le compendium est absent
 */
async function buildCapacityResolver() {
  const pack = game.packs.get(PACK_ID);
  if (!pack) return null;
  const index = await pack.getIndex({ fields: ["folder"] });
  const folderIds = new Set(pack.folders.filter((f) => CAPACITY_FOLDERS.includes(f.name)).map((f) => f.id));
  const priority = pack.folders.find((f) => f.name === CAPACITY_FOLDERS[0])?.id;
  const entries = index.filter((e) => e.type === "capacity" && folderIds.has(e.folder));
  return { pack, resolve: makeCapacityResolver({ officialEntries: entries, priorityFolderId: priority }) };
}

/**
 * Résout une capacité `NOT_FOUND` en priorité 3 (bibliothèque d'import du monde, §14/§15 de l'Epic) : réutilise
 * l'entrée existante si son hash de contenu est identique, crée une variante à examiner si le nom correspond déjà
 * à une entrée de hash différent, sinon crée une nouvelle entrée `generated`. N'écrit jamais dans le pack officiel.
 * @param {import("../../../src/importers/cof2/parsing/encounterDraft.mjs").CapacityDraft} cap
 * @param {(() => Promise<void>)[]} rollbackActions Accumulateur d'actions de rollback (Story 10, §20 de l'Epic)
 * @returns {Promise<{doc:object, reused:boolean, variant:boolean}>}
 */
async function resolveViaImportLibrary(cap, rollbackActions) {
  const pack = await ensureImportLibraryPack("capacity");
  const hash = computeContentHash({ type: "capacity", name: cap.name, description: cap.description, actionType: cap.actionType, frequency: cap.frequency, parameters: cap.parameters });

  const byHash = await findByHash(pack, hash);
  if (byHash) return { doc: byHash, reused: true, variant: false };

  const index = await pack.getIndex();
  const nameNormalized = cap.name.trim().toLowerCase();
  const sameName = index.some((e) => e.name.trim().toLowerCase() === nameNormalized);
  const reviewStatus = sameName ? "review-required" : "generated";
  const doc = await saveImportedCapacity(pack, cap, { hash, sourceType: IMPORT_SOURCE_TYPE, reviewStatus });
  rollbackActions.push(() => doc.delete());
  debugLog("IMPORT_LIBRARY_DOC_CREATED", cap.name);
  return { doc, reused: false, variant: sameName };
}

/**
 * Ajoute une capacité résolue (officielle ou bibliothèque d'import) à l'acteur via `Cof2Adapter`. Si
 * `actor.addCapacity` n'est pas disponible (garde AC #4 de la Story 7), bascule en texte seul plutôt que
 * d'échouer silencieusement.
 * @param {Actor} actor
 * @param {import("../../../src/importers/cof2/parsing/encounterDraft.mjs").CapacityDraft} cap
 * @param {object} doc
 * @param {string[]} textOnly
 * @param {string[]} warnings
 * @returns {Promise<"attached"|"text-fallback">}
 */
async function addResolvedCapacity(actor, cap, doc, textOnly, warnings) {
  const added = await addCapacityToActor(actor, doc);
  if (added.ok) return "attached";
  textOnly.push(buildCapacityItemData(cap));
  warnings.push(`« ${cap.name} » : addCapacity indisponible sur cet acteur, créée en texte.`);
  return "text-fallback";
}

/**
 * Traite une capacité `TEMPLATE_VARIANT` : si le paramètre détecté est une difficulté différente de celle du
 * modèle et que l'utilisateur l'a confirmée (§8, écran de comparaison du wizard), clone le modèle en une variante
 * indépendante avec la difficulté surchargée (jamais une écriture sur le document du compendium officiel). Sinon,
 * repli sur le comportement historique : réutilisation du modèle tel quel via `addCapacityToActor`, avec
 * avertissement (et diagnostic `CAPACITY_PARAMETER_MISMATCH` si le paramètre source n'est pas reconnu).
 * @param {Actor} actor
 * @param {import("../../../src/importers/cof2/parsing/encounterDraft.mjs").CapacityDraft} cap
 * @param {object} resolution `{status:"TEMPLATE_VARIANT", entry:object}` renvoyé par le resolver (#5)
 * @param {ReturnType<typeof buildCapacityResolver>} resolver
 * @param {Set<string>} confirmedVariants Noms (`rawName`) de capacités dont la surcharge a été confirmée
 * @param {object[]} textOnly
 * @param {object[]} variantItems
 * @param {string[]} warnings
 * @returns {Promise<"variant-created"|"reused"|"text-fallback">}
 */
async function addTemplateVariantCapacity(actor, cap, resolution, resolver, confirmedVariants, textOnly, variantItems, warnings) {
  const comparison = compareTemplateVariant(cap.rawName, resolution.entry.name);

  if (comparison.status === "OVERRIDABLE" && confirmedVariants.has(cap.rawName)) {
    const templateDoc = await resolver.pack.getDocument(resolution.entry._id);
    const overriddenSystem = buildDifficultyOverride(templateDoc.toObject().system, comparison.from, comparison.to);
    variantItems.push(buildCapacityVariantItemData(templateDoc, overriddenSystem));
    warnings.push(`« ${cap.name} » : variante de « ${resolution.entry.name} » créée avec difficulté ${comparison.to} (au lieu de ${comparison.from}).`);
    return "variant-created";
  }

  if (comparison.status === "UNRECOGNIZED") warnings.push(capacityParameterMismatch(cap.rawName).message);

  const doc = await resolver.pack.getDocument(resolution.entry._id);
  const outcome = await addResolvedCapacity(actor, cap, doc, textOnly, warnings);
  if (outcome === "text-fallback") return "text-fallback";
  warnings.push(`« ${cap.name} » : variante de « ${resolution.entry.name} » du compendium, vérifier le paramètre.`);
  return "reused";
}

/**
 * Crée l'acteur `encounter` et ses items.
 * @param {import("../../../src/importers/cof2/parsing/encounterDraft.mjs").EncounterDraft} parsed
 * @param {{confirmedVariants?:Set<string>}} [options] `confirmedVariants` : noms (`rawName`) de capacités
 *   `TEMPLATE_VARIANT` dont la surcharge de difficulté a été validée par l'utilisateur (écran de comparaison du
 *   wizard, §8). Par défaut vide : aucune surcharge automatique, comportement historique inchangé.
 * @returns {Promise<{actor:(Actor|null), report:import("./encounterFactory.mjs").ImportReport}>} `actor` est
 *   `null` quand le rollback automatique a réussi ; non-`null` mais incomplet quand le rollback a lui-même échoué
 *   (`report.diagnostics` contient alors `IMPORT_ROLLBACK_FAILED`, l'UI doit proposer sa suppression manuelle).
 */
async function createEncounter(parsed, { confirmedVariants = new Set() } = {}) {
  const warnings = parsed.diagnostics.filter((d) => d.severity !== "error").map((d) => d.message);
  const diagnostics = [...parsed.diagnostics];
  const counts = { attacksCreated: 0, capacitiesReused: 0, capacitiesCreated: 0, errors: 0, toReview: 0 };
  const rollbackActions = [];
  let actor = null;
  let currentFragment = parsed.name || "acteur";

  let actorRollback = null;

  try {
    actor = await createEncounterActor(parsed);
    actorRollback = () => actor.delete();
    rollbackActions.push(actorRollback);
    debugLog("ACTOR_CREATED", actor.name ?? parsed.name);

    // Attaques : créées d'un bloc, puis on recâble la `source` de leurs actions sur l'UUID définitif
    if (parsed.attacks.length) {
      currentFragment = parsed.attacks.map((a) => a.name).join(", ");
      const created = await actor.createEmbeddedDocuments("Item", parsed.attacks.map(buildAttackItemData));
      counts.attacksCreated = created.length;
      await actor.updateEmbeddedDocuments(
        "Item",
        created.map((item) => ({ _id: item.id, "system.actions": item.toObject().system.actions.map((a) => ({ ...a, source: item.uuid })) }))
      );
      debugLog("ATTACKS_CREATED", currentFragment);
    }

    // Capacités : officiel (priorités 1-2) puis bibliothèque d'import (priorité 3), sinon texte seul
    const resolver = await buildCapacityResolver();
    if (!resolver && parsed.capacities.length) warnings.push(`Compendium ${PACK_ID} introuvable : capacités créées en texte seul.`);
    const textOnly = [];
    const variantItems = [];
    for (const cap of parsed.capacities) {
      currentFragment = cap.name;
      const resolution = resolver?.resolve(cap.name) ?? { status: "NOT_FOUND" };

      if (resolution.status === "EXACT_REUSE") {
        const doc = await resolver.pack.getDocument(resolution.entry._id);
        const outcome = await addResolvedCapacity(actor, cap, doc, textOnly, warnings);
        if (outcome === "attached") counts.capacitiesReused++;
        else {
          counts.capacitiesCreated++;
          counts.toReview++;
        }
        continue;
      }

      if (resolution.status === "TEMPLATE_VARIANT") {
        const outcome = await addTemplateVariantCapacity(actor, cap, resolution, resolver, confirmedVariants, textOnly, variantItems, warnings);
        if (outcome === "variant-created") {
          counts.capacitiesCreated++;
        } else if (outcome === "text-fallback") {
          counts.capacitiesCreated++;
          counts.toReview++;
        } else {
          // "reused" : modèle officiel réutilisé tel quel, sans confirmation de surcharge — à vérifier.
          counts.capacitiesReused++;
          counts.toReview++;
        }
        continue;
      }

      if (resolution.status === "AMBIGUOUS") {
        warnings.push(`« ${cap.name} » : plusieurs capacités du compendium correspondent (${resolution.candidates.join(", ")}), créée en texte.`);
        textOnly.push(buildCapacityItemData(cap));
        counts.capacitiesCreated++;
        counts.toReview++;
        continue;
      }

      // Priorité 3 — bibliothèque d'import du monde (jamais le pack officiel `cof2-base`)
      const { doc, reused, variant } = await resolveViaImportLibrary(cap, rollbackActions);
      const outcome = await addResolvedCapacity(actor, cap, doc, textOnly, warnings);
      if (outcome === "text-fallback") {
        counts.capacitiesCreated++;
        counts.toReview++;
        continue;
      }
      const plan = planCapacityResolution({ resolverStatus: "NOT_FOUND", libraryOutcome: { reused, variant } });
      if (plan.status === "REUSE_IMPORTED") {
        warnings.push(`« ${cap.name} » : réutilise la capacité déjà importée « ${doc.name} ».`);
        counts.capacitiesReused++;
      } else if (plan.status === "MANUAL_REVIEW") {
        warnings.push(`« ${cap.name} » : nom déjà importé avec un contenu différent, variante créée à examiner.`);
        counts.capacitiesCreated++;
        counts.toReview++;
      } else {
        warnings.push(`« ${cap.name} » : absente du compendium et de la bibliothèque d'import, nouvelle entrée créée.`);
        counts.capacitiesCreated++;
      }
    }
    if (textOnly.length || variantItems.length) {
      currentFragment = "capacités (texte/variantes)";
      await actor.createEmbeddedDocuments("Item", [...textOnly, ...variantItems]);
      debugLog("CAPACITIES_ATTACHED", currentFragment);
    }
  } catch (err) {
    console.error(err);
    const writeFailure = importWriteFailed(currentFragment, err.message);
    diagnostics.push(writeFailure);
    counts.errors++;
    debugLog(writeFailure.code, currentFragment, err.message);

    let actorDeleted = false;
    for (const rollback of rollbackActions.reverse()) {
      try {
        await rollback();
        if (rollback === actorRollback) actorDeleted = true;
      } catch (rollbackErr) {
        console.error(rollbackErr);
        const rollbackFailure = importRollbackFailed(currentFragment, rollbackErr.message);
        diagnostics.push(rollbackFailure);
        counts.errors++;
        debugLog(rollbackFailure.code, currentFragment, rollbackErr.message);
      }
    }
    return { actor: actorDeleted ? null : actor, report: { counts, warnings, diagnostics } };
  }

  return { actor, report: { counts, warnings, diagnostics } };
}

export { PACK_ID, DEBUG_LOGGING_SETTING, buildCapacityResolver, createEncounter };

/**
 * Création Foundry d'une rencontre COF2 depuis un `EncounterDraft` (parsing pur, voir `src/importers/cof2/`).
 *
 * Orchestrateur : délègue la construction des documents à `actorFactory.mjs`/`itemFactory.mjs`, l'isolation de
 * l'API COF2 à `cof2Adapter.mjs`, la résolution multi-sources au resolver (`capacityResolver.mjs`, #5) et à la
 * bibliothèque d'import (`importLibrary.mjs`, #6), et la traduction en statut `ImportPlan` (§19 de l'Epic) à
 * `capacityPlan.mjs`. Seul point d'écriture Foundry du pipeline d'import COF2, partagé par la commande de debug
 * (`cof2Debug.mjs`) et le wizard d'import (`cof2ImportWizard.mjs`).
 */

import { makeCapacityResolver, computeContentHash } from "../../../src/importers/cof2/index.mjs";
import { planCapacityResolution } from "../../../src/importers/cof2/planning/capacityPlan.mjs";
import { ensureImportLibraryPack, findByHash, saveImportedCapacity } from "./importLibrary.mjs";
import { createEncounterActor } from "./actorFactory.mjs";
import { buildAttackItemData, buildCapacityItemData } from "./itemFactory.mjs";
import { addCapacityToActor } from "./cof2Adapter.mjs";

const PACK_ID = "cof2-base.cof-2-base-items";
const CAPACITY_FOLDERS = ["Capacités des rencontres", "Capacité de base"];
const IMPORT_SOURCE_TYPE = "pdf-text";

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
 * @returns {Promise<{doc:object, reused:boolean, variant:boolean}>}
 */
async function resolveViaImportLibrary(cap) {
  const pack = await ensureImportLibraryPack("capacity");
  const hash = computeContentHash({ type: "capacity", name: cap.name, description: cap.description, actionType: cap.actionType, frequency: cap.frequency, parameters: cap.parameters });

  const byHash = await findByHash(pack, hash);
  if (byHash) return { doc: byHash, reused: true, variant: false };

  const index = await pack.getIndex();
  const nameNormalized = cap.name.trim().toLowerCase();
  const sameName = index.some((e) => e.name.trim().toLowerCase() === nameNormalized);
  const reviewStatus = sameName ? "review-required" : "generated";
  const doc = await saveImportedCapacity(pack, cap, { hash, sourceType: IMPORT_SOURCE_TYPE, reviewStatus });
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
 * @returns {Promise<boolean>} true si la capacité a bien été ajoutée à l'acteur
 */
async function addResolvedCapacity(actor, cap, doc, textOnly, warnings) {
  const added = await addCapacityToActor(actor, doc);
  if (added.ok) return true;
  textOnly.push(buildCapacityItemData(cap));
  warnings.push(`« ${cap.name} » : addCapacity indisponible sur cet acteur, créée en texte.`);
  return false;
}

/**
 * Crée l'acteur `encounter` et ses items.
 * @param {import("../../../src/importers/cof2/parsing/encounterDraft.mjs").EncounterDraft} parsed
 * @returns {Promise<{actor:Actor, warnings:string[]}>}
 */
async function createEncounter(parsed) {
  const warnings = parsed.diagnostics.filter((d) => d.severity !== "error").map((d) => d.message);
  const actor = await createEncounterActor(parsed);

  // Attaques : créées d'un bloc, puis on recâble la `source` de leurs actions sur l'UUID définitif
  if (parsed.attacks.length) {
    const created = await actor.createEmbeddedDocuments("Item", parsed.attacks.map(buildAttackItemData));
    await actor.updateEmbeddedDocuments(
      "Item",
      created.map((item) => ({ _id: item.id, "system.actions": item.toObject().system.actions.map((a) => ({ ...a, source: item.uuid })) }))
    );
  }

  // Capacités : officiel (priorités 1-2) puis bibliothèque d'import (priorité 3), sinon texte seul
  const resolver = await buildCapacityResolver();
  if (!resolver && parsed.capacities.length) warnings.push(`Compendium ${PACK_ID} introuvable : capacités créées en texte seul.`);
  const textOnly = [];
  for (const cap of parsed.capacities) {
    const resolution = resolver?.resolve(cap.name) ?? { status: "NOT_FOUND" };

    if (resolution.status === "EXACT_REUSE" || resolution.status === "TEMPLATE_VARIANT") {
      const doc = await resolver.pack.getDocument(resolution.entry._id);
      if (!(await addResolvedCapacity(actor, cap, doc, textOnly, warnings))) continue;
      const plan = planCapacityResolution({ resolverStatus: resolution.status });
      if (plan.status === "CREATE_FROM_TEMPLATE") warnings.push(`« ${cap.name} » : variante de « ${resolution.entry.name} » du compendium, vérifier le paramètre.`);
      continue;
    }

    if (resolution.status === "AMBIGUOUS") {
      warnings.push(`« ${cap.name} » : plusieurs capacités du compendium correspondent (${resolution.candidates.join(", ")}), créée en texte.`);
      textOnly.push(buildCapacityItemData(cap));
      continue;
    }

    // Priorité 3 — bibliothèque d'import du monde (jamais le pack officiel `cof2-base`)
    const { doc, reused, variant } = await resolveViaImportLibrary(cap);
    if (!(await addResolvedCapacity(actor, cap, doc, textOnly, warnings))) continue;
    const plan = planCapacityResolution({ resolverStatus: "NOT_FOUND", libraryOutcome: { reused, variant } });
    if (plan.status === "REUSE_IMPORTED") warnings.push(`« ${cap.name} » : réutilise la capacité déjà importée « ${doc.name} ».`);
    else if (plan.status === "MANUAL_REVIEW") warnings.push(`« ${cap.name} » : nom déjà importé avec un contenu différent, variante créée à examiner.`);
    else warnings.push(`« ${cap.name} » : absente du compendium et de la bibliothèque d'import, nouvelle entrée créée.`);
  }
  if (textOnly.length) await actor.createEmbeddedDocuments("Item", textOnly);

  return { actor, warnings };
}

export { PACK_ID, buildCapacityResolver, createEncounter };

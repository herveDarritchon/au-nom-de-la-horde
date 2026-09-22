/**
 * Création Foundry d'une rencontre COF2 depuis un `EncounterDraft` (parsing pur, voir `src/importers/cof2/`).
 *
 * Toute l'API Foundry (`game`, `Actor`, `Item`) vit ici ; ce module est le seul point d'écriture du pipeline
 * d'import COF2, partagé par la commande de debug (`cof2Debug.mjs`) et le wizard d'import (`cof2ImportWizard.mjs`).
 */

import { makeCapacityResolver, computeContentHash } from "../../../src/importers/cof2/index.mjs";
import { ensureImportLibraryPack, findByHash, saveImportedCapacity } from "./importLibrary.mjs";

const PACK_ID = "cof2-base.cof-2-base-items";
const CAPACITY_FOLDERS = ["Capacités des rencontres", "Capacité de base"];
const ABILITIES = ["for", "agi", "con", "per", "cha", "int", "vol"];
const IMPORT_SOURCE_TYPE = "pdf-text";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraph = (s) => (s ? `<p>${esc(s)}</p>` : "");

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

function buildAttackData(atk) {
  const actionType = { melee: "melee", ranged: "ranged", magical: "magical" }[atk.kind];
  return {
    name: atk.name,
    type: "attack",
    img: "icons/svg/sword.svg",
    system: {
      description: paragraph(atk.extra),
      subtype: atk.kind,
      learned: true,
      properties: { spell: false, reloadable: false },
      range: atk.range ? { value: atk.range, unit: "m" } : { value: null, unit: "" },
      actions: [
        {
          indice: 0,
          label: "",
          chatFlavor: "",
          type: actionType,
          img: "icons/svg/d20-highlight.svg",
          properties: { activable: true, enabled: false, temporary: false, visible: false },
          conditions: [{ predicate: "isOwned" }],
          resolvers: [
            {
              type: "attack",
              skill: { formula: atk.bonus, crit: "20", difficulty: "@cible.def" },
              dmg: { formula: atk.damage },
              target: { type: "none", number: 0, scope: "all" },
            },
          ],
          modifiers: [],
        },
      ],
    },
  };
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
 * Crée l'acteur `encounter` et ses items.
 * @param {import("../../../src/importers/cof2/parsing/encounterDraft.mjs").EncounterDraft} parsed
 * @returns {Promise<{actor:Actor, warnings:string[]}>}
 */
async function createEncounter(parsed) {
  const warnings = parsed.diagnostics.filter((d) => d.severity !== "error").map((d) => d.message);
  const actor = await Actor.create({
    name: parsed.name,
    type: "encounter",
    system: {
      abilities: Object.fromEntries(ABILITIES.map((a) => [a, parsed.abilities[a]])),
      attributes: { nc: parsed.nc, hp: { base: parsed.hp, value: parsed.hp } },
      combat: { def: { base: parsed.defense }, init: { base: parsed.initiative }, dr: { base: parsed.damageReduction } },
      details: { category: parsed.category, size: parsed.size, notes: { public: parsed.notes.map(paragraph).join("") } },
    },
    prototypeToken: { disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE },
  });

  // Attaques : créées d'un bloc, puis on recâble la `source` de leurs actions sur l'UUID définitif
  if (parsed.attacks.length) {
    const created = await actor.createEmbeddedDocuments("Item", parsed.attacks.map(buildAttackData));
    await actor.updateEmbeddedDocuments(
      "Item",
      created.map((item) => ({ _id: item.id, "system.actions": item.toObject().system.actions.map((a) => ({ ...a, source: item.uuid })) }))
    );
  }

  // Capacités : celles du compendium via addCapacity (recâble sources/modifiers), les autres en texte
  const resolver = await buildCapacityResolver();
  if (!resolver && parsed.capacities.length) warnings.push(`Compendium ${PACK_ID} introuvable : capacités créées en texte seul.`);
  const textOnly = [];
  for (const cap of parsed.capacities) {
    const resolution = resolver?.resolve(cap.name) ?? { status: "NOT_FOUND" };
    if (resolution.status === "EXACT_REUSE" || resolution.status === "TEMPLATE_VARIANT") {
      const doc = await resolver.pack.getDocument(resolution.entry._id);
      await actor.addCapacity(doc, null);
      if (resolution.status === "TEMPLATE_VARIANT") warnings.push(`« ${cap.name} » : variante de « ${resolution.entry.name} » du compendium, vérifier le paramètre.`);
    } else if (resolution.status === "AMBIGUOUS") {
      warnings.push(`« ${cap.name} » : plusieurs capacités du compendium correspondent (${resolution.candidates.join(", ")}), créée en texte.`);
      textOnly.push({ name: cap.name, type: "capacity", system: { description: paragraph(cap.description), learned: true, path: null } });
    } else {
      // Priorité 3 — bibliothèque d'import du monde (jamais le pack officiel `cof2-base`)
      const { doc, reused, variant } = await resolveViaImportLibrary(cap);
      await actor.addCapacity(doc, null);
      if (reused) warnings.push(`« ${cap.name} » : réutilise la capacité déjà importée « ${doc.name} ».`);
      else if (variant) warnings.push(`« ${cap.name} » : nom déjà importé avec un contenu différent, variante créée à examiner.`);
      else warnings.push(`« ${cap.name} » : absente du compendium et de la bibliothèque d'import, nouvelle entrée créée.`);
    }
  }
  if (textOnly.length) await actor.createEmbeddedDocuments("Item", textOnly);

  return { actor, warnings };
}

export { PACK_ID, buildCapacityResolver, buildAttackData, createEncounter };

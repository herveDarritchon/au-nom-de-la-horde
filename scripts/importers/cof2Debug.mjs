/**
 * Commande de debug — création d'une rencontre COF2 depuis un statblock collé.
 *
 * Reproduit exactement le comportement de la macro world d'origine (même prompt, même acteur `encounter`,
 * mêmes warnings/errors) mais délègue le parsing pur à `src/importers/cof2/`. Toute l'API Foundry
 * (`game`, `Actor`, `Item`, `DialogV2`) reste ici ; aucune API Foundry ne fuit dans les modules de parsing.
 */

import { parseStatblock } from "../../src/importers/cof2/index.mjs";
import { makeCapacityMatcher } from "../../src/importers/cof2/index.mjs";

const PACK_ID = "cof2-base.cof-2-base-items";
const CAPACITY_FOLDERS = ["Capacités des rencontres", "Capacité de base"];
const ABILITIES = ["for", "agi", "con", "per", "cha", "int", "vol"];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraph = (s) => (s ? `<p>${esc(s)}</p>` : "");

/**
 * Charge les capacités de créatures du compendium (dossiers « Capacités des rencontres » et « Capacité de base » uniquement :
 * ce sont les seuls que le bestiaire utilise, les capacités de voies de PJ n'ont rien à faire sur un monstre).
 * @returns {Promise<{pack:object, match:ReturnType<typeof makeCapacityMatcher>}|null>} null si le compendium est absent
 */
async function buildCapacityResolver() {
  const pack = game.packs.get(PACK_ID);
  if (!pack) return null;
  const index = await pack.getIndex({ fields: ["folder"] });
  const folderIds = new Set(pack.folders.filter((f) => CAPACITY_FOLDERS.includes(f.name)).map((f) => f.id));
  const priority = pack.folders.find((f) => f.name === CAPACITY_FOLDERS[0])?.id;
  const entries = index.filter((e) => e.type === "capacity" && folderIds.has(e.folder));
  return { pack, match: makeCapacityMatcher(entries, priority) };
}

function buildAttackData(atk) {
  const actionType = { melee: "melee", ranged: "ranged", magic: "magical" }[atk.kind];
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
 * Crée l'acteur `encounter` et ses items.
 * @param {ReturnType<typeof parseStatblock>} parsed
 * @returns {Promise<{actor:Actor, warnings:string[]}>}
 */
async function createEncounter(parsed) {
  const warnings = [...parsed.warnings];
  const actor = await Actor.create({
    name: parsed.name,
    type: "encounter",
    system: {
      abilities: Object.fromEntries(ABILITIES.map((a) => [a, parsed.abilities[a]])),
      attributes: { nc: parsed.nc, hp: { base: parsed.hp, value: parsed.hp } },
      combat: { def: { base: parsed.def }, init: { base: parsed.init }, dr: { base: parsed.dr } },
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
    const hit = resolver?.match(cap.name);
    if (hit?.entry) {
      const doc = await resolver.pack.getDocument(hit.entry._id);
      await actor.addCapacity(doc, null);
      if (hit.approximate) warnings.push(`« ${cap.name} » : reprise de « ${hit.entry.name} » du compendium, vérifier le paramètre.`);
    } else {
      if (hit?.ambiguous) warnings.push(`« ${cap.name} » : plusieurs capacités du compendium correspondent (${hit.ambiguous.join(", ")}), créée en texte.`);
      else if (resolver) warnings.push(`« ${cap.name} » : absente du compendium, créée en texte.`);
      textOnly.push({ name: cap.name, type: "capacity", system: { description: paragraph(cap.text), learned: true, path: null } });
    }
  }
  if (textOnly.length) await actor.createEmbeddedDocuments("Item", textOnly);

  return { actor, warnings };
}

async function importStatblockFromPrompt() {
  const { DialogV2 } = foundry.applications.api;
  if (!Actor.canUserCreate(game.user)) return ui.notifications.error("Vous n'avez pas la permission de créer des acteurs.");

  const text = await DialogV2.prompt({
    window: { title: "Créer une rencontre depuis un statblock", icon: "fa-solid fa-dragon" },
    position: { width: 640 },
    content: `<div class="form-group stacked">
      <label>Collez un statblock du Bestiaire COF2</label>
      <textarea name="statblock" rows="18" style="width:100%;font-family:monospace" autofocus></textarea>
    </div>`,
    ok: { label: "Créer", icon: "fa-solid fa-check", callback: (event, button) => button.form.elements.statblock.value },
    rejectClose: false,
  });
  if (!text?.trim()) return;

  const parsed = parseStatblock(text);
  if (parsed.errors.length) {
    return DialogV2.prompt({
      window: { title: "Statblock illisible", icon: "fa-solid fa-triangle-exclamation" },
      content: `<p>Rien n'a été créé :</p><ul>${parsed.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`,
      ok: { label: "Fermer" },
      rejectClose: false,
    });
  }

  try {
    const { actor, warnings } = await createEncounter(parsed);
    ui.notifications.info(`Rencontre « ${actor.name} » créée.`);
    actor.sheet.render(true);
    if (warnings.length) {
      console.warn("Statblock | avertissements", warnings);
      await DialogV2.prompt({
        window: { title: `${actor.name} : à vérifier`, icon: "fa-solid fa-triangle-exclamation" },
        content: `<ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`,
        ok: { label: "Fermer" },
        rejectClose: false,
      });
    }
  } catch (err) {
    console.error(err);
    ui.notifications.error(`Création impossible : ${err.message}`);
  }
}

const MODULE_ID = "warbound-campaign-content";

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { ...module.api, cof2: { importStatblockFromPrompt, parseStatblock, createEncounter } };
});

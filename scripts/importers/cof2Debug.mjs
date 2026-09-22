/**
 * Commande de debug — création d'une rencontre COF2 depuis un statblock collé.
 *
 * Reproduit exactement le comportement de la macro world d'origine (même prompt, même acteur `encounter`,
 * mêmes warnings/errors) mais délègue le parsing pur à `src/importers/cof2/` et la création Foundry à
 * `cof2/encounterFactory.mjs`. Toute l'API Foundry (`game`, `Actor`, `Item`, `DialogV2`) reste dans ces deux
 * fichiers ; aucune API Foundry ne fuit dans les modules de parsing.
 */

import { parseStatblock } from "../../src/importers/cof2/index.mjs";
import { createEncounter } from "./cof2/encounterFactory.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
  const blockingErrors = parsed.diagnostics.filter((d) => d.severity === "error");
  if (blockingErrors.length) {
    return DialogV2.prompt({
      window: { title: "Statblock illisible", icon: "fa-solid fa-triangle-exclamation" },
      content: `<p>Rien n'a été créé :</p><ul>${blockingErrors.map((e) => `<li>${esc(e.message)}</li>`).join("")}</ul>`,
      ok: { label: "Fermer" },
      rejectClose: false,
    });
  }

  try {
    const { actor, report } = await createEncounter(parsed);
    if (!actor) {
      const writeFailure = report.diagnostics.find((d) => d.code === "IMPORT_WRITE_FAILED");
      ui.notifications.error(`Création impossible : ${writeFailure?.message ?? "import interrompu."} Aucun document résiduel.`);
      return;
    }
    ui.notifications.info(`Rencontre « ${actor.name} » créée.`);
    actor.sheet.render(true);
    const { counts, warnings } = report;
    if (warnings.length || counts.errors) {
      console.warn("Statblock | avertissements", warnings, "compteurs", counts);
      const rollbackFailed = report.diagnostics.some((d) => d.code === "IMPORT_ROLLBACK_FAILED");
      await DialogV2.prompt({
        window: { title: `${actor.name} : à vérifier`, icon: "fa-solid fa-triangle-exclamation" },
        content: `<p>${counts.attacksCreated} attaque(s) créée(s), ${counts.capacitiesReused} capacité(s) réutilisée(s),
          ${counts.capacitiesCreated} capacité(s) créée(s), ${counts.errors} erreur(s), ${counts.toReview} élément(s) à vérifier.</p>
          ${rollbackFailed ? "<p><strong>Le rollback automatique a échoué : l'acteur est incomplet, envisager sa suppression manuelle.</strong></p>" : ""}
          <ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`,
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

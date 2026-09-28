/**
 * Wizard d'import COF2 — Application Foundry v14 en 4 étapes (Source → Prévisualisation → Options → Résultat).
 *
 * Aucun `Actor`/`Item` n'est créé avant le clic sur « Créer » (étape Options → Résultat) : les étapes Source et
 * Prévisualisation n'appellent que `parseStatblock` (pur) et une lecture d'index de compendium
 * (`buildCapacityResolver`, non destructive). Toute l'écriture Foundry est déléguée à `cof2/encounterFactory.mjs`.
 */

import { parseStatblock, compareTemplateVariant, resolveAttackKind } from "../../src/importers/cof2/index.mjs";
import { buildCapacityResolver, buildAttackTypeResolver, createEncounter } from "./cof2/encounterFactory.mjs";
import { TEMPLATE_ROOT } from "../../src/constants/templates.mjs";

const MODULE_ID = "warbound-campaign-content";

const STEPS = ["source", "preview", "options", "result"];
const STEP_LABELS = { source: "Source", preview: "Prévisualisation", options: "Options", result: "Résultat" };
const SEVERITY_LABELS = { error: "Erreur", warning: "À vérifier", info: "Information" };
const CONFIDENCE_BADGES = { high: "✓", medium: "⚠", low: "✕" };
const CAPACITY_STATUS_BADGES = { EXACT_REUSE: "✓", TEMPLATE_VARIANT: "⚠", REUSE_IMPORTED: "✓", AMBIGUOUS: "⚠", NOT_FOUND: "✕" };
const CAPACITY_STATUS_LABELS = {
  EXACT_REUSE: "Réutilisation exacte",
  TEMPLATE_VARIANT: "Variante d'un modèle connu",
  REUSE_IMPORTED: "Réutilisation d'une capacité déjà importée",
  AMBIGUOUS: "Ambiguë (plusieurs correspondances)",
  NOT_FOUND: "Nouvelle capacité",
};
// Niveaux du résultat d'import (issue #33) : emoji + classe CSS dérivés uniquement de `level`, jamais du texte du message.
const LEVEL_META = {
  ignored: { emoji: "🟡", css: "ignored" },
  success: { emoji: "🟢", css: "success" },
  warning: { emoji: "🔴", css: "warning" },
};

/**
 * Déduit le statut de résolution (section 14 de l'Epic) depuis le résultat de `makeCapacityResolver`.
 * Le compendium officiel `cof2-base` est consulté ici ; les capacités NOT_FOUND seront vérifiées ou créées dans la
 * bibliothèque d'import (Story 6) lors de la création effective (cf. `encounterFactory.mjs`).
 * @param {{status:"EXACT_REUSE"|"TEMPLATE_VARIANT"|"REUSE_IMPORTED"|"AMBIGUOUS"|"NOT_FOUND", ...}|undefined} resolution
 * @returns {"EXACT_REUSE"|"TEMPLATE_VARIANT"|"REUSE_IMPORTED"|"AMBIGUOUS"|"NOT_FOUND"}
 */
function capacityStatus(resolution) {
  return resolution?.status ?? "NOT_FOUND";
}

const { HandlebarsApplicationMixin } = foundry.applications.api;

class Cof2ImportWizardApp extends HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "cof2-import-wizard",
    classes: ["warbound", "cof2-import-wizard"],
    tag: "form",
    window: { title: "Importer une rencontre COF2", icon: "fa-solid fa-dragon", resizable: true },
    position: { width: 760, height: "auto" },
  };

  static PARTS = {
    source:  { template: `${TEMPLATE_ROOT}/apps/cof2-import-wizard/source.hbs` },
    preview: { template: `${TEMPLATE_ROOT}/apps/cof2-import-wizard/preview.hbs` },
    options: { template: `${TEMPLATE_ROOT}/apps/cof2-import-wizard/options.hbs` },
    result:  { template: `${TEMPLATE_ROOT}/apps/cof2-import-wizard/result.hbs` },
  };

  #step = "source";
  #sourceText = "";
  #draft = null;
  #capacityHits = new Map();
  #confirmedVariants = new Set();
  #options = { createActor: true, reuseExisting: true, saveToLibrary: true, openSheet: true };
  #result = null;
  #analyzeError = null;

  async _prepareContext(options) {
    const steps = STEPS.map((step, i) => ({
      id: step,
      label: STEP_LABELS[step],
      index: i + 1,
      active: step === this.#step,
      done: STEPS.indexOf(this.#step) > i,
    }));

    const capacities = this.#draft
      ? this.#draft.capacities.map((cap, i) => {
          const hit = this.#capacityHits.get(i);
          const status = hit?.status ?? "NOT_FOUND";
          return {
            index: i,
            cap,
            status,
            statusBadge: CAPACITY_STATUS_BADGES[status],
            statusLabel: CAPACITY_STATUS_LABELS[status],
            comparison: hit?.comparison ?? null,
            showComparison: hit?.comparison?.status === "OVERRIDABLE",
            confirmed: this.#confirmedVariants.has(cap.rawName),
            confidenceBadge: CONFIDENCE_BADGES[cap.confidence] ?? "",
          };
        })
      : [];

    const attacks = this.#draft
      ? this.#draft.attacks.map((a, i) => ({
          index: i,
          attack: a,
          confidenceBadge: CONFIDENCE_BADGES[a.confidence] ?? "",
        }))
      : [];

    const diagnostics = this.#draft
      ? (() => {
          const bySeverity = { error: [], warning: [], info: [] };
          for (const d of this.#draft.diagnostics) bySeverity[d.severity]?.push(d);
          return ["error", "warning", "info"]
            .filter((s) => bySeverity[s].length)
            .map((s) => ({ severity: s, label: SEVERITY_LABELS[s], items: bySeverity[s] }));
        })()
      : [];

    const abilities = this.#draft
      ? ["for", "agi", "con", "per", "cha", "int", "vol"].map((key) => ({
          key,
          label: key.toUpperCase(),
          base: this.#draft.abilities[key]?.base ?? 0,
          superior: this.#draft.abilities[key]?.superior ?? false,
        }))
      : [];

    // Bloque le passage à Options tant qu'une variante OVERRIDABLE n'est pas confirmée (AC #3, issue #8).
    const hasUnconfirmedVariant = this.#draft
      ? this.#draft.capacities.some(
          (c, i) =>
            this.#capacityHits.get(i)?.comparison?.status === "OVERRIDABLE" &&
            !this.#confirmedVariants.has(c.rawName)
        )
      : false;

    const result = this.#result
      ? (() => {
          const { actor, report, error } = this.#result;
          if (error) return { loading: false, error };
          if (!actor) {
            const writeFailure = report?.diagnostics?.find((d) => d.code === "IMPORT_WRITE_FAILED");
            return { loading: false, noActor: true, writeFailureMessage: writeFailure?.message ?? "import interrompu." };
          }
          const { counts, messages } = report;
          const rollbackFailed = report.diagnostics.some((d) => d.code === "IMPORT_ROLLBACK_FAILED");
          return {
            loading: false,
            actor,
            counts,
            messages: messages.map((m) => ({ ...m, emoji: LEVEL_META[m.level]?.emoji ?? "", css: LEVEL_META[m.level]?.css ?? "" })),
            incomplete: counts.errors > 0,
            rollbackFailed,
          };
        })()
      : { loading: true };

    return {
      step: this.#step,
      steps,
      sourceText: this.#sourceText,
      analyzeError: this.#analyzeError,
      draft: this.#draft,
      abilities,
      attacks,
      capacities,
      diagnostics,
      hasUnconfirmedVariant,
      options: this.#options,
      result,
    };
  }

  async _preparePartContext(partId, context) {
    return { ...context, isActive: partId === this.#step };
  }

  async _onRender(context, options) {
    this.#activateListeners(this.element);
  }

  #setField(path, value) {
    const parts = path.split(".");
    let obj = this.#draft;
    if (parts[0] === "opt") obj = this.#options;
    const target = parts[0] === "opt" ? parts.slice(1) : parts;
    for (let i = 0; i < target.length - 1; i++) obj = obj[target[i]];
    const key = target.at(-1);
    if (typeof obj[key] === "number") obj[key] = value === "" ? null : Number(value);
    else if (typeof obj[key] === "boolean") obj[key] = value === true || value === "true";
    else obj[key] = value;
  }

  #activateListeners(content) {
    content.querySelectorAll("[data-field]").forEach((el) => {
      const evt = el.type === "checkbox" || el.type === "radio" ? "change" : "input";
      el.addEventListener(evt, () => {
        const value = el.type === "checkbox" ? el.checked : el.value;
        this.#setField(el.dataset.field, value);
      });
    });
    content.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (ev) => this.#onAction(ev, el.dataset.action));
    });
    content.querySelectorAll("[data-variant-confirm]").forEach((el) => {
      el.addEventListener("change", () => {
        const rawName = el.dataset.variantConfirm;
        if (el.checked) this.#confirmedVariants.add(rawName);
        else this.#confirmedVariants.delete(rawName);
        this.render();
      });
    });
  }

  async #onAction(event, action) {
    switch (action) {
      case "clear":
        this.#sourceText = "";
        this.#analyzeError = null;
        return this.render();
      case "analyze":
        return this.#analyze();
      case "back":
        this.#step = STEPS[Math.max(0, STEPS.indexOf(this.#step) - 1)];
        return this.render();
      case "to-options":
        this.#step = "options";
        return this.render();
      case "create":
        return this.#create();
      case "open-actor":
        this.#result?.actor?.sheet?.render(true);
        return;
      case "delete-incomplete-actor":
        return this.#deleteIncompleteActor();
    }
  }

  /**
   * Supprime manuellement l'acteur incomplet renvoyé quand le rollback automatique a lui-même échoué (§20 de
   * l'Epic, Story 10, AC « proposer de supprimer l'acteur incomplet »).
   */
  async #deleteIncompleteActor() {
    const actor = this.#result?.actor;
    if (!actor) return;
    try {
      await actor.delete();
      this.#result = { ...this.#result, actor: null };
      ui.notifications.info("Acteur incomplet supprimé.");
    } catch (err) {
      console.error(err);
      ui.notifications.error(`Suppression impossible : ${err.message}`);
    }
    return this.render();
  }

  async #analyze() {
    const textarea = this.element.querySelector('textarea[name="statblock"]');
    this.#sourceText = textarea?.value ?? this.#sourceText;
    this.#analyzeError = null;
    if (!this.#sourceText.trim()) {
      this.#analyzeError = "Collez un statblock avant d'analyser.";
      return this.render();
    }
    const draft = parseStatblock(this.#sourceText);
    const blocking = draft.diagnostics.filter((d) => d.severity === "error");
    if (blocking.length === draft.diagnostics.length && !draft.name) {
      this.#analyzeError = blocking.map((d) => d.message).join(" ");
      return this.render();
    }
    this.#draft = draft;
    this.#capacityHits = new Map();
    this.#confirmedVariants = new Set();
    const attackTypeResolver = await buildAttackTypeResolver();
    draft.attacks.forEach((atk) => {
      atk.kind = resolveAttackKind(atk, attackTypeResolver?.resolve);
    });
    const resolver = await buildCapacityResolver();
    draft.capacities.forEach((cap, i) => {
      const resolution = resolver?.resolve(cap.name);
      const status = capacityStatus(resolution);
      const comparison = status === "TEMPLATE_VARIANT" ? compareTemplateVariant(cap.rawName, resolution.entry.name) : null;
      this.#capacityHits.set(i, { hit: resolution, status, comparison });
    });
    this.#step = "preview";
    return this.render();
  }

  async #create() {
    this.#step = "result";
    this.#result = null;
    await this.render();
    if (!this.#options.createActor) {
      this.#result = { error: "L'option « Créer l'acteur Rencontre » est désactivée : rien à créer." };
      return this.render();
    }
    try {
      const { actor, report } = await createEncounter(this.#draft, { confirmedVariants: this.#confirmedVariants, saveToLibrary: this.#options.saveToLibrary, reuseExisting: this.#options.reuseExisting });
      this.#result = { actor, report };
      if (!actor) {
        ui.notifications.error("Création impossible : import annulé, aucun document résiduel.");
      } else if (report.counts.errors > 0) {
        ui.notifications.warn(`Rencontre « ${actor.name} » créée en partie : import interrompu, rollback incomplet.`);
      } else {
        if (this.#options.openSheet) actor.sheet.render(true);
        ui.notifications.info(`Rencontre « ${actor.name} » créée.`);
      }
    } catch (err) {
      console.error(err);
      this.#result = { error: err.message };
    }
    return this.render();
  }
}

/**
 * Ouvre (ou révèle) l'instance unique du wizard d'import COF2.
 * @returns {Cof2ImportWizardApp}
 */
function openCof2ImportWizard() {
  const app = new Cof2ImportWizardApp();
  app.render(true);
  return app;
}

Hooks.once("init", () => {
  loadTemplates([`${TEMPLATE_ROOT}/partials/cof2-wizard-stepper.hbs`]);
});

Hooks.once("ready", () => {
  game.settings?.register?.(MODULE_ID, "cof2ImportDebugLogging", {
    name: "Import COF2 : logs de debug détaillés",
    hint: "Émet dans la console un log structuré (code diagnostic + fragment) à chaque étape d'écriture d'un import COF2.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings?.registerMenu?.(MODULE_ID, "cof2ImportWizard", {
    name: "Importer une rencontre COF2",
    label: "Ouvrir l'importateur",
    hint: "Colle un statblock COF2, prévisualise-le, puis crée la rencontre correspondante.",
    icon: "fa-solid fa-dragon",
    type: Cof2ImportWizardApp,
    restricted: true,
  });

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { ...module.api, cof2: { ...module.api?.cof2, openCof2ImportWizard } };
});

Hooks.on("renderActorDirectory", (app, htmlOrElement) => {
  if (!game.user.isGM || !Actor.canUserCreate(game.user)) return;
  const root = htmlOrElement instanceof HTMLElement ? htmlOrElement : htmlOrElement?.[0];
  if (!root || root.querySelector(".cof2-import-wizard-button")) return;

  const header = root.querySelector(".directory-header .action-buttons, .directory-header");
  if (!header) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "cof2-import-wizard-button";
  // EXCEPTION DOM : bouton FontAwesome injecté programmatiquement — non migrable en HBS sans refonte du point d'injection
  button.innerHTML = '<i class="fa-solid fa-dragon"></i> Importer une rencontre COF2';
  button.addEventListener("click", () => openCof2ImportWizard());
  header.appendChild(button);
});

export { Cof2ImportWizardApp, openCof2ImportWizard };

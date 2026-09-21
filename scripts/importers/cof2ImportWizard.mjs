/**
 * Wizard d'import COF2 — Application Foundry v14 en 4 étapes (Source → Prévisualisation → Options → Résultat).
 *
 * Aucun `Actor`/`Item` n'est créé avant le clic sur « Créer » (étape Options → Résultat) : les étapes Source et
 * Prévisualisation n'appellent que `parseStatblock` (pur) et une lecture d'index de compendium
 * (`buildCapacityResolver`, non destructive). Toute l'écriture Foundry est déléguée à `cof2/encounterFactory.mjs`.
 */

import { parseStatblock } from "../../src/importers/cof2/index.mjs";
import { buildCapacityResolver, createEncounter } from "./cof2/encounterFactory.mjs";

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

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Déduit le statut de résolution (section 14 de l'Epic) depuis le résultat de `makeCapacityResolver`.
 * Le compendium officiel `cof2-base` uniquement est consulté ici : pas de bibliothèque d'import (Story 5/6).
 * @param {{status:"EXACT_REUSE"|"TEMPLATE_VARIANT"|"REUSE_IMPORTED"|"AMBIGUOUS"|"NOT_FOUND", ...}|undefined} resolution
 * @returns {"EXACT_REUSE"|"TEMPLATE_VARIANT"|"REUSE_IMPORTED"|"AMBIGUOUS"|"NOT_FOUND"}
 */
function capacityStatus(resolution) {
  return resolution?.status ?? "NOT_FOUND";
}

class Cof2ImportWizardApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "cof2-import-wizard",
    classes: ["warbound", "cof2-import-wizard"],
    tag: "form",
    window: { title: "Importer une rencontre COF2", icon: "fa-solid fa-dragon", resizable: true },
    position: { width: 760, height: "auto" },
  };

  #step = "source";
  #sourceText = "";
  #draft = null;
  #capacityHits = new Map();
  #options = { createActor: true, reuseExisting: true, openSheet: true };
  #result = null;
  #analyzeError = null;

  async _renderHTML() {
    switch (this.#step) {
      case "source":
        return this.#renderSource();
      case "preview":
        return this.#renderPreview();
      case "options":
        return this.#renderOptions();
      case "result":
        return this.#renderResult();
      default:
        return this.#renderSource();
    }
  }

  async _replaceHTML(result, content) {
    content.innerHTML = result;
    this.#activateListeners(content);
  }

  #renderStepper() {
    const items = STEPS.map((step, i) => {
      const cls = step === this.#step ? "active" : STEPS.indexOf(this.#step) > i ? "done" : "";
      return `<li class="${cls}">${i + 1}. ${STEP_LABELS[step]}</li>`;
    }).join("");
    return `<ol class="cof2-wizard-steps">${items}</ol>`;
  }

  #renderSource() {
    const error = this.#analyzeError
      ? `<div class="cof2-wizard-diagnostics"><p class="cof2-diag cof2-diag-error"><strong>Erreur</strong> ${esc(this.#analyzeError)}</p></div>`
      : "";
    return `
      ${this.#renderStepper()}
      <div class="form-group stacked">
        <label>Collez ici un statblock COF2 provenant du Livre des règles, du Bestiaire ou d'un autre document compatible.</label>
        <textarea name="statblock" rows="16" style="width:100%;font-family:monospace">${esc(this.#sourceText)}</textarea>
      </div>
      ${error}
      <footer class="form-footer">
        <button type="button" data-action="clear"><i class="fa-solid fa-eraser"></i> Effacer</button>
        <button type="button" data-action="analyze" class="default"><i class="fa-solid fa-magnifying-glass"></i> Analyser</button>
      </footer>`;
  }

  #renderAbilities() {
    const rows = ["for", "agi", "con", "per", "cha", "int", "vol"]
      .map((key) => {
        const a = this.#draft.abilities[key] ?? { base: 0, superior: false };
        return `<label class="cof2-ability">${key.toUpperCase()}
          <input type="number" data-field="abilities.${key}.base" value="${a.base}">
          <input type="checkbox" data-field="abilities.${key}.superior" ${a.superior ? "checked" : ""} title="Dé bonus">
        </label>`;
      })
      .join("");
    return `<div class="cof2-abilities">${rows}</div>`;
  }

  #renderAttacksTable() {
    if (!this.#draft.attacks.length) return "<p><em>Aucune attaque reconnue.</em></p>";
    const rows = this.#draft.attacks
      .map(
        (a, i) => `<tr>
          <td>${CONFIDENCE_BADGES[a.confidence] ?? ""}</td>
          <td><input type="text" data-field="attacks.${i}.name" value="${esc(a.name)}"></td>
          <td>${esc(a.kind)}</td>
          <td><input type="text" data-field="attacks.${i}.bonus" value="${esc(a.bonus)}" style="width:4em"></td>
          <td><input type="text" data-field="attacks.${i}.damage" value="${esc(a.damage)}" style="width:6em"></td>
          <td><input type="text" data-field="attacks.${i}.range" value="${a.range ?? ""}" style="width:4em"></td>
          <td><input type="text" data-field="attacks.${i}.extra" value="${esc(a.extra)}"></td>
        </tr>`
      )
      .join("");
    return `<table class="cof2-wizard-table">
      <thead><tr><th>État</th><th>Nom</th><th>Type</th><th>Attaque</th><th>DM</th><th>Portée</th><th>Texte complémentaire</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  #renderCapacitiesTable() {
    if (!this.#draft.capacities.length) return "<p><em>Aucune capacité reconnue.</em></p>";
    const rows = this.#draft.capacities
      .map((c, i) => {
        const status = this.#capacityHits.get(i)?.status ?? "NOT_FOUND";
        return `<tr>
          <td>${CAPACITY_STATUS_BADGES[status]}</td>
          <td><input type="text" data-field="capacities.${i}.name" value="${esc(c.name)}"></td>
          <td title="Compendium officiel cof2-base uniquement (bibliothèque d'import non disponible — Story 6)">${CAPACITY_STATUS_LABELS[status]}</td>
          <td>${esc(c.actionType ?? "")}</td>
          <td>${esc(c.frequency ?? "")}</td>
          <td>${CONFIDENCE_BADGES[c.confidence] ?? ""}</td>
        </tr>`;
      })
      .join("");
    return `<table class="cof2-wizard-table">
      <thead><tr><th>État</th><th>Capacité source</th><th>Résolution</th><th>Action</th><th>Fréquence</th><th>Confiance</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  #renderDiagnostics() {
    const bySeverity = { error: [], warning: [], info: [] };
    for (const d of this.#draft.diagnostics) bySeverity[d.severity]?.push(d);
    const groups = ["error", "warning", "info"]
      .filter((s) => bySeverity[s].length)
      .map(
        (s) => `<div class="cof2-diag-group">
          <h4>${SEVERITY_LABELS[s]} (${bySeverity[s].length})</h4>
          <ul>${bySeverity[s].map((d) => `<li class="cof2-diag cof2-diag-${s}">${esc(d.message)}</li>`).join("")}</ul>
        </div>`
      )
      .join("");
    return groups || "<p><em>Aucun diagnostic.</em></p>";
  }

  #renderPreview() {
    return `
      ${this.#renderStepper()}
      <fieldset>
        <legend>Identité</legend>
        <div class="cof2-identity">
          <label>Nom <input type="text" data-field="name" value="${esc(this.#draft.name)}"></label>
          <label>NC <input type="number" data-field="nc" value="${this.#draft.nc}" step="0.5"></label>
          <label>Catégorie <input type="text" data-field="category" value="${esc(this.#draft.category)}"></label>
          <label>Taille <input type="text" data-field="size" value="${esc(this.#draft.size)}"></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Statistiques</legend>
        ${this.#renderAbilities()}
        <div class="cof2-identity">
          <label>Défense <input type="number" data-field="defense" value="${this.#draft.defense ?? ""}"></label>
          <label>PV <input type="number" data-field="hp" value="${this.#draft.hp ?? ""}"></label>
          <label>Initiative <input type="number" data-field="initiative" value="${this.#draft.initiative ?? ""}"></label>
          <label>RD <input type="number" data-field="damageReduction" value="${this.#draft.damageReduction ?? 0}"></label>
        </div>
      </fieldset>
      <fieldset><legend>Attaques</legend>${this.#renderAttacksTable()}</fieldset>
      <fieldset><legend>Capacités</legend>${this.#renderCapacitiesTable()}</fieldset>
      <fieldset><legend>Diagnostics</legend>${this.#renderDiagnostics()}</fieldset>
      <footer class="form-footer">
        <button type="button" data-action="back"><i class="fa-solid fa-arrow-left"></i> Précédent</button>
        <button type="button" data-action="to-options" class="default"><i class="fa-solid fa-arrow-right"></i> Suivant</button>
      </footer>`;
  }

  #renderOptions() {
    const o = this.#options;
    return `
      ${this.#renderStepper()}
      <div class="form-group">
        <label><input type="checkbox" data-field="opt.createActor" ${o.createActor ? "checked" : ""}> Créer l'acteur Rencontre.</label>
      </div>
      <div class="form-group">
        <label><input type="checkbox" data-field="opt.reuseExisting" ${o.reuseExisting ? "checked" : ""}> Réutiliser les objets existants lorsqu'ils sont compatibles.</label>
      </div>
      <div class="form-group">
        <label title="Bibliothèque d'import non disponible (Story 6) : chaque import crée ses propres objets pour l'instant.">
          <input type="checkbox" disabled> Enregistrer les nouveaux objets dans la bibliothèque d'import (à venir — Story 6).
        </label>
      </div>
      <div class="form-group">
        <label title="Non disponible tant que la bibliothèque d'import (Story 6) n'existe pas.">
          <input type="checkbox" disabled> Créer uniquement dans l'acteur sans enrichir la bibliothèque (à venir — Story 6).
        </label>
      </div>
      <div class="form-group">
        <label><input type="checkbox" data-field="opt.openSheet" ${o.openSheet ? "checked" : ""}> Ouvrir la fiche après création.</label>
      </div>
      <footer class="form-footer">
        <button type="button" data-action="back"><i class="fa-solid fa-arrow-left"></i> Précédent</button>
        <button type="button" data-action="create" class="default"><i class="fa-solid fa-check"></i> Créer</button>
      </footer>`;
  }

  #renderResult() {
    if (!this.#result) return `${this.#renderStepper()}<p><em>Création en cours…</em></p>`;
    const { actor, warnings, error } = this.#result;
    if (error) {
      return `
        ${this.#renderStepper()}
        <p class="cof2-diag cof2-diag-error"><strong>Échec de la création :</strong> ${esc(error)}</p>
        <footer class="form-footer">
          <button type="button" data-action="back"><i class="fa-solid fa-arrow-left"></i> Précédent</button>
        </footer>`;
    }
    const created = this.#draft.attacks.length;
    const toReview = warnings.length;
    return `
      ${this.#renderStepper()}
      <p><strong>${esc(actor.name)}</strong> créé.</p>
      <ul>
        <li>${created} attaque(s) créée(s).</li>
        <li>${this.#draft.capacities.length} capacité(s) traitée(s).</li>
        <li>${toReview} élément(s) à vérifier.</li>
      </ul>
      ${warnings.length ? `<ul>${warnings.map((w) => `<li class="cof2-diag cof2-diag-warning">${esc(w)}</li>`).join("")}</ul>` : ""}
      <footer class="form-footer">
        <button type="button" data-action="open-actor" class="default"><i class="fa-solid fa-up-right-from-square"></i> Ouvrir la rencontre</button>
      </footer>`;
  }

  #setField(path, value) {
    const parts = path.split(".");
    let obj = this.#draft;
    if (parts[0] === "opt") obj = this.#options;
    const target = parts[0] === "opt" ? parts.slice(1) : parts;
    for (let i = 0; i < target.length - 1; i++) obj = obj[target[i]];
    const key = target.at(-1);
    if (typeof obj[key] === "number") obj[key] = value === "" ? null : Number(value);
    else if (typeof obj[key] === "boolean") obj[key] = value;
    else obj[key] = value;
  }

  #activateListeners(content) {
    content.querySelectorAll("[data-field]").forEach((el) => {
      const evt = el.type === "checkbox" ? "change" : "input";
      el.addEventListener(evt, () => {
        const value = el.type === "checkbox" ? el.checked : el.value;
        this.#setField(el.dataset.field, value);
      });
    });
    content.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (ev) => this.#onAction(ev, el.dataset.action));
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
    }
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
    const resolver = await buildCapacityResolver();
    draft.capacities.forEach((cap, i) => {
      const resolution = resolver?.resolve(cap.name);
      this.#capacityHits.set(i, { hit: resolution, status: capacityStatus(resolution) });
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
      const { actor, warnings } = await createEncounter(this.#draft);
      this.#result = { actor, warnings };
      if (this.#options.openSheet) actor.sheet.render(true);
      ui.notifications.info(`Rencontre « ${actor.name} » créée.`);
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

Hooks.once("ready", () => {
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
  button.innerHTML = '<i class="fa-solid fa-dragon"></i> Importer une rencontre COF2';
  button.addEventListener("click", () => openCof2ImportWizard());
  header.appendChild(button);
});

export { Cof2ImportWizardApp, openCof2ImportWizard };

import { parseWarboundMarkdown, validateWarboundModel } from "../../../src/importers/warbound-markdown/index.mjs";
import { syncDocuments, computeImportDiff } from "./WarboundImportSynchronizer.mjs";
import { TEMPLATE_ROOT } from "../../../src/constants/templates.mjs";

const MODULE_ID = "warbound-campaign-content";
const SEVERITY_LABELS = { error: "Erreur", warning: "Avertissement" };

const STATE_LABELS = {
  new: "nouvelle",
  modified: "modifiée",
  unchanged: "inchangée",
  inactive: "inactive",
  orphan: "orpheline",
};

const MARKERS = {
  new: "+",
  modified: "~",
  unchanged: "=",
  inactive: "○",
  orphan: "!",
};

const COLLECTION_TYPE_LABELS = {
  encounter: { singular: "rencontre", plural: "rencontres", table: "Table de rencontres" },
  rumor:     { singular: "rumeur",    plural: "rumeurs",    table: "Table de rumeurs" },
};
const DEFAULT_LABELS = { singular: "entrée", plural: "entrées", table: "Table aléatoire" };

const { HandlebarsApplicationMixin } = foundry.applications.api;

class WarboundMarkdownImporterApp extends HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "warbound-markdown-importer",
    classes: ["warbound", "warbound-markdown-importer"],
    tag: "form",
    window: { title: "Importer un document Warbound Markdown", icon: "fa-solid fa-file-import", resizable: true },
    position: { width: 640, height: "auto" },
  };

  static PARTS = {
    source:     { template: `${TEMPLATE_ROOT}/apps/warbound-markdown-importer/source.hbs` },
    validation: { template: `${TEMPLATE_ROOT}/apps/warbound-markdown-importer/validation.hbs` },
    preview:    { template: `${TEMPLATE_ROOT}/apps/warbound-markdown-importer/preview.hbs` },
    result:     { template: `${TEMPLATE_ROOT}/apps/warbound-markdown-importer/result.hbs` },
  };

  #fileName = "";
  #parseResult = null;
  #validationResult = null;
  #readError = null;
  #diffResult = null;
  #importing = false;
  #importResult = null;

  async _prepareContext(options) {
    const canPreview = this.#validationResult?.errors.length === 0 && !this.#importResult;
    const model = this.#parseResult;
    const diff = this.#diffResult;

    const stateByEntryId = new Map();
    if (diff) {
      for (const [state, items] of Object.entries(diff)) {
        for (const item of items) {
          stateByEntryId.set(item.entry?.id ?? item.existing.id, state);
        }
      }
    }

    const rows = model
      ? [
          { state: stateByEntryId.get("context") ?? "new", id: "context", title: "Contexte" },
          ...model.entries.map((entry) => ({
            state: stateByEntryId.get(entry.id) ?? "new",
            id: entry.id,
            title: entry.title,
          })),
          ...(diff?.orphan ?? []).map((item) => ({
            state: "orphan",
            id: item.existing.id,
            title: item.existing.name,
          })),
        ].map((row) => ({ ...row, stateLabel: STATE_LABELS[row.state], marker: MARKERS[row.state] }))
      : [];

    const counts = {};
    for (const row of rows) counts[row.state] = (counts[row.state] ?? 0) + 1;
    const summary = Object.entries(STATE_LABELS)
      .filter(([state]) => counts[state])
      .map(([state, label]) => ({
        state,
        marker: MARKERS[state],
        count: counts[state],
        label: counts[state] > 1 ? label + "s" : label,
      }));

    const validationSections =
      this.#validationResult
        ? (() => {
            const { errors, warnings } = this.#validationResult;
            const sections = [];
            if (errors.length)   sections.push({ severity: "error",   label: SEVERITY_LABELS.error,   items: errors,   count: errors.length });
            if (warnings.length) sections.push({ severity: "warning", label: SEVERITY_LABELS.warning, items: warnings, count: warnings.length });
            return sections;
          })()
        : [];

    const folderOptions = (type) => [
      { id: "", name: "— Racine (aucun dossier) —" },
      ...game.folders
        .filter((f) => f.type === type)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({ id: f.id, name: f.name })),
    ];

    const typeLabels = model ? (COLLECTION_TYPE_LABELS[model.type] ?? DEFAULT_LABELS) : DEFAULT_LABELS;
    const totalLabel = rows.length === 1 ? typeLabels.singular : typeLabels.plural;

    let importResult = null;
    if (this.#importResult) {
      if (this.#importResult.error) {
        importResult = { error: this.#importResult.error };
      } else {
        const { journalName, journalId, tableId, collectionType, counts: importCounts } = this.#importResult;
        const importTypeLabels = COLLECTION_TYPE_LABELS[collectionType] ?? DEFAULT_LABELS;
        importResult = {
          journalName,
          journalId,
          tableId,
          tableLabel: importTypeLabels.table,
          countItems: [
            { icon: "fa-plus",                label: "créée",        count: importCounts.new       ?? 0 },
            { icon: "fa-pen",                 label: "mise à jour",  count: importCounts.modified  ?? 0 },
            { icon: "fa-equals",              label: "inchangée",    count: importCounts.unchanged ?? 0 },
            { icon: "fa-circle-half-stroke",  label: "inactive",     count: importCounts.inactive  ?? 0 },
            { icon: "fa-triangle-exclamation",label: "erreur",       count: importCounts.errors    ?? 0 },
          ].map((item) => ({ ...item, label: item.count === 1 ? item.label : item.label + "s" })),
        };
      }
    }

    return {
      fileName: this.#fileName,
      readError: this.#readError,
      hasValidation: !!this.#validationResult,
      validationOk: this.#validationResult?.errors.length === 0 && this.#validationResult?.warnings.length === 0,
      validationSections,
      canPreview,
      model,
      rows,
      summary,
      totalLabel,
      typeLabels,
      journalFolders: canPreview ? folderOptions("JournalEntry") : [],
      tableFolders:   canPreview ? folderOptions("RollTable")    : [],
      importing: this.#importing,
      hasResult: !!this.#importResult,
      importResult,
    };
  }

  async _preparePartContext(partId, context) {
    const isActive =
      partId === "source" ||
      (partId === "validation" && context.hasValidation) ||
      (partId === "preview"    && context.canPreview) ||
      (partId === "result"     && context.hasResult);
    return { ...context, isActive };
  }

  async _onRender(context, options) {
    this.#activateListeners(this.element);
  }

  #activateListeners(root) {
    root.querySelector('input[name="mdfile"]')?.addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      this.#fileName = file.name;
      this.#readError = null;
      this.#parseResult = null;
      this.#validationResult = null;
      this.#diffResult = null;
      this.#importResult = null;

      const reader = new FileReader();
      reader.onload = (e) => this.#onFileRead(e.target.result);
      reader.onerror = () => {
        this.#readError = "Impossible de lire le fichier.";
        this.render();
      };
      reader.readAsText(file);
    });

    root.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (ev) => this.#onAction(ev, el.dataset.action));
    });
  }

  #onFileRead(text) {
    try {
      this.#parseResult = parseWarboundMarkdown(text);
      this.#validationResult = validateWarboundModel(this.#parseResult, text);

      if (this.#validationResult.errors.length === 0) {
        this.#diffResult = computeImportDiff(this.#parseResult);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | WarboundMarkdownImporterApp parse/validate error`, err);
      this.#readError = err.message;
    }
    this.render();
  }

  async #onAction(_event, action) {
    if (action === "close" || action === "cancel") return this.close();
    if (action === "import") return this.#doImport();
    if (action === "open-journal") {
      game.journal.get(this.#importResult?.journalId)?.sheet.render(true);
      return;
    }
    if (action === "open-table") {
      game.tables.get(this.#importResult?.tableId)?.sheet.render(true);
      return;
    }
  }

  /**
   * Traduit le diff en compteurs d'état. Un premier import crée toutes les pages du modèle
   * (page de contexte incluse) sans toucher l'état actif/inactif, tandis qu'un réimport applique
   * exactement les catégories du diff.
   * @param {object | null} diff - diff de syncDocuments, null au premier import
   * @param {object} model - modèle parsé
   * @returns {{ new: number, modified: number, unchanged: number, inactive: number, errors: number }}
   */
  static #countChanges(diff, model) {
    if (diff === null) {
      return { new: model.entries.length + 1, modified: 0, unchanged: 0, inactive: 0, errors: 0 };
    }
    return {
      new: diff.new.length,
      modified: diff.modified.length,
      unchanged: diff.unchanged.length,
      inactive: diff.inactive.length,
      errors: 0,
    };
  }

  async #doImport() {
    if (!this.#parseResult || this.#importing) return;

    const journalFolderId = this.element.querySelector('select[name="journalFolder"]')?.value || null;
    const tableFolderId   = this.element.querySelector('select[name="tableFolder"]')?.value   || null;

    const journalFolder = journalFolderId ? game.folders.get(journalFolderId) : null;
    const tableFolder   = tableFolderId   ? game.folders.get(tableFolderId)   : null;

    this.#importing = true;
    this.render();

    try {
      const { journal, table, diff } = await syncDocuments(this.#parseResult, journalFolder, tableFolder);
      this.#importResult = {
        journalName: journal.name,
        journalId: journal.id,
        tableId: table?.id ?? null,
        collectionType: this.#parseResult.type ?? null,
        counts: WarboundMarkdownImporterApp.#countChanges(diff, this.#parseResult),
      };
    } catch (err) {
      console.error(`${MODULE_ID} | WarboundMarkdownImporterApp import error`, err);
      this.#importResult = { error: err.message };
    } finally {
      this.#importing = false;
      this.render();
    }
  }
}

function openWarboundMarkdownImporter() {
  if (!game.user.isGM) {
    ui.notifications.warn("Accès réservé au Maître de Jeu.");
    return;
  }
  const app = new WarboundMarkdownImporterApp();
  app.render(true);
  return app;
}

Hooks.once("ready", () => {
  game.settings?.registerMenu?.(MODULE_ID, "warboundMarkdownImporter", {
    name: "Importer un document Warbound Markdown",
    label: "Ouvrir l'importateur",
    hint: "Sélectionne un fichier .md Warbound, parse et valide son contenu avant tout import.",
    icon: "fa-solid fa-file-import",
    type: WarboundMarkdownImporterApp,
    restricted: true,
  });

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { ...module.api, warbound: { ...module.api?.warbound, openWarboundMarkdownImporter } };
});

// En V14, le hook reçoit l'élément header directement (ApplicationV2 partial render).
// `.directory-header .action-buttons` échoue car root IS le .directory-header.
// Corriger : chercher .action-buttons comme descendant direct de root.
Hooks.on("renderJournalDirectory", (app, htmlOrElement) => {
  if (!game.user.isGM) return;
  const root = htmlOrElement instanceof HTMLElement ? htmlOrElement : htmlOrElement?.[0];
  if (!root || root.querySelector(".warbound-markdown-importer-button")) return;

  const header = root.querySelector(".action-buttons") ?? root.querySelector(".directory-header");
  if (!header) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "warbound-markdown-importer-button";
  // EXCEPTION DOM : bouton FontAwesome injecté programmatiquement — non migrable en HBS sans refonte du point d'injection
  button.innerHTML = '<i class="fa-solid fa-file-import"></i> Importer un document Warbound';
  button.addEventListener("click", () => openWarboundMarkdownImporter());
  header.appendChild(button);
});

export { WarboundMarkdownImporterApp, openWarboundMarkdownImporter };

import { parseWarboundMarkdown, validateWarboundModel } from "../../../src/importers/warbound-markdown/index.mjs";
import { syncDocuments, computeImportDiff } from "./WarboundImportSynchronizer.mjs";

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

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

class WarboundMarkdownImporterApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "warbound-markdown-importer",
    classes: ["warbound", "warbound-markdown-importer"],
    tag: "form",
    window: { title: "Importer un document Warbound Markdown", icon: "fa-solid fa-file-import", resizable: true },
    position: { width: 640, height: "auto" },
  };

  #fileName = "";
  #parseResult = null;
  #validationResult = null;
  #readError = null;
  #diffResult = null;
  #importing = false;
  #importResult = null;

  async _renderHTML() {
    return this.#renderSource();
  }

  async _replaceHTML(result, content) {
    content.innerHTML = result;
    this.#activateListeners(content);
  }

  #renderSource() {
    const readError = this.#readError
      ? `<p class="wb-diag wb-diag-error"><strong>Erreur de lecture :</strong> ${esc(this.#readError)}</p>`
      : "";

    const validationSection = this.#validationResult ? this.#renderValidation() : "";
    const previewSection = this.#canPreview() ? this.#renderPreview() : "";
    const importResultSection = this.#importResult ? this.#renderImportResult() : "";

    return `
      <div class="form-group stacked">
        <label>Sélectionnez un fichier Warbound Markdown (.md) :</label>
        <input type="file" name="mdfile" accept=".md,.markdown,text/markdown">
        ${this.#fileName ? `<p class="wb-file-name"><i class="fa-solid fa-file"></i> ${esc(this.#fileName)}</p>` : ""}
      </div>
      ${readError}
      ${validationSection}
      ${previewSection}
      ${importResultSection}
      <footer class="form-footer">
        <button type="button" data-action="close"><i class="fa-solid fa-xmark"></i> Fermer</button>
      </footer>`;
  }

  #canPreview() {
    return this.#validationResult?.errors.length === 0 && !this.#importResult;
  }

  #renderPreview() {
    const model = this.#parseResult;
    const diff = this.#diffResult;

    // Une entrée absente du diff est une page qui n'existe pas encore dans Foundry.
    const stateByEntryId = new Map();
    for (const [state, items] of Object.entries(diff ?? {})) {
      for (const item of items) {
        stateByEntryId.set(item.entry?.id ?? item.existing.id, state);
      }
    }

    const rows = [
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
    ];

    const counts = {};
    for (const row of rows) counts[row.state] = (counts[row.state] ?? 0) + 1;

    const summary = Object.entries(STATE_LABELS)
      .filter(([state]) => counts[state])
      .map(
        ([state, label]) =>
          `<span class="wb-count-${state}"><code>${MARKERS[state]}</code> ${counts[state]} ${label}${counts[state] > 1 ? "s" : ""}</span>`
      )
      .join(" · ");

    const entryRows = rows
      .map(
        (row) => `
          <li class="wb-preview-entry wb-preview-${row.state}" title="${esc(STATE_LABELS[row.state])}">
            <code class="wb-preview-marker">${esc(MARKERS[row.state])}</code>
            <span class="wb-preview-id">${esc(row.id)}</span>
            <span class="wb-preview-title">${esc(row.title)}</span>
          </li>`
      )
      .join("");

    const folderOptions = (type) =>
      [
        `<option value="">— Racine (aucun dossier) —</option>`,
        ...game.folders
          .filter((f) => f.type === type)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`),
      ].join("");

    const syncButton = `<button type="button" data-action="import" class="default" ${this.#importing ? "disabled" : ""}>
      <i class="fa-solid ${this.#importing ? "fa-spinner fa-spin" : "fa-rotate"}"></i>
      ${this.#importing ? "Synchronisation en cours…" : "Synchroniser"}
    </button>`;

    const cancelButton = `<button type="button" data-action="cancel"><i class="fa-solid fa-xmark"></i> Annuler</button>`;

    return `
      <div class="wb-preview">
        <div class="wb-preview-header">
          <strong>${esc(model.title)}</strong>
          <span class="wb-preview-collection-id">${esc(model.collectionId)}</span>
          <span class="wb-preview-total">${rows.length} entrée${rows.length > 1 ? "s" : ""}</span>
          <div class="wb-preview-summary">${summary || "Aucune entrée"}</div>
        </div>
        <ul class="wb-preview-list">${entryRows}</ul>
        <div class="wb-folder-select">
          <div class="form-group">
            <label><i class="fa-solid fa-book"></i> Dossier Journal</label>
            <select name="journalFolder">${folderOptions("JournalEntry")}</select>
          </div>
          <div class="form-group">
            <label><i class="fa-solid fa-table-list"></i> Dossier Table</label>
            <select name="tableFolder">${folderOptions("RollTable")}</select>
          </div>
        </div>
        <div class="wb-preview-actions">
          ${syncButton}
          ${cancelButton}
        </div>
      </div>`;
  }

  #renderImportResult() {
    if (this.#importResult.error) {
      return `<div class="wb-diag-group"><p class="wb-diag wb-diag-error"><i class="fa-solid fa-circle-xmark"></i> <strong>Erreur :</strong> ${esc(this.#importResult.error)}</p></div>`;
    }
    const { journalName, journalId, tableId, counts } = this.#importResult;

    const countItems = [
      { key: "new", label: "créée", icon: "fa-plus" },
      { key: "modified", label: "mise à jour", icon: "fa-pen" },
      { key: "unchanged", label: "inchangée", icon: "fa-equals" },
      { key: "inactive", label: "inactive", icon: "fa-circle-half-stroke" },
      { key: "errors", label: "erreur", icon: "fa-triangle-exclamation" },
    ]
      .map(({ key, label, icon }) => {
        const n = counts[key] ?? 0;
        return `<li><i class="fa-solid ${icon}"></i> ${n} ${label}${n === 1 ? "" : "s"}</li>`;
      })
      .join("");

    const openTableButton = tableId
      ? `<button type="button" data-action="open-table"><i class="fa-solid fa-table-list"></i> Ouvrir la RollTable</button>`
      : "";

    return `
      <div class="wb-diag-group">
        <p class="wb-diag wb-diag-success"><i class="fa-solid fa-circle-check"></i> Synchronisation réussie — <strong>${esc(journalName)}</strong></p>
        <ul class="wb-bilan">${countItems}</ul>
        <div class="wb-bilan-actions">
          <button type="button" data-action="open-journal"><i class="fa-solid fa-book"></i> Ouvrir le Journal</button>
          ${openTableButton}
        </div>
      </div>`;
  }

  #renderValidation() {
    const { errors, warnings } = this.#validationResult;

    if (errors.length === 0 && warnings.length === 0) {
      return `<div class="wb-diag-group"><p class="wb-diag wb-diag-success"><i class="fa-solid fa-check"></i> Document valide — aucune erreur ni avertissement.</p></div>`;
    }

    const sections = [];

    if (errors.length) {
      const items = errors.map((e) => `<li class="wb-diag wb-diag-error">[${esc(e.code)}] ${esc(e.message)}</li>`).join("");
      sections.push(`<div class="wb-diag-group"><h4>${SEVERITY_LABELS.error} (${errors.length})</h4><ul>${items}</ul></div>`);
    }

    if (warnings.length) {
      const items = warnings.map((w) => `<li class="wb-diag wb-diag-warning">[${esc(w.code)}] ${esc(w.message)}</li>`).join("");
      sections.push(`<div class="wb-diag-group"><h4>${SEVERITY_LABELS.warning} (${warnings.length})</h4><ul>${items}</ul></div>`);
    }

    return `<div class="wb-validation-result">${sections.join("")}</div>`;
  }

  #activateListeners(content) {
    content.querySelector('input[name="mdfile"]')?.addEventListener("change", (ev) => {
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

    content.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (ev) => this.#onAction(ev, el.dataset.action, content));
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

  async #onAction(_event, action, content) {
    if (action === "close" || action === "cancel") return this.close();
    if (action === "import") return this.#doImport(content);
    if (action === "open-journal") {
      game.journal.get(this.#importResult?.journalId)?.sheet.render();
      return;
    }
    if (action === "open-table") {
      game.tables.get(this.#importResult?.tableId)?.sheet.render();
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

  async #doImport(content) {
    if (!this.#parseResult || this.#importing) return;

    const journalFolderId = content.querySelector('select[name="journalFolder"]')?.value || null;
    const tableFolderId = content.querySelector('select[name="tableFolder"]')?.value || null;

    const journalFolder = journalFolderId ? game.folders.get(journalFolderId) : null;
    const tableFolder = tableFolderId ? game.folders.get(tableFolderId) : null;

    this.#importing = true;
    this.render();

    try {
      const { journal, table, diff } = await syncDocuments(this.#parseResult, journalFolder, tableFolder);
      this.#importResult = {
        journalName: journal.name,
        journalId: journal.id,
        tableId: table?.id ?? null,
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
  button.innerHTML = '<i class="fa-solid fa-file-import"></i> Importer un document Warbound';
  button.addEventListener("click", () => openWarboundMarkdownImporter());
  header.appendChild(button);
});

export { WarboundMarkdownImporterApp, openWarboundMarkdownImporter };

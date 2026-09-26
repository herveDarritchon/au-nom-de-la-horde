import { parseWarboundMarkdown, validateWarboundModel } from "../../../src/importers/warbound-markdown/index.mjs";
import { syncDocuments } from "./WarboundImportSynchronizer.mjs";

const MODULE_ID = "warbound-campaign-content";
const SEVERITY_LABELS = { error: "Erreur", warning: "Avertissement" };

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
    const folderSection = this.#canImport() ? this.#renderFolderSelect() : "";
    const importResultSection = this.#importResult ? this.#renderImportResult() : "";

    const importButton =
      this.#canImport()
        ? `<button type="button" data-action="import" class="default" ${this.#importing ? "disabled" : ""}>
             <i class="fa-solid ${this.#importing ? "fa-spinner fa-spin" : "fa-file-import"}"></i>
             ${this.#importing ? "Import en cours…" : "Importer"}
           </button>`
        : "";

    return `
      <div class="form-group stacked">
        <label>Sélectionnez un fichier Warbound Markdown (.md) :</label>
        <input type="file" name="mdfile" accept=".md,.markdown,text/markdown">
        ${this.#fileName ? `<p class="wb-file-name"><i class="fa-solid fa-file"></i> ${esc(this.#fileName)}</p>` : ""}
      </div>
      ${readError}
      ${validationSection}
      ${folderSection}
      ${importResultSection}
      <footer class="form-footer">
        ${importButton}
        <button type="button" data-action="close"><i class="fa-solid fa-xmark"></i> Fermer</button>
      </footer>`;
  }

  #canImport() {
    return this.#validationResult?.errors.length === 0 && !this.#importResult;
  }

  #renderFolderSelect() {
    const journalFolders = game.folders
      .filter((f) => f.type === "JournalEntry")
      .sort((a, b) => a.name.localeCompare(b.name));

    const tableFolders = game.folders
      .filter((f) => f.type === "RollTable")
      .sort((a, b) => a.name.localeCompare(b.name));

    const journalOptions = [
      `<option value="">— Racine (aucun dossier) —</option>`,
      ...journalFolders.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`),
    ].join("");

    const tableOptions = [
      `<option value="">— Racine (aucun dossier) —</option>`,
      ...tableFolders.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`),
    ].join("");

    return `
      <div class="wb-folder-select">
        <div class="form-group">
          <label><i class="fa-solid fa-book"></i> Dossier Journal</label>
          <select name="journalFolder">${journalOptions}</select>
        </div>
        <div class="form-group">
          <label><i class="fa-solid fa-table-list"></i> Dossier Table</label>
          <select name="tableFolder">${tableOptions}</select>
        </div>
      </div>`;
  }

  #renderImportResult() {
    if (this.#importResult.error) {
      return `<div class="wb-diag-group"><p class="wb-diag wb-diag-error"><i class="fa-solid fa-circle-xmark"></i> <strong>Erreur :</strong> ${esc(this.#importResult.error)}</p></div>`;
    }
    const { journalName, tableName } = this.#importResult;
    const tableInfo = tableName
      ? `<li><i class="fa-solid fa-table-list"></i> Table : <strong>${esc(tableName)}</strong></li>`
      : `<li><i class="fa-solid fa-circle-info"></i> Aucune entrée active — pas de RollTable créée.</li>`;
    return `
      <div class="wb-diag-group">
        <p class="wb-diag wb-diag-success"><i class="fa-solid fa-circle-check"></i> Import réussi.</p>
        <ul>
          <li><i class="fa-solid fa-book"></i> Journal : <strong>${esc(journalName)}</strong></li>
          ${tableInfo}
        </ul>
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
    } catch (err) {
      console.error(`${MODULE_ID} | WarboundMarkdownImporterApp parse/validate error`, err);
      this.#readError = err.message;
    }
    this.render();
  }

  async #onAction(_event, action, content) {
    if (action === "close") return this.close();
    if (action === "import") return this.#doImport(content);
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
      const { journal, table } = await syncDocuments(this.#parseResult, journalFolder, tableFolder);
      this.#importResult = {
        journalName: journal.name,
        tableName: table?.name ?? null,
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

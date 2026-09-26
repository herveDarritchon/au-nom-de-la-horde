import { parseWarboundMarkdown, validateWarboundModel } from "../../../src/importers/warbound-markdown/index.mjs";

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

    const nextButton =
      this.#validationResult && this.#validationResult.errors.length === 0
        ? `<button type="button" data-action="next" class="default" disabled><i class="fa-solid fa-arrow-right"></i> Suivant (non implémenté)</button>`
        : "";

    return `
      <div class="form-group stacked">
        <label>Sélectionnez un fichier Warbound Markdown (.md) :</label>
        <input type="file" name="mdfile" accept=".md,.markdown,text/markdown">
        ${this.#fileName ? `<p class="wb-file-name"><i class="fa-solid fa-file"></i> ${esc(this.#fileName)}</p>` : ""}
      </div>
      ${readError}
      ${validationSection}
      <footer class="form-footer">
        ${nextButton}
        <button type="button" data-action="close"><i class="fa-solid fa-xmark"></i> Fermer</button>
      </footer>`;
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

      const reader = new FileReader();
      reader.onload = (e) => this.#onFileRead(e.target.result);
      reader.onerror = () => {
        this.#readError = "Impossible de lire le fichier.";
        this.render();
      };
      reader.readAsText(file);
    });

    content.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (ev) => this.#onAction(ev, el.dataset.action));
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

  async #onAction(_event, action) {
    if (action === "close") return this.close();
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

Hooks.on("renderJournalDirectory", (app, htmlOrElement) => {
  if (!game.user.isGM) return;
  const root = htmlOrElement instanceof HTMLElement ? htmlOrElement : htmlOrElement?.[0];
  if (!root || root.querySelector(".warbound-markdown-importer-button")) return;

  const header = root.querySelector(".directory-header .action-buttons, .directory-header");
  if (!header) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "warbound-markdown-importer-button";
  button.innerHTML = '<i class="fa-solid fa-file-import"></i> Importer un document Warbound';
  button.addEventListener("click", () => openWarboundMarkdownImporter());
  header.appendChild(button);
});

export { WarboundMarkdownImporterApp, openWarboundMarkdownImporter };

# Plan d'implémentation — Squelette UI WarboundMarkdownImporterApp

**Issue** : [#52 — [WM Importer] Squelette UI — sélection de fichier et point d'entrée MJ](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/52)
**Référence cadrage** : `documentation/cadrage/Warbound_Cadrage_Importeur_Markdown_Foundry.md` §18–§19, §35
**Dépendances** : #50 (Parser ✅) · #51 (Validator ✅)
**Module(s) impacté(s)** :
- `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` (créé)
- `scripts/warbound.mjs` (modifié — point d'entrée)
- `module.json` (modifié — esmodule ajouté)

---

## 1. Objectif

Créer le squelette Foundry v14 de l'importeur Markdown Warbound : une `ApplicationV2` accessible uniquement aux MJ, permettant la sélection d'un fichier `.md`, le déclenchement automatique du parsing et de la validation, et l'affichage des erreurs avant toute écriture Foundry.

---

## 2. Périmètre

### Inclus

- `WarboundMarkdownImporterApp extends foundry.applications.api.ApplicationV2`
- Guard `game.user.isGM` (accès MJ uniquement)
- `<input type="file" accept=".md,.markdown,text/markdown">` — lecture côté navigateur via `FileReader`
- Chaîne : lecture fichier → `parseWarboundMarkdown` → `validateWarboundModel` → afficher erreurs ou proposer la suite
- Point d'entrée dans `warbound.mjs` (hook `ready`) : `registerMenu` + hook `renderActorDirectory`
- Déclaration dans `module.json` esmodules
- Exposition dans `module.api`

### Hors périmètre

- Prévisualisation diff
- Création de documents Foundry
- Templates `.hbs` (HTML inline retenu, cohérent avec le pattern `cof2ImportWizard.mjs`)

---

## 3. État existant

- `src/importers/warbound-markdown/parser/WarboundMarkdownParser.mjs` — livré #50
- `src/importers/warbound-markdown/validator/WarboundMarkdownValidator.mjs` — livré #51
- `src/importers/warbound-markdown/index.mjs` — re-exporte `parseWarboundMarkdown` et `validateWarboundModel`
- `scripts/importers/cof2ImportWizard.mjs` — pattern de référence (ApplicationV2, HTML inline, hook ready + renderActorDirectory)
- `module.json` : `styles/warbound-importer.css` déjà déclaré; esmodule `WarboundMarkdownImporterApp.mjs` absent

---

## 4. Décisions d'architecture

- HTML inline (pas de `.hbs`) — cohérent avec `cof2ImportWizard.mjs`
- Lecture fichier : `FileReader.readAsText` côté navigateur (§19 du cadrage)
- Étapes minimales : `"source"` (sélection + résultat validation) — l'étape suivante est hors périmètre #52
- Guard GM dans la fonction `openWarboundMarkdownImporter()` avant `app.render(true)`, plus `restricted: true` dans `registerMenu`
- Imports purs depuis `../../src/importers/warbound-markdown/index.mjs`

---

## 5. Plan de travail

### 5.1 Créer `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs`

```
WarboundMarkdownImporterApp extends foundry.applications.api.ApplicationV2
```

- `static DEFAULT_OPTIONS` : `id: "warbound-markdown-importer"`, classes `["warbound", "warbound-markdown-importer"]`, window `{ title: "Importer un document Warbound Markdown", icon: "fa-solid fa-file-import", resizable: true }`, position `{ width: 640, height: "auto" }`.
- État interne : `#file = null`, `#parseResult = null`, `#validationResult = null`, `#readError = null`.
- `_renderHTML()` → renvoie HTML inline (étape unique `source`).
- Étape **source** : `<input type="file" accept=".md,.markdown,text/markdown">` + bouton « Analyser » + zone d'affichage erreurs/warnings.
- Sur change `<input type="file">` : stocker le fichier, ne pas déclencher automatiquement (cohérence avec l'AC : "Parsing + validation déclenchés automatiquement après sélection" — le bouton "Analyser" sert de confirmation explicite ou on peut déclencher sur `change`, à choisir).
- Sur "Analyser" : `FileReader.readAsText(file)` → dans `onload` : `parseWarboundMarkdown(text)` → `validateWarboundModel(model, text)`.
- Si `errors.length > 0` : afficher section erreurs (classe `wb-diag-error`), bloquer la progression.
- Si `errors.length === 0` : afficher warnings éventuels + bouton « Suivant » (désactivé avec TODO, hors périmètre #52).
- `_replaceHTML(result, content)` : `content.innerHTML = result` + `#activateListeners(content)`.
- Fonction export `openWarboundMarkdownImporter()` : guard `game.user.isGM`, puis `new WarboundMarkdownImporterApp().render(true)`.

### 5.2 Modifier `scripts/warbound.mjs`

Dans `Hooks.once("ready")` existant, ajouter :
```js
import { WarboundMarkdownImporterApp, openWarboundMarkdownImporter } from "./importers/warbound-markdown/WarboundMarkdownImporterApp.mjs";
```
- `game.settings.registerMenu(MODULE_ID, "warboundMarkdownImporter", { name: "Importer un document Warbound Markdown", label: "Ouvrir l'importateur", hint: "...", icon: "fa-solid fa-file-import", type: WarboundMarkdownImporterApp, restricted: true })`
- Mise à jour `module.api` : `module.api.warbound = { openWarboundMarkdownImporter }`.

Ajouter hook `renderActorDirectory` (ou `renderJournalDirectory`) avec bouton GM en miroir du bouton COF2 existant.

### 5.3 Modifier `module.json`

Ajouter dans `esmodules` :
```json
"scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs"
```

---

## 6. Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs` | Créé |
| `scripts/warbound.mjs` | Modifié — registerMenu + hook + module.api |
| `module.json` | Modifié — ajout esmodule |

---

## 7. Tests attendus

Tests Vitest non applicables (ApplicationV2 = runtime Foundry). Validation manuelle sur `http://localhost:31000/game` :

- Bouton visible dans ActorDirectory uniquement si GM
- Sélection d'un `.md` valide → parse+validate → 0 erreur → bouton Suivant affiché
- Sélection d'un `.md` invalide (ex. front matter absent) → erreurs affichées, progression bloquée
- Fermeture propre de l'application

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `FileReader` non testable unitairement | Isoler le callback dans une méthode `#onFileRead(text)` — testable manuellement |
| Bouton "Suivant" hors scope → UI confuse | Afficher bouton disabled avec label explicite ou omettre le footer sur cette étape |
| Import circulaire `warbound.mjs` ↔ `WarboundMarkdownImporterApp.mjs` | Import static en tête de `warbound.mjs`, pas de re-import dans l'app |

---

## 9. Critères d'arrêt

- Tous les critères d'acceptation de l'issue #52 sont verts.
- `pnpm build` passe (audit + compile).
- Bouton MJ accessible uniquement aux GM sur instance locale.
# Plan d'implémentation — Parser Markdown Warbound V1 — modèle interne neutre

**Issue** : [#50 — [WM Importer] Parser Markdown Warbound V1 — modèle interne neutre](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/50)
**Référence cadrage** : `documentation/cadrage/Warbound_Cadrage_Importeur_Markdown_Foundry.md` §7–§15
**Module(s) impacté(s)** :
- `src/importers/warbound-markdown/parser/WarboundMarkdownParser.mjs` (créé)
- `src/importers/warbound-markdown/parser/WarboundMarkdownParser.test.mjs` (créé)
- `src/importers/warbound-markdown/index.mjs` (créé)

---

## 1. Objectif

Implémenter le parser Markdown Warbound V1 produisant un modèle interne JS neutre (aucune dépendance Foundry) conforme au contrat défini au §15 du cadrage.

---

## 2. Périmètre

### Inclus

- Parser le front matter YAML (`warbound.schema`, `id`, `title`, `type`)
- Extraire le bloc contexte (entre front matter et `<!-- warbound:table:start -->`) en markdown brut + HTML
- Parser la table Warbound entre `<!-- warbound:table:start -->` / `<!-- warbound:table:end -->` avec colonnes `Index | ID | Titre | Aperçu | Poids | Actif`
- Parser les blocs entrée `<!-- warbound:entry id="..." -->` / `<!-- warbound:entry:end -->` — markdown brut + HTML
- Convertir Markdown → HTML en pur JS (zéro dépendance — aucune librairie YAML/Markdown dans le projet)
- Produire le modèle neutre conforme au §15 : `{ schema, collectionId, title, type, context, entries[] }`

### Hors périmètre

- Validation des règles métier (§16 du cadrage — issue dédiée)
- Création de documents Foundry (JournalEntry, RollTable)
- Interface utilisateur

---

## 3. Décisions d'architecture

- Structure miroir de `src/importers/cof2/` : `index.mjs` point d'entrée, `parser/` pour la logique.
- Pas de dépendances externes — `package.json` ne contient que `@foundryvtt/foundryvtt-cli` et `c8`; pas de bundler → le module doit être nativement compatible ESM navigateur.
- `WarboundMarkdownParser.mjs` expose `parseWarboundMarkdown(rawText: string)` — fonction pure sans état.
- `markdownToHtml` interne : convertisseur bloc-par-bloc (titres, paragraphes, blockquotes, listes, GFM tables, inline bold/italic/code).
- Fusion défensive : entrée de table sans bloc détaillé correspondant → `markdown: ""`, `html: ""` (pas de crash — validation métier = hors scope).

---

## 4. Fichiers créés

| Fichier | Description |
|---|---|
| `src/importers/warbound-markdown/parser/WarboundMarkdownParser.mjs` | Parser principal |
| `src/importers/warbound-markdown/parser/WarboundMarkdownParser.test.mjs` | 28 tests node:test |
| `src/importers/warbound-markdown/index.mjs` | Point d'entrée public |

---

## 5. Résultat

28 tests, 0 échecs. Suite complète 205 tests, 0 régression.

Modèle produit conforme §15 :

```javascript
{
  schema: 1,
  collectionId: "durotar-tauren-rumors",
  title: "Rumeurs taurènes — Durotar",
  type: "rumor",
  context: { markdown: "...", html: "..." },
  entries: [
    { index: 1, id: "stonehoof-convoi", title: "...", summary: "...",
      weight: 1, active: true, markdown: "...", html: "..." }
  ]
}
```

# Plan d'implémentation — Validation et diagnostics Warbound Markdown V1

**Issue** : [#51 — [WM Importer] Validation et diagnostics V1](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/51)
**Référence cadrage** : `documentation/cadrage/Warbound_Cadrage_Importeur_Markdown_Foundry.md` §16–§17, §49
**Dépendance** : #50 (Parser — `WarboundMarkdownParser.mjs` ✅ livré)
**Module(s) impacté(s)** :
- `src/importers/warbound-markdown/validator/WarboundMarkdownValidator.mjs` (créé)
- `src/importers/warbound-markdown/validator/WarboundMarkdownValidator.test.mjs` (créé)
- `src/importers/warbound-markdown/index.mjs` (re-export ajouté)

---

## 1. Objectif

Implémenter `validateWarboundModel(model)` — fonction pure sans état ni dépendance Foundry — qui prend le modèle interne produit par `parseWarboundMarkdown` et retourne `{ errors: ValidationError[], warnings: ValidationWarning[] }`.

Erreurs bloquantes → `errors[]` (import doit être refusé si non vide).
Warnings → `warnings[]` (affichés mais n'empêchent pas l'import).

---

## 2. Périmètre

### Inclus

**Erreurs bloquantes (§16) :**
1. Front matter absent (`frontMatter === null`)
2. `warbound.schema` absent
3. `schema` non supporté (seule valeur supportée : `1`)
4. `warbound.id` absent
5. `warbound.title` absent
6. Table absente (parser renvoie `entries: []` ET aucun marqueur table détecté — à confirmer avec le modèle du parser)
7. Plusieurs tables déclarées (raw text contient > 1 `<!-- warbound:table:start -->`)
8. Colonne obligatoire manquante (`Index | ID | Titre | Aperçu | Poids | Actif`)
9. ID vide dans la table
10. IDs dupliqués dans la table
11. ID dupliqué dans un bloc entrée
12. Entrée active sans bloc détaillé (`active: true` ET `markdown: ""`)
13. Poids non entier strictement positif
14. `Actif` ≠ `oui` / `non` (valeur brute dans le modèle)

**Warnings non bloquants (§16) :**
1. Bloc entrée orphelin (ID présent dans blocs mais absent de la table)
2. Trous dans les Index (ex : 1, 2, 4 → trou à 3)
3. Deux titres identiques dans la table
4. Aucune entrée active
5. Aperçu vide pour une entrée

### Hors périmètre

- Création de documents Foundry
- Interface utilisateur
- Parsing (déjà couvert par #50)

---

## 3. État existant

`WarboundMarkdownParser.mjs` produit :

```javascript
{
  schema: number | undefined,
  collectionId: string | undefined,
  title: string | undefined,
  type: string | undefined,
  context: { markdown: string, html: string },
  entries: [
    { index: number, id: string, title: string, summary: string,
      weight: number, active: boolean, markdown: string, html: string }
  ]
}
```

Le validateur consomme ce modèle. Le parser ne jette pas d'erreur sur des données invalides (conception défensive) : c'est au validateur de détecter les incohérences.

Remarque : certaines règles (table absente, plusieurs tables, colonnes manquantes) sont des propriétés du parsing lui-même. Le modèle du parser ne les expose pas directement. Deux options :
- **Option A** : le validateur re-parse le `rawText` pour ces vérifications structurelles → couplage minimal.
- **Option B** : `parseWarboundMarkdown` retourne des métadonnées structurelles supplémentaires → modifie le contrat #50.

**Recommandation : Option A** — le validateur accepte optionnellement `rawText` en second paramètre pour les 3 vérifications structurelles (table absente, tables multiples, colonnes). L'API reste rétrocompatible.

---

## 4. Décisions d'architecture

- `validateWarboundModel(model, rawText?)` — fonction pure, zéro dépendance.
- Signature de retour :
  ```javascript
  {
    errors: [{ code: string, message: string, id?: string, line?: number }],
    warnings: [{ code: string, message: string, id?: string, line?: number }]
  }
  ```
- Messages d'erreur conformes §17 : mentionnent l'ID, la nature, et quand possible le bloc attendu.
- Codes d'erreur kebab-case pour faciliter les assertions de test (ex : `missing-front-matter`, `duplicate-id`, `invalid-weight`).
- Répertoire miroir du parser : `src/importers/warbound-markdown/validator/`.
- Re-export dans `index.mjs` : `export { validateWarboundModel } from "./validator/WarboundMarkdownValidator.mjs";`

---

## 5. Plan de travail

1. Créer `src/importers/warbound-markdown/validator/WarboundMarkdownValidator.mjs` avec :
   - Vérifications front matter (présence, schema, id, title)
   - Vérifications structurelles (table absente, tables multiples, colonnes) — via `rawText`
   - Vérifications table (IDs vides, doublons, poids, Actif invalide)
   - Vérification cohérence table↔blocs (entrée active sans bloc)
   - Vérification doublons IDs dans blocs
   - Calcul warnings (orphelins, trous index, titres dupliqués, 0 actif, aperçu vide)

2. Créer `src/importers/warbound-markdown/validator/WarboundMarkdownValidator.test.mjs` couvrant tous les cas §49 + chaque erreur bloquante + chaque warning.

3. Ajouter le re-export dans `src/importers/warbound-markdown/index.mjs`.

---

## 6. Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `src/importers/warbound-markdown/validator/WarboundMarkdownValidator.mjs` | Créé |
| `src/importers/warbound-markdown/validator/WarboundMarkdownValidator.test.mjs` | Créé |
| `src/importers/warbound-markdown/index.mjs` | Modifié — re-export ajouté |

---

## 7. Tests attendus (§49 Validator)

- ID dupliqué dans la table → erreur bloquante
- ID dupliqué dans les blocs → erreur bloquante
- Entrée active sans bloc détaillé → erreur bloquante
- Poids invalide (0, -1, 1.5, "abc") → erreur bloquante
- `Actif` invalide (ex : "yes", "true", "") → erreur bloquante
- Schema inconnu (ex : `schema: 99`) → erreur bloquante
- Table absente → erreur bloquante
- Front matter absent → erreur bloquante
- `warbound.id` absent → erreur bloquante
- `warbound.title` absent → erreur bloquante
- Bloc orphelin → warning
- Trous d'index → warning
- Aucune entrée active → warning
- Aperçu vide → warning
- Document valide minimal → 0 erreur, 0 warning
- Document valide complet → 0 erreur, warnings éventuels selon contenu

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Règles structurelles (table absente/multiples/colonnes) pas exposées par le modèle parser | Validateur accepte `rawText` optionnel pour ces vérifications |
| `active: boolean` dans modèle — valeur brute `"oui"`/`"non"` déjà convertie par parser | La règle `Actif invalide` s'applique via re-scan de `rawText` (regex sur les cellules Actif des lignes de table) avant de consommer le modèle booléen |
| Numéros de ligne non disponibles dans le modèle | Fournir ligne quand `rawText` est disponible via re-scan ciblé; sinon omettre (`line: undefined`) |

---

## 9. Critères d'arrêt

- Tous les critères d'acceptation de l'issue #51 sont verts.
- Suite Vitest complète sans régression (base : 28 tests parser + autres tests existants).
- `pnpm build` passe (audit + compile).

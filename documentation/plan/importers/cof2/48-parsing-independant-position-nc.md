# Plan d'implémentation — Parsing indépendant de la position du bloc `NC`

**Issue** : [#48 — Rendre le parsing indépendant de la position du bloc `NC`](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/48)
**Module(s) impacté(s)** : `src/importers/cof2/parsing/statblockParser.mjs`, `src/importers/cof2/parsing/statblockParser.test.mjs`

---

## 1. Objectif

Faire en sorte que le parseur traite `NC` comme un **ancrage du bloc statistique** et non comme une **frontière de début du statblock**. Toute section sémantique (capacités, traits, type/famille) placée avant `NC` dans le texte source doit être correctement analysée, pas silencieusement éliminée.

## 2. Périmètre

### Inclus

- Refactoring de `parseStatblock` pour supprimer l'hypothèse implicite « tout ce qui précède `NC` est du bruit PDF ».
- Extraction correcte des capacités situées **avant** le bloc statistique (`NC` / caractéristiques / DEF / PV / Init.).
- Conservation du comportement existant pour les statblocks où les capacités se trouvent **après** les attaques.
- Correction du cas du Scorpion géant (capacités `VERMINE`, `CUIRASSÉ`, `POISON` avant `NC`).
- Ajout d'un fixture et de tests de non-régression pour le Scorpion géant.
- Maintien de la classification `PDF_NOISE_REMOVED` pour les vraies lignes de bruit (numéros de page, titres courants, artefacts d'extraction).

### Hors scope

- Toute modification du pipeline de résolution (`capacityResolver`, `encounterFactory`).
- Le wizard d'import (`cof2ImportWizard.mjs`) et la commande debug (`cof2Debug.mjs`).
- L'ajout d'une liste de marqueurs codés en dur propres à une créature spécifique.
- La modification du format de `EncounterDraft` ou de ses fonctions utilitaires dans `encounterDraft.mjs`.

## 3. Constat sur l'existant

### Localisation du problème

`statblockParser.mjs`, lignes 56–74 :

```js
const ncIndex = lines.findIndex((l) => NC_LINE_RE.test(l));
if (ncIndex < 0) {
  // … fallback sans NC
} else {
  // …
  const skipped = inlineName ? ncIndex : ncIndex - 1;
  if (skipped > 0) diagnostics.push(pdfNoiseRemoved(lines.slice(0, skipped).join(" / ")));
  // …
  lines = lines.slice(ncIndex + 1);   // ← toutes les lignes avant NC disparaissent
}
```

Toutes les lignes avant `NC` (hormis le nom) sont : (a) étiquetées `PDF_NOISE_REMOVED` et (b) retirées du flux de parsing. Elles n'atteignent jamais la logique de détection de capacités (section 4, ligne 121+).

### Structure du statblock Scorpion géant (fixture existant)

Le fichier `__fixtures__/scorpion-geant.txt` existe déjà. Il contient des capacités avant `NC`. Elles sont actuellement perdues.

### Structure de `matchTitle` et de la boucle corps (§4)

La fonction `matchTitle` (ligne 194) reconnaît les capacités au format `NOM : description` sans aucune dépendance au nom de créature. Elle peut donc opérer sur des lignes pré-NC sans modification.

La boucle en-tête (§3, lignes 85–115) s'arrête dès qu'une ligne ressemble à une attaque ou à une capacité. Ce point de sortie est déjà robuste.

## 4. Décisions d'architecture

1. **`NC` reste un ancrage, pas un séparateur de document.** La recherche de `NC` continue à localiser le bloc statistique (caractéristiques, DEF, PV, Init.), mais les lignes qui précèdent ne sont plus supprimées a priori.

2. **Passage en deux phases distinctes :**
   - Phase A — *avant NC* : analyse du nom, puis scan sémantique des lignes pré-NC pour en extraire capacités, traits, type/famille.
   - Phase B — *après NC* : traitement actuel (en-tête statistique, attaques, capacités post-attaques).

3. **Critère de bruit inchangé.** Une ligne n'est étiquetée `PDF_NOISE_REMOVED` que si elle échoue *tous* les classifieurs sémantiques connus (capacité, type/taille créature, description). Le simple fait d'être avant `NC` n'est plus un critère de bruit.

4. **Pas de liste de marqueurs codés en dur.** La reconnaissance reste basée sur les patterns existants : `matchTitle` pour les capacités, `/(^|·\s*)(créature|taille)\b/i` pour le type/taille, `NC_LINE_RE` pour l'ancrage statistique.

5. **`headerDone` reste inchangé.** La boucle en-tête de la phase B démarre directement après `NC`, comme aujourd'hui.

6. **Ordre de fusion des capacités.** Les capacités pré-NC sont ajoutées dans `result.capacities` avant les capacités post-attaques, en préservant l'ordre d'apparition dans le texte.

## 5. Plan de travail

1. **Lire `statblockParser.mjs` en entier** pour confirmer toutes les zones d'impact avant toute modification.

2. **Extraire une fonction `scanCapacitiesSection(lines)`** qui prend une liste de lignes et retourne `{ capacities, notes, typeLines }` en appliquant `matchTitle` et la détection type/taille. Cette fonction sera réutilisée pour la phase A (pré-NC) et pourra éventuellement alléger la boucle corps actuelle.

3. **Modifier le bloc `else` (ncIndex ≥ 0) de `parseStatblock` :**
   - Calculer `preNcLines` = lignes de `0` à `ncIndex - 1` (excluant le nom si déjà trouvé en ligne précédente).
   - Appeler `scanCapacitiesSection(preNcLines)` → pousser capacités dans `result.capacities`, type/taille dans `result`, lignes non reconnues dans `result.notes` plutôt qu'en `pdfNoiseRemoved`.
   - N'appeler `pdfNoiseRemoved` que pour les lignes non reconnues *qui correspondent effectivement à un pattern de bruit* (numéro de page seul, titre courant répété, etc.) — ou simplement les passer en `notes` sans diagnostic si aucun pattern de bruit fiable n'est disponible.
   - Continuer avec `lines = lines.slice(ncIndex + 1)` comme aujourd'hui pour la phase B.

4. **Mettre à jour les tests dans `statblockParser.test.mjs` :**
   - Ajouter un test `"parseStatblock extrait les capacités situées avant NC (fixture scorpion-geant)"` : vérifie que `VERMINE`, `CUIRASSÉ` et `POISON` sont présents dans `result.capacities` avec leurs descriptions.
   - Vérifier que le NC (3), les caractéristiques, DEF, PV, Init., et les attaques du Scorpion géant sont toujours correctement extraits.
   - Vérifier que les tests existants (Centaure, Ombre, Golem, etc.) ne régressent pas.

5. **Lancer `node --test`** (ou `pnpm test` selon le script configuré) pour confirmer la suite complète.

## 6. Fichiers probablement modifiés

- `src/importers/cof2/parsing/statblockParser.mjs` — refactoring du bloc `else` + extraction de `scanCapacitiesSection`
- `src/importers/cof2/parsing/statblockParser.test.mjs` — ajout des tests Scorpion géant

## 7. Tests attendus

### Nouveau test de régression — Scorpion géant (capacités pré-NC)

- `parseStatblock(fixture("scorpion-geant.txt"))` retourne un `EncounterDraft` avec :
  - `capacities` contenant `{ name: "Vermine", … }`, `{ name: "Cuirassé", … }`, `{ name: "Poison", … }`.
  - `nc === 3`.
  - Caractéristiques, DEF, PV, Init. extraits correctement.
  - Attaques extraites correctement.
  - Aucun `diagnostic` de type `pdfNoiseRemoved` pour ces trois capacités.

### Non-régression

- Tous les tests existants dans `statblockParser.test.mjs` passent sans modification.
- `node --test` passe intégralement (`src/` et `scripts/`).

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Des lignes pré-NC qui *étaient* du bruit (ex. numéro de page) sont maintenant parsées à tort comme capacités. | La détection par `matchTitle` exige le pattern `NOM : texte` (deux-points obligatoire) : une ligne `42` ou `Bestiaire` ne passera pas. Contrôler sur le fixture existant `scorpion-geant.txt` que le fixture réel ne contient pas de tels artefacts. |
| La fusion des capacités pré-NC et post-attaques dans `result.capacities` produit un ordre inattendu, cassant des tests qui vérifient l'index. | Vérifier que les assertions des tests existants portent sur l'existence des capacités (`find`/`some`), pas sur leur index dans le tableau. Ajuster si nécessaire. |
| Le nom de la créature extrait change (ex. ligne précédant `NC` traitée différemment). | La logique d'extraction du nom (`inlineName || lines[ncIndex - 1]`) reste inchangée. Les tests de nom existants garantissent la non-régression. |
| `scanCapacitiesSection` introduit une dépendance circulaire ou un couplage inattendu. | La fonction reste dans `statblockParser.mjs`, locale au module, sans import supplémentaire. |

## 9. Critères d'arrêt

- Les capacités `VERMINE`, `CUIRASSÉ` et `POISON` du Scorpion géant sont présentes dans le résultat de `parseStatblock`.
- Aucune de ces capacités n'est étiquetée `pdfNoiseRemoved`.
- Le bloc statistique (NC, caractéristiques, DEF, PV, Init., attaques) du Scorpion géant est toujours correctement extrait.
- Aucun traitement spécifique au Scorpion géant, à `VERMINE`, `CUIRASSÉ` ou `POISON` n'est introduit dans le code de production.
- Les tests existants ne régressent pas (`node --test` passe intégralement).
- La logique de bruit PDF (`pdfNoiseRemoved`) n'élimine aucune ligne sémantique, quelle que soit sa position relative à `NC`.

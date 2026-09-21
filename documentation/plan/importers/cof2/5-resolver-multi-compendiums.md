# Plan d'implémentation — Resolver multi-compendiums

**Issue** : [#5 — Story 5 : Resolver multi-compendiums](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/5)
**Epic** : `documentation/cadrage/Epic_Importateur_statblocks_COF2_PDF.md` (sections 10 « CapacityDraft »,
14 « Résolution par priorité », 25 « Arborescence »)
**Bloqué par** : #3 (livré — `EncounterDraft`/`CapacityDraft`/diagnostics, cf.
`documentation/plan/importers/cof2/3-modele-encounterdraft-diagnostics.md`)
**Module(s) impacté(s)** : `src/importers/cof2/resolution/capacityResolver.mjs` (nouveau),
`src/importers/cof2/parsing/statblockParser.mjs`, `src/importers/cof2/parsing/capacityMatcher.mjs` (supprimé),
`src/importers/cof2/index.mjs`

---

## 1. Objectif

Remplacer `makeCapacityMatcher` (`capacityMatcher.mjs`) par un service de résolution pur, multi-sources, ordonné par
priorité, conforme à la section 14 de l'Epic : `EXACT_REUSE` → `TEMPLATE_VARIANT` → `REUSE_IMPORTED` → `NOT_FOUND`,
avec détection explicite des cas `AMBIGUOUS`. Aucun fallback approximatif silencieux (l'actuel `approximate: true`
sans statut explicite disparaît). L'extraction du temps d'action (`L`/`A`/`M`/`G`) doit être faite sur le nom avant
toute recherche.

---

## 2. Périmètre

### Inclus

- Un module pur `capacityResolver.mjs`, sans dépendance Foundry, recevant deux index déjà chargés (compendiums
  officiels, bibliothèque d'import du monde) et retournant un statut de résolution par capacité.
- Statuts : `EXACT_REUSE`, `TEMPLATE_VARIANT`, `REUSE_IMPORTED`, `NOT_FOUND`, `AMBIGUOUS`.
- Ordre de résolution strict : officiel exact → officiel variante paramétrée → bibliothèque d'import exacte →
  non trouvé. Une ambiguïté (homonymes incompatibles) sur une étape interrompt la résolution à cette étape avec le
  statut `AMBIGUOUS`, sans redescendre aux priorités suivantes.
- Distinction paramètre différent : `Charge (difficulté 16)` vs `Charge (13)` du compendium → `TEMPLATE_VARIANT`,
  jamais `EXACT_REUSE`.
- Extraction du temps d'action dans `matchTitle` (`statblockParser.mjs`) : `actionType` renseigné (`L`/`A`/`M`/`G`),
  et le nom utilisé pour la résolution ne porte plus ce suffixe.
- Suppression de `capacityMatcher.mjs` et de son test ; migration de la logique `normalize`/`stripParens` dans le
  nouveau module.
- Tests unitaires purs (`node --test`), sans réseau ni instance Foundry.

### Hors scope

- Construction effective des index (lecture des compendiums Foundry, bibliothèque d'import réelle) : le resolver
  reçoit des tableaux d'entrées déjà chargés, comme le fait `capacityMatcher.mjs` aujourd'hui. Le câblage Foundry
  (`Cof2Adapter`/lecture de packs) reste hors périmètre de cette story.
- Création de la bibliothèque d'import du monde (pack dédié, hash, provenance, dédoublonnage) → Story 6.
- Clonage/variation réelle d'une capacité en `TEMPLATE_VARIANT` (écran de comparaison, création de la variante) →
  Story 8. Cette story se limite à **détecter et qualifier** le statut, pas à produire l'objet variant.
- Item Factory, automatisation → Stories 7/9.
- Renseignement de `originPath`/`resolution` sur le `CapacityDraft` produit par `parseStatblock` (câblage
  bout-en-bout parseur ↔ resolver) : non demandé par les critères d'acceptation de l'issue, qui portent sur le
  resolver isolé ; à confirmer/planifier séparément si besoin d'intégration immédiate.

---

## 3. Constat sur l'existant

- `capacityMatcher.mjs` (`makeCapacityMatcher`) fait déjà un exact-match puis un match approximatif (nom sans
  parenthèses finales), avec un dossier prioritaire pour les homonymes exacts, et retourne soit `{entry, approximate}`
  soit `{ambiguous: string[]}` soit `null`. Il ne connaît qu'une seule source (pas de distinction officiel/bibliothèque
  importée) et ne produit pas de statut typé (`EXACT_REUSE`/`TEMPLATE_VARIANT`/…).
- Il n'est utilisé nulle part sauf réexporté par `src/importers/cof2/index.mjs` : aucun appelant réel à migrer.
- `matchTitle` (`statblockParser.mjs:168-176`) détecte déjà qu'un suffixe `(L|A|M|G)` en fin de nom est un temps
  d'action (via `trailingParens` et la regex `/^[LAMG]$/`, utilisée uniquement pour ajuster `confidence`), mais ne
  l'extrait pas : `actionType` reste `null` et `name` (`tidyCase(rawName)`) conserve le suffixe.
- `CapacityDraft.resolution`/`originPath` existent déjà dans l'interface (Story 3) mais ne sont renseignés nulle
  part — cette story fournit le service de résolution, sans obligation de câblage complet dans `parseStatblock`.

---

## 4. Décisions d'architecture

- Nouveau dossier `src/importers/cof2/resolution/` (conforme à l'arborescence proposée en section 25 de l'Epic,
  adaptée en `.mjs`/JSDoc comme le reste du projet — pas de `.ts`).
- Un seul module `capacityResolver.mjs` (pas de sur-découpage en 4 fichiers `ItemResolver`/`OfficialPackResolver`/
  `ImportLibraryResolver`/`CapacityMatcher` comme suggéré par l'Epic à titre indicatif) : la logique reste petite et
  cohérente, inutile de la fragmenter sans bénéfice concret. Fonctions exportées :
  - `normalize(s)`, `stripParens(s)` : repris tels quels de `capacityMatcher.mjs`.
  - `extractActionType(rawName)` → `{ name, actionType }` : sépare un suffixe `(L|A|M|G)` strict (regex
    `/^[LAMG]$/` sur le contenu des parenthèses finales) du reste du nom ; sinon `actionType: null` et `name`
    inchangé. Utilisée par `matchTitle`.
  - `makeCapacityResolver({ officialEntries, importedEntries, priorityFolderId })` → `(name) => CapacityResolution`,
    où `CapacityResolution` est `{ status: "EXACT_REUSE"|"REUSE_IMPORTED", entry }` ou
    `{ status: "TEMPLATE_VARIANT", entry }` ou `{ status: "AMBIGUOUS", candidates: string[] }` ou
    `{ status: "NOT_FOUND" }`.
- Algorithme de `makeCapacityResolver` (repris de la logique exact/loose existante, étendu à deux sources et à des
  statuts explicites) :
  1. Exact match dans `officialEntries` (normalisé) : ambiguë (plusieurs entrées de noms différents mais normalisés
     identiques, sans dossier prioritaire résolvant le conflit) → `AMBIGUOUS` ; sinon → `EXACT_REUSE` (dossier
     prioritaire appliqué comme dans `capacityMatcher.mjs` actuel).
  2. Sinon, match sur le nom sans paramètre final (`stripParens`) dans `officialEntries` : plusieurs candidats →
     `AMBIGUOUS` ; un seul → `TEMPLATE_VARIANT`.
  3. Sinon, exact match dans `importedEntries` : ambiguë → `AMBIGUOUS` ; sinon → `REUSE_IMPORTED`.
  4. Sinon → `NOT_FOUND`.
  - Aucune étape ne retombe sur un statut approximatif implicite : chaque branche produit un statut nommé de la
    liste fermée, jamais un booléen `approximate`.
- `matchTitle` (`statblockParser.mjs`) appelle `extractActionType(rawName)` avant de construire le `CapacityDraft` :
  `actionType` prend la valeur extraite, `name` est calculé sur le nom sans suffixe d'action (`tidyCase` appliqué
  après extraction). `rawName` reste la capture brute complète (provenance inchangée, y compris le suffixe), pour
  rester cohérent avec le rôle de provenance de `rawName` déjà établi en Story 3.
- Suppression de `capacityMatcher.mjs` et `capacityMatcher.test.mjs` ; `src/importers/cof2/index.mjs` réexporte
  désormais `makeCapacityResolver`, `normalize`, `stripParens`, `extractActionType` depuis
  `./resolution/capacityResolver.mjs`.
- Pas de nouvelle dépendance externe.

---

## 5. Plan de travail

1. Créer `src/importers/cof2/resolution/capacityResolver.mjs` avec `normalize`, `stripParens`, `extractActionType`,
   `makeCapacityResolver`.
2. Écrire `src/importers/cof2/resolution/capacityResolver.test.mjs` couvrant :
   - `EXACT_REUSE` simple et avec dossier prioritaire sur homonyme officiel ;
   - `TEMPLATE_VARIANT` (`Charge (difficulté 16)` face à `Charge (13)` en officiel — jamais `EXACT_REUSE`) ;
   - `AMBIGUOUS` sur homonymes exacts et sur variantes paramétrées multiples sans dossier prioritaire tranchant ;
   - `REUSE_IMPORTED` quand la capacité n'existe pas en officiel mais existe exactement en bibliothèque d'import ;
   - `NOT_FOUND` quand aucune source ne correspond ;
   - `extractActionType` sur `"Charge (L)"` → `{name: "Charge", actionType: "L"}`, et non-régression sur un nom
     sans suffixe d'action ou avec un paramètre non-action (`"Vol (rapide)"` → `actionType: null`).
3. Adapter `matchTitle` dans `statblockParser.mjs` pour appeler `extractActionType` et renseigner `actionType`/`name`
   en conséquence.
4. Étendre/adapter `statblockParser.test.mjs` pour vérifier qu'une capacité du type `"Charge (L)"` produit
   `actionType: "L"` et un `name` sans le suffixe.
5. Supprimer `src/importers/cof2/parsing/capacityMatcher.mjs` et `capacityMatcher.test.mjs`.
6. Mettre à jour `src/importers/cof2/index.mjs` pour réexporter depuis `./resolution/capacityResolver.mjs`.
7. Relire pour confirmer qu'aucun appel Foundry (`game`, `Actor`, `Item`, `foundry.*`) n'a été introduit dans
   `src/importers/cof2/resolution/` ni `src/importers/cof2/parsing/`.

---

## 6. Fichiers probablement modifiés

- Nouveaux : `src/importers/cof2/resolution/capacityResolver.mjs`,
  `src/importers/cof2/resolution/capacityResolver.test.mjs`.
- Supprimés : `src/importers/cof2/parsing/capacityMatcher.mjs`, `src/importers/cof2/parsing/capacityMatcher.test.mjs`.
- Modifiés : `src/importers/cof2/parsing/statblockParser.mjs` (extraction du temps d'action dans `matchTitle`),
  `src/importers/cof2/parsing/statblockParser.test.mjs` (cas `actionType`), `src/importers/cof2/index.mjs`
  (réexports).

---

## 7. Tests attendus

- `node --test` exécute `capacityResolver.test.mjs` et les cas ajoutés dans `statblockParser.test.mjs`, sans réseau
  ni instance Foundry (critère d'acceptation explicite de l'issue).
- Une capacité exactement compatible est résolue `EXACT_REUSE`.
- Une capacité absente des deux sources est résolue `NOT_FOUND`.
- Un homonyme ambigu est résolu `AMBIGUOUS`, jamais réutilisé silencieusement.
- `Charge (difficulté 16)` n'est jamais résolue `EXACT_REUSE` contre `Charge (13)` (au plus `TEMPLATE_VARIANT`).
- `(L)`, `(A)`, `(M)`, `(G)` sont extraits du nom par `extractActionType`, utilisés par `matchTitle` avant toute
  résolution.

---

## 8. Risques et mitigations

- **Risque** : confusion entre suffixe de temps d'action `(L)` et variante paramétrée à une lettre coïncidant avec
  `L`/`A`/`M`/`G` (cas limite improbable en français mais à documenter).
  **Mitigation** : réutiliser telle quelle la règle déjà en place dans `matchTitle` (`/^[LAMG]$/` strict sur le
  contenu des parenthèses), déjà validée implicitement par les fixtures existantes ; ne pas l'étendre sans cas réel.
- **Risque** : l'ordre de résolution (officiel avant bibliothèque d'import) masque une capacité déjà importée et
  personnalisée qui devrait primer.
  **Mitigation** : c'est l'ordre explicitement fixé par la section 14 de l'Epic (priorité 1 = compendium officiel
  avant priorité 3 = bibliothèque d'import) ; ne pas dévier sans changement de cadrage.
- **Risque** : périmètre flou sur le câblage `originPath`/`resolution` dans `EncounterDraft` (non couvert par les
  critères d'acceptation de l'issue).
  **Mitigation** : le module est livré testable de façon autonome (entrées/sorties explicites) ; l'intégration dans
  `parseStatblock` est laissée à une story ultérieure ou un complément explicite si demandé.

---

## 9. Critères d'arrêt

- Les 5 critères d'acceptation de l'issue #5 sont couverts par des tests `node --test` :
  `EXACT_REUSE`, `NOT_FOUND`, `AMBIGUOUS` sur homonyme, non-confusion `Charge (16)`/`Charge (13)`, extraction
  `(L)/(A)/(M)/(G)` avant recherche.
- Le resolver est testable sans connexion réseau ni instance Foundry active (aucun appel `game`/`Actor`/`Item`/
  `foundry.*` dans `src/importers/cof2/resolution/`).
- `capacityMatcher.mjs` a disparu, remplacé par `capacityResolver.mjs` ; `index.mjs` réexporte la nouvelle API.
- Tous les tests (`node --test`) passent.

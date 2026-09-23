# Plan d'implémentation — Ne pas figer la valeur calculée dans l'identité d'une capacité variante

**Issue** : [#37 — Gérer les valeurs dérivées d'une capacité générique — cas de `Charge`](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/37)
**Module(s) impacté(s)** : `scripts/importers/cof2/itemFactory.mjs`, `scripts/importers/cof2/itemFactory.test.mjs`,
`scripts/importers/cof2/encounterFactory.mjs`, `scripts/importers/cof2/encounterFactory.test.mjs`

---

## 1. Objectif

Quand une capacité `TEMPLATE_VARIANT` voit sa difficulté surchargée automatiquement (Story #8), l'item `capacity`
créé sur l'acteur doit porter l'identité générique de la capacité (ex. `Charge`), jamais le nom paramétré du
modèle source dont la surcharge est issue (ex. `Charge (13)`), pour ne pas figer dans l'identité de la capacité
une valeur calculée pour un autre acteur.

## 2. Périmètre

### Inclus

- `buildCapacityVariantItemData` (`itemFactory.mjs`) nomme l'item créé d'après l'identité générique de la capacité
  source, pas d'après `templateDoc.name`.
- `addTemplateVariantCapacity` (`encounterFactory.mjs`) transmet cette identité (`cap.name`, déjà extraite par le
  parseur sans parenthèse — `statblockParser.mjs`/`extractActionType`) à `buildCapacityVariantItemData`.
- Mise à jour des tests qui verrouillent aujourd'hui le mauvais contrat (`itemFactory.test.mjs:64`,
  `assert.equal(data.name, "Charge (13)")`) et ajout d'une régression explicite au niveau `encounterFactory.test.mjs`
  reproduisant le cas de l'issue (Centaure, `Charge (difficulté 16)` face au modèle `Charge (13)` → item créé
  nommé `Charge`, avec `saveDifficulty: "16"`).

### Hors scope

- Le chemin `EXACT_REUSE` : une capacité générique avec formule dynamique officielle est déjà réutilisée telle
  quelle, sans renommage — inchangé.
- Le chemin de repli (paramètre non reconnu ou surcharge non confirmée) : le modèle est déjà réutilisé tel quel
  via `addCapacityToActor`, sans création d'item ni renommage — inchangé.
- `capacityVariant.mjs` (`detectParameter`/`compareTemplateVariant`/`buildDifficultyOverride`) : ces fonctions ne
  touchent jamais au nom, seulement à `system` — inchangées.
- Toute notion de registre explicite de « capacités génériques » : `cap.name` (déjà dépourvu de paramètre par
  construction du parseur) suffit comme identité ; pas de nouvelle donnée à introduire.

## 3. Constat sur l'existant

- `itemFactory.mjs:94-101` (`buildCapacityVariantItemData`) : `name: templateDoc.name` reprend le nom paramétré du
  modèle (`"Charge (13)"`) tel quel dans l'item cloné, y compris après surcharge de la difficulté à 16.
- `itemFactory.test.mjs:57-67` verrouille ce comportement (`assert.equal(data.name, "Charge (13)")`) : le test
  encode aujourd'hui le bug, pas le contrat attendu.
- `encounterFactory.mjs:250-261` (`addTemplateVariantCapacity`) dispose déjà de `cap.name` (identité générique,
  ex. `"Charge"`, extraite par `matchTitle`/`extractActionType` dans `statblockParser.mjs` — jamais de parenthèse
  de paramètre) mais ne le transmet pas à `buildCapacityVariantItemData`.
- `buildCapacityItemData` (même fichier, chemin `CREATE_NEW`, ligne 60-84) utilise déjà `cap.name` comme nom
  d'item : la convention à appliquer au chemin variante existe déjà pour le chemin création directe.
- `encounterFactory.test.mjs:78-91` (test de surcharge confirmée) ne vérifie aujourd'hui que `system` (pas
  `.name`) sur l'item créé — aucune régression actuelle ne verrouille le mauvais nom à ce niveau, seul
  `itemFactory.test.mjs` le fait.

## 4. Décisions d'architecture

- `buildCapacityVariantItemData(templateDoc, overriddenSystem, name)` : nouveau troisième paramètre obligatoire
  `name` (chaîne), utilisé tel quel comme `name` de l'item retourné, à la place de `templateDoc.name`.
  `templateDoc` reste utilisé pour `system`/`uuid` (traçabilité `flags.warbound.variantOf`) — seul son `name`
  cesse d'être propagé.
- `addTemplateVariantCapacity` passe `cap.name` (déjà disponible, déjà l'identité générique) en troisième argument.
- Pas de nouvelle fonction de nettoyage de nom (`stripParens`) : `cap.name` est déjà l'identité propre produite par
  le parseur, cohérent avec le chemin `CREATE_NEW` qui l'utilise déjà.

## 5. Plan de travail

1. Modifier la signature et le corps de `buildCapacityVariantItemData` dans `itemFactory.mjs` pour accepter
   `name` et l'utiliser comme `name` de l'item retourné (au lieu de `templateDoc.name`) ; mettre à jour le JSDoc.
2. Mettre à jour l'appel dans `addTemplateVariantCapacity` (`encounterFactory.mjs:258`) pour transmettre
   `cap.name`.
3. Corriger `itemFactory.test.mjs:57-67` : `buildCapacityVariantItemData(template, overriddenSystem, "Charge")`
   dans les deux tests existants, assertion `assert.equal(data.name, "Charge")` (au lieu de `"Charge (13)"`).
4. Ajouter dans `encounterFactory.test.mjs` (test de la ligne 78, « surcharge la difficulté et crée une variante
   indépendante quand confirmée ») une assertion sur le nom de l'item créé :
   `assert.equal(createdItems[0].name, "Charge")` — reproduit directement le critère d'acceptation de l'issue
   (« capacité = Charge », jamais `Charge (13)` ni `Charge (16)`).
5. Lancer `node --test` pour vérifier la non-régression complète (`itemFactory`, `encounterFactory`,
   `capacityVariant`, `capacityResolver`, `capacityPlan`).

## 6. Fichiers probablement modifiés

- `scripts/importers/cof2/itemFactory.mjs`
- `scripts/importers/cof2/itemFactory.test.mjs`
- `scripts/importers/cof2/encounterFactory.mjs`
- `scripts/importers/cof2/encounterFactory.test.mjs`

## 7. Tests attendus

- `buildCapacityVariantItemData(template, overriddenSystem, "Charge")` → `data.name === "Charge"`, jamais le nom
  paramétré du modèle (`itemFactory.test.mjs`, mis à jour).
- `createEncounter` avec `Charge (difficulté 16)` face au modèle `Charge (13)`, surcharge confirmée → item créé
  avec `name === "Charge"` **et** `saveDifficulty === "16"` (nouvelle assertion, `encounterFactory.test.mjs`).
- Non-régression : les critères déjà couverts par ce test (surcharge appliquée, modèle officiel non muté) restent
  vérifiés sans changement de leurs assertions existantes.
- Non-régression : `capacityResolver.test.mjs`, `capacityVariant.test.mjs`, `capacityPlan.test.mjs` inchangés (le
  nom de sortie de l'item n'affecte ni la résolution ni la comparaison de paramètre).
- `node --test` passe intégralement.

## 8. Risques et mitigations

- **Risque** : un appelant externe à `encounterFactory.mjs` invoquerait `buildCapacityVariantItemData` avec
  seulement deux arguments (ancienne signature), recevant `name: undefined`.
  **Mitigation** : `buildCapacityVariantItemData` est une fonction interne au module `itemFactory.mjs`, exportée
  mais dont le seul appelant du dépôt est `encounterFactory.mjs` (vérifié par recherche) ; le troisième paramètre
  est rendu obligatoire côté JSDoc et l'unique appel interne est mis à jour dans le même changement.
- **Risque** : `cap.name` pourrait un jour différer de la convention de nommage du modèle officiel pour un cas non
  couvert par les tests actuels (ex. capitalisation).
  **Mitigation** : hors scope de cette issue — `cap.name` est déjà la source de vérité utilisée par
  `buildCapacityItemData` pour le chemin `CREATE_NEW` ; aucune divergence de convention n'est introduite par ce
  changement, qui aligne simplement le chemin variante sur une convention déjà en vigueur ailleurs dans le même
  module.

## 9. Critères d'arrêt

- Les critères d'acceptation de l'issue #37 sont couverts pour le chemin `TEMPLATE_VARIANT` avec surcharge
  confirmée (le seul chemin qui crée un item variante) :
  1. l'item créé porte l'identité générique `Charge`, jamais `Charge (13)` (testé) ;
  2. la difficulté 16 n'entraîne pas la création d'un item nommé `Charge (16)` — le nom reste l'identité générique,
     seule la donnée structurée porte la valeur calculée (testé) ;
  3. une valeur calculée dans le texte source ne devient jamais un paramètre du nom de l'item créé (conséquence
     directe du fix, testé) ;
  4. le cas formule dynamique officielle (`EXACT_REUSE`) reste inchangé, formule conservée (non concerné par ce
     chemin, non régressé) ;
  5. le cas sans automatisation dynamique disponible (repli `UNRECOGNIZED`/non confirmé) conserve le texte
     original du modèle sans altérer son identité (non concerné par ce chemin, non régressé).
- `node --test` passe intégralement (suites modifiées + suites existantes inchangées).
- Contrat public de `capacityResolver.mjs`/`capacityVariant.mjs`/`capacityPlan.mjs` inchangé.

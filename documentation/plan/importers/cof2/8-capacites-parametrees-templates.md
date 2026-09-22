# Plan d'implémentation — Capacités paramétrées et templates

**Issue** : [#8 — Story 8 : Capacités paramétrées et templates](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/8)
**Epic** : `documentation/cadrage/Epic_Importateur_statblocks_COF2_PDF.md` (§14 « Priorité 2 — variante paramétrée
connue », §17 « Automatisation mécanique progressive — Niveau B »)
**Bloqué par** : #5 (livré — `capacityResolver.mjs`), #7 (livré — `itemFactory.mjs`/`actorFactory.mjs`/
`cof2Adapter.mjs`/`encounterFactory.mjs`)
**Module(s) impacté(s)** : `src/importers/cof2/resolution/capacityVariant.mjs` (nouveau),
`scripts/importers/cof2/itemFactory.mjs`, `scripts/importers/cof2/encounterFactory.mjs`,
`scripts/importers/cof2ImportWizard.mjs`

---

## 1. Objectif

Quand le resolver (#5) renvoie `TEMPLATE_VARIANT` (ex. `Charge` du texte source face à `Charge (13)` du
compendium), ne plus réutiliser silencieusement le modèle officiel tel quel : détecter le paramètre numérique porté
par le nom source (`difficulté 16`), le comparer à celui du modèle, cloner le modèle en une variante dont le
paramètre est surchargé, et faire valider cette variante par l'utilisateur dans l'UI de prévisualisation avant
création. Un paramètre non reconnu avec certitude reste non bloquant (`CAPACITY_PARAMETER_MISMATCH`) mais empêche
toute surcharge automatique silencieuse.

---

## 2. Périmètre

### Inclus

- Détection d'un paramètre numérique dans la parenthèse finale du nom d'une capacité source (le même span que
  `stripParens` utilise déjà pour déclencher `TEMPLATE_VARIANT`) : reconnaît trois formes — `difficulté N`,
  `N m` (distance), `N tour(s)`/`N round(s)` (durée) — et, côté modèle officiel, la convention déjà observée dans le
  compendium (`Charge (13)`, nombre nu = difficulté).
- Comparaison paramètre source ↔ paramètre modèle : si les deux sont reconnus et de même nature, valeur du
  modèle vs valeur détectée.
- Clonage réel du modèle en variante (nouvel `Item` de type `capacity`, jamais une écriture sur l'objet du
  compendium officiel) avec **surcharge automatique limitée au cas difficulté** : le champ structuré
  `system.actions[].resolvers[].saveDifficulty` et la première occurrence textuelle `difficulté N` dans
  `system.description` sont remplacés par la valeur détectée. C'est le seul cas qui a un point d'ancrage fiable
  dans les données COF2 (champ dédié + un seul point de texte), conforme à la mise en garde de l'Epic §17
  (Niveau B : patterns simples et fiables uniquement, pas de réécriture générale de prose).
- Distance et durée : détectées et comparées (pour distinguer `TEMPLATE_VARIANT` d'un vrai mismatch), mais **pas**
  surchargées automatiquement dans les données clonées (pas de champ structuré unique fiable comme
  `saveDifficulty`, remplacement texte à l'aveugle jugé trop risqué) — la variante clonée garde le texte du modèle
  pour ces paramètres, avec un avertissement « à vérifier manuellement ».
- Diagnostic `CAPACITY_PARAMETER_MISMATCH` (déjà défini dans `encounterDraft.mjs`, jamais émis à ce jour) déclenché
  quand le paramètre source n'est reconnu dans aucune des trois formes ci-dessus.
- Écran de comparaison dans l'étape Prévisualisation du wizard (`cof2ImportWizard.mjs`) pour chaque capacité
  `TEMPLATE_VARIANT` avec paramètre de difficulté résolu : modèle (nom, valeur actuelle) vs variante (valeur
  détectée), avec case à cocher de confirmation. Le bouton « Suivant » est bloqué tant qu'une variante avec
  surcharge automatique proposée n'est pas confirmée ou explicitement refusée (repli sur le comportement actuel :
  réutilisation du modèle tel quel + avertissement).
- Tests unitaires purs (`node --test`) pour la détection/comparaison/construction de la surcharge, et tests avec
  mock Foundry minimal pour le clonage d'item et l'orchestration.

### Hors scope

- Réécriture automatique de prose complexe (Niveau C de l'Epic §17) : le texte de description hors le seul
  remplacement ciblé `difficulté N` n'est jamais réinterprété.
- Surcharge automatique de distance/durée dans les données clonées (seulement détection + comparaison +
  avertissement) : pas de point d'ancrage structuré unique fiable comme `saveDifficulty`, à traiter dans une story
  ultérieure si un besoin concret apparaît.
- Détection de paramètres ailleurs que dans la parenthèse finale du nom (pas de scan de paramètres dans le corps
  libre de la description).
- Modification de la bibliothèque d'import (#6) : une variante créée depuis un modèle officiel n'est pas
  enregistrée dans `importLibrary.mjs` dans cette story (elle est propre à l'acteur créé, comme le fait déjà le
  texte seul aujourd'hui) — à reconsidérer séparément si la déduplication de variantes entre acteurs devient un
  besoin.
- Modification du contrat public de `capacityResolver.mjs` (#5) : les statuts `TEMPLATE_VARIANT`/`AMBIGUOUS`/etc.
  restent inchangés, cette story ajoute un traitement en aval.

---

## 3. Constat sur l'existant

- `capacityResolver.mjs` distingue déjà correctement `Charge (difficulté 16)` (source) de `Charge (13)` (modèle) en
  `TEMPLATE_VARIANT` (jamais `EXACT_REUSE`) : l'AC #1 de l'issue est donc déjà satisfait structurellement par la
  Story 5 — seule une régression test dédiée manque.
- `encounterFactory.mjs` (`createEncounter`, branche `TEMPLATE_VARIANT`) ajoute aujourd'hui le document modèle tel
  quel à l'acteur via `cof2Adapter.addCapacityToActor`, avec un simple avertissement texte (« vérifier le
  paramètre ») — c'est un manquement direct à l'AC #2 : l'acteur reçoit silencieusement `Charge (13)` alors que le
  texte source demandait 16.
- `CapacityDraft.parameters` existe dans le typedef (`encounterDraft.mjs`) et dans `computeContentHash` mais n'est
  jamais renseigné par le parseur (`matchTitle` retourne toujours `parameters: {}`) : cette story n'a pas besoin de
  le remplir côté parseur, la détection se fait en aval sur `rawName`/`name` au moment de la résolution (même
  logique que `stripParens`, pas de dépendance au parseur).
- Le diagnostic `CAPACITY_PARAMETER_MISMATCH` est déjà codé (`encounterDraft.mjs:92-94`) mais n'a aucun appelant.
- Le wizard (`cof2ImportWizard.mjs`) affiche déjà un badge/libellé de statut de résolution par capacité
  (`CAPACITY_STATUS_BADGES`/`CAPACITY_STATUS_LABELS`, y compris `TEMPLATE_VARIANT`) dans `#renderCapacitiesTable`,
  mais aucune UI de comparaison ni de confirmation n'existe ; la création (`#create`) part directement en écriture
  Foundry sans étape de validation par variante.
- Exemple concret vérifié dans le compendium (`compendiums/items/capacity_Charge__13__ObyyF3lgCpQgoyMQ.yml`) : la
  difficulté existe à deux endroits — `system.actions[1].resolvers[0].saveDifficulty: '13'` (champ structuré) et
  dans le texte de `system.description` (« test de FOR difficulté 13 ») — confirme la faisabilité d'une surcharge
  ciblée pour ce cas précis.

---

## 4. Décisions d'architecture

- Nouveau module pur `src/importers/cof2/resolution/capacityVariant.mjs` (même dossier que `capacityResolver.mjs`,
  cohérent avec la Story 5 ; pas de nouveau sous-dossier) :
  - `detectParameter(name)` → `{kind:"difficulty"|"distance"|"duration", value:number} | null`, opère sur la même
    parenthèse finale que `stripParens`/`extractActionType` (regex dédiées par nature : `/difficult[ée]\s*(\d+)/i`,
    `/(\d+)\s*m\b/i`, `/(\d+)\s*(tours?|rounds?)/i`) ; un nombre nu seul (`(13)`) est traité comme `difficulty`
    (convention du compendium officiel observée sur `Charge (13)`).
  - `compareTemplateVariant(draftName, templateName)` → `{status:"OVERRIDABLE", kind:"difficulty", from, to}` |
    `{status:"DETECTED_NOT_OVERRIDABLE", kind:"distance"|"duration", from, to}` (paramètre reconnu des deux côtés
    mais hors du cas surchargeable automatiquement) | `{status:"UNRECOGNIZED"}` (pas de paramètre reconnu côté
    source → déclenche `CAPACITY_PARAMETER_MISMATCH`).
  - `buildDifficultyOverride(templateSystemData, from, to)` → clone profond (`structuredClone`) de
    `templateSystemData`, remplace chaque `saveDifficulty === String(from)` par `String(to)` dans
    `actions[].resolvers[]`, et la première occurrence de `difficulté ${from}` (insensible à la casse) dans
    `description` par `difficulté ${to}`. Ne mute jamais l'objet reçu (garanti par `structuredClone`, testé
    explicitement — satisfait l'AC #5).
- `itemFactory.mjs` : nouvelle fonction `buildCapacityVariantItemData(templateDoc, override)` — construit les
  données du nouvel `Item` `capacity` à partir de `templateDoc` (nom suffixé, ex. `"Charge (variante)"` ou le nom
  source tel quel — nom source retenu, plus lisible pour l'utilisateur), `system` = résultat de
  `buildDifficultyOverride` (ou `system` du modèle inchangé si non surchargeable), `learned: true`, et
  `flags.warbound.variantOf` = nom/`uuid` du modèle d'origine pour traçabilité (pas de champ `reviewStatus` de la
  bibliothèque d'import ici, hors scope de cette story). Ne copie jamais `_id`/`_stats.compendiumSource` du modèle.
- `encounterFactory.mjs` : la branche `TEMPLATE_VARIANT` de `createEncounter` change de comportement :
  1. Calcule `compareTemplateVariant(cap.rawName, resolution.entry.name)`.
  2. `OVERRIDABLE` **et** confirmé côté wizard (nouveau paramètre d'entrée, voir plus bas) → construit la variante
     via `itemFactory.buildCapacityVariantItemData`, la crée par `actor.createEmbeddedDocuments("Item", …)` (pas
     `cof2Adapter.addCapacityToActor`, qui référence le document du compendium tel quel — inadapté à une variante
     indépendante), avertissement informatif (pas bloquant) confirmant la surcharge appliquée.
  3. `OVERRIDABLE` non confirmé, `DETECTED_NOT_OVERRIDABLE`, ou pas de confirmation transmise (ex. appel direct
     hors wizard, comme `cof2Debug.mjs` s'il existe) → comportement actuel inchangé (réutilisation du modèle,
     avertissement texte) : pas de régression du chemin existant.
  4. `UNRECOGNIZED` → même repli, plus émission du diagnostic `capacityParameterMismatch(cap.rawName)` dans les
     avertissements.
  - `createEncounter(parsed, { confirmedVariants } = {})` reçoit un `Set<string>` optionnel de noms de capacités
    (`cap.rawName`) dont la surcharge est confirmée — signature étendue de façon rétro-compatible (appel sans
    second argument = comportement actuel, aucune surcharge).
- `cof2ImportWizard.mjs` : à l'étape Prévisualisation, `#analyze()` calcule en plus, pour chaque capacité
  `TEMPLATE_VARIANT`, `compareTemplateVariant(...)` et stocke le résultat dans `#capacityHits`. Nouvel état
  `#confirmedVariants` (`Set<string>`, clé = `rawName`). `#renderCapacitiesTable()` affiche, pour les lignes
  `OVERRIDABLE`, une ligne de comparaison repliable (modèle : nom + valeur actuelle ; variante : valeur détectée) et
  une case à cocher liée à `#confirmedVariants`. Le bouton « Suivant » de `#renderPreview()` est désactivé tant
  qu'une ligne `OVERRIDABLE` non cochée existe (texte d'aide expliquant pourquoi). `#create()` transmet
  `{ confirmedVariants: this.#confirmedVariants }` à `createEncounter`.

---

## 5. Plan de travail

1. Créer `src/importers/cof2/resolution/capacityVariant.mjs` (`detectParameter`, `compareTemplateVariant`,
   `buildDifficultyOverride`) + `capacityVariant.test.mjs` : détection des 3 natures, convention nombre nu =
   difficulté côté modèle, cas `UNRECOGNIZED`, non-mutation de l'objet source par `buildDifficultyOverride`
   (référence identique en entrée, valeurs différentes en sortie), remplacement `saveDifficulty` limité aux
   occurrences exactes, non-régression sur un `resolvers[]` sans `saveDifficulty`.
2. Étendre `src/importers/cof2/index.mjs` pour réexporter `detectParameter`, `compareTemplateVariant`,
   `buildDifficultyOverride`.
3. Ajouter `buildCapacityVariantItemData` dans `scripts/importers/cof2/itemFactory.mjs` +
   cas de test dans `itemFactory.test.mjs` (nom, `flags.warbound.variantOf`, absence de `_id`/`compendiumSource`
   copiés, `system` = override attendu).
4. Adapter `scripts/importers/cof2/encounterFactory.mjs` : signature `createEncounter(parsed, options)`, nouvelle
   branche `TEMPLATE_VARIANT` décrite en §4, émission du diagnostic `CAPACITY_PARAMETER_MISMATCH`. Étendre
   `encounterFactory.test.mjs` (mock Foundry minimal, cf. Story 7) : confirmé+surchargeable → item créé avec
   `saveDifficulty` attendu ; non confirmé → comportement actuel (régression testée) ; `UNRECOGNIZED` → avertissement
   + diagnostic présent.
5. Adapter `scripts/importers/cof2ImportWizard.mjs` : calcul de comparaison dans `#analyze()`, UI de comparaison +
   case à cocher dans `#renderCapacitiesTable()`, gate sur le bouton « Suivant », transmission de
   `confirmedVariants` dans `#create()`.
6. Vérification manuelle sur instance Foundry locale (`http://localhost:31000/game`, cf. mémoire dev env) :
   réimporter le Centaure, confirmer que l'écran de comparaison affiche 13 → 16, cocher, créer, vérifier que
   l'item `capacity` créé sur l'acteur a bien `saveDifficulty: '16'` et le texte « difficulté 16 », et que
   `Charge (13)` du compendium officiel est inchangée dans le pack.

---

## 6. Fichiers probablement modifiés

- Nouveaux : `src/importers/cof2/resolution/capacityVariant.mjs`,
  `src/importers/cof2/resolution/capacityVariant.test.mjs`.
- Modifiés : `src/importers/cof2/index.mjs`, `scripts/importers/cof2/itemFactory.mjs`,
  `scripts/importers/cof2/itemFactory.test.mjs`, `scripts/importers/cof2/encounterFactory.mjs`,
  `scripts/importers/cof2/encounterFactory.test.mjs`, `scripts/importers/cof2ImportWizard.mjs`.

---

## 7. Tests attendus

- `node --test` couvre `capacityVariant.test.mjs` (pur), les cas ajoutés dans `itemFactory.test.mjs` et
  `encounterFactory.test.mjs` (mock Foundry minimal).
- `Charge (difficulté 16)` face à `Charge (13)` : `compareTemplateVariant` → `OVERRIDABLE` difficulté 13→16 (AC #1,
  non-régression sur le statut `TEMPLATE_VARIANT` déjà produit par le resolver #5).
- Confirmé côté orchestrateur → item créé avec `saveDifficulty: '16'`, jamais `'13'` silencieux (AC #2).
- `buildDifficultyOverride` ne mute pas l'objet `templateSystemData` reçu (AC #5, testé par référence/deep-equal
  avant/après).
- Paramètre non reconnu → diagnostic `CAPACITY_PARAMETER_MISMATCH` présent, non bloquant (AC #4).
- Non-régression : suite `node --test` existante (`capacityResolver`, `capacityPlan`, `contentHash`, parsing,
  factories) continue de passer sans modification de comportement des modules non touchés.
- Vérification manuelle wizard : écran de comparaison affiché et confirmation requise avant création (AC #3) — pas
  automatisable par `node --test` (rendu `ApplicationV2`), à valider sur l'instance Foundry locale.

---

## 8. Risques et mitigations

- **Risque** : le remplacement texte `difficulté N` dans la description peut toucher plusieurs occurrences ou un
  nombre non lié à la difficulté si la prose du modèle est irrégulière.
  **Mitigation** : remplacement de la première occurrence uniquement, doublé du champ structuré `saveDifficulty`
  comme source de vérité pour le mécanisme (la description reste secondaire, à relire par l'utilisateur avant
  confirmation — d'où l'écran de comparaison de l'AC #3).
- **Risque** : élargir la surcharge automatique à distance/durée sans ancrage structuré fiable produirait des
  variantes fausses avec un faux air de confiance.
  **Mitigation** : scope explicitement limité à la difficulté (§2 Hors scope) ; distance/durée restent détectées et
  signalées, jamais surchargées automatiquement, conformément à l'Epic §17 (« une automatisation partielle mais
  juste est préférable à une automatisation complète mais fausse »).
- **Risque** : régression sur le chemin `TEMPLATE_VARIANT` existant (utilisé aussi par des appelants hors wizard,
  si `cof2Debug.mjs`/autre existe) si `confirmedVariants` n'est pas fourni.
  **Mitigation** : `options` de `createEncounter` optionnel avec défaut `{ confirmedVariants: new Set() }` →
  comportement identique à aujourd'hui (réutilisation + avertissement) quand rien n'est confirmé.

---

## 9. Critères d'arrêt

- Les 5 critères d'acceptation de l'issue #8 sont couverts :
  1. `TEMPLATE_VARIANT` (déjà vrai, régression testée) ;
  2. surcharge de difficulté appliquée à la variante clonée, jamais silencieuse (test `encounterFactory`) ;
  3. écran de comparaison + confirmation dans le wizard (vérification manuelle) ;
  4. `CAPACITY_PARAMETER_MISMATCH` émis pour un paramètre non reconnu (test) ;
  5. `buildDifficultyOverride` ne mute jamais l'objet modèle reçu (test).
- `node --test` passe intégralement (nouvelles suites + suites existantes inchangées).
- Contrat public de `capacityResolver.mjs` (#5) inchangé.

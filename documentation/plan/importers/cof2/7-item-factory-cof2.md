# Plan d'implémentation — Item Factory COF2

**Issue** : [#7 — Story 7 : Item Factory COF2](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/7)
**Epic** : `documentation/cadrage/Epic_Importateur_statblocks_COF2_PDF.md` (§19 « Plan de création », §30 Story 7)
**Bloqué par** : #3 (livré — `EncounterDraft`/diagnostics), #5 (livré — `capacityResolver.mjs`)
**Module(s) impacté(s)** : `scripts/importers/cof2/cof2Adapter.mjs` (nouveau),
`scripts/importers/cof2/itemFactory.mjs` (nouveau), `scripts/importers/cof2/actorFactory.mjs` (nouveau),
`src/importers/cof2/planning/capacityPlan.mjs` (nouveau), `scripts/importers/cof2/encounterFactory.mjs`

---

## 1. Objectif

Séparer la création de documents Foundry COF2 (`encounter`, `attack`, `capacity`) en trois responsabilités
explicites — `ActorFactory`, `ItemFactory`, `Cof2Adapter` — de façon à isoler tout appel spécifique à l'API du
système COF2 (notamment `actor.addCapacity`) dans un seul fichier remplaçable, avec détection de fonctionnalité
systématique, et à rendre chaque factory testable avec un mock Foundry minimal (`node --test`, sans instance
Foundry réelle).

---

## 2. Périmètre

### Inclus

- `Cof2Adapter` (`scripts/importers/cof2/cof2Adapter.mjs`) : seul point d'appel à `actor.addCapacity`, avec garde
  `typeof actor.addCapacity === 'function'` avant tout appel ; renvoie un résultat explicite (succès / non
  supporté) plutôt que de laisser l'appelant deviner.
- `ItemFactory` (`scripts/importers/cof2/itemFactory.mjs`) : construit les données `attack` (bonus, dégâts,
  portée, description, recâblage `source` après création — logique reprise telle quelle de `buildAttackData`
  actuel) et les données `capacity` (nom, description, `learned: true`, métadonnées d'import), réutilisée à la
  fois par le fallback texte seul et par `importLibrary.saveImportedCapacity` (actuellement dupliqué).
- `ActorFactory` (`scripts/importers/cof2/actorFactory.mjs`) : construit les données de l'acteur `encounter`
  (identité, NC, catégorie, taille, caractéristiques, DEF, PV, Init, RD, notes) et l'API de création
  (`Actor.create`), en reprenant tel quel le mapping déjà produit par `statblockParser.mjs` (déjà en vocabulaire
  COF2, pas de nouveau mapping taille/catégorie à ajouter).
- `capacityPlan.mjs` (module pur, `src/importers/cof2/planning/`) : traduit le statut du resolver (#5) et le
  résultat de la bibliothèque d'import (#6) vers le vocabulaire `ImportPlan` de l'Epic §19 —
  `REUSE_OFFICIAL` (`EXACT_REUSE`), `CREATE_FROM_TEMPLATE` (`TEMPLATE_VARIANT`, réutilisation avec avertissement,
  clonage réel restant hors scope — Story 8), `REUSE_IMPORTED` (hash identique en bibliothèque), `CREATE_NEW`
  (aucune correspondance), `MANUAL_REVIEW` (`AMBIGUOUS` officiel, ou variante de nom en bibliothèque à hash
  différent). Fonction pure, testable `node --test`, sans dépendance Foundry ; le parser et le resolver n'en ont
  pas connaissance (ils continuent de renvoyer leurs statuts propres, inchangés).
- Refactor de `encounterFactory.mjs` en orchestrateur : appelle `actorFactory`, `itemFactory`, le resolver #5,
  `importLibrary` #6, `capacityPlan` et `cof2Adapter.addCapacityToActor` (plus d'appel direct
  `actor.addCapacity`).
- Tests `node --test` pour les trois factories et `capacityPlan`, avec un mock Foundry minimal posé sur
  `globalThis` (objets simples : `Actor.create`, `Item.createDocuments`, acteur avec/sans `addCapacity`).

### Hors scope

- Structure `ImportPlan` complète de l'Epic §19 (`actor`/`attacks`/`capacities`/`libraryOperations`/`diagnostics`
  comme objet unique construit puis exécuté) : Story 10 (transaction/rollback/rapport). Cette story se limite à
  un statut par capacité, calculé et consommé immédiatement, pas à un plan affiché puis validé séparément (déjà
  couvert autrement par la preview de Story 4).
- Clonage réel d'une `TEMPLATE_VARIANT` en nouvel objet paramétré (écran de comparaison, création de variante) :
  Story 8, déjà explicitement hors scope dans le plan #5.
- Automatisation mécanique du contenu des capacités (Niveau B/C, §17 de l'Epic).
- Modification du contrat public de `capacityResolver.mjs` (#5) et d'`importLibrary.mjs` (#6) : consommés tels
  quels.

---

## 3. Constat sur l'existant

- `encounterFactory.mjs` construit déjà l'acteur, les attaques et résout les capacités (priorités 1-3, #5 et #6)
  dans un seul fichier ; `buildAttackData` et la construction d'objet `capacity` (texte seul et bibliothèque
  d'import) sont deux implémentations légèrement divergentes du même besoin (dupliquées entre
  `encounterFactory.mjs` et `importLibrary.mjs`).
- `actor.addCapacity(doc, null)` est appelé à deux endroits sans jamais vérifier
  `typeof actor.addCapacity === 'function'` — écart direct avec l'AC #4 de l'issue.
- Le mapping taille/catégorie vers le vocabulaire COF2 est déjà fait dans `statblockParser.mjs`
  (`SIZES`, `category`), donc `Cof2Adapter` n'a pas de mapping supplémentaire à porter sur ce point : son rôle se
  concentre sur `addCapacity` (seul point d'API COF2 non standard identifié dans le code actuel).
- Aucun test n'existe sous `scripts/` aujourd'hui ; les modules Foundry-facing du repo (`encounterFactory.mjs`,
  `importLibrary.mjs`) référencent des globals non importés, ce qui permet de les tester avec de simples objets
  posés sur `globalThis` avant `import()`.

---

## 4. Décisions d'architecture

- `cof2Adapter.mjs` expose `supportsAddCapacity(actor)` et `addCapacityToActor(actor, doc)` :
  - `addCapacityToActor` vérifie `typeof actor.addCapacity === 'function'` ; si absent, renvoie
    `{ ok: false, reason: "unsupported" }` sans lever d'exception (le système COF2 installé n'a pas cette
    méthode) ; sinon appelle `actor.addCapacity(doc, null)` et renvoie `{ ok: true }`.
  - Seul fichier à connaître le nom exact de la méthode COF2 ; un changement de signature côté système COF2 ne
    touche que ce fichier (satisfait l'AC #3 explicitement).
- `itemFactory.mjs` expose `buildAttackItemData(attack)` (repris de `buildAttackData`) et
  `buildCapacityItemData(cap, { reviewMeta })` où `reviewMeta` est optionnel (uniquement pour les items créés en
  bibliothèque d'import, `flags.warbound.*`) — utilisé à la fois pour le fallback texte seul (sans `reviewMeta`)
  et par `importLibrary.saveImportedCapacity` (avec `reviewMeta`), supprimant la duplication actuelle.
- `actorFactory.mjs` expose `buildEncounterActorData(parsed)` (données pures) et `createEncounterActor(parsed)`
  (`Actor.create(buildEncounterActorData(parsed))`), permettant de tester le mapping de données sans mock
  `Actor.create` complexe.
- `capacityPlan.mjs` expose `planCapacityResolution({ resolverStatus, libraryOutcome })` →
  `{ status: "REUSE_OFFICIAL"|"REUSE_IMPORTED"|"CREATE_NEW"|"CREATE_FROM_TEMPLATE"|"MANUAL_REVIEW", ... }`,
  fonction pure de mapping, sans branche Foundry.
- `encounterFactory.mjs` devient un orchestrateur fin : construit l'acteur via `actorFactory`, les attaques via
  `itemFactory` + `createEmbeddedDocuments`, résout chaque capacité (resolver #5 → `capacityPlan` →
  `importLibrary` si nécessaire #6 → `itemFactory` pour les données à créer → `cof2Adapter.addCapacityToActor`
  pour l'ajout à l'acteur), et bascule en texte seul (`createEmbeddedDocuments` direct sur l'acteur, comme
  aujourd'hui pour `AMBIGUOUS`) uniquement quand `addCapacityToActor` renvoie `{ ok: false }` (garde manquante
  aujourd'hui) ou quand la capacité n'a pas de document associable.
- Mock Foundry minimal pour les tests : objets simples (`{ create: async (data) => ({...data, id:"x"}) }` pour
  `Actor`/`Item`, acteur `{ addCapacity: fn }` ou sans la propriété pour tester la garde), posés sur `globalThis`
  avant import dynamique (`await import("./actorFactory.mjs")`) dans chaque fichier de test, retirés après
  (`delete globalThis.Actor`, etc.) pour ne pas polluer les autres suites.

---

## 5. Plan de travail

1. Créer `src/importers/cof2/planning/capacityPlan.mjs` (`planCapacityResolution`) +
   `capacityPlan.test.mjs` (`node --test`) : couvre les 5 statuts, y compris `MANUAL_REVIEW` pour `AMBIGUOUS`
   officiel et pour une variante de bibliothèque à hash différent.
2. Créer `scripts/importers/cof2/cof2Adapter.mjs` + `cof2Adapter.test.mjs` : garde `addCapacity` absente (renvoie
   `{ok:false}`, n'appelle rien), garde présente (appelle avec les bons arguments), mock Foundry minimal.
3. Créer `scripts/importers/cof2/itemFactory.mjs` (extraction de `buildAttackData` + nouvelle
   `buildCapacityItemData`) + `itemFactory.test.mjs` : formes `attack`/`capacity`, présence de `learned: true`,
   présence des `flags.warbound.*` uniquement quand `reviewMeta` est fourni.
4. Créer `scripts/importers/cof2/actorFactory.mjs` (extraction du bloc `Actor.create` actuel) +
   `actorFactory.test.mjs` : mapping des champs `EncounterDraft` → données acteur.
5. Adapter `scripts/importers/cof2/encounterFactory.mjs` : remplacer les constructions inline par les appels aux
   nouvelles factories, remplacer les deux appels directs `actor.addCapacity` par `cof2Adapter.addCapacityToActor`
   avec fallback texte seul si `{ok:false}`, utiliser `capacityPlan` pour choisir la branche de résolution.
   Simplifier `importLibrary.saveImportedCapacity` pour consommer `itemFactory.buildCapacityItemData` au lieu de
   sa propre construction d'objet.
6. Vérification manuelle sur instance Foundry locale (`http://localhost:31000/game`) : réimporter le Centaure,
   confirmer que les attaques sont utilisables depuis la fiche Rencontre et que les capacités apparaissent comme
   apprises.

---

## 6. Fichiers probablement modifiés

- Nouveaux : `src/importers/cof2/planning/capacityPlan.mjs`,
  `src/importers/cof2/planning/capacityPlan.test.mjs`, `scripts/importers/cof2/cof2Adapter.mjs`,
  `scripts/importers/cof2/cof2Adapter.test.mjs`, `scripts/importers/cof2/itemFactory.mjs`,
  `scripts/importers/cof2/itemFactory.test.mjs`, `scripts/importers/cof2/actorFactory.mjs`,
  `scripts/importers/cof2/actorFactory.test.mjs`.
- Modifiés : `scripts/importers/cof2/encounterFactory.mjs`, `scripts/importers/cof2/importLibrary.mjs`.

---

## 7. Tests attendus

- `node --test` couvre `capacityPlan.test.mjs` (pur, sans mock), et `cof2Adapter.test.mjs` /
  `itemFactory.test.mjs` / `actorFactory.test.mjs` (mock Foundry minimal posé sur `globalThis`) — satisfait
  explicitement l'AC « les factories sont testables avec un mock Foundry minimal ».
- Cas garde `addCapacity` : un acteur sans la méthode ne déclenche aucun appel et bascule en texte seul (test
  direct sur `cof2Adapter`, et test d'intégration légère sur `encounterFactory` si simple à mocker en plus des
  factories déjà testées isolément).
- Non-régression : la suite `node --test` existante (`capacityResolver`, `contentHash`, parsing, audit) continue
  de passer sans modification de comportement côté modules purs.

---

## 8. Risques et mitigations

- **Risque** : `actor.addCapacity` peut avoir une signature différente selon la version du système COF2 installée
  (ex. deuxième paramètre optionnel différent).
  **Mitigation** : isolé dans `cof2Adapter.mjs` uniquement ; un changement de signature ne touche qu'un fichier
  (AC explicite de l'issue).
- **Risque** : dupliquer la logique `buildCapacityItemData` entre fallback texte seul et bibliothèque d'import si
  la factorisation est mal faite.
  **Mitigation** : une seule fonction dans `itemFactory.mjs`, paramétrée par `reviewMeta` optionnel, consommée
  par les deux appelants.
- **Risque** : le mock Foundry minimal masque un comportement réel de `Actor.create`/`Item.createDocuments`
  (ex. validation `system.*` par le système COF2 non simulée).
  **Mitigation** : les tests couvrent la forme des données produites (contrat), pas le comportement réel de
  Foundry ; la vérification manuelle (étape 6) reste nécessaire pour la validation fonctionnelle complète.

---

## 9. Critères d'arrêt

- Les 6 critères d'acceptation de l'issue #7 sont couverts : attaques utilisables (vérification manuelle),
  `learned: true` (test `itemFactory`), isolation `Cof2Adapter` (un seul fichier connaît `addCapacity`), garde
  `typeof === 'function'` (test `cof2Adapter`), aucune écriture Foundry depuis parser/resolver (inchangé, déjà
  vrai), factories testables avec mock minimal (suites `node --test` ajoutées).
- `node --test` passe intégralement (nouvelles suites + suites existantes inchangées).
- `capacityResolver.mjs` (#5) et le contrat public d'`importLibrary.mjs` (#6) restent inchangés.

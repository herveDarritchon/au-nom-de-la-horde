# Plan d'implémentation — Couverture de non-régression pour l'import de `Charge`

**Issue** : [#38 — Ajouter une couverture de tests de non-régression pour l'import de `Charge`](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/38)
**Module(s) impacté(s)** : `scripts/importers/cof2/encounterFactory.test.mjs` (nouveau test d'intégration),
`src/importers/cof2/parsing/statblockParser.test.mjs`, `src/importers/cof2/resolution/capacityResolver.test.mjs`,
`src/importers/cof2/resolution/capacityVariant.test.mjs` (aucun changement de code de production attendu)

---

## 1. Objectif

Verrouiller par des tests automatisés le pipeline complet d'import de la capacité `Charge` du Centaure
(extraction → parsing du titre → normalisation → résolution du compendium → interprétation des valeurs), pour
qu'une régression future sur ce cas précis soit détectée immédiatement par `node --test`.

## 2. Périmètre

### Inclus

- Un **test d'intégration bout-en-bout** dans `encounterFactory.test.mjs` : `parseStatblock(fixture("centaure.txt"))`
  → `createEncounter(draft, ...)`, avec un mock de compendium officiel réaliste (entrée exacte `Charge` **et**
  entrée variante `Charge (13)` toutes deux présentes, pour vérifier que l'exact l'emporte de bout en bout — pas
  seulement unitairement). Vérifie les 4 capacités du Centaure (`Attaque double`, `Charge`, `Hybride`, `Discret`)
  et, pour `Charge` spécifiquement : nom `Charge`, `actionType` `L` propagé, aucun item variante créé, aucun
  message `warning` lié à `(L)` ou à un paramètre non reconnu.
- Un audit des tests unitaires existants (parsing, matching, valeurs dérivées) pour confirmer qu'ils couvrent déjà
  les 5 points listés dans l'issue, et combler l'éventuel point faible sans dupliquer ce qui existe.
- Aucune modification du code de production : le constat (§3) montre que les correctifs #35/#36/#37 sont déjà en
  place ; ce ticket est un ticket de verrouillage par les tests, pas de correction.

### Hors scope

- Toute nouvelle fonctionnalité de résolution ou de parsing.
- Les autres capacités du Bestiaire non liées au cas `Charge`/Centaure.
- Le wizard d'import (`cof2ImportWizard.mjs`) et la commande de debug (`cof2Debug.mjs`) : non exercés par ce
  ticket, le point d'entrée testé reste `createEncounter`.

## 3. Constat sur l'existant

Les 5 points « Tests à ajouter » de l'issue sont **déjà couverts unitairement**, répartis dans les corrections
successives des issues #34/#35/#36/#37 :

1. `CHARGE (L)` → `name="Charge"`, `actionType="L"` ; `ATTAQUE DOUBLE (A)` → `name="Attaque double"`,
   `actionType="A"` : déjà verrouillé par
   `statblockParser.test.mjs` (`parseStatblock reproduit le comportement de la macro d'origine sur le Centaure`,
   assertions lignes 54-62) — utilise déjà le fixture réel `__fixtures__/centaure.txt`, texte identique à celui de
   l'issue.
2. `Charge` + candidats `[Charge, Charge (13)]` → sélection de `Charge` : `capacityResolver.test.mjs` (`préfère une
   correspondance exacte à une variante paramétrée au sein de la même source`, ligne 145).
3. `FOR +6` + `difficulté 16` dans le texte de `Charge` → cohérence avec `10 + FOR` : `capacityVariant.test.mjs`
   verrouille `detectParameter("Charge (difficulté 16)") = {kind:"difficulty", value:16}` et
   `compareTemplateVariant("Charge (difficulté 16)", "Charge (13)") = {status:"OVERRIDABLE", from:13, to:16}` — la
   cohérence numérique (16 = 10+6) est un fait de règle du jeu, pas une valeur calculée par le code ; rien à ajouter.
4. `Charge` + plusieurs candidats exacts → résolution déterministe : `capacityResolver.test.mjs` (« tranche un
   doublon exact "Charge" via le dossier prioritaire configuré » / « signale AMBIGUOUS … sans dossier prioritaire
   tranchant », issue #36, lignes 165-184).
5. Aucun test dédié à la formule `10 + FOR` en tant que telle : hors du périmètre du code (c'est une règle COF2 du
   contenu, pas une valeur dérivée par le pipeline d'import) — déjà indirectement couvert par le point 3.

**Ce qui manque réellement** : le **test d'intégration** demandé par l'issue. Tous les tests de
`encounterFactory.test.mjs` qui exercent `Charge` (lignes 78-475) construisent un `EncounterDraft.capacities` à la
main (`{ rawName: "Charge (difficulté 16)", name: "Charge", ... }`) — aucun ne fait réellement transiter le texte
brut du statblock par `parseStatblock` avant `createEncounter`. Le point de jonction parsing → résolution →
création d'items n'est donc jamais exercé ensemble pour ce cas, alors que c'est précisément le risque de
régression visé par l'issue (ex. un futur changement dans `matchTitle`/`extractActionType` qui casserait
silencieusement la forme attendue par le resolver, sans qu'aucun test actuel ne le détecte).

`actorFactory.test.mjs` et `encounterFactory.test.mjs` utilisent par ailleurs un `Centaure` synthétique différent
du fixture réel (`nc: 4`, `hp: 45` au lieu de `nc: 3`, `hp: 30`) : aucun lien avec `__fixtures__/centaure.txt`
aujourd'hui.

## 4. Décisions d'architecture

- Le nouveau test d'intégration vit dans `scripts/importers/cof2/encounterFactory.test.mjs` (déjà le point
  d'entrée `createEncounter`, déjà les mocks Foundry `setupFoundryMocks`), pas dans un nouveau fichier : cohérent
  avec l'organisation existante (côté orchestration Foundry, pas côté `src/` pur).
- Réutilisation du fixture réel `src/importers/cof2/parsing/__fixtures__/centaure.txt` (déjà utilisé par
  `statblockParser.test.mjs`), importé via le même mécanisme `readFileSync`/`fileURLToPath` — pas de duplication de
  texte de statblock en dur.
- Le mock de compendium officiel (`setupFoundryMocks`) est étendu **pour ce test uniquement** (pas de changement
  du mock partagé par défaut, pour ne pas modifier le comportement des tests existants) : `getIndex` renvoie à la
  fois `Charge` (entrée exacte, formule dynamique) et `Charge (13)` (variante paramétrée, présente pour prouver
  qu'elle n'est jamais choisie par erreur), plus des entrées passe-plat pour `Attaque double`, `Hybride`, `Discret`
  afin que ces capacités se résolvent en `NOT_FOUND` → `CREATE_NEW` sans bruit parasite non lié à `Charge`.
- Pas de nouvelle fonction utilitaire : le test compose directement `parseStatblock` (import depuis
  `../../../src/importers/cof2/index.mjs` ou `parsing/statblockParser.mjs`, à aligner avec ce qu'exporte déjà
  `src/importers/cof2/index.mjs`) et `createEncounter`, suivant le style déjà en place dans ce fichier de test.

## 5. Plan de travail

1. Vérifier ce qu'exporte `src/importers/cof2/index.mjs` (probable ré-export de `parseStatblock`) pour choisir
   l'import le plus direct dans le test.
2. Dans `encounterFactory.test.mjs`, ajouter un chargement du fixture réel (`readFileSync` +
   `fileURLToPath(import.meta.url)`, chemin vers `../../../src/importers/cof2/parsing/__fixtures__/centaure.txt`),
   à côté des imports existants.
3. Ajouter un test `"createEncounter importe le statblock complet du Centaure (issue #38) : Charge résolue en
   EXACT_REUSE, actionType L propagé, aucune variante créée"` :
   - construit un mock de compendium officiel dédié (voir §4) via une variante locale de `setupFoundryMocks` ou un
     mock ad hoc suivant le même patron ;
   - `const draft = parseStatblock(centaureFixtureText);`
   - `const { report } = await createEncounter(draft);`
   - assertions :
     - les 4 capacités attendues apparaissent dans le rapport ou dans les items/capacités ajoutés
       (`Attaque double`, `Charge`, `Hybride`, `Discret`) ;
     - `addedCapacities` (ou équivalent) contient l'entrée officielle exacte `Charge`, jamais `Charge (13)` ;
     - `createdItems` ne contient aucun item nommé `Charge` issu d'une variante (`buildCapacityVariantItemData`
       non déclenché pour ce cas) ;
     - aucun message `report.messages` de niveau `warning` ne mentionne `(L)` ni `paramètre` pour `Charge`.
4. Lancer `node --test` pour confirmer que le nouveau test passe et qu'aucune suite existante ne régresse.
5. Ne modifier aucun autre fichier de production : ce ticket est un ticket de test uniquement, conformément aux
   critères d'acceptation de l'issue (« Les tests reproduisent le bug avant correction » ne s'applique plus ici
   puisque le bug est déjà corrigé sur cette branche — l'objectif est le verrouillage, pas la reproduction).

## 6. Fichiers probablement modifiés

- `scripts/importers/cof2/encounterFactory.test.mjs` (seul fichier modifié)

## 7. Tests attendus

- Nouveau test d'intégration (§5, point 3) : passe sur l'état actuel du code (post #35/#36/#37) et échouerait sur
  l'état pré-#37 (nom `Charge (13)` au lieu de `Charge`) ou pré-#35 (résolution en `TEMPLATE_VARIANT` au lieu
  d'`EXACT_REUSE` malgré une entrée exacte disponible) — à vérifier manuellement en stashant temporairement le
  fix si un doute subsiste, sans committer ce stash.
- `node --test` passe intégralement (suite complète, `src/` et `scripts/`).

## 8. Risques et mitigations

- **Risque** : le mock de compendium étendu introduit une divergence de comportement avec les autres tests du même
  fichier si `setupFoundryMocks` par défaut est modifié par erreur.
  **Mitigation** : le nouveau mock est local au nouveau test (fonction dédiée ou objet `game.packs` construit
  inline), `setupFoundryMocks` par défaut reste inchangé.
- **Risque** : le format exact du fixture `centaure.txt` diverge légèrement du texte cité dans l'issue (ex. `test
  de FOR difficulté 16 ou est renversée` vs `doit faire un test de FOR difficulté 16 ou être renversée`) — la
  reformulation ne change aucune assertion attendue (le parsing ne dépend pas de cette formulation précise), donc
  sans impact sur le test, mais à noter si le test échoue de façon inattendue.

## 9. Critères d'arrêt

- Le test d'intégration bout-en-bout (parsing réel → création Foundry) existe et passe, couvrant explicitement :
  `Charge` résolue en `EXACT_REUSE`, `actionType="L"` propagé sans déclencher `CAPACITY_PARAMETER_MISMATCH`,
  aucune capacité `Charge` dupliquée créée, aucune association erronée à `Charge (13)`.
- Les 5 points unitaires de l'issue restent couverts (déjà le cas, confirmé §3) — aucune régression de couverture.
- `node --test` passe intégralement.

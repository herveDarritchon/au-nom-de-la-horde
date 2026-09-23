# Plan d'implémentation — Résoudre une capacité exacte avant de rechercher ses variantes paramétrées

**Issue** : [#35 — Résoudre une capacité exacte avant de rechercher ses variantes paramétrées](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/35)
**Module(s) impacté(s)** : `src/importers/cof2/resolution/capacityResolver.mjs`, `src/importers/cof2/resolution/capacityResolver.test.mjs`

---

## 1. Objectif

Empêcher qu'une variante paramétrée d'une source (ex. `Charge (13)` dans les compendiums Warbound) soit choisie
avant une correspondance **exacte** disponible dans une autre source (ex. `Charge` dans les compendiums officiels
COF2), en corrigant l'ordre de priorité de `makeCapacityResolver`.

---

## 2. Périmètre

### Inclus

- Réordonner les étapes de résolution dans `makeCapacityResolver` (`capacityResolver.mjs`) pour que **toutes** les
  correspondances exactes (Warbound puis officiel COF2) soient évaluées avant **toute** correspondance en variante
  paramétrée (Warbound puis officiel COF2).
- Nouveau test de non-régression reproduisant le cas de l'issue : une entrée exacte `Charge` dans une source doit
  l'emporter sur une entrée variante `Charge (13)` d'une autre source, même si cette dernière est dans la source
  prioritaire (Warbound).
- Vérifier que le comportement « exact avant variante » au sein d'une même source (déjà correct aujourd'hui, via
  `buildIndex`/`exact` puis `loose`) reste couvert par un test explicite.

### Hors scope

- Toute modification de `capacityVariant.mjs` (`detectParameter`/`compareTemplateVariant`) : ce module n'est
  invoqué par `encounterFactory.mjs` que pour un statut `TEMPLATE_VARIANT` ; une fois la résolution exacte
  correctement priorisée, il n'est simplement plus appelé pour ces cas — inchangé.
- Ajout de données de compendium (ex. entrée `Charge` exacte pour le Centaure) : le monstre concerné provient d'un
  module externe (`systems/co2`), hors de ce dépôt ; la disparition du warning pour le Centaure découle de la
  correction de logique, pas d'une modification de données locales.
- Toute modification de la logique d'homonymie (`pickAmongCandidates`, `AMBIGUOUS`) : inchangée.

---

## 3. Constat sur l'existant

- `makeCapacityResolver` (`capacityResolver.mjs:71-114`) résout dans cet ordre :
  1. `warbound.exact`
  2. `warbound.loose` (variante paramétrée)
  3. `official.exact`
  4. `official.loose` (variante paramétrée)
  5. `imported.exact`
- L'étape 2 (`warbound.loose`) est évaluée **avant** l'étape 3 (`official.exact`). Si une capacité existe en
  correspondance exacte côté officiel COF2 (`Charge`) et qu'une variante paramétrée du même nom existe côté
  Warbound (`Charge (13)`), le resolver renvoie à tort `TEMPLATE_VARIANT` (Warbound) au lieu de `EXACT_REUSE`
  (officiel).
- `encounterFactory.mjs:251` n'appelle `compareTemplateVariant` que pour un statut `TEMPLATE_VARIANT`
  (`encounterFactory.mjs:334`) ; c'est cet appel erroné, sur une entrée qui aurait dû être `EXACT_REUSE`, qui
  produit le warning `« Charge » : variante de « Charge (13) » du compendium, vérifier le paramètre.`
- Au sein d'une même source, l'ordre est déjà correct (`exact` avant `loose` dans `buildIndex`), mais aucun test
  actuel ne verrouille explicitement ce cas avec une entrée exacte et une entrée variante coexistant pour le même
  nom de base dans la même source.
- Aucun test actuel ne couvre le cas croisé (variante prioritaire vs exacte non-prioritaire) qui est le cœur du bug
  de l'issue #35.

---

## 4. Décisions d'architecture

- Réordonnancement pur, sans changement de contrat : `makeCapacityResolver` garde la même signature et les mêmes
  statuts (`EXACT_REUSE`, `TEMPLATE_VARIANT`, `REUSE_IMPORTED`, `AMBIGUOUS`, `NOT_FOUND`).
- Nouvel ordre de résolution :
  1. `warbound.exact`
  2. `official.exact`
  3. `warbound.loose` (variante paramétrée)
  4. `official.loose` (variante paramétrée)
  5. `imported.exact`
- Ce nouvel ordre respecte les deux règles métier en vigueur simultanément :
  - issue #32 : Warbound reste prioritaire sur l'officiel COF2, **à niveau de correspondance égal** (exact vs
    exact, variante vs variante) ;
  - issue #35 : une correspondance exacte (toutes sources confondues) est toujours prioritaire sur une variante
    paramétrée (toutes sources confondues).
- La bibliothèque d'import du monde (`imported`) n'a pas de niveau « variante » — elle reste en dernière position,
  inchangée.

---

## 5. Plan de travail

1. Dans `capacityResolver.mjs`, permuter les blocs « Priorité 2 » (`warbound.loose`) et « Priorité 3 »
   (`official.exact`) de `makeCapacityResolver`, en renumérotant les commentaires de priorité (1 à 6) pour refléter
   le nouvel ordre.
2. Ajouter dans `capacityResolver.test.mjs` un test reproduisant le cas de l'issue : `officialEntries` contient une
   entrée exacte `Charge`, `warboundEntries` contient une entrée variante `Charge (13)` ; `resolve("Charge")` doit
   renvoyer `EXACT_REUSE` (source `cof2`), jamais `TEMPLATE_VARIANT` (source `warbound`).
3. Ajouter un test verrouillant le cas intra-source (déjà correct) : une même source contient à la fois `Charge`
   (exact) et `Charge (13)` (variante) ; `resolve("Charge")` doit renvoyer `EXACT_REUSE`, `resolve("Charge (16)")`
   doit renvoyer `TEMPLATE_VARIANT`.
4. Relire les tests existants (lignes 91-130 de `capacityResolver.test.mjs`, issue #32) pour confirmer qu'aucun ne
   dépend de l'ancien ordre (aucun ne mélange variante Warbound + exact officiel concurrents) — non-régression
   attendue sans modification de ces tests.
5. Lancer `node --test` pour vérifier la non-régression complète (`capacityResolver`, `capacityVariant`,
   `encounterFactory`, `attackTypeResolver`).

---

## 6. Fichiers probablement modifiés

- `src/importers/cof2/resolution/capacityResolver.mjs`
- `src/importers/cof2/resolution/capacityResolver.test.mjs`

---

## 7. Tests attendus

- `resolve("Charge")` avec `Charge` exact en officiel + `Charge (13)` variante en Warbound → `EXACT_REUSE`
  (source `cof2`), jamais `TEMPLATE_VARIANT` (source `warbound`).
- `resolve("Charge")` avec `Charge` exact et `Charge (13)` variante dans la **même** source → `EXACT_REUSE`.
- `resolve("Charge (16)")` dans ce même jeu de données → `TEMPLATE_VARIANT` (le paramètre reste résolu en variante
  quand aucune entrée exacte ne correspond au nom demandé).
- Non-régression : tous les tests existants de `capacityResolver.test.mjs` (issues #5, #32) passent sans
  modification de leurs assertions.
- Non-régression : `capacityVariant.test.mjs` et `encounterFactory.test.mjs` passent sans modification (aucun
  changement de contrat côté `compareTemplateVariant`).
- `node --test` passe intégralement.

---

## 8. Risques et mitigations

- **Risque** : inverser l'ordre pourrait faire perdre la priorité Warbound sur l'officiel dans un cas où seule une
  variante Warbound existe (aucune entrée officielle du tout).
  **Mitigation** : le nouvel ordre place `warbound.loose` avant `official.loose` (priorité 3 avant 4) — la
  priorité Warbound est préservée à niveau de correspondance égal ; seul l'ordre entre niveaux différents
  (exact vs variante) change. Couvert par les tests existants de l'issue #32 (non modifiés).
- **Risque** : un faux sentiment de complétude si le cas concret du Centaure n'est pas re-testable dans ce dépôt
  (monstre hors compendiums locaux).
  **Mitigation** : le test ajouté (§5.2) reproduit fidèlement la structure du bug (variante prioritaire vs exacte
  non-prioritaire) indépendamment des données réelles du Centaure ; la correction de logique est suffisante pour
  satisfaire le critère d'acceptation dès lors que l'entrée `Charge` exacte existe dans la source consultée à
  l'exécution.

---

## 9. Critères d'arrêt

- Les critères d'acceptation de l'issue #35 sont couverts par la logique :
  1. `Charge` sélectionne prioritairement une entrée nommée exactement `Charge`, quelle que soit la source qui la
     porte (testé) ;
  2. `Charge (13)` n'est pas sélectionnée tant qu'une correspondance exacte `Charge` existe, même si `Charge (13)`
     est dans la source prioritaire Warbound (testé — cœur du bug) ;
  3. l'insensibilité à la casse et la normalisation espaces/ponctuation restent inchangées (`normalize`, non
     modifié) ;
  4. les variantes paramétrées restent utilisables en l'absence de capacité exacte (testé, non-régression) ;
  5. le warning `« Charge » : variante de « Charge (13) » du compendium` ne peut plus être déclenché par ce
     scénario, car `encounterFactory.mjs` ne reçoit plus `TEMPLATE_VARIANT` dans ce cas (conséquence directe du
     fix, non testable directement sur le Centaure dans ce dépôt — cf. §8).
- `node --test` passe intégralement (nouveaux cas + suites existantes inchangées).
- Contrat public de `capacityResolver.mjs` inchangé (mêmes signatures exportées : `normalize`, `stripParens`,
  `extractActionType`, `makeCapacityResolver`).

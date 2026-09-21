# Plan d'implémentation — Extraire la macro en moteur testable

**Issue** : [#1 — Story 1 : Extraire la macro en moteur testable](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/1)
**Epic** : `documentation/cadrage/Epic_Importateur_statblocks_COF2_PDF.md`
**ADR** : aucune (pas d'ADR dans le dépôt pour l'instant)
**Module(s) impacté(s)** : `src/importers/cof2/parsing/*.mjs` (nouveaux), `scripts/warbound.mjs` ou nouveau fichier debug, `package.json`

---

## 1. Objectif

Sortir les fonctions de parsing pur (`parseStatblock`, `parseAttackLine`, `matchTitle`, `makeCapacityMatcher` et
leurs helpers) de la macro Foundry actuelle vers des modules JavaScript dédiés sous `src/importers/cof2/`, sans
appel à l'API Foundry (`game`, `Actor`, `Item`, `foundry.*`) et exécutables/testables sous Node.js pur. Conserver
une commande de debug qui reproduit exactement le comportement observable de la macro d'origine.

Aucune nouvelle fonctionnalité de parsing n'est ajoutée à ce stade : c'est un refactor de séparation des
responsabilités, base des stories suivantes de l'Epic.

---

## 2. Périmètre

### Inclus

- Extraction du code de parsing pur de la macro actuelle (fournie par l'utilisateur, non committée dans le dépôt)
  vers des modules ESM sous `src/importers/cof2/parsing/`.
- Séparation stricte : aucun appel Foundry dans les modules de parsing.
- Fixture de test basée sur le cas Centaure (déjà documenté dans l'Epic, section 22).
- Test unitaire Node reproduisant le comportement actuel du parseur sur cette fixture.
- Conservation d'une commande de debug (macro ou commande console) qui recrée le comportement de la macro
  d'origine (prompt, parsing, création d'acteur `encounter`, warnings/errors) en s'appuyant sur les modules extraits.
- Ajout d'un script `test` dans `package.json` (aucun runner de test n'existe actuellement dans le dépôt).

### Hors scope

- Normalisation Unicode avancée, nettoyage de bruit PDF, réparation de césure, segmentation logique multi-lignes
  (Story 2).
- Modèle intermédiaire `EncounterDraft`/diagnostics codés (Story 3).
- Nouvelle UI de preview/wizard (Story 4).
- Resolver multi-compendium, bibliothèque d'objets importés, item factory (Stories 5 à 10).
- Toute amélioration du taux de reconnaissance du parseur : le comportement doit rester identique à l'existant,
  y compris ses limites connues (ex. attaques coupées sur plusieurs lignes toujours non reconnues à ce stade).

---

## 3. Constat sur l'existant

La macro actuelle (script Foundry de type "Script", non committée dans le dépôt — code fourni par l'utilisateur
via clarification) mélange dans un seul fichier :

- **Parsing pur** : `parseStatblock`, `parseAttackLine`, `matchTitle`, `makeCapacityMatcher`, ainsi que les helpers
  `tidyCase`, `cleanName`, `toSigned`, `normalize`, `stripParens`, et les constantes/regex associées
  (`ABILITIES`, `SIZES`, `NC_LINE_RE`, `ABILITY_RE`, `DEF_RE`, `HP_RE`, `INIT_RE`, `ATTACK_RE`, `DAMAGE_RE`,
  `TITLE_RE`, `ACRONYMS`).
- **Code Foundry** : `buildCapacityResolver` (accès `game.packs`), `buildAttackData`/`createEncounter`
  (`Actor.create`, `actor.createEmbeddedDocuments`, `actor.addCapacity`), et `main` (`DialogV2.prompt`,
  `ui.notifications`).
- Un mécanisme de double exécution déjà présent : `if (typeof game === "undefined") module.exports = {...}
  else main()` — la macro expose déjà `parseStatblock`, `parseAttackLine`, `matchTitle`, `makeCapacityMatcher`
  pour des tests Node, mais uniquement en export CommonJS ad hoc dans le même fichier que le code Foundry.

Le module n'utilise aucun bundler : `scripts/warbound.mjs` est chargé directement par le navigateur comme ES
module natif (`module.json` → `"esmodules": ["scripts/warbound.mjs"]`). Un nouveau dossier `src/importers/cof2/`
en `.mjs` est donc importable tel quel côté navigateur (import relatif) et côté Node, sans étape de build.

Aucun runner de test n'est configuré (`package.json` n'a ni script `test` ni devDependency de test).

---

## 4. Décisions d'architecture

- **Modules purs** sous `src/importers/cof2/parsing/` :
  - `textUtils.mjs` — `tidyCase`, `cleanName`, `toSigned`.
  - `capacityMatcher.mjs` — `normalize`, `stripParens`, `makeCapacityMatcher`.
  - `statblockParser.mjs` — `parseStatblock`, `parseAttackLine`, `matchTitle`, constantes `ABILITIES`, `SIZES`,
    `ACRONYMS` et les regex de reconnaissance ; importe `textUtils.mjs`.
  - Ces trois fichiers n'importent et n'utilisent **jamais** `game`, `Actor`, `Item`, `foundry.*`, `ui.*`.
- **Barrel** `src/importers/cof2/index.mjs` réexportant les fonctions publiques, pour simplifier l'import côté
  commande de debug et côté tests.
- **Code Foundry** (résolution de compendium, construction des documents, dialogues) reste dans le module Foundry
  — `scripts/warbound.mjs` ou un nouveau fichier `scripts/importers/cof2Debug.mjs` — qui importe les fonctions
  pures depuis `src/importers/cof2/index.mjs`. `buildCapacityResolver`, `buildAttackData`, `createEncounter`,
  `main` restent tels quels dans leur logique, seule leur dépendance au parsing change (import au lieu de
  définition locale).
- **Commande de debug** : garder un point d'entrée équivalent à la macro actuelle (même prompt `DialogV2`, même
  création d'acteur `encounter`, mêmes warnings/errors affichés) — comportement observable inchangé pour le MJ.
  Le nom exact et le mode d'exposition (macro world recréée à partir du fichier extrait, ou commande console via
  le module) sont laissés à l'implémentation, tant que le comportement reste identique.
- **Runner de test** : `node --test` (runner natif Node ≥ 18) avec `node:assert/strict`, pas de nouvelle
  dépendance — cohérent avec l'exigence "Node.js pur" de l'issue. Ajout de `"test": "node --test"` dans
  `package.json`.

---

## 5. Plan de travail

1. Créer `src/importers/cof2/parsing/textUtils.mjs`, `capacityMatcher.mjs`, `statblockParser.mjs` à partir du
   code de la macro fournie, sans changement de logique (copie/déplacement, adaptation des imports uniquement).
2. Créer `src/importers/cof2/index.mjs` réexportant `parseStatblock`, `parseAttackLine`, `matchTitle`,
   `makeCapacityMatcher`.
3. Créer une fixture Centaure (texte source du statblock, section 22 de l'Epic) sous
   `src/importers/cof2/parsing/__fixtures__/centaure.txt` (ou emplacement équivalent au choix de l'implémentation,
   tant qu'il est versionné et référencé par le test).
4. Écrire `src/importers/cof2/parsing/statblockParser.test.mjs` (`node --test`) qui appelle `parseStatblock` sur
   la fixture et vérifie : nom, NC, caractéristiques (7 valeurs + dé bonus), DEF/PV/Init, nombre d'attaques et de
   capacités reconnues, ainsi que les warnings/errors produits par la version actuelle du parseur (y compris ses
   limites connues, ex. attaques coupées sur plusieurs lignes toujours en warning à ce stade).
5. Ajouter `"test": "node --test"` dans les `scripts` de `package.json`.
6. Adapter le point d'entrée Foundry (`scripts/warbound.mjs` ou nouveau fichier dédié) pour importer les fonctions
   pures et reproduire `buildCapacityResolver`/`createEncounter`/`main` à l'identique du point de vue MJ.
7. Vérifier par relecture qu'aucun identifiant Foundry (`game`, `Actor`, `Item`, `foundry`, `ui`, `CONST`,
   `DialogV2`) n'apparaît dans `src/importers/cof2/parsing/`.

---

## 6. Fichiers probablement modifiés

- Nouveaux : `src/importers/cof2/parsing/textUtils.mjs`, `src/importers/cof2/parsing/capacityMatcher.mjs`,
  `src/importers/cof2/parsing/statblockParser.mjs`, `src/importers/cof2/parsing/statblockParser.test.mjs`,
  `src/importers/cof2/parsing/__fixtures__/centaure.txt`, `src/importers/cof2/index.mjs`.
- Modifiés : `package.json` (script `test`), `scripts/warbound.mjs` (ou nouveau fichier de commande de debug).

---

## 7. Tests attendus

- `node --test` exécute `statblockParser.test.mjs` sans dépendance Foundry.
- Le test sur la fixture Centaure vérifie : 3 attaques reconnues (Sabots, Épée longue, Arc long — telles que le
  parseur actuel les reconnaît, sans la reconstruction multi-lignes qui arrive en Story 2), les 7 caractéristiques
  avec dé bonus, DEF 15, PV 30, Init 14, et le nombre de capacités/warnings identique à ce que produirait la macro
  d'origine sur ce texte.
- Aucune régression : si la macro actuelle produit des warnings sur ce cas (ex. lignes `DM ...` non reconnues),
  le test documente ce comportement existant plutôt que de le corriger — la correction appartient à la Story 2.

---

## 8. Risques et mitigations

- **Risque** : introduire une différence de comportement en coupant le fichier en modules (ex. ordre
  d'évaluation des regex, portée des constantes).
  **Mitigation** : test de non-régression sur la fixture Centaure comparant explicitement les valeurs attendues
  documentées dans l'Epic (section 22) et validées manuellement contre la macro d'origine.
- **Risque** : la commande de debug diverge du comportement UX de la macro d'origine (dialogues, warnings
  affichés).
  **Mitigation** : reprendre le code Foundry (`createEncounter`, `main`) tel quel, seul le point d'import du
  parsing change.

---

## 9. Critères d'arrêt

- Les fonctions de parsing sont importables et exécutables dans Node.js sans environnement Foundry
  (`node --test` passe sans mock Foundry).
- Le test Centaure reproduit le comportement actuel de la macro (attaques, capacités, warnings/errors identiques).
- Tous les tests existants passent (aucun autre test dans le dépôt à ce jour).
- Aucun appel direct à `game`, `Actor`, `Item` ou toute autre API Foundry ne subsiste dans
  `src/importers/cof2/parsing/`.
- Une commande de debug permet de reproduire exactement le résultat de la macro originale.

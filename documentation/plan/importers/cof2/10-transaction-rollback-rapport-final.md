# Plan d'implémentation — Transaction, rollback et rapport final

**Issue** : [#10 — Story 10 : Transaction, rollback et rapport final](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/10)
**Epic** : `documentation/cadrage/Epic_Importateur_statblocks_COF2_PDF.md` (§19 « Plan de création », §20
« Transaction et rollback »)
**Bloqué par** : #7 (livré — `itemFactory.mjs`/`actorFactory.mjs`/`cof2Adapter.mjs`)
**Module(s) impacté(s)** : `scripts/importers/cof2/encounterFactory.mjs`,
`src/importers/cof2/parsing/encounterDraft.mjs`, `src/importers/cof2/index.mjs`,
`scripts/importers/cof2ImportWizard.mjs`, `scripts/importers/cof2Debug.mjs`

---

## 1. Objectif

Garantir qu'une erreur survenant pendant l'écriture Foundry d'un import COF2 (acteur, attaques, capacités,
bibliothèque d'import) ne laisse jamais un acteur `encounter` à moitié créé et inutilisable. Séparer explicitement
la résolution en lecture seule (déjà en place, §14/§15) de l'exécution des écritures (annulable), et produire un
rapport final avec des compteurs explicites, consommé par le wizard et la commande de debug.

---

## 2. Périmètre

### Inclus

- Suivi de tous les documents Foundry créés pendant une exécution (`Actor.create`, `createEmbeddedDocuments`,
  `saveImportedCapacity` en bibliothèque monde) pour permettre un rollback complet.
- Rollback automatique (suppression, ordre inverse de création) dès qu'une erreur critique interrompt la séquence
  d'écriture décrite par l'issue (acteur → attaques → capacités → attachement → bibliothèque).
- Si le rollback automatique échoue lui-même : renvoyer l'acteur partiel plutôt que masquer l'échec, avec un
  diagnostic dédié, pour que l'UI propose la suppression manuelle.
- Rapport final structuré avec compteurs explicites : attaques créées, capacités réutilisées, capacités créées,
  erreurs, éléments à vérifier — consommé par `cof2ImportWizard.mjs#renderResult` et affiché par `cof2Debug.mjs`.
- Deux nouveaux codes diagnostic (même vocabulaire que `encounterDraft.mjs`) pour tracer la cause précise d'un
  échec d'écriture et d'un échec de rollback, avec le fragment concerné (nom de l'item en cours).
- Réglage Foundry (`game.settings.register`) pour activer des logs de debug détaillés (code diagnostic + fragment
  à chaque étape d'écriture) sans modification de code.

### Hors scope

- Modification du contrat public de `capacityResolver.mjs` (#5), `capacityPlan.mjs` (#7) ou `importLibrary.mjs`
  (#6) : consommés tels quels, aucune écriture supplémentaire dans le pack officiel `cof2-base`.
- Structure `ImportPlan` complète de l'Epic §19 affichée et validée comme écran dédié avant création : la
  prévisualisation existante (Story 4, `cof2ImportWizard.mjs#renderPreview`) joue déjà ce rôle côté résolution
  officielle ; cette story ajoute uniquement la séparation lecture/écriture nécessaire au rollback, pas un nouvel
  écran de confirmation.
- Transactionnalité multi-utilisateurs ou concurrente (plusieurs imports simultanés) : hors périmètre d'un import
  MJ local.
- Automatisation mécanique du contenu des capacités (Niveau B/C, §17) : déjà traité par la Story 9, non concerné
  ici.

---

## 3. Constat sur l'existant

- `createEncounter` (`encounterFactory.mjs:97-141`) crée déjà l'acteur (`createEncounterActor`), les attaques
  (`actor.createEmbeddedDocuments`), puis résout les capacités (officiel priorités 1-2, bibliothèque d'import
  priorité 3 via `resolveViaImportLibrary`) et les attache (`addResolvedCapacity` → `cof2Adapter.addCapacityToActor`)
  — mais ne conserve la trace d'aucun document créé : aucun rollback n'est possible aujourd'hui.
- Aucun `try/catch` n'entoure la séquence d'écriture dans `createEncounter` : une exception milieu de parcours
  (ex. `createEmbeddedDocuments` qui échoue sur une capacité) remonte telle quelle jusqu'à l'appelant, avec
  l'acteur déjà créé en base et jamais nettoyé.
- Côté appelants, seul un filet de sécurité UI existe : `cof2ImportWizard.mjs#create()` (`try { … } catch (err) {
  this.#result = { error: err.message } }`, lignes ~347-357) et `cof2Debug.mjs#importStatblockFromPrompt`
  (`catch (err) { console.error(err); ui.notifications.error(...) }`) — aucun des deux ne supprime ni ne signale
  les documents déjà créés.
- Le rapport actuel (`cof2ImportWizard.mjs#renderResult`, lignes ~296-315) calcule `created = draft.attacks.length`
  (nombre d'attaques *du draft*, pas celles réellement créées) et `toReview = warnings.length` — pas de distinction
  entre capacités réutilisées et créées, pas de compteur d'erreurs : ne satisfait pas l'AC « compteurs : attaques
  créées, capacités réutilisées, capacités créées, erreurs, éléments à vérifier ».
- `src/importers/cof2/parsing/encounterDraft.mjs` définit déjà le vocabulaire diagnostic réutilisable tel quel :
  `diagnostic(severity, code, message, fragment)` (ligne 79) et plusieurs constructeurs (`ambiguousCapacity`,
  `capacityParameterMismatch`, `unsupportedAutomation`, etc.) — aucun code n'existe encore pour un échec
  d'écriture Foundry ni pour un échec de rollback.
- Aucun `game.settings.register` n'existe dans le module (seul `game.settings.registerMenu` est utilisé, pour
  ouvrir le wizard, `cof2ImportWizard.mjs:406`) : pas de mécanisme de toggle de logs sans changement de code.
- `saveImportedCapacity` (`importLibrary.mjs:65-70`) crée un document dans un compendium **monde**
  (`Item.createDocuments([data], { pack: pack.collection })`) — ce doit être suivi comme les autres documents créés
  pour le rollback, même s'il vit dans un pack distinct de l'acteur.

---

## 4. Décisions d'architecture

- `createEncounter(parsed, options)` reste la façade publique inchangée pour les appelants (`cof2Debug.mjs`,
  `cof2ImportWizard.mjs`), mais son corps est réorganisé en deux phases internes explicites :
  - **Résolution** (inchangée dans son contenu, déjà en lecture seule : `buildCapacityResolver`,
    `resolver.resolve`, `resolveViaImportLibrary` lit par hash avant de créer) — seule
    `resolveViaImportLibrary` crée déjà un document en bibliothèque lors d'un `CREATE_NEW`/`MANUAL_REVIEW` ; ce
    point d'écriture est déplacé dans la phase d'exécution suivante (voir plus bas), pas supprimé.
  - **Exécution suivie** : chaque écriture Foundry (acteur, attaques, capacité en bibliothèque, attachement à
    l'acteur) est enregistrée dans un accumulateur `createdDocs: {actor?:Actor, items:{parent:Actor|CompendiumCollection, id:string}[]}`
    au fur et à mesure. Toute la séquence est enveloppée dans un `try/catch` unique.
- En cas d'exception pendant l'exécution :
  1. construire un diagnostic `importWriteFailed(fragment, message)` (code `IMPORT_WRITE_FAILED`, sévérité
     `error`, `fragment` = nom de l'attaque/capacité/acteur en cours) ;
  2. tenter le rollback : supprimer les documents de `createdDocs` en ordre inverse (`Item.deleteDocuments`/
     `actor.delete()` selon le type) ;
  3. si le rollback réussit intégralement → renvoyer `{ actor: null, report }` avec le diagnostic
     `IMPORT_WRITE_FAILED` dans `report.diagnostics`, aucun document résiduel ;
  4. si une suppression échoue à son tour → ajouter un second diagnostic `importRollbackFailed(fragment, message)`
     (code `IMPORT_ROLLBACK_FAILED`, sévérité `error`) et renvoyer `{ actor: <partiel>, report }` pour que l'UI
     propose explicitement la suppression manuelle (bouton dédié, voir plus bas) plutôt que de masquer l'échec.
- Nouveaux constructeurs diagnostic ajoutés à `src/importers/cof2/parsing/encounterDraft.mjs` (même famille que
  les codes existants, même signature `diagnostic(severity, code, message, fragment)`), réexportés par
  `src/importers/cof2/index.mjs` : `importWriteFailed(fragment, message)`, `importRollbackFailed(fragment, message)`.
- Rapport final structuré, remplaçant le comptage approximatif actuel :
  ```
  ImportReport = {
    counts: { attacksCreated, capacitiesReused, capacitiesCreated, errors, toReview },
    warnings: string[],       // inchangé dans sa forme (messages lisibles MJ), alimenté comme aujourd'hui
    diagnostics: Diagnostic[] // nouveaux codes d'écriture inclus, en plus des diagnostics de parsing existants
  }
  ```
  `createEncounter` retourne désormais `{ actor, report }` (au lieu de `{ actor, warnings }`) ; `report.warnings`
  reprend le contenu actuel de `warnings` pour ne pas casser l'affichage textuel existant, `report.counts` est
  calculé en comptant les branches effectivement empruntées dans la boucle de résolution (`EXACT_REUSE`/
  `TEMPLATE_VARIANT`/`REUSE_IMPORTED` → `capacitiesReused`, `CREATE_NEW`/variante → `capacitiesCreated`, chaque
  `warnings.push` de type erreur → `errors`, chaque avertissement restant → `toReview`).
- `cof2ImportWizard.mjs#renderResult` consomme `report.counts` directement au lieu de recalculer depuis
  `draft.attacks.length`/`warnings.length` ; si `actor` est `null` (rollback réussi), afficher l'état d'échec déjà
  géré (`error` branch) enrichi du message du diagnostic `IMPORT_WRITE_FAILED` ; si `actor` est non-`null` malgré
  une erreur (rollback échoué), afficher un bouton « Supprimer l'acteur incomplet » (`actor.delete()`) en plus du
  message d'échec.
- `cof2Debug.mjs` adapte son affichage `DialogV2` pour lire `report.warnings`/`report.counts` (remplace
  l'usage direct de `warnings`), comportement conservé à l'identique pour le MJ (mêmes messages).
- Toggle de logs de debug : `game.settings.register(MODULE_ID, "cof2ImportDebugLogging", { scope: "client",
  config: true, type: Boolean, default: false, name: "Import COF2 : logs de debug détaillés" })`, enregistré au
  même endroit que `registerMenu` (`cof2ImportWizard.mjs`, hook `ready`). `encounterFactory.mjs` lit ce réglage
  (`game.settings.get(MODULE_ID, "cof2ImportDebugLogging")`) et, si actif, émet un `console.debug` structuré
  (`{code, fragment, message}`) à chaque étape d'écriture et à chaque diagnostic ajouté — désactivé par défaut,
  activable/désactivable depuis les réglages Foundry sans toucher au code.

---

## 5. Plan de travail

1. Ajouter `importWriteFailed`/`importRollbackFailed` à `src/importers/cof2/parsing/encounterDraft.mjs` +
   étendre `encounterDraft.test.mjs` (forme du diagnostic, code, sévérité). Réexporter dans
   `src/importers/cof2/index.mjs`.
2. Refactorer `createEncounter` (`encounterFactory.mjs`) : introduire l'accumulateur `createdDocs`, entourer la
   séquence d'écriture (acteur → attaques → capacités → bibliothèque → attachement) d'un `try/catch`, implémenter
   le rollback (suppression en ordre inverse) et la construction de `report` (`counts`/`warnings`/`diagnostics`).
   Retour `{ actor, report }` (au lieu de `{ actor, warnings }`).
3. Ajouter le réglage `cof2ImportDebugLogging` (`cof2ImportWizard.mjs`, hook `ready`) et les appels
   `console.debug` conditionnels dans `encounterFactory.mjs`.
4. Adapter `cof2ImportWizard.mjs` : `#create()` lit `report` au lieu de `warnings`, `#renderResult` affiche les
   compteurs structurés et le bouton « Supprimer l'acteur incomplet » quand `actor` est non-`null` avec des
   erreurs.
5. Adapter `cof2Debug.mjs` : lecture de `report.warnings`/`report.counts` au lieu de `warnings`, message de
   suppression manuelle si rollback échoué.
6. Étendre `encounterFactory.test.mjs` (mock Foundry minimal, même pattern que Story 7) : succès complet
   (compteurs corrects), échec milieu de parcours avec rollback complet (tous les `createdDocs` supprimés,
   `actor: null`), échec du rollback (diagnostic `IMPORT_ROLLBACK_FAILED`, acteur partiel renvoyé), logs de debug
   émis seulement si le setting est actif (mock `game.settings.get`).
7. Vérification manuelle sur instance Foundry locale (`http://localhost:31000/game`) : provoquer une erreur
   artificielle en milieu d'import (ex. capacité dont la création échoue) et constater qu'aucun acteur résiduel ne
   reste dans le répertoire des acteurs ; réimporter un statblock valide (ex. Centaure) et vérifier les compteurs
   affichés.

---

## 6. Fichiers probablement modifiés

- Modifiés : `src/importers/cof2/parsing/encounterDraft.mjs`, `src/importers/cof2/parsing/encounterDraft.test.mjs`,
  `src/importers/cof2/index.mjs`, `scripts/importers/cof2/encounterFactory.mjs`,
  `scripts/importers/cof2/encounterFactory.test.mjs`, `scripts/importers/cof2ImportWizard.mjs`,
  `scripts/importers/cof2Debug.mjs`.

---

## 7. Tests attendus

- `node --test` couvre les nouveaux diagnostics (`encounterDraft.test.mjs`, purs).
- `encounterFactory.test.mjs` (mock Foundry minimal sur `globalThis`) : succès complet → `report.counts` corrects
  et aucun rollback déclenché ; échec sur la création d'une capacité → tous les documents précédemment créés
  (acteur, attaques, capacités déjà attachées, entrées de bibliothèque) supprimés, `actor: null`,
  `IMPORT_WRITE_FAILED` présent ; suppression qui échoue à son tour → `IMPORT_ROLLBACK_FAILED` présent, acteur
  partiel renvoyé ; réglage `cof2ImportDebugLogging` actif/inactif → `console.debug` appelé ou non (mock `game`).
- Non-régression : suite `node --test` existante (`capacityResolver`, `capacityPlan`, `cof2Adapter`, `itemFactory`,
  `actorFactory`) continue de passer sans changement de comportement des modules non touchés.

---

## 8. Risques et mitigations

- **Risque** : le rollback par suppression (`Item.deleteDocuments`/`actor.delete()`) peut lui-même échouer
  (permissions, document déjà supprimé côté serveur) et masquer l'échec initial derrière une nouvelle exception
  non gérée.
  **Mitigation** : rollback exécuté dans son propre `try/catch` interne, jamais laissé remonter tel quel ;
  diagnostic `IMPORT_ROLLBACK_FAILED` dédié, acteur partiel explicitement renvoyé plutôt que masqué (AC « proposer
  de supprimer l'acteur incomplet »).
- **Risque** : suivre `createdDocs` de façon incomplète (oubli d'un point d'écriture, ex. mise à jour
  `updateEmbeddedDocuments` du recâblage `source` des attaques) laisserait un rollback partiel silencieux.
  **Mitigation** : le rollback cible les créations (suppression de document), pas les mises à jour ; la mise à
  jour du recâblage `source` se fait sur un document déjà tracé (l'attaque), donc son échec déclenche la
  suppression de ce même document via le tracking existant — pas de nouveau point de suivi nécessaire.
- **Risque** : changer la forme du retour de `createEncounter` (`{actor, warnings}` → `{actor, report}`) casse
  silencieusement un appelant qui lirait encore `result.warnings`.
  **Mitigation** : `report.warnings` conserve exactement la même forme (tableau de messages lisibles) sous une
  clé imbriquée ; les deux appelants (`cof2Debug.mjs`, `cof2ImportWizard.mjs`) sont mis à jour dans cette même
  story (étapes 4-5), aucun autre appelant n'existe dans le dépôt (vérifié par recherche).

---

## 9. Critères d'arrêt

- Les 5 critères d'acceptation de l'issue #10 sont couverts :
  1. une erreur milieu d'import ne laisse pas silencieusement un acteur inutilisable (test `encounterFactory` :
     rollback complet, `actor: null`) ;
  2. le rollback supprime tous les documents créés pendant la transaction en cours (test `encounterFactory`) ;
  3. le rapport final affiche les compteurs attendus (test `encounterFactory` + vérification manuelle wizard) ;
  4. le journal technique contient la cause précise de chaque échec, code diagnostic + fragment source
     (`IMPORT_WRITE_FAILED`/`IMPORT_ROLLBACK_FAILED`, test `encounterDraft` + `encounterFactory`) ;
  5. les logs de debug sont activables sans modifier le code (réglage `cof2ImportDebugLogging`, test
     `encounterFactory` avec mock `game.settings`).
- `node --test` passe intégralement (nouvelles suites + suites existantes inchangées).
- Contrat public de `capacityResolver.mjs` (#5), `capacityPlan.mjs` (#7) et `importLibrary.mjs` (#6) inchangé.

# Plan d'implémentation — Wizard d'import / Prévisualisation COF2

**Issue** : [#4 — Story 4 : Import Wizard / Prévisualisation](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/4)
**Epic** : `documentation/cadrage/Epic_Importateur_statblocks_COF2_PDF.md` (section 8 — UX cible, section 10 — modèle
`EncounterDraft`, section 30 — Story 4, AC02)
**Bloqué par** : #3 (livrée — `EncounterDraft` + diagnostics codés, `src/importers/cof2/parsing/encounterDraft.mjs`)
**Module(s) impacté(s)** : `scripts/importers/*.mjs`, `module.json`, `styles/warbound.css`

---

## 1. Objectif

Remplacer le flux actuel « coller → créer directement » (`scripts/importers/cof2Debug.mjs`) par une vraie
`ApplicationV2` Foundry v14 en 4 étapes (Source → Prévisualisation → Options → Résultat) permettant au MJ de
corriger un `EncounterDraft` avant toute écriture Foundry. Aucun `Actor` ni `Item` n'est créé avant le clic final
sur **Créer**.

---

## 2. Périmètre

### Inclus

- Nouvelle `ApplicationV2` (`foundry.applications.api.ApplicationV2` + `HandlebarsApplicationMixin`) à 4 étapes :
  1. **Source** : zone de texte, boutons Analyser / Effacer.
  2. **Prévisualisation** : formulaire éditable (identité, 7 caractéristiques, DEF/PV/Init/RD), tableau attaques
     (État/Nom/Type/Attaque/DM/Portée/Texte), tableau capacités (État/Capacité source/Résolution/Action/Fréquence/
     Cible), diagnostics groupés par sévérité (Erreur / À vérifier / Information).
  3. **Options** : cases à cocher — créer l'acteur Rencontre, réutiliser les objets existants compatibles, ouvrir
     la fiche après création. Les cases « Enregistrer dans la bibliothèque d'import » et « Créer uniquement dans
     l'acteur » sont affichées mais désactivées (tooltip renvoyant à Story 6, non livrée).
  4. **Résultat** : résumé (compteurs créés/réutilisés/à vérifier/erreurs) + bouton **Ouvrir la rencontre**.
- Badges de confiance ✓ (high) / ⚠ (medium) / ✕ (low) sur chaque ligne attaque/capacité, dérivés du champ
  `confidence` de `AttackDraft`/`CapacityDraft`.
- Statut de résolution des capacités affiché en étape 2, calculé en lecture seule via le résolveur existant
  (`buildCapacityResolver`/`makeCapacityMatcher`) : `EXACT_REUSE` (✓, `hit.entry` sans `approximate`),
  `TEMPLATE_VARIANT` (⚠, `hit.approximate`), `AMBIGUOUS` (⚠, `hit.ambiguous`), `NOT_FOUND` (✕, aucun hit).
- Points d'entrée : `game.settings.registerMenu` (« Warbound → Importer une rencontre COF2 ») et bouton dans l'en-tête
  du répertoire des Acteurs (`Hooks.on("renderActorDirectory", ...)`).
- Extraction de la logique Foundry de création (`buildAttackData`, `buildCapacityResolver`, `createEncounter`)
  depuis `cof2Debug.mjs` vers un module partagé `scripts/importers/cof2/encounterFactory.mjs`, réutilisé par le
  wizard et par la commande de debug existante.
- Styles minimaux pour le wizard dans `styles/warbound.css` (ou fichier dédié `styles/warbound-importer.css` si le
  volume le justifie), cohérents avec la DA `wb-*` existante là où pertinent (tableaux, badges).

### Hors scope

- Résolveur multi-compendium avancé (`ItemResolver`, index bibliothèque, `TEMPLATE_VARIANT` élaboré) : Story 5.
  On réutilise `makeCapacityMatcher`/`buildCapacityResolver` tels quels, sans les enrichir.
- Bibliothèque d'objets importés persistante, hash de contenu, dédoublonnage inter-imports : Story 6. Case à cocher
  correspondante désactivée dans l'UI.
- Item Factory enrichie (métadonnées `flags.warbound`, mapping fin des temps d'action/fréquences au-delà de
  l'existant) et automatisation de capacités : Stories 7 à 9.
- Transaction/rollback complet en cas d'échec partiel : Story 10. Le plan de travail prévoit uniquement que
  `createEncounter` reste séquentiel comme aujourd'hui (best-effort), avec un message d'erreur clair en cas
  d'échec, sans rollback automatique — limite documentée, pas traitée ici.
- Import direct d'un fichier PDF (section 31 de l'Epic).
- Toute modification du comportement de reconnaissance du parseur (`statblockParser.mjs`, `encounterDraft.mjs`) :
  cette story consomme `EncounterDraft` tel que produit par Story 3, sans y toucher.

---

## 3. Constat sur l'existant

- `src/importers/cof2/index.mjs` expose déjà `parseStatblock` (pur, retourne un `EncounterDraft` conforme à
  Story 3) et `makeCapacityMatcher` (pur, lecture d'un index déjà chargé).
- `scripts/importers/cof2Debug.mjs` est le seul code Foundry existant du pipeline. Il mélange dans les mêmes
  fonctions : lecture du compendium (`buildCapacityResolver`, non destructif), construction de payloads Foundry
  (`buildAttackData`), et écriture réelle (`createEncounter` → `Actor.create`, `createEmbeddedDocuments`,
  `actor.addCapacity`). Le flux actuel utilise `DialogV2.prompt` en une seule boîte de dialogue texte, sans étape
  de prévisualisation éditable, et affiche les avertissements *après* création (pas avant, contrairement à AC02
  attendu pour le wizard).
- `module.json` ne déclare aucun menu de module ni bouton de répertoire à ce jour ; `scripts/warbound.mjs` est le
  seul point d'enregistrement de hooks `init`/`ready` existant, à titre de modèle de convention (pas de framework
  UI, Hooks vanilla).
- Aucune `ApplicationV2`/`HandlebarsApplicationMixin` n'existe encore dans le dépôt : ce sera la première.
- `styles/warbound.css` porte déjà la DA `wb-*` (readaloud, box, statblock, columns, etc.) utilisée pour les
  journaux ; le wizard peut en réutiliser certains éléments visuels (tableaux, badges) sans être tenu de suivre
  strictement cette DA journal, car il s'agit d'une Application applicative et non d'une page de journal.

---

## 4. Décisions d'architecture

- **Séparation lecture/écriture stricte** : l'étape Prévisualisation n'appelle que `parseStatblock` (pur) et la
  lecture d'index de compendium (`pack.getIndex`, déjà utilisée sans écriture dans `buildCapacityResolver`). Aucun
  appel à `Actor.create`/`createEmbeddedDocuments`/`addCapacity` n'a lieu avant le clic **Créer** de l'étape 4.
- **Extraction de `encounterFactory.mjs`** : déplacer `buildAttackData`, `buildCapacityResolver`, `createEncounter`
  de `cof2Debug.mjs` vers `scripts/importers/cof2/encounterFactory.mjs`, sans changement de comportement. Les deux
  appelants (`cof2Debug.mjs` et le nouveau wizard) importent ce module. `cof2Debug.mjs` est conservé comme commande
  de debug (`game.modules.get(MODULE_ID).api.cof2.importStatblockFromPrompt`), mais délègue désormais à
  `encounterFactory.mjs`.
- **État de l'Application** : la classe wizard conserve en mémoire d'instance le texte source, l'`EncounterDraft`
  courant (après édition MJ), les options cochées, et le résultat de création — pas de persistance entre sessions.
- **Étape → document EncounterDraft mutable** : les corrections du MJ en étape 2 mutent une copie locale de
  l'`EncounterDraft` (jamais l'objet retourné brut par `parseStatblock`), afin de permettre un nouvel « Analyser »
  sans perdre la trace de l'original si besoin de debug.
- **Résolution capacités en étape 2** : un appel unique à `buildCapacityResolver()` (déplacé) est fait à l'ouverture
  de l'étape Prévisualisation ; le résultat (`hit` par capacité) est stocké dans l'état de l'Application pour
  affichage des badges, et réutilisé tel quel à l'étape Créer (pas de second appel divergent).
- **Menu d'entrée** : `game.settings.registerMenu("warbound-campaign-content", "cof2ImportWizard", { name: "Importer
  une rencontre COF2", type: WizardApplicationClass, restricted: true })`, suivant le même fichier `scripts/warbound.mjs`
  ou un nouveau `scripts/importers/cof2ImportWizard.mjs` enregistré dans `module.json > esmodules`. Le bouton du
  répertoire des Acteurs est ajouté via `Hooks.on("renderActorDirectory", (app, html) => { ... })`, visible
  seulement si `game.user.isGM` et `Actor.canUserCreate(game.user)`.
- **Pas de nouvelle dépendance externe** : uniquement l'API Foundry v14 (`ApplicationV2`, `HandlebarsApplicationMixin`,
  `DialogV2` si besoin de confirmations) et le module pur `src/importers/cof2/`.

---

## 5. Plan de travail

1. Créer `scripts/importers/cof2/encounterFactory.mjs` : y déplacer `buildAttackData`, `buildCapacityResolver`,
   `createEncounter` depuis `cof2Debug.mjs`, sans changement de logique. Exporter ces trois fonctions.
2. Adapter `cof2Debug.mjs` pour importer et utiliser `encounterFactory.mjs` au lieu de ses définitions locales ;
   vérifier que le comportement de la commande de debug reste identique.
3. Créer `scripts/importers/cof2ImportWizard.mjs` avec la classe `ApplicationV2` du wizard :
   - template Handlebars (ou parties HTML générées) pour les 4 étapes ;
   - étape Source : bouton Analyser → appelle `parseStatblock(text)`, transition vers l'étape Prévisualisation,
     ou reste sur Source avec les diagnostics d'erreur bloquants affichés si le parsing échoue totalement.
   - étape Prévisualisation : rendu du formulaire éditable à partir de l'`EncounterDraft`, appel à
     `buildCapacityResolver()` pour le statut de résolution des capacités, badges de confiance, diagnostics groupés
     par sévérité, boutons Précédent / Suivant.
   - étape Options : cases à cocher (2 actives, 2 désactivées comme décrit en périmètre).
   - étape Résultat : au clic **Créer**, appelle `createEncounter(draft)` (via `encounterFactory.mjs`) avec les
     options choisies, affiche le résumé (compteurs) et le bouton **Ouvrir la rencontre**.
4. Déclarer `scripts/importers/cof2ImportWizard.mjs` dans `module.json > esmodules`.
5. Enregistrer le point d'entrée menu (`game.settings.registerMenu`) et le bouton du répertoire des Acteurs
   (`Hooks.on("renderActorDirectory", ...)`), tous deux ouvrant la même instance/`Application` du wizard.
6. Ajouter les styles nécessaires (tableaux attaques/capacités, badges de confiance, groupes de diagnostics) dans
   `styles/warbound.css` ou un fichier dédié référencé dans `module.json > styles`.
7. Vérifier manuellement (instance Foundry locale, cf. mémoire projet) le cas Centaure de référence (section 22 de
   l'Epic) à travers les 4 étapes : 3 attaques, 4 capacités, aucune création avant le clic Créer, résumé correct.

---

## 6. Fichiers probablement modifiés

- Nouveaux : `scripts/importers/cof2/encounterFactory.mjs`, `scripts/importers/cof2ImportWizard.mjs`, et un ou
  plusieurs templates Handlebars associés (`templates/importers/cof2-wizard-*.hbs` ou équivalent selon convention
  Foundry v14 retenue à l'implémentation).
- Modifiés : `scripts/importers/cof2Debug.mjs` (délégation vers `encounterFactory.mjs`), `module.json` (nouvel
  esmodule, éventuel nouveau fichier de style), `styles/warbound.css` (ou nouveau fichier de style dédié).

---

## 7. Tests attendus

- Pas de nouveau test `node --test` requis pour la logique Foundry elle-même (non testable hors Foundry) ; les
  tests existants de `src/importers/cof2/parsing/*.test.mjs` (Stories 1-3) continuent de passer sans modification,
  car cette story ne touche pas au module pur.
- Vérification manuelle en instance Foundry locale (`http://localhost:31000/game`, cf. mémoire `FoundryVTT dev env`) :
  - AC02 : aucun `Actor`/`Item` créé entre le clic Analyser et le clic Créer (vérifiable via le répertoire Acteurs/
    Objets resté inchangé pendant les étapes 1-3).
  - Cas Centaure (section 22 de l'Epic) : 3 attaques, 4 capacités, diagnostics conformes, badges de confiance
    cohérents avec `confidence` du draft.
  - Les deux points d'entrée (menu Warbound, bouton répertoire Acteurs) ouvrent bien le wizard.
  - La commande de debug (`cof2Debug.mjs`) continue de fonctionner après extraction vers `encounterFactory.mjs`.

---

## 8. Risques et mitigations

- **Risque** : dupliquer accidentellement la logique de création lors de l'extraction, faisant diverger
  `cof2Debug.mjs` et le wizard.
  **Mitigation** : extraction stricte sans réécriture (étape 1 du plan de travail), un seul appelant de
  `createEncounter` par flux, revue de non-régression sur la commande de debug après extraction.
- **Risque** : confusion sur le statut de résolution des capacités affiché (badges) alors que Story 5 n'existe pas
  encore — le MJ pourrait croire à une résolution multi-compendium avancée.
  **Mitigation** : libellés et tooltips précisant que seul le compendium officiel `cof2-base` est consulté à ce
  stade (pas de bibliothèque d'import, Story 6).
- **Risque** : première `ApplicationV2` du module — risque d'incompatibilité de version Foundry ou d'API mal
  utilisée.
  **Mitigation** : s'appuyer sur les usages déjà validés de `foundry.applications.api.DialogV2` dans
  `cof2Debug.mjs` comme référence de conventions API v14, tester en instance locale avant de considérer la story
  terminée.
- **Risque** : cases à cocher désactivées (bibliothèque, création sans acteur) perçues comme un bug plutôt qu'une
  limite volontaire.
  **Mitigation** : tooltip explicite renvoyant aux stories futures (Story 6), cohérent avec le principe de l'Epic
  de ne jamais fabriquer silencieusement une fonctionnalité non prête.

---

## 9. Critères d'arrêt

- Les 6 critères d'acceptation de l'issue #4 sont satisfaits :
  - aucun `Actor`/`Item` créé pendant Source et Prévisualisation ;
  - le formulaire de prévisualisation est éditable ;
  - les diagnostics sont affichés avec leurs trois niveaux de sévérité ;
  - les badges de confiance (✓/⚠/✕) sont visibles sur attaques et capacités ;
  - le clic sur **Créer** est le seul déclencheur d'écriture Foundry ;
  - l'application est accessible depuis le menu du module et depuis le répertoire des Acteurs.
- Le cas Centaure de référence (section 22 de l'Epic) s'importe correctement via le wizard de bout en bout.
- `cof2Debug.mjs` reste fonctionnel après extraction de `encounterFactory.mjs`, sans duplication de logique de
  création entre les deux flux.
- Tous les tests `node --test` existants (Stories 1-3) continuent de passer sans modification.

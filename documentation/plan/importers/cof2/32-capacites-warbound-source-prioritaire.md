# Plan d'implémentation — Résolution des capacités via les compendiums Warbound

**Issue** : [#32 — \[Importer COF2\] Rechercher les capacités et voies dans les compendiums Warbound](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/32)
**Plan lié** : `documentation/plan/importers/cof2/5-resolver-multi-compendiums.md` (resolver multi-sources, statuts `EXACT_REUSE`/`TEMPLATE_VARIANT`/`REUSE_IMPORTED`/`AMBIGUOUS`/`NOT_FOUND`)
**Module(s) impacté(s)** : `src/importers/cof2/resolution/capacityResolver.mjs`,
`scripts/importers/cof2/encounterFactory.mjs`

---

## 1. Objectif

Ajouter les compendiums du module `warbound-campaign-content` comme source de résolution des **capacités**
(priorité la plus haute, avant les compendiums officiels COF2 et la bibliothèque d'import), pour qu'une capacité
déjà définie dans Warbound soit réutilisée au lieu d'être recréée. Ordre final : Warbound → COF2 officiel →
bibliothèque d'import → création.

---

## 2. Périmètre

### Inclus

- Extension de `capacityResolver.mjs` (module pur) pour accepter une troisième source d'entrées
  (`warboundEntries`), consultée en priorité 1 (exact puis variante paramétrée), avant l'actuelle priorité
  officielle COF2 (qui devient priorité 2) et la bibliothèque d'import (priorité 3, inchangée).
- Chaque `CapacityResolution` porte désormais un champ `source` (`"warbound"|"cof2"|"library"`) permettant
  d'identifier l'origine de la réutilisation (AC "le résultat de l'import permet d'identifier qu'un élément a été
  réutilisé depuis Warbound").
- Extension de `buildCapacityResolver()` (`encounterFactory.mjs`) pour charger l'index du pack
  `warbound-campaign-content.items` (type `capacity`) en plus de `cof2-base.cof-2-base-items`, avec un filtre de
  dossiers équivalent à celui déjà appliqué côté COF2.
- Filtre de dossiers Warbound : uniquement le sous-arbre du dossier racine **`Capacités`** du pack `items`, en
  excluant tout sous-dossier dont le nom commence par `Voie`/`Voies` (arborescence PJ, ex. `Voies du guerrier` →
  `Voie du Bouclier`). Constat sur les YAML actuels (`compendiums/items/folders_*.yml`) : sous `Capacités`
  (`MtAN8rJRCRQRss6h`) cohabitent `Rencontre` → `Kolkar` et les dossiers par peuple (`Tauren`, `Troll`, `Orc`,
  `Réprouvé`, `Elfe de Sang`, `kolkar`) — tous pertinents pour un monstre — et les dossiers `Voies du …` — non
  pertinents ici. Résolution récursive nécessaire (contrairement au filtre plat à deux dossiers de COF2) : `Kolkar`
  n'est pas un enfant direct de `Capacités` mais de `Rencontre`.
- Warnings/rapport (`createEncounter`) mis à jour pour mentionner la source Warbound quand `resolution.source ===
  "warbound"` (branches `EXACT_REUSE`/`TEMPLATE_VARIANT` existantes dans `encounterFactory.mjs`).
- Tests unitaires purs sur `capacityResolver.mjs` (priorité Warbound > COF2 > bibliothèque, tag `source`) et tests
  sur le filtrage récursif des dossiers Warbound (fonction extraite, testable sans instance Foundry si possible, ou
  a minima documentée dans les tests d'intégration existants d'`encounterFactory`).

### Hors scope

- Résolution de **voies** : le pipeline d'import de statblock (`statblockParser.mjs`, `EncounterDraft`) ne
  produit aujourd'hui aucun `PathDraft`/équivalent — seules des capacités et attaques sont extraites d'un
  statblock de créature. Les critères d'acceptation de l'issue mentionnant les voies ne s'appliquent donc pas au
  pipeline d'import bestiaire actuel ; à traiter dans une story séparée si un besoin réel de résolution de voie
  apparaît dans ce pipeline. *(Confirmé avec l'utilisateur.)*
- Changement du format de retour du resolver en dehors de l'ajout du champ `source` (les statuts
  `EXACT_REUSE`/`TEMPLATE_VARIANT`/`REUSE_IMPORTED`/`AMBIGUOUS`/`NOT_FOUND` restent inchangés).
- Dédoublonnage/fusion de contenu entre packs COF2 et Warbound au-delà de la priorité de résolution (pas de
  migration de données, pas de suppression de doublons existants).
- Réécriture de la bibliothèque d'import (`importLibrary.mjs`) ou de la logique `TEMPLATE_VARIANT`
  (`capacityVariant.mjs`) au-delà du branchement de la nouvelle source.

---

## 3. Constat sur l'existant

- `capacityResolver.mjs` (`makeCapacityResolver`) résout aujourd'hui sur deux sources uniquement
  (`officialEntries`, `importedEntries`), sans notion d'origine dans le résultat (voir
  `documentation/plan/importers/cof2/5-resolver-multi-compendiums.md`).
- `buildCapacityResolver()` (`encounterFactory.mjs:57-67`) construit `officialEntries` depuis
  `game.packs.get("cof2-base.cof-2-base-items")`, filtré aux dossiers `["Capacités des rencontres", "Capacité de
  base"]`, avec un dossier prioritaire pour départager les homonymes. `importedEntries` vient du pack monde de la
  bibliothèque d'import (`LIBRARY_PACKS.capacity`).
- Le pack `warbound-campaign-content.items` (déclaré dans `module.json`, système `co2`) contient déjà des items de
  type `capacity` organisés en dossiers, avec une racine `Capacités` regroupant un sous-arbre bestiaire
  (`Rencontre` → `Kolkar`, plus les dossiers par peuple) et un sous-arbre voies PJ (`Voies du …`) — structure
  vérifiée directement dans `compendiums/items/folders_*.yml` et `compendiums/items/capacity_*.yml`.
- `createEncounter()` (`encounterFactory.mjs:229-306`) déclenche `resolver.resolve(cap.name)` puis branche sur
  `resolution.status` ; `resolver.pack` sert à charger le document via `resolver.pack.getDocument(...)`. L'ajout
  d'une troisième source suppose que `resolver` (ou la résolution elle-même) expose de quoi retrouver le bon pack
  (`cof2-base` vs `warbound-campaign-content.items`) pour charger le document réutilisé.

---

## 4. Décisions d'architecture

- **Signature de `makeCapacityResolver`** : ajout de `warboundEntries = []` et `warboundPriorityFolderId`
  (optionnel, même rôle que `priorityFolderId` mais pour les homonymes internes à Warbound). Chaque entrée passée
  au resolver (des trois sources) porte déjà un identifiant de pack implicite côté appelant ; le resolver n'a pas
  besoin de connaître les packs, il retourne l'`entry` telle que fournie par l'appelant (comme aujourd'hui).
- **Ordre de résolution** (remplace l'algorithme actuel à 4 étapes par 6 étapes) :
  1. Exact match dans `warboundEntries` → `EXACT_REUSE`, `source: "warbound"`.
  2. Variante paramétrée dans `warboundEntries` → `TEMPLATE_VARIANT`, `source: "warbound"`.
  3. Exact match dans `officialEntries` (COF2) → `EXACT_REUSE`, `source: "cof2"`.
  4. Variante paramétrée dans `officialEntries` → `TEMPLATE_VARIANT`, `source: "cof2"`.
  5. Exact match dans `importedEntries` (bibliothèque) → `REUSE_IMPORTED`, `source: "library"`.
  6. Sinon → `NOT_FOUND`.
  Une ambiguïté à une étape retourne `AMBIGUOUS` immédiatement (comportement actuel conservé, pas de
  redescente vers les priorités suivantes — cohérent avec la story #5).
- **Champ `source` sur `CapacityResolution`** : ajouté à tous les statuts porteurs d'`entry`
  (`EXACT_REUSE`/`TEMPLATE_VARIANT`/`REUSE_IMPORTED`), absent sur `AMBIGUOUS`/`NOT_FOUND` (rien à identifier).
- **`buildCapacityResolver()`** (`encounterFactory.mjs`) : nouvelle constante `WARBOUND_PACK_ID =
  "warbound-campaign-content.items"`. Ajout d'une fonction `collectWarboundCapacityFolderIds(pack)` qui :
  1. trouve le dossier racine nommé `Capacités` (pas de dossier parent) ;
  2. parcourt récursivement `pack.folders` (relation `folder` = parent) pour collecter tous les descendants ;
  3. exclut tout sous-arbre dont le nom de dossier matche `/^Voies?\b/i` (coupe la branche entière, ne descend pas
     dedans).
  Si le dossier racine `Capacités` est absent, `warboundEntries = []` (pas d'erreur bloquante — dégradation
  silencieuse vers COF2/bibliothèque, cohérent avec le comportement actuel quand `cof2-base` est absent).
- **Chargement du document réutilisé** : `resolver` doit exposer les deux packs (`cof2Pack`, `warboundPack`) pour
  que `createEncounter`/`addTemplateVariantCapacity` choisissent le bon `.getDocument(...)` selon
  `resolution.source`. Renommage minimal : `resolver.pack` (COF2) devient `resolver.cof2Pack`, nouveau
  `resolver.warboundPack` — mise à jour des deux call sites existants (`resolver.pack.getDocument` dans
  `createEncounter` et `addTemplateVariantCapacity`).
- **Messages/rapport** : les warnings existants (`« ${cap.name} » : variante de « … » du compendium, vérifier le
  paramètre.`) mentionnent la source quand `resolution.source === "warbound"` (ex. suffixe ` (Warbound)`), pour
  satisfaire l'AC de traçabilité sans introduire de nouveau champ dans `ImportReport.counts` (pas demandé par les
  critères d'acceptation, qui portent sur l'identification dans le résultat, pas sur un comptage séparé).
- Pas de nouvelle dépendance externe. Pas de changement du format `CapacityDraft`/`EncounterDraft`.

---

## 5. Plan de travail

1. Étendre `capacityResolver.mjs` : paramètre `warboundEntries`/`warboundPriorityFolderId`, deux étapes de
   résolution supplémentaires en tête de la chaîne, champ `source` sur les résolutions porteuses d'`entry`.
2. Étendre `capacityResolver.test.mjs` : priorité Warbound > COF2 > bibliothèque, `TEMPLATE_VARIANT` Warbound
   distinct d'un `TEMPLATE_VARIANT` COF2 homonyme (Warbound gagne), `source` correct sur chaque statut,
   non-régression des cas existants (#5) avec `warboundEntries` absent/vide.
3. Dans `encounterFactory.mjs` : ajouter `WARBOUND_PACK_ID`, `collectWarboundCapacityFolderIds(pack)`, et
   construire `warboundEntries` dans `buildCapacityResolver()` (même forme que `entries` COF2 :
   `index.filter(e => e.type === "capacity" && folderIds.has(e.folder))`).
4. Renommer `resolver.pack` → `resolver.cof2Pack`, ajouter `resolver.warboundPack` ; mettre à jour les deux
   call sites (`createEncounter`, `addTemplateVariantCapacity`) pour choisir le pack selon `resolution.source`.
5. Mettre à jour les warnings de réutilisation pour mentionner la source Warbound (branches `EXACT_REUSE`
   attaché avec succès, `TEMPLATE_VARIANT` réutilisée).
6. Étendre les tests d'intégration existants d'`encounterFactory`/`cof2ImportWizard` (mock `game.packs`) avec un
   second pack mocké `warbound-campaign-content.items` reproduisant l'arborescence `Capacités` → `Rencontre` →
   `Kolkar` (+ un dossier `Voies du …` à exclure), pour couvrir : réutilisation Warbound prioritaire sur un
   homonyme COF2, exclusion effective des capacités de voie du filtre.
7. Relire pour confirmer qu'aucune régression sur le flux COF2/bibliothèque seul (pack Warbound absent ou vide).

---

## 6. Fichiers probablement modifiés

- `src/importers/cof2/resolution/capacityResolver.mjs`, `src/importers/cof2/resolution/capacityResolver.test.mjs`.
- `scripts/importers/cof2/encounterFactory.mjs`, `scripts/importers/cof2/encounterFactory.test.mjs` (ou
  équivalent, selon nommage réel des tests d'intégration existants).
- Éventuellement `src/importers/cof2/index.mjs` si de nouveaux exports sont nécessaires (`collectWarboundCapacityFolderIds`
  si extrait comme module pur testable indépendamment).

---

## 7. Tests attendus

- `node --test` couvre : priorité Warbound avant COF2 (exact et variante), priorité COF2 avant bibliothèque
  (non-régression #5), `source` correctement renseigné par statut, absence de régression quand
  `warboundEntries` est vide/absent.
- Filtrage récursif des dossiers Warbound : dossier `Kolkar` (petit-enfant de `Capacités` via `Rencontre`) inclus,
  dossier `Voie du Bouclier` (descendant de `Capacités` via `Voies du guerrier`) exclu.
- Une capacité présente à la fois dans Warbound et COF2 avec un nom identique est réutilisée depuis Warbound, et
  le rapport d'import identifie cette provenance.
- Comportement inchangé si le pack `warbound-campaign-content.items` ou le dossier `Capacités` est absent :
  résolution retombe sur COF2 puis bibliothèque comme aujourd'hui.

---

## 8. Risques et mitigations

- **Risque** : le nom du dossier racine `Capacités` change ou n'est pas unique dans un autre monde utilisant ce
  module.
  **Mitigation** : dégradation silencieuse (liste vide) si le dossier `Capacités` est absent ou ambigu — jamais
  d'erreur bloquante, cohérent avec le traitement actuel de l'absence de `cof2-base`.
- **Risque** : le filtre `/^Voies?\b/i` exclut par erreur un futur dossier bestiaire dont le nom commence
  accidentellement par « Voie » (peu probable vu la convention de nommage observée, mais à surveiller).
  **Mitigation** : filtre documenté explicitement dans le code (commentaire sur la convention de nommage), à
  ajuster si un contre-exemple réel apparaît.
- **Risque** : renommer `resolver.pack` en `resolver.cof2Pack` casse un appelant non repéré lors de l'analyse.
  **Mitigation** : recherche exhaustive de `resolver.pack`/`buildCapacityResolver` avant renommage (étape 7 du
  plan de travail), limité aux deux call sites identifiés dans `encounterFactory.mjs`.

---

## 9. Critères d'arrêt

- Les critères d'acceptation de l'issue #32 portant sur les **capacités** sont couverts par des tests `node
  --test` : inclusion des compendiums Warbound, réutilisation prioritaire sur COF2, non-régression COF2 et
  bibliothèque, création uniquement en dernier recours, traçabilité de la source Warbound dans le résultat.
- Les critères d'acceptation portant sur les **voies** sont explicitement notés hors scope de ce plan (absence de
  résolution de voie dans le pipeline d'import bestiaire actuel), à traiter séparément si besoin confirmé.
- Tous les tests (`node --test`) passent, sans appel réseau ni instance Foundry active pour la partie pure du
  resolver.
# Plan d'implémentation — Bibliothèque d'objets importés

**Issue** : [#6 — Story 6 : Bibliothèque d'objets importés](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/6)
**Epic** : `documentation/cadrage/Epic_Importateur_statblocks_COF2_PDF.md` (§14 « Résolution des capacités
existantes », §15 « Bibliothèque d'import », §16 « Création des capacités manquantes »)
**Bloqué par** : #5 (livré — `capacityResolver.mjs`, cf.
`documentation/plan/importers/cof2/5-resolver-multi-compendiums.md`)
**Module(s) impacté(s)** : `src/importers/cof2/library/contentHash.mjs` (nouveau),
`scripts/importers/cof2/importLibrary.mjs` (nouveau), `scripts/importers/cof2/encounterFactory.mjs`,
`src/importers/cof2/index.mjs`

---

## 1. Objectif

Fournir une zone de persistance monde (compendiums dédiés) pour les capacités/voies créées par l'importateur COF2,
distincte de `cof2-base`, avec hash de contenu normalisé, métadonnées `flags.warbound.*` et dédoublonnage, branchée
sur la priorité 3 du resolver existant (#5) sans jamais écrire dans les compendiums officiels.

---

## 2. Périmètre

### Inclus

- Calcul d'un hash de contenu normalisé par capacité : `type + nom + description + actionType + frequency +
  paramètres` (module pur, testable `node --test`).
- Compendiums de monde dédiés, créés automatiquement s'ils n'existent pas (`CompendiumCollection.createCompendium`) :
  `Warbound — Capacités importées` (type `Item`, capacités) ; `Warbound — Voies importées` seulement si le pipeline
  actuel traite déjà des voies (sinon différé — cf. Hors scope).
- Flags Foundry sur chaque objet créé : `flags.warbound = { imported: true, sourceType, parserVersion, sourceHash,
  reviewStatus }`, `reviewStatus` initial `generated`.
- Dédoublonnage : hash identique → réutilisation automatique (pas de nouvelle entrée) ; même nom normalisé mais hash
  différent → nouvelle entrée créée avec `reviewStatus: "review-required"` et avertissement dédié (variante à
  examiner), jamais de fusion silencieuse.
- Intégration dans `encounterFactory.mjs` : après échec des priorités 1-2 (officiel), interroger la bibliothèque
  d'import avant de retomber sur la création en texte seul ; toute capacité nouvellement créée par le pipeline est
  désormais persistée dans la bibliothèque (plus seulement posée en texte sur l'acteur).
- Garde explicite : aucune écriture dans `cof2-base.cof-2-base-items` (le module ne touche que le(s) pack(s) monde
  dédiés).

### Hors scope

- Voies (`Warbound — Voies importées`) si le pipeline actuel (`encounterDraft`/`encounterFactory`) ne traite pas
  encore les voies de PJ à ce stade — création du pack prévue mais alimentation différée à la story qui traite les
  voies, si distincte.
- UI de revue (`review-required` → `reviewed`) : story ultérieure (écran de comparaison / validation manuelle,
  déjà noté hors scope par la Story 5 sous « Story 8 »).
- Modification du contrat public de `capacityResolver.mjs` (#5) : le module reste inchangé, la bibliothèque
  d'import alimente son paramètre `importedEntries` existant sans changer sa logique de matching par nom.
- Automatisation mécanique du contenu des capacités (Niveau B/C de l'Epic §17) : hors périmètre de cette story.

---

## 3. Constat sur l'existant

- `capacityResolver.mjs` sait déjà consommer une source `importedEntries` (indexée par nom normalisé, priorité 3,
  statut `REUSE_IMPORTED`) mais `encounterFactory.mjs` ne l'alimente jamais : `buildCapacityResolver()` ne charge que
  le pack officiel `cof2-base.cof-2-base-items`.
- Les capacités non résolues (`NOT_FOUND`/`AMBIGUOUS`) sont aujourd'hui créées en texte seul directement sur
  l'acteur (`textOnly.push(...)`), sans persistance réutilisable : un second import du même statblock recrée
  systématiquement les mêmes capacités.
- Aucun module Foundry dédié à un compendium de monde n'existe encore dans le repo ; `encounterFactory.mjs` est le
  seul point d'écriture Foundry établi pour ce pipeline (convention à respecter).
- Aucune fonction de hash de contenu n'existe dans `src/importers/cof2/`.

---

## 4. Décisions d'architecture

- Module pur `src/importers/cof2/library/contentHash.mjs` : `computeContentHash({type, name, description,
  actionType, frequency, parameters})` → string stable (hash sur une sérialisation normalisée : nom `normalize()`
  repris de `capacityResolver.mjs`, description trim/collapse-espaces, champs absents traités comme chaîne vide).
  Aucune dépendance Foundry, testable `node --test`.
- Module Foundry `scripts/importers/cof2/importLibrary.mjs` (nouveau point d'écriture, à côté de
  `encounterFactory.mjs`, même convention « seule l'API Foundry y vit ») exposant :
  - `ensureImportLibraryPack({type})` → récupère ou crée le compendium monde dédié.
  - `loadImportedEntries(pack)` → entrées `{_id, name, folder, flags}` pour alimenter
    `makeCapacityResolver({..., importedEntries})` (priorité 3, contrat #5 inchangé).
  - `findByHash(pack, hash)` → document existant avec `flags.warbound.sourceHash === hash`, ou `null`.
  - `saveImportedCapacity(pack, draft, {hash, sourceType, parserVersion, reviewStatus})` → crée l'item dans le pack
    avec `flags.warbound = {imported: true, sourceType, parserVersion, sourceHash: hash, reviewStatus}`.
- Résolution priorité 3 dans `encounterFactory.mjs`, après échec priorités 1-2 (officiel via `capacityResolver`) :
  1. `findByHash` sur le pack d'import → trouvé → réutilisation automatique (comme `REUSE_IMPORTED`), aucun
     avertissement de doublon.
  2. Sinon, un nom identique existe déjà dans la bibliothèque avec un hash différent → création d'une nouvelle
     entrée `reviewStatus: "review-required"`, avertissement « variante à examiner ».
  3. Sinon → création d'une nouvelle entrée `reviewStatus: "generated"`.
  Dans tous les cas de création/réutilisation en bibliothèque, l'item est aussi ajouté à l'acteur (comme pour
  `EXACT_REUSE`/`TEMPLATE_VARIANT` aujourd'hui), remplaçant le fallback texte seul.
- Pas de modification de `capacityResolver.mjs` : la bibliothèque reste une couche au-dessus, cohérente avec le
  découpage « module pur (#5) / point d'écriture Foundry (#6) » déjà en place.

---

## 5. Plan de travail

1. Créer `src/importers/cof2/library/contentHash.mjs` (`computeContentHash`) + `contentHash.test.mjs` (`node --test`) :
   stabilité (même entrée → même hash), sensibilité au contenu (description différente → hash différent),
   insensibilité aux espaces/casse superflus.
2. Créer `scripts/importers/cof2/importLibrary.mjs` : `ensureImportLibraryPack`, `loadImportedEntries`,
   `findByHash`, `saveImportedCapacity`.
3. Adapter `buildCapacityResolver()` / boucle de résolution dans `encounterFactory.mjs` pour charger la bibliothèque
   d'import (priorité 3), appliquer la logique hash → nom → création décrite en §4, et persister chaque capacité
   créée dans le pack d'import plutôt qu'en texte seul.
4. Exporter `computeContentHash` depuis `src/importers/cof2/index.mjs`.
5. Vérification manuelle sur instance Foundry locale (`http://localhost:31000/game`, cf. mémoire dev env) : importer
   deux fois le statblock Centaure, confirmer qu'aucune capacité n'est dupliquée, que `Charge (difficulté 16)` et
   `Charge (difficulté 13)` restent deux entrées distinctes, que les flags `warbound.imported`/`reviewStatus` sont
   présents, et que `cof2-base.cof-2-base-items` n'est pas modifié.

---

## 6. Fichiers probablement modifiés

- Nouveaux : `src/importers/cof2/library/contentHash.mjs`, `src/importers/cof2/library/contentHash.test.mjs`,
  `scripts/importers/cof2/importLibrary.mjs`.
- Modifiés : `scripts/importers/cof2/encounterFactory.mjs`, `src/importers/cof2/index.mjs`.

---

## 7. Tests attendus

- `node --test` couvre `contentHash.test.mjs` (module pur, sans Foundry ni réseau).
- `scripts/importers/cof2/importLibrary.mjs` et l'intégration dans `encounterFactory.mjs` dépendent de l'API
  Foundry (`game.packs`, `CompendiumCollection`) : non testables par `node --test` (cohérent avec le reste du repo,
  cf. convention `scripts/` vs `src/`), validés par la vérification manuelle de l'étape 5.
- Les 5 critères d'acceptation de l'issue #6 sont couverts par la vérification manuelle : pas de duplication à
  hash identique, distinction `Charge (16)`/`Charge (13)`, flags présents, aucune écriture `cof2-base`, pack créé
  automatiquement si absent.

---

## 8. Risques et mitigations

- **Risque** : `CompendiumCollection.createCompendium` peut échouer sans droits GM suffisants sur l'instance.
  **Mitigation** : documenter le prérequis (import réservé au GM), échec explicite avec message clair plutôt que
  silencieux.
- **Risque** : confusion entre dédoublonnage par hash (priorité 3 bibliothèque) et le matching par nom du resolver
  officiel (priorités 1-2, `capacityResolver.mjs`) — les deux logiques coexistent avec des critères différents.
  **Mitigation** : la bibliothèque d'import n'intervient qu'après échec des priorités 1-2 ; contrat de
  `capacityResolver.mjs` non modifié, documenté explicitement en §4.
- **Risque** : volumétrie/croissance non bornée du pack d'import si le dédoublonnage par hash échoue silencieusement
  (ex. sérialisation instable des `parameters`).
  **Mitigation** : `computeContentHash` testé unitairement pour la stabilité avant intégration Foundry.

---

## 9. Critères d'arrêt

- Les 5 critères d'acceptation de l'issue #6 sont vérifiés manuellement sur l'instance Foundry locale.
- `contentHash.test.mjs` passe (`node --test`).
- Aucune écriture n'est introduite vers `cof2-base.cof-2-base-items` dans le nouveau code.
- `capacityResolver.mjs` (#5) reste inchangé.

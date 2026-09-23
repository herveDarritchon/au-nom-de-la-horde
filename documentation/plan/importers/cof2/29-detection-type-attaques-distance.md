# Plan d'implémentation — Corriger la détection du type des attaques à distance

**Issue** : [#29 — [Importer COF2] Corriger la détection du type des attaques à distance](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/29)
**Module(s) impacté(s)** : `src/importers/cof2/resolution/attackTypeResolver.mjs` (nouveau),
`src/importers/cof2/parsing/statblockParser.mjs`, `scripts/importers/cof2/cof2Adapter.mjs`,
`scripts/importers/cof2ImportWizard.mjs`

---

## 1. Objectif

Faire résoudre le `kind` (`melee`/`ranged`/`magical`) d'une attaque extraite d'un statblock via la chaîne
« nom → groupe d'arme COF2 (`martialTrainingsWeapons`) → équipement COF2 (`martialCategory`) → action COF2
(`action.type`) », en réutilisant dynamiquement le référentiel exposé par le système COF2, sans dupliquer de liste
métier codée en dur (`rangedWeapons[]`/`rangedGroups[]`). Fallback conservateur `melee` inchangé si la résolution
échoue à n'importe quelle étape.

---

## 2. Périmètre

### Inclus

- Un module pur `attackTypeResolver.mjs` (aucun appel `game`/`Actor`/`Item`/`foundry.*`), recevant un index déjà
  chargé `nom normalisé → "melee"|"ranged"|"magical"` et l'appliquant à une ligne d'attaque parsée, avec priorité à
  l'information explicite du statblock (portée/préfixe) sur l'index.
- Normalisation du nom (`normalizeWeaponName`) : insensible à la casse, aux accents, aux espaces multiples/en bord.
- Construction impure de l'index dans `cof2Adapter.mjs` : lecture de `game.system.CONST.martialTrainingsWeapons`
  (label localisé via `game.i18n.localize`), résolution du groupe → recherche de l'équipement correspondant dans
  `game.packs.get("cof2-base.cof-2-base-items")` (`type = equipment`, `system.subtype = weapon`,
  `system.martialCategory = <clé du groupe>`) → lecture de `action.type` sur `system.actions`.
- Petite table d'alias uniquement pour variantes typographiques d'extraction PDF réellement observées (jamais de
  logique métier `"arc long" → "ranged"` dans les alias).
- Injection de l'index pré-chargé dans `parseStatblock`/`parseAttackLine` (paramètre optionnel), appelée depuis
  `cof2ImportWizard.mjs:391` après construction de l'index via `cof2Adapter.mjs`.
- Tests unitaires purs (`node --test`) sur `attackTypeResolver.mjs`, incluant le cas Centaure complet
  (Sabots/Épée longue → `melee`, Arc long → `ranged`) et une table paramétrée sur plusieurs groupes COF2
  (arcs, arbalètes, armes de jet, armes à poudre) tirée du tableau de l'issue.
- Non-régression : fallback `melee` conservé si aucun index n'est fourni (compat rétroactive des appels existants
  sans index, ex. tests actuels de `statblockParser.test.mjs`) et pour toute attaque naturelle non trouvée
  (Sabots, Griffes, Morsure, Tentacules).

### Hors scope

- Câblage complet dans l'UI de prévisualisation au-delà du point d'appel `cof2ImportWizard.mjs:391` déjà identifié
  (pas de nouvelle UI demandée par l'issue).
- Utilisation de `system.range` comme indice secondaire (étape 6 de l'algorithme proposé dans l'issue) : non
  couverte par les critères d'acceptation explicites ; à traiter dans une story ultérieure si un cas réel l'exige.
- Détection de portée explicite dans le texte du statblock au-delà de ce que `parseAttackLine` gère déjà
  (`ATTACK_RE`, pattern `(portée X m)`) — logique déjà présente, non modifiée.
- Modification du modèle `AttackDraft`/`itemFactory.mjs` : `kind` reste la seule sortie consommée en aval, déjà
  correctement câblée.

---

## 3. Constat sur l'existant

- `parseAttackLine` (`statblockParser.mjs:176-188`) fixe `kind = "melee"` par défaut, ne bascule en `ranged`/`magical`
  que sur portée explicite ou préfixe `attaque à distance`/`attaque magique`. Aucune connaissance du référentiel
  d'armes COF2.
- Aucune référence existante à `martialTrainingsWeapons`/`martialCategory` dans le code (`grep` négatif sur
  `src/importers` et `scripts/importers`) : à construire entièrement.
- `src/importers/cof2/` est strictement pur (contrainte vérifiée et documentée par la story #5) ; toute connaissance
  de l'API COF2 spécifique doit rester dans `scripts/importers/cof2/cof2Adapter.mjs`, seul fichier explicitement
  désigné pour ça (commentaire d'en-tête du fichier).
- `encounterFactory.mjs:53-64` (`buildCapacityResolver`) est le précédent direct à reproduire : lecture impure du
  pack officiel → construction d'un resolver pur avec données déjà chargées. Même `PACK_ID` réutilisable
  (`cof2-base.cof-2-base-items`).
- Seul point d'appel de `parseStatblock` hors tests : `cof2ImportWizard.mjs:391`, actuellement sans second argument.

---

## 4. Décisions d'architecture

- Nouveau module pur `src/importers/cof2/resolution/attackTypeResolver.mjs`, dans le même dossier que
  `capacityResolver.mjs`, suivant le même style (fonctions exportées, JSDoc, pas de classe) :
  - `normalizeWeaponName(value)` : NFD + suppression diacritiques + lowercase + trim + collapse espaces.
  - `makeAttackTypeResolver({ weaponTypeByName, aliases })` → `(name) => "melee"|"ranged"|"magical"|null` :
    normalise le nom (en appliquant d'abord un alias éventuel), cherche dans `weaponTypeByName`
    (`Map<string,string>` déjà normalisé par l'appelant), retourne `null` si absent (jamais un guess).
  - `resolveAttackKind({ name, explicitRange, explicitPrefixKind }, resolver)` : priorité 1 = information explicite
    du statblock (portée/préfixe, logique actuelle inchangée) ; priorité 2 = `resolver(name)` si fourni et non
    `null` ; fallback = `"melee"`.
- `parseAttackLine(line, { attackTypeResolver } = {})` (paramètre optionnel, rétrocompatible) appelle
  `resolveAttackKind` avec le resolver injecté ; `parseStatblock(text, { attackTypeResolver } = {})` propage le
  même paramètre optionnel à `parseAttackLine`. Sans resolver fourni, comportement strictement identique à
  aujourd'hui (non-régression des tests existants).
- `cof2Adapter.mjs` gagne une fonction impure `buildWeaponTypeIndex()` (async) :
  1. Lit `game.system.CONST.martialTrainingsWeapons`, localise chaque `label` (`game.i18n.localize`), normalise
     (réutilise `normalizeWeaponName` importé depuis le module pur) → `Map<nomNormalisé, groupKey>`.
  2. Lit l'index du pack `game.packs.get("cof2-base.cof-2-base-items")`, filtre `type = equipment`,
     `system.subtype = weapon`, regroupe par `system.martialCategory`.
  3. Pour chaque équipement trouvé, charge le document (`pack.getDocument`) et lit `system.actions` pour en extraire
     le premier `action.type ∈ {melee, ranged, magical}`.
  4. Fusionne en `Map<nomNormalisé, attackType>` (`weaponTypeByName`), retournée avec un `aliases` fixe (petite table
     de variantes d'extraction PDF connues, vide au départ, extensible sans toucher la logique).
  - Si `game.system.CONST.martialTrainingsWeapons` ou le pack sont absents (contexte non-Foundry, tests, pack non
    installé), retourne `{ weaponTypeByName: new Map(), aliases: {} }` (resolver pur reçoit alors un index vide →
    fallback `melee` naturel, cohérent avec le principe du fallback conservateur de l'issue).
- `cof2ImportWizard.mjs:391` : avant `parseStatblock`, appelle `await buildWeaponTypeIndex()`, construit
  `makeAttackTypeResolver(...)`, passe `{ attackTypeResolver }` à `parseStatblock`.
- Aucune liste métier `rangedWeapons[]`/`rangedGroups[]` introduite en dur : la seule donnée statique acceptée est la
  petite table d'alias typographiques, qui ne porte jamais de valeur `melee`/`ranged`/`magical` elle-même.

---

## 5. Plan de travail

1. Créer `src/importers/cof2/resolution/attackTypeResolver.mjs` avec `normalizeWeaponName`,
   `makeAttackTypeResolver`, `resolveAttackKind`.
2. Écrire `attackTypeResolver.test.mjs` : normalisation (casse/accents/espaces), résolution priorité
   explicite > index > fallback `melee`, table paramétrée sur les groupes de l'issue (`longBow`, `shortBow`,
   `lightCrossbow`, `heavyCrossbow`, `sling`, `javelin`, `musket`, `longSword` → `melee`), attaque naturelle
   inconnue (`Sabots`) → `melee` sans erreur.
3. Adapter `parseAttackLine`/`parseStatblock` (`statblockParser.mjs`) pour accepter et propager l'`attackTypeResolver`
   optionnel, en réutilisant `resolveAttackKind`.
4. Étendre `statblockParser.test.mjs` : cas Centaure complet avec un resolver factice (`Map` en dur dans le test,
   sans dépendance Foundry) vérifiant `Sabots/Épée longue → melee`, `Arc long → ranged` ; non-régression sans
   resolver fourni (comportement actuel inchangé).
5. Ajouter `buildWeaponTypeIndex()` dans `cof2Adapter.mjs`, avec tests `cof2Adapter.test.mjs` mockant
   `game.system.CONST.martialTrainingsWeapons`, `game.i18n.localize`, `game.packs`.
6. Câbler `cof2ImportWizard.mjs:391` : construire l'index puis passer `attackTypeResolver` à `parseStatblock`.
7. Relire pour confirmer qu'aucun appel `game`/`Actor`/`Item`/`foundry.*` n'existe dans
   `src/importers/cof2/resolution/attackTypeResolver.mjs` ni dans `statblockParser.mjs`.

---

## 6. Fichiers probablement modifiés

- Nouveaux : `src/importers/cof2/resolution/attackTypeResolver.mjs`,
  `src/importers/cof2/resolution/attackTypeResolver.test.mjs`.
- Modifiés : `src/importers/cof2/parsing/statblockParser.mjs`, `src/importers/cof2/parsing/statblockParser.test.mjs`,
  `scripts/importers/cof2/cof2Adapter.mjs`, `scripts/importers/cof2/cof2Adapter.test.mjs`,
  `scripts/importers/cof2ImportWizard.mjs`.

---

## 7. Tests attendus

- `node --test` couvre `attackTypeResolver.test.mjs` (résolution pure) et les cas ajoutés dans
  `statblockParser.test.mjs`, sans réseau ni instance Foundry.
- Cas Centaure : `Sabots → melee`, `Épée longue → melee`, `Arc long → ranged`.
- Table paramétrée : arcs, arbalètes, armes de jet, armes à poudre → `ranged` ; `longSword` → `melee`.
- Variantes de casse/accents/espaces (`ARC LONG`, `arc long`, `Arc   long`) → résolvent toutes au même groupe
  `longBow` → `ranged`.
- Attaque naturelle inconnue du référentiel → `melee`, sans exception levée.
- `cof2Adapter.test.mjs` : `buildWeaponTypeIndex()` retourne un index vide (fallback `melee` en aval) si
  `game.system.CONST.martialTrainingsWeapons` ou le pack sont absents.

---

## 8. Risques et mitigations

- **Risque** : `system.actions` peut contenir plusieurs actions par équipement (ex. corps-à-corps + distance sur une
  arme hybride), rendant `action.type` ambigu.
  **Mitigation** : prendre la première action dont `type ∈ {melee, ranged, magical}` correspond à la catégorie
  d'arme attendue si documenté, sinon la première trouvée ; documenter la limite plutôt que sur-complexifier sans
  cas réel observé.
- **Risque** : le pack `cof2-base.cof-2-base-items` peut être absent ou son schéma diverger d'une version à l'autre
  du système COF2.
  **Mitigation** : `buildWeaponTypeIndex()` retourne un index vide en cas d'échec (try/catch localisé), le fallback
  `melee` s'applique naturellement, cohérent avec l'algorithme « fallback conservateur » de l'issue.
- **Risque** : confusion entre le principe « pas de liste métier dupliquée » et la petite table d'alias
  typographiques autorisée par l'issue.
  **Mitigation** : les alias ne mappent jamais vers `melee`/`ranged`/`magical`, seulement vers un nom canonique ;
  revue de code à vérifier explicitement sur ce point.

---

## 9. Critères d'arrêt

- Tous les critères d'acceptation de l'issue #29 sont couverts par les tests `node --test` listés en section 7.
- Aucune liste `rangedWeapons[]`/`rangedGroups[]` codée en dur n'existe dans le code de production.
- `src/importers/cof2/resolution/attackTypeResolver.mjs` et `statblockParser.mjs` restent sans appel
  `game`/`Actor`/`Item`/`foundry.*`.
- Le comportement actuel des attaques de mêlée (y compris sans resolver injecté) ne régresse pas.
- Tous les tests (`node --test`) passent.

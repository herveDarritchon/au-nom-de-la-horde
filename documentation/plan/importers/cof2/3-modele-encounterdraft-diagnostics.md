# Plan d'implémentation — Modèle EncounterDraft + diagnostics

**Issue** : [#3 — Story 3 : Modèle EncounterDraft + diagnostics](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/3)
**Epic** : `documentation/cadrage/Epic_Importateur_statblocks_COF2_PDF.md` (section 10 — interfaces
`EncounterDraft`/`AttackDraft`/`CapacityDraft`/`Diagnostic`)
**Bloqué par** : #1 (livré — modules purs sous `src/importers/cof2/parsing/`), #2 (livré — `textReconstruction.mjs`)
**Module(s) impacté(s)** : `src/importers/cof2/parsing/*.mjs`

---

## 1. Objectif

Faire produire par le parseur un objet métier `EncounterDraft` typé et stable, indépendant de Foundry, conforme à
l'interface définie en section 10 de l'Epic : caractéristiques, défense/PV/initiative, attaques et capacités portant
chacune un niveau de confiance (`high`/`medium`/`low`), et une liste de diagnostics à codes stables (au lieu des
chaînes `warnings`/`errors` libres actuelles). La provenance (`rawText`) doit rester accessible sur le draft.

---

## 2. Périmètre

### Inclus

- Interfaces (au sens JSDoc, projet en `.mjs` pur) `EncounterDraft`, `AttackDraft`, `CapacityDraft`, `Diagnostic`,
  conformes à l'Epic section 10.
- Les 7 codes de diagnostic stables : `PDF_NOISE_REMOVED`, `ATTACK_DAMAGE_RECONNECTED`, `AMBIGUOUS_CAPACITY`,
  `CAPACITY_PARAMETER_MISMATCH`, `UNSUPPORTED_AUTOMATION`, `MISSING_ABILITY`, `MULTIPLE_STATBLOCKS`.
- Un niveau de confiance sur chaque `AttackDraft` et chaque `CapacityDraft`.
- Refactor de `parseStatblock` (`statblockParser.mjs`) pour qu'il retourne un `EncounterDraft`, sans aucun appel à
  une API Foundry (`game`, `Actor`, `Item`, `foundry.*`).
- Le cas Centaure produit un draft avec : nom, NC, catégorie, taille, 7 caractéristiques, DEF, PV, Init, 3 attaques,
  4 capacités.
- Tests vérifiant la structure du draft indépendamment de Foundry.

### Hors scope

- Resolver multi-compendium et résolution effective des capacités (`capacityMatcher.mjs` reste inchangé) : les
  champs `originPath` et `resolution` de `CapacityDraft` restent non renseignés par cette story (Story 5).
- UI de preview/wizard (Story 4).
- Item Factory, automatisation, transaction/rollback (Stories 6 à 10).
- Tout changement du comportement de reconnaissance déjà couvert par les Stories 1-2 (normalisation,
  reconstruction, regex de parsing) : cette story ne fait que reformer la sortie, pas la logique de reconnaissance.

---

## 3. Constat sur l'existant

`parseStatblock` (`src/importers/cof2/parsing/statblockParser.mjs`) retourne aujourd'hui un objet plat ad hoc :

```js
{ name, nc, category, size, abilities, def, hp, init, dr, notes, attacks, capacities, warnings, errors,
  rawText, normalizedText }
```

- `warnings`/`errors` sont des chaînes françaises libres (ex. `"Aucune attaque reconnue."`,
  `` `${skipped} ligne(s) avant le nom ignorée(s).` ``), sans code stable ni sévérité, non testables sans dépendre du
  texte exact du message.
- `attacks` (`parseAttackLine`) et `capacities` (`matchTitle`) n'ont pas de champ `confidence` ni `raw` conforme à
  `AttackDraft`/`CapacityDraft`.
- `category`/`size` sont déjà des chaînes proches des enums cibles (`EncounterCategory`/`EncounterSize`) mais ne
  sont pas déclarées comme telles.
- Aucun `source` (`ImportSource`) n'est actuellement porté par le résultat.
- Le module reste pur (aucun `game`/`Actor`/`Item`/`foundry.*`) : cette garantie des Stories 1-2 est à préserver.

---

## 4. Décisions d'architecture

- Nouveau module pur `src/importers/cof2/parsing/encounterDraft.mjs`, sans dépendance Foundry, portant :
  - les constructeurs de diagnostics codés, un par code (`pdfNoiseRemoved(fragment)`,
    `attackDamageReconnected(fragment)`, `ambiguousCapacity(fragment)`, `capacityParameterMismatch(fragment)`,
    `unsupportedAutomation(fragment)`, `missingAbility(ability)`, `multipleStatblocks()`), chacun retournant un
    `Diagnostic` `{ severity, code, message, sourceFragment? }` ;
  - une fonction `toEncounterDraft(parsed, source)` qui assemble l'`EncounterDraft` final à partir du résultat
    interne du parseur.
- `parseAttackLine` (dans `statblockParser.mjs`) est enrichi pour retourner un objet conforme à `AttackDraft`
  (`raw`, `name`, `kind`, `bonus`, `damage`, `range`, `extra`, `confidence`). Règle de confiance : `high` par défaut
  sur une correspondance directe de `ATTACK_RE` avec `DM` présent sur la même ligne ; `medium` si le `DM` a dû être
  reconnecté depuis la ligne suivante (cas déjà géré par `reconstructSegments` en amont — associé au diagnostic
  `ATTACK_DAMAGE_RECONNECTED`) ; `low` si `damage` est vide.
- `matchTitle` est enrichi pour retourner un objet conforme à `CapacityDraft` minimal (`rawName`, `name`,
  `description`, `actionType: null`, `frequency: null`, `parameters: {}`, `confidence`). Règle de confiance : `high`
  par défaut ; `medium` si le nom brut contient une variante paramétrée entre parenthèses non encore résolue.
  `actionType`/`frequency`/`originPath`/`resolution` restent `null`/absents (hors scope, Story 5/8).
- Les `warnings.push("...")`/`errors.push("...")` actuels de `statblockParser.mjs` sont remplacés par des appels aux
  constructeurs de `encounterDraft.mjs`, avec mapping explicite :
  - ligne(s) ignorée(s) avant le nom, second statblock détecté → `MULTIPLE_STATBLOCKS` ou diagnostic `info` dédié
    selon le cas (à trancher au moment de l'implémentation selon le sens exact du message existant) ;
  - caractéristique manquante → `MISSING_ABILITY` (un diagnostic par caractéristique manquante, `sourceFragment`
    = nom de la caractéristique) ;
  - "Aucune attaque reconnue" et autres cas sans code des 7 existants → conservés en `Diagnostic` avec un code
    interne cohérent le plus proche, sans inventer de 8e code hors périmètre sauf si un cas concret l'exige — dans
    ce cas, documenter le choix dans le code plutôt que de forcer un mauvais mapping.
  - lignes de bruit déjà supprimées par `textReconstruction.mjs` (Story 2) : si `stripPdfNoise` expose un compte de
    lignes retirées, le traduire en un diagnostic `PDF_NOISE_REMOVED` porté par `EncounterDraft.diagnostics` plutôt
    que de le laisser invisible.
- `source` (`ImportSource`) : à défaut de spécification plus fine dans l'Epic à ce stade, un objet minimal
  `{ rawText }` suffit pour cette story ; l'enrichissement (nom de fichier, horodatage, etc.) reste ouvert aux
  stories suivantes si besoin.
- Pas de nouvelle dépendance externe.

---

## 5. Plan de travail

1. Créer `src/importers/cof2/parsing/encounterDraft.mjs` avec les constructeurs de diagnostics codés et
   `toEncounterDraft(parsed, source)`.
2. Enrichir `parseAttackLine` pour calculer et retourner `confidence` (et exposer `raw` = la ligne source).
3. Enrichir `matchTitle` pour retourner la forme `CapacityDraft` minimale avec `confidence`.
4. Adapter `parseStatblock` dans `statblockParser.mjs` pour :
   - remplacer les `warnings`/`errors` libres par des appels aux constructeurs de diagnostics ;
   - construire et retourner un `EncounterDraft` via `toEncounterDraft` en fin de fonction.
5. Adapter `statblockParser.test.mjs` (et tout test consommant l'ancien format `warnings`/`errors`/`attacks`/
   `capacities` plats) à la nouvelle structure `EncounterDraft`/`diagnostics`.
6. Écrire `src/importers/cof2/parsing/encounterDraft.test.mjs` (`node --test`) couvrant : chaque constructeur de
   diagnostic produit un code stable et une sévérité correcte, `toEncounterDraft` assemble correctement un draft
   minimal.
7. Étendre le test Centaure (`statblockParser.test.mjs`) pour vérifier la structure complète du draft : nom, NC,
   catégorie, taille, 7 caractéristiques, DEF, PV, Init, exactement 3 attaques et 4 capacités, chacune avec un champ
   `confidence` défini, et `diagnostics` composé uniquement de codes parmi les 7 listés.
8. Relire pour confirmer qu'aucun appel Foundry (`game`, `Actor`, `Item`, `foundry.*`) n'a été introduit dans
   `src/importers/cof2/parsing/`.

---

## 6. Fichiers probablement modifiés

- Nouveaux : `src/importers/cof2/parsing/encounterDraft.mjs`, `src/importers/cof2/parsing/encounterDraft.test.mjs`.
- Modifiés : `src/importers/cof2/parsing/statblockParser.mjs` (diagnostics codés, retour `EncounterDraft`),
  `src/importers/cof2/parsing/statblockParser.test.mjs` (migration vers la nouvelle structure, cas Centaure étendu),
  `src/importers/cof2/index.mjs` (réexport de `encounterDraft.mjs` si utile côté commande de debug).

---

## 7. Tests attendus

- `node --test` exécute `encounterDraft.test.mjs` et les cas migrés/ajoutés dans `statblockParser.test.mjs` sans
  dépendance Foundry.
- Le cas Centaure produit un `EncounterDraft` avec nom, NC, catégorie, taille, 7 caractéristiques, DEF, PV, Init,
  exactement 3 attaques et 4 capacités, chacune avec un niveau de confiance renseigné.
- Aucun diagnostic du draft n'a un `code` hors des 7 codes stables listés en section 10 de l'Epic.
- Les tests existants des Stories 1-2 (fixtures `centaure.txt`, `centaure-pdf-brut.txt`, `statblock-une-ligne.txt`)
  continuent de passer une fois migrés vers la nouvelle structure de sortie.

---

## 8. Risques et mitigations

- **Risque** : rupture des tests Story 1/2 qui consomment l'ancien format plat (`warnings`/`errors`/`attacks`/
  `capacities` sans `confidence`).
  **Mitigation** : migration explicite de ces tests incluse dans le plan de travail (étape 5), pas de compatibilité
  ascendante à maintenir en parallèle.
- **Risque** : sur-ingénierie du mapping de confiance (heuristiques non justifiées par un cas réel).
  **Mitigation** : règle simple et documentée dans le code (`high` par défaut, `medium`/`low` réservés aux cas déjà
  détectés aujourd'hui par un warning ou par un diagnostic de reconstruction), pas d'heuristique supplémentaire non
  spécifiée par l'Epic.
- **Risque** : certains messages `warnings`/`errors` actuels ne correspondent à aucun des 7 codes stables.
  **Mitigation** : documenter au cas par cas dans le code le choix de mapping le plus proche, plutôt que d'inventer
  un 8e code non prévu par l'Epic ; si aucun mapping raisonnable n'existe, signaler la limite dans un commentaire
  plutôt que de forcer une correspondance trompeuse.

---

## 9. Critères d'arrêt

- `parseStatblock` retourne un `EncounterDraft` typé conforme à l'Epic section 10, sans aucun appel à une API
  Foundry.
- Les diagnostics du draft possèdent tous un code stable parmi les 7 listés (pas de message ad hoc en tant que
  code).
- Chaque `AttackDraft` et chaque `CapacityDraft` porte un niveau de confiance.
- Le cas Centaure produit un draft avec : nom, NC, catégorie, taille, 7 caractéristiques, DEF, PV, Init, 3 attaques,
  4 capacités.
- Tous les tests (`node --test`) passent, y compris ceux des Stories 1-2 migrés vers la nouvelle structure.
- Aucun appel direct à `game`, `Actor`, `Item` ou toute autre API Foundry ne subsiste dans
  `src/importers/cof2/parsing/`.

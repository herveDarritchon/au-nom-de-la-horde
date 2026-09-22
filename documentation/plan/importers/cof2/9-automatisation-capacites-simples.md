# Plan d'implémentation — Automatisation de capacités simples

**Issue** : [#9 — Story 9 : Automatisation de capacités simples](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/9)
**Epic** : `documentation/cadrage/Epic_Importateur_statblocks_COF2_PDF.md` (§17 « Automatisation mécanique
progressive — Niveau B »)
**Bloqué par** : #7 (livré — `itemFactory.mjs`/`actorFactory.mjs`/`cof2Adapter.mjs`/`encounterFactory.mjs`)
**Module(s) impacté(s)** : `src/importers/cof2/parsing/capacityAutomation.mjs` (nouveau),
`src/importers/cof2/parsing/statblockParser.mjs`, `src/importers/cof2/parsing/encounterDraft.mjs`,
`scripts/importers/cof2/itemFactory.mjs`

---

## 1. Objectif

Pour les capacités **nouvellement créées** (statut `NOT_FOUND`, sans template officiel), mapper automatiquement
sur des champs structurés Foundry les deux patterns niveau B qui ont une cible fiable et déterministe dans le
schéma COF2 : le temps d'action (`(L)`, `(A)`, `(M)`, `(G)` → `system.actionType`) et la fréquence explicite
(`1 fois/combat`, `1 fois/jour` → `system.frequency`). Les trois autres patterns candidats (états COF2, test de
caractéristique, bonus numérique) sont détectés avec un niveau de confiance mais restent en texte pur : aucun champ
Foundry n'est écrit pour eux en v1, conformément à la mise en garde de l'Epic §17 (« une automatisation partielle
mais juste est préférable à une automatisation complète mais fausse »).

---

## 2. Périmètre

### Inclus

- Détection de la fréquence explicite dans le texte de description d'une capacité (`1 fois/combat`,
  `1 fois par combat`, `1 fois/jour`, `1 fois par jour`, insensible à la casse) et écriture sur `system.frequency`
  (`combat`/`daily`) de l'Item `capacity` créé.
- Propagation du temps d'action déjà extrait au parsing (`extractActionType`, `CapacityDraft.actionType`) jusqu'à
  l'Item créé : écriture sur `system.actionType` (lettre minuscule `l`/`a`/`m`/`g`).
- Détection informative (regex + niveau de confiance) des trois autres patterns niveau B — états COF2 explicites
  (`renversé`, `étourdi pendant X round`), test de caractéristique (`test de FOR difficulté 16`), bonus numérique
  simple (`+5 en discrétion en forêt`) — sans écriture de champ Foundry : un pattern reconnu mais non structuré
  émet un diagnostic `UNSUPPORTED_AUTOMATION` informatif, la description textuelle reste inchangée.
- Non-blocage : un pattern non reconnu (aucun des 5) ne produit aucun diagnostic et ne bloque jamais la création.
- Tests unitaires purs (`node --test`) pour les 5 patterns : les 2 avec mapping structuré, les 3 avec détection
  informative.

### Hors scope

- Construction d'un squelette `actions[]/resolvers[]` pour une capacité créée sans template officiel (nécessaire
  pour mapper structurellement test de caractéristique ou bonus numérique) : jamais fait à ce jour pour des
  capacités `NOT_FOUND`, effets complexes niveau C de l'Epic §17 — hors scope de cette story.
- Mapping structuré des états COF2 (Active Effects, conditions) : aucun point d'ancrage fiable existant côté
  `itemFactory.mjs` pour des capacités sans template — détection informative uniquement.
- Modification du contrat public de `capacityResolver.mjs` (#5/#8) : statuts de résolution inchangés.
- Modification de `encounterFactory.mjs` au-delà de la propagation naturelle des champs déjà présents sur
  `CapacityDraft` (aucune nouvelle branche de résolution).
- Détection de patterns ailleurs que dans la description assemblée d'une capacité (pas de scan du nom ou des
  notes générales du statblock).

---

## 3. Constat sur l'existant

- `extractActionType` (`capacityResolver.mjs:29-33`) extrait déjà `L`/`A`/`M`/`G` au parsing (`matchTitle`,
  `statblockParser.mjs:175-177`) : `CapacityDraft.actionType` est donc déjà correctement rempli pour toute nouvelle
  capacité — l'AC #1 de l'issue est déjà satisfait côté parsing. Le manquement est en aval :
  `buildCapacityItemData` (`itemFactory.mjs:63-76`) construit l'Item `capacity` sans jamais lire `cap.actionType`
  ni écrire `system.actionType` — le temps d'action détecté est silencieusement perdu à la création.
- `CapacityDraft.frequency` existe dans le typedef (`encounterDraft.mjs:34`) et dans `computeContentHash`
  (`encounterFactory.mjs:46`, déjà utilisé pour le hash) mais `matchTitle` le fixe toujours à `null`
  (`statblockParser.mjs:177`) : aucune détection de fréquence n'existe dans le texte de description — l'AC #2 n'est
  pas satisfait.
- Schéma Foundry confirmé par lecture directe du compendium :
  `compendiums/items/capacity_Charge__13__ObyyF3lgCpQgoyMQ.yml` → `system.actionType: l` (lettre minuscule,
  racine de `system`) ; `compendiums/items/capacity_Attaque_paralysante_uAwwMzAT9ueWQJr5.yml` →
  `system.frequency: combat` (enum scalaire, même niveau que `actionType`, pas imbriqué dans `actions[]`).
  Recensement des valeurs (`grep -h "frequency:" compendiums/items/*.yml`) : `none` (198), `combat` (12),
  `daily` (8) — confirme les deux seules valeurs à détecter.
- Diagnostics déjà codés et sans appelant à ce jour pour ce cas précis : `unsupportedAutomation` (`fragment) =>`,
  `encounterDraft.mjs:97-99`) est déjà utilisé une fois pour un cas de réduction des dégâts non automatisable
  (`statblockParser.mjs:95`) — même mécanisme réutilisable tel quel pour états/test/bonus.
- `capacityVariant.mjs` (Story 8) fournit déjà une regex de détection de test de caractéristique
  (`/difficult[ée]\s*(\d+)/i`, via `detectParameter`) réutilisable pour la détection informative du pattern
  « test de FOR difficulté N » sans dupliquer la logique.
- `buildCapacityItemData(cap, options)` (`itemFactory.mjs:63-76`) ne construit aujourd'hui que
  `{name, type, system:{description, learned, path}}` : aucun champ `actionType`/`frequency` n'existe dans l'objet
  produit, contrairement à ce que le compendium officiel attend.

---

## 4. Décisions d'architecture

- Nouveau module pur `src/importers/cof2/parsing/capacityAutomation.mjs` (même famille que
  `src/importers/cof2/resolution/capacityVariant.mjs`, dossier `parsing` car opère sur le texte de description
  assemblée, pas sur une résolution de référentiel) :
  - `detectFrequency(description)` → `{period:"combat"|"daily", confidence:"high"}` sur les 4 formes listées en
    §2, `null` sinon.
  - `detectState(description)`, `detectAbilityTest(description)`, `detectNumericBonus(description)` → chacune
    `{pattern:string, confidence:"medium"|"low"}` sur le fragment reconnu, ou `null`. Detection informative
    uniquement, jamais de mutation de la description. `detectAbilityTest` réutilise la même regex de
    caractéristique que `capacityVariant.mjs` (`/test de (FOR|AGI|CON|PER|CHA|INT|VOL)\s+difficult[ée]\s*(\d+)/i`).
  - Aucune de ces fonctions ne lève : entrée non concluante → `null`, jamais d'exception (cohérent avec la
    contrainte de non-blocage de l'AC #3).
- `src/importers/cof2/parsing/encounterDraft.mjs` : précise le typedef `CapacityDraft.frequency` en
  `{period:"combat"|"daily"}|null` (au lieu de `object|null` générique) pour documenter la forme produite par
  `detectFrequency`.
- `statblockParser.mjs` : au moment où la description d'une capacité est complète (capacité suivante détectée via
  `matchTitle`, ou fin de boucle du corps), appelle `detectFrequency(current.description)` pour remplir
  `current.frequency` (remplace le `null` fixe), puis les 3 fonctions de détection informative ; chaque résultat
  non nul pousse un diagnostic `unsupportedAutomation(pattern)` dans `diagnostics` (aucun diagnostic si tout est
  `null`).
- `scripts/importers/cof2/itemFactory.mjs` → `buildCapacityItemData` : ajoute `system.actionType = cap.actionType
  ?? ""` et `system.frequency = cap.frequency?.period ?? "none"` aux données construites — seule modification
  structurelle de cette story, cohérente avec le schéma du compendium officiel relevé en §3.
- Pas de changement à `capacityResolver.mjs` ni à la signature publique de `encounterFactory.mjs` : les champs
  `actionType`/`frequency` transitent déjà sans modification de contrat (`cap.actionType`/`cap.frequency` déjà lus
  par `computeContentHash`).

---

## 5. Plan de travail

1. Créer `src/importers/cof2/parsing/capacityAutomation.mjs` (`detectFrequency`, `detectState`,
   `detectAbilityTest`, `detectNumericBonus`) + `capacityAutomation.test.mjs` : les 4 formes de fréquence, absence
   de fréquence, un cas positif et un cas négatif par fonction de détection informative, non-mutation de
   l'argument `description`.
2. Étendre `src/importers/cof2/index.mjs` pour réexporter les 4 fonctions.
3. Adapter `statblockParser.mjs` : appel des détections au moment de finalisation d'une capacité, remplissage de
   `current.frequency`, émission des diagnostics `unsupportedAutomation`. Étendre
   `statblockParser.test.mjs` : capacité avec `1 fois/combat` → `frequency:{period:"combat"}` ; capacité avec état
   décrit → diagnostic `UNSUPPORTED_AUTOMATION` présent, description inchangée ; capacité sans aucun pattern →
   `frequency:null`, aucun diagnostic ajouté ; non-régression sur `actionType` déjà extrait.
4. Adapter `buildCapacityItemData` (`itemFactory.mjs`) pour écrire `system.actionType`/`system.frequency`. Étendre
   `itemFactory.test.mjs` : les 4 temps d'action + absence, les 2 fréquences + absence (`"none"`).
5. Préciser le typedef `CapacityDraft.frequency` dans `encounterDraft.mjs`.
6. Vérification manuelle sur instance Foundry locale (`http://localhost:31000/game`) : importer un statblock de
   test contenant une capacité `(A)` avec `1 fois/combat` dans sa description, vérifier que l'Item `capacity` créé
   a bien `system.actionType: "a"` et `system.frequency: "combat"`.

---

## 6. Fichiers probablement modifiés

- Nouveaux : `src/importers/cof2/parsing/capacityAutomation.mjs`,
  `src/importers/cof2/parsing/capacityAutomation.test.mjs`.
- Modifiés : `src/importers/cof2/index.mjs`, `src/importers/cof2/parsing/statblockParser.mjs`,
  `src/importers/cof2/parsing/statblockParser.test.mjs`, `src/importers/cof2/parsing/encounterDraft.mjs`,
  `scripts/importers/cof2/itemFactory.mjs`, `scripts/importers/cof2/itemFactory.test.mjs`.

---

## 7. Tests attendus

- `node --test` couvre `capacityAutomation.test.mjs` (pur), les cas ajoutés dans `statblockParser.test.mjs` et
  `itemFactory.test.mjs`.
- `(A)`, `(L)`, `(M)`, `(G)` → `system.actionType` correctement mappé sur l'Item créé (AC #1).
- `1 fois/combat` (et variantes textuelles) → `system.frequency: "combat"` sur l'Item créé (AC #2) ; `1 fois/jour`
  → `"daily"` ; absence de fréquence → `"none"`.
- Pattern non reconnu (aucun des 5) → création non bloquée, aucun diagnostic ajouté (AC #3, non-blocage).
- État COF2 / test de caractéristique / bonus numérique reconnu → `UNSUPPORTED_AUTOMATION` présent dans les
  diagnostics, description textuelle strictement inchangée (AC #3 partiel, AC #4).
- Effets complexes multi-conditions (aucun des patterns niveau B reconnus) → conservés intégralement en
  description textuelle, aucune mutation (AC #4).
- Non-régression : suite `node --test` existante (`capacityResolver`, `capacityVariant`, `statblockParser`,
  `itemFactory`, `encounterFactory`) continue de passer sans changement de comportement des modules non touchés.

---

## 8. Risques et mitigations

- **Risque** : une fréquence détectée dans une phrase qui n'exprime pas réellement la fréquence de la capacité
  elle-même (ex. citée en exemple dans le texte) produirait un `system.frequency` faux.
  **Mitigation** : regex volontairement stricte (formes `1 fois/X` ou `1 fois par X` uniquement, pas de
  généralisation à `X fois/Y` avec X≠1), confiance `high` réservée à ce cas précis ; toute autre formulation de
  fréquence reste non détectée plutôt que mal détectée.
- **Risque** : sur-promettre l'automatisation des états/test/bonus alors qu'ils restent non structurés en v1 peut
  laisser croire à une prise en charge mécanique complète.
  **Mitigation** : diagnostic `UNSUPPORTED_AUTOMATION` explicite à chaque détection informative (visible dans
  l'UI de prévisualisation existante), scope hors-structuration documenté en §2.
- **Risque** : régression sur des capacités déjà correctement résolues (`EXACT_REUSE`/`TEMPLATE_VARIANT`) qui ne
  passent jamais par `buildCapacityItemData`.
  **Mitigation** : modification isolée à `buildCapacityItemData` (chemin `NOT_FOUND` uniquement) ; les chemins
  `EXACT_REUSE`/`TEMPLATE_VARIANT`/`REUSE_IMPORTED` gardent leur comportement actuel, non touchés par cette story.

---

## 9. Critères d'arrêt

- Les 5 critères d'acceptation de l'issue #9 sont couverts :
  1. `(A)`/`(L)`/`(M)`/`(G)` mappés sur `system.actionType` (test `itemFactory`) ;
  2. `1 fois/combat` mappé sur `system.frequency` (test `itemFactory`) ;
  3. pattern non reconnu → création non bloquée, au plus un diagnostic `UNSUPPORTED_AUTOMATION` (test
     `statblockParser`) ;
  4. effets complexes multi-conditions conservés intégralement en texte (test `statblockParser`) ;
  5. les patterns niveau B listés dans l'issue sont couverts par les tests (`capacityAutomation.test.mjs` +
     `statblockParser.test.mjs` + `itemFactory.test.mjs`).
- `node --test` passe intégralement (nouvelles suites + suites existantes inchangées).
- Contrat public de `capacityResolver.mjs` (#5/#8) inchangé.

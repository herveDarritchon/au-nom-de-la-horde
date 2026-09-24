# Plan d'implémentation — Couverture de non-régression pour l'import des capacités de créature

**Issue** : [#41 — Importer les capacités de créature dans l'Actor Rencontre](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/41)
**Module(s) impacté(s)** : `src/importers/cof2/parsing/statblockParser.test.mjs`,
`src/importers/cof2/parsing/__fixtures__/scorpion-geant.txt` (nouveau fixture),
`scripts/importers/cof2/encounterFactory.test.mjs` (aucun changement de code de production attendu)

---

## 1. Objectif

Verrouiller par des tests automatisés le pipeline complet d'import des **capacités de créature** à partir d'un
statblock COF2 collé (extraction du bloc `TITRE :` → conservation du texte multi-ligne → non-confusion avec les
attaques → résolution/création des `Item` `capacity` dans l'Actor Rencontre), sur le cas de référence de l'issue
(Scorpion géant / Arthropode, capacités `VERMINE`, `CUIRASSÉ`, `POISON`), pour qu'une régression future soit
détectée immédiatement par `node --test`.

## 2. Périmètre

### Inclus

- Un nouveau fixture `src/importers/cof2/parsing/__fixtures__/scorpion-geant.txt` reproduisant le texte exact de
  l'exemple complet de l'issue #41 (statblock Arthropode moyen, 2 attaques `Pinces`/`Dard`, en-tête
  `Capacités communes`, 3 capacités `VERMINE`/`CUIRASSÉ`/`POISON`).
- Un test unitaire dans `statblockParser.test.mjs` couvrant explicitement chaque critère d'acceptation de
  l'issue : 3 capacités détectées dans l'ordre, noms et descriptions multi-lignes complets conservés, `Capacités
  communes` ignoré (diagnostic `PDF_NOISE_REMOVED`, pas une 4ᵉ capacité), les 2 attaques restent dans
  `result.attacks` (jamais dans `result.capacities`), aucune capacité n'absorbe le texte de la suivante.
- Un test d'intégration bout-en-bout dans `encounterFactory.test.mjs` (même patron que le test `Charge` de
  l'issue #38) : `parseStatblock(fixture)` → `createEncounter(draft, ...)`, vérifiant que les 3 capacités
  deviennent bien des `Item` de type `capacity` attachés à l'Actor Rencontre créé, avec leur description complète.
- Une vérification (par un test ciblé ou une assertion dédiée) que le bonus `*` déjà représenté dans
  `result.abilities` (`agi.superior`, `con.superior`, `for.superior`) n'est pas dupliqué par le traitement de la
  capacité `VERMINE` — confirmée par lecture de `capacityAutomation.mjs` : aucune application réelle d'effet
  n'existe actuellement (diagnostics informatifs seulement), donc pas de double application possible ; le test
  documente cette garantie plutôt que de corriger un bug.

### Hors scope

- Toute nouvelle fonctionnalité de parsing, de résolution ou d'automatisation des effets (déplacement 15 m,
  RD 5, dernier round à 0 PV, jets de poison) : explicitement hors périmètre de l'issue #41 elle-même.
- Le wizard d'import (`cof2ImportWizard.mjs`) : le tableau de prévisualisation des capacités existe déjà
  (`#renderCapacitiesTable`) et n'est pas modifié par ce ticket.
- Toute modification de `statblockParser.mjs`, `capacityResolver.mjs`, `itemFactory.mjs` ou `encounterFactory.mjs` :
  le constat (§3) montre que le comportement attendu est déjà correct.

## 3. Constat sur l'existant

Le texte exact de l'exemple de l'issue, passé dans `parseStatblock`, produit déjà le résultat attendu :

- `result.attacks` : `Pinces` (+6, DM 2d6+3) et `Dard` (+6, DM 1d4, extra `+ poison (2d6, difficulté 12 pour
  ½ DM)`) — aucune confusion avec les capacités.
- `result.capacities` : 3 entrées, `Vermine`/`Cuirassé`/`Poison`, chacune avec sa description multi-ligne
  complète reconstituée (les retours à la ligne PDF sont fusionnés en un seul paragraphe par ligne de titre).
- `result.diagnostics` : un seul diagnostic, `PDF_NOISE_REMOVED` sur la ligne `Capacités communes` — traitée
  comme bruit résiduel, jamais comme une 4ᵉ capacité ni comme absorbée par une capacité voisine.

Le reste du pipeline (résolution, création d'`Item`, prévisualisation wizard) est déjà exercé et testé pour
d'autres capacités (`Charge`, `Attaque double`, etc., issue #38) selon le même mécanisme générique
(`matchTitle`/`TITLE_RE`, non limité à une liste fermée) : rien dans le code ne traite `VERMINE`/`CUIRASSÉ`/
`POISON` différemment d'une capacité déjà couverte.

**Ce qui manque réellement** : aucun fixture ni test n'exerce aujourd'hui le cas de *plusieurs capacités
successives sans ligne vide entre elles* combiné à un en-tête de section (`Capacités communes`) et à une
description contenant une parenthèse explicative (`(voir les profils)`) — la combinaison précise citée par
l'issue #41. Une régression future sur `matchTitle`/la boucle de la section 4 de `statblockParser.mjs` (ex. un
changement qui romprait la détection de titre après une ligne de bruit, ou qui laisserait une parenthèse ouverte
avaler la ligne suivante) ne serait pas détectée par la suite actuelle.

## 4. Décisions d'architecture

- Le fixture texte vit à côté des fixtures existants (`__fixtures__/centaure.txt`, `__fixtures__/golem-rd.txt`,
  etc.), même convention de nommage (`scorpion-geant.txt`), chargé par `readFileSync`/`fileURLToPath` comme les
  autres tests du fichier.
- Le test unitaire de `statblockParser.test.mjs` suit le style déjà en place (assertions directes sur le résultat
  de `parseStatblock`, pas de nouvel helper).
- Le test d'intégration de `encounterFactory.test.mjs` réutilise le patron du test `Charge` (issue #38) : mock de
  compendium officiel local à ce test (résolution `NOT_FOUND` pour les 3 capacités, aucune n'existant dans le
  compendium officiel COF2, ce qui est le cas réel pour un monstre spécifique à Warbound), sans toucher au mock
  partagé `setupFoundryMocks`.
- Aucune nouvelle fonction de production, aucun nouveau module.

## 5. Plan de travail

1. Créer `src/importers/cof2/parsing/__fixtures__/scorpion-geant.txt` avec le texte exact de l'exemple complet de
   l'issue #41 (section « Exemple complet »).
2. Ajouter dans `statblockParser.test.mjs` un test `"parseStatblock détecte les capacités de créature successives
   du Scorpion géant (issue #41) : VERMINE, CUIRASSÉ, POISON, sans confusion avec les attaques ni absorption
   mutuelle"` : charge le fixture, appelle `parseStatblock`, vérifie noms/descriptions/ordre des 3 capacités, les
   2 attaques, et le diagnostic unique `PDF_NOISE_REMOVED` sur `Capacités communes`.
3. Ajouter dans `encounterFactory.test.mjs` un test d'intégration `"createEncounter importe le statblock complet
   du Scorpion géant (issue #41) : 3 capacités créées comme Item capacity avec leur texte complet"` suivant le
   patron du test `Charge` (§4).
4. Lancer `node --test` pour confirmer que les nouveaux tests passent et qu'aucune suite existante ne régresse.
5. Ne modifier aucun fichier de production : ticket de test uniquement.

## 6. Fichiers probablement modifiés

- `src/importers/cof2/parsing/__fixtures__/scorpion-geant.txt` (nouveau)
- `src/importers/cof2/parsing/statblockParser.test.mjs`
- `scripts/importers/cof2/encounterFactory.test.mjs`

## 7. Tests attendus

- Les 2 nouveaux tests (§5, points 2-3) passent sur l'état actuel du code.
- `node --test` passe intégralement (suite complète, `src/` et `scripts/`).

## 8. Risques et mitigations

- **Risque** : le fixture texte diverge légèrement de la mise en page réelle d'un PDF exporté (espacement,
  césures) par rapport au texte de l'issue, qui est déjà propre.
  **Mitigation** : dupliquer aussi une variante avec césure PDF simulée (`béné-\nficie`) dans un test ciblé de
  `textReconstruction.mjs` si le temps le permet ; sinon documenter la limite dans le test.
- **Risque** : le mock de compendium du test d'intégration masque un vrai statut `AMBIGUOUS`/`TEMPLATE_VARIANT` si
  une capacité nommée `Poison` existe déjà dans le compendium officiel COF2.
  **Mitigation** : vérifier l'index réel du pack `cof2-base.cof-2-base-items` avant d'écrire le mock, ou accepter
  explicitement le statut renvoyé et l'assertionner tel quel plutôt que de supposer `NOT_FOUND`.

## 9. Critères d'arrêt

- Le test unitaire du Scorpion géant existe et passe, couvrant explicitement tous les critères d'acceptation de
  l'issue #41 relevant du parsing (détection, non-limitation à une liste fermée, non-confusion avec les attaques,
  non-absorption, conservation du nom et de la description multi-ligne, gestion de l'en-tête de section).
- Le test d'intégration bout-en-bout existe et passe, couvrant la création effective des `Item` `capacity` dans
  l'Actor Rencontre.
- `node --test` passe intégralement.
</content>

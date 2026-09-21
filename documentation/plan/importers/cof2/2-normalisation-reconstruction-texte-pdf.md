# Plan d'implémentation — Normalisation et reconstruction du texte PDF

**Issue** : [#2 — Story 2 : Normalisation et reconstruction du texte PDF](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/2)
**Epic** : `documentation/cadrage/Epic_Importateur_statblocks_COF2_PDF.md`
**Bloqué par** : #1 (livré — modules purs extraits sous `src/importers/cof2/parsing/`)
**Module(s) impacté(s)** : `src/importers/cof2/parsing/*.mjs`

---

## 1. Objectif

Séparer, dans le pipeline d'import, une étape explicite de **normalisation et reconstruction** du texte brut
copié-collé depuis un PDF, en amont du parseur de champs (`parseStatblock`). Le parseur ne doit plus consommer
une ligne PDF comme unité sémantique fiable : le nettoyage Unicode, la suppression du bruit, la réparation des
césures et la reconstruction des segments logiques (attaque + DM coupés sur deux lignes, plusieurs champs collés
sur une ligne) doivent être traités avant que `parseStatblock` ne lise ses lignes.

Le résultat de cette étape doit conserver `rawText` (texte original) et `normalizedText` (texte reconstruit)
séparément, pour la traçabilité.

---

## 2. Périmètre

### Inclus

- Normalisation Unicode : espaces insécables (` `, ` `), tirets (`‐-‒−–—`), apostrophes (`'`'`),
  ligatures (`ﬁ`, `ﬂ`), caractères de contrôle.
- Suppression du bruit PDF : numéros de page isolés (ligne ne contenant qu'un nombre), titres courants
  (`BESTIAIRE - ...`, `INTRO`), lettres isolées issues de pictogrammes déjà partiellement traitées par
  `cleanName` mais à généraliser à toute ligne de bruit, pas seulement au nom.
- Réparation des césures : `pié-\ntine` → `piétine`, sans fusionner les vrais mots composés (ex. ne pas fusionner
  un tiret suivi d'un mot déjà complet en fin de ligne qui n'est pas une coupure).
- Reconstruction des segments logiques :
  - une attaque coupée sur deux lignes (`Sabots +7 ·\nDM 1d8+6`) doit être rejointe en un seul segment avant
    d'atteindre `parseAttackLine` ;
  - un statblock entièrement sur une seule ligne (tous les champs collés) doit être segmenté par marqueurs
    syntaxiques COF2 (`NC`, caractéristiques `FOR/AGI/...`, `S Défense`, `V Points de vigueur`, `I Initiative`,
    motif d'attaque `Nom +N · DM ...`, titres `Nom :`).
- Conservation distincte de `rawText` et `normalizedText` dans la sortie de cette étape.
- Fixtures de non-régression représentatives d'un copier-coller PDF réel (bruit, césure, attaques coupées,
  statblock sur une seule ligne), en complément des fixtures déjà "propres" issues de la Story 1.
- Tests couvrant les 6 cas de segmentation listés à l'Epic section 26 (DM sur ligne suivante, plusieurs attaques
  sur une seule ligne, stats + attaques sur une même ligne, capacité sur plusieurs lignes, deux colonnes mal
  extraites) ainsi que les cas de normalisation (espaces insécables, tirets, Unicode, césures, bruit de page).

### Hors scope

- Modèle intermédiaire `EncounterDraft` et diagnostics structurés (Story 3).
- UI de preview/wizard (Story 4).
- Resolver multi-compendium, bibliothèque d'objets importés, item factory (Stories 5 à 10).
- Toute évolution du format de sortie de `parseStatblock` autre que celle nécessaire pour consommer le texte déjà
  normalisé/reconstruit (les champs `name`, `nc`, `abilities`, `attacks`, `capacities`, etc. restent inchangés).
- Le cas "deux colonnes mal extraites" au-delà de ce que permet une reconstruction ligne-à-ligne raisonnable : si
  l'Epic ne fournit pas de fixture réelle pour ce cas, se limiter à un test minimal documentant le comportement
  actuel plutôt que d'inventer une heuristique de détection de colonnes non spécifiée.

---

## 3. Constat sur l'existant

`parseStatblock` (`src/importers/cof2/parsing/statblockParser.mjs`, lignes 43-46) fait aujourd'hui un nettoyage
minimal et ad hoc au moment du split en lignes :

```js
let lines = String(text ?? "")
  .split(/\r?\n/)
  .map((l) => l.replace(/[ \t]+/g, " ").replace(/ {2,}/g, " ").replace(/[‐-‒−]/g, "-").trim())
  .filter(Boolean);
```

Ce nettoyage ne couvre ni les espaces insécables, ni les ligatures, ni le bruit de page (`BESTIAIRE - ...`,
`INTRO`, numéros isolés), ni les césures, ni la reconstruction de segments coupés sur plusieurs lignes. La
fixture `centaure.txt` actuelle (Story 1) est déjà "propre" : chaque attaque tient sur une seule ligne
(`Sabots +7 · DM 1d8+6`), ce qui ne reproduit pas le cas réel visé par l'issue (attaques coupées sur deux lignes).

`cleanName` (`textUtils.mjs`) supprime déjà les lettres isolées de pictogrammes, mais uniquement sur la ligne du
nom, pas sur l'ensemble du texte.

Aucun module de normalisation/reconstruction dédié n'existe : la responsabilité est à créer.

---

## 4. Décisions d'architecture

- Nouveau module pur `src/importers/cof2/parsing/textReconstruction.mjs`, sans dépendance Foundry, exportant :
  - `normalizeUnicode(text)` — espaces insécables → espace normal, tirets Unicode → `-`, apostrophes → `'`,
    ligatures (`ﬁ`→`fi`, `ﬂ`→`fl`), suppression des caractères de contrôle.
  - `stripPdfNoise(lines)` — retire les lignes de bruit (numéro de page isolé, titre courant `BESTIAIRE - ...`,
    `INTRO`, lettres isolées de pictogramme) ; les lignes retirées sont comptées mais ne génèrent pas d'erreur
    bloquante (diagnostic non bloquant, cohérent avec le `warnings` existant du parseur).
  - `repairHyphenation(text)` — fusionne les césures `mot-\nsuite` en `motsuite`, en évitant de fusionner un tiret
    de fin de ligne qui appartient à un vrai mot composé (heuristique : ne fusionner que si le mot après le tiret
    commence par une minuscule et que la ligne suivante ne commence pas par une majuscule/un marqueur de champ).
  - `reconstructSegments(lines)` — rejoint une ligne d'attaque sans `DM` avec la ligne suivante qui commence par
    `DM`, et segmente une ligne unique contenant plusieurs champs collés en s'appuyant sur les marqueurs
    syntaxiques COF2 déjà utilisés par `statblockParser.mjs` (`NC`, `FOR/AGI/CON/PER/CHA/INT/VOL`, `S Défense`,
    `V Points de vigueur`/`PV`, `I Initiative`, motif d'attaque `Nom +N`, titre `Nom :`).
  - `reconstructText(rawText)` — orchestre les quatre étapes ci-dessus dans l'ordre (normalisation Unicode →
    suppression du bruit → réparation des césures → reconstruction des segments) et retourne
    `{ rawText, normalizedText }`.
- `parseStatblock` (`statblockParser.mjs`) est modifié pour accepter en entrée soit un texte brut (comportement
  actuel conservé, `reconstructText` appelé en interne) soit directement un `normalizedText` déjà reconstruit,
  afin de garder la fonction testable indépendamment de la reconstruction et de permettre l'inspection séparée
  des deux étapes dans les tests. Le remplacement du nettoyage ad hoc (lignes 43-46) par un appel à
  `reconstructText` est un changement de comportement assumé par cette story (contrairement à la Story 1 qui
  imposait un comportement identique).
- Le résultat de `parseStatblock` gagne deux champs `rawText` et `normalizedText` (traçabilité), sans changer les
  champs existants (`name`, `nc`, `abilities`, `attacks`, `capacities`, `warnings`, `errors`, ...).
- Pas de nouvelle dépendance externe : regex et manipulations de chaînes natives, cohérent avec l'exigence
  "module pur" déjà appliquée à `textUtils.mjs`/`capacityMatcher.mjs`.

---

## 5. Plan de travail

1. Créer `src/importers/cof2/parsing/textReconstruction.mjs` avec `normalizeUnicode`, `stripPdfNoise`,
   `repairHyphenation`, `reconstructSegments`, `reconstructText`.
2. Créer les fixtures brutes manquantes sous `src/importers/cof2/parsing/__fixtures__/` :
   - `centaure-pdf-brut.txt` : reprend le Centaure avec attaques coupées sur deux lignes (`Sabots +7 ·` /
     `DM 1d8+6`), bruit de page (`0`, `INTRO`, `1`, `BESTIAIRE - CENTAURE`) et une césure (`pié-\ntine` dans une
     capacité, ou équivalent plausible).
   - `statblock-une-ligne.txt` : un statblock simple (ex. Aigle) entièrement collé sur une seule ligne.
3. Écrire `src/importers/cof2/parsing/textReconstruction.test.mjs` (`node --test`) couvrant : normalisation
   (espace insécable, tiret Unicode, ligature, caractère de contrôle), suppression de bruit (numéro isolé, titre
   courant), réparation de césure (mot coupé vs mot composé légitime non fusionné), reconstruction de segment
   (DM sur ligne suivante, plusieurs attaques sur une ligne, stats + attaque sur une même ligne, capacité sur
   plusieurs lignes).
4. Adapter `statblockParser.mjs` pour appeler `reconstructText` en tête de `parseStatblock`, exposer
   `rawText`/`normalizedText` dans le résultat, et retirer le nettoyage ad hoc devenu redondant.
5. Étendre `statblockParser.test.mjs` avec un cas basé sur `centaure-pdf-brut.txt` vérifiant : exactement 3
   attaques reconnues, aucune ligne `DM 1d8+6` isolée en warning/ligne inconnue, les lignes de bruit absentes des
   warnings bloquants, la césure réparée dans le texte normalisé.
6. Ajouter un test basé sur `statblock-une-ligne.txt` vérifiant que les champs (nom, NC, caractéristiques,
   DEF/PV/Init, attaque) sont correctement segmentés et reconnus.
7. Relire pour confirmer qu'aucun appel Foundry (`game`, `Actor`, `Item`, `foundry.*`) n'a été introduit dans
   `src/importers/cof2/parsing/`.

---

## 6. Fichiers probablement modifiés

- Nouveaux : `src/importers/cof2/parsing/textReconstruction.mjs`,
  `src/importers/cof2/parsing/textReconstruction.test.mjs`,
  `src/importers/cof2/parsing/__fixtures__/centaure-pdf-brut.txt`,
  `src/importers/cof2/parsing/__fixtures__/statblock-une-ligne.txt`.
- Modifiés : `src/importers/cof2/parsing/statblockParser.mjs` (appel à `reconstructText`, champs
  `rawText`/`normalizedText`), `src/importers/cof2/parsing/statblockParser.test.mjs` (nouveaux cas),
  `src/importers/cof2/index.mjs` (réexport de `reconstructText` si utile côté commande de debug).

---

## 7. Tests attendus

- `node --test` exécute `textReconstruction.test.mjs` et les cas ajoutés dans `statblockParser.test.mjs` sans
  dépendance Foundry.
- Le cas Centaure brut (`centaure-pdf-brut.txt`) produit exactement 3 attaques reconnues, sans warning sur une
  ligne `DM ...` isolée, avec les lignes de bruit (`0`, `INTRO`, `1`, `BESTIARE - CENTAURE`) absentes des
  warnings bloquants.
- Le cas césure vérifie que `pié-\ntine` devient `piétine` dans `normalizedText`, sans fusion erronée d'un mot
  composé légitime dans un autre test dédié.
- Le cas une-seule-ligne (`statblock-une-ligne.txt`) est correctement segmenté en champs distincts et reconnu par
  `parseStatblock`.
- Les tests existants de la Story 1 (`statblockParser.test.mjs` sur la fixture `centaure.txt` propre) continuent
  de passer sans modification de leurs attentes.

---

## 8. Risques et mitigations

- **Risque** : l'heuristique de réparation de césure fusionne à tort un mot composé légitime en fin de ligne.
  **Mitigation** : test dédié avec un mot composé plausible du corpus COF2, heuristique conservatrice (minuscule
  après le tiret + absence de marqueur de champ en début de ligne suivante).
- **Risque** : la reconstruction de segments sur une ligne unique dépend fortement des regex existantes de
  `statblockParser.mjs` (`ABILITY_RE`, `ATTACK_RE`, ...) et peut diverger si ces regex évoluent séparément.
  **Mitigation** : `reconstructSegments` réutilise/importe les mêmes marqueurs que `statblockParser.mjs` plutôt
  que de dupliquer des regex ad hoc, ou expose des points d'extension partagés.
- **Risque** : le cas "deux colonnes mal extraites" (Epic section 26) n'a pas de fixture réelle disponible.
  **Mitigation** : documenter la limite dans le test (cas minimal ou skip explicite justifié) plutôt que
  d'inventer une heuristique non validée par un cas réel.

---

## 9. Critères d'arrêt

- Le statblock Centaure brut (attaques coupées sur deux lignes, bruit de page, césure) produit exactement 3
  attaques reconnues et aucune ligne `DM ...` isolée en warning.
- Les lignes de bruit (`0`, `INTRO`, `1`, `BESTIARE - CENTAURE`) sont supprimées ou classées en diagnostic non
  bloquant.
- La césure `pié-\ntine` est réparée en `piétine`.
- Un statblock entièrement sur une ligne est correctement segmenté en champs distincts et reconnu.
- `rawText` et `normalizedText` sont exposés distinctement dans le résultat de `parseStatblock`.
- Tous les tests (`node --test`) passent, y compris ceux de la Story 1.
- Aucun appel direct à `game`, `Actor`, `Item` ou toute autre API Foundry ne subsiste dans
  `src/importers/cof2/parsing/`.

# Plan d'implémentation — Rendre le NC optionnel et supporter les préfixes OCR pour DEF / PV / Init

**Issue** : [#28 — Rendre le NC optionnel et supporter les préfixes OCR pour DEF / PV / Init](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/28)
**Module(s) impacté(s)** : `src/importers/cof2/parsing/statblockParser.mjs`, `src/importers/cof2/parsing/statblockParser.test.mjs`, `src/importers/cof2/parsing/__fixtures__/`

---

## 1. Objectif

Permettre l'import d'un statblock sans `NC` et reconnaître les préfixes `(S)`, `(V)`, `(I)` (avec ou sans espace, avec ou sans `:`, avec ou sans `.` après `Init`) devant `DEF`/`PV`/`Init`, sans régression sur les statblocks déjà supportés.

## 2. Périmètre

### Inclus

- Rendre la détection du NC non bloquante : absence de ligne `| NC x` → pas de diagnostic `error`, `nc` reste `null`/`undefined`, le parsing continue.
- Détection du nom sans ancrage NC : si aucune ligne NC n'est trouvée dans le texte, la première ligne non vide sert de nom (au lieu de la ligne précédant `| NC`).
- Extension de `DEF_RE`, `HP_RE`, `INIT_RE` pour accepter un préfixe décoratif `(S)`/`(V)`/`(I)` (espacé ou non) en plus du préfixe lettre existant (`S `/`V `/`I `), sans changer la valeur extraite.
- Tests de non-régression avec le bloc Centaure exact de l'issue (`(S)DEF 15 (V)PV 30 (I)Init. 14`, sans ligne NC).
- Fixture(s) couvrant les variantes d'espacement (`(S) DEF 15`) et le `:` optionnel (`(S)DEF: 15`).

### Hors scope

- Détection d'un deuxième statblock collé (`multipleStatblocks`) quand aucun des deux blocs n'a de NC — limitation documentée, pas traitée ici.
- Tout changement du format de sortie `EncounterDraft` au-delà de `nc` pouvant être `null`.
- Refonte de `reconstructText`/normalisation PDF en amont.

## 3. Constat sur l'existant

- `statblockParser.mjs:54-58` : si `NC_LINE_RE` ne matche aucune ligne, le parseur pousse `missingAbility("NC")` (diagnostic `error`, donc bloquant côté UI) et retourne immédiatement un draft vide — aucun autre champ n'est analysé.
- Le nom est actuellement déduit soit de la même ligne que `| NC` (`inlineName`), soit de la ligne précédente (`lines[ncIndex - 1]`) — cette logique dépend entièrement de la présence de la ligne NC.
- `DEF_RE`/`HP_RE`/`INIT_RE` (`statblockParser.mjs:31-33`) acceptent déjà un préfixe lettre optionnel suivi d'un espace (`S\s+`, `V\s+`, `I\s+`) et un `:` optionnel, mais pas une forme parenthésée `(S)`.
- `missingAbility` (`encounterDraft.mjs:106-108`) crée systématiquement un diagnostic de sévérité `error` — il ne doit plus être appelé pour un NC absent.
- Fixture `__fixtures__/centaure.txt` illustre le format actuellement supporté (avec `| NC 3`, préfixes lettre simples) ; c'est la référence de non-régression à ne pas casser.

## 4. Décisions d'architecture

- Le NC reste optionnel *uniquement* en absence totale de ligne NC détectable ; si une ligne NC existe mais est malformée, le comportement actuel (best-effort du regex) est conservé tel quel — aucune nouvelle tolérance de format NC n'est ajoutée.
- Quand aucune ligne NC n'est trouvée : `result.nc` est initialisé à `null` (au lieu de `0`) et aucun diagnostic n'est émis pour ce champ — cohérent avec l'attendu de l'issue (`nc = null / undefined`, pas de diagnostic).
- La logique de repérage du nom se scinde en deux chemins explicites : « ligne NC trouvée » (comportement actuel inchangé) vs « pas de ligne NC » (nom = première ligne non vide, en-tête analysé à partir de la ligne suivante).
- Les regex DEF/PV/Init gagnent un groupe de préfixe partagé du type `(?:\(?S\)?\s*)?` (par lettre S/V/I selon le champ), qui remplace le `(?:S\s+)?` actuel — capture toutes les variantes déjà supportées (`S `) plus les nouvelles (`(S)`, `(S) `), sans capturer la lettre dans le résultat retourné.
- Le préfixe reste strictement décoratif : aucune valeur du préfixe n'influence `result.defense`/`result.hp`/`result.initiative`.

## 5. Plan de travail

1. Ajouter une fixture `__fixtures__/centaure-sans-nc.txt` (ou nom équivalent) reproduisant exactement le cas de test de référence de l'issue (bloc Centaure complet, sans ligne NC, préfixes parenthésés).
2. Modifier `DEF_RE`, `HP_RE`, `INIT_RE` pour accepter le préfixe parenthésé en plus du préfixe lettre existant ; vérifier par test unitaire ciblé chaque variante listée dans l'issue (`DEF 15`, `(S)DEF 15`, `(S) DEF 15`, `(S)DEF: 15`).
3. Modifier `parseStatblock` : remplacer le retour anticipé bloquant par une branche « pas de NC » qui initialise `result.nc = null`, détermine le nom via la première ligne non vide, et poursuit l'analyse d'en-tête à partir de la ligne suivante — sans pousser de diagnostic `MISSING_ABILITY` pour NC.
4. Adapter le typedef `EncounterDraft.nc` (JSDoc `encounterDraft.mjs`) pour refléter `number|null`.
5. Étendre `statblockParser.test.mjs` avec : (a) le cas de référence Centaure sans NC + préfixes OCR → `nc` null/undefined, `defense=15`, `hp=30`, `initiative=14`, aucun diagnostic `MISSING_ABILITY` sur ces 4 champs ; (b) un cas NC présent inchangé (non-régression sur `centaure.txt`) ; (c) cas de variantes d'espacement/`:`/`.` optionnel.
6. Lancer `pnpm test` (ou l'équivalent `node --test src/`) pour valider l'ensemble des tests existants + nouveaux.

## 6. Fichiers probablement modifiés

- `src/importers/cof2/parsing/statblockParser.mjs`
- `src/importers/cof2/parsing/encounterDraft.mjs` (JSDoc uniquement, `nc: number|null`)
- `src/importers/cof2/parsing/statblockParser.test.mjs`
- `src/importers/cof2/parsing/__fixtures__/centaure-sans-nc.txt` (nouveau)

## 7. Tests attendus

- Nouveau test : statblock Centaure exact de l'issue (sans NC, préfixes `(S)`/`(V)`/`(I)`) → `name="Centaure"`, `nc` null/undefined, `defense=15`, `hp=30`, `initiative=14`, aucun diagnostic `error` sur NC/Défense/Points de vigueur/Initiative.
- Test de non-régression : `__fixtures__/centaure.txt` (avec NC, préfixes lettre simples) produit un résultat identique à avant (NC=3, DEF=15, PV=30, Init=14).
- Tests ciblés des variantes de préfixe DEF/PV/Init : sans préfixe, `(S)DEF 15`, `(S) DEF 15`, `(S)DEF: 15`, `(I)Init. 14` / `(I)Init 14`.
- `pnpm test` (ou `node --test src/`) passe intégralement.

## 8. Risques et mitigations

- Risque : le changement du chemin « pas de NC » casse la détection d'un deuxième statblock collé (basée sur `NC_LINE_RE`) si aucun des deux n'a de NC → mitigation : hors scope explicite, documenté comme limitation connue, pas de régression sur le cas actuel (au moins un NC présent) qui reste géré à l'identique.
- Risque : élargir le préfixe DEF/PV/Init à une forme trop permissive capture par erreur une autre lettre entre parenthèses (ex. `(A)DEF 15`) → mitigation : garder le préfixe spécifique à la lettre attendue par champ (`S` pour DEF, `V` pour PV, `I` pour Init), pas un joker générique.
- Risque : `result.nc = null` casse un consommateur en aval qui suppose `nc` toujours numérique (ex. tri, affichage, sauvegarde Foundry) → mitigation : limiter le changement au module de parsing pur (hors scope de ce plan mais à signaler dans la PR) ; vérifier par recherche des usages de `.nc` en dehors de `statblockParser`/`encounterDraft` avant merge.

## 9. Critères d'arrêt

Les 9 critères d'acceptation de l'issue #28 sont satisfaits (NC optionnel non bloquant, NC présent toujours détecté, les 3 formats préfixés DEF/PV/Init reconnus, formes sans préfixe toujours fonctionnelles, espaces et point optionnel tolérés, diagnostics disparus pour le cas Centaure, tests de non-régression ajoutés) et `pnpm test` passe sans erreur.

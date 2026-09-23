# Plan d'implémentation — Gérer les doublons de nom lors de la résolution d'une capacité de compendium

**Issue** : [#36 — Gérer les doublons de nom lors de la résolution d'une capacité de compendium](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/36)
**Plans liés** : `documentation/plan/importers/cof2/32-capacites-warbound-source-prioritaire.md` (priorité de source
et `priorityFolderId`), `documentation/plan/importers/cof2/35-resoudre-capacite-exacte-avant-variante.md` (ordre
exact avant variante)
**Module(s) impacté(s)** : `src/importers/cof2/resolution/capacityResolver.mjs`,
`src/importers/cof2/resolution/capacityResolver.test.mjs`

---

## 1. Objectif

Rendre déterministe la sélection d'une capacité quand plusieurs entrées exactes partagent le même nom dans une
même source (bucket `warbound`/`official`/`imported`), en s'appuyant sur les métadonnées déjà disponibles
(`priorityFolderId`/`warboundPriorityFolderId`), et signaler explicitement — plutôt que de choisir en silence —
les cas où aucune métadonnée ne permet de trancher.

---

## 2. Périmètre

### Inclus

- Correction de `pickAmongCandidates` : quand les noms sont identiques (`distinctNames.size === 1`) et qu'il y a
  plusieurs candidats, ne plus retomber sur `candidates[0]` ; utiliser le dossier prioritaire configuré
  (`priorityFolderId`/`warboundPriorityFolderId` selon le bucket appelant) comme unique critère de départage
  disponible dans l'architecture actuelle : s'il désigne exactement un candidat → sélection déterministe ; sinon
  (absent, ou désignant zéro/plusieurs candidats) → `AMBIGUOUS`.
- Enrichissement du libellé des candidats retournés dans `AMBIGUOUS` pour ce cas précis (noms identiques), afin que
  le warning consommé par `encounterFactory.mjs:343` reste explicite malgré des noms identiques (ex. inclure le
  `folder`/`_id` dans le libellé plutôt que le seul `name`).
- Mise à jour du test existant `capacityResolver.test.mjs:51-54` (« retombe sur la première entrée sans dossier
  prioritaire ») : ce comportement devient `AMBIGUOUS`, pas une sélection arbitraire.
- Nouveaux tests : cas `Charge` avec au moins deux candidats exacts dans la même source (AC explicite de
  l'issue), couvrant à la fois le sous-cas résolu (dossier prioritaire désignant un seul candidat) et le sous-cas
  non résolu (`AMBIGUOUS`, warning listant les candidats).
- Vérification de non-régression sur les tests des issues #5/#32/#35 qui dépendent de `pickAmongCandidates`
  (aucun ne doit changer de résultat, sauf le test explicitement corrigé ci-dessus).

### Hors scope

- Tout critère de désambiguïsation basé sur `type`/`subtype` d'objet : les entrées indexées dans chaque bucket
  sont déjà filtrées à un type unique (`type === "capacity"`) par `buildCapacityResolver`
  (`encounterFactory.mjs:125`), et `system.subtype` des capacités est vide en pratique (constaté dans les YAML) —
  ce critère de l'exemple de l'issue ne s'applique pas ici et n'est pas inventé.
- Résolution de voies (hors scope confirmé aussi par le plan de l'issue #32).
- Changement des statuts publics (`EXACT_REUSE`/`TEMPLATE_VARIANT`/`REUSE_IMPORTED`/`AMBIGUOUS`/`NOT_FOUND`) ou de
  la signature de `makeCapacityResolver`.
- Modification de `encounterFactory.mjs` : le warning `AMBIGUOUS` (ligne 343) consomme déjà `resolution.candidates`
  génériquement ; aucun changement de code nécessaire côté appelant, seul le contenu des libellés change.

---

## 3. Constat sur l'existant

- `pickAmongCandidates` (`capacityResolver.mjs:53-57`) gère aujourd'hui deux cas seulement : noms distincts →
  `AMBIGUOUS` (libellés = noms) ; noms identiques → dossier prioritaire si trouvé, sinon **`candidates[0]`
  arbitraire**, dont l'ordre dépend de l'ordre de retour de l'index Foundry.
- Ce fallback arbitraire est exercé par le test `capacityResolver.test.mjs:51-54`, qui l'attend explicitement
  aujourd'hui (`officialEntries[2]`, le premier des deux `Résistance`).
- `priorityFolderId`/`warboundPriorityFolderId` sont déjà le seul mécanisme métier de désambiguïsation
  « source/compendium prioritaire » présent dans l'architecture (issue #32) ; aucun autre champ de métadonnées
  fiable n'est disponible à ce niveau (l'index Foundry n'est chargé qu'avec `fields: ["folder"]`).
- `encounterFactory.mjs:343` construit déjà le warning `AMBIGUOUS` à partir de `resolution.candidates.join(", ")`
  sans supposer un format particulier — un changement de libellé (nom + désambiguïsation) n'y requiert aucune
  modification.

---

## 4. Décisions d'architecture

- Le seul critère déterministe ajouté est le dossier prioritaire déjà configuré par bucket, appliqué strictement
  (doit isoler **exactement un** candidat pour trancher ; sinon ambiguïté explicite).
- Pas de tri arbitraire alternatif (ex. tri alphabétique sur `_id`) introduit pour « deviner » un ordre : l'issue
  demande explicitement qu'une ambiguïté réellement non tranchable soit remontée, pas masquée par un nouvel ordre
  arbitraire.
- Le format de libellé pour les candidats à noms identiques doit rester une chaîne unique lisible dans un message
  utilisateur (cohérent avec le format `string[]` existant de `AMBIGUOUS.candidates`), sans changer le type du
  champ.

---

## 5. Plan de travail

1. Modifier `pickAmongCandidates` : séparer explicitement le cas noms-identiques + plusieurs candidats en un
   sous-cas « dossier prioritaire tranche » vs « ambiguïté réelle », avec libellés enrichis dans ce second cas.
2. Mettre à jour `capacityResolver.test.mjs:51-54` pour refléter le nouveau statut `AMBIGUOUS` attendu.
3. Ajouter le test dédié `Charge` avec ≥ 2 candidats exacts dans la même source (AC de l'issue), couvrant le
   sous-cas tranché par dossier prioritaire et le sous-cas ambigu.
4. Ajouter un test symétrique côté Warbound (`warboundPriorityFolderId`) si un cas équivalent n'existe pas déjà
   avec plusieurs candidats non tranchables.
5. Relire les suites `capacityResolver.test.mjs` (issues #5, #32, #35) et `encounterFactory.test.mjs` pour confirmer
   l'absence de régression, puis lancer `node --test`.

---

## 6. Fichiers probablement modifiés

- `src/importers/cof2/resolution/capacityResolver.mjs`
- `src/importers/cof2/resolution/capacityResolver.test.mjs`

---

## 7. Tests attendus

- `Charge` avec deux candidats exacts dans la même source, dossier prioritaire désignant l'un d'eux →
  `EXACT_REUSE` déterministe sur ce candidat.
- `Charge` avec deux candidats exacts dans la même source, sans dossier prioritaire (ou dossier prioritaire ne
  désignant aucun/plusieurs candidats) → `AMBIGUOUS`, avec des libellés de candidats distincts malgré le nom
  identique.
- Le test `capacityResolver.test.mjs:51-54` mis à jour reflète `AMBIGUOUS` au lieu de la sélection arbitraire
  actuelle.
- Non-régression complète des suites #5/#32/#35 (`node --test`).

---

## 8. Risques et mitigations

- **Risque** : le test existant `:51-54` étant explicitement corrigé, s'assurer qu'aucun autre test ne dépend
  implicitement du même fallback arbitraire ailleurs dans le fichier.
  **Mitigation** : relecture complète du fichier de test (§5.5) avant de conclure.
- **Risque** : libellés enrichis (folder/_id) moins lisibles qu'un nom de dossier métier.
  **Mitigation** : documenté comme limite connue (l'index ne porte pas le nom du dossier, seulement son id) — hors
  scope d'une résolution complète (changerait `buildCapacityResolver` et la signature de l'index Foundry, non
  demandé par l'issue).

---

## 9. Critères d'arrêt

- Deux entrées de même nom ne produisent plus jamais de sélection dépendant de l'ordre de retour de l'index
  (testé).
- Le dossier prioritaire configuré permet de distinguer une capacité du compendium officiel/Warbound configuré
  d'un homonyme personnalisé, quand il désigne un candidat unique (testé).
- Une ambiguïté réellement non tranchable produit `AMBIGUOUS` avec les candidats listés explicitement, jamais une
  sélection silencieuse (testé, cas `Charge`).
- `node --test` passe intégralement, contrat public de `capacityResolver.mjs` inchangé.

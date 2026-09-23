# Plan d'implémentation — Niveaux de diagnostic (couleurs/emojis) dans le résultat d'import

**Issue** : [#33 — Ajouter des niveaux de diagnostic avec couleurs et emojis dans le résultat d'import](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/33)
**Lié** : `documentation/plan/importers/cof2/3-modele-encounterdraft-diagnostics.md` (champ `severity` sur
`EncounterDraft.diagnostics`, distinct du `level` introduit ici)
**Module(s) impacté(s)** : `scripts/importers/cof2/encounterFactory.mjs`, `scripts/importers/cof2ImportWizard.mjs`,
`styles/warbound-importer.css`, `scripts/importers/cof2/encounterFactory.test.mjs`

---

## 1. Objectif

Remplacer `report.warnings` (tableau de chaînes libres) par une liste de messages structurés portant un niveau
explicite (`ignored`/`success`/`warning`), pour que le rendu de l'écran de résultat du wizard détermine emoji,
couleur et comptage à partir de ce niveau — jamais en analysant le texte du message.

## 2. Périmètre

### Inclus

- Un type `level` à 3 valeurs (`ignored`, `success`, `warning`) porté par chaque message du résultat d'import.
- Migration de tous les points de `warnings.push(...)` dans `encounterFactory.mjs` (capacités réutilisées, créées,
  variantes, fallback texte, ambiguïtés, compendium introuvable) vers ce format structuré, avec mapping explicite
  par cas selon le tableau de l'issue.
- Intégration des messages hérités de `parsed.diagnostics` (`severity !== "error"`) : mapping de leur `code` vers
  un `level` (`UNSUPPORTED_AUTOMATION` → `ignored` ; `AMBIGUOUS_CAPACITY`, `CAPACITY_PARAMETER_MISMATCH`,
  `MULTIPLE_STATBLOCKS` → `warning` ; `PDF_NOISE_REMOVED`, `ATTACK_DAMAGE_RECONNECTED` → `ignored`, car
  informationnels et non bloquants comme les autres cas "ignoré" de l'issue).
- Rendu du wizard (`#renderResult`) : emoji + classe CSS par `level` au lieu d'une classe unique `cof2-diag-warning`
  pour tout.
- `counts.toReview` recalculé comme dérivé du nombre de messages `level === "warning"` (source unique), au lieu
  d'incréments manuels dispersés dans chaque branche — supprime le risque de désynchronisation entre le compteur et
  les messages réellement affichés en rouge.
- Nouvelles règles CSS pour les 3 niveaux (`ignored` jaune, `success` vert, `warning` rouge), sans toucher aux
  classes `cof2-diag-error`/`cof2-diag-info` existantes (écran "Diagnostics" pré-création, hors périmètre).

### Hors scope

- `EncounterDraft.diagnostics` et son champ `severity` (`info`/`warning`/`error`) : structure de parsing existante,
  non modifiée. Seule sa consommation dans `createEncounter` change (mapping vers le nouveau `level`).
- L'écran "Diagnostics" pré-création du wizard (`#renderDiagnostics`, avant l'étape Options) : reste inchangé, il
  affiche déjà des groupes par `severity` distincts.
- Toute modification du comportement d'import lui-même (résolution de capacités, création d'items, rollback) : au
  fonctionnement identique, seul le report change de forme.
- Ajout d'un 4e niveau ou renommage des codes de diagnostic existants.

## 3. Constat sur l'existant

- `createEncounter` (`encounterFactory.mjs:256`) initialise `warnings` à partir de
  `parsed.diagnostics.filter(d => d.severity !== "error").map(d => d.message)`, puis pousse des chaînes ad hoc à
  ~15 endroits (`addResolvedCapacity`, `addTemplateVariantCapacity`, et le corps de la boucle sur `parsed.capacities`).
- `counts.toReview` (ligne 258) est incrémenté manuellement dans certaines branches seulement (capacités), pas pour
  les diagnostics hérités du parsing (`AMBIGUOUS_CAPACITY`, `CAPACITY_PARAMETER_MISMATCH`) qui devraient pourtant
  compter comme "à vérifier" selon le tableau de mapping de l'issue.
- Le wizard (`cof2ImportWizard.mjs:282-299`, `#renderResult`) affiche `report.warnings` en boucle avec une seule
  classe `cof2-diag-warning`, quel que soit le contenu réel du message (succès de création inclus).
- CSS (`styles/warbound-importer.css:85-100`) ne définit que `.cof2-diag-error`, `.cof2-diag-warning`,
  `.cof2-diag-info` — aucune classe verte/jaune dédiée à ce nouveau modèle.

## 4. Décisions d'architecture

- Renommer `report.warnings` en `report.messages` (tableau de `{ level, message }`), pour éviter la confusion avec
  la `severity` de parsing et rendre explicite que ce ne sont plus uniquement des avertissements. Garder les
  helpers de construction proches du code qui les produit plutôt que de créer un module dédié (peu de complexité,
  pas de réutilisation ailleurs) : une petite fonction utilitaire locale `pushMessage(messages, level, text)` dans
  `encounterFactory.mjs` suffit.
- Mapping code → `level` pour les diagnostics hérités du parsing, appliqué au moment de construire `messages` en
  début de `createEncounter` :
  - `UNSUPPORTED_AUTOMATION`, `PDF_NOISE_REMOVED`, `ATTACK_DAMAGE_RECONNECTED` → `ignored`
  - `AMBIGUOUS_CAPACITY`, `CAPACITY_PARAMETER_MISMATCH`, `MULTIPLE_STATBLOCKS` → `warning`
- Mapping des messages construits pendant la résolution de capacités (par cas, conforme au tableau de l'issue) :
  - `success` : capacité réutilisée telle quelle sans ambiguïté (`EXACT_REUSE` → `attached`), variante créée avec
    difficulté surchargée confirmée, nouvelle entrée créée en bibliothèque d'import (cas "absente du compendium et
    de la bibliothèque, nouvelle entrée créée").
  - `warning` (à vérifier) : `addCapacity indisponible, créée en texte`, variante réutilisée sans confirmation
    ("vérifier le paramètre"), candidats multiples (`AMBIGUOUS`), "nom déjà importé avec un contenu différent",
    `Compendium introuvable`.
  - `ignored` : aucun cas identifié côté capacités actuellement (réservé aux diagnostics de parsing ci-dessus) — ne
    pas forcer un cas capacité dans `ignored` s'il n'y en a pas de légitime.
- `counts.toReview` devient une valeur dérivée (`messages.filter(m => m.level === "warning").length`) calculée une
  fois en fin de fonction, remplaçant les `counts.toReview++` dispersés. Source unique de vérité, conforme à l'AC
  "le compteur ne compte que les diagnostics nécessitant réellement une vérification" et évite toute dérive future
  entre message affiché et comptage.
- Rendu wizard : table `LEVEL_META = { ignored: { emoji: "🟡", css: "ignored" }, success: { emoji: "🟢", css:
  "success" }, warning: { emoji: "🔴", css: "warning" } }` à côté des constantes existantes
  (`SEVERITY_LABELS`/`CONFIDENCE_BADGES`), consommée par `#renderResult` pour émettre
  `<li class="cof2-diag cof2-diag-result-${css}">${emoji} ${message}</li>`. Nouveau préfixe `cof2-diag-result-*`
  (plutôt que réutiliser `cof2-diag-warning`) pour ne pas entrer en collision avec les classes de sévérité de
  l'écran "Diagnostics" pré-création, qui gardent leur sens actuel.
- Pas de nouvelle dépendance externe. Aucun changement de comportement d'import (créations, rollback, résolution).

## 5. Plan de travail

1. Dans `encounterFactory.mjs` : ajouter `pushMessage(messages, level, text)` et initialiser `messages` (remplace
   `warnings`) à partir de `parsed.diagnostics` avec le mapping code → `level` défini ci-dessus.
2. Remplacer chaque `warnings.push(...)` (dans `addResolvedCapacity`, `addTemplateVariantCapacity`, et le corps de
   `createEncounter`) par `pushMessage(messages, <level>, <texte inchangé>)`, selon le mapping de la section 4.
   Signatures des fonctions internes mises à jour (`warnings` → `messages`).
3. Supprimer les incréments manuels de `counts.toReview` ; calculer `counts.toReview` une seule fois en fin de
   fonction à partir de `messages`.
4. Renommer la clé de retour `warnings` → `messages` dans les deux `return { actor, report: { counts, ..., diagnostics } }`.
5. Dans `cof2ImportWizard.mjs` : ajouter `LEVEL_META`, adapter `#renderResult` pour consommer `report.messages` au
   lieu de `report.warnings`, avec emoji + classe CSS par `level`.
6. Dans `styles/warbound-importer.css` : ajouter `.cof2-diag-result-ignored` (jaune), `.cof2-diag-result-success`
   (vert), `.cof2-diag-result-warning` (rouge), à côté des règles `.cof2-diag-*` existantes.
7. Adapter `encounterFactory.test.mjs` : tous les tests qui assertent sur `report.warnings` migrent vers
   `report.messages` avec vérification du `level` attendu pour chaque cas (au minimum : un cas `success` création,
   un cas `warning` à vérifier, un cas `ignored` issu d'un diagnostic de parsing `UNSUPPORTED_AUTOMATION`).
8. Ajouter un test vérifiant que `counts.toReview` correspond exactement au nombre de messages `level === "warning"`
   dans un scénario mixte (au moins un de chaque niveau).

## 6. Fichiers probablement modifiés

- `scripts/importers/cof2/encounterFactory.mjs` (structure `messages`, mapping des niveaux, `counts.toReview` dérivé)
- `scripts/importers/cof2ImportWizard.mjs` (`#renderResult`, `LEVEL_META`)
- `styles/warbound-importer.css` (3 nouvelles classes de couleur)
- `scripts/importers/cof2/encounterFactory.test.mjs` (migration `warnings` → `messages`, cas par niveau, assertion `toReview`)

## 7. Tests attendus

- `node --test` sur `encounterFactory.test.mjs` : chaque cas de résolution de capacité produit un message avec le
  `level` attendu selon le tableau de mapping de la section 4 (pas de valeur de secours implicite).
- Un scénario avec un diagnostic de parsing `UNSUPPORTED_AUTOMATION` en entrée produit un message `level: "ignored"`
  dans `report.messages`.
- Un scénario avec `AMBIGUOUS_CAPACITY` ou `CAPACITY_PARAMETER_MISMATCH` en diagnostic de parsing produit un message
  `level: "warning"` et incrémente `counts.toReview`.
- `counts.toReview` égale exactement le nombre de messages `level === "warning"` dans `report.messages`, dans un
  scénario combinant plusieurs niveaux.
- Aucune régression sur les tests existants de comportement d'import (nombre d'attaques/capacités créées, rollback).

## 8. Risques et mitigations

- **Risque** : mapping niveau incorrect sur un cas ambigu du tableau de l'issue (ex. "réutilisé correctement" listé
  comme `success` *ou* info dans l'issue).
  **Mitigation** : trancher pour `success` par défaut sur toute réutilisation sans ambiguïté (cohérent avec "ne
  doit plus apparaître comme un warning"), documenté dans le commentaire au point d'appel.
- **Risque** : rupture des tests existants qui assertent sur la forme `report.warnings` (chaînes).
  **Mitigation** : migration explicite incluse dans le plan de travail (étape 7), pas de compatibilité ascendante
  à maintenir.
- **Risque** : confusion entre `severity` (parsing, `EncounterDraft.diagnostics`) et `level` (résultat d'import,
  `report.messages`) si les noms se ressemblent trop dans le code.
  **Mitigation** : nommage distinct (`level` vs `severity`) et commentaire au point de mapping expliquant que ce
  sont deux axes différents.

## 9. Critères d'arrêt

- `report.messages` remplace `report.warnings`, chaque message porte un `level` parmi `ignored`/`success`/`warning`.
- Le rendu du résultat d'import dans le wizard détermine emoji/couleur uniquement à partir de `level`, jamais du
  texte du message.
- `counts.toReview` est dérivé de `messages` (source unique), sans incrément manuel dispersé.
- Une création réussie (nouvelle entrée, variante confirmée) n'est plus rendue avec la classe/couleur "warning".
- Le comportement d'import (créations, rollback, résolution de capacités) reste identique.
- Tous les tests (`node --test`) passent, y compris `encounterFactory.test.mjs` migré.

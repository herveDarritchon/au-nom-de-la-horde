# Plan d'implémentation — Marqueurs de type d'action `(L)/(A)/(M)/(G)` non traités comme paramètres

**Issue** : [#34 — Extraire `(L)`, `(A)`, `(M)`, `(G)` comme types d'action et non comme paramètres de
capacité](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/34)
**Module(s) impacté(s)** : `src/importers/cof2/resolution/capacityVariant.mjs`,
`src/importers/cof2/resolution/capacityVariant.test.mjs`, `scripts/importers/cof2/encounterFactory.test.mjs`

---

## 1. Objectif

Empêcher qu'un marqueur de type d'action COF2 (`(L)`, `(A)`, `(M)`, `(G)`) porté par le nom source d'une capacité soit
traité par le moteur de comparaison de paramètre (`compareTemplateVariant`/`detectParameter`) comme un paramètre non
reconnu. Aujourd'hui, l'import de `CHARGE (L)` face au modèle officiel `Charge (13)` produit à tort le warning
`Paramètre de capacité non reconnu : « CHARGE (L) »`.

---

## 2. Périmètre

### Inclus

- Nettoyage du type d'action dans `draftName` **et** `templateName` avant toute détection de paramètre dans
  `capacityVariant.mjs` (`detectParameter`/`compareTemplateVariant`), en réutilisant `extractActionType`
  (`capacityResolver.mjs`), déjà responsable de cette séparation au moment du parsing (`statblockParser.mjs` →
  `matchTitle`).
- Distinction explicite, après nettoyage du type d'action, entre :
  - aucune parenthèse restante (capacité annotée seulement d'un type d'action, ex. `Charge (L)`) → pas de paramètre à
    comparer, **aucun** diagnostic `CAPACITY_PARAMETER_MISMATCH` ne doit être émis ;
  - une parenthèse restante non reconnue par les règles existantes (difficulté/distance/durée/nombre nu) → conserve le
    comportement actuel (`UNRECOGNIZED`, diagnostic émis).
- Couverture des 4 marqueurs `(A)`, `(L)`, `(M)`, `(G)`, au minimum via `Charge (L)` et `Attaque double (A)` face à un
  modèle paramétré.
- Non-régression du cas `TEMPLATE_VARIANT` par vrai paramètre (`Charge (difficulté 16)` vs `Charge (13)` →
  `OVERRIDABLE`) et du cas paramètre réellement non reconnu.

### Hors scope

- Toute modification du parsing (`statblockParser.mjs`, `extractActionType` dans `capacityResolver.mjs`) : ces points
  produisent déjà `name`/`actionType` corrects et ne sont pas en cause.
- Toute modification de `encounterFactory.mjs` : l'appel `compareTemplateVariant(cap.rawName, resolution.entry.name)`
  reste inchangé, la protection est interne à `capacityVariant.mjs` afin de couvrir tout appelant présent ou futur.
- Extension de la surcharge automatique (difficulté/distance/durée) : hors périmètre de cette issue, comportement
  `buildDifficultyOverride` inchangé.

---

## 3. Constat sur l'existant

- `extractActionType` (`src/importers/cof2/resolution/capacityResolver.mjs:30`) sépare déjà correctement un type
  d'action final (`/^[LAMG]$/`) du reste du nom : `"CHARGE (L)"` → `{ name: "Charge", actionType: "L" }`. Utilisé par
  `statblockParser.mjs` (`matchTitle`), donc `cap.name`/`cap.actionType` sont déjà corrects en sortie du parseur.
- Le resolver (#5) fait matcher en loose (`stripParens`, indifférent au contenu de la parenthèse) `"Charge (L)"` et
  `"Charge (13)"` sur la même clé `"charge"` → statut `TEMPLATE_VARIANT`, ce qui est correct : c'est bien une
  correspondance au modèle paramétré, la parenthèse diffère juste dans sa nature.
- `encounterFactory.mjs:251` déclenche alors `compareTemplateVariant(cap.rawName, resolution.entry.name)` avec
  `cap.rawName = "CHARGE (L)"` (texte brut, parenthèse d'action-type incluse).
- `detectParameter` (`capacityVariant.mjs:29`) isole le contenu de la parenthèse finale (`trailingParenContent`) sans
  connaître la notion de type d'action : pour `"L"`, aucune des regex difficulté/distance/durée/nombre nu ne matche →
  retourne `null` → `compareTemplateVariant` retourne `{status:"UNRECOGNIZED"}` → `encounterFactory.mjs` émet le
  diagnostic `capacityParameterMismatch(cap.rawName)` (`encounterDraft.mjs:93`), d'où le warning observé dans l'issue.
- Aucun test existant (`capacityVariant.test.mjs`, `encounterFactory.test.mjs`) ne couvre le croisement type
  d'action + template paramétré ; le cas `Griffe du vide` avec `actionType: "action"` dans
  `encounterFactory.test.mjs` ne passe jamais par un template `TEMPLATE_VARIANT` paramétré.

---

## 4. Décisions d'architecture

- Le nettoyage se fait dans `src/importers/cof2/resolution/capacityVariant.mjs`, pas côté appelant
  (`encounterFactory.mjs` reste inchangé) :
  - `capacityVariant.mjs` importe `extractActionType` depuis `./capacityResolver.mjs`.
  - `detectParameter(name)` applique `extractActionType(name).name` avant `trailingParenContent`, de sorte qu'un
    type d'action final est toujours retiré avant recherche de paramètre, quel que soit l'appelant.
  - `compareTemplateVariant(draftName, templateName)` applique le même nettoyage aux deux noms (source et modèle)
    avant de déléguer à `detectParameter`, pour rester cohérent si un nom de modèle porte lui aussi un type d'action.
- Distinction « pas de paramètre » vs « paramètre non reconnu » : après nettoyage du type d'action, si le nom source
  nettoyé n'a plus de parenthèse finale du tout, il n'y a explicitement aucun paramètre à comparer — ce cas ne doit
  pas produire le même statut que celui d'une parenthèse présente mais non reconnue. Cette distinction est nécessaire
  pour que le diagnostic `CAPACITY_PARAMETER_MISMATCH` continue de signaler les vrais cas ambigus sans être noyé par
  les capacités simplement annotées d'un type d'action.
- Aucun changement de contrat public exporté : les signatures `detectParameter(name)` et
  `compareTemplateVariant(draftName, templateName)` restent identiques ; seul leur comportement interne change.
- `encounterFactory.mjs` n'a pas besoin d'être modifié : il continue de passer `cap.rawName` tel quel, la protection
  étant désormais garantie en amont, dans le module de comparaison lui-même.

---

## 5. Plan de travail

1. Étendre `capacityVariant.mjs` pour importer `extractActionType` et l'appliquer en tête de `detectParameter` et
   `compareTemplateVariant`, avec la distinction « pas de parenthèse après nettoyage » vs « parenthèse non reconnue »
   décrite en §4.
2. Étendre `capacityVariant.test.mjs` : `detectParameter`/`compareTemplateVariant` sur `"Charge (L)"`,
   `"Attaque double (A)"`, `"... (M)"`, `"... (G)"` face à un modèle paramétré, plus les cas de non-régression
   (paramètre difficulté valide, paramètre réellement non reconnu).
3. Étendre `encounterFactory.test.mjs` : un cas `rawName` avec type d'action (ex. `"Charge (L)"`) face au template
   `CHARGE_TEMPLATE` (`Charge (13)`) → assert qu'aucun message `warning` contenant « Paramètre de capacité non
   reconnu » n'est produit.
4. Lancer `node --test` pour vérifier la non-régression sur les suites existantes
   (`capacityResolver`, `capacityVariant`, `encounterFactory`, parsing).

---

## 6. Fichiers probablement modifiés

- `src/importers/cof2/resolution/capacityVariant.mjs`
- `src/importers/cof2/resolution/capacityVariant.test.mjs`
- `scripts/importers/cof2/encounterFactory.test.mjs`

---

## 7. Tests attendus

- `detectParameter("Charge (L)")` / `("Attaque double (A)")` / `(... (M))` / `(... (G))` → pas de paramètre détecté
  après nettoyage du type d'action (comportement distinct d'un « non reconnu »).
- `compareTemplateVariant("CHARGE (L)", "Charge (13)")` (et variantes `A`/`M`/`G`) → ne produit plus
  `{status:"UNRECOGNIZED"}` à cause du seul type d'action ; aucun diagnostic `CAPACITY_PARAMETER_MISMATCH` ne doit
  être déclenché pour ce cas côté `encounterFactory`.
- Non-régression : `compareTemplateVariant("Charge (difficulté 16)", "Charge (13)")` → `OVERRIDABLE` (AC déjà couvert
  par la story #8, ne doit pas régresser).
- Non-régression : un paramètre réellement non reconnu (ex. `"Charge (xyz)"`) → toujours `UNRECOGNIZED` +
  `CAPACITY_PARAMETER_MISMATCH` émis.
- `node --test` passe intégralement sans régression sur les suites non touchées.

---

## 8. Risques et mitigations

- **Risque** : nettoyer le type d'action côté `templateName` pourrait masquer un vrai mismatch si un modèle officiel
  porte lui-même un type d'action en parenthèse finale sans paramètre distinct.
  **Mitigation** : le comportement reste symétrique et explicite (nettoyage identique des deux côtés), couvert par un
  test dédié si un tel modèle existe dans les compendiums ; aucun cas de ce type observé à ce jour dans
  `compendiums/items/`.
- **Risque** : confondre « pas de paramètre » et « paramètre non reconnu » ferait disparaître silencieusement un
  vrai diagnostic utile.
  **Mitigation** : distinction explicite entre absence totale de parenthèse après nettoyage et parenthèse présente
  mais non reconnue (§4), testée séparément (§7).

---

## 9. Critères d'arrêt

- Les critères d'acceptation de l'issue #34 sont couverts :
  1. `CHARGE (L)` normalisé en `Charge` (déjà vrai côté parseur, non régressé) ;
  2. `L` conservé séparément comme type d'action (déjà vrai côté parseur, non régressé) ;
  3. `(L)` jamais envoyé au moteur de résolution des paramètres (fix de cette story) ;
  4. `ATTAQUE DOUBLE (A)` normalisé en `Attaque double` (déjà vrai côté parseur, non régressé) ;
  5. logique fonctionnelle au minimum pour `(A)`, `(L)`, `(M)`, `(G)` (testé) ;
  6. aucun warning `Paramètre de capacité non reconnu : « CHARGE (L) »` généré pour ce cas (testé) ;
  7. capacités sans marqueur continuent de fonctionner normalement (non-régression testée).
- `node --test` passe intégralement (nouveaux cas + suites existantes inchangées).
- Contrat public de `capacityVariant.mjs` inchangé (mêmes signatures exportées).

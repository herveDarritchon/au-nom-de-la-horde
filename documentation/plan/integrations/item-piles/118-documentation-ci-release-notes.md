# Plan d'implémentation — docs(item-piles): documentation FR, matrice de compatibilité, CI et release notes

**Issue** : [#118 — docs(item-piles): documentation FR, matrice de compatibilité, CI et release notes](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/118)
**Parent** : #111 — feat(co2): Intégration complète d'Item Piles via Warbound
**Bloqué par** : #114, #115, #116, #117 (tous mergés)
**Modules impactés** : `docs/`, `documentation/`, `module.json`, `.github/workflows/` (lecture)

---

## 1. Objectif

Clôturer l'épic #111 (phase P6 — Publication) :
1. Guide utilisateur MJ (FR) + documentation technique dans `docs/item-piles.md`.
2. Matrice F01–F15 avec résultats de recette et versions exactes.
3. Checklist Definition of Done (cadrage §11).
4. CI : vérifier que les tests Item Piles tournent sans Foundry headless.
5. Release notes + procédure de retour arrière.
6. `module.json` : déclaration de compatibilité Item Piles (plage de versions).

---

## 2. Périmètre

### Inclus
- `docs/item-piles.md` — corrections d'exactitude (journal d'échange = flags, extrait de débogage valide) + section « Politique de migration de VERSION ».
- `documentation/item-piles-matrix-f01-f15.md` — référence recette #117.
- `documentation/item-piles-dod.md` — checklist Definition of Done §11 (critère → preuve).
- `documentation/release-notes/item-piles-integration.md` — mapping PR corrigé, section CI, DoD, exactitude.
- `module.json` — `relationships.recommends[item-piles].compatibility`.

### Hors périmètre
- Modification du code d'intégration (P1–P5, mergés).
- Nouveaux tests (déjà livrés).

---

## 3. État antérieur

- P1–P5 mergés (PRs #119–#124). `pnpm test` = `node --test` → découvre tous les `*.test.mjs` (Item Piles inclus), **sans Foundry**.
- `docs/item-piles.md` contient l'audit P0 + guide MJ (WIP) mais deux affirmations inexactes (journal de chat, `getSystemData`).
- `module.json` : `recommends[item-piles].compatibility` déjà renseigné (minimum/verified/maximum 3.3.4).

---

## 4. Décisions

- **CI** : aucun changement de workflow — `pnpm test` couvre déjà les tests Item Piles (Node test runner, pur JS). À documenter, pas à recoder.
- **Compatibilité** : plage `[3.3.4, 3.3.4]` (minimum = verified = maximum) — l'intégration dépend de signatures API/hooks vérifiées uniquement sur 3.3.4 ; les autres versions ne sont pas garanties (documenté).
- **Journal d'échange** : `flags.warbound.tradeHistory` (flags d'acteur), pas de message de chat Warbound. Item Piles peut publier au chat si le réglage *Output to chat* est activé.

---

## 5. Plan de travail

1. **`docs/item-piles.md`** — corriger le journal d'échange + l'extrait de débogage ; ajouter la politique de migration VERSION.
2. **`documentation/item-piles-dod.md`** — checklist §11.
3. **`documentation/release-notes/item-piles-integration.md`** — mapping PR, CI, DoD, exactitude.
4. **`documentation/item-piles-matrix-f01-f15.md`** — finaliser.
5. **`module.json`** — valider la déclaration de compatibilité.

---

## 6. Fichiers

| Fichier | Action |
|---|---|
| `docs/item-piles.md` | modifié (corrections + migration VERSION) |
| `documentation/item-piles-matrix-f01-f15.md` | modifié |
| `documentation/item-piles-dod.md` | créé |
| `documentation/release-notes/item-piles-integration.md` | créé |
| `module.json` | modifié |

---

## 7. Critères d'arrêt

- `pnpm test` : 0 échec.
- `pnpm build` : audit OK.
- DoD §11 : chaque critère coché avec preuve (test, recette, doc).
- Aucune revendication « compatibilité complète » en présence d'un écart non assumé (écarts F14/F15 documentés).
- Release notes + rollback + recommandation de sauvegarde présents.

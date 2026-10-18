# Plan d'implémentation — feat(item-piles): butin, piles au sol et coffres — F01 à F04, F13

**Issue** : [#114 — feat(item-piles): butin, piles au sol et coffres — F01 à F04, F13](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/114)
**Parent** : #111 — feat(co2): Intégration complète d'Item Piles via Warbound
**Bloqué par** : #113 — P1 Adaptateur de base (configuration COF2 enregistrée)
**Modules impactés** : `src/integrations/item-piles/items.mjs`, `src/integrations/item-piles/items.test.mjs`, `scripts/integrations/item-piles/config.mjs`

---

## 1. Objectif

Valider en live Foundry les scénarios A01–A08, A20–A23, A25 avec la configuration COF2 fournie par `buildItemPilesConfig()`, et corriger `items.mjs` ou `config.mjs` si un écart est détecté lors de la validation.

---

## 2. Périmètre

### Inclus

- F01 : dépôt d'objet sur scène → pile/token avec acteur correct et métadonnées préservées
- F02 : ramassage total/partiel (quantités, fusion empilables, non-fusion non-empilables)
- F03 : butin acteur `encounter` → transfert objets + monnaie PO/PA/PC vers PJ(s)
- F04 : partage butin multi-PJ (total invariant, répartition correcte)
- F13 : coffre Item Piles — ouvrir/fermer/verrouiller, images/sons d'état, permissions joueur
- Gestion quantités : max, `destroyIfEmpty`, rejet quantités invalides
- Empilement : `stackable=true` fusionne, `stackable=false` distinct, charges préservées
- Politique documentée sur `system.equipped` après transfert
- Tests unitaires complémentaires sur règles quantité/empilement
- Corrections ciblées dans `items.mjs` si l'audit P0 invalide le prototype

### Hors périmètre

- `container` (P5 — #117)
- Marchands (F07–F12)
- Modification COF2 ou Item Piles

---

## 3. État existant

- `scripts/integrations/item-piles/config.mjs` : config complète, `ACTOR_CLASS_TYPE: 'encounter'` présent — non validé en live avec pile, coffre, marchand, vault
- `src/integrations/item-piles/items.mjs` : `isStackable`, `areSimilar`, `normalizeQuantity`, `applyStackingFlag` — logique pure testable sans Foundry
- `src/integrations/item-piles/currency.mjs` : `toPrimaryAmount`, `EXCHANGE_RATES` — convention COF2 (1 PO = 10 PA = 100 PC) formalisée (PR #120)
- Tests unitaires existants : `items.test.mjs`, `currency.test.mjs`, `config.test.mjs`, `index.test.mjs`
- Scénarios A01–A25 définis dans le cadrage `documentation/cadrage/Warbound_Cadrage_Integration_Item_Piles_COF2.md`

---

## 4. Décisions d'architecture

1. **Validation manuelle** sur `http://localhost:31000` pour A01–A08, A20–A23, A25 — monde live requis, pas de Playwright
2. **Corrections de code** limitées à `src/integrations/item-piles/items.mjs` et `scripts/integrations/item-piles/config.mjs` si un scénario échoue
3. **Tests unitaires** Vitest uniquement pour logique pure — pas de mock Foundry
4. **Politique `system.equipped`** : documenter dans commentaire `items.mjs` — pas de transformation active (Item Piles gère le transfert, la valeur reste telle quelle)
5. **`ACTOR_CLASS_TYPE: 'encounter'`** : si insuffisant pour coffre/vault, ajouter `CONTAINER_ENTITY_TYPE` dans `config.mjs`

---

## 5. Plan de travail

1. **Valider F01** : déposer un objet depuis un PJ sur scène → vérifier pile créée avec bon acteur, flags Item Piles posés, `system.quantity.current` conservé
2. **Valider F02** : ramassage total (pile disparaît) + partiel (quantité réduite) ; objet `stackable=true` → fusion ; objet `stackable=false` → objets distincts
3. **Valider F03** : ouvrir pile/token depuis acteur `encounter` → transfert objets + monnaie PO/PA/PC vers un PJ
4. **Valider F04** : butin partagé entre plusieurs PJs → vérifier total monnaie/objets invariant, répartition correcte
5. **Valider F13** : créer acteur type coffre → ouvrir/fermer/verrouiller, images d'état changent, permissions joueur respectées
6. **Tester quantités** : ajouter cas Vitest pour `normalizeQuantity` couvrant `max`, `destroyIfEmpty`, rejet négatif/décimal
7. **Documenter `system.equipped`** : ajouter commentaire dans `items.mjs` sur la politique après transfert
8. **Corriger si nécessaire** : patches ciblés dans `items.mjs` ou `config.mjs` selon les écarts constatés

---

## 6. Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `src/integrations/item-piles/items.mjs` | Compléter si correction nécessaire ; ajouter commentaire `system.equipped` |
| `src/integrations/item-piles/items.test.mjs` | Ajouter tests quantité/empilement complémentaires |
| `scripts/integrations/item-piles/config.mjs` | Correction ciblée si `ACTOR_CLASS_TYPE` ou autre champ invalide en live |

---

## 7. Tests attendus

**Vitest (logique pure)**
- `normalizeQuantity(qty > max)` → `null`
- `normalizeQuantity(-1)` → `null`
- `normalizeQuantity(0.5)` → `null`
- `normalizeQuantity(0)` → `0`
- `applyStackingFlag` avec `stackable=false` → `flags['item-piles'].item.canStack === 'no'`
- `applyStackingFlag` ne mute pas l'objet source
- `areSimilar` refuse la fusion si `stackable=false` sur l'un des deux objets
- `areSimilar` accepte la fusion si `stackable=true` sur les deux et chemins identiques

**Validation manuelle (Foundry live)**
- Scénarios A01–A08 cochés
- Scénarios A20–A23 cochés (concurrence, permissions, absence MJ)
- A25 : actions et effets d'un objet préservés après transfert

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `ACTOR_CLASS_TYPE: 'encounter'` insuffisant pour coffre/vault | Ajouter `CONTAINER_ENTITY_TYPE` dans `config.mjs` si nécessaire |
| `system.equipped` non remis à zéro après transfert | Documenter politique ; ne pas transformer sans validation Item Piles |
| Mutation partielle sur transfert interrompu | Item Piles gère la transaction — valider A23 manuellement |
| Charges perdues à l'empilement | Vérifier `system.charges.*` après F02 ; ajouter à `ITEM_SIMILARITIES` si nécessaire |

---

## 9. Critères d'arrêt

- [ ] Scénarios A01–A08 réussis en live Foundry
- [ ] Scénarios A20–A23 réussis (concurrence, permissions, absence MJ)
- [ ] A25 : actions et effets d'un objet préservés après transfert
- [ ] Aucune mutation partielle sur opération interrompue
- [ ] Tests unitaires complémentaires verts (`pnpm test`)
- [ ] `pnpm build` passe sans erreur

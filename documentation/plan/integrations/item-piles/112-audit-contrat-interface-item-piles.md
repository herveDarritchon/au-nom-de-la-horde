# Plan d'implémentation — chore(item-piles): audit du contrat d'interface Item Piles 3.3.4

**Issue** : herveDarritchon/au-nom-de-la-horde#112
**Parent** : #111 — feat(co2): Intégration complète d'Item Piles via Warbound
**ADR** : N/A
**Modules impactés** : `scripts/integrations/item-piles/config.mjs`, `src/integrations/item-piles/currency.mjs`, `docs/item-piles.md` (à créer)

---

## 1. Objectif

Produire le document d'audit `docs/item-piles.md` (section « Audit P0 ») qui formalise :
- la confirmation de chaque signature et champ critique d'Item Piles 3.3.4 avec statut [CONFIRMÉ] / [DÉCIDÉ] / [ÉCART documenté]
- la décision monétaire (COF2 1 PO = 10 PA = 100 PC) formellement arbitrée
- la décision sur `container` consignée
- les items `[À TESTER — P0 #112]` restants résolus dans le code

---

## 2. Périmètre

### Inclus

- Lecture du source Item Piles 3.3.4 (installation Foundry locale : `http://localhost:31000`)
- Vérification `ACTOR_CLASS_TYPE: 'encounter'` avec pile, coffre, marchand, vault
- Arbitrage formel de la convention monétaire COF2 vs WoW
- Rédaction de `docs/item-piles.md` section « Audit P0 »
- Suppression des commentaires `[À TESTER — P0 #112]` dans `config.mjs` et `currency.mjs` une fois résolus

### Hors périmètre

- Nouvelle implémentation d'adaptateur (P1–P6)
- Modification COF2 ou Item Piles
- Tests automatisés (couverts en P1)

---

## 3. État existant

### Déjà confirmé (diagnostic 16/10/2026, PR #119)

| Point | Statut | Source |
|---|---|---|
| `system.properties.stackable` — flag empilabilité | CONFIRMÉ | `items.mjs:30` |
| `ITEM_TRANSFORMER` signature : `(itemData) => object` (async) | CONFIRMÉ | `config.mjs:73` |
| `ITEM_COST_TRANSFORMER` signature : `(item, currencies, priceAttribute) => number` | CONFIRMÉ | `config.mjs:46` |
| `ITEM_SIMILARITIES` = `Array<string>` (jamais fonction) | CONFIRMÉ | `items.mjs:16`, `config.mjs:67` |
| `system.quantity.current` — chemin quantité | CONFIRMÉ | `config.mjs:41` |
| `system.price.value` — chemin prix | CONFIRMÉ | `config.mjs:42` |
| `system.wealth.{gp,sp,cp}.value` — chemins monnaie | CONFIRMÉ | `config.mjs:22` |
| `container` — exclu jusqu'à P5 (#117) | DÉCIDÉ | `items.mjs:5`, `config.mjs:27` |
| `ITEM_FILTER_PATH: 'type'`, `filters` = string CSV | CONFIRMÉ | `config.mjs:26–27` |

### Restant [À TESTER — P0 #112]

| Point | Emplacement | Action requise |
|---|---|---|
| `ACTOR_CLASS_TYPE: 'encounter'` | `config.mjs:39` | Valider avec pile, coffre, marchand, vault dans Foundry |
| Convention monétaire COF2 (1 PO = 10 PA = 100 PC) | `currency.mjs:1` | Arbitrage formel à consigner |

---

## 4. Décisions d'architecture

1. **Convention monétaire** : COF2 (1 PO = 10 PA = 100 PC) — déjà implémentée dans `currency.mjs`, cohérente avec le cadrage §5.1. Décision à formaliser dans l'audit.
2. **`container`** : exclu des transferts jusqu'à handler complet validé (P5 — #117). Décision déjà prise en P1 à confirmer dans l'audit.
3. **`ACTOR_CLASS_TYPE`** : à valider manuellement sur Foundry local. Si `'encounter'` est insuffisant, documenter le delta.

---

## 5. Plan de travail

1. Accéder au source Item Piles 3.3.4 via l'instance Foundry locale (`http://localhost:31000`) ou le dossier d'installation.
2. Vérifier `ACTOR_CLASS_TYPE` acceptable pour pile, coffre, marchand, vault.
3. Arbitrer formellement la convention monétaire.
4. Rédiger `docs/item-piles.md` — section « Audit P0 » avec tableau statuts.
5. Supprimer les `[À TESTER — P0 #112]` dans `config.mjs` et `currency.mjs` (remplacer par [CONFIRMÉ] ou note de décision).

---

## 6. Fichiers à créer / modifier

| Fichier | Action |
|---|---|
| `docs/item-piles.md` | Créer — section « Audit P0 » |
| `scripts/integrations/item-piles/config.mjs` | Modifier — supprimer `[À TESTER — P0 #112]` ligne 39 |
| `src/integrations/item-piles/currency.mjs` | Modifier — supprimer `[À TESTER]` ligne 1, consigner décision |

---

## 7. Tests attendus

Pas de nouveaux tests automatisés pour cette phase (audit documentaire).  
Validation manuelle : recette Foundry locale pour `ACTOR_CLASS_TYPE`.

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Source Item Piles 3.3.4 inaccessible localement | Utiliser l'instance Foundry locale ; sinon GitHub tag `v3.3.4` |
| `ACTOR_CLASS_TYPE: 'encounter'` invalide | Documenter l'écart et ouvrir une issue corrective avant P3 |
| Convention monétaire COF2 ≠ WoW impacte P3 marchands | Décision bloquante arbitrée maintenant, avant tout travail P3 |

---

## 9. Critères d'arrêt

- [ ] `docs/item-piles.md` créé, section « Audit P0 » complète
- [ ] Tous les champs critiques au statut [CONFIRMÉ] / [DÉCIDÉ] / [ÉCART documenté]
- [ ] Convention monétaire arbitrée et consignée
- [ ] Décision `container` consignée
- [ ] Aucun `[À TESTER]` ou `[À DÉCIDER]` bloquant non résolu dans le code
- [ ] Issue #112 fermée

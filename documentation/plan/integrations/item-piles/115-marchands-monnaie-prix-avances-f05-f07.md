# Plan d'implémentation — feat(item-piles): marchands, monnaie et prix avancés — F05 à F07

**Issue** : [#115 — feat(item-piles): marchands, monnaie et prix avancés — F05 à F07](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/115)  
**Parent** : #111 — feat(co2): Intégration complète d'Item Piles via Warbound  
**Bloqué par** : #113 — P1 Adaptateur de base, #112 — P0 Audit (convention monétaire)  
**Modules impactés** : `src/integrations/item-piles/currency.mjs`, `src/integrations/item-piles/merchant.mjs` (nouveau), `scripts/integrations/item-piles/config.mjs`

---

## 1. Objectif

Rendre fonctionnels les marchands COF2 sous Item Piles 3.3.4 :
- paiement multi-devise (PO/PA/PC) avec rendu de monnaie exact et sans mutation partielle ;
- prix avancés (majorations, réductions par marchand/type/acteur, lots, services sans livraison d'item, prix zéro, prix en attribut) ;
- stock fini/infini, articles cachés, interdits de vente (`notForSale`), interdits de revente aux marchands (`cantBeSoldToMerchants`), inaccessibles ;
- logs marchands et messages de chat des transactions (délégués à Item Piles) ;
- régression 3.3.3 : rendu monnaie non soustrait au marchand → absente en 3.3.4.

---

## 2. Périmètre

### Inclus

- **F05** : paiement multi-devise PO/PA/PC, rendu de monnaie exact, soldes exacts marchand et personnage
- **F06** : prix avancés — majorations/réductions, lots, services (sans livraison d'item), prix zéro, prix en attribut
- **F07** : stock fini/infini, articles cachés, interdits de vente, inaccessibles
- `src/integrations/item-piles/currency.mjs` : nouvelles fonctions pures `canAfford`, `subtractCurrency`, `calculateChange`
- `src/integrations/item-piles/merchant.mjs` : lecteurs des flags réels — `applyMerchantMarkup`, `isSaleAllowed` (`notForSale`), `canSellToMerchant` (`cantBeSoldToMerchants`), `isItemHidden` (`hidden`), `isService` (`isService`), `isInfiniteQuantity` (tri-état `default`/`yes`/`no`), `isAccessible`
- Tests collocalisés : `currency.test.mjs` (scénarios A09–A14, régression 3.3.3), `merchant.test.mjs`
- `scripts/integrations/item-piles/config.mjs` : ajustement `PILE_DEFAULTS` si contrat 3.3.4 l'exige

### Hors périmètre

- Containers (P5 — #117)
- UI Foundry custom (feuille marchand, templates de chat) — délégué à Item Piles
- Hooks Foundry autres qu'`item-piles-ready`

---

## 3. État antérieur

`config.mjs` expose `ITEM_COST_TRANSFORMER` qui convertit `{value, unit}` COF2 en PO via `toPrimaryAmount` (existant dans `currency.mjs`). Aucune logique de paiement multi-devise ni de gestion de stock fini dans le code Warbound. Item Piles 3.3.4 pilote l'UI et le flux de transaction ; Warbound fournit les règles métier COF2.

---

## 4. Décisions d'architecture

- Toutes les fonctions de calcul monétaire restent dans `src/` (pas de dépendance Foundry).
- Arithmétique monétaire en PC entiers via `toLowestDenomination` / `fromLowestDenomination` existants — évite les erreurs flottantes.
- `calculateChange(paid, price)` retourne `{gp, sp, cp}` ou `null` si fonds insuffisants ; l'appelant (Item Piles) gère le rejet.
- Aucune mutation d'acteur dans le code Warbound : Item Piles applique les deltas retournés.
- `PILE_DEFAULTS` dans `buildItemPilesConfig()` peut recevoir `isMerchant: false` (valeur neutre par défaut) ; l'acteur marchand est configuré depuis l'UI Item Piles par le MJ.
- Régression 3.3.3 : Item Piles 3.3.4 corrige le bug côté framework ; le test de régression vérifie que `calculateChange` soustrait bien le montant du rendu du solde marchand.

---

## 5. Plan de travail

1. **`src/integrations/item-piles/currency.mjs`** — ajouter `canAfford`, `subtractCurrency`, `calculateChange` en s'appuyant sur `toLowestDenomination` / `fromLowestDenomination` existants.
2. **`src/integrations/item-piles/currency.test.mjs`** — couvrir A09–A14, régression 3.3.3, test 7 PA rejeté (aucune mutation), test A10 (1 PO → rendu 2 PA exact).
3. **`src/integrations/item-piles/merchant.mjs`** — lecteurs des flags réels Item Piles 3.3.4 : `applyMerchantMarkup`, `isSaleAllowed`, `canSellToMerchant`, `isItemHidden`, `isService`, `isInfiniteQuantity`, `isAccessible`. Cadrage §5 : **aucune** logique marchande réimplémentée ; ces fonctions ne sont **pas branchées** sur un hook, Item Piles reste maître du runtime. Les flags inventés (`doNotSell`, `forbiddenItemIds`, `restrictedActorIds`) sont proscrits.
4. **`src/integrations/item-piles/merchant.test.mjs`** — couvrir majorations, réductions, interdits de vente/revente, cachés, services, stock infini tri-état, accès.
5. **`scripts/integrations/item-piles/config.mjs`** — importer les nouvelles fonctions si nécessaire ; ajuster `PILE_DEFAULTS` après validation du contrat 3.3.4.

---

## 6. Fichiers modifiés

| Fichier | Action |
|---|---|
| `src/integrations/item-piles/currency.mjs` | modifié (ajout `canAfford`, `subtractCurrency`, `calculateChange`) |
| `src/integrations/item-piles/currency.test.mjs` | modifié (scénarios A09–A14 + régression 3.3.3) |
| `src/integrations/item-piles/merchant.mjs` | créé |
| `src/integrations/item-piles/merchant.test.mjs` | créé |
| `scripts/integrations/item-piles/config.mjs` | modifié si `PILE_DEFAULTS` ou imports à étendre |

---

## 7. Tests attendus

**`currency.test.mjs`** :
- A09 : achat exact — soldes inchangés sauf article transféré
- A10 : achat 8 PA avec 1 PO → rendu 2 PA, soldes exacts marchand et personnage
- A11–A14 : cas limites (fonds insuffisants, zéro, multi-devise)
- Test de référence : personnage 7 PA, article 8 PA → `canAfford` = false, aucune mutation
- Régression 3.3.3 : rendu monnaie soustrait du solde marchand
- Normalisation et arrondi : `toLowestDenomination(0, 10, 5)` = 105, `fromLowestDenomination(105)` = `{gp:1, sp:0, cp:5}`

**`merchant.test.mjs`** :
- `applyMerchantMarkup` : +20 %, −10 %, facteur 1 (neutre), zéro, arrondi entier PC, rejet des entrées invalides
- `isSaleAllowed` (`notForSale`) / `canSellToMerchant` (`cantBeSoldToMerchants`) : interdits de vente et de revente
- `isItemHidden` (`hidden`) / `isAccessible` : article caché, acteur absent, notForSale
- `isService` (`isService`) : service sans livraison
- `isInfiniteQuantity` : tri-état `default`/`yes`/`no` résolu avec la valeur du marchand

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Item Piles 3.3.4 attend des callbacks précis pour les prix avancés | Lire bundle 3.3.4 ou README Item Piles avant d'exposer `applyMerchantMarkup` |
| Arrondi flottant sur multi-devise | Travailler en PC entiers via `toLowestDenomination` |
| `PILE_DEFAULTS` contrat 3.3.4 inconnu | Valider depuis bundle ou README avant implémentation |

---

## 9. Critères d'arrêt

- `pnpm test` : 0 échec (scénarios A09–A14 verts, régression 3.3.3 absente).
- Validation manuelle Foundry (http://localhost:31000/game) :
  - Marchand `encounter` configuré : vente d'un article COF2, paiement multi-devise, rendu exact.
  - Achat refusé si fonds insuffisants (aucun état modifié).
  - Régression 3.3.3 : solde marchand correct après rendu de monnaie.
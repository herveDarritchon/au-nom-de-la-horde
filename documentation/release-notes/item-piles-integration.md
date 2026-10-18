# Notes de version — Intégration Item Piles COF2

> Épic : #111 — `feat(co2): Intégration complète d'Item Piles via Warbound`  
> Module : `warbound-campaign-content` v1.1.0  
> Système : COF2 2.3.12 · Item Piles 3.3.4 · Foundry VTT 14.367  
> PRs : #119 (P1), #120 (P0 audit), #121 (P2), #122 (P3), #123 (P4), #124 (P5), #125 (P6)  
> Date : 2026-10-18

---

## Résumé

Cette version introduit l'intégration complète d'**Item Piles 3.3.4** dans le module `warbound-campaign-content` pour le système COF2. L'intégration est déclarative : le module enregistre la configuration COF2 auprès d'Item Piles au démarrage et expose des fonctions pures pour les règles métier. Item Piles reste maître de toute l'UI et du runtime.

---

## Fonctionnalités ajoutées

### P1 — Adaptateur de base (issue #113)

- Déclaration `addSystemIntegration` : chemins COF2 (`system.quantity.current`, `system.price.value`, `system.wealth.*.value`), types d'objets physiques, similarités, devises PO/PA/PC.
- `ITEM_TRANSFORMER` (`applyStackingFlag`) : pose `flags.item-piles.item.canStack` selon `system.properties.stackable`.
- `ITEM_COST_TRANSFORMER` (`toPrimaryAmount`) : convertit le prix COF2 en monnaie primaire (PO).
- Convention monétaire : 1 PO = 10 PA = 100 PC.

### P2 — Butin & coffres (issue #114)

- Activation des piles au sol (F01), du butin `encounter` (F02), de la gestion des quantités (F03) et des coffres (F04).
- Tests unitaires `items.test.mjs` (logique pure ; recette live A01–A08).

### P3 — Marchands (issue #115)

- Marchands COF2 (F05–F07) : achat/vente, prix avancés, monnaies multidevises.
- `merchant.mjs` : `isSaleAllowed`, `canSellToMerchant`, `isItemHidden`, `isService`, `isInfiniteQuantity`, `applyMerchantMarkup`.
- `currency.mjs` : `canAfford`, `subtractCurrency`, `calculateChange` — régression Item Piles 3.3.3 couverte.
- Tests unitaires `merchant.test.mjs` + `currency.test.mjs` (logique pure ; recette live A09–A14).

### P4 — Échanges PJ↔PJ et vaults (issue #116)

- Échanges PJ↔PJ (F08–F10) : Warbound = observateur via `item-piles-tradeComplete`.
- Vaults partagés (F09, F13) : `buildVaultAccessEntry`, lecteurs de droits fins (`vaultAccess` flag).
- Journal d'échange dans les **flags d'acteur** (`flags.warbound.tradeHistory`), aucun message de chat Warbound.
- Tests unitaires `trade.test.mjs` + `vault.test.mjs` (logique pure ; recette live A15–A17, A20–A22, V01–V04).

### P5 — Conteneurs COF2 (issue #117)

- Handler `ITEM_TYPE_HANDLERS.container` : `contents` (résout les UUIDs COF2) + `transfer` (inclut le contenu dans chaque transfert).
- `container` retiré de `EXCLUDED_TYPES` et `ITEM_FILTER_VALUES`.
- Tests unitaires `containers.test.mjs` (logique pure ; recette live A18–A19, A24–A25).

### P6 — Documentation (issue #118)

- Guide MJ FR complet dans `docs/item-piles.md` (activation, piles, coffres, marchands, échanges, vaults, conteneurs, débogage, retour arrière).
- Matrice F01–F15 complète dans `documentation/item-piles-matrix-f01-f15.md`.
- Checklist Definition of Done (cadrage §11) dans `documentation/item-piles-dod.md`.
- Recettes de validation dans `documentation/recette/item-piles/`.
- Déclaration de compatibilité `module.json` : `recommends[item-piles].compatibility` → `minimum: 3.3.4`, `verified: 3.3.4`, `maximum: 3.3.4`.

---

## Intégration continue

Les tests Item Piles sont **purs** (aucune dépendance à Foundry) et sont exécutés par le pipeline CI existant :

- `pnpm test` (= `node --test`, découverte récursive) exécute **tous** les `*.test.mjs`, y compris
  `src/integrations/item-piles/*.test.mjs` et `scripts/integrations/item-piles/*.test.mjs` — **833 tests**.
- Le job CI (`.github/workflows/ci.yml`) enchaîne aussi `pnpm check:html-inline`, `pnpm packs:audit`,
  `pnpm packs:migrate-assets` et `pnpm packs:build`.

Aucune modification de workflow n'est nécessaire : Item Piles n'exige pas de Foundry headless.

---

## Changements impactants

Aucun breaking change pour les utilisateurs existants. L'intégration est activée uniquement si Item Piles est installé et actif.

---

## Compatibilité déclarée

| Composant | Version testée |
|---|---|
| Foundry VTT | 14.367 |
| COF2 | 2.3.12 |
| Item Piles | 3.3.4 (minimum et maximum) |

> **Attention** : les versions d'Item Piles antérieures à 3.3.4 et postérieures à 3.3.4 ne sont **pas garanties**. Des changements d'API dans Item Piles (signatures `addSystemIntegration`, `ITEM_TYPE_HANDLERS`, hooks) peuvent casser l'intégration sans avertissement. Tester sur une version de staging avant toute mise à jour.

---

## Procédure de retour arrière

En cas de problème après activation d'Item Piles ou mise à jour du module :

1. **Sauvegarder le monde** avant toute intervention (Administration → Configuration du Serveur → Sauvegarder le Monde).
2. **Désactiver Item Piles** dans la gestion des modules puis recharger la page : les acteurs et objets restent intacts.
3. Si la désactivation ne suffit pas : restaurer depuis la sauvegarde du monde créée à l'étape 1.
4. Pour revenir à une version antérieure d'Item Piles : désinstaller, puis réinstaller via l'URL de manifest de la version ciblée (disponible sur le dépôt GitHub d'Item Piles).

---

## Recettes à valider avant release

| Fonctions | Fichier | Scénarios |
|---|---|---|
| F01–F04, F13 | `documentation/recette/item-piles/114-recette-f01-f04-f13.md` | A01–A08 |
| F05–F07 | `documentation/recette/item-piles/115-recette-f05-f07.md` | A09–A14 |
| F08–F10, F13 | `documentation/recette/item-piles/116-recette-f08-f10-f13.md` | A15–A17, A20–A22, V01–V04 |
| F11, F12, F15 | `documentation/recette/item-piles/117-recette-f11-f12-f15.md` | A18–A19, A24–A25 |

---

## Documents de référence

- Matrice de compatibilité F01–F15 : `documentation/item-piles-matrix-f01-f15.md`
- Definition of Done (cadrage §11) : `documentation/item-piles-dod.md`
- Documentation technique + guide MJ : `docs/item-piles.md`
- Cadrage d'intégration : `documentation/cadrage/Warbound_Cadrage_Integration_Item_Piles_COF2.md`

# Recette manuelle — marchands, monnaie et prix avancés (P3 — #115)

**Issue** : [#115 — feat(item-piles): marchands, monnaie et prix avancés — F05 à F07](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/115)
**Parent** : #111 · **Plan** : `documentation/plan/integrations/item-piles/115-marchands-monnaie-prix-avances-f05-f07.md`
**Scénarios** : A09–A14 (cadrage `Warbound_Cadrage_Integration_Item_Piles_COF2.md` §9.2)
**Type** : **HITL** — validation manuelle dans Foundry live (non automatisable sans navigateur/MJ).

> Contexte injecté : environnement Foundry VTT **14.367**, COF2 **2.3.12**, Item Piles **3.3.4**, module `warbound-campaign-content` actif.

---

## 1. Objectif

Valider que la configuration COF2 enregistrée par l'adaptateur (`buildItemPilesConfig`) produit le
comportement attendu d'Item Piles sur les interactions marchandes : achat/vente, monnaie PO/PA/PC,
rendu de monnaie, marge/rabais, services, stock fini/infini.

Le volet **code** de #115 (fonctions pures de normalisation/arrondi monétaire `currency.mjs`, lecture
des flags marchands `merchant.mjs`, tests unitaires) est couvert par la PR associée ; cette fiche
couvre le volet **recette live**, qui reste à cocher par un MJ.

---

## 2. Pré-requis

- Monde de test sauvegardé (ne pas utiliser le monde de production).
- Item Piles **3.3.4** et Warbound actifs ; message « système non reconnu » d'Item Piles **absent**.
- **Deux clients joueurs séparés** + un compte MJ.
- Jeu de données §9.1 : deux personnages (dont un sans ressources), un **marchand avec stock et
  monnaies limités**, un article gratuit/service, un lot d'objets identiques, un article à marge et
  un article à prix spécial.
- Convention monétaire **COF2** active : 1 PO = 10 PA = 100 PC.

---

## 3. Scénarios

Légende statut : `[ ]` à tester · `[x]` OK · `[!]` échec · `[~]` non applicable (justifier).

| Réf. | Action | Attendu impératif | Statut | Notes / preuve |
|---|---|---|---|---|
| A09 | Achat 8 PA avec 7 PA | **Refus** ; inventaires et monnaies **inchangés** | [ ] | |
| A10 | Achat 8 PA avec 1 PO | 8 PA payés, **rendu 2 PA** (convention COF2 + disponibilité du rendu) ; soldes exacts | [ ] | |
| A11 | Rendu de monnaie vendeur à ressources limitées | **Aucune pièce créée** ; opération valide ou refusée selon les règles Item Piles | [ ] | |
| A12 | Achat de plusieurs unités, rabais, marge, coût spécial | Prix et stocks exacts ; **pas d'arrondi abusif** ; pas d'invention de prix par Warbound | [ ] | |
| A13 | Achat d'un service | Paiement correct **sans création intempestive d'un Item** chez l'acheteur | [ ] | |
| A14 | Vente à marchand en fonds finis puis fonds infinis | Débits/crédits cohérents avec le mode marchand ; **rendu déduit** du marchand | [ ] | |

### 3.1 Vérifications complémentaires (F05 / F06)

| Réf. | Action | Attendu | Statut | Notes |
|---|---|---|---|---|
| C01 | Article `hidden` | Masqué dans l'inventaire marchand | [ ] | |
| C02 | Article `notForSale` | Non proposé à la vente | [ ] | |
| C03 | Article `cantBeSoldToMerchants` | Le PJ ne peut pas le revendre au marchand | [ ] | |
| C04 | Stock `infiniteQuantity` (`yes`/`no`/`default`) | Disponibilité conforme au tri-état | [ ] | |
| C05 | Article `isService` | Payé, aucun Item livré | [ ] | |
| C06 | Marge/rabais `buyPriceModifier`/`sellPriceModifier` | Prix appliqués par Item Piles ; Warbound n'altère pas | [ ] | |

---

## 4. Critères d'acceptation (#115)

- [ ] A09–A14 réussis.
- [ ] Test de référence : **7 PA pour 8 PA → refus, aucune mutation**.
- [ ] A10 : achat 8 PA avec 1 PO → **rendu 2 PA**.
- [ ] Régression Item Piles 3.3.3 (rendu **non déduit** du marchand) : **absente** en 3.3.4.
- [ ] Aucune mutation partielle en cas d'achat refusé/interrompu.
- [ ] Tests unitaires normalisation/arrondi monétaire verts (`pnpm test`) — **couverts par la PR**.

---

## 5. Périmètre code livré (PR)

Sans logique marchande réimplémentée dans Warbound (cadrage §5) :

- `src/integrations/item-piles/currency.mjs` — `canAfford`, `subtractCurrency`, `calculateChange`
  (validation/soustraction en PC entiers, rendu exact, politique d'arrondi).
- `src/integrations/item-piles/merchant.mjs` — lecteurs des flags réels Item Piles 3.3.4
  (`notForSale`, `cantBeSoldToMerchants`, `hidden`, `isService`, `infiniteQuantity`) +
  `applyMerchantMarkup` (arrondi). **Non branchés** sur un hook : Item Piles reste maître du runtime.
- Tests unitaires `currency.test.mjs` / `merchant.test.mjs` (invariants §6.2, référence 7PA/8PA,
  régression 3.3.3 modélisée).
- `docs/item-piles.md` — contrat des flags marchands/prix vérifié + invariants monétaires.

Les points A09–A14 dépendent du **runtime Item Piles** (UI marchand, paiement) : ils ne peuvent être
prouvés que par recette live. Ce sont eux qui motivent le statut **HITL** de cette fiche.

---

## 6. Journal de recette

| Date | Recetteur | Environnement | Résultat global | Écarts / issues |
|---|---|---|---|---|
| | | FVTT 14.367 · COF2 2.3.12 · Item Piles 3.3.4 | | |

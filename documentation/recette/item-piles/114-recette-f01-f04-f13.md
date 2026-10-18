# Recette manuelle — butin, piles au sol et coffres (P2 — #114)

**Issue** : [#114 — feat(item-piles): butin, piles au sol et coffres — F01 à F04, F13](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/114)
**Parent** : #111 · **Plan** : `documentation/plan/integrations/item-piles/114-butin-piles-coffres-f01-f04-f13.md`
**Scénarios** : A01–A08, A20–A23, A25 (cadrage `Warbound_Cadrage_Integration_Item_Piles_COF2.md` §9)
**Type** : **HITL** — validation manuelle dans Foundry live (non automatisable sans navigateur/MJ).

> Contexte injecté : environnement Foundry VTT **14.367**, COF2 **2.3.12**, Item Piles **3.3.4**, module `warbound-campaign-content` actif.

---

## 1. Objectif

Valider que la configuration COF2 enregistrée par l'adaptateur (`buildItemPilesConfig`) produit le
comportement attendu d'Item Piles sur les interactions dépôt / ramassage / butin / coffre, sans
perte ni duplication d'objets, de charges ou de monnaie.

Le volet **code** de #114 (tests unitaires complémentaires, politique `system.equipped`) est couvert
par la PR associée ; cette fiche couvre le volet **recette live**, qui reste à cocher par un MJ.

---

## 2. Pré-requis

- Monde de test sauvegardé (ne pas utiliser le monde de production).
- Item Piles **3.3.4** et Warbound actifs ; message « système non reconnu » d'Item Piles **absent**.
- **Deux clients joueurs séparés** + un compte MJ (pour A20–A22).
- Jeu de données §9.1 : deux personnages (dont un sans ressources), une rencontre avec butin, un
  marchand, un coffre Item Piles, un vault, une arbalète `stackable=false` avec charges, deux
  exemplaires d'armes identiques mais effets différents, une pile de 8 potions `stackable=true`,
  un grand bouclier, un consommable à quantité maximale, un `container` COF2 rempli, un article
  gratuit/service.

---

## 3. Scénarios

Légende statut : `[ ]` à tester · `[x]` OK · `[!]` échec · `[~]` non applicable (justifier).

### 3.1 Butin / piles / transferts

| Réf. | Action | Attendu impératif | Statut | Notes / preuve |
|---|---|---|---|---|
| A01 | Un PJ dépose une potion au sol, puis la ramasse | Pile créée avec le bon acteur ; quantité et action conservées | [ ] | |
| A02 | Transférer 3 potions sur une pile de 8 | Source = 5, destination = 3 ; aucune duplication | [ ] | |
| A03 | Déposer puis récupérer deux arbalètes | Deux instances distinctes ; charges préservées | [ ] | |
| A04 | Deux objets même `slug`, effets/charges différents | Aucune fusion destructrice | [ ] | |
| A05 | Tenter une quantité > stock ou > `quantity.max` | Refus ; aucune mutation | [ ] | |
| A06 | Déplacer/ramasser un objet équipé | Politique `system.equipped` conforme (valeur transférée telle quelle) ; effets non dupliqués | [ ] | voir §5 |
| A07 | Ouvrir / fermer / verrouiller un coffre | UI, images/sons d'état, permissions respectées ; accès non autorisé impossible | [ ] | |
| A08 | Butin d'une rencontre partagé entre plusieurs PJ | Total objets + monnaie **invariant** ; répartition correcte | [ ] | |
| A25 | Réouvrir la fiche objet et le chat après transfert | Descriptions, actions, effets, prix, rareté, autorisations cohérents | [ ] | |

### 3.2 Concurrence, permissions, dégradation

| Réf. | Action | Attendu impératif | Statut | Notes / preuve |
|---|---|---|---|---|
| A20 | Deux clients ramassent simultanément le même objet | Une seule opération aboutit ; stock jamais négatif | [ ] | |
| A21 | Client joueur agit sur un acteur non possédé | Action refusée ; aucune fuite de données ni mutation | [ ] | |
| A22 | Transaction nécessitant le MJ, en son absence | Erreur compréhensible ; aucune transaction partielle | [ ] | |
| A23 | Warbound seul (Item Piles **désactivé**) | Aucune exception ; aucune fonctionnalité Warbound cassée | [ ] | |

### 3.3 Invariants transverses (obligation de couverture §9.2)

Vérifier la même règle par les voies qui la sollicitent :

| Règle | pile → PJ | PJ → pile | marché ↔ PJ | PJ ↔ PJ | vault ↔ PJ | API / tables |
|---|---|---|---|---|---|---|
| Quantité | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Empilement | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Prix | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Permissions | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

---

## 4. Critères d'acceptation (#114)

- [ ] A01–A08 réussis.
- [ ] A20–A23 réussis.
- [ ] A25 : actions et effets d'un objet préservés après transfert.
- [ ] Aucune mutation partielle en cas d'opération interrompue.
- [ ] Tests unitaires complémentaires verts (`pnpm test`) — **couverts par la PR**.

---

## 5. Politique attendue sur `system.equipped` (A06/A25)

Décision documentée dans `docs/item-piles.md` et `src/integrations/item-piles/items.mjs` :

- Item Piles transfère la donnée d'objet **telle quelle** ; l'adaptateur ne définit aucun handler
  touchant `system.equipped`.
- COF2 n'auto-équipe que dans son flux `addBaseItemItem` (création d'acteur), non emprunté par
  Item Piles.
- Attendu : un objet transféré avec `equipped: true` **reste équipé** chez le receveur ;
  rééquilibrage manuel si nécessaire. Vérifier qu'aucun effet/action n'est dupliqué.

En cas d'écart (objet conservant `equipped: true` de façon jugée non désirable), consigner l'écart
et ouvrir une issue corrective — ne pas transformer silencieusement la donnée.

---

## 6. Journal de recette

| Date | Recetteur | Environnement | Résultat global | Écarts / issues |
|---|---|---|---|---|
| | | FVTT 14.367 · COF2 2.3.12 · Item Piles 3.3.4 | | |

# Matrice F01–F15 — Intégration Item Piles COF2

> Module : `warbound-campaign-content`  
> Système : COF2 2.3.12 · Item Piles 3.3.4 · Foundry VTT 14.367  
> Mis à jour : 2026-10-18 — P6 #118

Légende : ✅ OK (intégré + recette à cocher) · ⚠️ Écart assumé (documenté) · ❌ Exclu (raison documentée) · 🔲 Recette live à valider

---

## Tableau

| Code | Fonctionnalité | Statut | Issue/PR | Notes |
|---|---|---|---|---|
| F01 | Piles au sol | ✅ 🔲 | #114 | Déposer, ramasser, piles existantes, suppression à zéro. Recette : `114-recette-f01-f04-f13.md`. |
| F02 | Butin | ✅ 🔲 | #114 | Butin `encounter`, pillage créatures, transfert acteurs, partage monnaie. Recette : `114-recette-f01-f04-f13.md`. |
| F03 | Quantités | ✅ | #113 | Fusion/non-fusion via `canStack`, `system.quantity.current`, `normalizeQuantity`. Tests unitaires verts. |
| F04 | Coffres | ✅ 🔲 | #114 | Pile conteneur, ouvrir/fermer/verrouiller, accès. Recette : `114-recette-f01-f04-f13.md`. |
| F05 | Marchands | ✅ 🔲 | #115 | Achat/vente, stock fini/infini, articles cachés, interdits, prix nuls. Recette : `115-recette-f05-f07.md`. |
| F06 | Prix avancés | ✅ 🔲 | #115 | Majorations/réductions, lots, services, prix en attribut. `applyMerchantMarkup`, `isService`. Recette : `115-recette-f05-f07.md`. |
| F07 | Monnaies | ✅ 🔲 | #115 | PO/PA/PC, paiement multidevise, rendu exact, convention COF2 (1 PO = 10 PA = 100 PC). Tests unitaires verts (A09–A14, régression 3.3.3). Recette : `115-recette-f05-f07.md`. |
| F08 | Échanges PJ | ✅ 🔲 | #116 | Donner, échange double validation, annulation. Warbound = observateur via `item-piles-tradeComplete`. Recette : `116-recette-f08-f10-f13.md`. |
| F09 | Vaults | ✅ 🔲 | #116 | Inventaire partagé, droits fins via `vaultAccess` flag, journal natif. Recette : `116-recette-f08-f10-f13.md`. |
| F10 | Journaux | ✅ 🔲 | #116 | Journal d'échange dans `flags.warbound.tradeHistory` (hook `item-piles-tradeComplete`) ; journaux vault **natifs** Item Piles (`logVaultActions`). Recette : `116-recette-f08-f10-f13.md`. |
| F11 | Automatisation | ✅ | #117 | Peuplement depuis compendiums/tables/dossiers : natif Item Piles. `container` retiré des filtres → visible dans marchands. Calendrier optionnel : non requis (Simple Calendar non installé). |
| F12 | Paramétrage | ✅ | #117 | `getMerchantCategory`, `getItemVisibility`, `getItemPermissions` (purs, non branchés). Filtres, colonnes, prix, rareté, visibilité, permissions : natifs Item Piles. |
| F13 | Accès multijoueur | ✅ 🔲 | #116 | MJ/joueurs, acteurs possédés, absence MJ, transactions concurrentes (`ongoingTrades`). Recette : `116-recette-f08-f10-f13.md`. |
| F14 | Interopérabilité | ⚠️ | — | API et hooks officiels utilisés (pas d'API privée). AppV2 Foundry 14 : non testé explicitement. Glisser-déposer et macros : natifs Item Piles, aucune surcharge Warbound. Écart : aucune recette dédiée F14. |
| F15 | Conteneurs COF2 | ✅ 🔲 | #117 | Handler `ITEM_TYPE_HANDLERS.container` : `contents` (résout UUIDs) + `transfer` (inclut contenu dans le transfert). `container` retiré de `EXCLUDED_TYPES` et `ITEM_FILTER_VALUES`. Tests unitaires `containers.test.mjs` verts. Recette live A18–A19, A24–A25 à cocher. |

---

## Écarts assumés

| Code | Écart | Raison |
|---|---|---|
| F14 | Aucune recette dédiée interopérabilité | Item Piles gère le glisser-déposer nativement ; aucune surcharge Warbound. Aucun bug connu à ce jour. |
| F15 | Résolution UUID `system.contents` via `fromUuidSync` uniquement | `getContents()` COF2 (async) non utilisé dans le handler. `fromUuidSync` retourne `null` pour les items non embarqués sur l'acteur courant (compendium non peuplé) : ils sont silencieusement ignorés. À surveiller en recette A19. |
| F15 | Pas de remap des UUIDs `system.contents` / `system.container` lors d'un transfert **inter-acteur** | Item Piles déplace les Items (nouvel acteur → nouveaux UUIDs) mais ne connaît pas les champs COF2. La logique de remap COF2 (`_transferItem`, `base-actor-sheet.mjs`) ne s'exécute **pas** hors de la fiche. Après un transfert inter-acteur d'un conteneur, les biens sont conservés (le handler `transfer` les inclut) mais l'association conteneur↔contenu peut devenir orpheline. Un remap serait une réécriture de la logique de transfert (contra cadrage §5) — à confirmer en recette A19/A24. |

---

## Recettes à valider

| Code | Fichier recette | Scénarios |
|---|---|---|
| F01–F04, F13 | `documentation/recette/item-piles/114-recette-f01-f04-f13.md` | A01–A08 |
| F05–F07 | `documentation/recette/item-piles/115-recette-f05-f07.md` | A09–A14 |
| F08–F10, F13 | `documentation/recette/item-piles/116-recette-f08-f10-f13.md` | A15–A17, A20–A22, V01–V04 |
| F11, F12, F15 | `documentation/recette/item-piles/117-recette-f11-f12-f15.md` | A18–A19, A24–A25 |

---

## Definition of Done

La couverture des critères de livraison (cadrage §11) est suivie dans
[`documentation/item-piles-dod.md`](item-piles-dod.md).

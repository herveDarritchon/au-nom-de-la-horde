# Recette manuelle — conteneurs COF2, automatisation et options (P5 — #117)

**Issue** : [#117 — feat(item-piles): handler conteneurs COF2, automatisation et options — F11, F12, F15](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/117)
**Parent** : #111 · **Plan** : `documentation/plan/integrations/item-piles/117-conteneurs-automatisation-options-f11-f12-f15.md`
**Scénarios** : A18, A19, A24, A25 (cadrage `Warbound_Cadrage_Integration_Item_Piles_COF2.md` §9.2 et §10 P5)
**Type** : **HITL** — validation manuelle dans Foundry live (non automatisable sans navigateur/MJ).

> Contexte injecté : environnement Foundry VTT **14.367**, COF2 **2.3.12**, Item Piles **3.3.4**, module `warbound-campaign-content` actif.

---

## 1. Objectif

Valider les trois axes de #117 :

- **F15 — Conteneurs COF2** : le handler `ITEM_TYPE_HANDLERS.container` (`contents` + `transfer`) permet
  de transférer/vendre un conteneur **avec son contenu** sans perte ni duplication.
- **F11 — Automatisation** : peuplement d'un marchand/pile depuis un compendium, un dossier ou une table
  aléatoire, et rafraîchissement de stock (natif Item Piles 3.3.4).
- **F12 — Paramétrage** : filtres, catégories, prix, rareté, visibilité et permissions, persistants
  après redémarrage/update.

Le volet **code** (handler conteneur, helpers purs, retrait `container` des filtres, tests unitaires,
matrice F01–F15) est couvert par la PR associée ; cette fiche couvre le volet **recette live**.

> **Contrat Item Piles 3.3.4 vérifié (bundle)** : `ITEM_TYPE_HANDLERS.container.contents` appelé en
> `handler({ item }) → Item[]` (l.35005) ; `.transfer` appelé en `handler({ item, items })` (l.83990) et
> `handler({ item, items, raw: true })` (l.36035). Résolution via `SYSTEMS.DATA.ITEM_TYPE_HANDLERS`
> (mergé depuis `addSystemIntegration`, l.358/386/97831/34578).

---

## 2. Pré-requis

- Monde de test sauvegardé (ne pas utiliser le monde de production).
- Item Piles **3.3.4** et Warbound actifs ; message « système non reconnu » d'Item Piles **absent**.
- Un **conteneur COF2 peuplé** : sac/coffre (`type: container`) contenant au moins **deux équipements**
  dont un **empilable** (avec charges/effets), et un peu de **monnaie** (pour le contrôle de
  non-double-comptage). Vérifier dans la fiche que `system.contents` liste bien des UUIDs d'items
  **embarqués sur le même acteur**.
- Un **marchand** (`encounter`) configurable, un **compendium d'items COF2** peuplé, un **dossier
  d'acteurs/items**, une **table aléatoire** (RollTable) d'items.
- Jeu de données §9.1 (personnages, ressources, permis/non permis).

---

## 3. Scénarios

Légende statut : `[ ]` à tester · `[x]` OK · `[!]` échec · `[~]` non applicable (justifier).

### 3.1 Conteneurs COF2 (F15)

| Réf. | Action | Attendu impératif | Statut | Notes / preuve |
|---|---|---|---|---|
| A19a | Conteneur COF2 peuplé sur un PJ → **transfert vers une pile/coffre (inter-acteur)** | Conteneur **et** son contenu transférés **une seule fois** ; aucune duplication ; les biens existent chez le receveur | [ ] | surveiller l'écart remap (§4) |
| A19b | Conteneur COF2 peuplé → **vente à un marchand** | Solde monétaire cohérent (le prix inclut le contenu, handler `transfer` l.36035) ; aucune duplication de biens | [ ] | |
| A19c | Vérifier la **cohérence conteneur ↔ contenu** après transfert inter-acteur | Fiche du conteneur : `system.contents` résout (ou écart remap confirmé + documenté) | [ ] | voir §4 |
| A19d | **Non-double-comptage** de la monnaie contenue | Total monétaire de la pile/PJ = monnaie directe + monnaie contenue, **sans double compte** (le handler `contents` n'est pas sollicité pour la monnaie, cf. §4) | [ ] | |
| A25 | Réouverture fiche objet **et** chat après transfert du conteneur et d'un item contenant | Descriptions, actions, effets, prix, rareté, autorisations cohérents | [ ] | |

### 3.2 Automatisation marchand (F11)

| Réf. | Action | Attendu impératif | Statut | Notes / preuve |
|---|---|---|---|---|
| A18a | Peupler un marchand depuis un **compendium** d'items COF2 | Items **filtrés** (pas de `profile`/`feature`/`capacity`/`attack`/`path`), quantités correctes, **pas** de traits/capacités importés | [ ] | |
| A18b | Peupler depuis un **dossier** puis depuis une **table aléatoire** | Items présents, quantités correctes ; conteneurs proposés (retirés des filtres) | [ ] | |
| A18c | **Rafraîchissement** du stock marchand | Stock mis à jour sans duplication ni perte des articles existants | [ ] | |

### 3.3 Paramétrage marchand (F12)

| Réf. | Action | Attendu impératif | Statut | Notes / preuve |
|---|---|---|---|---|
| A24a | Configurer un marchand (filtres, catégories, colonnes, prix prédéfinis, styles de rareté, visibilité, permissions) puis **redémarrer** Foundry | Réglages **conservés** à l'identique | [ ] | |
| A24b | Après **mise à jour** du module/monde | Réglages conservés **ou** migration annoncée et contrôlée (aucune perte silencieuse) | [ ] | |
| A24c | Article `hidden=true` / `notForSale=true` | Non proposé conformément aux flags marchands (F12 natif) | [ ] | |
| A24d | Filtre par catégorie / colonnes marchands | Comportement conforme à Item Piles (`getItemCategories()` = `CONFIG.Item.typeLabels`) | [ ] | |

### 3.4 Invariants transverses (obligation de couverture §9.2)

| Règle | conteneur transféré | conteneur vendu |
|---|---|---|
| Quantité | [ ] | [ ] |
| Empilement | [ ] | [ ] |
| Permissions | [ ] | [ ] |
| Métadonnées (charges/effets) | [ ] | [ ] |
| Monnaie (sans double compte) | [ ] | [ ] |

---

## 4. Écarts à surveiller (assumés, à confirmer en recette)

| Écart | Nature | Attendu en recette |
|---|---|---|
| **Remap UUID inter-acteur** | Item Piles déplace les Items (nouvel acteur → nouveaux UUIDs) mais ne connaît pas `system.contents`/`system.container` COF2. La logique de remap COF2 (`_transferItem`, fiche acteur) ne s'exécute pas hors fiche. | Les **biens** sont conservés (le handler `transfer` les inclut) ; l'**association** conteneur↔contenu peut devenir orpheline après un transfert inter-acteur. Confirmer, puis documenter. Un remap serait une réécriture de la logique de transfert (contra cadrage §5). |
| **UUID de compendium non résolus** | `extractContainerContents` renvoie des UUIDs résolus par `fromUuidSync`. Un UUID pointant vers un item **non embarqué** (compendium non chargé) résout en `null` → ignoré. | Pour un conteneur embarqué sur un acteur, les contenus sont embarqués → résolus. Aucune perte attendue. |
| **Double-comptage monnaie** | Le handler `contents` est utilisé par `getCurrenciesInItem` (l.35005), mais uniquement pour les types ayant `hasCurrency` (non déclaré pour `container`). | La monnaie contenue n'est **pas** comptée deux fois. Confirmer via A19d. |

---

## 5. Critères d'acceptation (#117)

- [ ] A19 : conteneur COF2 transféré/vendu — **ni duplication ni perte** de biens.
- [ ] A18 : peuplement depuis table/compendium/dossier — items filtrés, quantités correctes.
- [ ] A24 : configuration personnalisée conservée après redémarrage/update.
- [ ] A25 : fiche objet et chat cohérents après transfert.
- [ ] Matrice F01–F15 documentée (OK ou écart assumé) — **couverte par la PR**.
- [ ] Tests unitaires verts (`pnpm test`) — **couverts par la PR**.

---

## 6. Périmètre code livré (PR)

Sans logique Item Piles réimplémentée (cadrage §5) :

- `src/integrations/item-piles/containers.mjs` — `isPopulatedContainer`, `extractContainerContents`,
  `validateContainerTransfer` (logique pure sur les UUIDs `system.contents`).
- `scripts/integrations/item-piles/config.mjs` — `ITEM_TYPE_HANDLERS.container` (`contents` l.35005,
  `transfer` l.83990 + l.36035) ; `container` retiré de `ITEM_FILTER_VALUES`.
- `src/integrations/item-piles/items.mjs` — `container` retiré de `EXCLUDED_TYPES`.
- `src/integrations/item-piles/merchant.mjs` — `getMerchantCategory`, `getItemVisibility`,
  `getItemPermissions` (F12, helpers purs de classification COF2).
- `documentation/item-piles-matrix-f01-f15.md` — matrice F01–F15 + écarts assumés.

A18/A19/A24/A25 dépendent du **runtime Item Piles** (UI marchand, tables, drag & drop) : ils ne peuvent
être prouvés que par recette live → statut **HITL** de cette fiche.

---

## 7. Journal de recette

| Date | Recetteur | Environnement | Résultat global | Écarts / issues |
|---|---|---|---|---|
| | | FVTT 14.367 · COF2 2.3.12 · Item Piles 3.3.4 | | |

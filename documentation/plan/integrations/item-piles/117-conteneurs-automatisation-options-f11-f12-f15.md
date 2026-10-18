# Plan d'implémentation — feat(item-piles): handler conteneurs COF2, automatisation et options — F11, F12, F15

**Issue** : [#117 — feat(item-piles): handler conteneurs COF2, automatisation et options — F11, F12, F15](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/117)  
**Parent** : #111 — feat(co2): Intégration complète d'Item Piles via Warbound  
**Bloqué par** : #112 — P0 Audit (`container.contents` sur instance peuplée), #114 — P2 Butin & coffres, #115 — P3 Marchands  
**Modules impactés** : `src/integrations/item-piles/`, `scripts/integrations/item-piles/config.mjs`

---

## 1. Objectif

Compléter l'intégration Item Piles COF2 sur trois axes :

1. **Conteneurs COF2** (`type: container`) — décider si un handler est faisable après audit #112 :
   - Si `container.contents` contient des items Foundry peuplés : implémenter `ITEM_TYPE_HANDLERS` + `containers.mjs`.
   - Si `contents` ne contient que des UUID de compendium non peuplés : documenter l'incompatibilité et exclure explicitement (pas de handler).
2. **Automatisation marchands (F11)** — callbacks COF2 pour peuplement depuis compendiums, dossiers, tables aléatoires et rafraîchissement de stock.
3. **Options marchands (F12)** — filtres par catégorie, colonnes, prix prédéfinis, styles de rareté, visibilité, permissions.
4. **Matrice F01–F15** — documentation complète (OK ou écart assumé).

---

## 2. Périmètre

### Inclus

- **F11** : peuplement automatique (compendium, dossiers, tables aléatoires, rafraîchissement) — **natif Item Piles 3.3.4** ; Warbound retire `container` des filtres pour que les conteneurs soient proposés. Calendrier optionnel : Simple Calendar non installé → hors périmètre.
- **F12** : `getMerchantCategory`, `getItemVisibility`, `getItemPermissions` dans `merchant.mjs` (helpers purs de classification COF2, **non branchés** — F12 reste natif Item Piles ; `getItemCategories()` du bundle lit `CONFIG.Item.typeLabels`).
- **F15** : tableau F01–F15 dans `documentation/item-piles-matrix-f01-f15.md` + écarts assumés.
- `src/integrations/item-piles/containers.mjs` (nouveau) — logique pure :
  - `isPopulatedContainer(item)` → boolean
  - `extractContainerContents(item)` → `string[]` (UUIDs) sans mutation
  - `validateContainerTransfer(container, targetActor)` → `{ok, reason}`
- `src/integrations/item-piles/containers.test.mjs` (nouveau) — logique pure (UUIDs, garde type, copie défensive)
- `src/integrations/item-piles/items.mjs` — retirer `container` de `EXCLUDED_TYPES`
- `scripts/integrations/item-piles/config.mjs` — retirer `container` de `ITEM_FILTER_VALUES` ; ajouter `ITEM_TYPE_HANDLERS.container`

### Hors périmètre

- UI Foundry custom pour conteneurs (délégué à Item Piles)
- Intégration Simple Calendar (optionnelle, non bloquante pour F15)
- Modification du modèle COF2 `container`

---

## 3. État antérieur

- `container` est dans `EXCLUDED_TYPES` (`items.mjs`) et `ITEM_FILTER_VALUES` (`config.mjs`) avec commentaire `// container exclu jusqu'à handler complet validé (P5 — #117)`.
- `merchant.mjs` créé en #115 expose les lecteurs de flags de base. Aucune logique F11/F12 existante.
- Aucun fichier `containers.mjs` dans `src/integrations/item-piles/`.

---

## 4. Décisions d'architecture

- **Handler décidé** : `system.contents` = UUIDs d'Items ; pour un conteneur embarqué sur un acteur, `fromUuidSync` résout (identique à `contentsCount`/`getContents()` COF2, `container.mjs` l.47-83). Handler `ITEM_TYPE_HANDLERS.container` **implémenté**. Écart assumé : UUIDs de compendium non embarqués → non résolus (ignorés).
- **Pas de mutation** : `extractContainerContents` retourne une copie des UUIDs — la résolution et le transfert sont délégués aux handlers Foundry (Item Piles applique).
- **F11** : peuplement piloté par l'UI/API native Item Piles 3.3.4. Warbound ne réimplémente rien ; il expose le type `container` aux filtres.
- **F12** : F12 reste **natif** Item Piles (`getItemCategories()`, flags marchands). Les helpers de `merchant.mjs` sont des fonctions pures de classification COF2, **non branchées** sur un contrat Item Piles (aucune garantie de contrat → on n'expose rien au runtime).
- **F15** : tableau Markdown dans `documentation/item-piles-matrix-f01-f15.md` — colonne statut (✅ OK / ⚠️ Écart / ❌ Exclu) + note par fonctionnalité.

---

## 5. Plan de travail

1. **Vérifier audit #112** — `system.contents` = `ArrayField(DocumentUUIDField)` ; pour un conteneur **embarqué sur un acteur**, `fromUuidSync` résout les UUIDs (même logique que `contentsCount`/`getContents()` COF2). Le handler est donc faisable → étapes 2–3.
2. **`src/integrations/item-piles/containers.mjs`** — `isPopulatedContainer`, `extractContainerContents`, `validateContainerTransfer` (logique pure).
3. **`src/integrations/item-piles/containers.test.mjs`** — couvre la logique pure (UUIDs, garde type, copie défensive) ; les scénarios live A18/A19/A24/A25 relèvent de la recette (voir §9).
4. **`src/integrations/item-piles/items.mjs`** — retirer `container` de `EXCLUDED_TYPES` (handler fourni).
5. **`scripts/integrations/item-piles/config.mjs`** — retirer `container` de `ITEM_FILTER_VALUES` ; ajouter `ITEM_TYPE_HANDLERS.container` (`contents` l.35005, `transfer` l.83990 + l.36035 — signatures vérifiées).
6. **`src/integrations/item-piles/merchant.mjs`** — ajouter `getMerchantCategory`, `getItemVisibility`, `getItemPermissions` (F12, helpers purs de classification — F12 reste natif Item Piles).
7. **`src/integrations/item-piles/merchant.test.mjs`** — couvrir F12 : catégories, visibilité, permissions.
8. **`documentation/item-piles-matrix-f01-f15.md`** — tableau complet F01–F15 + écarts assumés.
9. **`documentation/recette/item-piles/117-recette-f11-f12-f15.md`** — recette live A18, A19, A24, A25.

---

## 6. Fichiers modifiés

| Fichier | Action |
|---|---|
| `src/integrations/item-piles/containers.mjs` | créé (conditionnel — si handler faisable après audit #112) |
| `src/integrations/item-piles/containers.test.mjs` | créé (conditionnel) |
| `src/integrations/item-piles/items.mjs` | modifié (`EXCLUDED_TYPES`) |
| `src/integrations/item-piles/merchant.mjs` | modifié (F12 : catégories, visibilité, permissions) |
| `src/integrations/item-piles/merchant.test.mjs` | modifié (scénarios F12) |
| `scripts/integrations/item-piles/config.mjs` | modifié (`ITEM_FILTER_VALUES`, `ITEM_TYPE_HANDLERS`) |
| `documentation/item-piles-matrix-f01-f15.md` | créé |

---

## 7. Tests attendus

**`containers.test.mjs`** — logique pure :
- `extractContainerContents` : copie défensive des UUIDs ; `[]` si non-`container` ou `contents` absent.
- `isPopulatedContainer` : conteneur peuplé → `true` ; vide ou non-`container` → `false`.
- `validateContainerTransfer` : `{ok:true}` ; `'not-container'` ; `'no-target-actor'`.

**`merchant.test.mjs`** (ajouts F12) :
- `getMerchantCategory` : `equipment`/`container` → clé i18n COF2 ; types non marchands → `null`.
- `getItemVisibility` : `hidden`/`notForSale` → `{visible:false, reason}` ; sinon `{visible:true}`.
- `getItemPermissions` : item/acteur absents ou non vendables → `{allowed:false, reason}`.

**Recette live (HITL, §9)** — A18 (peuplement depuis table/compendium), A19 (conteneur COF2 avec
contenu, transfert/vente), A24 (persistance d'une config personnalisée après redémarrage/update),
A25 (cohérence fiche objet/chat après transfert).

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `container.contents` = UUID non résolubles (`fromUuidSync` → `null`) | Écart **assumé** documenté (matrice + recette A19) ; option d'exclusion si la recette live révèle une perte réelle |
| `ITEM_TYPE_HANDLERS` non consommé par `getItemTypeHandler` | **Vérifié** : `getItemTypeHandler` lit `SYSTEMS.DATA.ITEM_TYPE_HANDLERS`, mergé depuis `addSystemIntegration` (bundle l.34578, 358, 386, 97831) |
| Duplication de contenu lors du transfert de conteneur | Dédup native Item Piles (l.83995) ; recette A19/A24 |
| Pas de remap des UUIDs COF2 lors d'un transfert inter-acteur | Écart **assumé** documenté (matrice F15) ; remap = réécriture de la logique de transfert (contra cadrage §5) |
| F12 callbacks non documentés en 3.3.4 | F12 reste **natif** Item Piles ; helpers Warbound purs, non branchés |

---

## 9. Critères d'arrêt

- `pnpm test` : 0 échec (`containers.test.mjs` + F12 verts ; scénarios live A18/A19/A24/A25 en recette).
- `pnpm build` : audit passe sans erreur.
- Validation manuelle Foundry (http://localhost:31000/game) — recette `117-recette-f11-f12-f15.md` :
  - A18 : marchand `encounter` peuplé depuis table/compendium/dossier — items filtrés, quantités correctes.
  - A19 : conteneur COF2 avec contenu, puis transfert/vente — ni duplication ni perte (écart remap surveillé).
  - A24 : config personnalisée conservée après redémarrage/update.
  - A25 : fiche objet/chat cohérents après transfert.
- `documentation/item-piles-matrix-f01-f15.md` complète (F01–F15, chaque fonctionnalité statut + note).
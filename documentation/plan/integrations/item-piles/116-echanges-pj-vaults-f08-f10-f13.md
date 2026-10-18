# Plan d'implémentation — feat(item-piles): échanges PJ↔PJ et vaults partagés — F08 à F10, F13

**Issue** : [#116 — feat(item-piles): échanges PJ↔PJ et vaults partagés — F08 à F10, F13](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/116)  
**Parent** : #111 — feat(co2): Intégration complète d'Item Piles via Warbound  
**Bloqué par** : #113 — P1 Adaptateur de base  
**Modules impactés** : `src/integrations/item-piles/trade.mjs` (nouveau), `src/integrations/item-piles/vault.mjs` (nouveau), `scripts/integrations/item-piles/hooks-trade.mjs` (nouveau), `scripts/integrations/item-piles/index.mjs` (modifié)

---

## 0. Révision du plan (contrat réel Item Piles 3.3.4)

Le plan initial reposait sur des hooks **supposés** (`item-piles-preTradeComplete`,
`item-piles-preVaultAccess`, `item-piles-vaultAccess`) et une architecture de **veto/guards**.
Vérification faite sur le bundle 3.3.4 (préfixe `item-piles-`) :

- `item-piles-preTradeComplete` **n'existe pas**.
- `item-piles-tradeComplete` existe mais est émis en `Hooks.callAll` → **non annulable**, signature
  `(instigator, leftTraderData, rightTraderData, tradeId)` (pas un objet unique).
- `item-piles-preVaultAccess` / `item-piles-vaultAccess` **n'existent pas** : `vaultAccess` est un
  **flag** d'acteur, appliqué nativement par `getVaultAccess()`.
- Le hook **cancellable** `item-piles-preTradeItems` (l. 85791) concerne le flux **marchand**, pas
  l'échange PJ↔PJ.

Conséquence : conformément au cadrage §5 (**ne pas réimplémenter** la logique Item Piles), Warbound
ne peut ni veto ni dupliquer ces comportements. Le périmètre est **re-cadré** : **observation**
(journal d'échange) côté PJ↔PJ, et **configuration data-driven** du flag `vaultAccess` côté vault.
Les garanties A15–A17, A20–A22 (double validation, sécurité, idempotence, annulations) sont
**natives** à Item Piles.

---

## 1. Objectif

Couvrir F08–F10 (échange PJ↔PJ) et F13 (vault partagé) en s'appuyant sur Item Piles 3.3.4, sans
réimplémenter sa logique :

- F08–F10 : journaliser les échanges terminés ; documenter que validation/sécurité/idempotence sont
  natives et non interceptables.
- F13 : fournir un constructeur et des lecteurs purs pour le flag **réel** `vaultAccess` (droits fins
  par acteur), et des utilitaires purs de préservation des métadonnées d'objet (charges/effets) ;
  s'appuyer sur le journal vault **natif**.

---

## 2. Périmètre

### Inclus

- `src/integrations/item-piles/trade.mjs` :
  - `buildTradeLogEntry({ tradeId, instigator, leftTraderData, rightTraderData, ts })` → entrée de
    journal normalisée (compteurs items/currencies/itemCurrencies, users, actors, accepted).
  - `appendTradeLog(history, entry)` → journal immutable, FIFO tronqué à 100.
- `src/integrations/item-piles/trade.test.mjs` :
  - construction d'entrée (cas nominal, champs absents, ts), append immutable + troncature FIFO.
- `src/integrations/item-piles/vault.mjs` :
  - `buildVaultAccessEntry({ uuid, view, organize, items, currencies })` → entrée `vaultAccess`
    conforme au contrat (defaults `view=true`, autres `false`).
  - `hasVaultRight(vaultAccess, actorUuid, right)` + wrappers `canView`, `canOrganize`,
    `canDepositItems`, `canWithdrawItems`, `canDepositCurrencies`, `canWithdrawCurrencies`.
  - `snapshotItemMetadata(item)` / `assertMetadataIntegrity(item, snapshot)` (charges, quantité, effets).
- `src/integrations/item-piles/vault.test.mjs` : defaults, droits fins, snapshot/intégrité, effets.
- `scripts/integrations/item-piles/hooks-trade.mjs` :
  - `registerTradeHooks()` → `Hooks.on('item-piles-tradeComplete', …)` (signature réelle à 4 args) ;
    écrit le journal sur chaque participant possédé par l'utilisateur courant.
- `scripts/integrations/item-piles/index.mjs` : appel `registerTradeHooks()` après `logDiagnostics()`.

### Hors périmètre

- Toute tentative de veto/guard d'échange ou de droit vault via hook — **impossible** (hooks absents
  ou `callAll`).
- Journal vault maison — **natif** (`logVaultActions` / `vaultLogType`).
- UI personnalisée (feuille vault, formulaire d'échange, chat) — déléguée à Item Piles.
- Containers (P5 — #117).

---

## 3. État antérieur

- Adaptateur #113 en place (`buildItemPilesConfig`, `item-piles-ready`, fonctions pures empilement/prix).
- Marchands #115 en place (`currency.mjs`, `merchant.mjs`).
- Aucun hook trade/vault dans le code Warbound.

---

## 4. Décisions d'architecture

- **Séparation `src/` / `scripts/`** : logique pure dans `src/`, hooks Foundry dans `scripts/`.
- **Trade** : Warbound **observe** (`item-piles-tradeComplete`). Journal stocké dans
  `flags.warbound.tradeHistory` de chaque participant **possédé par l'utilisateur courant**
  (permission Foundry) ; aucune écriture sur les acteurs non possédés.
- **Vault** : droits fins portés par `flags['item-piles'].vaultAccess` (contrat natif). Warbound
  fournit les helpers purs ; l'application reste à Item Piles (`getVaultAccess`).
- **Métadonnées** : préservation native ; helpers purs `snapshotItemMetadata`/`assertMetadataIntegrity`
  en filet de sécurité documentaire (non branchés faute de hook vault).
- **Namespace flags** : `flags.warbound.*` (convention Warbound/COF2 du dépôt — cf. importeur COF2).
- Aucune mutation d'acteur hors `setFlag` du journal (trade) : Item Piles applique les transactions.

---

## 5. Plan de travail

1. `src/integrations/item-piles/trade.mjs` — `buildTradeLogEntry`, `appendTradeLog`.
2. `src/integrations/item-piles/trade.test.mjs`.
3. `src/integrations/item-piles/vault.mjs` — `buildVaultAccessEntry`, `hasVaultRight` + wrappers,
   `snapshotItemMetadata`, `assertMetadataIntegrity`.
4. `src/integrations/item-piles/vault.test.mjs`.
5. `scripts/integrations/item-piles/hooks-trade.mjs` — `registerTradeHooks()`.
6. `scripts/integrations/item-piles/index.mjs` — appeler `registerTradeHooks()`.

---

## 6. Fichiers modifiés

| Fichier | Action |
|---|---|
| `src/integrations/item-piles/trade.mjs` | créé |
| `src/integrations/item-piles/trade.test.mjs` | créé |
| `src/integrations/item-piles/vault.mjs` | créé |
| `src/integrations/item-piles/vault.test.mjs` | créé |
| `scripts/integrations/item-piles/hooks-trade.mjs` | créé |
| `scripts/integrations/item-piles/index.mjs` | modifié (`registerTradeHooks`) |
| `docs/item-piles.md` | modifié (contrat trade/vault 3.3.4) |

---

## 7. Tests attendus

**`trade.test.mjs`** : `buildTradeLogEntry` (nominal, compteurs, champs absents, ts injecté, null si
`tradeId`/côté manquant) ; `appendTradeLog` (append, immutable, `undefined`, entrée nulle, FIFO 100).

**`vault.test.mjs`** : `buildVaultAccessEntry` (defaults, normalisation booléenne) ; `hasVaultRight`
+ wrappers ; `snapshotItemMetadata` (charges/quantité/effets, absences) ; `assertMetadataIntegrity`
(identique → true ; charges/quantité/effets modifiés → false).

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Hooks/hook names supposés faux | Vérifiés sur le bundle 3.3.4 (§0) — seuls `tradeStarted`/`tradeComplete` existent. |
| Écriture de flags sur acteur non possédé | `setFlag` conditionné à `actor.isOwner`, en try/catch. |
| Croissance du journal d'échange | `appendTradeLog` tronque à 100 entrées FIFO. |
| Forme du flag `vaultAccess` divergente | Alignée sur `getVaultAccess()` du bundle (l. 36426). |

---

## 9. Critères d'arrêt

- `pnpm test` : 0 échec.
- Recette live Foundry (#116), fiche `documentation/recette/item-piles/116-recette-f08-f10-f13.md` :
  - A15 échange accepté → transferts et soldes corrects ; entrée dans `flags.warbound.tradeHistory`.
  - A16/A17 refus/expiration → aucune mutation.
  - A20 double-clic → un seul échange (natif).
  - A21 acteur non possédé → action refusée (natif).
  - A22 sans MJ → pas d'exception Warbound.
  - Vault : droits fins appliqués via `vaultAccess` ; charges/effets préservés après dépôt/retrait ;
    journal vault natif alimenté.

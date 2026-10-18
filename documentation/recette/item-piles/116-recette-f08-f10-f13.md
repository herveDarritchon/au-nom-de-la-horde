# Recette manuelle — échanges PJ↔PJ et vaults partagés (P3 — #116)

**Issue** : [#116 — feat(item-piles): échanges PJ↔PJ et vaults partagés — F08 à F10, F13](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/116)
**Parent** : #111 · **Plan** : `documentation/plan/integrations/item-piles/116-echanges-pj-vaults-f08-f10-f13.md`
**Scénarios** : A15–A17, A20–A22 (cadrage `Warbound_Cadrage_Integration_Item_Piles_COF2.md` §9.2)
**Type** : **HITL** — validation manuelle dans Foundry live (non automatisable sans navigateur/MJ).

> Contexte injecté : environnement Foundry VTT **14.367**, COF2 **2.3.12**, Item Piles **3.3.4**, module `warbound-campaign-content` actif.

---

## 1. Objectif

Valider le comportement **natif** d'Item Piles 3.3.4 pour l'échange PJ↔PJ (double validation, sécurité,
idempotence, annulations) et le vault partagé (droits fins, préservation des métadonnées, journal),
conformément au cadrage §5 (Warbound **n'observe** l'échange et **configure** les droits vault —
sans réimplémenter la logique Item Piles).

Le volet **code** de #116 (helpers purs `trade.mjs`/`vault.mjs`, hook observateur
`item-piles-tradeComplete`, tests unitaires) est couvert par la PR associée ; cette fiche couvre le
volet **recette live**, qui reste à cocher par un MJ.

> **Contrat Item Piles 3.3.4 vérifié** : l'échange PJ↔PJ n'expose que `item-piles-tradeStarted` et
> `item-piles-tradeComplete` (émis en `Hooks.callAll` → **non annulable**) ; il n'existe **aucun**
> hook de veto. Les droits vault sont portés par le flag `flags['item-piles'].vaultAccess` (pas de
> hook vault).

---

## 2. Pré-requis

- Monde de test sauvegardé (ne pas utiliser le monde de production).
- Item Piles **3.3.4** et Warbound actifs ; message « système non reconnu » d'Item Piles **absent**.
- **Deux clients joueurs séparés** + un compte MJ (double validation A15–A16).
- Jeu de données §9.1 : deux personnages (dont un sans ressources), un **vault** configuré avec des
  droits fins par acteur, une arme `stackable=false` avec **charges** et **effets**, des pièces PO/PA/PC.

---

## 3. Scénarios

Légende statut : `[ ]` à tester · `[x]` OK · `[!]` échec · `[~]` non applicable (justifier).

### 3.1 Échange PJ↔PJ (F08–F10)

| Réf. | Action | Attendu impératif | Statut | Notes / preuve |
|---|---|---|---|---|
| A15 | Échange croisé entre deux PJ, accepté des deux côtés | Objets + pièces transférés **une seule fois** ; soldes exacts ; entrée dans `flags.warbound.tradeHistory` des deux acteurs | [ ] | |
| A16 | Un PJ refuse (ou abandonne) l'échange | **Aucune mutation** ; pas de gain par rejeu | [ ] | |
| A17 | Échange non abouti (expiration / déconnexion) | **Aucune mutation** ; pas de transaction partielle | [ ] | |
| A20 | Double-clic sur « Accepter » | Un seul échange appliqué (idempotence native `ongoingTrades`) | [ ] | |
| A21 | Un joueur tente d'échanger les biens d'un acteur non possédé | Action **refusée** ; aucune fuite de données ni mutation | [ ] | |
| A22 | Transaction nécessitant le MJ, en son absence | Erreur compréhensible ; **aucune exception Warbound** | [ ] | |

### 3.2 Vault partagé (F13)

| Réf. | Action | Attendu impératif | Statut | Notes / preuve |
|---|---|---|---|---|
| V01 | Dépôt d'une arme avec charges puis retrait | **Charges et effets identiques** avant/après ; aucune duplication | [ ] | |
| V02 | Droits fins via `flags['item-piles'].vaultAccess` | Acteur sans `deposit`/`withdraw` bloqué ; acteur autorisé passe | [ ] | |
| V03 | Placement / rotation / tri en grille | Mise en page conservée ; limites de place respectées | [ ] | |
| V04 | Journal vault (`logVaultActions` activé) | Opérations tracées par Item Piles (`vaultLogType`) | [ ] | |

### 3.3 Invariants transverses (obligation de couverture §9.2)

| Règle | PJ ↔ PJ | vault ↔ PJ |
|---|---|---|
| Quantité | [ ] | [ ] |
| Empilement | [ ] | [ ] |
| Permissions | [ ] | [ ] |
| Métadonnées (charges/effets) | [ ] | [ ] |

---

## 4. Critères d'acceptation (#116)

- [ ] A15–A17 réussis.
- [ ] A20–A22 réussis (concurrence, acteur non possédé, absence MJ).
- [ ] Charges et effets d'une arme préservés après dépôt et retrait en vault.
- [ ] Aucune mutation sur échange refusé ou expiré.
- [ ] Tests unitaires verts (`pnpm test`) — **couverts par la PR**.

---

## 5. Périmètre code livré (PR)

Sans logique Item Piles réimplémentée (cadrage §5) :

- `src/integrations/item-piles/trade.mjs` — `buildTradeLogEntry`, `appendTradeLog` (journal d'échange,
  FIFO 100) ; **observation** uniquement (pas de veto possible).
- `src/integrations/item-piles/vault.mjs` — `buildVaultAccessEntry`, `hasVaultRight` + wrappers de
  droits, `snapshotItemMetadata`/`assertMetadataIntegrity` (métadonnées) ; droits **data-driven**
  via le flag `vaultAccess`.
- `scripts/integrations/item-piles/hooks-trade.mjs` — `registerTradeHooks()` branché sur le hook réel
  `item-piles-tradeComplete` (signature `(instigator, leftTraderData, rightTraderData, tradeId)`),
  écrit le journal sur les participants **possédés** par l'utilisateur courant.
- `docs/item-piles.md` — contrat trade/vault 3.3.4 vérifié.

A15–A17/A20–A22 et V01–V04 dépendent du **runtime Item Piles** (UI, socket, grille) : ils ne peuvent
être prouvés que par recette live → statut **HITL** de cette fiche.

---

## 6. Journal de recette

| Date | Recetteur | Environnement | Résultat global | Écarts / issues |
|---|---|---|---|---|
| | | FVTT 14.367 · COF2 2.3.12 · Item Piles 3.3.4 | | |

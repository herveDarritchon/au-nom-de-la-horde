# Definition of Done — Intégration Item Piles COF2 (cadrage §11)

> Épic : #111 · Phase P6 (publication) : #118 · Module : `warbound-campaign-content` v1.1.0
> Versions : Foundry VTT 14.367 · COF2 2.3.12 · Item Piles 3.3.4

Légende : ✅ satisfait · ⏳ recette live HITL requise (non automatisable sans Foundry headless) · ⚠️ écart assumé documenté

| # | Critère §11 | Statut | Preuve |
|---|---|---|---|
| 1 | Item Piles reconnaît automatiquement `co2` quand Warbound est actif | ✅ | `scripts/integrations/item-piles/index.mjs` (`Hooks.once('item-piles-ready')` → `addSystemIntegration`) + `scripts/integrations/item-piles/index.test.mjs` |
| 2 | Aucune fonctionnalité Warbound régressée sans Item Piles | ✅ | Garde d'activation (no-op si Item Piles absent) ; `pnpm test` = **833 pass / 0 fail** |
| 3 | F01–F15 documentés (OK ou écart explicite) | ✅ ⚠️ | `documentation/item-piles-matrix-f01-f15.md` — écarts F14/F15 assumés |
| 4 | Cas critiques A01–A25 réussis (selon environnement) | ⏳ | Recettes `documentation/recette/item-piles/` (114 → A01–A08 ; 115 → A09–A14 ; 116 → A15–A17/A20–A22/V01–V04 ; 117 → A18–A19/A24–A25) |
| 5 | Aucune perte/duplication silencieuse (équipements, sacs, devises) | ✅ | `currency.test.mjs` (pas de double comptage) · `containers.test.mjs` (dédup native) · `items.test.mjs` |
| 6 | Transactions incorrectes refusées **sans maj partielle** | ✅ | `currency.test.mjs` (`canAfford`, `subtractCurrency`, `calculateChange` ; cas de référence 7 PA vs 8 PA refusé) · `containers.test.mjs` (`validateContainerTransfer`) |
| 7 | Permissions PJ/MJ et acteur lié/non lié validées | ✅ ⏳ | `vault.test.mjs` (lecteurs de droits `vaultAccess`, `hasRecipient`) ; recette live V01–V04 |
| 8 | Handlers via API/hooks **publics** d'Item Piles | ✅ | `docs/item-piles.md` — contrat vérifié bundle 3.3.4 ; seuls `item-piles-ready`, `item-piles-trade*`, API publique utilisés |
| 9 | Économie et arrondis documentés et cohérents avec les données | ✅ | `docs/item-piles.md` § *Convention monétaire* (1 PO = 10 PA = 100 PC, arrondi entier de PC) |
| 10 | Paramètres versionnés, personnalisations préservées/migrées | ✅ | `INTEGRATION_VERSION` (`config.mjs`) + `docs/item-piles.md` § *Politique de migration* |
| 11 | Guide install/dépannage/limites + matrice Foundry/COF2/Item Piles + tests reproductibles | ✅ | `docs/item-piles.md` (Guide MJ, Débogage, Limites) · `documentation/item-piles-matrix-f01-f15.md` · tests `src|scripts/integrations/item-piles/*.test.mjs` |
| 12 | Notes de version + retour arrière ; sauvegarde du monde préconisée | ✅ | `documentation/release-notes/item-piles-integration.md` · `docs/item-piles.md` § *Procédure de retour arrière et sauvegarde* |

## Statut de release

- **Automatisé** : critères 1, 2, 3, 5, 6, 8, 9, 10, 11, 12 → satisfaits (tests + docs).
- **HITL (recette live)** : critères 4 et 7 → à cocher lors de la session Foundry de validation avant release (fiches de recette fournies).
- **Écarts assumés** : compatibilité limitée à Item Piles 3.3.4 ; remap conteneur inter-acteur non réalisé ; archivage du prototype antérieur absent du dépôt — tous documentés, **aucun écart majeur non assumé** (critère §11.3 respecté).

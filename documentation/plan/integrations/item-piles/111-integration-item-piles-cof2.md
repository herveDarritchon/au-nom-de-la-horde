# Plan d'implémentation — feat(co2): intégration complète d'Item Piles via Warbound

**Issue** : [#111 — feat(co2): Intégration complète d'Item Piles via Warbound](https://github.com/herveDarritchon/au-nom-de-la-horde/issues/111)
**Cadrage** : `documentation/cadrage/Warbound_Cadrage_Integration_Item_Piles_COF2.md`
**Cible** : Foundry VTT 14.367 · COF2 2.3.12 · Item Piles 3.3.4

---

## 1. Objectif

Fournir dans Warbound le profil de compatibilité COF2 pour Item Piles 3.3.4 via `addSystemIntegration`, sans module compagnon, pour que `co2` soit automatiquement reconnu lorsque Warbound et Item Piles sont actifs. Couvrir F01–F15 et valider A01–A25.

---

## 2. Périmètre

### Inclus

- Adaptateur `scripts/integrations/item-piles/` chargé conditionnellement
- Enregistrement sur `item-piles-ready`, garde `game.system.id === "co2"`
- Configuration versionnée : filtres, quantités, monnaies, prix, empilement par objet
- Tests unitaires (logique pure) et intégration (hooks, dégradation sans Item Piles)
- Documentation MJ (FR) + matrice de fonctionnalités versionnée

### Hors périmètre

- Modification de COF2 (`co2`) ou d'Item Piles
- Stockage parallèle de monnaie/inventaire
- Fonctionnalités absentes d'Item Piles 3.3.4
- Intégration automatique avec modules calendriers autres que vérification conditionnelle

---

## 3. État existant

- Item Piles actif dans le monde de test → affiche « System Not Recognized »
- Prototype `warbound-item-piles-prototype.zip` existant — **non validé**, à auditer avant réutilisation
- Champs COF2 confirmés : `system.wealth.{gp,sp,cp}.value`, `system.quantity.current`, `system.price.{value,unit}`, `system.properties.stackable`, `system.charges.*`
- Champs `[À TESTER]` : flags d'empilement individuels Item Piles, signature exacte `ITEM_TRANSFORMER` et `ITEM_COST_TRANSFORMER` dans 3.3.4
- Décision monnaie ouverte : COF2 (1 PO = 10 PA = 100 PC) vs WoW — **bloquante avant marchands**

---

## 4. Décisions d'architecture

1. Adaptateur isolé dans `scripts/integrations/item-piles/` ; zéro import si Item Piles absent
2. Enregistrement unique sur `item-piles-ready` avec `await` + `try/catch`
3. Fonctions pures et testables sans Foundry pour monnaie, quantités, similarité
4. Empilement **par objet** via `system.properties.stackable` (pas par type `equipment`)
5. `container` COF2 exclu des transferts jusqu'à handler dédié validé (P5)
6. Item Piles déclarée dépendance **facultative** dans `module.json`

---

## 5. Plan de travail — sous-issues

| Phase | Issue | Livrable | Critère de sortie |
|---|---|---|---|
| P0 | #112 | Audit API 3.3.4, audit modèle COF2, décision monnaie | Aucun champ/signature critique non vérifié |
| P1 | #113 | Enregistrement `co2`, filtres, quantité, monnaie, logs | Message « non reconnu » disparu |
| P2 | #114 | Piles, charges, empilement, rencontres, coffres, partage | A01–A08, A20–A23 passants |
| P3 | #115 | Marchands, monnaie, rendu, services, prix avancés | A09–A14 passants |
| P4 | #116 | Échanges, droits, vault, inventaires partagés | A15–A17, A20–A22 passants |
| P5 | #117 | Handlers `container`, tables, options, UX | A18–A19, A25, F01–F15 passants |
| P6 | #118 | Docs FR, CI, matrice, release notes | Aucun critère critique échoué |

---

## 6. Fichiers à créer / modifier

| Fichier | Action |
|---|---|
| `scripts/integrations/item-piles/index.mjs` | Créer — chargement conditionnel + hook |
| `scripts/integrations/item-piles/config.mjs` | Créer — configuration versionnée |
| `scripts/integrations/item-piles/currency.mjs` | Créer — conversion/normalisation prix |
| `scripts/integrations/item-piles/items.mjs` | Créer — règles COF2, transformation |
| `scripts/integrations/item-piles/containers.mjs` | Créer — handlers COF2 (P5) |
| `scripts/integrations/item-piles/diagnostics.mjs` | Créer — validation démarrage + logs MJ |
| `scripts/warbound.mjs` | Modifier — import conditionnel de l'adaptateur |
| `module.json` | Modifier — déclarer Item Piles comme dépendance optionnelle |
| `tests/unit/item-piles/` | Créer — tests purs (monnaie, quantité, similarité) |
| `tests/integration/item-piles/` | Créer — hooks, dégradation, migrations config |
| `docs/item-piles.md` | Créer — guide MJ FR + matrice de fonctionnalités |

---

## 7. Tests attendus

- **Unitaires** : conversion devise, refus valeurs invalides, normalisation objets, similarité, bornage quantités, absence de mutation objets source
- **Intégration** : config acceptée et enregistrée une seule fois, dégradation sans Item Piles (zéro erreur), migrations de config
- **Recette Foundry** (manuelle) : scénarios A01–A25, deux navigateurs + deux rôles, drag & drop, marchands, échanges, vault, conteneurs

---

## 8. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Décision monnaie COF2 vs WoW non arbitrée | Arbitrage explicite en P0 avant tout travail sur P3 |
| Flag `canStack` individuel : signature 3.3.4 inconnue | Audit du code 3.3.4 en P0 (pas prototype) |
| `container.contents` = UUID compendium | Analyser instance peuplée avant tout handler — P5 uniquement |
| Migration `VERSION` écrase config MJ | Stratégie de migration + sauvegarde documentée en P1 |
| Prototype antérieur : signatures non éprouvées | Audit obligatoire avant réutilisation (P0) |

---

## 9. Critères d'arrêt (épic)

- [ ] Item Piles reconnaît automatiquement `co2` lorsque Warbound est actif
- [ ] Warbound seul : aucune régression ni erreur
- [ ] F01–F15 documentés (OK ou écart assumé et suivi)
- [ ] A01–A25 réussis
- [ ] Aucune perte/duplication silencieuse d'équipements ou monnaie
- [ ] Transactions incorrectes refusées sans état partiel
- [ ] Guide FR + matrice versionnée publiés dans le dépôt

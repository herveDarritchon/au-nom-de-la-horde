# Warbound — Cahier des charges de compatibilité avec Item Piles

**Statut :** cadrage de développement — à implémenter et recetter  
**Version du document :** 1.0 — 17 octobre 2026  
**Projet :** Warbound, module Foundry VTT pour le système *Chroniques Oubliées 2* (`co2`)  
**Cible observée :** Foundry VTT `14.367` · COF2 `2.3.12` · Item Piles `3.3.4`  
**Finalité :** prise en charge de l'ensemble des fonctionnalités applicables d'Item Piles **sans module compagnon supplémentaire**, en conservant Item Piles comme dépendance fonctionnelle facultative de Warbound.

> **Règle d'or.** Warbound ne réécrit ni l'interface ni le moteur économique d'Item Piles. Il fournit un adaptateur fiable et maintenable entre les documents et règles de COF2 et les API publiques d'Item Piles. « Toutes les fonctionnalités » signifie que chaque fonction disponible dans **la version cible d'Item Piles** est testée avec COF2, ou que son éventuelle impossibilité est démontrée, documentée et suivie ; ce n'est pas une promesse de compatibilité future automatique avec des API encore inconnues.

## 1. Contexte et justification

Depuis Item Piles 3.2.7, les configurations propres aux systèmes ne sont plus embarquées dans le module générique. L'intégration peut être fournie par le système lui-même ou par un module compagnon. Warbound doit prendre cette responsabilité pour COF2. L'approche correspond à celle du compagnon **Item Piles: D&D 5e** ; Shadowdark a intégré directement son support à partir de son système v4.0.5. Les deux précédents servent de **références de méthode**, pas de code à recopier sans adaptation.

Aujourd'hui, Item Piles est actif dans le monde de test, mais affiche **« System Not Recognized »** : la configuration `co2` n'est pas fournie. Une saisie manuelle dans *System Specific Settings* est possible, mais ne résout ni la diffusion automatique, ni la maintenance, ni les transactions complexes, ni les particularités des équipements COF2.

### Objectifs

1. Faire reconnaître et fonctionner automatiquement COF2 avec Item Piles dès que Warbound et Item Piles sont actifs.
2. Rendre **toutes les fonctions pertinentes du moteur Item Piles 3.3.4** utilisables par MJ et joueurs, avec les mêmes possibilités de configuration que dans les intégrations de référence.
3. Préserver les inventaires, les objets, les actions, les effets, les conteneurs, les quantités et les richesses natives de COF2.
4. Éviter toute création, perte ou duplication involontaire de biens pendant un transfert ou une transaction.
5. Conserver l'autonomie de Warbound quand Item Piles est absent, désactivé ou temporairement incompatible.
6. Fournir tests automatisés, recette Foundry, documentation et matrice de compatibilité versionnée.

### Hors périmètre

- Réécrire l'interface d'Item Piles pour lui donner une apparence WoW.
- Modifier le cœur de `co2`, le moteur Item Piles ou leur code distribué.
- Réinventer la monnaie, l'inventaire ou les objets COF2 dans un stockage parallèle.
- Ajouter des fonctionnalités **absentes** d'Item Piles 3.3.4 sans besoin et spécification distincts.

## 2. Sources et niveau de preuve

**Sources primaires externes :**

- Dépôt principal Item Piles : https://github.com/fantasycalendar/FoundryVTT-ItemPiles
- API (`addSystemIntegration`, transactions, coffres, marchands) : https://github.com/fantasycalendar/FoundryVTT-ItemPiles/blob/master/docs/api.md
- Template officiel : https://github.com/fantasycalendar/FoundryVTT-ItemPiles-System-Template/blob/master/module.js
- Paramétrage des systèmes : https://github.com/fantasycalendar/FoundryVTT-ItemPiles/blob/master/docs/configuring-item-piles.md
- Fonctionnement des marchands : https://github.com/fantasycalendar/FoundryVTT-ItemPiles/blob/master/docs/merchant.md
- Changelog du module : https://github.com/fantasycalendar/FoundryVTT-ItemPiles/blob/master/changelog.md
- Annonce de la séparation par système, Haxxer, 3 juin 2025 : https://github.com/fantasycalendar/FoundryVTT-ItemPiles/issues/731
- Exemple D&D 5e : https://github.com/fantasycalendar/FoundryVTT-ItemPilesDnD5e
- Exemple Shadowdark : https://github.com/Muttley/foundryvtt-shadowdark/releases
- Page de distribution officielle : https://foundryvtt.com/packages/item-piles

**Source locale du modèle COF2 :** diagnostic JavaScript fourni par le propriétaire du monde le 16 octobre 2026, extrait des documents Foundry via `toObject()`. Les chemins présents dans cette extraction sont **confirmés pour le monde et la version testés**. Le comportement des hooks et transactions n'est **pas** confirmé tant que la recette dans Foundry n'a pas eu lieu.

**Principe de traçabilité :** [CONFIRMÉ] = observé dans le diagnostic ou la documentation officielle ; [À TESTER] = hypothèse de fonctionnement de l'API dans la version cible ; [À DÉCIDER] = choix de design non arbitré ; [ÉCART] = différence connue qui nécessite un adaptateur.

## 3. Référence fonctionnelle : ce que l'intégration doit couvrir

> Les cases ci-dessous représentent la **cible de recette**, non des fonctionnalités déjà opérationnelles dans Warbound. La réalisation doit se baser sur Item Piles 3.3.4 et sa documentation ; les options dépendant d'autres modules ou d'une configuration de monde sont couvertes **lorsque la dépendance est présente**.

| ID | Domaine | Fonctions à couvrir et tester | Priorité |
|---|---|---|---|
| F01 | Piles au sol | Déposer depuis inventaire/compendium, créer pile et token, ajouter à une pile existante, ramasser tout ou partie, suppression/état de pile vide | Critique |
| F02 | Butin | Butin porté par un acteur `encounter`, pillage de créatures/NPC, transfert entre acteurs, partage du butin et de la monnaie | Critique |
| F03 | Quantités | Quantités fractionnées, fusion d'objets identiques, non-fusion des objets uniques, capacité `max`, suppression à zéro selon la règle COF2 | Critique |
| F04 | Coffres | Pile « conteneur », ouvrir/fermer/verrouiller/déverrouiller, images et sons d'état, accès et portée, restrictions de dépôt/retrait | Haute |
| F05 | Marchands | Créer un marchand, acheter/vendre, gérer stock fini/infini, affichage de disponibilité, articles cachés, interdits de vente et prix nuls | Critique |
| F06 | Prix avancés | Majorations/réductions par marchand, type ou acteur ; tarifs par article ; prix personnalisés d'achat/vente ; lots et quantité pour un prix ; services ; prix en objets ou attributs | Critique |
| F07 | Monnaies | PO/PA/PC, paiement multidevise, conversions, rendu de monnaie, solde acheteur/vendeur, pénurie de monnaie, monnaie secondaire si paramétrée | Critique |
| F08 | Échanges PJ | Donner à un autre PJ, demander/proposer un échange, double validation, refus/annulation, échange d'objets et de pièces | Critique |
| F09 | Vaults | Inventaire partagé en grille, dépôt/retrait, placement/rotation/tri, limites de place, objets d'extension, droits de consultation et dépôt/retrait | Haute |
| F10 | Journaux | Logs marchands et vaults, messages de chat des transactions, traces suffisantes pour reconstituer une opération | Haute |
| F11 | Automatisation | Remplissage via compendiums, dossiers, tables aléatoires et rafraîchissement de marchand ; intégrations optionnelles de calendrier si disponibles | Haute |
| F12 | Paramétrage | Configuration par pile/marchand/vault, filtres, catégories, colonnes des marchands, prix prédéfinis, styles de rareté, visibilité, permissions | Haute |
| F13 | Accès multijoueur | MJ/joueurs, acteurs possédés, tokens liés/non liés, absence de MJ connecté, fenêtre d'inspection, prévention des transactions concurrentes | Critique |
| F14 | Interopérabilité | API et hooks officiels, interactions glisser-déposer, outils de macros/rolltables, modules coexistants et compatibilité AppV2 Foundry 14 | Haute |
| F15 | Conteneurs COF2 | Préservation, déplacement, achat/vente et — après vérification du modèle — gestion cohérente du contenu des Items `container` natifs | Critique pour la parité annoncée |

**Point d'attention :** un coffre Item Piles (acteur/jeton avec interface de coffre) et un objet COF2 de type `container` sont **deux concepts différents**. Faire fonctionner le premier ne vaut pas compatibilité du second.

### Détails fonctionnels incontournables

**Piles, partage et coffres :** une potion doit pouvoir être déposée par un PJ, retrouvée par un autre et partagée sans perdre son action de soin ; un objet non empilable doit rester distinct ; verrou, état visuel, son et permissions doivent rester pilotés par Item Piles.

**Marchands :** un acteur `encounter` configuré en marchand doit vendre des équipements COF2 et recevoir les paiements exactement ; les achats échoués ne doivent laisser **aucune mutation partielle**. Les prix par joueur/type d'objet, services non livrés en inventaire, stocks infinis, articles cachés, prix alternatifs et logs doivent fonctionner sans logique marchande réimplémentée dans Warbound.

**Échanges :** un joueur ne doit jamais pouvoir transférer l'objet ou les pièces d'un personnage qu'il ne contrôle pas. Lors de refus, délai expiré, déconnexion ou insuffisance de biens, les deux inventaires doivent rester cohérents.

**Vaults :** les placements, droits fins (voir, déposer, retirer, organiser), historique et capacités doivent fonctionner avec les équipements COF2. Une arme avec charges et effets ne doit pas perdre ses métadonnées lorsqu'elle est déplacée dans une grille.

**Outils :** la fonction de peuplement par table aléatoire, les changements d'état du marchand et la recherche des objets doivent conserver leurs comportements natifs. Vérifier les libellés FR existants d'Item Piles avant d'ajouter des chaînes locales Warbound.

## 4. Modèle de données COF2 vérifié

### 4.1 Acteurs et richesses

| Sémantique | Modèle observé |
|---|---|
| Système | `game.system.id === "co2"` |
| Personnage | `Actor.type === "character"` |
| Rencontre / candidat pile et marchand | `Actor.type === "encounter"` |
| Pièces d'or | `system.wealth.gp.value` |
| Pièces d'argent | `system.wealth.sp.value` |
| Pièces de cuivre | `system.wealth.cp.value` |

`encounter` est **un candidat documenté** au type d'acteur par défaut : il supporte richesse et butin. [À TESTER] Création de pile, feuille, tokens liés/non liés, permissions, stockage et transferts sur `encounter`.

### 4.2 Équipements

| Sémantique | Modèle observé |
|---|---|
| Type d'objet physique standard | `Item.type === "equipment"` |
| Sous-types | `weapon`, `armor`, `consumable`, `misc`, `shield` |
| Quantité actuelle | `system.quantity.current` |
| Maximum / absence de maximum | `system.quantity.max` (`number` ou `null`) |
| Supprimer à zéro | `system.quantity.destroyIfEmpty` |
| Empilable | `system.properties.stackable` (`boolean`) |
| Équipé | `system.equipped` |
| Charges / munitions | `system.charges.current`, `system.charges.max`, `system.charges.destroyIfEmpty` |
| Prix et unité | `system.price.value`, `system.price.unit` |
| Identifiant sémantique | `system.slug` |
| Rareté | `system.rarity` |
| Actions et effets | `system.actions`, effets Foundry et données d'équipement associées |
| Conteneur d'équipement éventuel | `system.container` (observé à `null` dans les exemples) |

**Exemples observés :** arbalète de poing `stackable=false`, quantité 1, charges 20, prix 8 PA ; baie magique `stackable=true`, quantité 1, suppression à zéro activée ; grand bouclier `stackable=false`, quantité max 1. **Les charges ne représentent jamais une quantité d'objets**.

### 4.3 Objets natifs `container`

Le « Sac d'aventurier » observé est un Item de type `container`, avec `system.contents` contenant **une liste d'UUID de compendium**, `system.location`, `system.maxItems`, `system.price` et `system.weight`. Il n'a pas dans cet échantillon les champs `equipment.quantity.current` et `equipment.properties.stackable`.

[À VÉRIFIER] Nature exacte de `contents` après ajout à un personnage : modèles de référence ou inventaire réel, lien avec les équipements embarqués, comportement des quantités, actualisation des UUID et possibilité d'imbrication. **Ne jamais traiter les UUID listés comme des exemplaires effectivement possédés sans preuve**. Une mauvaise interprétation provoquerait un loot gratuit ou une duplication.

### 4.4 Types non physiques

Les types COF2 `profile`, `feature`, `capacity`, `attack`, `path` ne doivent pas pouvoir être achetés ou transférés comme biens matériels par défaut. Le type `container` ne peut pas être autorisé avant le développement de son traitement spécifique : **l'exclure en attendant signifie une incompatibilité identifiée, pas un périmètre terminé**.

## 5. Contrat technique Item Piles

La méthode d'intégration officielle est `game.itempiles.API.addSystemIntegration(config, version)` après le hook `item-piles-ready`, selon le template officiel. Utiliser `game.itempiles.API` et non l'ancienne API globale dépréciée. Enregistrer le listener suffisamment tôt dans le point d'entrée Warbound.

### 5.1 Configuration de base

| Paramètre Item Piles | Décision / action |
|---|---|
| `VERSION` | Version **propre** du contrat Warbound ↔ Item Piles. Indépendante de Warbound et incrémentée uniquement lorsque les réglages par défaut doivent être migrés. |
| `ACTOR_CLASS_TYPE` | `encounter` sous réserve de validation par pile/commerce/vault. |
| `ITEM_QUANTITY_ATTRIBUTE` | `system.quantity.current` pour `equipment`. |
| `ITEM_PRICE_ATTRIBUTE` | `system.price.value` (numérique), en conservant `system.price.unit` pour le transformateur. |
| `ITEM_COST_TRANSFORMER` | Convertir une paire `{value, unit}` en valeur dans la monnaie primaire ; contrôler la signature et le format attendus **dans 3.3.4**. |
| `CURRENCIES` | Trois attributs PO, PA, PC avec chemins précis et `exchangeRate` cohérents. |
| `ITEM_FILTERS` | Bloquer les objets non physiques ; autoriser `container` seulement après handler et tests complets. |
| `ITEM_SIMILARITIES` | Identifier les objets **réellement** fusionnables : pas simplement même nom/slug si charges, bonus, rareté, enchantements ou effets diffèrent. |
| `UNSTACKABLE_ITEM_TYPES` | **Ne pas mettre `equipment`** : cela empêcherait aussi l'empilement des consommables COF2. |
| `ITEM_TRANSFORMER` | Préserver/normaliser les métadonnées sur transfert ; traiter l'équipement et l'empilement seulement suivant les points où le transformateur est réellement invoqué. |
| `ITEM_TYPE_HANDLERS` | Évaluer pour les Items `container` natifs ; utiliser le contrat de 3.3.4, pas une imitation non documentée de D&D5e. |
| `ITEM_PREVIEW_PERMISSION_LEVEL` | Ajuster uniquement si les PJ ne peuvent pas voir la description autorisée des objets. |
| `PILE_DEFAULTS`, `TOKEN_FLAG_DEFAULTS`, `VAULT_STYLES`, `SYSTEM_HOOKS` | Configurer selon les besoins confirmés par la recette ; ne pas introduire des overrides inutiles. |

**Attention :** `ITEM_COST_TRANSFORMER` retourne un nombre dans la monnaie primaire, pas un objet de prix COF2. Son fonctionnement, notamment en achat/vente et avec prix personnalisés, doit être validé séparément. La documentation indique que **l'augmentation de `VERSION` peut remplacer les réglages personnalisés de l'utilisateur** : prévoir politique de migration, message et sauvegarde.

### 5.2 Empilement / différences individuelles

Les objets COF2 empilables et non empilables partagent `Item.type === "equipment"`. La solution attendue doit donc être **par objet** et appliquée à tous les chemins (drop, ramassage, achat, vente, échange, vault, macros/API). Il faut vérifier dans le code 3.3.4 les flags individuels reconnus, leur type exact et le moment où ils sont lus. Le prototype antérieur qui écrit `flags.item-piles.item.canStack` n'est **pas** considéré validé.

Critères : 

- `stackable=false` : deux arbalètes identiques restent deux objets, même lorsque `quantity.max=null`.
- `stackable=true` : deux piles strictement équivalentes fusionnent selon `quantity.max` et sans perte.
- Charges, bonus/effets personnalisés, rareté, provenance et paramètres particuliers ne sont pas effacés par une fusion.
- Une quantité négative, non entière, supérieure à la disponibilité ou interdite par le maximum est rejetée sans mutation.
- Les drapeaux de destruction à zéro suivent les règles COF2, sans supprimer prématurément un objet consommable/équipé.

### 5.3 Intégrité des documents transférés

- Préserver les actions, propriétés, rareté, effets, descriptions, consommations et charges.
- Éviter d'invoquer ou de transférer indûment des bonus actifs d'un personnage sur un autre.
- Décider et documenter le traitement de `system.equipped` après transfert (l'exemple D&D5e ne fait **pas** foi pour COF2).
- Conserver la référence à l'objet sans convertir arbitrairement des UUID de compendium en inventaire concret.
- Traiter les transferts d'objets uniques personnalisés sans fusion et sans destruction de données.

## 6. Monnaies, prix et règles d'arrondi

### 6.1 Convention économique

**[À DÉCIDER — bloquant avant livraison marchands]** : conserver la conversion du système COF2 (**1 PO = 10 PA = 100 PC**) ou adopter la conversion WoW (**1 PO = 100 PA = 10 000 PC**) pour Warbound. Tant qu'aucune décision n'est prise, **ne pas modifier les valeurs du système ni migrer les richesses existantes**. Les tests peuvent retenir temporairement les taux COF2, clairement indiqués comme hypothèse de recette.

### 6.2 Invariants financiers

- Utiliser idéalement des **unités entières de plus petite dénomination** pour la validation métier, et convertir seulement lors des échanges avec l'API qui exige la monnaie primaire numérique.
- Refuser unités inconnues, prix malformés, `NaN`, valeurs infinies, quantités non valides et soldes négatifs.
- Définir une politique explicite pour les fractions d'une plus petite pièce, rabais, majorations et arrondis.
- Vérifier le rendu de monnaie avec stock de monnaie limité du marchand ; le total de monnaie chez les participants doit être conservé, sauf mécanisme de vente/achat explicitement défini.
- Vérifier prix zéro, prix personnalisés, coûts multiples en items/attributs et monnaie secondaire.
- Test de référence : personnage à **7 PA**, article à **8 PA**, stock vendeur 1 → **achat refusé, aucune modification**.
- Régression prioritaire : Item Piles 3.3.3 a corrigé un défaut où la monnaie utilisée pour le rendu n'était pas soustraite au marchand. Tester expressément cette situation en 3.3.4.

## 7. Architecture logicielle attendue dans Warbound

**Implantation indicative à adapter après audit du dépôt réel :**

```text
warbound/
  module.json
  scripts/
    integrations/
      item-piles/
        index.mjs                # chargement conditionnel et hook
        config.mjs               # configuration versionnée
        currency.mjs             # conversion / normalisation de prix
        items.mjs                # règles COF2 et transformation d'items
        containers.mjs           # handlers COF2, si nécessaires
        diagnostics.mjs          # validation de démarrage et diagnostics MJ
  tests/
    unit/item-piles/
    integration/item-piles/
  docs/
    item-piles.md
```

**Contraintes d'architecture :**

1. Adapter isolé, aucune dépendance chargée par Warbound lorsque `item-piles` est désactivé ; pas de monkey-patch de `co2` ni d'Item Piles tant qu'une impossibilité de l'API publique n'a pas été documentée.
2. Enregistrement unique sur `item-piles-ready`, avec garde sur `game.system.id`, activation du module et présence de l'API.
3. Traiter `addSystemIntegration()` comme opération potentiellement asynchrone (`await`, `try/catch`, logs d'échec significatifs).
4. Éviter les réenregistrements multiples et les changements de configuration au chargement qui écrasent les préférences du MJ.
5. Séparer configuration, accès aux données du système, conversion financière et handlers.
6. Exposer des fonctions pures, testables sans Foundry, pour les règles d'unité monétaire, de quantité et de similarité.
7. Ne pas créer de nouvelle dépendance d'installation en dehors d'Item Piles et de ses dépendances déjà déclarées (`socketlib`, `lib-wrapper`).
8. Considérer la prise en charge d'Item Piles comme **facultative** pour Warbound ; ne pas déclarer une dépendance `requires` qui obligerait tous les utilisateurs Warbound à installer Item Piles, sauf arbitrage explicite contraire.

**Au lancement :** Warbound seul → pas d'erreur ; Item Piles présent → configuration `co2` reconnue ; version de COF2 hors matrice → avertissement contrôlé, pas de mutation cachée.

## 8. Audit préalable obligatoire du prototype et de l'API réelle

Le prototype `warbound-item-piles-prototype.zip` produit auparavant constitue **une preuve de concept non validée dans Foundry**, pas une référence à intégrer telle quelle. Avant de le réutiliser, vérifier :

- Nom, emplacement, type (`boolean`, `string`, etc.) et ordre de lecture du flag d'empilement individuel Item Piles 3.3.4 ; couverture des chemins de transfert.
- Signature effective de `ITEM_TRANSFORMER`, forme de son argument et invocation avant/après comparaison des piles.
- Signature effective de `ITEM_COST_TRANSFORMER` lors des achats, ventes et prix personnalisés.
- Acceptation et validation de tous les paramètres proposés, notamment les clés facultatives.
- Cas des objets `container` qui ne possèdent pas `system.quantity.current` ; comportement des handlers.
- Problèmes d'asynchronisme (`await` de l'enregistrement, absence de double hook) et erreurs visibles pour le MJ.

**Issue de recherche à créer si nécessaire :** « contrat d'extension d'Item Piles insuffisant pour respecter l'empilement par objet COF2 ». Dans ce cas, produire un cas reproductible minimal sur 3.3.4 ; choisir un contournement encapsulé ou proposer un changement upstream, plutôt que réécrire silencieusement le moteur.

## 9. Stratégie de recette et cas d'acceptation

### 9.1 Jeu de données de recette

Créer dans un monde de test sauvegardé : deux personnages dont un sans ressources, une rencontre avec butin, un marchand avec stock et monnaies limités, un coffre Item Piles, un vault, une arbalète `stackable=false` avec charges, deux exemplaires d'armes identiques avec effets différents, une pile de 8 potions `stackable=true`, un grand bouclier, un consommable à quantité maximale, un `container` COF2 rempli selon les mécanismes natifs et un article gratuit/service. Utiliser un compte MJ et **deux clients joueurs séparés**.

### 9.2 Scénarios Given / When / Then

| Réf. | Situation initiale / action | Attendu impératif |
|---|---|---|
| A01 | Drop d'une potion par PJ sur une scène, puis ramassage | Pile créée, bon acteur, quantité et action conservées |
| A02 | Transfert de 3 sur 8 potions | Source = 5, destination = 3 ; aucune duplication |
| A03 | Drop et récupération de deux arbalètes | Deux instances distinctes et charges préservées |
| A04 | Deux objets même slug, effets/charges différents | Aucune fusion destructrice |
| A05 | Quantité > stock ou > max | Refus et aucune mutation |
| A06 | Déplacement/ramassage d'un objet équipé | Politique d'équipement conforme, effets non dupliqués |
| A07 | Ouverture/fermeture/verrou d'un coffre | UI, images/sons, permissions et impossibilité d'accès non autorisé |
| A08 | Butin d'une rencontre partagé entre PJ | Total objets + monnaie invariant ; répartition correcte |
| A09 | Achat 8 PA avec 7 PA | Refus ; inventaires/monnaies inchangés |
| A10 | Achat 8 PA avec 1 PO | 8 PA payés, rendu 2 PA (selon convention COF2 et disponibilité du rendu), soldes exacts |
| A11 | Rendu de monnaie vendeur à ressources limitées | Aucune pièce créée ; opération valide ou refusée selon les règles Item Piles |
| A12 | Achat de plusieurs unités, rabais, marge, coût spécial | Prix et stocks exacts ; pas d'arrondi abusif |
| A13 | Achat d'un service | Paiement correct sans création intempestive d'un Item chez l'acheteur |
| A14 | Vente à marchand en fonds finis puis fonds infinis | Débits/crédits cohérents avec mode marchand |
| A15 | Échange croisé de deux PJ, acceptation | Inventaires et monnaies mis à jour une seule fois |
| A16 | Échange refusé ou abandonné | Aucune mutation ; pas de gain par rejeu/double clic |
| A17 | Dépôt/retrait dans vault, droits distincts | Grille, droits, logs et charges corrects |
| A18 | Stock généré via dossier/table/compendium | Items filtrés, quantités correctes, absence de traits/capacités |
| A19 | Conteneur COF2 avec contenu, puis transfert/vente | Conservation exacte des références et des biens réels ; ni duplications ni pertes |
| A20 | Deux clients ramassent simultanément le même objet | Une seule opération aboutit, stock jamais négatif |
| A21 | Client joueur tente action sur acteur non possédé | Action refusée sans fuite de données ou mutation |
| A22 | Absence de MJ pendant une transaction le nécessitant | Erreur compréhensible et aucune transaction partielle |
| A23 | Warbound seul, Item Piles désactivé | Pas d'exception, pas de fonctionnalité Warbound cassée |
| A24 | Redémarrage et update d'une configuration personnalisée | Réglages conservés ou migration annoncée et contrôlée |
| A25 | Réouverture fiche objet et chat après transfert | Descriptions, actions, effets, prix, rares et autorisations cohérents |

**Obligation de couverture** : tester la **même règle fondamentale** (quantité, empilement, prix, permissions) par les différentes voies qui la sollicitent : pile → PJ, PJ → pile, marchand ↔ PJ, PJ ↔ PJ, vault ↔ PJ, appels API et tables aléatoires lorsqu'applicables.

### 9.3 Automatisation

- Tests unitaires : conversion de chaque devise, refus des valeurs invalides, normalisation d'objets, similarité, bornage des quantités, absence de mutation des objets d'origine.
- Tests d'intégration/mocks : configuration acceptée et enregistrée une seule fois, hooks init, dégradation gracieuse sans Item Piles, migrations de config.
- Recette end-to-end Foundry : plusieurs navigateurs et rôles, drag & drop, actions par menu, marchands, échanges, vault, conteneurs.
- Tests de conservation : avant/après, total de la propriété des biens par UUID/identité, total des unités monétaires, journal de transactions.
- Tests de régression : 3.3.4 et la prochaine version de patch choisie explicitement ; COF2 2.3.12 et mises à jour suivantes après revalidation.

## 10. Phases de réalisation (toutes incluses dans l'objectif final)

| Phase | Livrable vérifiable | Critère de sortie |
|---|---|---|
| P0 — Audit & contrat | Audit code Item Piles 3.3.4, audit modèle COF2, décisions monnaie/conteneurs, résultats de probes | Aucun champ/signature critique non vérifié |
| P1 — Adaptateur | Enregistrement de `co2`, filtres, quantité, monnaie, prix, options, logs de diagnostic | Message « non reconnu » disparu ; réglages cohérents, Warbound seul fonctionne |
| P2 — Butin & coffres | Piles, consommables, charges, empilement, rencontres, coffre avec états et partage | A01–A08, A20–A23 passants |
| P3 — Économie | Marchands, monnaie, rendu, services, prix avancés, stock, logs | A09–A14 et cas particuliers passants |
| P4 — Social & vaults | Échanges, droits, grille, logs et inventaires partagés | A15–A17, A20–A22 passants |
| P5 — Conteneurs & options | Handlers `container` COF2, tables, catégories, calendriers optionnels, UX | A18–A19, A25 et matrice F01–F15 passants |
| P6 — Publication | Documentation FR, README, compatibilité déclarée, tests CI, release notes | Aucun critère critique échoué ; aucun écart de parité non assumé |

**Pas de clôture de la demande « compatibilité complète » après P1 ou P2**. La livraison peut être progressive via PRs, mais l'objectif final n'est atteint qu'une fois toute la matrice validée.

## 11. Conditions de livraison / Definition of Done

- [ ] Item Piles reconnaît automatiquement `co2` lorsque Warbound est actif.
- [ ] Aucune fonctionnalité Warbound régressée sans Item Piles.
- [ ] F01–F15 documentés avec statut **OK**, ou écart explicite validé et suivi (pas de revendication « complète » en présence d'un écart majeur).
- [ ] Tous les cas critiques A01–A25 pertinents à l'environnement sont réussis.
- [ ] Aucune perte ni duplication silencieuse d'équipements, contenu de sacs ou devises.
- [ ] Les transactions incorrectes sont refusées **sans état partiellement mis à jour**.
- [ ] Les permissions PJ/MJ et acteur lié/non lié ont été validées.
- [ ] Les handlers utilisent prioritairement les API et hooks publics d'Item Piles.
- [ ] L'économie et les arrondis sont documentés (COF2 ou WoW) et cohérents avec les données sauvegardées.
- [ ] Les paramètres d'intégration sont versionnés, les personnalisations préservées ou migrées explicitement.
- [ ] Guide d'installation, dépannage, limites connues, matrice Foundry/COF2/Item Piles et tests reproductibles inclus dans le dépôt Warbound.
- [ ] Notes de version et procédure de retour arrière disponibles ; sauvegarde du monde préconisée.

## 12. Risques et arbitrages ouverts

| Risque ou décision | Impact | Action avant release |
|---|---|---|
| Convention des monnaies COF2 versus WoW | Impacte **tous** les prix et soldes | Arbitrage explicite puis tests d'invariants |
| `canStack` individuel et ordre du transformateur | Duplication, fusion inappropriée | Lecture du code 3.3.4 + probes sur tous les chemins |
| `container.contents` stocke des UUID de compendium | Multiplication accidentelle du butin | Analyser une instance peuplée et les opérations natives COF2 |
| `encounter` utilisé pour tous les rôles | UI/permissions possibles surprises | Validation avec pile, coffre, marchand et vault |
| Migration de configuration Item Piles | Écrasement des personnalisations MJ | Stratégie de VERSION, sauvegarde et test de migration |
| Absence de MJ / socketlib | Transactions inaccessibles | Dégradation explicite, zéro écriture partielle |
| Prix et effets particuliers | Prix faux, bonus transférés par erreur | Tests de prix et de préservation des données |
| Code prototype antérieur | False assurance ; signatures non éprouvées | Audit et éventuelle réécriture ciblée avant PR |
| Évolutions Foundry/COF2/Item Piles | Régressions après upgrade | Matrice de versions, tests de non-régression et maintien évolutif |

## 13. Livrables attendus dans le dépôt GitHub Warbound

1. **Adaptateur de production** organisé et documenté, enregistré uniquement lorsque les conditions sont réunies.
2. **Tests unitaires et tests d'intégration**, avec cas d'erreur et assertions de conservation.
3. **Documentation utilisateur MJ (FR)** : activation, configuration, utilisations des piles/coffres/marchands/échanges/vaults, débogage.
4. **Documentation technique** : version cible des API, chemins COF2, règles des monnaies, objets empilables, conteneurs, hooks, migrations.
5. **Matrice de fonctionnalités et résultats de recette**, associée à des versions exactes.
6. **Une ou plusieurs Pull Requests ciblées**, avec checklist et captures/logs de validation Foundry.

### Formulation de l'issue mère GitHub suggérée

**Titre :** `feat(co2): Intégration complète d'Item Piles via Warbound (loot, merchants, trading, vaults, containers)`

**Résumé :** « Fournir dans Warbound le profil de compatibilité COF2 pour Item Piles via son API publique, sans module compagnon, et obtenir la parité fonctionnelle sur la version cible en respectant la structure native des objets, quantités, charges, richesses et conteneurs COF2. Découper en sous-issues pour le contrat technique, le loot, les marchands, les échanges, les vaults, les conteneurs et la recette. Ne fermer l'issue mère qu'après validation de la matrice fonctionnelle et des invariants de transaction. »

---

**Note de méthode finale.** Les champs du diagnostic local sont confirmés ; la conformité du **code** aux callbacks, structures de flags et scénarios complets d'Item Piles **n'est pas encore démontrée**. Les travaux commencent donc par une validation des interfaces réelles de la version `3.3.4`, et non par un copier-coller du prototype précédent.

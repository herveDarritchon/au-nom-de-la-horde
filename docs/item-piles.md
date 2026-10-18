# Item Piles — Documentation d'intégration COF2

> Module : `warbound-campaign-content`  
> Système cible : COF2 2.3.12  
> Item Piles : 3.3.4

---

## Audit P0 — Contrat d'interface Item Piles 3.3.4

> Réalisé le 16–18/10/2026. Fermé par issue #112.  
> Source de vérité : bundle `item-piles/dist/item-piles.js` (3.3.4) + `systems/co2/system.json` (2.3.12).

### Statut global

Tous les points critiques sont résolus. Aucun [À TESTER] bloquant ne subsiste.

---

### Champs et chemins COF2 vérifiés

| Chemin | Rôle | Statut | Référence code |
|---|---|---|---|
| `system.properties.stackable` | flag empilabilité par objet | **CONFIRMÉ** | `items.mjs:31` |
| `system.quantity.current` | quantité portée | **CONFIRMÉ** | `config.mjs:41` |
| `system.price.value` | valeur du prix | **CONFIRMÉ** | `config.mjs:42` |
| `system.price.unit` | unité de prix (`"po"/"pa"/"pc"`) | **CONFIRMÉ** | `currency.mjs:15` |
| `system.wealth.gp.value` | richesse PO | **CONFIRMÉ** | `config.mjs:20` |
| `system.wealth.sp.value` | richesse PA | **CONFIRMÉ** | `config.mjs:21` |
| `system.wealth.cp.value` | richesse PC | **CONFIRMÉ** | `config.mjs:22` |
| `system.contents` | UUIDs des objets d'un `container` | **CONFIRMÉ** | `container.mjs` (COF2 2.3.12) |

---

### Signatures Item Piles 3.3.4 vérifiées

#### `ACTOR_CLASS_TYPE`

**Statut : CONFIRMÉ — `'encounter'`**

`addSystemIntegration` attend une `string` ; Item Piles la passe comme `type` à la création d'acteurs (l. 84733, 84776). COF2 2.3.12 définit exactement deux types d'acteurs : `character` et `encounter` (`systems/co2/system.json`, champ `documentTypes.Actor`). `encounter` est le type correct pour tous les acteurs pile, marchand, vault et conteneur créés par Item Piles dans COF2.

#### `ITEM_TRANSFORMER`

**Statut : CONFIRMÉ — `async (itemData) => object`**

- Validation `addSystemIntegration` : `typeof transformer({}) === "object"` — une `Promise` est un objet, la validation passe (throw l. 97680 sinon).
- Utilisation runtime : `item = await SYSTEMS.DATA.ITEM_TRANSFORMER(item)` (l. 35160, 35175, 41735, 84814) — Item Piles fait toujours un `await`, la version `async` est correcte.
- **Moment d'invocation — AVANT la comparaison des piles.** Dans le chemin de transfert `transferItems` (l. 41734), le transformateur s'exécute sur `itemData` **avant** `findSimilarItem` (l. 41750) et `canItemStack` (l. 41752). Le flag `canStack` posé par le transformateur est donc présent sur l'objet entrant au moment de la décision d'empilement. Idem dans `checkItemType` (l. 35159/35174) et `dropItemOn` (l. 84813).
- Notre implémentation pose le flag `flags['item-piles'].item.canStack` selon `system.properties.stackable` (`applyStackingFlag`, `items.mjs:74`).

#### `ITEM_COST_TRANSFORMER`

**Statut : CONFIRMÉ — `(item, currencies, priceAttribute) => number`**

- Signature exacte : `ITEM_COST_TRANSFORMER(item, defaultCurrencies, SYSTEMS.DATA.ITEM_PRICE_ATTRIBUTE)` (l. 35641).
- Appelé **synchrone** (pas de `await` dans Item Piles) — notre implémentation retourne directement un `number`.
- Retourne `false` si prix introuvable (l. 35643) ; notre implémentation retourne `0` sur données invalides, ce qui est équivalent (`Math.max(0, 0) === 0`).
- **Site d'appel** : `getCostOfItem(item, defaultCurrencies)` (l. 35634) est le seul point d'entrée du transformateur. `getCostOfItem` est appelé par `getPricesForItem` (l. 35775), qui alimente **achat, vente et prix personnalisés** (modificateurs `buyPriceModifier`/`sellPriceModifier`, `prices`/`sellPrices`/`overheadCost`). Le transformateur fixe donc le **coût de base** de l'objet, avant application des modificateurs marchands.

#### `addSystemIntegration` — paramètres validés

| Paramètre | Type contractuel | Obligatoire | Validé dans notre config |
|---|---|---|---|
| `VERSION` | `string` | Oui | `'1'` ✓ |
| `ACTOR_CLASS_TYPE` | `string` | Oui | `'encounter'` ✓ |
| `ITEM_QUANTITY_ATTRIBUTE` | `string` | Oui | `'system.quantity.current'` ✓ |
| `ITEM_PRICE_ATTRIBUTE` | `string` | Oui | `'system.price.value'` ✓ |
| `ITEM_FILTERS` | `Array<{path: string, filters: string}>` | Oui | filtre `type` CSV ✓ |
| `ITEM_SIMILARITIES` | `Array<string>` | Oui | 4 chemins ✓ |
| `CURRENCIES` | `Array<{primary: boolean, name: string, abbreviation: string, exchangeRate: number, data: {path: string}}>` | Oui | PO/PA/PC ✓ |
| `PILE_DEFAULTS` | `object` (clés de `CONSTANTS.PILE_DEFAULTS` uniquement) | Oui | `{}` ✓ |
| `ITEM_TRANSFORMER` | `function` (async accepté) | Non | `applyStackingFlag` ✓ |
| `ITEM_COST_TRANSFORMER` | `function` | Non | `toPrimaryAmount` ✓ |
| `UNSTACKABLE_ITEM_TYPES` | `Array<string>` | Non | `[]` ✓ |

#### Enregistrement asynchrone

**Statut : CONFIRMÉ**

`addSystemIntegration` est synchrone (pas de `async` sur la déclaration, l. 97637). Notre `await api.addSystemIntegration(...)` est sans effet négatif — awaiter une valeur non-Promise retourne la valeur directement. L'enregistrement sur `Hooks.once('item-piles-ready')` garantit un appel unique par chargement de page.

---

### Flag d'empilement individuel — `flags.item-piles.item.canStack`

**Statut : CONFIRMÉ**

Contrat exact du flag (bundle 3.3.4) :

| Élément | Valeur vérifiée |
|---|---|
| Chemin | `flags.item-piles.item.canStack` (`CONSTANTS.FLAGS.ITEM = "flags.item-piles.item"`) |
| Type | `string` — **pas** un booléen |
| Valeurs | `"default"` \| `"yes"` \| `"no"` |
| Défaut | `"default"` (`CONSTANTS.ITEM_DEFAULTS.canStack`, l. 81) |
| Lecture | `canItemStack(item, targetActor)` (l. 34790) : `{ default, yes, no }[itemFlagData?.canStack ?? "default"]` (l. 34805-34809) |

La décision finale combine le flag objet et le réglage acteur (`actorFlagData.canStackItems`, valeurs `default`/`yes`/`no`/`always*`, l. 34798-34808) ; les devises empilent toujours (l. 34797) et les objets non stackables ne fusionnent jamais (l. 34801).

**Moments de lecture — tous les chemins de transfert** appellent `canItemStack` :

| Chemin | Référence |
|---|---|
| Transfert vers/depuis un acteur (drop, pickup, achat, vente, trade) | l. 41746, 41752, 41761, 41791, 41872, 41959 |
| Rendu / item store / marchand | l. 42278, 42314, 44914, 70335, 70545 |
| Vault (fusion) | l. 36367 |
| Drop sur scène (`dropItemOn`) | l. 85228, 85282, 85350 |
| Vault UI (rendu réactif) | l. 37401, 37498 |

**Conséquence pour notre design** : le flag étant lu à chaque transfert, `applyStackingFlag` doit être posé sur l'objet **à chaque entrée** (c'est le rôle de `ITEM_TRANSFORMER`, exécuté avant comparaison). Un booléen au lieu d'une chaîne, ou un chemin erroné, ferait retomber silencieusement sur `"default"`.

---

### `ITEM_TYPE_HANDLERS` — contrat et objets sans quantité

**Statut : CONFIRMÉ**

`ITEM_TYPE_HANDLERS` est un objet `{ [itemType]: { [handler]: Function } }`, avec `itemType = "GLOBAL"` par défaut. Résolution par `getItemTypeHandler(handler, itemType)` / `hasItemTypeHandler(handler, itemType)` (l. 34574-34578). Handlers reconnus (`CONSTANTS.ITEM_TYPE_METHODS`, l. 36-44) :

| Handler | Rôle |
|---|---|
| `hasCurrency` | le type porte de la monnaie |
| `contents` | le type détient d'autres objets |
| `transfer` | autorise/adapte le transfert d'un objet de ce type |
| `isContained` | l'objet est-il contenu dans un autre |
| `isContainedPath` | chemin vers le conteneur |
| `containerIdGenerator` / `containerIdRetriever` | id de conteneur |
| `containerTransformer` | transformation à l'insertion |

**Comportement sans handler déclaré** : `getItemTypeHandler` retourne `undefined` → Item Piles retombe sur sa logique générique. Pour `container` (aucun handler générique livré, pas de `system.quantity.current`), cela signifiait que la quantité n'était pas interprétée : d'où l'exclusion historique. Un handler `container` complet via `ITEM_TYPE_HANDLERS.container` (mécanisme officiel) est désormais **livré** en P5 — #117.

### Flags marchands et prix — contrat 3.3.4

**Statut : CONFIRMÉ** (source : bundle 3.3.4)

Item Piles pilote nativement marchands, prix et stock ; le cadrage §5 impose de **ne pas réimplémenter** cette logique dans Warbound. Flags lus par Item Piles sous `flags.item-piles.item` :

| Flag | Type | Rôle | Lecture (bundle) |
|---|---|---|---|
| `notForSale` | `boolean` | objet non proposé à la vente | `ITEM_DEFAULTS.notForSale:false` ; posé à `true` quand quantité 0 (l. 41767/41772) |
| `cantBeSoldToMerchants` | `boolean` | objet non revendable à un marchand | l. 35724 |
| `hidden` | `boolean` | masqué dans l'inventaire marchand | l. 44774 |
| `isService` | `boolean` | service : paiement sans livraison d'Item | l. 58085 |
| `infiniteQuantity` | `string` `"default"`/`"yes"`/`"no"` | stock infini, tri-état (résolu avec la valeur du marchand) | l. 85716-85719 |
| `displayQuantity` | `string`/`boolean` | affichage de la disponibilité (`always`, …) | l. 58009-58020 |
| `buyPriceModifier` / `sellPriceModifier` | `number` | facteurs achat / vente | l. 64-65, 35433-35441 |

Points d'extension **réels** pour les prix :

- `ITEM_COST_TRANSFORMER` (l. 35641) — coût de base en monnaie primaire (déjà utilisé par COF2).
- `PRICE_MODIFIER_TRANSFORMER` (l. 35444) — reçoit `{buyPriceModifier, sellPriceModifier, merchant, item, actor, actorPriceModifiers}` et retourne `{buyPriceModifier, sellPriceModifier}` ; appelé après les modificateurs Item Piles par type d'objet et par acteur. **Non utilisé** par Warbound : aucune règle de prix COF2 au-delà des flags Item Piles.

Règles métier COF2 exposées en fonctions pures (`src/integrations/item-piles/merchant.mjs`) : `isSaleAllowed` (`notForSale`), `canSellToMerchant` (`cantBeSoldToMerchants`), `isItemHidden` (`hidden`), `isService` (`isService`), `isInfiniteQuantity` (tri-état `default`/`yes`/`no`), `applyMerchantMarkup` (politique d'arrondi §6.2). Ces fonctions **ne sont pas branchées** sur un hook : Item Piles reste seul maître du runtime marchand.

**Ne pas confondre** : il n'existe **aucun** flag Item Piles nommé `doNotSell`.

---

### Décisions d'architecture

#### Convention monétaire

**DÉCIDÉ : COF2 — 1 PO = 10 PA = 100 PC**

Alternatives examinées :
- **COF2 natif (retenu)** : 1 PO = 10 PA = 100 PC. Cohérent avec les règles du jeu et les richesses déjà enregistrées dans le monde. Aucune migration de données nécessaire.
- **WoW** : 1 PO = 100 PA = 10 000 PC. Incompatible avec les richesses COF2 existantes, nécessiterait une migration bloquante avant P3 marchands.

COF2 2.3.12 ne définit pas de taux de change (`EQUIPMENT_CURRENCIES` ne porte que les labels i18n). Le taux est une décision de conception de Warbound ; la convention COF2 est retenue.

Implémentation : `src/integrations/item-piles/currency.mjs` — `EXCHANGE_RATES = { gp: 1, sp: 0.1, cp: 0.01 }`.

**Invariants monétaires (cadrage §6.2)** — fonctions pures dans `currency.mjs`, testées (pas branchées sur un hook : Item Piles applique le paiement, ces fonctions servent de spécification exécutable) :
- `canAfford(wallet, cost)` / `subtractCurrency(wallet, cost)` : validation et soustraction en **plus petite dénomination entière** (PC). Test de référence : 7 PA ne peut pas payer 8 PA ; 1 PO peut payer 8 PA.
- `calculateChange(paid, price)` : rendu exact, `null` si insuffisant. Test de référence : 1 PO pour 8 PA → rendu 2 PA.
- Régression Item Piles 3.3.3 (le rendu n'était pas déduit du marchand) : vérifiée absente en 3.3.4 ; couverte par un test unitaire modélisant l'invariant (rendu déduit du portefeuille marchand).
- Politique d'arrondi : aucune fraction de denier ; tout prix/modificateur est arrondi à l'entier de PC (`applyMerchantMarkup`, §6.2).

#### Traitement de `container`

**IMPLÉMENTÉ : handler `ITEM_TYPE_HANDLERS.container` (P5 — #117)**

`container` COF2 n'a pas de `system.quantity.current` (`QUANTITY_BEARING_TYPES = ['equipment']`, `items.mjs:8`).

Nature de `contents` — **CONFIRMÉ** depuis le modèle COF2 2.3.12 (`module/models/container.mjs`) :
- `contents: ArrayField(DocumentUUIDField({ type: "Item" }))` — liste d'**UUIDs d'Items**, pas d'objets embarqués.
- `contentsCount` résout chaque UUID via `fromUuidSync` et somme `item.system?.quantity?.current ?? 1` (un UUID non résolu compte pour 1).
- `getContents()` résout via `fromUuidSync` si le contenant est embarqué sur un acteur, sinon `fromUuid` (monde/compendium, asynchrone).
- Champ **inverse** `system.container` sur l'item contenu (renseigné par `addContent`/`removeContent`, `documents/item.mjs:291-373`).

Conséquence : le contenu est une **référence indirecte** vers des Items qui vivent sur l'acteur (via `system.container`) ou dans un compendium — une gestion naïve (compter `contents.length`) sous-évaluerait ou dupliquerait l'inventaire.

**Handler livré** (`scripts/integrations/item-piles/config.mjs`, signatures vérifiées bundle 3.3.4) :
- `ITEM_TYPE_HANDLERS.container.contents({ item }) → Item[]` (appelé l.35005) : résout les UUIDs via
  `fromUuidSync` (identique à `contentsCount`/`getContents()` pour un conteneur embarqué).
- `ITEM_TYPE_HANDLERS.container.transfer({ item, items })` (appelé l.83990 et l.36035 en `raw:true`) :
  pousse les Items contenus dans le transfert → conteneur **et** contenu transférés/vendus ensemble,
  dédup native Item Piles (l.83995).
- `container` est donc **retiré** de `EXCLUDED_TYPES` (`items.mjs`) et de `ITEM_FILTER_VALUES` (`config.mjs`).

**Écarts assumés** (cf. matrice F01–F15) : un UUID de compendium **non embarqué** n'est pas résolu par
`fromUuidSync` (ignoré) ; et les UUIDs `system.contents`/`system.container` ne sont **pas remappés** lors
d'un transfert inter-acteur (la logique de remap COF2 ne vit que dans la fiche acteur). Recette live :
A19/A24/A25 (`documentation/recette/item-piles/117-recette-f11-f12-f15.md`).

#### Objet équipé — politique `system.equipped`

**DÉCIDÉ : aucune transformation active — valeur transférée telle quelle**

`system.equipped` est un `BooleanField` COF2 optionnel, sans `initial` (`co2/module/models/equipment.mjs:56`) → `true` / `false` / `undefined`.

- Item Piles transfère la donnée d'objet telle quelle ; l'adaptateur ne définit **aucun** handler touchant `equipped`.
- COF2 n'auto-équipe que dans son flux interne `addBaseItemItem` (`co2/module/documents/actor.mjs:26-52`), utilisé à la création d'acteur — **non** emprunté par Item Piles.
- Les getters COF2 (`equippedWeapons`, `equippedArmors`, `equippedShields`, `equippedEquipments`) lisent directement le booléen (`actor.mjs:326-353`).

Conséquence : un objet transféré avec `equipped: true` reste équipé chez le receveur (les effets/actions suivent l'objet). Décision : ne rien transformer ; rééquilibrage manuel par le MJ/joueur. Comportement à confirmer en recette live (A25).

Implémentation : commentaire de politique dans `src/integrations/item-piles/items.mjs`.

---

### Évaluation du prototype antérieur

**Statut : ÉCART documenté — le prototype n'est pas dans le dépôt**

Le fichier `warbound-item-piles-prototype.zip` (référencé au cadrage §8) est **introuvable** dans le dépôt à la clôture de #112. L'évaluation porte donc sur la description du prototype au cadrage §5.2/§8 confrontée au contrat 3.3.4 vérifié :

| Aspect du prototype | Verdict vs 3.3.4 | Justification |
|---|---|---|
| Écriture de `flags['item-piles'].item.canStack` | **RÉUTILISABLE (corrigé)** | Le nom/chemin est exact ; le type doit être `string` (`"yes"/"no"`), pas un booléen (cf. `canItemStack` l. 34805). Repris dans `applyStackingFlag`. |
| `ITEM_SIMILARITIES` valué par une **fonction** | **INVALIDÉ** | 3.3.4 exige `Array<string>` ; une fonction échoue la validation `addSystemIntegration`. |
| `ITEM_FILTERS[].filters` valué par un **tableau** | **INVALIDÉ** | 3.3.4 exige une string CSV (`"a,b,c"`). |
| Absence de `primary`/`type`/`img` sur `CURRENCIES` | **INVALIDÉ** | Champs requis / attendus par la validation et le rendu de monnaie. |
| Signature `ITEM_TRANSFORMER` synchrone | **RÉUTILISABLE** | Item Piles `await` indifféremment ; version `async` retenue par robustesse. |

**Conclusion** : le prototype n'est **pas** réutilisable tel quel ; son intention (flag par objet) est conservée, ses signatures sont remplacées par celles de P1 (#113, PR #119). Si une archive est fournie ultérieurement, réévaluer le seul point non couvert : compatibilité des `flags` personnalisés posés par le prototype.

---

### Écarts documentés (résumé P0)

| Écart | Statut | Traitement |
|---|---|---|
| Archive `warbound-item-piles-prototype.zip` absente du dépôt | **ÉCART documenté** | Évaluation faite sur la description du cadrage §8 (voir ci-dessus). |
| `container` sans handler dédié (quantité non interprétable) | **RÉSOLU (P5 — #117)** | Handler `ITEM_TYPE_HANDLERS.container` (`contents` + `transfer`) livré ; `container` retiré des filtres. |
| Nature exacte des UUIDs d'un `container` peuplé en monde | **CONFIRMÉ (modèle)** | Modèle COF2 vérifié ; recette live A19 (`117-recette-f11-f12-f15.md`). Écart remap inter-acteur documenté. |

---

### Points non bloquants — notes pour P3+

- `ACTOR_CLASS_TYPE` sert uniquement à créer de nouveaux acteurs pile ; les acteurs `encounter` existants (PNJ, rencontres) ne sont pas affectés.
- `ACTOR_CLASS_TYPE: 'encounter'` est **CONFIRMÉ au niveau source** (Item Piles passe la valeur comme `type` à `Actor.create`, COF2 expose `character`/`encounter`). La création réelle de pile, coffre, marchand et vault `encounter` reste à valider en recette Foundry en P3 — aucun blocage P0.
- `ITEM_COST_TRANSFORMER` est synchrone côté Item Piles — ne pas le rendre `async` dans de futures évolutions.
- `CURRENCIES[].primary` : une seule devise doit avoir `primary: true` (PO). Item Piles utilise la primaire comme référence pour les conversions et le rendu de monnaie.
- `addSystemIntegration` n'est pas idempotent (chaque appel écrase la config) — `Hooks.once` est essentiel.

---

## Échange PJ↔PJ et vault — contrat 3.3.4 (F08–F10, F13)

**Statut : CONFIRMÉ** (source : bundle 3.3.4, préfixe de hook `item-piles-`)

### Échange PJ↔PJ (F08–F10) — nativement géré

Item Piles fournit l'UI d'échange, la double validation, la sécurité par possession, l'idempotence
(`ongoingTrades` + transaction atomique) et la gestion des annulations. **Warbound ne peut pas
intercepter ni annuler un échange PJ↔PJ.**

| Hook réel | Émission | Signature | Rôle |
|---|---|---|---|
| `item-piles-tradeStarted` | socket `callHook`/`callHookForUsers` (`callAll`) | `(leftParticipant, rightParticipant, tradeId, isPrivate)` | notification d'ouverture |
| `item-piles-tradeComplete` | `Hooks.callAll` (l. 90776/90792) | `(instigator, leftTraderData, rightTraderData, tradeId)` | notification de clôture |

- **Non annulables** (`callAll`) : ni `tradeStarted` ni `tradeComplete` ne peuvent être veto par un retour `false`.
- Il **n'existe pas** de hook `preTradeComplete`.
- `traderData = { user, actor(uuid), items[], currencies[], itemCurrencies[], accepted }`.
- Le hook **cancellable** `item-piles-preTradeItems` (l. 85791) relève du flux **marchand/pile**
  (achat-vente), pas de l'échange PJ↔PJ.

Rôle Warbound : **observateur** (journal d'échange via `item-piles-tradeComplete`) —
`src/integrations/item-piles/trade.mjs` + `scripts/integrations/item-piles/hooks-trade.mjs`.

### Vault (F13) — data-driven, sans hook

Il n'existe **aucun** hook vault dans Item Piles 3.3.4. Les droits fins sont portés par un **flag
d'acteur** et appliqués nativement par `getVaultAccess()` (l. 36426) :

```
flags['item-piles'].vaultAccess = [
  { uuid, view, organize, items: { deposit, withdraw }, currencies: { deposit, withdraw } }
]
```

- Résolution : ne retient que les entrées dont `fromUuidSync(uuid)?.isOwner` ; `view ?? true` ;
  dépôt/retrait exigent un **destinataire** (`hasRecipient`).
- Réglages globaux : `restrictVaultAccess` (bool), `logVaultActions` (bool), `vaultLogType`
  (`user`/`actor`/`user_actor`) — **journal natif** (`updateVaultLog`).
- Préservation des métadonnées d'objet (charges/effets) : **native** (Item Piles déplace le même
  document). Les helpers purs `snapshotItemMetadata`/`assertMetadataIntegrity`
  (`src/integrations/item-piles/vault.mjs`) servent de filet de sécurité, non branchés.

Rôle Warbound : **configurer le flag `vaultAccess`** (constructeur pur `buildVaultAccessEntry` +
lecteurs de droits) — pas de hook, pas de journal réimplémenté.


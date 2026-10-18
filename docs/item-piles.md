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

**Comportement sans handler déclaré** : `getItemTypeHandler` retourne `undefined` → Item Piles retombe sur sa logique générique. Pour `container` (aucun handler COF2 livré, pas de `system.quantity.current`), cela signifie que la quantité n'est pas interprétée : d'où l'exclusion. Un handler `container` complet (via `ITEM_TYPE_HANDLERS.container`) est le mécanisme officiel prévu pour P5 — #117.

---

### Décisions d'architecture

#### Convention monétaire

**DÉCIDÉ : COF2 — 1 PO = 10 PA = 100 PC**

Alternatives examinées :
- **COF2 natif (retenu)** : 1 PO = 10 PA = 100 PC. Cohérent avec les règles du jeu et les richesses déjà enregistrées dans le monde. Aucune migration de données nécessaire.
- **WoW** : 1 PO = 100 PA = 10 000 PC. Incompatible avec les richesses COF2 existantes, nécessiterait une migration bloquante avant P3 marchands.

COF2 2.3.12 ne définit pas de taux de change (`EQUIPMENT_CURRENCIES` ne porte que les labels i18n). Le taux est une décision de conception de Warbound ; la convention COF2 est retenue.

Implémentation : `src/integrations/item-piles/currency.mjs` — `EXCHANGE_RATES = { gp: 1, sp: 0.1, cp: 0.01 }`.

#### Traitement de `container`

**DÉCIDÉ : exclu des transferts jusqu'à handler complet (P5 — #117)**

`container` COF2 n'a pas de `system.quantity.current` (`QUANTITY_BEARING_TYPES = ['equipment']`, `items.mjs:8`).

Nature de `contents` — **CONFIRMÉ** depuis le modèle COF2 2.3.12 (`module/models/container.mjs`) :
- `contents: ArrayField(DocumentUUIDField({ type: "Item" }))` — liste d'**UUIDs d'Items**, pas d'objets embarqués.
- `contentsCount` résout chaque UUID via `fromUuidSync` et somme `item.system?.quantity?.current ?? 1` (un UUID non résolu compte pour 1).
- `getContents()` résout via `fromUuidSync` si le contenant est embarqué sur un acteur, sinon `fromUuid` (monde/compendium, asynchrone).

Conséquence : le contenu est une **référence indirecte** vers des Items qui vivent sur l'acteur ou dans un compendium — une gestion naïve (compter `contents.length`) sous-évaluerait ou dupliquerait l'inventaire. Un handler `container` dédié doit passer par `getContents()`/`contentsCount`. Reporté en P5 (#117) pour ne pas bloquer P1–P4.

Implémentation : `src/integrations/item-piles/items.mjs:5` — `EXCLUDED_TYPES` inclut `'container'` (filtre `type`, `config.mjs:27`).

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
| `container` sans handler dédié (quantité non interprétable) | **DÉCIDÉ** | Exclu des transferts ; handler `ITEM_TYPE_HANDLERS.container` prévu en P5 (#117). |
| Nature exacte des UUIDs d'un `container` peuplé en monde | **CONFIRMÉ (modèle)** | Modèle COF2 vérifié ; la vérification d'une instance réelle en jeu sera faite en recette P5. |

---

### Points non bloquants — notes pour P3+

- `ACTOR_CLASS_TYPE` sert uniquement à créer de nouveaux acteurs pile ; les acteurs `encounter` existants (PNJ, rencontres) ne sont pas affectés.
- `ACTOR_CLASS_TYPE: 'encounter'` est **CONFIRMÉ au niveau source** (Item Piles passe la valeur comme `type` à `Actor.create`, COF2 expose `character`/`encounter`). La création réelle de pile, coffre, marchand et vault `encounter` reste à valider en recette Foundry en P3 — aucun blocage P0.
- `ITEM_COST_TRANSFORMER` est synchrone côté Item Piles — ne pas le rendre `async` dans de futures évolutions.
- `CURRENCIES[].primary` : une seule devise doit avoir `primary: true` (PO). Item Piles utilise la primaire comme référence pour les conversions et le rendu de monnaie.
- `addSystemIntegration` n'est pas idempotent (chaque appel écrase la config) — `Hooks.once` est essentiel.

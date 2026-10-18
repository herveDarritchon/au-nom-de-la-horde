import { toPrimaryAmount, EXCHANGE_RATES } from '../../../src/integrations/item-piles/currency.mjs'
import { ITEM_SIMILARITY_PATHS, applyStackingFlag } from '../../../src/integrations/item-piles/items.mjs'
import { extractContainerContents } from '../../../src/integrations/item-piles/containers.mjs'

// Incrémenté uniquement si les réglages par défaut nécessitent une migration côté MJ.
export const INTEGRATION_VERSION = '1'

// Item Piles accepte soit "latest" (fallback), soit la version du système (clé exacte ou antérieure).
// "latest" garantit que la config s'applique quelle que soit la future version de COF2.
const INTEGRATION_TARGET_VERSION = 'latest'

// Images de devise — icônes core Foundry (`icons/...` autorisé par l'audit).
const CURRENCY_ICONS = {
  gp: 'icons/commodities/currency/coin-embossed-crown-gold.webp',
  sp: 'icons/commodities/currency/coin-inset-compass-silver.webp',
  cp: 'icons/commodities/currency/coin-inset-copper-axe.webp',
}

// `name` est passé à `game.i18n.localize()` par Item Piles → on réutilise les clés natives COF2.
const CURRENCY_DEFS = [
  { id: 'gp', name: 'CO.currency.gp', abbreviation: '{#}PO', path: 'system.wealth.gp.value', primary: true },
  { id: 'sp', name: 'CO.currency.sp', abbreviation: '{#}PA', path: 'system.wealth.sp.value', primary: false },
  { id: 'cp', name: 'CO.currency.cp', abbreviation: '{#}PC', path: 'system.wealth.cp.value', primary: false },
]

// Types COF2 non transférables. Filtre format string (contrat 3.3.4).
// container retiré — géré via ITEM_TYPE_HANDLERS.container (P5 — #117).
const ITEM_FILTER_PATH = 'type'
const ITEM_FILTER_VALUES = ['profile', 'feature', 'capacity', 'attack', 'path']

/**
 * Construit la configuration Item Piles 3.3.4 pour COF2.
 * Chaque champ respecte la validation stricte de `addSystemIntegration` (bundle 3.3.4) :
 * ITEM_SIMILARITIES = Array<string>, ITEM_FILTERS[].filters = string, CURRENCIES[].primary = boolean…
 */
export function buildItemPilesConfig() {
  return {
    VERSION: INTEGRATION_VERSION,

    // CONFIRMÉ P0 #112 — seul type acteur COF2 valide pour pile/coffre/marchand/vault (system.json 2.3.12).
    ACTOR_CLASS_TYPE: 'encounter',

    ITEM_QUANTITY_ATTRIBUTE: 'system.quantity.current',
    ITEM_PRICE_ATTRIBUTE:    'system.price.value',

    // Convertit {value, unit} COF2 (unit "po"/"pa"/"pc") en montant PO primaire.
    // Signature 3.3.4 : (item, currencies, itemPriceAttribute) => number.
    ITEM_COST_TRANSFORMER: (item, _currencies, _priceAttribute) => {
      const price = item?.system?.price
      if (!price) return 0
      return toPrimaryAmount({ value: price.value, unit: price.unit }) ?? 0
    },

    CURRENCIES: CURRENCY_DEFS.map((c) => ({
      primary:      c.primary,
      name:         c.name,
      abbreviation: c.abbreviation,
      img:          CURRENCY_ICONS[c.id],
      exchangeRate: EXCHANGE_RATES[c.id],
      type:         'attribute',
      data:         { path: c.path },
    })),

    ITEM_FILTERS: [
      { path: ITEM_FILTER_PATH, filters: ITEM_FILTER_VALUES.join(',') },
    ],

    // Array<string> de chemins (contract 3.3.4 — jamais une fonction).
    ITEM_SIMILARITIES: [...ITEM_SIMILARITY_PATHS],

    // Ne pas mettre 'equipment' — bloquerait les consommables stackable (cf. cadrage §5.1).
    UNSTACKABLE_ITEM_TYPES: [],

    // Signature 3.3.4 : (itemData) => object. Pose le flag canStack selon COF2.
    ITEM_TRANSFORMER: async (itemData) => applyStackingFlag(itemData),

    // Aucune valeur par défaut spécifique — Item Piles applique ses propres PILE_DEFAULTS.
    PILE_DEFAULTS: {},

    // Handlers COF2 pour les types d'item non génériques.
    // Signatures vérifiées dans le bundle Item Piles 3.3.4 (l. 35005, 83990, 36035).
    ITEM_TYPE_HANDLERS: {
      container: {
        // Retourne les Items contenus dans un container COF2 (résolution des UUIDs via Foundry).
        // Appelé : handler({ item }) → Item[] (l. 35005).
        contents: ({ item }) => {
          const uuids = extractContainerContents(item)
          return uuids.map((uuid) => fromUuidSync(uuid)).filter(Boolean)
        },

        // Pousse les Items contenus dans `items` pour les inclure dans le transfert.
        // Appelé : handler({ item, items, raw? }) → void (l. 83990, 36035).
        transfer: ({ item, items }) => {
          const uuids = extractContainerContents(item)
          for (const uuid of uuids) {
            const contained = fromUuidSync(uuid)
            if (contained) items.push(contained)
          }
        },
      },
    },
  }
}

export { INTEGRATION_TARGET_VERSION }

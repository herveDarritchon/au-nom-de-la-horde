export const WEATHER_EVENTS = [
  {
    id: 'dust-devil',
    biomes: ['arid', 'semiArid'],
    requires: {
      precipitation: 'none',
      windMin: 'light',
      temperatureMin: 'hot',
    },
    text: "Un tourbillon de poussière surgit du sol, fouettant le visage des voyageurs et réduisant la visibilité sur quelques mètres. Il se dissout aussi vite qu'il est apparu.",
    impactHint: "Visibilité réduite à quelques mètres ; objets légers risquent d'être emportés.",
  },
  {
    id: 'mirage',
    biomes: ['arid', 'semiArid'],
    requires: {
      precipitation: 'none',
      temperatureMin: 'hot',
    },
    text: "À l'horizon, une nappe d'eau scintillante invite à espérer. En approchant, le mirage se dérobe — reflet de chaleur sur le sol brûlant.",
  },
  {
    id: 'dry-waterhole',
    biomes: ['arid', 'semiArid'],
    requires: {
      precipitation: 'none',
      historyPattern: { precipitation: ['none'], minDays: 3 },
    },
    text: "Le point d'eau indiqué sur la carte n'est plus qu'un lit de boue craquelée. Les traces d'animaux s'y arrêtent — elles aussi déçues.",
    impactHint: "Point d'eau absent ; risque d'épuisement si aucune réserve disponible.",
  },
  {
    id: 'fog-bank',
    biomes: ['coastal', 'wetland', 'temperatePlain'],
    requires: {
      precipitation: 'none',
      windMax: 'moderate',
    },
    text: "Un banc de brouillard épais roule depuis la mer ou la plaine basse, avalant silhouettes et repères. Progresser à vue devient hasardeux.",
    impactHint: "Distances de vision réduites ; navigation à vue impossible au-delà de 10 m.",
  },
  {
    id: 'fog-bank-wetland',
    biomes: ['wetland'],
    weight: 3,
    requires: {
      precipitation: 'none',
      windMax: 'calm',
    },
    text: "Une nappe de brouillard stagne sur les eaux noires du marais. Les sons s'y étouffent, les silhouettes d'arbres surgissent sans prévenir. Perdre le chemin est une affaire de secondes.",
  },
  {
    id: 'sudden-downpour',
    biomes: ['humidForest', 'wetland', 'coastal', 'temperatePlain'],
    requires: {
      precipitation: 'heavy',
      windMin: 'moderate',
    },
    text: "Les nuages crèvent sans prévenir. En quelques secondes, le sol disparaît sous les filets d'eau et les ruisselets improvisés. L'averse cesse presque aussi vite.",
    impactHint: "Piste transformée en bourbier ; traversée de cours d'eau risquée.",
  },
  {
    id: 'muddy-trail',
    biomes: ['temperatePlain', 'temperateForest', 'humidForest', 'wetland'],
    requires: {
      historyPattern: { precipitation: ['moderate', 'heavy'], minDays: 3 },
    },
    text: "Les chemins sont détrempés. La boue colle aux semelles et ralentit les montures. Un faux pas risque de précipiter quelqu'un dans le fossé.",
  },
  {
    id: 'swollen-river',
    biomes: ['temperatePlain', 'temperateForest', 'humidForest', 'wetland', 'coastal'],
    requires: {
      historyPattern: { precipitation: ['moderate', 'heavy'], minDays: 3 },
    },
    text: "La rivière a débordé de son lit. Le gué habituel est emporté sous un flot boueux et rapide. Il faudra chercher un pont ou attendre la décrue.",
  },
  {
    id: 'fallen-branch',
    biomes: ['temperateForest', 'humidForest'],
    requires: {
      windMin: 'strong',
    },
    text: "Une branche maîtresse s'est abattue en travers du chemin, arrachée par les rafales. Les racines superficielles ont soulevé une motte de terre et de mousse.",
  },
  {
    id: 'squall',
    biomes: ['coastal', 'mountain'],
    requires: {
      precipitation: 'heavy',
      windMin: 'strong',
    },
    text: "Une bourrasque brusque balaie la côte ou la crête. Les voiles claquent, les chapeaux s'envolent et se tenir debout demande un effort. Ça passe en un quart d'heure.",
  },
  {
    id: 'snowdrift',
    biomes: ['mountain', 'tundra', 'glacial'],
    requires: {
      windMin: 'moderate',
    },
    text: "Le vent accumule la neige en congères imprévisibles. Ce qui semblait un passage libre est maintenant bouché jusqu'à hauteur de poitrine.",
  },
  {
    id: 'blizzard',
    biomes: ['glacial', 'tundra', 'mountain'],
    requires: {
      precipitation: 'heavy',
      windMin: 'strong',
      temperatureMin: 'cold',
    },
    text: "Une tempête de neige aveuglante s'abat sans prévenir. Le vent siffle entre les rochers, la visibilité tombe à quelques pas. Se déplacer par ce temps, c'est risquer de ne jamais retrouver son chemin.",
    impactHint: "Déplacement ralenti, congères imprévisibles ; risque de perdre son chemin.",
  },
  {
    id: 'dust-storm',
    biomes: ['arid', 'semiArid'],
    requires: {
      windMin: 'moderate',
      historyPattern: { precipitation: ['none'], minDays: 3 },
    },
    text: "Un mur de poussière ocre s'élève à l'horizon et avale le paysage en quelques minutes. L'air devient irrespirable, les yeux brûlent. Il n'y a plus qu'à s'abriter et attendre.",
  },
]

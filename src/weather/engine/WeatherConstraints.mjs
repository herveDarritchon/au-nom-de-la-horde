export function applyConstraints({ weights, dominantTemp, biome, season, descriptors = [] }) {
  const w = weights.slice()

  if (dominantTemp === 'hot') w[4] = 0
  if (dominantTemp === 'glacial') w[1] = 0

  for (let i = 0; i < descriptors.length; i++) {
    const desc = descriptors[i]
    if (desc.sky === 'clear' && desc.precipitation !== 'none') w[i] = 0
  }

  if (biome === 'glacial' && season === 'winter') w[3] = 0

  if (biome === 'arid') w[4] *= 0.1

  const sum = w.reduce((a, b) => a + b, 0)
  if (sum === 0) return normalize(weights)

  return normalize(w)
}

function normalize(weights) {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum === 0) return [0.2, 0.2, 0.2, 0.2, 0.2]
  return weights.map(w => w / sum)
}
